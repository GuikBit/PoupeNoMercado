# 00 — Visão Geral, Requisitos e Roadmap

---

## 1. O problema

Consumidores brasileiros com orçamento apertado fazem compras de supermercado sem
visibilidade do total até o caixa. As consequências são concretas:

- Descobrir no caixa que passou do orçamento e ter que devolver itens
- Não conseguir planejar o mês porque o gasto do mercado é imprevisível
- Perder promoções de atacado por não saber o ponto de virada da faixa

O cálculo mental é inviável: 40 itens, preços com centavos, promoções condicionais.

## 2. A proposta

Um app que soma a compra **enquanto ela acontece**, lendo a etiqueta de preço da
gôndola pela câmera. O usuário aponta, confirma a quantidade, e o total sobe na
tela contra um teto que ele definiu.

### Proposta de valor em uma frase

> **Nunca seja surpreendido no caixa.**

Repare que o posicionamento é **controle de gastos**, não comparação de preços.
Essa distinção é deliberada — ver §6, Lições dos concorrentes.

## 3. Escopo

### Dentro do MVP

| # | Funcionalidade | Nota |
|---|---|---|
| F1 | Criar e editar lista de compras (digitação) | Base |
| F2 | Definir orçamento/teto para a compra | Verde → amarelo (85%) → vermelho |
| F3 | Modo escaneamento: câmera → produto + preço | O núcleo |
| F4 | **Cálculo de faixas de atacado** | Diferencial. Ver `02-MOTOR-RECONHECIMENTO.md` |
| F5 | Entrada manual de preço (fallback) | Sempre a 1 toque |
| F6 | Carrinho com soma em tempo real | Recalcula ao mudar quantidade |
| F7 | Produtos vendidos por peso (KG) | Fluxo distinto de quantidade |
| F8 | Marcar item da lista ao escanear | Matching fuzzy, com confirmação |
| F9 | Funcionamento 100% offline | Requisito, não feature |
| F10 | Histórico de compras próprias | Duplicar compra anterior |

### Fora do MVP (fases posteriores)

Lista colaborativa em tempo real · comparação entre supermercados ·
crowdsourcing de preços · cupons e cashback · widget · modo voz ·
receitas · divisão de conta · gamificação.

### Fora do projeto (não faremos)

- Integração com PDV ou sistema de loja
- Pagamento dentro do app
- Marketplace / e-commerce

## 4. Requisitos não-funcionais

Estes são os que efetivamente moldaram a arquitetura.

| ID | Requisito | Meta | Como é garantido |
|---|---|---|---|
| RNF-01 | **Funciona sem internet** | 100% das funções do MVP | SQLite local como fonte da verdade; OCR on-device |
| RNF-02 | **Latência do escaneamento** | p95 ≤ 800 ms | Processamento on-device, sem round-trip |
| RNF-03 | **Acurácia de preço** | ≥ 95% nos tipos A e B | Parser com âncoras + validação de plausibilidade |
| RNF-04 | **Erro confiante** | ≤ 1% | Modelo de confiança conservador; ver `02` §7 |
| RNF-05 | **Custo marginal por leitura** | R$ 0,00 | OCR on-device; nuvem só assíncrona e opcional |
| RNF-06 | **Custo de infraestrutura** | ≤ R$ 50/mês até 5k usuários | Go (~20 MB RAM) + VPS existente |
| RNF-07 | **Precisão monetária** | Zero erro de arredondamento | Inteiros em centavos em toda a stack |
| RNF-08 | **Privacidade** | Geolocalização opt-in explícito | Ver `05-INFRAESTRUTURA.md` §LGPD |
| RNF-09 | **Autonomia de sessão** | Não deslogar offline | Refresh token de longa duração |
| RNF-10 | **Tempo de sync** | Convergência ≤ 5 s com rede | Outbox + batch |

## 5. Personas

**Ana, 34 — orçamento apertado.** Faz compra grande uma vez por mês, com teto
rígido. Hoje usa calculadora do celular e ainda assim erra. É a persona
primária do MVP.

**Carlos, 41 — comprador de atacarejo.** Compra em quantidade para aproveitar
faixa de preço, mas não sabe de cabeça se compensa levar 3 ou 6. É quem mais
valoriza o diferencial de faixas.

**Julia, 27 — divide apartamento.** Compra junto com colegas e precisa dividir.
Persona da Fase 2 (lista colaborativa e racha).

## 6. Análise competitiva

| App | Escaneia preço | Soma em tempo real | Faixas de atacado | Offline | Status |
|---|---|---|---|---|---|
| ClickSuper | ❌ (base pré-cadastrada) | ❌ | Estático | ❌ | Ativo, forte |
| Coompras | ❌ (digitação) | ✅ | ❌ | Parcial | Ativo |
| Listonic | Limitado | ✅ | ❌ | ✅ | Ativo |
| Menor Preço (SEFAZ) | ❌ (nota fiscal) | ❌ | ❌ | ❌ | Cobertura parcial |
| **BoaLista** | Código de barras | ✅ | ❌ | ✅ | **Descontinuado (2022)** |
| **Poupe no Mercado** | **OCR de etiqueta** | ✅ | **✅ dinâmico** | ✅ | — |

### A lacuna

O BoaLista fazia quase isso e tinha milhares de usuários. Sumiu. Ninguém ocupou
o espaço. Há demanda comprovada e nenhum incumbente.

### Lições do fracasso do BoaLista

| Causa provável | Como evitamos |
|---|---|
| Modelo 100% colaborativo → dados de baixa qualidade | O MVP **não depende de crowdsourcing**. O preço vem da etiqueta que o próprio usuário está olhando |
| Manutenção cara (servidor, moderação) | Custo marginal zero: OCR on-device, uma VPS |
| Sem modelo de monetização | Freemium definido desde a Fase 1 |
| Dados desatualizados | Não há base de preços a manter atualizada no MVP |

### Ressalva honesta

Ler a etiqueta é único em parte **porque é difícil**. Todos os outros usam código
de barras porque é o caminho barato. Isso não invalida a ideia — significa que a
barreira técnica é o fosso competitivo **se** for vencida, e é o risco de morte
se for subestimada. Por isso o `06-PLANO-VALIDACAO.md` vem antes do MVP.

## 7. Roadmap

### Fase 0 — Validação técnica *(1–2 semanas)*
Laboratório de Etiquetas. Decidir o motor de OCR com dados. Construir o gabarito.
**Nada de produto ainda.** Detalhes em `06-PLANO-VALIDACAO.md`.

### Fase 1 — MVP *(2–3 meses)*
F1 a F10. App + backend + sync. Beta fechado com 20–30 usuários em Juiz de Fora.

### Fase 2 — Validação de mercado *(3–6 meses)*
Lista colaborativa com sincronização em tempo real · notificações ·
calculadora de preço por Kg/L · categorização automática.
**Impacto arquitetural:** entra Redis, entra WebSocket, o modelo de sync passa
de LWW por entidade para resolução por campo.

### Fase 3 — Crescimento *(6–12 meses)*
Histórico de preços com geolocalização · comparação entre lojas · widget.
**Impacto arquitetural:** entra particionamento de tabela de observações de
preço, possivelmente TimescaleDB.

### Fase 4 — Monetização *(12+ meses)*
Premium (listas ilimitadas, histórico, análises) · cupons · parcerias com redes.

### Monetização planejada

| Plano | Preço | Inclui |
|---|---|---|
| Grátis | R$ 0 | 5 listas, sem histórico além de 30 dias |
| Premium | ~R$ 9,90/mês | Listas ilimitadas, histórico completo, análises, comparação |

O custo marginal por usuário grátis é próximo de zero (OCR on-device, sync leve),
o que torna o freemium sustentável — diferente do BoaLista.
