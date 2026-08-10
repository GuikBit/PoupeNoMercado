/**
 * Hierarquia do teto de gasto (ajuste pedido em 10/08/2026).
 *
 * O teto pertence à LISTA. A compra iniciada por ela herda o valor; a compra
 * rápida, sem lista, não tem teto. Ter os dois lugares definindo a mesma coisa
 * era o que confundia a navegação.
 */
import { createTestDb, type TestDb } from '../db/testDb';
import { resetListStore, useListStore } from './listStore';
import { resetTripStore, useTripStore } from './tripStore';

let t: TestDb;
const listas = () => useListStore.getState();
const compra = () => useTripStore.getState();

beforeEach(() => {
  resetListStore();
  resetTripStore();
  t = createTestDb();
  listas().attach(t.ctx);
  compra().attach(t.ctx);
});
afterEach(() => t.close());

describe('a compra herda o teto da lista', () => {
  it('inicia com o teto definido na lista', () => {
    const lista = listas().create('Mensal')!;
    listas().setBudget(lista.id, 20_000);
    const atualizada = listas().lists[0]!;

    compra().start({ listId: lista.id, budgetCents: atualizada.budgetCents });

    expect(compra().trip?.budgetCents).toBe(20_000);
    expect(compra().budget.limitCents).toBe(20_000);
    expect(compra().budget.state).toBe('ok');
  });

  it('lista sem teto gera compra sem teto — e sem alarme falso', () => {
    const lista = listas().create('Feira')!;
    compra().start({ listId: lista.id, budgetCents: lista.budgetCents });

    expect(compra().trip?.budgetCents).toBeNull();
    expect(compra().budget.limitCents).toBeNull();
    expect(compra().budget.state).toBe('ok');
  });

  it('compra rápida não tem teto', () => {
    compra().start({ budgetCents: null });
    expect(compra().trip?.budgetCents).toBeNull();
    expect(compra().trip?.listId).toBeNull();
  });

  it('o teto herdado governa o alarme do orçamento', () => {
    const lista = listas().create('Mensal')!;
    listas().setBudget(lista.id, 900);
    compra().start({ listId: lista.id, budgetCents: listas().lists[0]!.budgetCents });

    compra().addItem({
      rawName: 'VINAGRE',
      policy: { basePriceCents: 299, saleUnit: 'UN', tiers: [] },
      qty: 3,
      entryMode: 'scan',
    });

    // 3 × 2,99 = 8,97 sobre teto de 9,00 → 99,7%
    expect(compra().budget.state).toBe('warning');
  });

  it('mudar o teto da lista depois NÃO mexe na compra já iniciada', () => {
    const lista = listas().create('Mensal')!;
    listas().setBudget(lista.id, 10_000);
    compra().start({ listId: lista.id, budgetCents: listas().lists[0]!.budgetCents });

    listas().setBudget(lista.id, 50_000);
    compra().reload();

    // A compra guarda o teto do momento em que começou — mudar a lista no meio
    // da compra não pode reescrever o combinado.
    expect(compra().trip?.budgetCents).toBe(10_000);
  });
});
