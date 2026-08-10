/**
 * Estado da compra ativa (Zustand, convenção do CLAUDE.md).
 *
 * ⚠️ O store é CACHE, não fonte da verdade. A fonte é o SQLite (princípio
 * nº 1: offline-first, o banco local é a autoridade). Toda ação escreve no
 * banco primeiro e depois recarrega o cache — nunca o contrário. Isso evita a
 * classe de bug em que a tela mostra um total que o banco não tem.
 *
 * O `RepoContext` é injetado em vez de importado: mantém o store testável sem
 * device e permite trocar o banco em teste.
 */
import { create } from 'zustand';

import type { RepoContext } from '../db/outbox';
import {
  activeTrip,
  addTripItem,
  finishTrip,
  getTrip,
  itemsOfTrip,
  policyOf,
  removeTripItem,
  setTripItemQty,
  setUseStoreCard,
  startTrip,
  type StartTripInput,
} from '../db/repositories/tripRepo';
import type { ShoppingTripRow, TripItemRow } from '../db/schema';
import { type BudgetStatus,budgetStatus } from '../domain/budget';
import type { PricingPolicy } from '../domain/pricing';
import { itemTotalCents, resolvePrice } from '../domain/pricing';

/** Uma linha da compra já resolvida para a tela. */
export interface TripLine {
  row: TripItemRow;
  policy: PricingPolicy;
  /** Faixa seguinte e o que ela economiza — "leve mais 2 e economize R$ 0,60". */
  hint: { qtyNeeded: number; savingsPerUnitCents: number; newUnitPriceCents: number } | null;
}

export interface TripState {
  ctx: RepoContext | null;
  trip: ShoppingTripRow | null;
  lines: TripLine[];
  budget: BudgetStatus;
  /** Último item adicionado — alimenta o botão de desfazer (5.3). */
  lastAddedId: string | null;

  attach(ctx: RepoContext): void;
  reload(): void;
  start(input?: StartTripInput): void;
  addItem(input: Parameters<typeof addTripItem>[2]): TripItemRow | null;
  setQty(itemId: string, qty: number): void;
  remove(itemId: string): void;
  toggleStoreCard(): void;
  finish(): void;
  undoLastAdd(): void;
}

const EMPTY_BUDGET: BudgetStatus = {
  state: 'ok',
  limitCents: null,
  spentCents: 0,
  remainingCents: null,
  ratio: null,
};

/** Deriva a dica de faixa a partir da política guardada. */
export function lineFrom(row: TripItemRow, useStoreCard: boolean): TripLine {
  const policy = policyOf(row);
  const resolution = resolvePrice(policy, row.qty, useStoreCard);
  const next = resolution.nextTier;
  return {
    row,
    policy,
    hint: next
      ? {
          qtyNeeded: next.qtyNeeded,
          savingsPerUnitCents: resolution.unitPriceCents - next.tier.priceCents,
          newUnitPriceCents: next.tier.priceCents,
        }
      : null,
  };
}

function requireCtx(ctx: RepoContext | null): RepoContext {
  if (!ctx) throw new Error('tripStore: chame attach(ctx) antes de usar');
  return ctx;
}

export const useTripStore = create<TripState>((set, get) => ({
  ctx: null,
  trip: null,
  lines: [],
  budget: EMPTY_BUDGET,
  lastAddedId: null,

  attach(ctx) {
    set({ ctx });
    get().reload();
  },

  reload() {
    const { ctx } = get();
    if (!ctx) return;
    const trip = activeTrip(ctx.db);
    if (!trip) {
      set({ trip: null, lines: [], budget: EMPTY_BUDGET });
      return;
    }
    const rows = itemsOfTrip(ctx.db, trip.id);
    const useCard = trip.useStoreCard === 1;
    set({
      trip,
      lines: rows.map((row) => lineFrom(row, useCard)),
      budget: budgetStatus(trip.totalCents, trip.budgetCents),
    });
  },

  start(input = {}) {
    const ctx = requireCtx(get().ctx);
    startTrip(ctx, input);
    get().reload();
  },

  addItem(input) {
    const ctx = requireCtx(get().ctx);
    const { trip } = get();
    if (!trip) return null;
    const row = addTripItem(ctx, trip.id, input);
    set({ lastAddedId: row.id });
    get().reload();
    return row;
  },

  setQty(itemId, qty) {
    const ctx = requireCtx(get().ctx);
    setTripItemQty(ctx, itemId, qty);
    get().reload();
  },

  remove(itemId) {
    const ctx = requireCtx(get().ctx);
    removeTripItem(ctx, itemId);
    if (get().lastAddedId === itemId) set({ lastAddedId: null });
    get().reload();
  },

  toggleStoreCard() {
    const ctx = requireCtx(get().ctx);
    const { trip } = get();
    if (!trip) return;
    setUseStoreCard(ctx, trip.id, trip.useStoreCard !== 1);
    get().reload();
  },

  finish() {
    const ctx = requireCtx(get().ctx);
    const { trip } = get();
    if (!trip) return;
    finishTrip(ctx, trip.id);
    get().reload();
  },

  /** Desfaz o último item adicionado — rede de segurança do corredor (5.3). */
  undoLastAdd() {
    const { lastAddedId } = get();
    if (!lastAddedId) return;
    get().remove(lastAddedId);
  },
}));

/** Só para teste: zera o cache entre casos. */
export function resetTripStore(): void {
  useTripStore.setState({
    ctx: null,
    trip: null,
    lines: [],
    budget: EMPTY_BUDGET,
    lastAddedId: null,
  });
}

export { getTrip, itemTotalCents };
