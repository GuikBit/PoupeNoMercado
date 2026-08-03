/**
 * Contrato dos perfis de extração (E4) — docs/02-MOTOR-RECONHECIMENTO.md §6.5.
 *
 * Nota de implementação: a v1 usa extratores em código; a forma distribuível
 * como dados (`ExtractorSpec`, §6.6) entra na Etapa 3, quando os 60 casos
 * reais ditarem o vocabulário necessário.
 */
import type { PricingPolicy } from '../../../domain/pricing';
import type { PositionedText } from '../anchor';

export interface ExtractionContext {
  /** Linhas normalizadas e posicionadas. */
  items: PositionedText[];
  imageSize: { width: number; height: number };
}

export interface Extraction {
  rawName: string;
  /** null quando nem o preço base foi extraído — leitura vai para entrada manual. */
  pricing: PricingPolicy | null;
  internalCode?: string;
  ean?: string;
  labelDate?: string;
  weakFields: string[];
  /** Blocos efetivamente usados — alimentam a média ponderada de confiança. */
  usedItems: PositionedText[];
  /** Penalidade adicional específica do perfil (ex.: ambiguidade no genérico). */
  extraPenalty?: number;
  /** Teto de confiança do perfil (genérico: 0.55). */
  confidenceCap?: number;
}

export type Extractor = (ctx: ExtractionContext) => Extraction;
