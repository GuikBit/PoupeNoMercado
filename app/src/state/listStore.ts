/**
 * Listas de compras (Zustand). Mesma regra do carrinho: o store é CACHE, o
 * SQLite é a autoridade — escreve no banco e recarrega.
 */
import { create } from 'zustand';

import type { RepoContext } from '../db/outbox';
import {
  addListItem,
  createList,
  deleteList,
  deleteListItem,
  itemsOfList,
  listAll,
  reorderListItems,
  setListItemChecked,
  updateList,
} from '../db/repositories/listRepo';
import type { ListItemRow, ShoppingListRow } from '../db/schema';

export interface ListState {
  ctx: RepoContext | null;
  lists: ShoppingListRow[];
  /** Itens da lista aberta no momento. */
  openListId: string | null;
  items: ListItemRow[];

  attach(ctx: RepoContext): void;
  reload(): void;
  open(listId: string | null): void;
  create(name: string, budgetCents?: number | null): ShoppingListRow | null;
  rename(listId: string, name: string): void;
  /** Teto de gasto da lista. `null` remove o teto. */
  setBudget(listId: string, budgetCents: number | null): void;
  remove(listId: string): void;
  addItem(name: string): void;
  toggle(itemId: string, checked: boolean): void;
  removeItem(itemId: string): void;
  move(itemId: string, direction: -1 | 1): void;
}

function requireCtx(ctx: RepoContext | null): RepoContext {
  if (!ctx) throw new Error('listStore: chame attach(ctx) antes de usar');
  return ctx;
}

export const useListStore = create<ListState>((set, get) => ({
  ctx: null,
  lists: [],
  openListId: null,
  items: [],

  attach(ctx) {
    set({ ctx });
    get().reload();
  },

  reload() {
    const { ctx, openListId } = get();
    if (!ctx) return;
    set({
      lists: listAll(ctx.db),
      items: openListId ? itemsOfList(ctx.db, openListId) : [],
    });
  },

  open(listId) {
    set({ openListId: listId });
    get().reload();
  },

  create(name, budgetCents = null) {
    const ctx = requireCtx(get().ctx);
    const row = createList(ctx, { name, budgetCents });
    get().reload();
    return row;
  },

  rename(listId, name) {
    const ctx = requireCtx(get().ctx);
    updateList(ctx, listId, { name });
    get().reload();
  },

  /**
   * O teto pertence à LISTA, não à compra: a compra iniciada a partir dela
   * herda o valor. Assim o mesmo teto vale toda vez que a lista é usada, sem
   * precisar redigitar.
   */
  setBudget(listId, budgetCents) {
    const ctx = requireCtx(get().ctx);
    updateList(ctx, listId, { budgetCents });
    get().reload();
  },

  remove(listId) {
    const ctx = requireCtx(get().ctx);
    deleteList(ctx, listId);
    if (get().openListId === listId) set({ openListId: null });
    get().reload();
  },

  addItem(name) {
    const ctx = requireCtx(get().ctx);
    const { openListId } = get();
    if (!openListId) return;
    addListItem(ctx, openListId, { name });
    get().reload();
  },

  toggle(itemId, checked) {
    const ctx = requireCtx(get().ctx);
    setListItemChecked(ctx, itemId, checked);
    get().reload();
  },

  removeItem(itemId) {
    const ctx = requireCtx(get().ctx);
    deleteListItem(ctx, itemId);
    get().reload();
  },

  /** Move um item uma posição para cima (−1) ou para baixo (+1). */
  move(itemId, direction) {
    const ctx = requireCtx(get().ctx);
    const { items } = get();
    const index = items.findIndex((i) => i.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;

    const ordered = [...items];
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(target, 0, moved);
    reorderListItems(
      ctx,
      ordered.map((i) => i.id),
    );
    get().reload();
  },
}));

export function resetListStore(): void {
  useListStore.setState({ ctx: null, lists: [], openListId: null, items: [] });
}
