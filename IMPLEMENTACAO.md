# Plano de Implementação

> Roteiro executável do projeto. Cada etapa tem entregável, critério de conclusão
> e tarefas concretas. Marque as caixas conforme avança.

**Leia antes:** `CLAUDE.md` (contexto) e `docs/02-MOTOR-RECONHECIMENTO.md` (o núcleo).

---

## Visão geral

```
ETAPA 0  Fundação                    2–3 dias   ┐
ETAPA 1  Laboratório de Etiquetas    5–6 dias   ├─ FASE 0: Validação (~1,5 sem)
ETAPA 2  Coleta e decisão            1–2 dias   ┘
─────────────────────────────────────────────────────────────
ETAPA 3  Endurecimento do parser     3–5 dias   ┐
ETAPA 4  Domínio e carrinho          1 semana   │
ETAPA 5  App MVP                     2–3 sem    ├─ FASE 1: MVP (~2,5 meses)
ETAPA 6  Backend e sync              2 semanas  │
ETAPA 7  Infraestrutura e deploy     3 dias     │
ETAPA 8  Beta fechado                2 semanas  ┘
```

**Regra de ouro:** a Etapa 2 é um **portão**. Se o resultado for o Cenário 5 do
`docs/06-PLANO-VALIDACAO.md`, pare e reavalie antes de investir nas Etapas 3+.

---

# FASE 0 — Validação técnica

## Etapa 0 — Fundação · 2–3 dias

**Entregável:** repositório estruturado, app rodando em device físico com câmera.

### Repositório
- [x] `git init`, `.gitignore` (Node, Go, Expo, `.env`)
- [x] Criar `app/`, `api/`, `infra/`, `docs/resultados/`
- [x] README com link para `CLAUDE.md`

### App base
- [x] `npx create-expo-app app --template blank-typescript` (SDK 57)
- [x] `tsconfig.json` com `strict: true`, `noUncheckedIndexedAccess: true`
- [x] ESLint + Prettier + `simple-import-sort`
- [x] Instalar Tamagui e configurar tema base
- [x] Instalar Expo Router; estrutura de rotas mínima
- [x] `npx expo prebuild` — gera `android/` (não versionado — CNG)
- [x] `npx expo run:android` em device físico — **ponto de verificação** (Galaxy S24 Ultra, 03/08/2026)

### Câmera
- [x] `react-native-vision-camera` v4 + permissões no `app.json`
- [x] Tela de preview funcionando (`src/app/scan.tsx`)
- [x] Captura de foto salvando em `FileSystem.documentDirectory/captures/`

### Qualidade
- [x] Jest + `ts-jest` configurados
- [x] GitHub Actions: `typecheck` + `lint` + `test`
- [x] Primeiro commit com Conventional Commits

**✅ Concluída quando:** o app abre no celular, mostra a câmera, tira foto e
salva no disco.

---

## Etapa 1 — Laboratório de Etiquetas · 5–6 dias

**Entregável:** app de tela única comparando ML Kit e Cloud Vision no mesmo frame.

> Especificação completa em `docs/06-PLANO-VALIDACAO.md` §3.

### 1.1 Interface de OCR
- [x] `src/ocr/types.ts` — `OcrEngine`, `OcrBlock`, `OcrResult`, `BoundingBox`
- [x] `src/ocr/engines/mlkit.ts` — adaptador sobre módulo Expo local próprio
      (`app/modules/mlkit-text-recognition`, Kotlin, ML Kit bundled 16.0.1,
      confiança por linha), normalizando para 0..1 (−1 = não informada)
- [x] `src/ocr/engines/cloudvision.ts` — REST, chave via `.env`, timeout 5 s
- [x] `src/ocr/engines/registry.ts` — registro e seleção + `bootstrap.ts`
- [x] Teste: cada adaptador devolve `OcrResult` bem-formado

### 1.2 Detector de etiqueta
- [x] `react-native-fast-opencv` instalado (**1.0.1, pin exato** — V1/New Arch)
- [x] `src/ocr/detector/detect.ts`: HSV → threshold amarelo → contornos →
      maior quadrilátero → `warpPerspective` (geometria pura em `geometry.ts`)
- [x] Fallback: sem quadrilátero confiável, usa o recorte do guia visual
- [x] Guia visual (retículo) sobreposto na câmera (`src/lab/CaptureView.tsx`)
- [x] Teste com as 13 fotos de `Etiquetas/` (manual, em device, via modo importar — 03/08/2026)

### 1.3 Parser v1
> Especificação em `docs/02-MOTOR-RECONHECIMENTO.md` §6. **Siga-a literalmente.**

- [x] `src/ocr/parser/normalize.ts` — normalização de texto (§6.1)
- [x] `src/ocr/parser/patterns.ts` — objeto `RE` (§6.3)
- [x] `src/ocr/parser/anchor.ts` — busca espacial por âncora (§6.2)
- [x] `src/ocr/parser/classify.ts` — classificador de layout (§6.4)
- [x] `src/ocr/parser/profiles/bahamas-gondola.ts` — **Tipo B, comece por ele**
- [x] `src/ocr/parser/profiles/bahamas-perecivel.ts` — Tipo C
- [x] `src/ocr/parser/profiles/bahamas-oferta.ts` — Tipo A
- [x] `src/ocr/parser/profiles/bahamas-cartaz.ts` — Tipo D (em `bahamas-oferta.ts`, estrutura DE/POR compartilhada)
- [x] `src/ocr/parser/profiles/generic.ts` — fallback, confiança limitada a 0,55
- [x] `src/ocr/parser/validate.ts` — regras V1–V10 (§7.1)
- [x] `src/ocr/confidence/score.ts` — score por `min()` (§7.2)
- [x] **Testes T1–T14** de `docs/02-MOTOR-RECONHECIMENTO.md` §10 (fixtures sintéticas; refazer com OCR bruto real na Etapa 2)

### 1.4 Domínio de preço
- [x] `src/domain/pricing.ts` — tipos `PricingPolicy`, `PriceTier`, `SaleUnit`
- [x] `resolvePrice(policy, qty, useStoreCard)` (§5)
- [x] Testes: Vinagre em qty 1/2/3/23/24 · com e sem cartão · KG com peso fracionário

### 1.5 Tela do Laboratório
- [x] Alternador câmera ao vivo / importar da galeria (`expo-image-picker`)
- [x] Um bitmap → todos os motores em paralelo (`Promise.allSettled`)
- [x] Colunas comparativas com resultado, confiança e latência
- [x] Campo de gabarito, editável (pré-preenchido pela 1ª leitura válida)
- [x] Veredito humano: radio + observação
- [x] Persistência em SQLite local (`expo-sqlite` puro; Drizzle só na Etapa 5)
- [x] Exportação: árvore de fixtures (docs/02 §9) + `expo-sharing` do índice;
      imagens em massa via `adb pull`
- [x] **Validação em device** — ✅ 03/08/2026 (Galaxy S24 Ultra): 21 casos de teste
      capturados/importados, comparação lado a lado, gabarito, persistência e export
      funcionando; parser endurecido com os casos reais (variantes de R$, âncora
      quebrada, base fundido com medida)

**✅ Concluída quando:** você aponta para uma etiqueta em casa, vê os dois
resultados lado a lado, preenche o gabarito e o caso é salvo.

---

## Etapa 2 — Coleta e decisão · 1–2 dias 🚪 PORTÃO

**Entregável:** 60 casos coletados, análise concluída, motor escolhido.

- [ ] Checklist pré-saída (`docs/06-PLANO-VALIDACAO.md` §4)
- [ ] **Ida ao mercado (~45 min)** — cumprir a cota por tipo:
      A=15 · **B=20** · **C=15** · D=5 · adversariais=5
- [ ] Exportar e copiar para `app/fixtures/labels/` (+ `cases.json` na raiz do export)
- [x] `app/scripts/analyze-lab.ts` — relatório com M1–M7 segmentado por tipo
      (`npm run analyze:lab -- <cases.json>`; re-roda o parser atual sobre o OCR bruto)
- [ ] Revisão qualitativa: erros confiantes, discordâncias, adversariais
- [ ] Relatório em `docs/resultados/lab-YYYY-MM-DD.md`
- [ ] **Atualizar ADR-002** em `docs/01-ARQUITETURA.md` com a decisão
- [ ] Gravar `app/fixtures/baseline.json` para o gate de CI

**🚪 Portão de decisão** — consulte `docs/06-PLANO-VALIDACAO.md` §6:

| Resultado | Ação |
|---|---|
| Cenário 1 ou 2 | ✅ Prossiga para a Etapa 3 |
| Cenário 3 | Corrija o parser e reanalise (sem nova coleta) |
| Cenário 4 | Avalie PaddleOCR ou VLM antes de seguir |
| **Cenário 5** | **🛑 Pare. Reavalie a premissa do produto.** |

---

# FASE 1 — MVP

## Etapa 3 — Endurecimento do parser · 3–5 dias

**Entregável:** parser atingindo as metas contra os 60 casos.

- [ ] Corrigir os erros priorizados na Etapa 2
- [ ] Pré-processamento para o Tipo C: binarização adaptativa, upscale 2×,
      correção de inclinação
- [ ] Ajustar limiares de confiança com base nos dados reais
- [ ] Gate de CI: falha se a acurácia cair abaixo do `baseline.json`
- [ ] Testes T1–T14 passando integralmente

**✅ Concluída quando:** M1 ≥ 95% (A,B) e M3 ≤ 1% contra o gabarito.

---

## Etapa 4 — Domínio e carrinho · 1 semana

**Entregável:** lógica de negócio completa, testada, sem UI.

Tudo em TypeScript puro, sem I/O — roda em teste sem device.

- [ ] `src/domain/cart.ts` — adicionar/remover/alterar item, total, progresso
      contra o orçamento
- [ ] Recálculo automático ao mudar quantidade (usa `resolvePrice`)
- [ ] Dica de próxima faixa: *"leve mais 2 e economize R$ 0,60 cada"*
- [ ] Fluxo de peso: item KG recebe peso decimal, não quantidade inteira
- [ ] `src/domain/matching.ts` — casamento com a lista (§8), limiar 0,75
- [ ] `src/domain/budget.ts` — estados verde / amarelo (85%) / vermelho
- [ ] Cobertura de testes ≥ 90% em `src/domain/`

**✅ Concluída quando:** é possível simular uma compra inteira por testes,
sem abrir o app.

---

## Etapa 5 — App MVP · 2–3 semanas

**Entregável:** aplicativo completo e funcional offline.

### 5.1 Persistência
- [ ] Drizzle + `expo-sqlite`; schema de `docs/03-MODELO-DADOS.md` §3
- [ ] Migrations rodando no boot
- [ ] Repositórios: `listRepo`, `tripRepo`, `readingRepo`
- [ ] Tabela `outbox` com enfileiramento automático em cada mutação

### 5.2 Telas
- [ ] Home: listas + botão "Iniciar compra"
- [ ] Lista: criar, editar, reordenar, categorizar
- [ ] **Compra ativa:** total grande, barra de orçamento, itens escaneados
- [ ] **Escaneamento:** câmera + guia + resultado + seletor de quantidade
- [ ] Confirmação por nível de confiança (alta / média / baixa) — §7.3
- [ ] **Entrada manual:** teclado numérico grande, sempre a 1 toque
- [ ] Fluxo de peso para itens KG
- [ ] Edição de item já no carrinho
- [ ] Finalização: resumo, comparação com o orçamento
- [ ] Histórico + "duplicar esta compra"
- [ ] Configurações: cartão da loja, consentimentos, sobre

### 5.3 UX crítica
- [ ] Escaneamento contínuo — não sair da câmera entre itens
- [ ] Feedback tátil e sonoro na leitura bem-sucedida
- [ ] Modo de tela sempre ligada durante a compra
- [ ] Botão de desfazer no último item
- [ ] Estados vazios e mensagens de erro com linguagem clara

**✅ Concluída quando:** você faz uma compra real do início ao fim, em modo avião.

---

## Etapa 6 — Backend e sincronização · 2 semanas

**Entregável:** API em Go com sync funcional.

### 6.1 Fundação
- [ ] `go mod init`; estrutura `cmd/` + `internal/{http,service,repo,domain}`
- [ ] chi + middlewares: `request_id`, logging (`slog`), recover, rate limit
- [ ] goose + migrations de `docs/03-MODELO-DADOS.md` §4
- [ ] sqlc configurado; primeiras queries
- [ ] `GET /v1/health`
- [ ] `docker-compose.dev.yml` com Postgres para desenvolvimento

### 6.2 Contrato
- [ ] `api/openapi.yaml` conforme `docs/04-API.md`
- [ ] `oapi-codegen` gerando stubs Go
- [ ] `openapi-typescript` gerando client no app
- [ ] `make openapi` regenerando ambos

### 6.3 Autenticação
- [ ] Registro, login, refresh rotativo, logout
- [ ] `argon2id` para senha
- [ ] Detecção de reuso de refresh → revoga família
- [ ] Middleware de autorização com verificação de posse do recurso

### 6.4 Sincronização
- [ ] `POST /v1/sync/push` — lote transacional, LWW, resposta de conflitos
- [ ] `GET /v1/sync/pull` — cursor por `server_seq`
- [ ] Cliente no app: drenagem de outbox, gatilhos (§5.3), retry exponencial
- [ ] Testes: offline prolongado, dois dispositivos, conflito, lote parcial

### 6.5 Catálogo e perfis
- [ ] `GET /v1/products/search` com `pg_trgm` + `unaccent`
- [ ] `GET /v1/products/lookup` por EAN e por `chain`+`internal_code`
- [ ] `GET /v1/layout-profiles` + aplicação no app
- [ ] `POST /v1/samples` (opt-in, só Wi-Fi)

**✅ Concluída quando:** dois dispositivos convergem para o mesmo estado após
edições offline em ambos.

---

## Etapa 7 — Infraestrutura e deploy · 3 dias

**Entregável:** sistema em produção no seu domínio.

> Arquivos completos em `docs/05-INFRAESTRUTURA.md`.

- [ ] Dockerfile multi-stage (distroless, ~15 MB)
- [ ] `infra/docker-compose.yml` com limites de memória
- [ ] `infra/Caddyfile` com os subdomínios
- [ ] `infra/postgres.conf` ajustado para 2 GB
- [ ] DNS: registros A para `api`, `files`, `status`
- [ ] `.env` no servidor (`chmod 600`) + `.env.example` no repositório
- [ ] Primeira implantação; TLS validado
- [ ] `infra/backup.sh` + cron 03:00 + cópia externa
- [ ] **Teste de restauração — obrigatório antes de considerar pronto**
- [ ] Uptime Kuma monitorando `/v1/health`
- [ ] GitHub Actions com deploy por SSH e rollback
- [ ] UFW, fail2ban, `unattended-upgrades`

**✅ Concluída quando:** um push em `main` implanta sozinho, e você restaurou um
backup com sucesso.

---

## Etapa 8 — Beta fechado · 2 semanas

**Entregável:** validação com usuários reais.

- [ ] Build de produção via EAS (Android)
- [ ] Distribuição interna para 20–30 pessoas em Juiz de Fora
- [ ] Canal de feedback (grupo de WhatsApp ou formulário)
- [ ] Telemetria mínima e anonimizada: taxa de sucesso do escaneamento,
      uso de entrada manual, compras finalizadas
- [ ] Coletar amostras de baixa confiança e melhorar os perfis
- [ ] Iterar a UX conforme o observado

### Métricas de sucesso do beta

| Métrica | Meta |
|---|---|
| Compras finalizadas / iniciadas | ≥ 70% |
| Itens escaneados vs. manuais | ≥ 75% escaneados |
| Erro de total relatado | ≤ 2% das compras |
| Retorno em 7 dias | ≥ 40% |

---

# Ordem de execução recomendada

Se puder trabalhar em apenas uma coisa por vez, esta é a sequência que minimiza
retrabalho:

```
1. Etapa 0        →  fundação (nada funciona sem isso)
2. Etapa 1.1–1.4  →  interface + parser + domínio de preço  ⭐ o núcleo
3. Etapa 1.5      →  tela do Laboratório
4. Etapa 2        →  🚪 PORTÃO — coleta e decisão
5. Etapa 3        →  endurecimento
6. Etapa 4        →  domínio completo
7. Etapa 5        →  app (a parte mais longa)
8. Etapa 6        →  backend
9. Etapa 7        →  produção
10. Etapa 8       →  beta
```

**O backend vem tarde de propósito.** O app funciona 100% offline; sincronização
é conveniência, não requisito de funcionamento. Adiar o backend mantém o foco no
que decide o sucesso do produto: a qualidade do reconhecimento.

---

# Armadilhas de execução

| Armadilha | Antídoto |
|---|---|
| Construir a UI antes do parser | O parser é o risco; UI é trabalho conhecido |
| Adiar o gabarito | Sem ele, toda mudança no parser é aposta |
| Buscar 100% de acurácia | 95% + fallback manual é um produto; 100% é ilusão |
| Adicionar Redis/K8s/microsserviços | Nada disso resolve problema que você tem hoje |
| Coletar só etiquetas fáceis | O gabarito precisa doer para ser útil |
| Backend antes do app | Inverte a prioridade de risco |
| `float` para dinheiro | Erro acumulado em 50 itens; use centavos inteiros |
| Testar backup só quando precisar | Backup nunca testado não existe |

---

# Checklist de "pronto para começar"

- [ ] Li `CLAUDE.md`
- [ ] Li `docs/02-MOTOR-RECONHECIMENTO.md` inteiro
- [ ] Entendi por que preço é estrutura e não número
- [ ] Tenho device Android físico para testes
- [ ] Tenho chave da API do Google Cloud Vision
- [ ] Tenho acesso SSH à VPS e controle do DNS
- [ ] Node LTS, Go 1.23+, Docker e Android Studio instalados

**Próxima ação:** Etapa 0, primeiro item.
