/**
 * Store da compra ativa, sobre SQL real em memória.
 *
 * O que se protege: o store é CACHE, e o banco é a autoridade. Cada ação tem
 * de deixar os dois de acordo — a classe de bug mais cara aqui é a tela
 * mostrar um total que o banco não tem.
 */
import { getTrip, setTripItemQty } from '../db/repositories/tripRepo';
import { createTestDb, type TestDb } from '../db/testDb';
import type { PricingPolicy } from '../domain/pricing';
import { resetTripStore, useTripStore } from './tripStore';

const VINAGRE: PricingPolicy = {
  basePriceCents: 299,
  saleUnit: 'UN',
  tiers: [
    { minQty: 3, priceCents: 279, condition: { kind: 'none' } },
    { minQty: 1, priceCents: 259, condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' } },
  ],
};

let t: TestDb;
const store = () => useTripStore.getState();

beforeEach(() => {
  resetTripStore();
  t = createTestDb();
  store().attach(t.ctx);
});
afterEach(() => t.close());

function addVinagre(qty: number) {
  return store().addItem({ rawName: 'VINAGRE 750ML', policy: VINAGRE, qty, entryMode: 'scan' });
}

describe('ciclo da compra', () => {
  it('começa sem compra ativa', () => {
    expect(store().trip).toBeNull();
    expect(store().lines).toHaveLength(0);
  });

  it('inicia a compra e a encontra ativa', () => {
    store().start({ budgetCents: 10_000 });
    expect(store().trip?.status).toBe('active');
    expect(store().budget.limitCents).toBe(10_000);
  });

  it('adicionar item atualiza total e orçamento', () => {
    store().start({ budgetCents: 1000 });
    addVinagre(2);
    expect(store().trip?.totalCents).toBe(598);
    expect(store().budget.state).toBe('ok');
    expect(store().budget.remainingCents).toBe(402);
  });

  it('não adiciona sem compra ativa', () => {
    expect(addVinagre(1)).toBeNull();
  });

  it('finalizar limpa o cache da compra ativa', () => {
    store().start();
    addVinagre(1);
    store().finish();
    expect(store().trip).toBeNull();
    expect(store().lines).toHaveLength(0);
  });
});

describe('faixa de quantidade', () => {
  it('mudar a quantidade reprecifica e reflete no total', () => {
    store().start();
    const item = addVinagre(2);
    expect(store().lines[0]?.row.unitPriceCents).toBe(299);

    store().setQty(item!.id, 3);
    expect(store().lines[0]?.row.unitPriceCents).toBe(279);
    expect(store().trip?.totalCents).toBe(837);
  });

  it('expõe a dica da próxima faixa', () => {
    store().start();
    addVinagre(1);
    expect(store().lines[0]?.hint).toEqual({
      qtyNeeded: 2,
      savingsPerUnitCents: 20,
      newUnitPriceCents: 279,
    });
  });

  it('a dica some quando não há mais faixa', () => {
    store().start({ useStoreCard: true });
    addVinagre(3);
    expect(store().lines[0]?.hint).toBeNull();
  });

  it('ligar o cartão reprecifica tudo', () => {
    store().start();
    addVinagre(2);
    expect(store().trip?.totalCents).toBe(598);

    store().toggleStoreCard();
    expect(store().trip?.useStoreCard).toBe(1);
    expect(store().trip?.totalCents).toBe(518);
  });
});

describe('desfazer', () => {
  it('remove o último item adicionado', () => {
    store().start();
    addVinagre(1);
    const segundo = store().addItem({
      rawName: 'CARNE KG',
      policy: { basePriceCents: 4990, saleUnit: 'KG', tiers: [] },
      qty: 1,
      entryMode: 'scan',
    });
    expect(store().lines).toHaveLength(2);

    store().undoLastAdd();
    expect(store().lines).toHaveLength(1);
    expect(store().lines.some((l) => l.row.id === segundo!.id)).toBe(false);
  });

  it('não faz nada sem item para desfazer', () => {
    store().start();
    expect(() => store().undoLastAdd()).not.toThrow();
    expect(store().lines).toHaveLength(0);
  });

  it('desfazer duas vezes não remove o item anterior por engano', () => {
    store().start();
    addVinagre(1);
    store().undoLastAdd();
    store().undoLastAdd();
    expect(store().lines).toHaveLength(0);
  });
});

describe('o banco é a autoridade', () => {
  it('o cache sempre bate com o que está gravado', () => {
    store().start({ budgetCents: 900 });
    const item = addVinagre(3);
    store().setQty(item!.id, 1);

    const gravado = getTrip(t.db, store().trip!.id);
    expect(store().trip?.totalCents).toBe(gravado?.totalCents);
    expect(store().budget.spentCents).toBe(gravado?.totalCents);
  });

  it('reload reflete mudança feita fora do store', () => {
    store().start();
    const item = addVinagre(1);

    setTripItemQty(t.ctx, item!.id, 3);
    expect(store().lines[0]?.row.qty).toBe(1); // cache ainda velho

    store().reload();
    expect(store().lines[0]?.row.qty).toBe(3);
  });
});
