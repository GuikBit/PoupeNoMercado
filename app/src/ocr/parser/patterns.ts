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
  STORE_CARD: /BAHAMAS\s*CRED/,
  SAVINGS: /ECONOMIZE\s*R?\$?\s*(\d+)[,.](\d{2})/,
  FROM: /\bDE\s*:?\s*R\$/,
  TO: /\bPOR\s*:?\s*R\$/,
  PER_UNIT: /A\s*UNIDADE/,
  MEASURE_PRICE_LABEL: /PRE[CÇ]O\s*\/\s*(KG|L)/,
} as const;

/** Converte um match de MONEY/MONEY_LOOSE em centavos. */
export function moneyMatchToCents(reais: string, centavos: string): number {
  return Number(reais) * 100 + Number(centavos);
}
