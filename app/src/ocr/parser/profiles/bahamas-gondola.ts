/**
 * Perfil Tipo B — gôndola de atacarejo. O mais elaborado e o mais importante:
 * contém até seis valores em reais e as faixas de quantidade.
 * Estratégias: docs/02-MOTOR-RECONHECIMENTO.md §6.5.
 *
 * ⚠️ Erro clássico a evitar: "NESTA EMBALAGEM 1LT R$ 3,98" fica fisicamente
 * entre o preço base e as faixas. A âncora NESTA EMBALAGEM é testada ANTES de
 * qualquer busca genérica por dinheiro.
 */
import type { PriceTier, PricingPolicy } from '../../../domain/pricing';
import { candidatesBelow, type PositionedText } from '../anchor';
import { moneyMatchToCents, RE } from '../patterns';
import {
  extractDateIso,
  extractInternalCode,
  extractMoneyCents,
  extractName,
  isMeasureLine,
  saleUnitFromName,
} from './helpers';
import type { Extraction, ExtractionContext, Extractor } from './types';

/** Faixa do cartão usa a fraseologia "A PARTIR DE 1 UNID." — não é faixa comum. */
function isCardTierText(text: string): boolean {
  return /A\s*PARTIR\s*DE\s*\d+\s*UNID/.test(text);
}

function extractBasePrice(items: PositionedText[]): {
  cents: number | null;
  anchor: PositionedText | null;
} {
  // Âncora "DE R$ ... A UNIDADE", nunca numa linha de medida.
  const candidates = items.filter(
    (i) => /\bDE\s*R?\$/.test(i.text) && !isMeasureLine(i.text) && !RE.TIER.test(i.text),
  );
  // Preferir a linha que confirma "A UNIDADE" (validação da spec).
  const sorted = [...candidates].sort(
    (a, b) => Number(RE.PER_UNIT.test(b.text)) - Number(RE.PER_UNIT.test(a.text)),
  );
  for (const anchor of sorted) {
    const cents = extractMoneyCents(anchor.text);
    if (cents !== null) return { cents, anchor };
  }
  return { cents: null, anchor: null };
}

function extractTiers(
  items: PositionedText[],
  used: PositionedText[],
): PriceTier[] {
  const tiers: PriceTier[] = [];
  for (const item of items) {
    const m = RE.TIER.exec(item.text);
    if (!m || m[1] === undefined) continue;
    if (isCardTierText(item.text) || RE.STORE_CARD.test(item.text)) continue;

    const minQty = Number(m[1]);
    // Preço da faixa: primeiro dinheiro ABAIXO da âncora, dentro de 0.25 da
    // altura da imagem, ignorando linhas de medida.
    const below = candidatesBelow(items, item.box, 0.25).filter((c) => !isMeasureLine(c.text));
    for (const candidate of below) {
      const cents = extractMoneyCents(candidate.text);
      if (cents !== null) {
        tiers.push({ minQty, priceCents: cents, condition: { kind: 'none' } });
        used.push(item, candidate);
        break;
      }
    }
  }
  return tiers.sort((a, b) => a.minQty - b.minQty);
}

function extractCardTier(
  items: PositionedText[],
  used: PositionedText[],
): PriceTier | null {
  const cardAnchor = items.find((i) => RE.STORE_CARD.test(i.text));
  if (!cardAnchor) return null;

  // A região do cartão: a própria âncora e o que está logo abaixo dela.
  const region = [cardAnchor, ...candidatesBelow(items, cardAnchor.box, 0.3)].filter(
    (c) => !isMeasureLine(c.text),
  );

  let minQty = 1;
  let priceCents: number | null = null;
  for (const item of region) {
    const qtyMatch = /A\s*PARTIR\s*DE\s*(\d+)\s*UNID/.exec(item.text);
    if (qtyMatch && qtyMatch[1] !== undefined) {
      minQty = Number(qtyMatch[1]);
      used.push(item);
    }
    if (priceCents === null) {
      const cents = extractMoneyCents(item.text);
      if (cents !== null) {
        priceCents = cents;
        used.push(item);
      }
    }
  }

  if (priceCents === null) return null;
  return { minQty, priceCents, condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' } };
}

function extractMeasure(items: PositionedText[]): PricingPolicy['measurePrice'] {
  const sorted = [...items].sort((a, b) => a.box.y - b.box.y);
  for (const item of sorted) {
    const m = RE.MEASURE.exec(item.text);
    if (m && m[1] !== undefined && m[2] !== undefined && m[3] !== undefined && m[4] !== undefined) {
      const unit = m[2] === 'LT' || m[2] === 'L' ? 'L' : m[2] === 'MT' || m[2] === 'M' ? 'M' : 'KG';
      return {
        perAmount: Number(m[1]),
        unit,
        valueCents: moneyMatchToCents(m[3], m[4]),
      };
    }
  }
  return undefined;
}

export const extractGondola: Extractor = (ctx: ExtractionContext): Extraction => {
  const { items } = ctx;
  const used: PositionedText[] = [];
  const weakFields: string[] = [];

  const base = extractBasePrice(items);
  if (base.anchor) used.push(base.anchor);

  const { name, used: nameItems } = extractName(items, {
    aboveY: base.anchor ? base.anchor.box.y : 0.4,
    maxLines: 1,
  });
  used.push(...nameItems);
  if (!name) weakFields.push('rawName');

  if (base.cents === null) {
    return { rawName: name, pricing: null, weakFields, usedItems: used };
  }

  const tiers = extractTiers(items, used);
  const cardTier = extractCardTier(items, used);
  if (cardTier) tiers.push(cardTier);

  let savingsCents: number | undefined;
  for (const item of items) {
    const s = RE.SAVINGS.exec(item.text);
    if (s && s[1] !== undefined && s[2] !== undefined) {
      savingsCents = moneyMatchToCents(s[1], s[2]);
      break;
    }
  }

  const pricing: PricingPolicy = {
    basePriceCents: base.cents,
    tiers,
    saleUnit: saleUnitFromName(name),
    measurePrice: extractMeasure(items),
    savingsCents,
  };

  return {
    rawName: name,
    pricing,
    internalCode: extractInternalCode(items),
    labelDate: extractDateIso(items),
    weakFields,
    usedItems: used,
  };
};
