/**
 * Compra ativa (carrinho) e seus itens.
 *
 * ⚠️ Ponto delicado: `unit_price_cents` e `total_cents` do item são **snapshot
 * derivado**, nunca autoridade. A autoridade é `pricing_policy` + `qty` + o
 * `use_store_card` da compra. Toda mudança de quantidade re-resolve pelo
 * domínio (`resolvePrice`), porque mudar a quantidade muda a FAIXA e portanto
 * reprecifica todas as unidades daquele item (princípio nº 2).
 *
 * O total da compra é desnormalizado (docs/03 §3) e recalculado dentro da
 * mesma transação de qualquer mutação de item — nunca fica velho.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { normalizeProductName } from '../../domain/matching';
import { priceSnapshot, type PricingPolicy, type SaleUnit } from '../../domain/pricing';
import { type AppDb, type AppTx, mutate, type RepoContext } from '../outbox';
import {
  type EntryMode,
  shoppingTrip,
  type ShoppingTripRow,
  tripItem,
  type TripItemRow,
} from '../schema';

export interface StartTripInput {
  listId?: string | null;
  storeName?: string | null;
  budgetCents?: number | null;
  useStoreCard?: boolean;
}

/**
 * ⚠️ Só pode existir UMA compra ativa por vez.
 *
 * Sem esta guarda, iniciar uma compra com outra aberta gravava a segunda e o
 * app continuava mostrando a primeira — o usuário ficava preso numa compra
 * que não conseguia fechar nem trocar. Quem quiser trocar precisa finalizar
 * ou abandonar a anterior, explicitamente.
 */
export function startTrip(ctx: RepoContext, input: StartTripInput = {}): ShoppingTripRow {
  const existente = activeTrip(ctx.db);
  if (existente) {
    throw new Error(
      `Já existe uma compra em andamento (${existente.id}). Finalize ou abandone antes de começar outra.`,
    );
  }
  const id = ctx.newId();
  return mutate(ctx, 'shopping_trip', 'upsert', (tx, now) => {
    const row: ShoppingTripRow = {
      id,
      listId: input.listId ?? null,
      storeId: null,
      storeName: input.storeName ?? null,
      budgetCents: input.budgetCents ?? null,
      status: 'active',
      useStoreCard: input.useStoreCard ? 1 : 0,
      startedAt: now,
      finishedAt: null,
      totalCents: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: ctx.deviceId,
    };
    tx.insert(shoppingTrip).values(row).run();
    return { id, row };
  });
}

/**
 * A compra ativa é a MAIS RECENTE. Ordenar pela mais antiga fazia uma compra
 * esquecida sequestrar o app para sempre, escondendo qualquer outra.
 */
export function activeTrip(db: AppDb): ShoppingTripRow | null {
  return (
    db
      .select()
      .from(shoppingTrip)
      .where(and(eq(shoppingTrip.status, 'active'), isNull(shoppingTrip.deletedAt)))
      .orderBy(desc(shoppingTrip.startedAt))
      .get() ?? null
  );
}

/** Todas as compras ativas — só deveria haver uma; ver `repairActiveTrips`. */
export function allActiveTrips(db: AppDb): ShoppingTripRow[] {
  return db
    .select()
    .from(shoppingTrip)
    .where(and(eq(shoppingTrip.status, 'active'), isNull(shoppingTrip.deletedAt)))
    .orderBy(desc(shoppingTrip.startedAt))
    .all();
}

/**
 * Conserta bancos que já ficaram com mais de uma compra ativa (bug corrigido
 * em 10/08/2026: `startTrip` não checava e `activeTrip` devolvia a mais
 * antiga, prendendo o app numa compra que não saía da tela).
 *
 * Mantém a mais recente e abandona as demais. Usa `abandonTrip` em vez de SQL
 * cru justamente para as mudanças entrarem no outbox e sincronizarem.
 *
 * Devolve quantas foram abandonadas.
 */
export function repairActiveTrips(ctx: RepoContext): number {
  const ativas = allActiveTrips(ctx.db);
  if (ativas.length <= 1) return 0;

  const [, ...antigas] = ativas;
  for (const trip of antigas) {
    abandonTrip(ctx, trip.id);
  }
  return antigas.length;
}

export function getTrip(db: AppDb, tripId: string): ShoppingTripRow | null {
  return db.select().from(shoppingTrip).where(eq(shoppingTrip.id, tripId)).get() ?? null;
}

/** Compras encerradas, mais recentes primeiro — alimenta o histórico. */
export function finishedTrips(db: AppDb, limit = 50): ShoppingTripRow[] {
  return db
    .select()
    .from(shoppingTrip)
    .where(and(eq(shoppingTrip.status, 'finished'), isNull(shoppingTrip.deletedAt)))
    .orderBy(desc(shoppingTrip.finishedAt))
    .limit(limit)
    .all();
}

export function itemsOfTrip(db: AppDb, tripId: string): TripItemRow[] {
  return db
    .select()
    .from(tripItem)
    .where(and(eq(tripItem.tripId, tripId), isNull(tripItem.deletedAt)))
    .orderBy(asc(tripItem.createdAt))
    .all();
}

/** Soma os itens vivos e grava o total da compra. Roda dentro da transação. */
function recalcTripTotal(tx: AppTx, tripId: string, now: number): number {
  const items = tx
    .select()
    .from(tripItem)
    .where(and(eq(tripItem.tripId, tripId), isNull(tripItem.deletedAt)))
    .all();
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

  tx.update(shoppingTrip)
    .set({ totalCents, updatedAt: now })
    .where(eq(shoppingTrip.id, tripId))
    .run();
  return totalCents;
}

function requireTrip(tx: AppTx, tripId: string): ShoppingTripRow {
  const trip = tx.select().from(shoppingTrip).where(eq(shoppingTrip.id, tripId)).get();
  if (!trip) throw new Error(`Compra não encontrada: ${tripId}`);
  return trip;
}

export interface AddTripItemInput {
  rawName: string;
  policy: PricingPolicy;
  qty: number;
  entryMode: EntryMode;
  listItemId?: string | null;
  internalCode?: string | null;
  ean?: string | null;
  confidence?: number | null;
  readingId?: string | null;
}

export function addTripItem(
  ctx: RepoContext,
  tripId: string,
  input: AddTripItemInput,
): TripItemRow {
  const id = ctx.newId();
  return mutate(ctx, 'trip_item', 'upsert', (tx, now) => {
    const trip = requireTrip(tx, tripId);
    const snapshot = priceSnapshot(input.policy, input.qty, trip.useStoreCard === 1);

    const row: TripItemRow = {
      id,
      tripId,
      listItemId: input.listItemId ?? null,
      productId: null,
      rawName: input.rawName,
      normalizedName: normalizeProductName(input.rawName),
      internalCode: input.internalCode ?? null,
      ean: input.ean ?? null,
      pricingPolicy: JSON.stringify(input.policy),
      qty: input.qty,
      saleUnit: input.policy.saleUnit,
      unitPriceCents: snapshot.unitPriceCents,
      totalCents: snapshot.totalCents,
      entryMode: input.entryMode,
      confidence: input.confidence ?? null,
      readingId: input.readingId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: ctx.deviceId,
    };
    tx.insert(tripItem).values(row).run();
    recalcTripTotal(tx, tripId, now);
    return { id, row };
  });
}

/**
 * Troca a quantidade e RE-RESOLVE o preço. Nunca reaproveita o
 * `unit_price_cents` guardado: ele é derivado, e a faixa pode ter mudado.
 */
export function setTripItemQty(ctx: RepoContext, itemId: string, qty: number): TripItemRow {
  return mutate(ctx, 'trip_item', 'upsert', (tx, now) => {
    const current = tx.select().from(tripItem).where(eq(tripItem.id, itemId)).get();
    if (!current) throw new Error(`Item da compra não encontrado: ${itemId}`);
    const trip = requireTrip(tx, current.tripId);

    const policy = JSON.parse(current.pricingPolicy) as PricingPolicy;
    const snapshot = priceSnapshot(policy, qty, trip.useStoreCard === 1);

    const row: TripItemRow = {
      ...current,
      qty,
      unitPriceCents: snapshot.unitPriceCents,
      totalCents: snapshot.totalCents,
      updatedAt: now,
    };
    tx.update(tripItem).set(row).where(eq(tripItem.id, itemId)).run();
    recalcTripTotal(tx, current.tripId, now);
    return { id: itemId, row };
  });
}

export function removeTripItem(ctx: RepoContext, itemId: string): TripItemRow {
  return mutate(ctx, 'trip_item', 'delete', (tx, now) => {
    const current = tx.select().from(tripItem).where(eq(tripItem.id, itemId)).get();
    if (!current) throw new Error(`Item da compra não encontrado: ${itemId}`);

    const row: TripItemRow = { ...current, deletedAt: now, updatedAt: now };
    tx.update(tripItem).set(row).where(eq(tripItem.id, itemId)).run();
    recalcTripTotal(tx, current.tripId, now);
    return { id: itemId, row };
  });
}

/**
 * Liga/desliga o cartão da loja e reprecifica a compra inteira — a condição
 * vale para todos os itens, então todos re-resolvem.
 */
export function setUseStoreCard(
  ctx: RepoContext,
  tripId: string,
  useStoreCard: boolean,
): ShoppingTripRow {
  return mutate(ctx, 'shopping_trip', 'upsert', (tx, now) => {
    const trip = requireTrip(tx, tripId);
    tx.update(shoppingTrip)
      .set({ useStoreCard: useStoreCard ? 1 : 0, updatedAt: now })
      .where(eq(shoppingTrip.id, tripId))
      .run();

    const items = tx
      .select()
      .from(tripItem)
      .where(and(eq(tripItem.tripId, tripId), isNull(tripItem.deletedAt)))
      .all();
    for (const item of items) {
      const policy = JSON.parse(item.pricingPolicy) as PricingPolicy;
      const snapshot = priceSnapshot(policy, item.qty, useStoreCard);
      tx.update(tripItem)
        .set({ ...snapshot, updatedAt: now })
        .where(eq(tripItem.id, item.id))
        .run();
    }

    const totalCents = recalcTripTotal(tx, tripId, now);
    const row: ShoppingTripRow = {
      ...trip,
      useStoreCard: useStoreCard ? 1 : 0,
      totalCents,
      updatedAt: now,
    };
    return { id: tripId, row };
  });
}

/**
 * Abandona a compra — saída de emergência. Diferente de finalizar: não conta
 * como compra concluída no histórico, mas libera o app.
 */
export function abandonTrip(ctx: RepoContext, tripId: string): ShoppingTripRow {
  return mutate(ctx, 'shopping_trip', 'upsert', (tx, now) => {
    const trip = requireTrip(tx, tripId);
    const row: ShoppingTripRow = {
      ...trip,
      status: 'abandoned',
      finishedAt: now,
      updatedAt: now,
    };
    tx.update(shoppingTrip).set(row).where(eq(shoppingTrip.id, tripId)).run();
    return { id: tripId, row };
  });
}

export function finishTrip(ctx: RepoContext, tripId: string): ShoppingTripRow {
  return mutate(ctx, 'shopping_trip', 'upsert', (tx, now) => {
    const trip = requireTrip(tx, tripId);
    const row: ShoppingTripRow = {
      ...trip,
      status: 'finished',
      finishedAt: now,
      updatedAt: now,
    };
    tx.update(shoppingTrip).set(row).where(eq(shoppingTrip.id, tripId)).run();
    return { id: tripId, row };
  });
}

/** Política guardada do item — para a UI mostrar faixas e dicas. */
export function policyOf(item: TripItemRow): PricingPolicy {
  return JSON.parse(item.pricingPolicy) as PricingPolicy;
}

export type { SaleUnit };
