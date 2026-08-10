/**
 * Perfis Tipo A (oferta promocional) e Tipo D (cartaz de açougue).
 * Ambos usam a estrutura DE:/POR:; o cartaz não tem preço por medida e o
 * barcode codifica o código INTERNO — nunca popular `ean` no Tipo D.
 * Estratégias: docs/02-MOTOR-RECONHECIMENTO.md §6.5.
 */
import type { PricingPolicy, SaleUnit } from '../../../domain/pricing';
import type { PositionedText } from '../anchor';
import { moneyMatchToCents, RE } from '../patterns';
import {
  extractDateIso,
  extractEan,
  extractInternalCode,
  extractMoneyCents,
  extractName,
} from './helpers';
import type { Extraction, ExtractionContext, Extractor } from './types';

const MONEY_LOOSE_TEXT = RE.MONEY_LOOSE;

function findAnchorItem(items: PositionedText[], pattern: RegExp): PositionedText | undefined {
  return items.find((i) => pattern.test(i.text));
}

/**
 * Preço base do DE/POR: o bloco de MAIOR ÁREA abaixo da âncora POR: que
 * contenha dinheiro — nunca uma linha de preço/kg (armadilha do R$ 52,41).
 *
 * ⚠️ "Abaixo" é medido pelo CENTRO vertical do candidato, não pelo topo da
 * caixa. O preço em destaque é várias vezes mais alto que a linha "POR: R$",
 * então o topo dele fica ACIMA do topo da âncora mesmo estando visualmente
 * abaixo — comparar topo com topo descartava justamente o preço certo.
 */
function extractBigPrice(
  items: PositionedText[],
  toAnchor: PositionedText,
): { item: PositionedText; cents: number; saleUnit: SaleUnit | null } | null {
  const candidates = items
    .filter((i) => i !== toAnchor && i.box.y + i.box.h / 2 >= toAnchor.box.y)
    .filter((i) => !RE.MEASURE_PRICE_LABEL.test(i.text) && !RE.FROM.test(i.text))
    .filter((i) => !RE.DATE.test(i.text))
    .filter((i) => MONEY_LOOSE_TEXT.test(i.text))
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);

  const item = candidates[0];
  if (!item) return null;
  const m = MONEY_LOOSE_TEXT.exec(item.text);
  if (!m || m[1] === undefined || m[2] === undefined) return null;

  const unitMatch = RE.UNIT_SUFFIX.exec(item.text.slice(m.index + m[0].length));
  const saleUnit: SaleUnit | null =
    unitMatch?.[1] === 'KG' ? 'KG' : unitMatch?.[1] === 'UN' ? 'UN' : null;

  return { item, cents: moneyMatchToCents(m[1], m[2]), saleUnit };
}

/** Preço/KG: preferir a linha OFERTA; cair para REGULAR. */
function extractMeasureFromKgLines(items: PositionedText[]): PricingPolicy['measurePrice'] {
  const kgLines = items.filter((i) => RE.MEASURE_PRICE_LABEL.test(i.text));
  const preferred =
    kgLines.find((i) => /OFERTA/.test(i.text)) ?? kgLines.find((i) => /REGULAR/.test(i.text));
  if (!preferred) return undefined;
  const cents = extractMoneyCents(preferred.text);
  if (cents === null) return undefined;
  const unitMatch = RE.MEASURE_PRICE_LABEL.exec(preferred.text);
  return {
    valueCents: cents,
    unit: unitMatch?.[1] === 'L' ? 'L' : 'KG',
    perAmount: 1,
  };
}

function extractDePor(ctx: ExtractionContext, variant: 'oferta' | 'cartaz'): Extraction {
  const { items } = ctx;
  const used: PositionedText[] = [];
  const weakFields: string[] = [];

  const fromAnchor = findAnchorItem(items, RE.FROM);
  const toAnchor = findAnchorItem(items, RE.TO);

  // Nome: blocos entre o topo (banner) e a âncora DE:, até 2 linhas.
  const { name, used: nameItems } = extractName(items, {
    aboveY: fromAnchor ? fromAnchor.box.y : 0.4,
    maxLines: 2,
  });
  used.push(...nameItems);
  if (!name) weakFields.push('rawName');

  // Preço riscado — informativo, NUNCA entra no cálculo (T13).
  let previousPriceCents: number | undefined;
  if (fromAnchor) {
    const cents = extractMoneyCents(fromAnchor.text);
    if (cents !== null) {
      previousPriceCents = cents;
      used.push(fromAnchor);
    }
  }

  if (!toAnchor) {
    return { rawName: name, pricing: null, weakFields, usedItems: used };
  }
  used.push(toAnchor);

  const big = extractBigPrice(items, toAnchor);
  if (!big) {
    return { rawName: name, pricing: null, weakFields, usedItems: used };
  }
  used.push(big.item);

  const nameSaysKg = /\bKG\b/.test(name);
  const saleUnit: SaleUnit = big.saleUnit ?? (nameSaysKg ? 'KG' : 'UN');

  const pricing: PricingPolicy = {
    basePriceCents: big.cents,
    previousPriceCents,
    tiers: [], // Tipos A e D não têm faixas.
    saleUnit,
    measurePrice: variant === 'oferta' ? extractMeasureFromKgLines(items) : undefined,
  };

  return {
    rawName: name,
    pricing,
    internalCode: extractInternalCode(items),
    // Tipo D: o barcode é o código interno — nunca EAN.
    ean: variant === 'oferta' ? extractEan(items) : undefined,
    labelDate: extractDateIso(items),
    weakFields,
    usedItems: used,
  };
}

export const extractOferta: Extractor = (ctx) => extractDePor(ctx, 'oferta');
export const extractCartaz: Extractor = (ctx) => extractDePor(ctx, 'cartaz');
