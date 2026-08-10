import type { PricingPolicy } from '../../domain/pricing';
import { createTestDb, type TestDb } from '../testDb';
import { duplicateTripAsList } from './duplicateTrip';
import { itemsOfList } from './listRepo';
import { addTripItem, finishTrip, startTrip } from './tripRepo';

const VINAGRE: PricingPolicy = { basePriceCents: 299, saleUnit: 'UN', tiers: [] };
const CARNE: PricingPolicy = { basePriceCents: 4990, saleUnit: 'KG', tiers: [] };

let t: TestDb;
beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

function compraCom(nomes: [string, PricingPolicy][]) {
  const trip = startTrip(t.ctx);
  for (const [nome, policy] of nomes) {
    addTripItem(t.ctx, trip.id, { rawName: nome, policy, qty: 1, entryMode: 'scan' });
  }
  finishTrip(t.ctx, trip.id);
  return trip;
}

describe('duplicateTripAsList', () => {
  it('cria uma lista com os produtos da compra', () => {
    const trip = compraCom([
      ['VINAGRE DE ALCOOL PEIXE 750ML', VINAGRE],
      ['CORACAO ALCATRA KG', CARNE],
    ]);

    const r = duplicateTripAsList(t.ctx, trip.id, 'Mensal de novo');
    expect(r.itemCount).toBe(2);
    expect(itemsOfList(t.db, r.list.id).map((i) => i.name)).toEqual([
      'VINAGRE DE ALCOOL PEIXE 750ML',
      'CORACAO ALCATRA KG',
    ]);
  });

  it('NÃO carrega preço — preço de mês passado não é preço de hoje', () => {
    const trip = compraCom([['VINAGRE 750ML', VINAGRE]]);
    const r = duplicateTripAsList(t.ctx, trip.id, 'Repetir');

    const item = itemsOfList(t.db, r.list.id)[0];
    // A lista guarda o que comprar, não quanto custava.
    expect(item).not.toHaveProperty('unitPriceCents');
    expect(Object.keys(item ?? {})).not.toContain('pricingPolicy');
  });

  it('preserva a unidade de venda, que não envelhece', () => {
    const trip = compraCom([['CORACAO ALCATRA KG', CARNE]]);
    const r = duplicateTripAsList(t.ctx, trip.id, 'Repetir');
    expect(itemsOfList(t.db, r.list.id)[0]?.unit).toBe('KG');
  });

  it('nome repetido entra uma vez só', () => {
    const trip = startTrip(t.ctx);
    for (const nome of ['VINAGRE 750ML', 'VINAGRE  750 ML', 'ARROZ 5KG']) {
      addTripItem(t.ctx, trip.id, { rawName: nome, policy: VINAGRE, qty: 1, entryMode: 'scan' });
    }
    finishTrip(t.ctx, trip.id);

    const r = duplicateTripAsList(t.ctx, trip.id, 'Repetir');
    expect(r.itemCount).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it('compra sem itens gera lista vazia, não erro', () => {
    const trip = startTrip(t.ctx);
    finishTrip(t.ctx, trip.id);
    const r = duplicateTripAsList(t.ctx, trip.id, 'Vazia');
    expect(r.itemCount).toBe(0);
    expect(itemsOfList(t.db, r.list.id)).toHaveLength(0);
  });
});
