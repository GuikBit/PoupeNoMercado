/**
 * Tipos do Laboratório de Etiquetas — espelho da "estrutura do caso salvo"
 * de docs/06-PLANO-VALIDACAO.md §3. O caso guarda TUDO: foto, OCR bruto por
 * motor, resultado parseado, gabarito e veredito humano — é o que permite
 * reprocessar sem voltar ao mercado.
 */
import type { PricingPolicy } from '../domain/pricing';
import type { LabelReading } from '../domain/reading';
import type { OcrBlock } from '../ocr/types';

/** Tipos de etiqueta da taxonomia (docs/02 §3) + casos adversariais (docs/06 §4). */
export type LabLabelType =
  | 'bahamas_oferta'
  | 'bahamas_gondola'
  | 'bahamas_perecivel'
  | 'bahamas_cartaz'
  | 'adversarial';

export type Lighting = 'normal' | 'dim' | 'glare';
export type CaptureAngle = 'frontal' | 'oblique' | 'steep';
export type LabelCondition = 'flat' | 'curved' | 'creased' | 'behind_glass';

export interface CaptureConditions {
  lighting: Lighting;
  angle: CaptureAngle;
  condition: LabelCondition;
}

/** Resultado de UM motor sobre o bitmap único do caso. */
export interface EngineRun {
  latencyMs: number;
  ocrRaw: OcrBlock[];
  parsed: LabelReading | null;
  /** Score final 0..1, ou null quando o parser rejeitou/motor falhou. */
  confidence: number | null;
  /** Preenchido quando o motor rejeitou (ex.: Cloud Vision sem rede). */
  error?: string;
}

/** Gabarito anotado NO MERCADO, olhando a etiqueta física (docs/06 §4). */
export interface GroundTruth {
  rawName: string;
  /** Preço é estrutura, nunca escalar — princípio 2 do CLAUDE.md. */
  pricing: PricingPolicy;
  internalCode?: string;
}

export type VerdictEngine = 'mlkit' | 'cloudvision' | 'none';

export interface HumanVerdict {
  bestEngine: VerdictEngine;
  note: string;
}

export interface LabCase {
  /** UUID gerado no salvamento. */
  id: string;
  /** ISO 8601. */
  capturedAt: string;
  /** Caminho da foto original, RELATIVO a Paths.document (o prefixo muda a cada instalação). */
  imagePath: string;
  /** Recorte retificado usado pelos motores, relativo a Paths.document. */
  rectifiedPath: string | null;
  labelType: LabLabelType;
  detectMethod: 'quad' | 'fallback';
  dominantHue: number | null;
  captureConditions: CaptureConditions;
  /** Por id de motor ('mlkit', 'cloudvision'). */
  engines: Record<string, EngineRun>;
  groundTruth: GroundTruth | null;
  humanVerdict: HumanVerdict | null;
}
