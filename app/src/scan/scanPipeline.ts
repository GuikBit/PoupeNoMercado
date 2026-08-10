/**
 * Pipeline de leitura em produção.
 *
 * Diferente do Laboratório, que roda TODOS os motores no mesmo frame para
 * comparar: aqui roda só o titular (ML Kit, on-device) e aplica a política de
 * aceitação decidida no ADR-002.
 *
 * O Cloud Vision fica como escalonamento OPORTUNISTA: só quando o ML Kit não
 * deu resultado aproveitável e há rede. Nunca no caminho crítico — supermercado
 * tem sinal ruim, e é exatamente o momento de uso (princípio nº 1).
 */
import { type AcceptanceDecision, decideAcceptance } from '../domain/acceptance';
import type { LabelReading } from '../domain/reading';
import { detectLabel, type DetectResult } from '../ocr/detector/detect';
import { getEngine } from '../ocr/engines/registry';
import { parseLabel } from '../ocr/parser/parse';
import type { ImageRef, OcrBlock, OcrResult } from '../ocr/types';

export const PRIMARY_ENGINE = 'mlkit';
export const FALLBACK_ENGINE = 'cloudvision';

export interface ScanOutcome {
  reading: LabelReading | null;
  decision: AcceptanceDecision;
  ocrRaw: OcrBlock[];
  /** Imagem retificada — guardada quando a confiança é baixa. */
  imageUri: string;
  engineId: string;
  /** Verdadeiro quando o Cloud Vision entrou como escalonamento. */
  escalated: boolean;
  latencyMs: number;
}

export interface ScanOptions {
  /** Injetáveis para teste — em device usam OpenCV e os motores reais. */
  detectFn?: (photo: ImageRef) => Promise<DetectResult>;
  recognizeFn?: (image: ImageRef) => Promise<OcrResult>;
  /**
   * Escalonamento para a nuvem. Recebe a imagem já retificada; devolver null
   * significa "não dá para escalar agora" (sem rede, sem chave, desligado).
   */
  escalateFn?: (image: ImageRef) => Promise<OcrResult | null>;
  capturedAt?: string;
}

function readingFrom(ocr: OcrResult, detect: DetectResult, capturedAt?: string) {
  return parseLabel(ocr, { dominantHue: detect.dominantHue, capturedAt });
}

/**
 * Lê a etiqueta e decide o que a UI faz com o resultado.
 *
 * Nunca lança por falha de leitura: leitura ruim é um resultado válido que
 * leva à entrada manual. Só propaga erro de infraestrutura (câmera, OpenCV).
 */
export async function scanLabel(photo: ImageRef, options: ScanOptions = {}): Promise<ScanOutcome> {
  const detect = options.detectFn ? await options.detectFn(photo) : await detectLabel(photo);
  const recognize = options.recognizeFn ?? ((image: ImageRef) => getEngine(PRIMARY_ENGINE).recognize(image));

  const primary = await recognize(detect.image);
  const reading = readingFrom(primary, detect, options.capturedAt);
  const decision = decideAcceptance(reading);

  // Escalona só quando o titular não deu nada aproveitável. Confirmar uma
  // leitura boa não vale 1,6 s de espera nem uma chamada paga.
  if (decision.action === 'manual' && options.escalateFn) {
    const fallback = await options.escalateFn(detect.image);
    if (fallback) {
      const escalatedReading = readingFrom(fallback, detect, options.capturedAt);
      const escalatedDecision = decideAcceptance(escalatedReading);
      if (escalatedDecision.action !== 'manual') {
        return {
          reading: escalatedReading,
          decision: escalatedDecision,
          ocrRaw: fallback.blocks,
          imageUri: detect.image.uri,
          engineId: FALLBACK_ENGINE,
          escalated: true,
          latencyMs: primary.latencyMs + fallback.latencyMs,
        };
      }
    }
  }

  return {
    reading,
    decision,
    ocrRaw: primary.blocks,
    imageUri: detect.image.uri,
    engineId: PRIMARY_ENGINE,
    escalated: false,
    latencyMs: primary.latencyMs,
  };
}
