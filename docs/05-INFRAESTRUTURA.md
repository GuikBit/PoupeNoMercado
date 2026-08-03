# 05 — Infraestrutura, Segurança e LGPD

---

## 1. Alvo de implantação

VPS própria já existente, com outras cargas rodando.

| Recurso | Total | Reservado para este projeto |
|---|---|---|
| RAM | 12 GB | ~2,5 GB |
| Disco | 1 TB | ~50 GB (dados + imagens) |
| CPU | adequada | compartilhada |

### Orçamento de memória

| Serviço | Reserva | Limite |
|---|---|---|
| API Go | 64 MB | 256 MB |
| PostgreSQL 18 | 1 GB | 2 GB |
| Caddy | 32 MB | 128 MB |
| MinIO | 128 MB | 512 MB |
| **Total** | **~1,2 GB** | **~2,9 GB** |

Sobram ~9 GB para as cargas existentes. O Go é o que torna isso confortável —
a mesma API em JVM consumiria ~500 MB só para iniciar.

---

## 2. Topologia

```
        Internet
           │  443
      ┌────▼─────┐
      │  Caddy   │  TLS automático via Let's Encrypt
      └────┬─────┘
   ┌───────┼────────┐
   │       │        │
┌──▼───┐ ┌─▼─────┐ ┌▼──────┐
│ API  │ │ MinIO │ │ Kuma  │  (monitoramento)
│  Go  │ └───────┘ └───────┘
└──┬───┘
   │
┌──▼──────────┐
│ PostgreSQL  │  volume persistente
└─────────────┘
```

### Subdomínios

| Subdomínio | Destino | Exposto |
|---|---|---|
| `api.<dominio>` | API Go | Público |
| `files.<dominio>` | MinIO | Público, somente leitura autenticada |
| `status.<dominio>` | Uptime Kuma | Restrito por IP ou basic auth |

MinIO Console e Postgres **não** são expostos. Acesso via túnel SSH quando
necessário.

---

## 3. Docker Compose

`infra/docker-compose.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [web]
    deploy:
      resources:
        limits: { memory: 128M }

  api:
    image: ghcr.io/${GH_OWNER}/poupe-api:${API_VERSION:-latest}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://poupe:${POSTGRES_PASSWORD}@postgres:5432/poupe?sslmode=disable
      JWT_SECRET: ${JWT_SECRET}
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY}
      LOG_LEVEL: info
      ENV: production
    depends_on:
      postgres: { condition: service_healthy }
    networks: [web, internal]
    deploy:
      resources:
        limits: { memory: 256M }
    healthcheck:
      test: ["CMD", "/app/api", "healthcheck"]
      interval: 30s
      timeout: 3s
      retries: 3

  postgres:
    image: postgres:18-alpine        # NUNCA usar :latest
    restart: unless-stopped
    environment:
      POSTGRES_DB: poupe
      POSTGRES_USER: poupe
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./postgres.conf:/etc/postgresql/postgresql.conf:ro
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
    networks: [internal]
    deploy:
      resources:
        limits: { memory: 2G }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U poupe -d poupe"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes: [minio_data:/data]
    networks: [web, internal]
    deploy:
      resources:
        limits: { memory: 512M }

  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    volumes: [kuma_data:/app/data]
    networks: [web, internal]

networks:
  web:      {}
  internal: { internal: true }

volumes:
  pg_data: {}
  minio_data: {}
  caddy_data: {}
  caddy_config: {}
  kuma_data: {}
```

**Rede `internal` é `internal: true`** — Postgres não tem rota para a internet,
nem de saída. Defesa em profundidade contra exfiltração.

### Caddyfile

```caddy
api.{$DOMAIN} {
    encode gzip zstd
    reverse_proxy api:8080
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
        Referrer-Policy           "no-referrer"
        -Server
    }
    log {
        output file /data/access.log
        format json
    }
}

files.{$DOMAIN} {
    reverse_proxy minio:9000
}

status.{$DOMAIN} {
    basic_auth { {$KUMA_USER} {$KUMA_HASH} }
    reverse_proxy uptime-kuma:3001
}
```

### Tuning do Postgres

`infra/postgres.conf` — dimensionado para o limite de 2 GB:

```conf
shared_buffers                = 512MB
effective_cache_size          = 1536MB
work_mem                      = 8MB
maintenance_work_mem          = 128MB
max_connections               = 50
random_page_cost              = 1.1      # SSD
effective_io_concurrency      = 200
wal_compression               = on
checkpoint_completion_target  = 0.9
log_min_duration_statement    = 500      # loga query > 500ms
```

---

## 4. Build da API

Multi-stage → imagem final de ~15 MB.

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /app/api
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/api"]
```

`distroless` não tem shell — reduz drasticamente a superfície de ataque.

---

## 5. CI/CD

`.github/workflows/api.yml`:

```
push em main (paths: api/**)
   │
   ├─ go vet · golangci-lint
   ├─ go test ./... (com testcontainers → Postgres real)
   ├─ verifica que sqlc está atualizado (sqlc diff)
   ├─ build + push da imagem para GHCR
   └─ ssh deploy:
        docker compose pull api
        docker compose run --rm api migrate up
        docker compose up -d api
        healthcheck; rollback se falhar
```

App (`app.yml`): typecheck · lint · `jest` (inclui o **gate do gabarito**) ·
EAS Build sob demanda.

**Gate obrigatório:** se a acurácia do parser contra `app/fixtures/` cair em
relação ao baseline registrado, o build falha. Isso impede regressão silenciosa
no ativo mais importante do projeto.

---

## 6. Backup

`infra/backup.sh`, agendado por cron às 03:00:

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/poupe

mkdir -p "$DEST"

docker compose exec -T postgres \
  pg_dump -U poupe -d poupe --format=custom \
  | gzip > "$DEST/poupe-$STAMP.dump.gz"

# Retenção: 14 diários
find "$DEST" -name 'poupe-*.dump.gz' -mtime +14 -delete

# Cópia externa — imprescindível: backup na mesma máquina não é backup
rclone copy "$DEST/poupe-$STAMP.dump.gz" remote:poupe-backups/
```

| Item | Política |
|---|---|
| Frequência | Diária, 03:00 |
| Retenção local | 14 dias |
| Retenção externa | 90 dias |
| **Teste de restauração** | **Mensal, obrigatório** |
| RPO | 24 h |
| RTO | ~1 h |

> Backup nunca testado deve ser considerado inexistente. Agende o teste mensal
> como tarefa recorrente.

---

## 7. Observabilidade

**MVP — deliberadamente mínimo:**

| Necessidade | Ferramenta |
|---|---|
| Está no ar? | Uptime Kuma (`/health`) |
| O que aconteceu? | `log/slog` em JSON → `docker logs` → `journald` |
| Correlação | `request_id` em toda linha de log e resposta de erro |
| Métricas básicas | `GET /metrics` (Prometheus text format), sem coletor no MVP |

**Não instale Prometheus + Grafana + Loki agora.** É três vezes o consumo de
memória da aplicação para servir dezenas de usuários. Adicione quando houver
pergunta operacional que os logs não respondam.

### `/health`

```jsonc
{
  "status": "ok",
  "version": "1.2.0",
  "checks": { "database": "ok", "storage": "ok" },
  "uptime_seconds": 84213
}
```

---

## 8. Segurança

### Aplicação

| Controle | Implementação |
|---|---|
| Senhas | `argon2id` (`golang.org/x/crypto/argon2`) — nunca bcrypt novo, nunca MD5/SHA |
| JWT | HS256 com segredo ≥ 32 bytes de `/dev/urandom`; validar `exp`, `iss`, `aud` |
| Refresh token | Armazenado como hash; rotação a cada uso; detecção de reuso revoga a família |
| Autorização | **Todo** handler valida posse do recurso pelo `user_id` do token |
| SQL Injection | `sqlc` gera queries parametrizadas — nunca concatene SQL |
| Rate limiting | Ver `04-API.md` §9 |
| CORS | Não aplicável (cliente mobile); manter desabilitado |
| Segredos | `.env` no servidor, `chmod 600`, **fora do Git**; `.env.example` versionado |

### Rede

- Postgres e MinIO Console jamais expostos; acesso por túnel SSH
- UFW: apenas 22, 80, 443
- SSH: só chave, sem senha, `PermitRootLogin no`
- `fail2ban` no SSH
- `unattended-upgrades` para patches de segurança

### Dispositivo

- Refresh token no `expo-secure-store` (Keychain / Keystore)
- Banco SQLite **não** criptografado no MVP — não contém credenciais, apenas
  listas e histórico de compras próprias. Reavaliar se dados sensíveis entrarem.
- Certificate pinning: **não** no MVP (risco de quebrar o app na rotação de
  certificado; benefício baixo para o modelo de ameaça atual)

---

## 9. LGPD

### Dados tratados

| Dado | Base legal | Retenção |
|---|---|---|
| E-mail, senha | Execução de contrato | Até exclusão da conta |
| Listas e compras | Execução de contrato | Até exclusão da conta |
| Nome/rede da loja | Execução de contrato | Até exclusão da conta |
| **Geolocalização** | **Consentimento** (opt-in explícito) | 180 dias |
| **Imagens de etiqueta** | **Consentimento** (opt-in explícito) | 180 dias |
| Logs de acesso (IP) | Legítimo interesse / Marco Civil | 6 meses |

### Princípios aplicados

1. **Minimização.** Geolocalização e imagens são desligadas por padrão. O app é
   plenamente funcional sem ambas.
2. **Consentimento granular.** Cada finalidade tem seu toggle, revogável a
   qualquer momento em Configurações.
3. **Portabilidade.** `GET /v1/me/export` devolve todos os dados em JSON.
4. **Esquecimento.** `DELETE /v1/auth/account` apaga tudo em até 30 dias,
   incluindo objetos no MinIO. Anonimização não é suficiente — é exclusão.
5. **Transparência.** Política de privacidade em linguagem simples, ligada na
   tela de cadastro.

### Cuidados específicos com imagens

- **EXIF removido no dispositivo**, antes de qualquer envio (contém GPS)
- Chave de objeto opaca (UUID), sem informação do usuário no caminho
- Bucket privado; acesso só por URL pré-assinada de curta duração
- Expurgo automático aos 180 dias, por job diário

### Papel do controlador

O titular do projeto é o **controlador**. Ao entrar em produção com usuários
reais, é necessário: política de privacidade publicada, canal de contato do
encarregado, e registro das operações de tratamento.

---

## 10. Runbook

```bash
# Primeira implantação
git clone <repo> && cd PoupeNoMercado/infra
cp .env.example .env && nano .env       # preencher segredos
docker compose up -d
docker compose run --rm api migrate up
curl -sf https://api.<dominio>/v1/health | jq

# Deploy de nova versão
docker compose pull api
docker compose run --rm api migrate up
docker compose up -d api

# Rollback
API_VERSION=<tag-anterior> docker compose up -d api
# ⚠️ migrations não revertem automaticamente — avalie antes

# Logs
docker compose logs -f api
docker compose logs api | jq 'select(.level=="ERROR")'

# Restauração
gunzip -c poupe-YYYYmmdd.dump.gz \
  | docker compose exec -T postgres pg_restore -U poupe -d poupe --clean

# Diagnóstico de lentidão
docker stats --no-stream
docker compose exec postgres psql -U poupe -d poupe \
  -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements
      ORDER BY mean_exec_time DESC LIMIT 10;"
```
