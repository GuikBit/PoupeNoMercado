/**
 * Rascunho editável do gabarito (campos texto da UI) e sua conversão pura
 * para GroundTruth — anotado no mercado, olhando a etiqueta física.
 */
import type { PriceTier, SaleUnit } from '../domain/pricing';
import type { LabelReading } from '../domain/reading';
import { parseCents } from '../lib/money';
import type { GroundTruth } from './types';

/** Nome do cartão da rede — única condição de faixa vista nas 13 etiquetas. */
export const STORE_CARD_NAME = 'BAHAMAS CRED';

export interface TierDraft {
  minQty: string;
  price: string;
  storeCard: boolean;
}

export interface GroundTruthDraft {
  rawName: string;
  basePrice: string;
  saleUnit: SaleUnit;
  internalCode: string;
  tiers: TierDraft[];
}

export const EMPTY_DRAFT: GroundTruthDraft = {
  rawName: '',
  basePrice: '',
  saleUnit: 'UN',
  internalCode: '',
  tiers: [],
};

/** 299 → "2,99" — formato de digitação do formulário (sem "R$"). */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Pré-preenche o rascunho com a leitura de um motor — acelera a anotação,
 * mas o usuário DEVE conferir na etiqueta física antes de salvar.
 */
export function readingToDraft(reading: LabelReading): GroundTruthDraft {
  return {
    rawName: reading.product.rawName,
    basePrice: centsToInput(reading.pricing.basePriceCents),
    saleUnit: reading.pricing.saleUnit,
    internalCode: reading.product.internalCode ?? '',
    tiers: reading.pricing.tiers.map((tier) => ({
      minQty: String(tier.minQty),
      price: centsToInput(tier.priceCents),
      storeCard: tier.condition.kind === 'storeCard',
    })),
  };
}

/** Aceita "R$ 2,99", "2,99", "2.99" e inteiro em reais ("3" → 300). */
export function parsePriceInput(text: string): number | null {
  const cleaned = text.replace(/R\$\s*/i, '').trim();
  if (cleaned.length === 0) return null;
  if (/^\d{1,6}$/.test(cleaned)) {
    return Number(cleaned) * 100;
  }
  return parseCents(cleaned);
}

/**
 * Converte o rascunho em GroundTruth. Devolve null quando o essencial
 * (nome + preço base) está ausente ou inválido — melhor sem gabarito do
 * que com gabarito errado.
 */
export function draftToGroundTruth(draft: GroundTruthDraft): GroundTruth | null {
  const rawName = draft.rawName.trim();
  const basePriceCents = parsePriceInput(draft.basePrice);
  if (rawName.length === 0 || basePriceCents === null) {
    return null;
  }

  const tiers: PriceTier[] = [];
  for (const tier of draft.tiers) {
    if (tier.minQty.trim() === '' && tier.price.trim() === '') continue; // linha vazia
    const minQty = Number(tier.minQty.trim());
    const priceCents = parsePriceInput(tier.price);
    if (!Number.isInteger(minQty) || minQty <= 0 || priceCents === null) {
      return null; // faixa preenchida pela metade é gabarito inválido
    }
    tiers.push({
      minQty,
      priceCents,
      condition: tier.storeCard ? { kind: 'storeCard', cardName: STORE_CARD_NAME } : { kind: 'none' },
    });
  }
  tiers.sort((a, b) => a.minQty - b.minQty);

  const internalCode = draft.internalCode.trim();
  return {
    rawName,
    pricing: {
      basePriceCents,
      tiers,
      saleUnit: draft.saleUnit,
    },
    ...(internalCode.length > 0 ? { internalCode } : {}),
  };
}
