/**
 * Schema local (SQLite). Especificação: docs/03-MODELO-DADOS.md §3.
 *
 * Definido com `drizzle-orm/sqlite-core`, que é agnóstico de driver: o app usa
 * `drizzle-orm/expo-sqlite` e os testes usam `better-sqlite3` em memória. É o
 * que permite exercitar SQL de verdade sem device.
 *
 * Convenções do CLAUDE.md que valem em toda tabela sincronizável:
 *   id (UUID v7) · updated_at · deleted_at · device_id
 *
 * Dinheiro é sempre INTEGER em centavos. Datas são epoch em ms (INTEGER).
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export type SyncState = 'pending' | 'synced' | 'conflict';
export type TripStatus = 'active' | 'finished' | 'abandoned';
export type EntryMode = 'scan' | 'manual' | 'scan_corrected';
export type OutboxOp = 'upsert' | 'delete';

export const shoppingList = sqliteTable('shopping_list', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  budgetCents: integer('budget_cents'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  deviceId: text('device_id').notNull(),
  syncState: text('sync_state').$type<SyncState>().notNull().default('pending'),
});

export const listItem = sqliteTable(
  'list_item',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => shoppingList.id),
    name: text('name').notNull(),
    qtyPlanned: real('qty_planned'),
    unit: text('unit').notNull().default('UN'),
    checked: integer('checked').notNull().default(0),
    position: integer('position').notNull().default(0),
    category: text('category'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    deviceId: text('device_id').notNull(),
  },
  (table) => [index('idx_list_item_list').on(table.listId)],
);

export const shoppingTrip = sqliteTable('shopping_trip', {
  id: text('id').primaryKey(),
  listId: text('list_id').references(() => shoppingList.id),
  storeId: text('store_id'),
  storeName: text('store_name'),
  budgetCents: integer('budget_cents'),
  status: text('status').$type<TripStatus>().notNull().default('active'),
  /** Afeta `resolvePrice` — vale para a compra inteira. */
  useStoreCard: integer('use_store_card').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  /** Desnormalizado; recalculado a cada mutação de item. */
  totalCents: integer('total_cents').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  deviceId: text('device_id').notNull(),
});

export const tripItem = sqliteTable(
  'trip_item',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => shoppingTrip.id),
    /** Preenchido quando casou com um item da lista (docs/02 §8). */
    listItemId: text('list_item_id').references(() => listItem.id),
    productId: text('product_id'),

    rawName: text('raw_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    internalCode: text('internal_code'),
    ean: text('ean'),

    /**
     * `PricingPolicy` serializada em JSON. É registro HISTÓRICO do que a
     * etiqueta dizia — imutável depois da leitura. Ver docs/03 §3 para o
     * porquê de não normalizar em tabelas.
     */
    pricingPolicy: text('pricing_policy').notNull(),

    qty: real('qty').notNull(),
    saleUnit: text('sale_unit').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalCents: integer('total_cents').notNull(),

    entryMode: text('entry_mode').$type<EntryMode>().notNull(),
    confidence: real('confidence'),
    readingId: text('reading_id'),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    deviceId: text('device_id').notNull(),
  },
  (table) => [index('idx_trip_item_trip').on(table.tripId)],
);

export const labelReading = sqliteTable(
  'label_reading',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id'),
    engineId: text('engine_id').notNull(),
    layoutProfileId: text('layout_profile_id').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    confidenceScore: real('confidence_score').notNull(),
    confidenceLevel: text('confidence_level').notNull(),
    weakFields: text('weak_fields'),
    failedRules: text('failed_rules'),
    ocrRaw: text('ocr_raw'),
    parsedResult: text('parsed_result'),
    /** Caminho local — guardado só em leitura de baixa confiança. */
    imagePath: text('image_path'),
    userCorrected: integer('user_corrected').notNull().default(0),
    correctedValue: text('corrected_value'),
    uploadedAt: integer('uploaded_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_reading_pending_upload').on(table.createdAt)],
);

export const productCache = sqliteTable(
  'product_cache',
  {
    id: text('id').primaryKey(),
    ean: text('ean'),
    internalCode: text('internal_code'),
    chain: text('chain'),
    canonicalName: text('canonical_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    category: text('category'),
    defaultUnit: text('default_unit'),
    syncedAt: integer('synced_at').notNull(),
  },
  (table) => [
    index('idx_product_ean').on(table.ean),
    index('idx_product_internal').on(table.chain, table.internalCode),
  ],
);

export const layoutProfile = sqliteTable('layout_profile', {
  id: text('id').primaryKey(),
  version: integer('version').notNull(),
  chain: text('chain').notNull(),
  spec: text('spec').notNull(),
  syncedAt: integer('synced_at').notNull(),
});

/**
 * Fila de sincronização. Toda mutação de entidade sincronizável enfileira aqui
 * NA MESMA TRANSAÇÃO — ver `withOutbox` em `outbox.ts`.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').$type<OutboxOp>().notNull(),
    /** JSON do estado completo da entidade no momento da mutação. */
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [index('idx_outbox_order').on(table.seq)],
);

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type ShoppingListRow = typeof shoppingList.$inferSelect;
export type ListItemRow = typeof listItem.$inferSelect;
export type ShoppingTripRow = typeof shoppingTrip.$inferSelect;
export type TripItemRow = typeof tripItem.$inferSelect;
export type LabelReadingRow = typeof labelReading.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
