/**
 * Pipeline do Laboratório: detector → motores em paralelo → mesmo parser.
 * Regras de docs/06 §3: UM único bitmap retificado alimenta todos os motores
 * (comparação legítima) e o MESMO parser roda sobre a saída de todos
 * (comparamos motores, não parsers). Falha de um motor não derruba os outros.
 */
import { detectLabel, type DetectResult } from '../ocr/detector/detect';
import { listEngines } from '../ocr/engines/registry';
import { parseLabel } from '../ocr/parser/parse';
import type { ImageRef, OcrEngine } from '../ocr/types';
import type { EngineRun } from './types';

export interface LabRun {
  photo: ImageRef;
  capturedAt: string;
  detect: DetectResult;
  engines: Record<string, EngineRun>;
}

export interface PipelineOptions {
  /** Injetáveis para teste. */
  detectFn?: (photo: ImageRef) => Promise<DetectResult>;
  engines?: OcrEngine[];
  capturedAt?: string;
}

function reasonToMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

export async function runLabPipeline(
  photo: ImageRef,
  options: PipelineOptions = {},
): Promise<LabRun> {
  const detectFn = options.detectFn ?? detectLabel;
  const engines = options.engines ?? listEngines();
  const capturedAt = options.capturedAt ?? new Date().toISOString();

  const detect = await detectFn(photo);

  const settled = await Promise.allSettled(engines.map((engine) => engine.recognize(detect.image)));

  const runs: Record<string, EngineRun> = {};
  settled.forEach((result, index) => {
    const engine = engines[index];
    if (!engine) return;
    if (result.status === 'rejected') {
      runs[engine.id] = {
        latencyMs: -1,
        ocrRaw: [],
        parsed: null,
        confidence: null,
        error: reasonToMessage(result.reason),
      };
      return;
    }
    const parsed = parseLabel(result.value, { dominantHue: detect.dominantHue, capturedAt });
    runs[engine.id] = {
      latencyMs: result.value.latencyMs,
      ocrRaw: result.value.blocks,
      parsed,
      confidence: parsed ? parsed.confidence.score : null,
    };
  });

  return { photo, capturedAt, detect, engines: runs };
}
