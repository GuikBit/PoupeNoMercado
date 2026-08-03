/**
 * Resultado estruturado de uma leitura de etiqueta.
 * Especificação: docs/02-MOTOR-RECONHECIMENTO.md §5.
 */
import type { PricingPolicy } from './pricing';

export interface ProductIdentity {
  rawName: string;
  normalizedName: string;
  internalCode?: string;
  ean?: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface LabelReading {
  product: ProductIdentity;
  pricing: PricingPolicy;
  labelDate?: string; // ISO 8601
  storeChain?: string;
  confidence: {
    level: ConfidenceLevel;
    score: number; // 0..1
    /** Campos que não passaram na validação — destacar na UI. */
    weakFields: string[];
    failedRules: string[];
  };
  provenance: {
    engineId: string;
    layoutProfileId: string;
    latencyMs: number;
    capturedAt: string;
  };
}

/** Limiares de comportamento da UI (§7.3). */
export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}
