/**
 * Listas de compras e seus itens.
 *
 * Exclusão é sempre lógica (`deleted_at`): a sincronização precisa propagar a
 * remoção, e um DELETE físico sumiria sem deixar rastro para o servidor.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { type AppDb, mutate, type RepoContext } from '../outbox';
import {
  listItem,
  type ListItemRow,
  shoppingList,
  type ShoppingListRow,
} from '../schema';

export interface CreateListInput {
  name: string;
  budgetCents?: number | null;
}

export function createList(ctx: RepoContext, input: CreateListInput): ShoppingListRow {
  const id = ctx.newId();
  return mutate(ctx, 'shopping_list', 'upsert', (tx, now) => {
    const row: ShoppingListRow = {
      id,
      name: input.name,
      budgetCents: input.budgetCents ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: ctx.deviceId,
      syncState: 'pending',
    };
    tx.insert(shoppingList).values(row).run();
    return { id, row };
  });
}

export interface UpdateListInput {
  name?: string;
  budgetCents?: number | null;
}

export function updateList(
  ctx: RepoContext,
  listId: string,
  input: UpdateListInput,
): ShoppingListRow {
  return mutate(ctx, 'shopping_list', 'upsert', (tx, now) => {
    const current = tx
      .select()
      .from(shoppingList)
      .where(eq(shoppingList.id, listId))
      .get();
    if (!current) throw new Error(`Lista não encontrada: ${listId}`);

    const row: ShoppingListRow = {
      ...current,
      name: input.name ?? current.name,
      budgetCents: input.budgetCents === undefined ? current.budgetCents : input.budgetCents,
      updatedAt: now,
      syncState: 'pending',
    };
    tx.update(shoppingList).set(row).where(eq(shoppingList.id, listId)).run();
    return { id: listId, row };
  });
}

export function deleteList(ctx: RepoContext, listId: string): ShoppingListRow {
  return mutate(ctx, 'shopping_list', 'delete', (tx, now) => {
    const current = tx.select().from(shoppingList).where(eq(shoppingList.id, listId)).get();
    if (!current) throw new Error(`Lista não encontrada: ${listId}`);

    const row: ShoppingListRow = {
      ...current,
      deletedAt: now,
      updatedAt: now,
      syncState: 'pending',
    };
    tx.update(shoppingList).set(row).where(eq(shoppingList.id, listId)).run();
    return { id: listId, row };
  });
}

export function getList(db: AppDb, listId: string): ShoppingListRow | null {
  return (
    db
      .select()
      .from(shoppingList)
      .where(and(eq(shoppingList.id, listId), isNull(shoppingList.deletedAt)))
      .get() ?? null
  );
}

export function listAll(db: AppDb): ShoppingListRow[] {
  return db
    .select()
    .from(shoppingList)
    .where(isNull(shoppingList.deletedAt))
    .orderBy(asc(shoppingList.createdAt))
    .all();
}

export interface AddListItemInput {
  name: string;
  qtyPlanned?: number | null;
  unit?: string;
  category?: string | null;
}

export function addListItem(
  ctx: RepoContext,
  listId: string,
  input: AddListItemInput,
): ListItemRow {
  const id = ctx.newId();
  return mutate(ctx, 'list_item', 'upsert', (tx, now) => {
    // Posição = fim da lista. Contar itens vivos evita buraco após remoção.
    const siblings = tx
      .select()
      .from(listItem)
      .where(and(eq(listItem.listId, listId), isNull(listItem.deletedAt)))
      .all();

    const row: ListItemRow = {
      id,
      listId,
      name: input.name,
      qtyPlanned: input.qtyPlanned ?? null,
      unit: input.unit ?? 'UN',
      checked: 0,
      position: siblings.length,
      category: input.category ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: ctx.deviceId,
    };
    tx.insert(listItem).values(row).run();
    return { id, row };
  });
}

export function setListItemChecked(
  ctx: RepoContext,
  itemId: string,
  checked: boolean,
): ListItemRow {
  return mutate(ctx, 'list_item', 'upsert', (tx, now) => {
    const current = tx.select().from(listItem).where(eq(listItem.id, itemId)).get();
    if (!current) throw new Error(`Item de lista não encontrado: ${itemId}`);

    const row: ListItemRow = { ...current, checked: checked ? 1 : 0, updatedAt: now };
    tx.update(listItem).set(row).where(eq(listItem.id, itemId)).run();
    return { id: itemId, row };
  });
}

export function deleteListItem(ctx: RepoContext, itemId: string): ListItemRow {
  return mutate(ctx, 'list_item', 'delete', (tx, now) => {
    const current = tx.select().from(listItem).where(eq(listItem.id, itemId)).get();
    if (!current) throw new Error(`Item de lista não encontrado: ${itemId}`);

    const row: ListItemRow = { ...current, deletedAt: now, updatedAt: now };
    tx.update(listItem).set(row).where(eq(listItem.id, itemId)).run();
    return { id: itemId, row };
  });
}

/** Reordena pela ordem do array recebido — uma mutação por item movido. */
export function reorderListItems(ctx: RepoContext, orderedIds: string[]): void {
  for (const [position, itemId] of orderedIds.entries()) {
    mutate(ctx, 'list_item', 'upsert', (tx, now) => {
      const current = tx.select().from(listItem).where(eq(listItem.id, itemId)).get();
      if (!current) throw new Error(`Item de lista não encontrado: ${itemId}`);
      const row: ListItemRow = { ...current, position, updatedAt: now };
      tx.update(listItem).set(row).where(eq(listItem.id, itemId)).run();
      return { id: itemId, row };
    });
  }
}

export function itemsOfList(db: AppDb, listId: string): ListItemRow[] {
  return db
    .select()
    .from(listItem)
    .where(and(eq(listItem.listId, listId), isNull(listItem.deletedAt)))
    .orderBy(asc(listItem.position))
    .all();
}
