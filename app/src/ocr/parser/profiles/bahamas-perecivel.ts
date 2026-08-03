/**
 * Perfil Tipo C — perecível simples. O tipo mais difícil: impressão matricial
 * degradada, nome frequentemente irrecuperável. A estratégia é priorizar o
 * CÓDIGO INTERNO para lookup em catálogo e aceitar o nome como sugestão fraca.
 * Estratégias: docs/02-MOTOR-RECONHECIMENTO.md §6.5.
 */
import type { PricingPolicy } from '../../../domain/pricing';
import type { PositionedText } from '../anchor';
import { RE } from '../patterns';
import { extractDateIso, extractInternalCode, extractMoneyCents, isNoiseLine } from './helpers';
import type { Extraction, ExtractionContext, Extractor } from './types';

export const extractPerecivel: Extractor = (ctx: ExtractionContext): Extraction => {
  const { items } = ctx;
  const used: PositionedText[] = [];
  // O nome do Tipo C é SEMPRE campo fraco (§6.5).
  const weakFields: string[] = ['rawName'];

  // Nome: primeira linha de texto (a mais ao topo que não é ruído nem preço).
  const nameItem = [...items]
    .filter((i) => !isNoiseLine(i.text) && !RE.MONEY.test(i.text) && /[A-Z]{2,}/.test(i.text))
    .sort((a, b) => a.box.y - b.box.y)[0];
  const name = nameItem?.text ?? '';
  if (nameItem) used.push(nameItem);

  // Preço: o único MONEY da imagem.
  const moneyItems = items.filter((i) => RE.MONEY.test(i.text));
  const priceItem = moneyItems[0];
  const cents = priceItem ? extractMoneyCents(priceItem.text) : null;
  if (priceItem) used.push(priceItem);

  if (cents === null) {
    return { rawName: name, pricing: null, weakFields, usedItems: used };
  }

  const pricing: PricingPolicy = {
    basePriceCents: cents,
    tiers: [],
    saleUnit: /\bKG\b/.test(name) ? 'KG' : 'UN',
  };

  return {
    rawName: name,
    pricing,
    internalCode: extractInternalCode(items),
    labelDate: extractDateIso(items),
    weakFields,
    usedItems: used,
    // Mais de um preço na imagem contradiz a assinatura do tipo — penaliza.
    extraPenalty: moneyItems.length > 1 ? 0.2 : 0,
  };
};
