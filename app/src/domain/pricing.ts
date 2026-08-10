/**
 * Modelo de domínio de preço. Especificação: docs/02-MOTOR-RECONHECIMENTO.md §5.
 *
 * Princípio central: uma etiqueta não contém um preço, contém uma POLÍTICA de
 * preço. Toda função que lida com preço recebe PricingPolicy + quantidade.
 * Dinheiro é sempre inteiro em centavos.
 */

export type SaleUnit = 'UN' | 'KG' | 'L' | 'M';

export type PriceCondition =
  | { kind: 'none' }
  | { kind: 'storeCard'; cardName: string }; // "BAHAMAS CRED"

export interface PriceTier {
  /** Quantidade mínima para esta faixa valer. */
  minQty: number;
  priceCents: number;
  condition: PriceCondition;
}

export interface MeasurePrice {
  valueCents: number;
  unit: 'KG' | 'L' | 'M' | 'UN';
  /** Quantidade da unidade de medida. Ex: "1LT R$ 3,98" → 1 */
  perAmount: number;
}

export interface PricingPolicy {
  /** Preço de 1 unidade, sem condição. Sempre presente. */
  basePriceCents: number;
  /** "DE:" riscado. Informativo — NUNCA usado no cálculo. */
  previousPriceCents?: number;
  /** Ordenadas por minQty ascendente. */
  tiers: PriceTier[];
  saleUnit: SaleUnit;
  /** "NESTA EMBALAGEM 1LT R$ 3,98" — informativo, para comparação. */
  measurePrice?: MeasurePrice;
  savingsCents?: number;
}

export interface PriceResolution {
  unitPriceCents: number;
  appliedTier: PriceTier | null;
  /** Faixa seguinte e quanto falta para alcançá-la. Alimenta a dica de UI. */
  nextTier: { tier: PriceTier; qtyNeeded: number; savingsCents: number } | null;
}

function tierApplies(tier: PriceTier, useStoreCard: boolean): boolean {
  return tier.condition.kind !== 'storeCard' || useStoreCard;
}

/**
 * Resolve o preço unitário efetivo para uma quantidade.
 * Algoritmo (§5): entre as faixas aplicáveis com minQty <= qty, a de menor
 * preço; sem faixa aplicável, o preço base. `previousPriceCents` jamais entra.
 */
export function resolvePrice(
  policy: PricingPolicy,
  qty: number,
  useStoreCard: boolean,
): PriceResolution {
  if (qty <= 0) {
    throw new Error(`resolvePrice espera qty > 0, recebeu ${qty}`);
  }

  const applicable = policy.tiers.filter((t) => tierApplies(t, useStoreCard));

  let appliedTier: PriceTier | null = null;
  for (const tier of applicable) {
    if (tier.minQty <= qty && (appliedTier === null || tier.priceCents < appliedTier.priceCents)) {
      appliedTier = tier;
    }
  }
  const unitPriceCents = appliedTier ? appliedTier.priceCents : policy.basePriceCents;

  // Próxima faixa: menor minQty > qty entre as aplicáveis que ainda melhoram o preço.
  let next: PriceTier | null = null;
  for (const tier of applicable) {
    if (tier.minQty > qty && tier.priceCents < unitPriceCents) {
      if (next === null || tier.minQty < next.minQty) {
        next = tier;
      }
    }
  }

  return {
    unitPriceCents,
    appliedTier,
    nextTier: next
      ? {
          tier: next,
          qtyNeeded: next.minQty - qty,
          // Economia total ao atingir a faixa, comparada ao preço unitário atual.
          savingsCents: (unitPriceCents - next.priceCents) * next.minQty,
        }
      : null,
  };
}

/**
 * Total do item (§5):
 *   UN → unitPrice × qty (inteiro, exato)
 *   KG/L/M → round(unitPrice × peso), arredonda o TOTAL, meio-para-cima.
 * Nunca arredonde o preço unitário — só o total, como o caixa faz.
 */
export function itemTotalCents(
  unitPriceCents: number,
  saleUnit: SaleUnit,
  quantity: number,
): number {
  if (saleUnit === 'UN') {
    if (!Number.isInteger(quantity)) {
      throw new Error(`Item por unidade exige quantidade inteira, recebeu ${quantity}`);
    }
    return unitPriceCents * quantity;
  }
  return Math.round(unitPriceCents * quantity);
}

/**
 * Preço unitário e total efetivos de um item — resolver a faixa e somar são
 * uma coisa só, e o resultado precisa ser idêntico onde quer que apareça.
 *
 * Existe porque essa conta é a resposta à pergunta "quanto vou pagar por isto".
 * A tela de confirmação mostra o número e o repositório o grava; quando cada
 * uma fazia a sua conta, a confirmação chegou a anunciar o preço base numa
 * quantidade que já tinha atingido a faixa — prometia caro e cobrava barato,
 * mas seria igualmente fácil errar para o outro lado.
 */
export function priceSnapshot(
  policy: PricingPolicy,
  qty: number,
  useStoreCard: boolean,
): { unitPriceCents: number; totalCents: number; resolution: PriceResolution } {
  const resolution = resolvePrice(policy, qty, useStoreCard);
  return {
    unitPriceCents: resolution.unitPriceCents,
    totalCents: itemTotalCents(resolution.unitPriceCents, policy.saleUnit, qty),
    resolution,
  };
}
