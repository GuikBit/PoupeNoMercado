/**
 * Fila de sincronização (docs/03 §3).
 *
 * ⚠️ Regra que não se negocia: o enfileiramento acontece **na mesma transação**
 * da mutação. Gravar a entidade e enfileirar depois abriria uma janela em que
 * uma queda do app deixa a mudança local sem registro de sync — e o servidor
 * nunca saberia dela. Por isso toda mutação passa por `mutate()`, que abre a
 * transação e faz as duas coisas dentro dela.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { outbox,type OutboxOp } from './schema';

/**
 * Banco da aplicação. Genérico no driver de propósito: o app injeta o de
 * `expo-sqlite`, os testes injetam `better-sqlite3` em memória.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do driver varia; o resto do código nunca vê `any`.
export type AppDb = BaseSQLiteDatabase<'sync', any, Record<string, unknown>>;

/** Transação — mesma superfície do banco. */
export type AppTx = AppDb;

export interface RepoContext {
  db: AppDb;
  /** Identifica a origem da mudança na sincronização. */
  deviceId: string;
  now: () => number;
  newId: () => string;
}

export interface EnqueueInput {
  entity: string;
  entityId: string;
  op: OutboxOp;
  /** Estado completo da entidade após a mutação. */
  payload: unknown;
}

export function enqueue(tx: AppTx, input: EnqueueInput, now: number): void {
  tx.insert(outbox)
    .values({
      entity: input.entity,
      entityId: input.entityId,
      op: input.op,
      payload: JSON.stringify(input.payload),
      createdAt: now,
    })
    .run();
}

/**
 * Executa uma mutação e enfileira o resultado, atomicamente.
 *
 * O callback recebe a transação e devolve a entidade gravada; o enfileiramento
 * é derivado dela, então é impossível escrever uma mutação que esquece de
 * sincronizar — o tipo obriga.
 */
export function mutate<T>(
  ctx: RepoContext,
  entity: string,
  op: OutboxOp,
  run: (tx: AppTx, now: number) => { id: string; row: T },
): T {
  const now = ctx.now();
  return ctx.db.transaction((tx) => {
    const { id, row } = run(tx as AppTx, now);
    enqueue(tx as AppTx, { entity, entityId: id, op, payload: row }, now);
    return row;
  });
}

export interface PendingOutboxEntry {
  seq: number;
  entity: string;
  entityId: string;
  op: OutboxOp;
  payload: unknown;
  attempts: number;
}

/** Fila em ordem de criação — é a ordem em que o servidor deve aplicar. */
export function pendingOutbox(db: AppDb, limit = 100): PendingOutboxEntry[] {
  return db
    .select()
    .from(outbox)
    .orderBy(outbox.seq)
    .limit(limit)
    .all()
    .map((row) => ({
      seq: row.seq,
      entity: row.entity,
      entityId: row.entityId,
      op: row.op,
      payload: JSON.parse(row.payload) as unknown,
      attempts: row.attempts,
    }));
}
