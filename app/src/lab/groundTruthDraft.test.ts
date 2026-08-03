import {
  draftToGroundTruth,
  EMPTY_DRAFT,
  parsePriceInput,
  STORE_CARD_NAME,
} from './groundTruthDraft';

describe('parsePriceInput', () => {
  it('aceita as formas comuns de digitação', () => {
    expect(parsePriceInput('2,99')).toBe(299);
    expect(parsePriceInput('2.99')).toBe(299);
    expect(parsePriceInput('R$ 2,99')).toBe(299);
    expect(parsePriceInput('3')).toBe(300);
  });

  it('rejeita entrada inválida', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('abc')).toBeNull();
    expect(parsePriceInput('2,9')).toBeNull();
  });
});

describe('draftToGroundTruth', () => {
  it('converte o caso Vinagre completo (docs/06 §3)', () => {
    const gt = draftToGroundTruth({
      rawName: 'VINAGRE DE ALCOOL PEIXE 750ML',
      basePrice: '2,99',
      saleUnit: 'UN',
      internalCode: '25421',
      tiers: [
        { minQty: '24', price: '2,59', storeCard: false },
        { minQty: '3', price: '2,79', storeCard: false },
        { minQty: '', price: '', storeCard: false }, // linha vazia é ignorada
      ],
    });
    expect(gt).not.toBeNull();
    expect(gt?.pricing.basePriceCents).toBe(299);
    expect(gt?.pricing.tiers.map((t) => t.minQty)).toEqual([3, 24]); // ordenadas
    expect(gt?.internalCode).toBe('25421');
  });

  it('faixa condicionada ao cartão da loja', () => {
    const gt = draftToGroundTruth({
      ...EMPTY_DRAFT,
      rawName: 'X',
      basePrice: '2,99',
      tiers: [{ minQty: '1', price: '2,59', storeCard: true }],
    });
    expect(gt?.pricing.tiers[0]?.condition).toEqual({
      kind: 'storeCard',
      cardName: STORE_CARD_NAME,
    });
  });

  it('sem nome ou preço base → null (melhor sem gabarito que errado)', () => {
    expect(draftToGroundTruth(EMPTY_DRAFT)).toBeNull();
    expect(draftToGroundTruth({ ...EMPTY_DRAFT, rawName: 'X' })).toBeNull();
    expect(draftToGroundTruth({ ...EMPTY_DRAFT, basePrice: '2,99' })).toBeNull();
  });

  it('faixa preenchida pela metade invalida o gabarito', () => {
    const gt = draftToGroundTruth({
      ...EMPTY_DRAFT,
      rawName: 'X',
      basePrice: '2,99',
      tiers: [{ minQty: '3', price: '', storeCard: false }],
    });
    expect(gt).toBeNull();
  });
});
