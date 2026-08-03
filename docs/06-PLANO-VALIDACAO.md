# 06 — Plano de Validação: Laboratório de Etiquetas ⭐

> **Executar antes do MVP.** Este plano existe para responder, com dados, a
> pergunta que determina a viabilidade do produto: *o OCR on-device lê etiqueta
> de supermercado brasileiro com precisão suficiente?*

---

## 1. Por que antes e não durante

O MVP leva 2–3 meses. Se o motor de OCR falhar no Tipo C, essa descoberta
chegaria no mês 3 — com listas, carrinho, orçamento e sincronização já
construídos sobre uma premissa errada.

**O risco mais caro do projeto estaria sendo descoberto o mais tarde possível.**

O Laboratório inverte isso: ~1 semana de trabalho, resposta definitiva, e
**nenhuma linha jogada fora** — a câmera, o detector, a interface `OcrEngine`,
o parser e o gabarito vão inteiros para o MVP.

---

## 2. A pergunta a responder

> Entre ML Kit (on-device) e Google Cloud Vision (referência), qual lê as
> etiquetas do Bahamas Mix com acurácia suficiente para sustentar um app de
> controle de gastos — e a que custo de latência?

### Papel de cada motor

| Motor | Papel |
|---|---|
| **ML Kit** | Candidato titular. Offline, gratuito, sem custo marginal |
| **Cloud Vision** | **Teto de referência.** Mede quanto se perde por ser offline |
| Apple Vision | **Adiado** — sem hardware iOS. Ver §8 |

O Cloud Vision provavelmente não vai para produção (viola o RNF-01), mas como
régua é indispensável: se o ML Kit fizer 93% e a nuvem 94%, a discussão acabou.
Se fizer 71% contra 95%, existe um problema real a resolver.

---

## 3. O aplicativo Laboratório

Tela única. Sem lista, sem carrinho, sem backend, sem login.

```
┌─────────────────────────────────────┐
│  ◉ Câmera ao vivo                   │
│  ○ Importar da galeria              │  ← reprocessa casos salvos
├─────────────────────────────────────┤
│                                     │
│      [ preview + guia visual ]      │
│                                     │
├─────────────────────────────────────┤
│  ☑ ML Kit          312 ms           │
│  ☑ Cloud Vision    890 ms           │
├─────────────────────────────────────┤
│  RESULTADO                          │
│  ML Kit    R$  7,79   conf 0.88  ✓  │
│  Cloud     R$  7,79   conf 0.95  ✓  │
│  ─────────────────────────────────  │
│  Gabarito  R$  7,79    [ editar ]   │
├─────────────────────────────────────┤
│  Melhor:  ○ ML Kit  ○ Cloud  ○ nenhum│
│  Obs: [________________________]    │
│                                     │
│         [ SALVAR CASO ]             │
└─────────────────────────────────────┘
```

### Regras de implementação

1. **Um único bitmap** alimenta todos os motores. Entrada idêntica é o que torna
   a comparação legítima — diferença medida é do motor, não da captura.
2. **O mesmo parser** roda sobre a saída de todos. Estamos comparando motores,
   não parsers.
3. **Salvar tudo:** foto original, texto bruto de cada motor, resultado parseado
   de cada motor, gabarito, veredito humano, latências.
4. **Modo importar** é requisito, não extra — é o que permite reprocessar sem
   voltar ao mercado.

### Estrutura do caso salvo

```jsonc
{
  "id": "0192f3a1-...",
  "captured_at": "2026-08-05T14:32:10Z",
  "image_path": "cases/0192f3a1.jpg",
  "label_type": "bahamas_gondola",
  "capture_conditions": {
    "lighting": "normal",        // normal|dim|glare
    "angle": "oblique",          // frontal|oblique|steep
    "condition": "flat"          // flat|curved|creased|behind_glass
  },
  "engines": {
    "mlkit": {
      "latency_ms": 312,
      "ocr_raw": [ /* OcrBlock[] */ ],
      "parsed": { /* LabelReading */ },
      "confidence": 0.88
    },
    "cloudvision": { }
  },
  "ground_truth": {
    "raw_name": "VINAGRE DE ALCOOL PEIXE 750ML",
    "base_price_cents": 299,
    "tiers": [
      { "min_qty": 3,  "price_cents": 279, "condition": { "kind": "none" } },
      { "min_qty": 24, "price_cents": 259, "condition": { "kind": "none" } }
    ],
    "sale_unit": "UN",
    "measure_price": { "value_cents": 398, "unit": "L", "per_amount": 1 },
    "internal_code": "25421"
  },
  "human_verdict": {
    "best_engine": "mlkit",
    "note": "Cloud pegou o 3,98 do preço/litro como preço base"
  }
}
```

---

## 4. Protocolo de coleta

### Amostra alvo: 60 casos

| Tipo | Casos | Justificativa |
|---|---|---|
| A — Oferta | 15 | Comum; tem a armadilha do preço/kg |
| **B — Gôndola** | **20** | **O mais importante — tem as faixas** |
| **C — Perecível** | **15** | **O mais difícil — impressão degradada** |
| D — Cartaz | 5 | Menos frequente |
| **Adversariais** | **5** | Ver abaixo |

Sobre-representar C é deliberado: é onde a falha é provável, e é justamente
carne e frios — os itens de maior valor unitário na compra.

### Casos adversariais (obrigatórios)

| # | Cenário |
|---|---|
| ADV-1 | Duas etiquetas visíveis no quadro |
| ADV-2 | Reflexo forte no plástico protetor |
| ADV-3 | Etiqueta amassada ou curvada |
| ADV-4 | Foto de baixo para cima, ângulo acentuado (prateleira alta) |
| ADV-5 | Pouca luz (corredor de freezer) |

Estes definem o comportamento em degradação. Um motor que **erra sabendo que
errou** é aceitável; um que erra com convicção não é.

### Roteiro de campo

```
Antes de sair
  □ App instalado, chave do Cloud Vision configurada
  □ Bateria cheia, ≥ 2 GB livres
  □ Testar 3 capturas em casa (não descobrir bug no mercado)

No mercado (~45 min)
  □ Percorrer seções: mercearia, limpeza, frios/açougue, bazar, hortifruti
  □ Para cada etiqueta:
      1. Enquadrar no guia
      2. Capturar
      3. Conferir o gabarito na hora, olhando a etiqueta física
      4. Dar o veredito humano
      5. Salvar
  □ Cumprir a cota por tipo, não pegar só as fáceis
  □ Registrar os 5 adversariais deliberadamente

Depois
  □ Exportar o JSON + pasta de imagens
  □ Copiar para app/fixtures/
  □ Rodar o script de análise
```

> **Regra crítica:** anotar o gabarito **no mercado, olhando a etiqueta real**.
> Anotar depois, pela foto, contamina o gabarito com os mesmos erros de leitura
> que estamos tentando medir.

---

## 5. Métricas

### Definidas antes do teste — deliberadamente

Sem critério pré-definido, "validar na prática" vira "achei o ML Kit meio
melhor" — decisão por sensação, exatamente o que o Laboratório existe para
evitar.

| # | Métrica | Definição | Meta |
|---|---|---|---|
| M1 | **Acurácia de preço** | `base_price_cents` exatamente igual ao gabarito | **≥ 95%** (tipos A, B) |
| M2 | **Acurácia de faixas** | Conjunto de tiers idêntico | **≥ 90%** (tipo B) |
| M3 | **⚠️ Erro confiante** | Errado **E** `confidence ≥ 0.85` | **≤ 1%** |
| M4 | Acurácia de unidade | `sale_unit` correto | ≥ 98% |
| M5 | Similaridade de nome | Trigrama contra o gabarito | ≥ 0.85 média |
| M6 | Latência p50 / p95 | Fim a fim, no device | p95 ≤ 800 ms |
| M7 | Cobertura de abstenção | Dos casos errados, % com `confidence < 0.60` | ≥ 70% |

### M3 é a métrica que decide

Um motor que erra 15% mas **sabe** que está inseguro é superior a um que erra 6%
com convicção. No primeiro caso o app pede confirmação; no segundo ele soma
R$ 499,00 silenciosamente e destrói a única coisa que o produto vende.

M7 é a face positiva da mesma ideia: **calibração**. Queremos que o erro venha
acompanhado de dúvida.

### Segmentação obrigatória

Toda métrica é reportada **por tipo de etiqueta**. A média agregada mente: um
motor com 85% geral pode ter 96% no Tipo B e 41% no Tipo C — e 41% em açougue é
inaceitável, porque é o item mais caro da compra.

---

## 6. Critérios de decisão

Fixados **antes** de olhar os resultados.

### Cenário 1 — ML Kit atinge as metas

```
M1 ≥ 95% (A,B)  E  M3 ≤ 1%  E  M6 p95 ≤ 800 ms
```
→ **ML Kit é o titular.** Cloud Vision fica desabilitado. Segue para o MVP.

### Cenário 2 — ML Kit próximo, com falha localizada

```
ML Kit atinge as metas em A, B, D — mas M1 < 85% no Tipo C
```
→ **ML Kit é o titular assim mesmo.** O Tipo C tem poucos campos (só o preço) e
`internal_code` para identificar o produto. Ação: melhorar o pré-processamento
(binarização adaptativa, upscale) e reforçar o perfil `bahamas_perecivel`.
**Não** é motivo para trocar de motor.

### Cenário 3 — Diferença grande para o Cloud Vision

```
Cloud Vision supera o ML Kit em > 15 pontos percentuais em M1
```
→ Investigar antes de decidir. Rodar o Cloud Vision sobre o **texto bruto** do
ML Kit para separar as causas:
- Se o parser estiver deixando informação na mesa → **o problema é o parser**,
  não o motor. Corrigir o parser.
- Se o texto do ML Kit estiver genuinamente pior → escalar para o Cenário 4.

### Cenário 4 — ML Kit reprovado

```
M1 < 85% nos tipos A e B, mesmo após ajuste de pré-processamento e parser
```
→ Escalar, nesta ordem:
1. **PaddleOCR mobile via ONNX** (Apache 2.0, 100% próprio, treinável) — 3–4 semanas
2. **Modelo multimodal (VLM)** como fallback de baixa confiança — ~R$ 0,40/usuário/mês
3. Reposicionar o produto para entrada manual assistida, com escaneamento como
   auxílio e não como núcleo

### Cenário 5 — Todos reprovados

Ambos abaixo de 85% em A e B → **a premissa do produto está errada como
concebida.** Pivotar para código de barras + entrada manual de preço, ou
reconsiderar o projeto. É desconfortável, mas é exatamente para isso que o
Laboratório existe: descobrir isso na semana 1 e não no mês 3.

---

## 7. Análise dos resultados

Script `app/scripts/analyze-lab.ts` gera:

```
═══════════════════════════════════════════════════════════
 LABORATÓRIO DE ETIQUETAS — 60 casos — 2026-08-05
═══════════════════════════════════════════════════════════

M1 · ACURÁCIA DE PREÇO
                    ML Kit      Cloud Vision
  Tipo A (15)       93,3%   ✗     100,0%   ✓
  Tipo B (20)       95,0%   ✓      95,0%   ✓
  Tipo C (15)       66,7%   ✗      86,7%   ✗
  Tipo D (5)       100,0%   ✓     100,0%   ✓
  ─────────────────────────────────────────
  A+B (meta 95%)    94,3%   ✗      97,1%   ✓

M2 · FAIXAS (Tipo B)      90,0% ✓      85,0% ✗
M3 · ERRO CONFIANTE        1,7% ✗       0,0% ✓   ← crítico
M6 · LATÊNCIA p95          341ms ✓     1120ms ✗
M7 · COBERTURA ABSTENÇÃO  76,5% ✓      71,4% ✓

VEREDITO HUMANO
  ML Kit  32 · Cloud  21 · nenhum  7

CASOS COM ERRO CONFIANTE  (revisar manualmente)
  #017 mlkit  esperado 789   obteve 7891   conf 0.91
  ...
═══════════════════════════════════════════════════════════
```

### Análise qualitativa obrigatória

Números não bastam. Revise manualmente:

1. **Todos os casos de erro confiante** — há padrão? É falha do OCR ou do parser?
2. **Casos onde os motores discordam** — quem estava certo e por quê?
3. **Casos onde o veredito humano contraria a métrica** — geralmente revela uma
   dimensão de qualidade que a métrica não captura
4. **Todos os adversariais** — o comportamento em degradação foi seguro?

---

## 8. Apple Vision — plano diferido

Sem hardware iOS disponível. Duas rotas quando fizer sentido:

| | Atalhos do iOS | TestFlight |
|---|---|---|
| Custo | R$ 0 | ~R$ 540/ano (Apple Developer) |
| Instalação | Nenhuma | App via TestFlight |
| Dados | Só texto corrido | Texto + caixas + confiança + latência |
| Roda o parser | ❌ | ✅ |
| Serve para | Triagem | Decisão |

**Rota gratuita:** enviar as 60 fotos a um conhecido com iPhone. Ele monta um
Atalho de 3 blocos (`Obter imagens` → `Extrair texto da imagem` → `Salvar em
arquivo`) e devolve um `.txt`. A ação nativa usa o próprio framework Vision.

Responde: *"o Apple Vision lê o Tipo C onde o ML Kit falha?"*
Não responde: coordenadas, confiança, latência — portanto o parser não roda.

**Apple Vision não está no caminho crítico.** O Brasil é ~85% Android, e o ML Kit
também roda no iOS. É uma otimização futura de plataforma, não um bloqueio.

---

## 9. Entregáveis

| # | Entregável | Destino |
|---|---|---|
| 1 | App Laboratório funcionando | `app/src/lab/` |
| 2 | 60 casos com foto + OCR bruto + gabarito | `app/fixtures/labels/` |
| 3 | Relatório de análise | `docs/resultados/lab-YYYY-MM-DD.md` |
| 4 | **Decisão do motor, registrada como ADR** | `docs/01-ARQUITETURA.md` (atualizar ADR-002) |
| 5 | Lista priorizada de ajustes no parser | Issues no repositório |
| 6 | Baseline de acurácia para o gate de CI | `app/fixtures/baseline.json` |

O entregável **2** é o mais valioso do projeto inteiro. Ele permite:

- Testar qualquer motor futuro sem voltar ao mercado
- Validar toda mudança no parser em segundos
- Impedir regressão silenciosa via gate de CI

---

## 10. Cronograma

| Dia | Atividade |
|---|---|
| 1 | Setup: Expo prebuild, VisionCamera, permissões |
| 2 | Adaptador ML Kit + adaptador Cloud Vision |
| 3 | Detector de etiqueta (OpenCV) + guia visual |
| 4 | Parser v1: perfis B e C (os mais críticos) |
| 5 | Parser v1: perfis A e D + validações |
| 6 | Tela de comparação, gabarito, veredito, persistência, export |
| 7 | **Coleta em campo** (~45 min) + análise |
| 8 | Relatório, decisão, ajustes prioritários no parser |

**~1,5 semana até uma decisão fundamentada** — contra 3 meses para descobrir o
mesmo no meio do MVP.
