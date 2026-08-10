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
import { itemsOfList, setListItemChecked } from '../db/repositories/listRepo';
import {
  abandonTrip,
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
import type { ListItemRow, ShoppingTripRow, TripItemRow } from '../db/schema';
import { type BudgetStatus,budgetStatus } from '../domain/budget';
import type { PricingPolicy } from '../domain/pricing';
import { itemTotalCents, resolvePrice } from '../domain/pricing';

/**
 * O que a faixa seguinte oferece — "leve mais 2 e cada sai por R$ 2,79".
 * É o diferencial do produto reduzido ao que cabe num chip.
 */
export interface QuantityHint {
  qtyNeeded: number;
  savingsPerUnitCents: number;
  newUnitPriceCents: number;
}

/** Uma linha da compra já resolvida para a tela. */
export interface TripLine {
  row: TripItemRow;
  policy: PricingPolicy;
  hint: QuantityHint | null;
}

export interface TripState {
  ctx: RepoContext | null;
  trip: ShoppingTripRow | null;
  lines: TripLine[];
  budget: BudgetStatus;
  /**
   * Itens da lista ainda não marcados — o "falta pegar" da tela de compra.
   * Vazio quando a compra não veio de uma lista.
   */
  pending: ListItemRow[];
  /** Último item adicionado — alimenta o botão de desfazer (5.3). */
  lastAddedId: string | null;

  attach(ctx: RepoContext): void;
  reload(): void;
  /** Inicia uma compra, ou RETOMA a que já estiver aberta. Nunca cria duas. */
  start(input?: StartTripInput): ShoppingTripRow | null;
  abandon(): void;
  checkPending(itemId: string): void;
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
  pending: [],
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
      set({ trip: null, lines: [], budget: EMPTY_BUDGET, pending: [] });
      return;
    }
    const rows = itemsOfTrip(ctx.db, trip.id);
    const useCard = trip.useStoreCard === 1;
    set({
      trip,
      lines: rows.map((row) => lineFrom(row, useCard)),
      budget: budgetStatus(trip.totalCents, trip.budgetCents),
      // Só há "falta pegar" quando a compra nasceu de uma lista.
      pending: trip.listId
        ? itemsOfList(ctx.db, trip.listId).filter((i) => i.checked === 0)
        : [],
    });
  },

  /** Marca da lista sem escanear — para quem pegou o item e já sabe o preço. */
  checkPending(itemId) {
    const ctx = requireCtx(get().ctx);
    setListItemChecked(ctx, itemId, true);
    get().reload();
  },

  /**
   * Retoma a compra aberta em vez de criar outra. Criar uma segunda deixava o
   * app preso: a nova ficava invisível e a antiga não saía da tela.
   */
  start(input = {}) {
    const ctx = requireCtx(get().ctx);
    const aberta = activeTrip(ctx.db);
    if (aberta) {
      get().reload();
      return aberta;
    }
    const nova = startTrip(ctx, input);
    get().reload();
    return nova;
  },

  /** Saída de emergência: descarta a compra e libera o app. */
  abandon() {
    const ctx = requireCtx(get().ctx);
    const { trip } = get();
    if (!trip) return;
    abandonTrip(ctx, trip.id);
    set({ lastAddedId: null });
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
    pending: [],
    lastAddedId: null,
  });
}

export { getTrip, itemTotalCents };
