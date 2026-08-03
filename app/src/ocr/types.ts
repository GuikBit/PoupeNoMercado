/**
 * Interface que isola o motor de OCR do resto do sistema.
 * Nenhum código fora de `src/ocr/engines/` importa um motor concreto.
 * Especificação: docs/02-MOTOR-RECONHECIMENTO.md §4.
 */

/** Referência opaca à imagem (URI de arquivo local, já retificada quando possível). */
export interface ImageRef {
  uri: string;
  width: number;
  height: number;
}

/** Retângulo normalizado (0..1) relativo à imagem retificada. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrBlock {
  text: string;
  box: BoundingBox;
  /** 0..1. Use -1 quando o motor não fornecer — o scorer trata como desconhecido. */
  confidence: number;
  lines?: OcrBlock[];
}

export interface OcrResult {
  blocks: OcrBlock[];
  engineId: string;
  latencyMs: number;
  imageSize: { width: number; height: number };
}

export interface OcrEngine {
  readonly id: string;
  readonly requiresNetwork: boolean;
  readonly costPerCallCents: number;
  recognize(image: ImageRef): Promise<OcrResult>;
  isAvailable(): Promise<boolean>;
}
