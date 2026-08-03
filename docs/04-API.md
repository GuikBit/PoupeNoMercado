# 04 — Contratos de API

---

## 1. Princípios

- **OpenAPI 3.1 é a fonte única da verdade.** Fica em `api/openapi.yaml`,
  versionado no repositório.
- Handlers em Go gerados com `oapi-codegen`; client TypeScript gerado com
  `openapi-typescript`. **Mudar um campo quebra a compilação dos dois lados no CI.**
- REST sobre HTTPS. JSON com `snake_case`.
- Versionamento por caminho: `/v1/...`.
- Timestamps sempre ISO 8601 com timezone (`2026-08-02T15:53:41Z`).
- Valores monetários sempre `integer` em centavos, com sufixo `_cents`.

**Base URL:** `https://api.poupenomercado.<seu-dominio>/v1`

---

## 2. Autenticação

**JWT de acesso (curto) + refresh token rotativo (longo).**

| Token | Duração | Onde |
|---|---|---|
| Access | 15 min | Header `Authorization: Bearer <jwt>` |
| Refresh | **90 dias** | Corpo da requisição; guardado no SecureStore do device |

A duração longa do refresh atende ao RNF-09: o usuário **não pode** ser
deslogado por ficar dias sem rede. Rotação a cada uso, com detecção de reuso
(se um refresh já usado reaparecer, revoga toda a família de tokens do device).

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/register` | Cria conta |
| `POST` | `/auth/login` | Autentica |
| `POST` | `/auth/refresh` | Rotaciona tokens |
| `POST` | `/auth/logout` | Revoga refresh do device |
| `DELETE` | `/auth/account` | Exclusão de conta (LGPD) |

```jsonc
// POST /auth/login
{ "email": "ana@exemplo.com", "password": "...", "device": { "id": "uuid", "platform": "android", "app_version": "1.0.0" } }

// 200
{
  "access_token": "eyJ...",
  "refresh_token": "rt_...",
  "expires_in": 900,
  "user": { "id": "uuid", "email": "ana@exemplo.com", "display_name": "Ana", "plan": "free" }
}
```

---

## 3. Sincronização

O núcleo da API. Dois endpoints fazem todo o trabalho.

### `POST /v1/sync/push`

Envia mutações locais. Idempotente por `(entity, entity_id, updated_at)`.

```jsonc
{
  "device_id": "uuid",
  "mutations": [
    {
      "entity": "shopping_list",
      "entity_id": "0192f3a1-...",
      "op": "upsert",
      "updated_at": "2026-08-02T15:53:41Z",
      "payload": { "name": "Compra do mês", "budget_cents": 20000 }
    },
    {
      "entity": "trip_item",
      "entity_id": "0192f3a2-...",
      "op": "upsert",
      "updated_at": "2026-08-02T15:54:10Z",
      "payload": {
        "trip_id": "0192f3a0-...",
        "raw_name": "VINAGRE DE ALCOOL PEIXE 750ML",
        "normalized_name": "VINAGRE ALCOOL PEIXE",
        "pricing_policy": {
          "base_price_cents": 299,
          "tiers": [
            { "min_qty": 3,  "price_cents": 279, "condition": { "kind": "none" } },
            { "min_qty": 24, "price_cents": 259, "condition": { "kind": "none" } }
          ],
          "sale_unit": "UN",
          "measure_price": { "value_cents": 398, "unit": "L", "per_amount": 1 }
        },
        "qty": 3,
        "sale_unit": "UN",
        "unit_price_cents": 279,
        "total_cents": 837,
        "entry_mode": "scan",
        "confidence": 0.91
      }
    }
  ]
}
```

```jsonc
// 200
{
  "applied": 2,
  "conflicts": [
    {
      "entity": "shopping_list",
      "entity_id": "0192f3a1-...",
      "reason": "stale_write",
      "server_version": { "updated_at": "2026-08-02T16:01:00Z", "payload": { } }
    }
  ],
  "cursor": 84213
}
```

Limite: **200 mutações por requisição**. O app pagina automaticamente.

### `GET /v1/sync/pull`

```
GET /v1/sync/pull?cursor=84100&limit=200
```

```jsonc
// 200
{
  "changes": [
    { "entity": "list_item", "entity_id": "...", "op": "upsert",
      "updated_at": "...", "server_seq": 84150, "payload": { } },
    { "entity": "list_item", "entity_id": "...", "op": "delete",
      "updated_at": "...", "server_seq": 84151 }
  ],
  "cursor": 84213,
  "has_more": false
}
```

O cliente só avança o cursor **após** aplicar tudo com sucesso localmente,
dentro de uma transação. Falha no meio = reprocessa o lote inteiro (as operações
são idempotentes).

---

## 4. Catálogo

### `GET /v1/products/search`

Busca fuzzy — usa `pg_trgm` + `unaccent`. Resolve nomes truncados de etiqueta.

```
GET /v1/products/search?q=PAO%20VOVO%20TINA%20FORMA&limit=5
```

```jsonc
{
  "results": [
    { "id": "uuid", "canonical_name": "Pão de Forma Tradicional Vovó Tina 400g",
      "brand": "Vovó Tina", "category": "Padaria", "default_unit": "UN",
      "ean": "7899307667009", "similarity": 0.82 }
  ]
}
```

### `GET /v1/products/lookup`

Resolução determinística por identificador.

```
GET /v1/products/lookup?ean=7898174854351
GET /v1/products/lookup?chain=bahamas&internal_code=65954
```

O parâmetro `chain` é **obrigatório** com `internal_code` — códigos internos só
têm sentido dentro da rede que os emitiu.

### `GET /v1/products/delta`

Sincroniza o `product_cache` local.

```
GET /v1/products/delta?since=2026-07-01T00:00:00Z&chain=bahamas&limit=1000
```

---

## 5. Perfis de layout

Permite corrigir a leitura de uma rede **sem publicar nova versão do app**.

### `GET /v1/layout-profiles`

```
GET /v1/layout-profiles?chain=bahamas&since_version=3
```

```jsonc
{
  "profiles": [
    {
      "id": "bahamas_gondola",
      "version": 4,
      "chain": "bahamas",
      "spec": {
        "signature": {
          "required_tokens": ["A PARTIR DE"],
          "aspect_ratio": { "min": 1.8, "max": 3.2 },
          "dominant_hue": { "hue": 50, "tolerance": 15 }
        },
        "extractors": { }
      }
    }
  ]
}
```

O app compara `version` com o que tem em cache e substitui o que for mais novo.

---

## 6. Amostras de reconhecimento

### `POST /v1/samples`

Envia leituras de baixa confiança para o pipeline de melhoria.
**Só é chamado com consentimento explícito e em Wi-Fi.**

```jsonc
{
  "samples": [
    {
      "id": "uuid",
      "chain": "bahamas",
      "engine_id": "mlkit",
      "layout_profile_id": "bahamas_perecivel",
      "confidence_score": 0.42,
      "ocr_raw": { },
      "parsed_result": { },
      "user_corrected": true,
      "corrected_value": { "base_price_cents": 789 }
    }
  ]
}
```

### `POST /v1/samples/{id}/image`

`multipart/form-data`. Limite de 2 MB. O app remove metadados EXIF antes do
envio. Retorna `202 Accepted`.

---

## 7. Contas e LGPD

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/v1/me` | Dados da conta |
| `PATCH` | `/v1/me` | Atualiza perfil |
| `GET` | `/v1/me/export` | **Exporta todos os dados** (JSON) — direito de portabilidade |
| `DELETE` | `/v1/auth/account` | **Exclui a conta e todos os dados** — direito ao esquecimento |
| `PATCH` | `/v1/me/consent` | Consentimentos (amostras, geolocalização) |

---

## 8. Erros

Formato único em toda a API:

```jsonc
{
  "error": {
    "code": "validation_failed",
    "message": "Campo obrigatório ausente",
    "details": [{ "field": "email", "reason": "required" }],
    "request_id": "req_01J..."
  }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `validation_failed` | Corpo inválido |
| 401 | `unauthenticated` | Token ausente/inválido |
| 401 | `token_expired` | Access expirado → cliente faz refresh |
| 403 | `forbidden` | Sem permissão |
| 404 | `not_found` | — |
| 409 | `sync_conflict` | Conflito não resolvível automaticamente |
| 413 | `payload_too_large` | Lote ou imagem acima do limite |
| 422 | `unprocessable` | Semanticamente inválido |
| 429 | `rate_limited` | Ver header `Retry-After` |
| 500 | `internal_error` | Sempre com `request_id` para correlação |

`request_id` é gerado por middleware, vai em todo log e em toda resposta de erro.

---

## 9. Rate limiting

| Grupo | Limite |
|---|---|
| `/auth/login`, `/auth/register` | 10/min por IP |
| `/sync/*` | 60/min por usuário |
| `/products/search` | 120/min por usuário |
| `/samples` | 20/min por usuário |

Implementado em memória no MVP (`golang.org/x/time/rate` por chave). Migra para
Redis quando houver mais de uma instância.

---

## 10. Observações de implementação

- **Todo handler** valida que o recurso pertence ao `user_id` do token. Nunca
  confie no `user_id` vindo do corpo da requisição.
- `POST /sync/push` roda em transação única por lote — ou aplica tudo, ou nada.
- `pricing_policy` é validada contra JSON Schema no servidor antes de persistir.
  Política malformada é rejeitada, não armazenada.
- Endpoints de leitura respondem `ETag`; o app envia `If-None-Match` para
  economizar banda no catálogo.
