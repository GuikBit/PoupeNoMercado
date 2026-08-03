import { itemTotalCents, type PricingPolicy, resolvePrice } from './pricing';

/** Política do Vinagre — exemplo canônico de docs/02-MOTOR-RECONHECIMENTO.md §5. */
const vinagre: PricingPolicy = {
  basePriceCents: 299,
  tiers: [
    { minQty: 3, priceCents: 279, condition: { kind: 'none' } },
    { minQty: 24, priceCents: 259, condition: { kind: 'none' } },
    { minQty: 1, priceCents: 259, condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' } },
  ],
  saleUnit: 'UN',
  measurePrice: { valueCents: 398, unit: 'L', perAmount: 1 },
};

describe('resolvePrice — Vinagre (exemplo canônico)', () => {
  it('qty 1 sem cartão → preço base, próxima faixa em 3 economiza R$ 0,60', () => {
    const r = resolvePrice(vinagre, 1, false);
    expect(r.unitPriceCents).toBe(299);
    expect(r.appliedTier).toBeNull();
    expect(r.nextTier?.tier.minQty).toBe(3);
    expect(r.nextTier?.qtyNeeded).toBe(2);
    expect(r.nextTier?.savingsCents).toBe(60);
  });

  it('qty 2 sem cartão → ainda preço base', () => {
    expect(resolvePrice(vinagre, 2, false).unitPriceCents).toBe(299);
  });

  it('qty 3 sem cartão → faixa de 3, próxima em 24', () => {
    const r = resolvePrice(vinagre, 3, false);
    expect(r.unitPriceCents).toBe(279);
    expect(r.appliedTier?.minQty).toBe(3);
    expect(r.nextTier?.tier.minQty).toBe(24);
    expect(r.nextTier?.qtyNeeded).toBe(21);
  });

  it('qty 23 sem cartão → ainda faixa de 3', () => {
    expect(resolvePrice(vinagre, 23, false).unitPriceCents).toBe(279);
  });

  it('qty 24 sem cartão → faixa de 24, sem próxima', () => {
    const r = resolvePrice(vinagre, 24, false);
    expect(r.unitPriceCents).toBe(259);
    expect(r.nextTier).toBeNull();
  });

  it('qty 1 COM cartão → faixa condicional de 1 unidade', () => {
    const r = resolvePrice(vinagre, 1, true);
    expect(r.unitPriceCents).toBe(259);
    expect(r.appliedTier?.condition.kind).toBe('storeCard');
    // Já está no menor preço — nenhuma faixa futura melhora.
    expect(r.nextTier).toBeNull();
  });

  it('faixa de cartão é ignorada sem o cartão', () => {
    const r = resolvePrice(vinagre, 1, false);
    expect(r.unitPriceCents).toBe(299);
  });

  it('rejeita quantidade não positiva', () => {
    expect(() => resolvePrice(vinagre, 0, false)).toThrow();
  });
});

describe('resolvePrice — previousPriceCents nunca entra no cálculo (T13)', () => {
  it('política com preço riscado usa somente o base', () => {
    const azeitona: PricingPolicy = {
      basePriceCents: 499,
      previousPriceCents: 629,
      tiers: [],
      saleUnit: 'UN',
    };
    expect(resolvePrice(azeitona, 1, false).unitPriceCents).toBe(499);
    expect(resolvePrice(azeitona, 10, true).unitPriceCents).toBe(499);
  });
});

describe('itemTotalCents', () => {
  it('UN: total exato, inteiro', () => {
    expect(itemTotalCents(299, 'UN', 3)).toBe(897);
  });

  it('UN: rejeita quantidade fracionária', () => {
    expect(() => itemTotalCents(299, 'UN', 1.5)).toThrow();
  });

  it('KG: arredonda o TOTAL, meio para cima', () => {
    // 0,635 kg × R$ 49,90 = R$ 31,6865 → R$ 31,69
    expect(itemTotalCents(4990, 'KG', 0.635)).toBe(3169);
    // 0,5 kg × R$ 7,89 = R$ 3,945 → R$ 3,95 (meio para cima)
    expect(itemTotalCents(789, 'KG', 0.5)).toBe(395);
  });

  it('KG: peso 1 não é tratado como "1 pacote" — é 1 kg', () => {
    expect(itemTotalCents(4990, 'KG', 1)).toBe(4990);
  });
});
