/**
 * Fallback genérico — sempre casa, nunca com convicção.
 * Teto de confiança 0.55: jamais aceita automaticamente (§6.5).
 */
import type { PricingPolicy } from '../../../domain/pricing';
import type { PositionedText } from '../anchor';
import { RE } from '../patterns';
import { extractMoneyCents, isMeasureLine, isNoiseLine } from './helpers';
import type { Extraction, ExtractionContext, Extractor } from './types';

export const GENERIC_CONFIDENCE_CAP = 0.55;

export const extractGeneric: Extractor = (ctx: ExtractionContext): Extraction => {
  const { items } = ctx;
  const used: PositionedText[] = [];
  const weakFields: string[] = ['rawName', 'basePriceCents'];

  // Preço: MONEY no bloco de maior área, penalizando ambiguidade.
  const moneyItems = items
    .filter((i) => RE.MONEY.test(i.text) && !isMeasureLine(i.text))
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const priceItem = moneyItems[0];
  const cents = priceItem ? extractMoneyCents(priceItem.text) : null;
  if (priceItem) used.push(priceItem);

  // Nome: bloco superior mais largo.
  const nameItem = [...items]
    .filter((i) => !isNoiseLine(i.text) && !RE.MONEY.test(i.text) && /[A-Z]{3,}/.test(i.text))
    .filter((i) => i.box.y < 0.5)
    .sort((a, b) => b.box.w - a.box.w)[0];
  if (nameItem) used.push(nameItem);

  if (cents === null) {
    return {
      rawName: nameItem?.text ?? '',
      pricing: null,
      weakFields,
      usedItems: used,
      confidenceCap: GENERIC_CONFIDENCE_CAP,
    };
  }

  const pricing: PricingPolicy = {
    basePriceCents: cents,
    tiers: [],
    saleUnit: 'UN',
  };

  return {
    rawName: nameItem?.text ?? '',
    pricing,
    weakFields,
    usedItems: used,
    extraPenalty: moneyItems.length > 1 ? 0.15 : 0,
    confidenceCap: GENERIC_CONFIDENCE_CAP,
  };
};
