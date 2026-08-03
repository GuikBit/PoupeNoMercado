/**
 * Orquestrador do parser: E3 (classificação) → E4 (extração) → E5 (validação)
 * → E6 (confiança). TypeScript puro — roda em teste sem device.
 *
 * Retorna null quando a leitura é inutilizável (sem preço base ou rejeitada
 * por V1/V2) — o chamador cai na entrada manual, que nunca bloqueia.
 */
import type { LabelReading } from '../../domain/reading';
import { confidenceLevel } from '../../domain/reading';
import { finalScore, ocrConfidence } from '../confidence/score';
import type { OcrResult } from '../types';
import { flattenToLines } from './anchor';
import { classifyLayout, type LayoutProfileId } from './classify';
import { normalizeText } from './normalize';
import { extractGondola } from './profiles/bahamas-gondola';
import { extractCartaz, extractOferta } from './profiles/bahamas-oferta';
import { extractPerecivel } from './profiles/bahamas-perecivel';
import { extractGeneric } from './profiles/generic';
import type { Extractor } from './profiles/types';
import { validateReading } from './validate';

const EXTRACTORS: Record<LayoutProfileId, Extractor> = {
  bahamas_gondola: extractGondola,
  bahamas_perecivel: extractPerecivel,
  bahamas_oferta: extractOferta,
  bahamas_cartaz: extractCartaz,
  generic_fallback: extractGeneric,
};

export interface ParseOptions {
  /** Matiz dominante medido pelo detector (E1), quando disponível. */
  dominantHue?: number;
  capturedAt?: string;
  /** "Agora" injetável para o V10 em testes. */
  now?: Date;
}

export function parseLabel(ocr: OcrResult, opts: ParseOptions = {}): LabelReading | null {
  const items = flattenToLines(ocr.blocks);
  if (items.length === 0) return null;

  const classification = classifyLayout({
    items,
    imageSize: ocr.imageSize,
    dominantHue: opts.dominantHue,
  });

  const extraction = EXTRACTORS[classification.profileId]({
    items,
    imageSize: ocr.imageSize,
  });

  if (!extraction.pricing) return null;

  const validation = validateReading({
    pricing: extraction.pricing,
    rawName: extraction.rawName,
    labelDate: extraction.labelDate,
    now: opts.now,
  });
  if (validation.rejected) return null;

  const score = finalScore({
    ocrConfidence: ocrConfidence(extraction.usedItems),
    layoutConfidence: classification.score,
    validationPenalty: validation.penalty + (extraction.extraPenalty ?? 0),
    cap: extraction.confidenceCap,
  });

  const weakFields = [...new Set([...extraction.weakFields, ...validation.weakFields])];

  return {
    product: {
      rawName: extraction.rawName,
      normalizedName: normalizeText(extraction.rawName),
      internalCode: extraction.internalCode,
      ean: extraction.ean,
    },
    pricing: extraction.pricing,
    labelDate: extraction.labelDate,
    storeChain: classification.profileId.startsWith('bahamas') ? 'bahamas' : undefined,
    confidence: {
      level: confidenceLevel(score),
      score,
      weakFields,
      failedRules: validation.failedRules,
    },
    provenance: {
      engineId: ocr.engineId,
      layoutProfileId: classification.profileId,
      latencyMs: ocr.latencyMs,
      capturedAt: opts.capturedAt ?? '',
    },
  };
}
