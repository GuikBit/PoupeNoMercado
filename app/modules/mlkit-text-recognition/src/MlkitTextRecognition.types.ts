/**
 * Contrato do payload nativo do módulo ML Kit.
 * Caixas em PIXELS da imagem processada — a normalização para 0..1 é
 * responsabilidade do adaptador em src/ocr/engines/mlkit.ts.
 */

export interface MlkitFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MlkitLine {
  text: string;
  frame: MlkitFrame | null;
  /** 0..1 do ML Kit; 0 significa "não calculada" em algumas variantes. */
  confidence: number;
  /** Ângulo da linha em graus. */
  angle: number;
}

export interface MlkitBlock {
  text: string;
  frame: MlkitFrame | null;
  lines: MlkitLine[];
}

export interface MlkitRecognizeResponse {
  width: number;
  height: number;
  blocks: MlkitBlock[];
}
