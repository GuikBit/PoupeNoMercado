/**
 * Similaridade por trigrama — a mesma ideia do `pg_trgm` do PostgreSQL, para
 * que o casamento no app e a busca no backend concordem (docs/03).
 *
 * Vive no domínio porque tanto o casamento com a lista (matching.ts) quanto as
 * métricas do Laboratório dependem dela.
 */

/** Trigramas por palavra, com padding — mesma convenção do pg_trgm. */
function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  const words = text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0);
  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      grams.add(padded.slice(i, i + 3));
    }
  }
  return grams;
}

/** Jaccard sobre os conjuntos de trigramas. 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  let shared = 0;
  for (const g of ga) {
    if (gb.has(g)) shared++;
  }
  const union = ga.size + gb.size - shared;
  return union === 0 ? 0 : shared / union;
}
