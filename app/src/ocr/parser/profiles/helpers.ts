/**
 * Utilitários compartilhados pelos perfis de extração.
 */
import type { SaleUnit } from '../../../domain/pricing';
import type { PositionedText } from '../anchor';
import { moneyMatchToCents, RE } from '../patterns';

/** Linha de preço por medida — a armadilha clássica. Nunca é preço de venda. */
export function isMeasureLine(text: string): boolean {
  return /NESTA\s+EMBAL/.test(text) || RE.MEASURE_PRICE_LABEL.test(text);
}

/** Ruído da etiqueta: datas, códigos, estoque interno ("Min 143"). */
export function isNoiseLine(text: string): boolean {
  const t = text.trim();
  return (
    RE.DATE.test(t) ||
    /^MIN\s*\d+$/.test(t) ||
    /^\d{4,13}$/.test(t) ||
    /^C[OÓ]D\.?\s*\d+$/.test(t)
  );
}

export function extractMoneyCents(text: string): number | null {
  const m = RE.MONEY.exec(text);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return moneyMatchToCents(m[1], m[2]);
}

/** dd/mm/yy(yy) → ISO 8601. Anos de 2 dígitos assumem 20xx. */
export function extractDateIso(items: PositionedText[]): string | undefined {
  for (const item of items) {
    const m = RE.DATE.exec(item.text);
    if (m && m[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${year}-${m[2]}-${m[1]}`;
    }
  }
  return undefined;
}

/**
 * Código interno: bloco numérico de 4–8 dígitos no quadrante superior direito
 * (abaixo da data), ou âncora "COD". EAN-13 (13 dígitos) não conta.
 */
export function extractInternalCode(items: PositionedText[]): string | undefined {
  for (const item of items) {
    const m = RE.INTERNAL.exec(item.text);
    if (m && m[1] !== undefined) return m[1];
  }
  const numeric = items.filter(
    (i) => /^\d{4,8}$/.test(i.text.trim()) && i.box.x > 0.5 && i.box.y < 0.5,
  );
  const first = numeric.sort((a, b) => a.box.y - b.box.y)[0];
  return first?.text.trim();
}

export function extractEan(items: PositionedText[]): string | undefined {
  for (const item of items) {
    const m = RE.EAN13.exec(item.text);
    if (m && m[1] !== undefined) return m[1];
  }
  return undefined;
}

export function saleUnitFromName(name: string): SaleUnit {
  return /\bKG\b\s*$/.test(name.trim()) || /\sKG\b/.test(name) ? 'KG' : 'UN';
}

/**
 * Nome do produto: itens mais ao topo que não são ruído, medida ou dinheiro.
 * Junta até `maxLines` linhas na ordem vertical.
 */
export function extractName(
  items: PositionedText[],
  opts: { belowY?: number; aboveY?: number; maxLines?: number } = {},
): { name: string; used: PositionedText[] } {
  const { belowY = 0, aboveY = 1, maxLines = 2 } = opts;
  const candidates = items
    .filter((i) => i.box.y >= belowY && i.box.y < aboveY)
    .filter((i) => !isNoiseLine(i.text) && !isMeasureLine(i.text) && !RE.MONEY.test(i.text))
    .filter((i) => !RE.TIER.test(i.text) && !RE.STORE_CARD.test(i.text) && !RE.SAVINGS.test(i.text))
    .filter((i) => /[A-Z]{3,}/.test(i.text))
    .sort((a, b) => a.box.y - b.box.y)
    .slice(0, maxLines);
  return { name: candidates.map((c) => c.text).join(' ').trim(), used: candidates };
}
