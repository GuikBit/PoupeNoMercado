# 02 — Motor de Reconhecimento de Etiquetas ⭐

> **Este é o documento mais importante do projeto.** Descreve o ativo que nenhum
> concorrente copia facilmente. Leia inteiro antes de escrever qualquer código de
> reconhecimento.

---

## 1. Princípio central

Uma etiqueta de supermercado **não contém um preço**. Contém uma *política de
preço*, cujo valor efetivo depende de três eixos independentes:

1. **Quantidade** levada (faixas de atacado)
2. **Meio de pagamento** (cartão da loja)
3. **Vigência** (preço promocional vs. regular)

Consequência direta:

> **O motor de reconhecimento nunca retorna um número. Retorna uma estrutura.**

Isso inverte o fluxo intuitivo. O correto não é *identificar → perguntar
quantidade → somar*, e sim:

```
identificar → extrair política → usuário informa quantidade → resolver preço → somar
                                              ↑                      │
                                              └──── recalcula ───────┘
```

---

## 2. Pipeline

```
E0  CAPTURA           guia visual na tela; usuário enquadra a etiqueta
     ↓                 [reduz drasticamente a dificuldade dos estágios seguintes]
E1  DETECÇÃO          localizar o retângulo da etiqueta e corrigir perspectiva
     ↓                 OpenCV: HSV → contornos → maior quadrilátero → warp
E2  OCR               ImageRef → OcrBlock[] {texto, caixa, confiança}
     ↓                 interface OcrEngine — motor intercambiável
E3  CLASSIFICAÇÃO     qual perfil de layout? (A/B/C/D/genérico)
     ↓                 assinatura visual + tokens marcadores
E4  EXTRAÇÃO          perfil dita as âncoras e regiões → campos brutos
     ↓
E5  VALIDAÇÃO         regras de plausibilidade; monta PricingPolicy
     ↓
E6  CONFIANÇA         score final → aceitar / confirmar / manual
```

Cada estágio é uma função pura testável isoladamente. E1 e E2 dependem de
plataforma; E3 a E6 são **TypeScript puro** e rodam nos testes sem device.

---

## 3. Taxonomia de etiquetas (rede Bahamas Mix)

Derivada da análise das 13 fotos em `Etiquetas/`. Quatro tipos estruturalmente
distintos **dentro de uma única rede**.

### Tipo A — Oferta promocional

Papel branco, orientação retrato, cabeçalho sazonal colorido.

```
┌──────────────────────────────┐
│  [banner sazonal colorido]   │
│                              │
│  AZEITONA VERDE BAHAMAS      │  ← nome, 1–2 linhas, caixa alta
│  SACHE 120G SEM CAROCO       │
│                              │
│  DE: R$  6̶,2̶9̶                │  ← RISCADO — preço antigo
│  POR: R$                     │
│         4,99   UN            │  ← preço efetivo + unidade
│                              │
│  PREÇO/KG REGULAR: R$ 52,41  │  ← ARMADILHA: maior que o preço real
│  PREÇO/KG OFERTA:  R$ 41,58  │
│  24/07/2026        Cód 168439│
│                    ▮▮▮▮▮▮▮   │
│                 7898174854351│  ← EAN real
└──────────────────────────────┘
```

**Exemplos:** Azeitona, Pão de Forma, Cobertura Garoto.

### Tipo B — Gôndola atacarejo ⭐ *o mais importante*

Amarelo saturado, orientação paisagem, impressão matricial.

```
┌───────────────────────────────────────────────┐
│ VINAGRE DE ALCOOL PEIXE 750ML                 │  ← nome, 1 linha
│ De R$ 2,99  a Unidade          24/07/26       │  ← preço base
│ NESTA EMBALAGEM 1LT R$ 3,98    25421          │  ← ARMADILHA: R$/litro
│ ┌───────────────┬───────────────────────────┐ │      Min 143
│ │ A PARTIR DE 3 │ A PARTIR DE 24            │ │  ← faixas
│ │  R$ 2,79      │  R$ 2,59                  │ │
│ │ NESTA EMBAL.  │ NESTA EMBALAGEM           │ │
│ │ 1LT R$ 3,72   │ 1LT R$ 3,45               │ │
│ │ Economize     │ ┌───────────────────────┐ │ │
│ │ R$ 0,60       │ │ OU NO BAHAMAS CRED    │ │ │  ← condicional
│ │               │ │ a partir de 1 unid.   │ │ │
│ │               │ │ R$ 2,59               │ │ │
│ └───────────────┴─┴───────────────────────┴─┘ │
└───────────────────────────────────────────────┘
```

**Exemplos:** Vinagre, Sabonete Dove, Papel Alumínio, Lâmpadas, Pote plástico.

Este tipo domina o atacarejo e é onde está o diferencial competitivo. Contém até
**seis** valores em reais.

### Tipo C — Perecível simples

Amarelo pequeno, só preço, impressão matricial frequentemente degradada.

```
┌─────────────────────────────────────┐
│ COXA SOBRECOXA DE FRANGO AVE NOVA KG│  ← degradado, quase ilegível
│                        29/07/26     │
│  ┌────────────────────┐ 59162       │
│  │   R$   7,89        │ Min 1051    │  ← único preço
│  └────────────────────┘  ▮          │
└─────────────────────────────────────┘
```

**Exemplos:** Coxa/Sobrecoxa, Asa de Frango.

**O tipo mais difícil.** O nome é frequentemente irrecuperável por OCR — a
estratégia é priorizar o **código interno** para lookup em catálogo local, e
aceitar o nome degradado como sugestão editável.

### Tipo D — Cartaz de açougue

Amarelo plastificado, formato A3, fonte muito grande, com reflexo especular.

```
┌──────────────────────────────┐
│ CORACAO ALCATRA BOVINO DI    │
│ PRIMA KG                     │
│                              │
│ DE: R$  5̶4̶,9̶0̶                │
│ POR: R$                      │
│        49,90   KG            │  ← preço por quilo
│                              │
│ 30/07/2026      Cód 65954    │
│                 ▮▮▮▮▮▮▮      │  ← barcode do CÓDIGO INTERNO
│                    65954     │     não é EAN
└──────────────────────────────┘
```

---

## 4. Interface `OcrEngine`

Fronteira que isola o motor do resto do sistema. **Nenhum código fora de
`src/ocr/engines/` importa um motor concreto.**

```typescript
/** Retângulo normalizado (0..1) relativo à imagem retificada. */
export interface BoundingBox {
  x: number; y: number; w: number; h: number
}

export interface OcrBlock {
  text: string
  box: BoundingBox
  /** 0..1. Use -1 quando o motor não fornecer — o scorer trata como desconhecido. */
  confidence: number
  lines?: OcrBlock[]
}

export interface OcrResult {
  blocks: OcrBlock[]
  engineId: string
  latencyMs: number
  imageSize: { width: number; height: number }
}

export interface OcrEngine {
  readonly id: string
  readonly requiresNetwork: boolean
  readonly costPerCallCents: number
  recognize(image: ImageRef): Promise<OcrResult>
  isAvailable(): Promise<boolean>
}
```

### Implementações previstas

| Motor | `id` | Rede | Papel |
|---|---|---|---|
| ML Kit Text Recognition v2 | `mlkit` | não | Candidato titular |
| Google Cloud Vision | `cloudvision` | sim | Teto de referência; fallback opcional |
| Apple Vision | `applevision` | não | Adiado — sem hardware iOS disponível |
| PaddleOCR (ONNX) | `paddle` | não | Reserva se houver soberania como requisito |

### Normalização de confiança

Motores reportam confiança de formas incompatíveis. A camada de adaptação
normaliza para `0..1`, e `-1` significa "motor não informou". O `ConfidenceScorer`
trata `-1` aplicando um teto conservador de `0.75`, para que ausência de
informação nunca vire falsa certeza.

---

## 5. Modelo de domínio

```typescript
export type SaleUnit = 'UN' | 'KG' | 'L' | 'M'

export type PriceCondition =
  | { kind: 'none' }
  | { kind: 'storeCard'; cardName: string }   // "BAHAMAS CRED"

export interface PriceTier {
  /** Quantidade mínima para esta faixa valer. */
  minQty: number
  priceCents: number
  condition: PriceCondition
}

export interface MeasurePrice {
  valueCents: number
  unit: 'KG' | 'L' | 'M' | 'UN'
  /** Quantidade da unidade de medida. Ex: "1LT R$ 3,98" → 1 */
  perAmount: number
}

export interface PricingPolicy {
  /** Preço de 1 unidade, sem condição. Sempre presente. */
  basePriceCents: number
  /** "DE:" riscado. Informativo — NUNCA usado no cálculo. */
  previousPriceCents?: number
  /** Ordenadas por minQty ascendente. */
  tiers: PriceTier[]
  saleUnit: SaleUnit
  /** "NESTA EMBALAGEM 1LT R$ 3,98" — informativo, para comparação. */
  measurePrice?: MeasurePrice
  savingsCents?: number
}

export interface ProductIdentity {
  rawName: string
  normalizedName: string
  internalCode?: string
  ean?: string
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface LabelReading {
  product: ProductIdentity
  pricing: PricingPolicy
  labelDate?: string          // ISO 8601
  storeChain?: string
  confidence: {
    level: ConfidenceLevel
    score: number             // 0..1
    /** Campos que não passaram na validação — destacar na UI. */
    weakFields: string[]
    failedRules: string[]
  }
  provenance: {
    engineId: string
    layoutProfileId: string
    latencyMs: number
    capturedAt: string
  }
}
```

### A função que resolve o preço

```typescript
export interface PriceResolution {
  unitPriceCents: number
  appliedTier: PriceTier | null
  /** Faixa seguinte e quanto falta para alcançá-la. Alimenta a dica de UI. */
  nextTier: { tier: PriceTier; qtyNeeded: number; savingsCents: number } | null
}

export function resolvePrice(
  policy: PricingPolicy,
  qty: number,
  useStoreCard: boolean,
): PriceResolution
```

**Algoritmo:**

1. Filtrar `tiers` aplicáveis: descartar `storeCard` se `useStoreCard === false`
2. Entre as faixas com `minQty <= qty`, escolher a de **menor preço**
3. Se nenhuma se aplica → `basePriceCents`
4. `nextTier` = faixa aplicável de menor `minQty > qty`, se existir

**Total do item:**

```typescript
// UN: total = unitPrice × qty              (inteiro, exato)
// KG: total = round(unitPrice × weightKg)  (arredonda o TOTAL, meio-p/-cima)
```

Nunca arredonde o preço unitário — só o total do item. Isso mantém a soma
consistente com o que o caixa cobra.

### Exemplo de uso — Vinagre

```typescript
const policy: PricingPolicy = {
  basePriceCents: 299,
  tiers: [
    { minQty: 3,  priceCents: 279, condition: { kind: 'none' } },
    { minQty: 24, priceCents: 259, condition: { kind: 'none' } },
    { minQty: 1,  priceCents: 259, condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' } },
  ],
  saleUnit: 'UN',
  measurePrice: { valueCents: 398, unit: 'L', perAmount: 1 },
}

resolvePrice(policy, 1,  false) // 299 · nextTier: 3 un → economiza R$ 0,60
resolvePrice(policy, 3,  false) // 279 · nextTier: 24 un
resolvePrice(policy, 24, false) // 259 · nextTier: null
resolvePrice(policy, 1,  true)  // 259 (cartão da loja)
```

---

## 6. Especificação do parser

### 6.1 Normalização do texto

Aplicada a **todo** bloco antes de qualquer casamento.

```
1. Caixa alta
2. Remoção de acentos (unaccent)
3. Colapso de espaços múltiplos
4. Correções de confusão comum do OCR, aplicadas SOMENTE em
   contexto numérico (entre dígitos ou adjacente a "R$"):
       O → 0     I,l,| → 1     S → 5     B → 8     Z → 2
5. Normalização de separador decimal: "." → "," quando seguido de 2 dígitos finais
```

⚠️ **Nunca** aplique a etapa 4 no nome do produto — transformaria `POTE` em `P0TE`.

### 6.2 Estratégia de ancoragem

O parser não busca por posição absoluta. Busca por **âncora textual** e depois
procura o valor em uma **região espacial relativa** a ela.

```
                  âncora "DE R$"
                        ↓
              ┌─────────┴──────────────┐
   região de busca: mesma linha (±0.6× altura da âncora),
   à direita, até 0.35 da largura da imagem
              └────────────────────────┘
```

Isso é robusto a etiqueta torta, rotação leve e blocos fragmentados pelo OCR.

```typescript
export interface AnchorSpec {
  /** Regex aplicada ao texto normalizado. */
  pattern: RegExp
  /** Onde buscar o valor, relativo à caixa da âncora. */
  search: {
    direction: 'right' | 'below' | 'sameBox' | 'rightOrBelow'
    maxDistanceRatio: number   // fração da dimensão da imagem
    verticalToleranceRatio: number
  }
  /** Regex que extrai o valor na região encontrada. */
  valuePattern: RegExp
}
```

### 6.3 Padrões regex reutilizáveis

```typescript
export const RE = {
  MONEY:      /R?\$?\s*(\d{1,4})[,.](\d{2})\b/,
  MONEY_LOOSE:/(\d{1,4})[,.](\d{2})\b/,
  DATE:       /\b(\d{2})\/(\d{2})\/(\d{2,4})\b/,
  INTERNAL:   /\bC[OÓ]D\.?\s*(\d{4,8})\b/,
  EAN13:      /\b(\d{13})\b/,
  TIER:       /A\s*PARTIR\s*DE\s*(\d{1,3})/,
  UNIT_SUFFIX:/\b(KG|UN|LT|L|ML|G|MT|M)\b/,
  MEASURE:    /NESTA\s+EMBALAGEM\s+(\d+)\s*(KG|LT|L|MT|M|G|ML)\s*R?\$?\s*(\d+)[,.](\d{2})/,
  STORE_CARD: /BAHAMAS\s*CRED/,
  SAVINGS:    /ECONOMIZE\s*R?\$?\s*(\d+)[,.](\d{2})/,
  FROM:       /\bDE\s*:?\s*R\$/,
  TO:         /\bPOR\s*:?\s*R\$/,
  PER_UNIT:   /A\s*UNIDADE/,
  MEASURE_PRICE_LABEL: /PRE[CÇ]O\s*\/\s*(KG|L)/,
}
```

### 6.4 Classificação de layout (E3)

Cada perfil declara uma **assinatura**. O classificador pontua todos e escolhe o
de maior score; abaixo de `0.5` cai no perfil genérico.

```typescript
export interface LayoutSignature {
  /** Tokens que, se presentes, somam pontos. */
  requiredTokens: RegExp[]
  forbiddenTokens: RegExp[]
  /** Faixa de proporção largura/altura da etiqueta retificada. */
  aspectRatio?: { min: number; max: number }
  /** Matiz dominante em HSV (0..360) e tolerância. */
  dominantHue?: { hue: number; tolerance: number }
}
```

| Perfil | Assinatura |
|---|---|
| `bahamas_gondola` (B) | amarelo (H≈50±15) · paisagem (AR 1.8–3.2) · contém `A PARTIR DE` |
| `bahamas_perecivel` (C) | amarelo · paisagem · **sem** `A PARTIR DE` · exatamente um `R$` |
| `bahamas_oferta` (A) | fundo claro · retrato (AR 0.6–0.9) · contém `DE:` **e** `POR:` |
| `bahamas_cartaz` (D) | amarelo · retrato · contém `DE:`/`POR:` · **sem** `PRECO/KG` |
| `generic_fallback` | sempre casa, score fixo 0.3 |

### 6.5 Perfis de extração (E4)

#### `bahamas_gondola` (Tipo B) — o mais elaborado

| Campo | Estratégia |
|---|---|
| `rawName` | Primeiro bloco a partir do topo, acima da âncora `DE R$`. Descartar tokens de data e código |
| `basePriceCents` | `MONEY` após âncora `DE R$`, na região à direita, na mesma linha. Validar que `A UNIDADE` aparece à direita |
| `measurePrice` | `RE.MEASURE` na linha imediatamente abaixo do preço base |
| `tiers` | Para **cada** ocorrência de `RE.TIER`: capturar `minQty`; buscar o primeiro `MONEY` abaixo, dentro de **0.25× altura da imagem**, e — quando houver retângulo detectado — dentro da mesma caixa delimitada |
| tier de cartão | Bloco contendo `STORE_CARD` → `minQty` de `a partir de (\d+) unid`, preço do `MONEY` seguinte, `condition.kind = 'storeCard'` |
| `savingsCents` | `RE.SAVINGS` |
| `internalCode` | Bloco numérico de 5–6 dígitos no canto superior direito, abaixo da data |
| `labelDate` | `RE.DATE` |
| `saleUnit` | `UN` por padrão; `KG` se o nome terminar em ` KG` |
| ignorar | `Min \d+` (estoque interno da loja) |

⚠️ **Erro clássico a evitar:** `NESTA EMBALAGEM 1LT R$ 3,98` está fisicamente
entre o preço base e as faixas. Um parser ingênuo o captura como preço. A âncora
`NESTA EMBALAGEM` **deve** ser testada antes de qualquer busca genérica por dinheiro.

#### `bahamas_oferta` (Tipo A)

| Campo | Estratégia |
|---|---|
| `rawName` | Blocos entre o banner e a âncora `DE:`; juntar até 2 linhas |
| `previousPriceCents` | `MONEY` após `RE.FROM` — **nunca** entra no cálculo |
| `basePriceCents` | Maior bloco de texto da imagem (área da caixa), abaixo de `RE.TO` |
| `saleUnit` | `UNIT_SUFFIX` à direita do preço grande |
| `measurePrice` | Após `PRECO/KG OFERTA` (preferir) ou `PRECO/KG REGULAR` |
| `internalCode` | `RE.INTERNAL` |
| `ean` | `RE.EAN13` abaixo do código de barras |
| `tiers` | `[]` — este tipo não tem faixas |

#### `bahamas_perecivel` (Tipo C)

| Campo | Estratégia |
|---|---|
| `rawName` | Primeira linha. **Marcar sempre como campo fraco** (`weakFields`) |
| `basePriceCents` | Único `MONEY` da imagem |
| `saleUnit` | `KG` se o nome contiver ` KG`, senão `UN` |
| `internalCode` | Bloco numérico 5–6 dígitos, canto superior direito |
| identificação | **Priorizar `internalCode`** para lookup no catálogo local — mais confiável que o nome |

#### `bahamas_cartaz` (Tipo D)

Idêntico ao Tipo A, exceto: sem `measurePrice`; o barcode codifica o
`internalCode`, não um EAN — **não** popular o campo `ean`.

#### `generic_fallback`

| Campo | Estratégia |
|---|---|
| `basePriceCents` | `MONEY` no bloco de maior área, com penalidade se houver mais de um candidato |
| `rawName` | Bloco superior mais largo |
| tudo mais | Não preenchido |
| confiança | **Teto forçado em 0.55** → nunca aceita automaticamente |

### 6.6 Versionamento e distribuição de perfis

Perfis são dados, não código:

```typescript
export interface LayoutProfile {
  id: string
  version: number
  chain: string
  signature: LayoutSignature
  extractors: Record<string, ExtractorSpec>
}
```

Ficam embutidos no app como padrão e podem ser atualizados via endpoint
`GET /v1/layout-profiles?since=`. Isso permite **corrigir a leitura de uma rede
sem publicar nova versão na loja** — capacidade importante, porque supermercados
mudam layout de etiqueta sem avisar.

---

## 7. Validação e modelo de confiança

### 7.1 Regras de plausibilidade (E5)

Executadas em ordem. Cada falha registra em `failedRules` e aplica penalidade.

| # | Regra | Penalidade |
|---|---|---|
| V1 | `basePriceCents` entre 1 e 999.999 | **rejeita** |
| V2 | Exatamente 2 casas decimais | **rejeita** |
| V3 | Toda `tier.priceCents < basePriceCents` | −0.30 |
| V4 | `tiers` monotonicamente decrescentes por `minQty` | −0.25 |
| V5 | `previousPriceCents > basePriceCents` (se houver DE/POR) | −0.20 |
| V6 | `measurePrice` coerente com `basePriceCents` (±40%, quando o tamanho da embalagem é extraível do nome) | −0.15 |
| V7 | `saleUnit === 'KG'` e preço > R$ 200,00 | −0.20 |
| V8 | `saleUnit === 'UN'` e preço > R$ 500,00 | −0.15 |
| V9 | Nome com ≥ 3 caracteres e ≥ 1 vogal | −0.20, marca `rawName` como fraco |
| V10 | `labelDate` não está mais de 90 dias no passado | −0.10 |

### 7.2 Cálculo do score

```typescript
score = min(
  ocrConfidence,       // média ponderada por área dos blocos efetivamente usados
  layoutConfidence,    // score do classificador de layout
  1 - Σ(penalidades)   // validação
)
```

O uso de `min` (e não média) é deliberado: **um elo fraco derruba tudo**. É a
postura conservadora exigida pelo RNF-04 — erro confiante é o pior bug possível.

### 7.3 Limiares e comportamento

| Score | Nível | Comportamento na UI |
|---|---|---|
| ≥ 0.85 | `high` | Mostra resultado; usuário só confirma a quantidade (1 toque) |
| 0.60–0.85 | `medium` | Mostra com o campo de preço **destacado e editável**; exige confirmação explícita |
| < 0.60 | `low` | Abre direto o teclado numérico, com o palpite pré-preenchido e selecionado |

**Em nenhum caso o app trava.** Campos em `weakFields` são sempre destacados,
independentemente do nível.

### 7.4 Política de fallback

```
score < 0.60?
  ├─ há rede E o usuário optou por "melhorar leitura"?
  │     └─ tenta cloudvision (opcional, desligado por padrão)
  └─ senão → entrada manual, sempre
                └─ imagem + resultado enfileirados para o pipeline assíncrono
```

O pipeline assíncrono (sobe só no Wi-Fi) alimenta a melhoria dos perfis. **Nunca
bloqueia o usuário e nunca é obrigatório.**

---

## 8. Casamento com a lista de compras

Ao escanear, tentamos marcar o item correspondente na lista do usuário.

**Algoritmo:**

1. Normalizar `rawName` (caixa alta, sem acento, remover tokens de embalagem:
   `\d+(G|ML|KG|L|UN|CX|PC)`)
2. Similaridade por trigrama contra cada item pendente da lista
3. Se score ≥ **0.75** → marca automaticamente
4. Se 0.45–0.75 → sugere: *"Marcar 'pão de forma' como comprado?"*
5. Abaixo → não sugere

O limiar é alto de propósito. **Falso positivo aqui irrita muito mais que falso
negativo** — marcar o item errado como comprado faz o usuário sair do mercado sem
o produto.

No backend, a mesma busca usa `pg_trgm` com `unaccent` (ver `03-MODELO-DADOS.md`).

---

## 9. Estratégia de testes

| Nível | O que cobre | Ferramenta |
|---|---|---|
| Unidade | `resolvePrice`, normalização, cada regex, cada regra de validação | Jest, TS puro |
| **Gabarito** | Parser completo contra `fixtures/`: N fotos + JSON esperado | Jest + snapshot |
| Integração | Pipeline E1→E6 com imagem real | Jest + imagem em disco |
| Device | Latência e memória em aparelho real | Manual, Laboratório |

### O gabarito é o ativo mais valioso

```
app/fixtures/
├── labels/
│   ├── bahamas_gondola_001.jpg
│   ├── bahamas_gondola_001.expected.json
│   ├── bahamas_gondola_001.mlkit.raw.json      ← saída bruta do OCR
│   └── bahamas_gondola_001.cloudvision.raw.json
└── index.json
```

Guardar o **texto bruto** de cada motor permite re-testar mudanças no parser em
segundos, sem câmera e sem ir ao mercado. Guardar a **foto** permite avaliar um
motor novo retroativamente sobre todos os casos já coletados.

**Nenhuma alteração no parser é aceita se derrubar a acurácia do gabarito.**
Isso vira gate no CI.

---

## 10. Casos de teste obrigatórios

Derivados diretamente das 13 fotos analisadas. Todos devem passar antes do MVP.

| # | Caso | Espera-se |
|---|---|---|
| T1 | Vinagre (B) | base 299 · tiers `[3→279, 24→259, card 1→259]` · measure 398/L |
| T2 | Dove (B) | base 1998 · tiers `[3→1968, 12→1948, card 1→1948]` |
| T3 | Papel Alumínio (B) | base 929 · tiers `[3→799, 25→699]` |
| T4 | Lâmpada 20W (B) | base 939 · tier único `[3→819]` · card `1→819` |
| T5 | Azeitona (A) | base 499 · previous 629 · UN · measure 4158/KG · EAN preenchido |
| T6 | Pão de Forma (A) | base 499 · previous 599 · UN |
| T7 | Cobertura Garoto (A) | base 8190 · previous 9190 · UN |
| T8 | Coxa Sobrecoxa (C) | base 789 · **KG** · nome em `weakFields` |
| T9 | Asa de Frango (C) | base 1399 · **KG** |
| T10 | Coração Alcatra (D) | base 4990 · previous 5490 · **KG** · sem EAN |
| **T11** | **Vinagre com armadilha** | `measurePrice` **nunca** vira `basePriceCents` |
| **T12** | **Azeitona com armadilha** | `R$ 52,41` (preço/kg) **nunca** vira preço de venda |
| **T13** | **Preço riscado** | `previousPriceCents` **nunca** entra em `resolvePrice` |
| **T14** | **Foto com 2 etiquetas** | Retorna apenas a enquadrada, ou confiança baixa |

Os casos T11–T14 são os que protegem contra as armadilhas identificadas na
análise. São os testes mais importantes da suíte.
