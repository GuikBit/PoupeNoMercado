/**
 * Normalização de texto de OCR. Especificação: docs/02-MOTOR-RECONHECIMENTO.md §6.1.
 *
 * Ordem: caixa alta → unaccent → colapso de espaços → correções de confusão
 * SOMENTE em contexto numérico → normalização do separador decimal.
 *
 * ⚠️ As correções de confusão nunca são aplicadas a palavras sem dígitos —
 * senão POTE viraria P0TE.
 */

const CONFUSION: Record<string, string> = {
  O: '0',
  I: '1',
  '|': '1',
  S: '5',
  B: '8',
  Z: '2',
};

/** Caracteres admissíveis num token "numérico" (preço, código, quantidade). */
const NUMERIC_TOKEN = /^[R$]{0,2}[0-9OIL|SBZ,.]+$/;

function fixToken(token: string): string {
  if (!NUMERIC_TOKEN.test(token) || !/\d/.test(token)) {
    return token;
  }
  let out = '';
  for (let i = 0; i < token.length; i++) {
    const ch = token[i] as string;
    const mapped = CONFUSION[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else if (ch === 'L') {
      // "L" só vira "1" entre dígitos ("4L7") — "1L" de litro fica intacto.
      const prev = token[i - 1] ?? '';
      const next = token[i + 1] ?? '';
      out += /\d/.test(prev) && /\d/.test(next) ? '1' : ch;
    } else {
      out += ch;
    }
  }
  return out;
}

export function normalizeText(raw: string): string {
  let t = raw.toUpperCase();
  // Remoção de acentos (unaccent)
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Colapso de espaços múltiplos
  t = t.replace(/\s+/g, ' ').trim();
  // Correções de confusão do OCR, por token, apenas em contexto numérico
  t = t
    .split(' ')
    .map((token) => fixToken(token))
    .join(' ');
  // Separador decimal: "." → "," quando seguido de exatamente 2 dígitos finais
  t = t.replace(/(\d)\.(\d{2})(?!\d)/g, '$1,$2');
  return t;
}
