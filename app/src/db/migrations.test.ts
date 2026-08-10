/**
 * Migrations. A convenção do CLAUDE.md é que migration aplicada nunca é
 * editada — o que torna a idempotência e a ordem parte do contrato.
 */
import Database from 'better-sqlite3';

import { LATEST_VERSION, type MigrationDriver, MIGRATIONS, runMigrations } from './migrations';

function driverOver(sqlite: Database.Database): MigrationDriver {
  return {
    exec: (sql) => sqlite.exec(sql),
    userVersion: () => Number(sqlite.pragma('user_version', { simple: true })),
    setUserVersion: (v) => sqlite.pragma(`user_version = ${v}`),
  };
}

describe('runMigrations', () => {
  it('cria o schema completo de docs/03 §3', () => {
    const sqlite = new Database(':memory:');
    runMigrations(driverOver(sqlite));

    const tabelas = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();

    expect(tabelas).toEqual([
      'label_reading',
      'layout_profile',
      'list_item',
      'outbox',
      'product_cache',
      'shopping_list',
      'shopping_trip',
      'sync_state',
      'trip_item',
    ]);
    sqlite.close();
  });

  it('grava a versão aplicada', () => {
    const sqlite = new Database(':memory:');
    const driver = driverOver(sqlite);
    expect(runMigrations(driver)).toBe(MIGRATIONS.length);
    expect(driver.userVersion()).toBe(LATEST_VERSION);
    sqlite.close();
  });

  it('é idempotente — rodar de novo não aplica nada', () => {
    const sqlite = new Database(':memory:');
    const driver = driverOver(sqlite);
    runMigrations(driver);
    expect(runMigrations(driver)).toBe(0);
    sqlite.close();
  });

  it('cria os índices especificados', () => {
    const sqlite = new Database(':memory:');
    runMigrations(driverOver(sqlite));
    const indices = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();
    expect(indices).toContain('idx_trip_item_trip');
    expect(indices).toContain('idx_outbox_order');
    expect(indices).toContain('idx_reading_pending_upload');
    sqlite.close();
  });

  it('o outbox gera seq crescente sozinho', () => {
    const sqlite = new Database(':memory:');
    runMigrations(driverOver(sqlite));
    const insert = sqlite.prepare(
      "INSERT INTO outbox (entity, entity_id, op, payload, created_at) VALUES ('t','1','upsert','{}',0)",
    );
    insert.run();
    insert.run();
    const seqs = sqlite.prepare('SELECT seq FROM outbox ORDER BY seq').all();
    expect(seqs).toEqual([{ seq: 1 }, { seq: 2 }]);
    sqlite.close();
  });
});
