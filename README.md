# Poupe no Mercado

> *"Nunca seja surpreendido no caixa."*

Aplicativo móvel de controle de gastos em supermercado: aponte a câmera para a
etiqueta de preço na gôndola, o app extrai a **política de preço** (faixas por
quantidade, cartão da loja) via OCR e soma o total da compra em tempo real.

## Documentação

**Comece por [`CLAUDE.md`](CLAUDE.md)** — contexto do projeto, princípios e convenções.

| Arquivo | Conteúdo |
|---|---|
| [`docs/00-VISAO-GERAL.md`](docs/00-VISAO-GERAL.md) | Problema, escopo, requisitos, roadmap |
| [`docs/01-ARQUITETURA.md`](docs/01-ARQUITETURA.md) | ADRs + diagramas C4 |
| [`docs/02-MOTOR-RECONHECIMENTO.md`](docs/02-MOTOR-RECONHECIMENTO.md) | ⭐ Pipeline, parser, perfis de layout, confiança |
| [`docs/03-MODELO-DADOS.md`](docs/03-MODELO-DADOS.md) | Schemas SQLite/PostgreSQL, sincronização |
| [`docs/04-API.md`](docs/04-API.md) | Contratos REST |
| [`docs/05-INFRAESTRUTURA.md`](docs/05-INFRAESTRUTURA.md) | Docker Compose, deploy, backup |
| [`docs/06-PLANO-VALIDACAO.md`](docs/06-PLANO-VALIDACAO.md) | ⭐ Laboratório de Etiquetas, métricas |
| [`IMPLEMENTACAO.md`](IMPLEMENTACAO.md) | Etapas de desenvolvimento |

## Estrutura

```
app/    → aplicativo React Native (Expo)
api/    → backend Go (a partir da Etapa 6)
infra/  → Docker Compose, Caddy, scripts de deploy
docs/   → documentação e resultados de validação
```
