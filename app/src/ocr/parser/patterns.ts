/**
 * Padrões regex reutilizáveis do parser.
 * Especificação: docs/02-MOTOR-RECONHECIMENTO.md §6.3 — seguir literalmente.
 * Aplicados sempre sobre texto já normalizado (ver normalize.ts).
 */
export const RE = {
  MONEY: /R?\$?\s*(\d{1,4})[,.](\d{2})\b/,
  MONEY_LOOSE: /(\d{1,4})[,.](\d{2})\b/,
  DATE: /\b(\d{2})\/(\d{2})\/(\d{2,4})\b/,
  INTERNAL: /\bC[OÓ]D\.?\s*(\d{4,8})\b/,
  EAN13: /\b(\d{13})\b/,
  TIER: /A\s*PARTIR\s*DE\s*(\d{1,3})/,
  UNIT_SUFFIX: /\b(KG|UN|LT|L|ML|G|MT|M)\b/,
  MEASURE: /NESTA\s+EMBALAGEM\s+(\d+)\s*(KG|LT|L|MT|M|G|ML)\s*R?\$?\s*(\d+)[,.](\d{2})/,
  // "DAHAMAS" é confusão comum de OCR para "BAHAMAS".
  STORE_CARD: /[BD]AHAMAS\s*CRED/,
  SAVINGS: /ECONOMIZE\s*R?\$?\s*(\d+)[,.](\d{2})/,
  FROM: /\bDE\s*:?\s*R\s?\$/,
  TO: /\bPOR\s*:?\s*R\s?\$/,
  // Fuzzy: OCR lê "A UNIDADE" como "A IIUIDADE", "A LIMIDADE" etc. —
  // qualquer palavra curta terminada em DADE após "A" conta como âncora.
  PER_UNIT: /\bA\s*[A-Z]{1,6}DADE\b/,
  MEASURE_PRICE_LABEL: /PRE[CÇ]O\s*\/\s*(KG|L)/,
} as const;

/** Converte um match de MONEY/MONEY_LOOSE em centavos. */
export function moneyMatchToCents(reais: string, centavos: string): number {
  return Number(reais) * 100 + Number(centavos);
}
