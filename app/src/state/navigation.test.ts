/**
 * Regressões de navegação relatadas no teste em casa (10/08/2026):
 * "a tela de compra em andamento fica voltando toda hora" e "não consigo ir
 * para a home criar listas".
 *
 * A causa não era layout: duas compras ativas conviviam e `activeTrip`
 * devolvia sempre a mais antiga, prendendo o app numa compra que não saía
 * da tela.
 */
import { createTestDb, type TestDb } from '../db/testDb';
import { resetTripStore, useTripStore } from './tripStore';

let t: TestDb;
const store = () => useTripStore.getState();

beforeEach(() => {
  resetTripStore();
  t = createTestDb();
  store().attach(t.ctx);
});
afterEach(() => t.close());

describe('só existe uma compra ativa', () => {
  it('iniciar com uma compra aberta RETOMA em vez de criar outra', () => {
    const primeira = store().start({ budgetCents: 5000 });
    const segunda = store().start({ budgetCents: 9999 });

    expect(segunda?.id).toBe(primeira?.id);
    // O teto da segunda tentativa é ignorado: a compra aberta manda.
    expect(store().trip?.budgetCents).toBe(5000);
  });

  it('a compra mostrada é sempre a mais recente depois de finalizar', () => {
    const primeira = store().start();
    store().finish();
    const segunda = store().start();

    expect(segunda?.id).not.toBe(primeira?.id);
    expect(store().trip?.id).toBe(segunda?.id);
  });

  it('abandonar libera o app e permite começar outra', () => {
    const primeira = store().start();
    store().abandon();
    expect(store().trip).toBeNull();

    const segunda = store().start();
    expect(segunda?.id).not.toBe(primeira?.id);
    expect(store().trip?.id).toBe(segunda?.id);
  });

  it('abandonar sem compra aberta não quebra', () => {
    expect(() => store().abandon()).not.toThrow();
  });

  it('abandonada não reaparece como ativa', () => {
    store().start();
    store().addItem({
      rawName: 'VINAGRE',
      policy: { basePriceCents: 299, saleUnit: 'UN', tiers: [] },
      qty: 1,
      entryMode: 'scan',
    });
    store().abandon();

    store().reload();
    expect(store().trip).toBeNull();
    expect(store().lines).toHaveLength(0);
  });

  it('finalizar limpa o desfazer, para não remover item de outra compra', () => {
    store().start();
    store().addItem({
      rawName: 'VINAGRE',
      policy: { basePriceCents: 299, saleUnit: 'UN', tiers: [] },
      qty: 1,
      entryMode: 'scan',
    });
    store().abandon();
    expect(store().lastAddedId).toBeNull();
  });
});
