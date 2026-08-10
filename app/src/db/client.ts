/**
 * Banco da aplicação no device: abre o SQLite, roda as migrations no boot e
 * monta o `RepoContext` que os repositórios consomem.
 *
 * O `deviceId` é gerado uma vez e guardado em `sync_state` — ele identifica a
 * origem de cada mudança na sincronização e precisa sobreviver a reinício do
 * app (mas não a reinstalação, e tudo bem: reinstalar é um device novo).
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { newId } from './ids';
import { runMigrations } from './migrations';
import type { AppDb, RepoContext } from './outbox';
import { repairActiveTrips } from './repositories/tripRepo';
import { syncState } from './schema';

const DATABASE_NAME = 'poupe.db';
const DEVICE_ID_KEY = 'device_id';

/**
 * Cache em globalThis, não em variável de módulo: o Fast Refresh reavalia o
 * módulo e reabrir o banco sobre um handle nativo já finalizado dispara
 * NullPointerException. Mesmo motivo do banco do Laboratório.
 */
const cache = globalThis as {
  __poupeDb?: { native: SQLiteDatabase; db: AppDb; deviceId: string };
  __poupeRepaired?: boolean;
};

function migrate(native: SQLiteDatabase): void {
  runMigrations({
    exec: (sql) => native.execSync(sql),
    userVersion: () => {
      const row = native.getFirstSync<{ user_version: number }>('PRAGMA user_version');
      return row?.user_version ?? 0;
    },
    setUserVersion: (version) => native.execSync(`PRAGMA user_version = ${version}`),
  });
}

function getOrCreateDeviceId(db: AppDb): string {
  const existing = db.select().from(syncState).where(eq(syncState.key, DEVICE_ID_KEY)).get();
  if (existing) return existing.value;

  const deviceId = newId();
  db.insert(syncState).values({ key: DEVICE_ID_KEY, value: deviceId }).run();
  return deviceId;
}

/** Abre (e migra) o banco — UMA vez por processo. */
export function openAppDb(): { db: AppDb; deviceId: string } {
  if (!cache.__poupeDb) {
    const native = openDatabaseSync(DATABASE_NAME);
    native.execSync('PRAGMA foreign_keys = ON');
    migrate(native);
    const db = drizzle(native) as unknown as AppDb;
    cache.__poupeDb = { native, db, deviceId: getOrCreateDeviceId(db) };
  }
  const { db, deviceId } = cache.__poupeDb;
  return { db, deviceId };
}

export function appRepoContext(): RepoContext {
  const { db, deviceId } = openAppDb();
  const ctx: RepoContext = { db, deviceId, now: () => Date.now(), newId: () => newId() };

  // Reparo único de bancos que ficaram com mais de uma compra ativa. Roda uma
  // vez por processo: é barato (um SELECT) e sem efeito quando está tudo certo.
  if (!cache.__poupeRepaired) {
    cache.__poupeRepaired = true;
    repairActiveTrips(ctx);
  }
  return ctx;
}
