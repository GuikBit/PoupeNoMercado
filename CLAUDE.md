# Poupe no Mercado — Contexto do Projeto

> Documento de contexto para agentes de IA e novos desenvolvedores.
> Leia este arquivo primeiro. Ele resume o projeto e aponta para a documentação detalhada.

---

## O que é

Aplicativo móvel de controle de gastos em supermercado. O usuário aponta a câmera
para a **etiqueta de preço na gôndola**, o app extrai produto e preço via OCR,
pergunta a quantidade e vai somando o total da compra em tempo real — para a
pessoa não ser surpreendida no caixa.

**Frase-âncora do produto:** *"Nunca seja surpreendido no caixa."*

## O diferencial (e o risco)

O diferencial competitivo **não é** ler a etiqueta. É entender que uma etiqueta de
atacarejo não contém *um preço*, e sim uma **política de preço** com faixas por
quantidade:

```
VINAGRE DE ALCOOL PEIXE 750ML
De R$ 2,99 a Unidade              ← preço de 1 unidade
NESTA EMBALAGEM 1LT R$ 3,98       ← preço por litro (NÃO é preço de venda)
A PARTIR DE 3  → R$ 2,79          ← faixa 1
A PARTIR DE 24 → R$ 2,59          ← faixa 2
OU NO BAHAMAS CRED: R$ 2,59       ← condicionado a meio de pagamento
```

Nenhum concorrente calcula isso dinamicamente. É onde está o valor e onde está a
dificuldade técnica.

**Consequência arquitetural central:** o scanner **nunca** retorna um número.
Retorna uma estrutura `PoliticaPreco`, e o carrinho recalcula o preço unitário
sempre que a quantidade muda.

---

## Estado atual do projeto

| | |
|---|---|
| **Fase** | Fase 0 — Etapas 0, 1 e 2 ✅ · Etapa 3 parcial (parser ✅, pré-processamento ⏳) |
| **Corpus** | 51 casos reais de campo (08/08/2026) em `app/fixtures/lab-2026-08-08.cases.json` + 51 imagens em `app/fixtures/labels/` |
| **Onde está** | Cloud Vision: M1 A+B **100%**, M2 92,3%, M3 **0%**. ML Kit: M1 A+B 62,5%, M3 **0%**, p95 266 ms |
| **Pré-processamento** | ❌ testado e descartado (8 variantes × 51 casos). A prescrição original — binarização adaptativa + upscale 2× — é **metade** da linha de base. Teto teórico com seleção perfeita: 84,4% em A+B |
| **Próximo passo** | 🚪 **Cenário 4** de `docs/06` §6 disparado: parser e pré-processamento exercidos, o limite é o motor. Escolher o escalonamento — PaddleOCR/ONNX · VLM de fallback · entrada manual assistida · ou o híbrido ML Kit+abstenção |
| **Decisão pendente** | ADR-002 (qual motor). O Cloud Vision acerta tudo mas viola o offline-first e falha M6 por 3,4×; o ML Kit é rápido, offline e **nunca erra com convicção** (M3 0%, abstenção 85,7%), mas só acerta 62,5% |
| **Leitura obrigatória** | `docs/resultados/lab-2026-08-10.md` — o que a coleta revelou, inclusive 9 gabaritos que vieram errados |

### Notas da Etapa 1

- **ML Kit** roda via **módulo Expo local próprio** em `app/modules/mlkit-text-recognition`
  (Kotlin, `com.google.mlkit:text-recognition:16.0.1` bundled, confiança por linha).
  Autolinking do SDK 57 descobre `modules/` sozinho; a dependência Gradle vive no
  `build.gradle` do módulo — nunca edite o `android/` gerado (CNG).
- **`react-native-fast-opencv` está pinado em 1.0.1 exato** (V1 = New Arch only,
  API nova; `clearBuffers()` não existe mais — objetos têm GC, use `release()`).
- Módulos nativos são mockados no Jest via `moduleNameMapper` → `src/test/mocks/`
  (padrão: stub que lança alto; testes injetam `recognizeFn`/`detectFn`/fake `LabDb`).
- Export do Lab: `Paths.document/exports/lab-<data>/` no formato de fixtures de
  docs/02 §9; imagens em massa saem por `adb pull`.

### ⚠️ Requisitos de ambiente Windows (aprendidos a caro preço)

- O repositório DEVE morar em caminho **curto e sem espaços**: `C:\dev\PoupeNoMercado`.
- O Android SDK DEVE morar em `C:\Android\Sdk` (`ANDROID_HOME` configurado).
- Motivo: espaço no caminho força o CMake/AGP a usar caminhos 8.3 (`CLANG_~1.EXE`),
  que com `-no-canonical-prefixes` quebra o link da libc++ em todo módulo nativo;
  caminhos longos estouram o limite de 250 caracteres para objetos e disparam o
  loop `ninja: manifest still dirty`.

---

## Stack

| Camada | Tecnologia |
|---|---|
| App | React Native + Expo (Dev Client) · TypeScript strict · Tamagui · Expo Router · Zustand |
| Câmera / Visão | react-native-vision-camera v4 · react-native-fast-opencv |
| OCR | Interface `OcrEngine` → ML Kit (on-device) · Google Cloud Vision (referência) |
| Banco local | SQLite (expo-sqlite) + Drizzle ORM |
| Backend | Go · chi · sqlc + pgx/v5 · goose · log/slog |
| Banco | PostgreSQL 18 + `pg_trgm`, `unaccent`, `btree_gin` |
| Contrato | OpenAPI 3.1 → `oapi-codegen` (Go) + `openapi-typescript` (app) |
| Infra | Docker Compose · Caddy · VPS própria (12 GB RAM, 1 TB) |

---

## Princípios inegociáveis

Estes cinco pontos não são preferências — são o que faz o produto funcionar.
Qualquer proposta que os viole deve ser rejeitada ou explicitamente renegociada.

1. **Offline-first é a arquitetura, não uma feature.** A fonte da verdade é o
   SQLite no celular. O servidor é réplica. O app nunca espera rede para
   atualizar a tela. Supermercado tem sinal ruim — é o momento exato de uso.

2. **Preço é estrutura, nunca escalar.** Toda função que lida com preço recebe
   `PoliticaPreco` + quantidade. Nunca um `float`.

3. **O OCR fica atrás de uma interface.** Nenhum código de domínio importa
   ML Kit ou qualquer motor diretamente. Trocar de motor deve ser mudar uma
   linha de configuração.

4. **O fallback manual nunca bloqueia.** Se o reconhecimento falhar, a entrada
   manual está a um toque. O usuário jamais fica travado no corredor.

5. **Erro confiante é o pior bug possível.** Um preço errado com alta confiança
   destrói a única coisa que o app vende: um total em que se pode confiar.
   Prefira admitir incerteza a chutar.

---

## Estrutura da documentação

| Arquivo | Conteúdo |
|---|---|
| `docs/00-VISAO-GERAL.md` | Problema, escopo, requisitos, análise competitiva, roadmap |
| `docs/01-ARQUITETURA.md` | ADRs (decisões e seus porquês) + diagramas C4 |
| `docs/02-MOTOR-RECONHECIMENTO.md` | ⭐ **O coração.** Pipeline, interface `OcrEngine`, especificação completa do parser, perfis de layout, modelo de confiança |
| `docs/03-MODELO-DADOS.md` | Schemas SQLite e PostgreSQL, sincronização, resolução de conflito |
| `docs/04-API.md` | Contratos REST, autenticação, versionamento |
| `docs/05-INFRAESTRUTURA.md` | Docker Compose, Caddy, backup, CI/CD, segurança e LGPD |
| `docs/06-PLANO-VALIDACAO.md` | ⭐ Protocolo do Laboratório, métricas, critérios de decisão do OCR |
| `IMPLEMENTACAO.md` | Etapas de desenvolvimento, tarefas, ordem de execução |

**Para entender o produto:** leia `00` e `01`.
**Para escrever código de reconhecimento:** leia `02` — é obrigatório.
**Para começar a desenvolver hoje:** leia `IMPLEMENTACAO.md` Etapa 0 e 1.

---

## Material de origem

| Caminho | O que é |
|---|---|
| `Poupe no mercado - Ideia.pdf` | Levantamento inicial: funcionalidades, análise competitiva, priorização por fases |
| `Etiquetas/` | 13 fotos reais de etiquetas do Bahamas Mix (Juiz de Fora/MG). **São a base de toda a especificação do parser.** |

As 13 fotos revelaram **4 tipos estruturalmente diferentes de etiqueta dentro de
uma única rede**. Ver `docs/02-MOTOR-RECONHECIMENTO.md` §3 para a taxonomia.

---

## Convenções de código

### Geral
- Idioma do código e identificadores: **inglês**. Comentários e docs: **português**.
- Nomes de domínio preservam o termo do negócio: `PriceTier`, `LabelReading`,
  `PricingPolicy` — não `Faixa`, `Leitura`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

### App (TypeScript)
- `strict: true` sem exceções. `any` é proibido; use `unknown` + narrowing.
- Dinheiro é **inteiro em centavos** (`priceCents: number`). Nunca `float`.
- Nenhum import de motor de OCR fora de `src/ocr/engines/`.
- Estado de domínio no Zustand; estado de servidor via TanStack Query.

### Backend (Go)
- `sqlc` gera o acesso a dados — não escreva queries à mão fora de `queries/`.
- Erros propagados com `fmt.Errorf("contexto: %w", err)`.
- Logs estruturados com `log/slog`. Nunca `fmt.Println` em produção.
- Handlers finos: validação → serviço → repositório. Regra de negócio no serviço.
- Dinheiro é `int64` em centavos, coluna `BIGINT`. Nunca `FLOAT`.

### Banco
- Toda tabela sincronizável tem: `id` (UUID v7), `updated_at`, `deleted_at`, `device_id`.
- Migrations com `goose`, versionadas, **nunca editadas depois de aplicadas**.
- Fixe a major do Postgres no Compose (`postgres:18-alpine`). Nunca `latest`.

---

## Armadilhas conhecidas

Erros que já foram identificados na análise e devem ser evitados:

| Armadilha | Por quê |
|---|---|
| Pegar "o maior R$" da etiqueta | O preço por Kg (`R$ 52,41`) é maior que o preço de venda (`R$ 4,99`) |
| Pegar "o R$ em fonte maior" | Na etiqueta de gôndola, o preço destacado é o da faixa de 3+, não o unitário |
| Ignorar o preço riscado | `DE: R$ 6,29` está tachado. OCR não vê o risco — use as âncoras `DE:`/`POR:` |
| Tratar produto por KG como unidade | `CORAÇÃO ALCATRA R$ 49,90/KG` — quantidade "1" ≠ 1 pacote |
| Confiar no código de barras | Muitos codificam o **código interno da loja** (ex: `65954`), inútil fora da rede |
| OCR na nuvem no caminho crítico | Mercado tem sinal ruim; o produto principal para de funcionar |
| Usar `float` para dinheiro | Erro de arredondamento em soma acumulada de 50 itens |

---

## Comandos

> Mantenha esta seção atualizada conforme o projeto evolui.
> Backend (`api/`) ainda não implementado — comandos entram na Etapa 6.

```bash
# App (funcionais desde a Etapa 0)
cd app && npm install
npx expo prebuild --platform android   # gera android/ (não versionado — CNG)
npm run android              # build + instala no device (expo run:android)
npm run typecheck
npm run lint
npm run format
npm run test
npm run analyze:lab -- <cases.json>   # relatório M1–M7 sobre um export do Lab

# Backend (a partir da Etapa 6)
cd api && go mod download
make dev                     # sobe api + postgres via compose
make migrate-up
make sqlc                    # regenera acesso a dados
make test
go vet ./... && golangci-lint run

# Contrato
make openapi                 # gera stubs Go + client TypeScript
```
