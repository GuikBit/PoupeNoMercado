/**
 * Auditoria de leitura de etiqueta.
 *
 * ⚠️ NÃO passa pelo outbox. `label_reading` tem `uploaded_at` e caminho de
 * upload próprio (docs/03 §3): é telemetria de qualidade do OCR, enviada em
 * lote e best-effort, não estado do usuário que precisa convergir. Misturar as
 * duas coisas faria a fila de sincronização do carrinho competir com upload de
 * imagem.
 *
 * O que se guarda aqui é o que permite melhorar o parser depois: OCR bruto,
 * resultado do parse e — só em baixa confiança — o caminho da imagem.
 */
import { asc, eq, isNull } from 'drizzle-orm';

import type { LabelReading } from '../../domain/reading';
import type { OcrBlock } from '../../ocr/types';
import type { AppDb, RepoContext } from '../outbox';
import { labelReading, type LabelReadingRow } from '../schema';

/** Abaixo disto vale guardar a imagem para reprocessar depois. */
export const KEEP_IMAGE_BELOW_CONFIDENCE = 0.7;

export interface SaveReadingInput {
  tripId?: string | null;
  reading: LabelReading;
  ocrRaw: OcrBlock[];
  /** Caminho local da imagem; só é gravado se a confiança for baixa. */
  imagePath?: string | null;
}

export function saveReading(ctx: RepoContext, input: SaveReadingInput): LabelReadingRow {
  const { reading } = input;
  const id = ctx.newId();
  const now = ctx.now();

  const keepImage = reading.confidence.score < KEEP_IMAGE_BELOW_CONFIDENCE;
  const row: LabelReadingRow = {
    id,
    tripId: input.tripId ?? null,
    engineId: reading.provenance.engineId,
    layoutProfileId: reading.provenance.layoutProfileId,
    latencyMs: reading.provenance.latencyMs,
    confidenceScore: reading.confidence.score,
    confidenceLevel: reading.confidence.level,
    weakFields: JSON.stringify(reading.confidence.weakFields),
    failedRules: JSON.stringify(reading.confidence.failedRules),
    ocrRaw: JSON.stringify(input.ocrRaw),
    parsedResult: JSON.stringify(reading),
    imagePath: keepImage ? (input.imagePath ?? null) : null,
    userCorrected: 0,
    correctedValue: null,
    uploadedAt: null,
    createdAt: now,
  };

  ctx.db.insert(labelReading).values(row).run();
  return row;
}

/**
 * Registra que o usuário corrigiu a leitura. É o sinal mais valioso que o
 * app produz: diz exatamente onde o parser errou, com a resposta certa junto.
 */
export function markCorrected(
  ctx: RepoContext,
  readingId: string,
  correctedValue: unknown,
): void {
  ctx.db
    .update(labelReading)
    .set({ userCorrected: 1, correctedValue: JSON.stringify(correctedValue) })
    .where(eq(labelReading.id, readingId))
    .run();
}

export function pendingUploads(db: AppDb, limit = 50): LabelReadingRow[] {
  return db
    .select()
    .from(labelReading)
    .where(isNull(labelReading.uploadedAt))
    .orderBy(asc(labelReading.createdAt))
    .limit(limit)
    .all();
}

export function markUploaded(ctx: RepoContext, readingIds: string[]): void {
  const now = ctx.now();
  for (const id of readingIds) {
    ctx.db.update(labelReading).set({ uploadedAt: now }).where(eq(labelReading.id, id)).run();
  }
}
