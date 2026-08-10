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
import { candidatesBelow, candidatesRightOf, type PositionedText } from '../anchor';
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

/**
 * Faixa do cartão usa a fraseologia abreviada "A PARTIR DE 1 UNID." — não é
 * faixa comum.
 *
 * ⚠️ O lookahead é essencial: o cartaz escreve a faixa NORMAL como
 * "A PARTIR DE 3 UNIDADES PAGUE". Sem `(?!ADE)` essa linha era classificada
 * como faixa de cartão e descartada, perdendo a faixa inteira.
 */
const CARD_QTY = /A\s*PARTIR\s*DE\s*(\d+)\s*UNID(?!ADE)/;

function isCardTierText(text: string): boolean {
  return CARD_QTY.test(text);
}

/**
 * Texto a partir da âncora do cartão. O OCR funde a linha do cartão com a de
 * medida num bloco só ("NESTA EMBALAGEM 1KG R$ 478,00 OU NO BAHAMAS CRED a
 * partir de 1 unid. R$ 2,39") — descartar o bloco por ser linha de medida
 * jogava fora a faixa do cartão junto.
 */
function cardTextAfterAnchor(text: string): string {
  const m = RE.STORE_CARD.exec(text);
  return m ? text.slice(m.index) : text;
}

/** "DE R$" com as corrupções comuns do OCR ("DE BS", "DE RS", "DE B$"). */
const BASE_FROM = /\bDE\s*(R\s?\$|B\$|[RB]S\b)/;
/** Variante "COMPRANDO 1 R$ 6,49 A UNIDADE" vista em campo. */
const BASE_COMPRANDO = /\bCOMPRANDO\s*1\b/;

/**
 * Preço truncado pelo OCR: o separador sobreviveu mas a parte inteira sumiu
 * ("De R$ ,99 a Unidade", "POR: R$ .49"). O ML Kit erra assim justamente no
 * dígito em fonte grande.
 *
 * Quando isso acontece na linha da âncora, a busca espacial encontraria o
 * preço da FAIXA e o devolveria como preço base — errado e plausível, que é o
 * pior tipo de erro. Melhor abster (princípio nº 5).
 */
const TRUNCATED_PRICE = /(?:R\$|\s|^)\s*[,.]\d{2}(?!\d)/;

/**
 * Dinheiro do preço base numa linha, cortando a parte de medida quando o OCR
 * funde "DE R$ 19,98 A UNIDADE" com "NESTA EMBALAGEM 1KG R$ 55,50" na mesma
 * linha — descartar a linha inteira jogaria fora o base junto.
 */
function basePriceFromText(text: string): number | null {
  const prefix = text.split(/NESTA\s+EMBAL/)[0] ?? '';
  if (prefix.trim().length === 0) return null;
  return extractMoneyCents(prefix);
}

function extractBasePrice(items: PositionedText[]): {
  cents: number | null;
  anchor: PositionedText | null;
} {
  // Âncoras candidatas: "DE R$", "A UNIDADE" (fuzzy) ou "COMPRANDO 1" —
  // nunca uma linha de faixa ou do cartão.
  const candidates = items.filter(
    (i) =>
      (BASE_FROM.test(i.text) || RE.PER_UNIT.test(i.text) || BASE_COMPRANDO.test(i.text)) &&
      !RE.TIER.test(i.text) &&
      !RE.STORE_CARD.test(i.text),
  );
  // Preferir a linha que confirma "A UNIDADE" (validação da spec).
  const sorted = [...candidates].sort(
    (a, b) => Number(RE.PER_UNIT.test(b.text)) - Number(RE.PER_UNIT.test(a.text)),
  );
  for (const anchor of sorted) {
    const cents = basePriceFromText(anchor.text);
    if (cents !== null) return { cents, anchor };
  }
  // Âncora com preço truncado: o dígito grande se perdeu no OCR. Não procurar
  // outro valor — o que estiver por perto é a faixa, não o base.
  if (sorted.some((a) => TRUNCATED_PRICE.test(a.text))) {
    return { cents: null, anchor: null };
  }

  // Âncora sem valor na própria linha (OCR quebrou "DE R$" / "9,29 A UNIDADE"
  // em linhas separadas): busca espacial à direita e abaixo.
  for (const anchor of sorted) {
    // Tolerância de "mesma linha" proporcional à altura da âncora: um valor
    // absoluto (0.04) só serve para texto pequeno. Em "COMPRANDO 1 R$" com
    // 0.16 de altura, o preço ao lado ficava fora da tolerância e também fora
    // da busca "abaixo" (por sobrepor a âncora) — um ponto cego geométrico.
    const lineTolerance = Math.max(0.04, anchor.box.h * 0.6);
    const near = [
      ...candidatesRightOf(items, anchor.box, 0.6, lineTolerance),
      ...candidatesBelow(items, anchor.box, 0.2),
    ].filter((c) => !RE.TIER.test(c.text) && !RE.STORE_CARD.test(c.text));
    for (const candidate of near) {
      const cents = basePriceFromText(candidate.text);
      if (cents !== null) return { cents, anchor };
    }
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
    // O OCR às vezes junta faixa e preço na mesma linha ("A PARTIR DE 3 R$ 19,68").
    // MONEY exige centavos, então o "3" da quantidade nunca é confundido com preço.
    const sameLine = extractMoneyCents(item.text);
    if (sameLine !== null) {
      tiers.push({ minQty, priceCents: sameLine, condition: { kind: 'none' } });
      used.push(item);
      continue;
    }
    // Senão: primeiro dinheiro ABAIXO da âncora, dentro de 0.25 da altura da
    // imagem, ignorando linhas de medida.
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

  // A região do cartão: a própria âncora (cortada no "BAHAMAS CRED", para
  // sobreviver à fusão com a linha de medida) e o que está logo abaixo dela.
  const region = [
    { ...cardAnchor, text: cardTextAfterAnchor(cardAnchor.text) },
    ...candidatesBelow(items, cardAnchor.box, 0.3).filter((c) => !isMeasureLine(c.text)),
  ];

  let minQty = 1;
  let priceCents: number | null = null;
  for (const item of region) {
    const qtyMatch = CARD_QTY.exec(item.text);
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
