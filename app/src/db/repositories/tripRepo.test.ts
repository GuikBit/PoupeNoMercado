/**
 * Testes do carrinho persistido, com SQL real em memória.
 *
 * O que se protege aqui é o acoplamento entre domínio e banco: o preço gravado
 * é snapshot DERIVADO, e mudar a quantidade tem de re-resolver a faixa.
 * Guardar um preço unitário congelado pareceria funcionar e daria total errado.
 */
import { sql } from 'drizzle-orm';

import type { PricingPolicy } from '../../domain/pricing';
import { pendingOutbox } from '../outbox';
import { createTestDb, type TestDb } from '../testDb';
import {
  abandonTrip,
  activeTrip,
  addTripItem,
  allActiveTrips,
  finishTrip,
  getTrip,
  itemsOfTrip,
  removeTripItem,
  repairActiveTrips,
  setTripItemQty,
  setUseStoreCard,
  startTrip,
} from './tripRepo';

const VINAGRE: PricingPolicy = {
  basePriceCents: 299,
  saleUnit: 'UN',
  tiers: [
    { minQty: 3, priceCents: 279, condition: { kind: 'none' } },
    { minQty: 1, priceCents: 259, condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' } },
  ],
};

const CARNE: PricingPolicy = { basePriceCents: 4990, saleUnit: 'KG', tiers: [] };

let t: TestDb;
beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

describe('compra e itens', () => {
  it('começa uma compra ativa com total zero', () => {
    const trip = startTrip(t.ctx, { budgetCents: 10_000 });
    expect(trip.status).toBe('active');
    expect(trip.totalCents).toBe(0);
    expect(activeTrip(t.db)?.id).toBe(trip.id);
  });

  it('adiciona item resolvendo o preço pela política', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE DE ALCOOL PEIXE 750ML',
      policy: VINAGRE,
      qty: 2,
      entryMode: 'scan',
    });

    expect(item.unitPriceCents).toBe(299);
    expect(item.totalCents).toBe(598);
    expect(item.normalizedName).toBe('VINAGRE DE ALCOOL PEIXE');
    expect(getTrip(t.db, trip.id)?.totalCents).toBe(598);
  });

  it('mudar a quantidade RE-RESOLVE a faixa, não reaproveita o preço gravado', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 2,
      entryMode: 'scan',
    });
    expect(item.unitPriceCents).toBe(299);

    const updated = setTripItemQty(t.ctx, item.id, 3);
    expect(updated.unitPriceCents).toBe(279);
    expect(updated.totalCents).toBe(837);
    expect(getTrip(t.db, trip.id)?.totalCents).toBe(837);
  });

  it('voltar a quantidade devolve o preço base', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 3,
      entryMode: 'scan',
    });
    expect(item.unitPriceCents).toBe(279);
    expect(setTripItemQty(t.ctx, item.id, 1).unitPriceCents).toBe(299);
  });

  it('item por peso guarda decimal e arredonda só o total', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'CORACAO ALCATRA KG',
      policy: CARNE,
      qty: 0.734,
      entryMode: 'manual',
    });
    expect(item.qty).toBeCloseTo(0.734);
    expect(item.totalCents).toBe(3663);
  });

  it('remover item é exclusão lógica e atualiza o total', () => {
    const trip = startTrip(t.ctx);
    const a = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 1,
      entryMode: 'scan',
    });
    addTripItem(t.ctx, trip.id, {
      rawName: 'CARNE KG',
      policy: CARNE,
      qty: 1,
      entryMode: 'scan',
    });
    expect(getTrip(t.db, trip.id)?.totalCents).toBe(299 + 4990);

    const removed = removeTripItem(t.ctx, a.id);
    expect(removed.deletedAt).not.toBeNull();
    expect(itemsOfTrip(t.db, trip.id)).toHaveLength(1);
    expect(getTrip(t.db, trip.id)?.totalCents).toBe(4990);
  });

  it('ligar o cartão reprecifica a compra inteira', () => {
    const trip = startTrip(t.ctx);
    addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 2,
      entryMode: 'scan',
    });
    expect(getTrip(t.db, trip.id)?.totalCents).toBe(598);

    const updated = setUseStoreCard(t.ctx, trip.id, true);
    expect(updated.totalCents).toBe(518); // 2 × 2,59
    expect(itemsOfTrip(t.db, trip.id)[0]?.unitPriceCents).toBe(259);
  });

  it('item adicionado depois de ligar o cartão já entra com o preço do cartão', () => {
    const trip = startTrip(t.ctx, { useStoreCard: true });
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 1,
      entryMode: 'scan',
    });
    expect(item.unitPriceCents).toBe(259);
  });

  it('recusa abrir uma segunda compra com uma já ativa', () => {
    startTrip(t.ctx);
    // Duas compras ativas deixavam o app preso: activeTrip devolvia sempre uma
    // delas e a outra ficava invisível para sempre.
    expect(() => startTrip(t.ctx)).toThrow(/já existe uma compra/i);
  });

  it('permite nova compra depois de finalizar a anterior', () => {
    const primeira = startTrip(t.ctx);
    finishTrip(t.ctx, primeira.id);
    const segunda = startTrip(t.ctx);
    expect(activeTrip(t.db)?.id).toBe(segunda.id);
  });

  it('abandonar libera para começar outra', () => {
    const primeira = startTrip(t.ctx);
    abandonTrip(t.ctx, primeira.id);
    expect(activeTrip(t.db)).toBeNull();
    expect(() => startTrip(t.ctx)).not.toThrow();
  });

  it('finalizar tira a compra da lista de ativas', () => {
    const trip = startTrip(t.ctx);
    finishTrip(t.ctx, trip.id);
    expect(activeTrip(t.db)).toBeNull();
    expect(getTrip(t.db, trip.id)?.status).toBe('finished');
  });

  it('recusa mexer em item inexistente', () => {
    expect(() => setTripItemQty(t.ctx, 'nao-existe', 1)).toThrow(/não encontrado/i);
  });
});

describe('reparo de compras ativas duplicadas', () => {
  /**
   * Recria o estado quebrado que existia ANTES da guarda em `startTrip`.
   * Precisa ser SQL cru justamente porque a guarda agora impede chegar nele
   * pelo caminho normal — o que é o comportamento desejado.
   */
  function criarDuplicadas(quantas: number) {
    const ids: string[] = [];
    for (let i = 0; i < quantas; i++) {
      const id = `dup-${i}`;
      const startedAt = 1_770_000_000_000 + i * 1000;
      ids.push(id);
      t.ctx.db.run(sql`
        INSERT INTO shopping_trip
          (id, status, use_store_card, started_at, total_cents, created_at, updated_at, device_id)
        VALUES (${id}, 'active', 0, ${startedAt}, 0, ${startedAt}, ${startedAt}, 'device-test')
      `);
    }
    return ids;
  }

  it('mantém a mais recente e abandona as outras', () => {
    const ids = criarDuplicadas(3);
    expect(allActiveTrips(t.db)).toHaveLength(3);

    expect(repairActiveTrips(t.ctx)).toBe(2);

    const restantes = allActiveTrips(t.db);
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.id).toBe(ids[2]);
    expect(activeTrip(t.db)?.id).toBe(ids[2]);
  });

  it('não faz nada quando já está correto', () => {
    startTrip(t.ctx);
    expect(repairActiveTrips(t.ctx)).toBe(0);
  });

  it('não faz nada com banco vazio', () => {
    expect(repairActiveTrips(t.ctx)).toBe(0);
  });

  it('o abandono entra no outbox — a limpeza precisa sincronizar', () => {
    criarDuplicadas(2);
    const antes = pendingOutbox(t.db, 500).length;
    repairActiveTrips(t.ctx);
    expect(pendingOutbox(t.db, 500).length).toBeGreaterThan(antes);
  });
});

describe('outbox', () => {
  it('enfileira toda mutação, na ordem', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 1,
      entryMode: 'scan',
    });
    setTripItemQty(t.ctx, item.id, 3);

    const fila = pendingOutbox(t.db);
    expect(fila.map((e) => [e.entity, e.op])).toEqual([
      ['shopping_trip', 'upsert'],
      ['trip_item', 'upsert'],
      ['trip_item', 'upsert'],
    ]);
    expect(fila.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('o payload carrega o estado completo depois da mutação', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 3,
      entryMode: 'scan',
    });

    const ultimo = pendingOutbox(t.db).at(-1);
    expect(ultimo?.entityId).toBe(item.id);
    expect(ultimo?.payload).toMatchObject({ unitPriceCents: 279, totalCents: 837 });
  });

  it('exclusão entra na fila como delete', () => {
    const trip = startTrip(t.ctx);
    const item = addTripItem(t.ctx, trip.id, {
      rawName: 'VINAGRE',
      policy: VINAGRE,
      qty: 1,
      entryMode: 'scan',
    });
    removeTripItem(t.ctx, item.id);
    expect(pendingOutbox(t.db).at(-1)?.op).toBe('delete');
  });

  it('mutação que falha não deixa entrada órfã na fila', () => {
    const antes = pendingOutbox(t.db).length;
    expect(() =>
      addTripItem(t.ctx, 'compra-inexistente', {
        rawName: 'X',
        policy: VINAGRE,
        qty: 1,
        entryMode: 'scan',
      }),
    ).toThrow(/não encontrada/i);
    expect(pendingOutbox(t.db)).toHaveLength(antes);
  });
});
