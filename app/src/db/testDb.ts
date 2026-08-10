/**
 * Banco em memória para testes — SQL de verdade, não mock.
 *
 * O schema do Drizzle é agnóstico de driver, então o mesmo `schema.ts` e as
 * mesmas migrations que rodam no device rodam aqui sobre `better-sqlite3`. É
 * o que permite testar transação, chave estrangeira e recálculo de total sem
 * abrir o app.
 *
 * ⚠️ Só para teste. Nada em `src/` fora de `*.test.ts` deve importar daqui —
 * `better-sqlite3` é devDependency e não existe no bundle do app.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { runMigrations } from './migrations';
import type { AppDb, RepoContext } from './outbox';

export interface TestDb {
  db: AppDb;
  ctx: RepoContext;
  /** Avança o relógio determinístico. */
  advance(ms: number): void;
  close(): void;
}

export function createTestDb(options: { deviceId?: string } = {}): TestDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  runMigrations({
    exec: (sql) => sqlite.exec(sql),
    userVersion: () => Number(sqlite.pragma('user_version', { simple: true })),
    setUserVersion: (version) => sqlite.pragma(`user_version = ${version}`),
  });

  const db = drizzle(sqlite) as unknown as AppDb;

  // Relógio e ids determinísticos: teste não pode depender de Date.now().
  let clock = 1_770_000_000_000;
  let counter = 0;
  const ctx: RepoContext = {
    db,
    deviceId: options.deviceId ?? 'device-test',
    now: () => clock,
    newId: () => {
      counter++;
      return `00000000-0000-7000-8000-${String(counter).padStart(12, '0')}`;
    },
  };

  return {
    db,
    ctx,
    advance: (ms) => {
      clock += ms;
    },
    close: () => sqlite.close(),
  };
}
