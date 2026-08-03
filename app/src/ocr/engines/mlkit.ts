/**
 * Adaptador ML Kit Text Recognition v2 (on-device, bundled) — candidato titular.
 * O módulo nativo local (app/modules/mlkit-text-recognition) devolve caixas em
 * pixels e confiança por linha; aqui normalizamos para o contrato OcrEngine:
 * caixas 0..1 e -1 quando o motor não informou confiança.
 */
import {
  type MlkitFrame,
  type MlkitRecognizeResponse,
  MlkitTextRecognition,
} from '../../../modules/mlkit-text-recognition';
import type { BoundingBox, ImageRef, OcrBlock, OcrEngine, OcrResult } from '../types';

function frameToBox(frame: MlkitFrame | null, width: number, height: number): BoundingBox {
  if (!frame || width <= 0 || height <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: frame.x / width, y: frame.y / height, w: frame.w / width, h: frame.h / height };
}

/** ML Kit devolve 0 quando não calculou a confiança — tratamos como "não informou". */
function normalizeConfidence(value: number | undefined): number {
  if (value === undefined || value <= 0) return -1;
  return Math.min(value, 1);
}

export function parseMlkitResponse(payload: MlkitRecognizeResponse): OcrBlock[] {
  const { width, height } = payload;
  return (payload.blocks ?? []).map((block) => {
    const lines: OcrBlock[] = (block.lines ?? []).map((line) => ({
      text: line.text,
      box: frameToBox(line.frame, width, height),
      confidence: normalizeConfidence(line.confidence),
    }));
    // ML Kit não tem confiança por bloco — derivamos da média das linhas conhecidas.
    const known = lines.map((l) => l.confidence).filter((c) => c >= 0);
    return {
      text: block.text,
      box: frameToBox(block.frame, width, height),
      confidence: known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : -1,
      lines,
    };
  });
}

export interface MlKitOptions {
  /** Injetável para teste — o default chama o módulo nativo local. */
  recognizeFn?: (uri: string) => Promise<MlkitRecognizeResponse>;
}

export function createMlKitEngine(options: MlKitOptions = {}): OcrEngine {
  const recognizeFn = options.recognizeFn ?? ((uri: string) => MlkitTextRecognition.recognize(uri));

  return {
    id: 'mlkit',
    requiresNetwork: false,
    costPerCallCents: 0,

    async isAvailable(): Promise<boolean> {
      // Modelo bundled dentro do APK — sempre disponível, sem Play Services.
      return true;
    },

    async recognize(image: ImageRef): Promise<OcrResult> {
      const started = Date.now();
      const payload = await recognizeFn(image.uri);
      return {
        blocks: parseMlkitResponse(payload),
        engineId: 'mlkit',
        latencyMs: Date.now() - started,
        imageSize: { width: image.width, height: image.height },
      };
    },
  };
}
