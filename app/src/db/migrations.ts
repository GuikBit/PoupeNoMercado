/**
 * Migrations do banco local. Especificação do schema: docs/03-MODELO-DADOS.md §3.
 *
 * O DDL é explícito em vez de gerado pelo drizzle-kit porque o `docs/03` já
 * fixa o SQL: escrevê-lo aqui mantém uma fonte de verdade só, revisável em
 * diff, e faz o MESMO código criar o schema no app e nos testes.
 *
 * Versionamento por `PRAGMA user_version`. Migration aplicada **nunca é
 * editada** (convenção do CLAUDE.md) — corrige-se com uma nova.
 *
 * A interface é estreita de propósito: roda igual sobre `expo-sqlite` no device
 * e sobre `better-sqlite3` em memória no Jest.
 */

export interface MigrationDriver {
  /** Executa um ou mais comandos. */
  exec(sql: string): void;
  /** Valor atual de PRAGMA user_version. */
  userVersion(): number;
  setUserVersion(version: number): void;
}

export interface Migration {
  version: number;
  statements: string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE shopping_list (
        id            TEXT PRIMARY KEY,
        name          TEXT    NOT NULL,
        budget_cents  INTEGER,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER,
        device_id     TEXT    NOT NULL,
        sync_state    TEXT    NOT NULL DEFAULT 'pending'
      )`,
      `CREATE TABLE list_item (
        id           TEXT PRIMARY KEY,
        list_id      TEXT    NOT NULL REFERENCES shopping_list(id),
        name         TEXT    NOT NULL,
        qty_planned  REAL,
        unit         TEXT    NOT NULL DEFAULT 'UN',
        checked      INTEGER NOT NULL DEFAULT 0,
        position     INTEGER NOT NULL DEFAULT 0,
        category     TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER,
        device_id    TEXT    NOT NULL
      )`,
      `CREATE INDEX idx_list_item_list ON list_item(list_id) WHERE deleted_at IS NULL`,
      `CREATE TABLE shopping_trip (
        id             TEXT PRIMARY KEY,
        list_id        TEXT REFERENCES shopping_list(id),
        store_id       TEXT,
        store_name     TEXT,
        budget_cents   INTEGER,
        status         TEXT    NOT NULL DEFAULT 'active',
        use_store_card INTEGER NOT NULL DEFAULT 0,
        started_at     INTEGER NOT NULL,
        finished_at    INTEGER,
        total_cents    INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        deleted_at     INTEGER,
        device_id      TEXT    NOT NULL
      )`,
      `CREATE TABLE trip_item (
        id               TEXT PRIMARY KEY,
        trip_id          TEXT    NOT NULL REFERENCES shopping_trip(id),
        list_item_id     TEXT REFERENCES list_item(id),
        product_id       TEXT,
        raw_name         TEXT    NOT NULL,
        normalized_name  TEXT    NOT NULL,
        internal_code    TEXT,
        ean              TEXT,
        pricing_policy   TEXT    NOT NULL,
        qty              REAL    NOT NULL,
        sale_unit        TEXT    NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        total_cents      INTEGER NOT NULL,
        entry_mode       TEXT    NOT NULL,
        confidence       REAL,
        reading_id       TEXT,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        deleted_at       INTEGER,
        device_id        TEXT    NOT NULL
      )`,
      `CREATE INDEX idx_trip_item_trip ON trip_item(trip_id) WHERE deleted_at IS NULL`,
      `CREATE TABLE label_reading (
        id                TEXT PRIMARY KEY,
        trip_id           TEXT,
        engine_id         TEXT    NOT NULL,
        layout_profile_id TEXT    NOT NULL,
        latency_ms        INTEGER NOT NULL,
        confidence_score  REAL    NOT NULL,
        confidence_level  TEXT    NOT NULL,
        weak_fields       TEXT,
        failed_rules      TEXT,
        ocr_raw           TEXT,
        parsed_result     TEXT,
        image_path        TEXT,
        user_corrected    INTEGER NOT NULL DEFAULT 0,
        corrected_value   TEXT,
        uploaded_at       INTEGER,
        created_at        INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_reading_pending_upload
        ON label_reading(created_at) WHERE uploaded_at IS NULL`,
      `CREATE TABLE product_cache (
        id              TEXT PRIMARY KEY,
        ean             TEXT,
        internal_code   TEXT,
        chain           TEXT,
        canonical_name  TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        category        TEXT,
        default_unit    TEXT,
        synced_at       INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_product_ean ON product_cache(ean)`,
      `CREATE INDEX idx_product_internal ON product_cache(chain, internal_code)`,
      `CREATE TABLE layout_profile (
        id        TEXT PRIMARY KEY,
        version   INTEGER NOT NULL,
        chain     TEXT    NOT NULL,
        spec      TEXT    NOT NULL,
        synced_at INTEGER NOT NULL
      )`,
      `CREATE TABLE outbox (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        entity     TEXT    NOT NULL,
        entity_id  TEXT    NOT NULL,
        op         TEXT    NOT NULL,
        payload    TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )`,
      `CREATE INDEX idx_outbox_order ON outbox(seq)`,
      `CREATE TABLE sync_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

/**
 * Aplica as migrations pendentes, em ordem. Idempotente: rodar duas vezes não
 * faz nada na segunda.
 */
export function runMigrations(driver: MigrationDriver): number {
  const current = driver.userVersion();
  let applied = 0;

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    for (const statement of migration.statements) {
      driver.exec(statement);
    }
    driver.setUserVersion(migration.version);
    applied++;
  }
  return applied;
}
