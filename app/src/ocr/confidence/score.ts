/**
 * Modelo de confiança (E6) — docs/02-MOTOR-RECONHECIMENTO.md §7.2.
 *
 * score = min(ocrConfidence, layoutConfidence, 1 − Σ penalidades)
 *
 * O uso de `min` é deliberado: um elo fraco derruba tudo. Erro confiante é o
 * pior bug possível (RNF-04) — prefira admitir incerteza a chutar.
 */
import type { PositionedText } from '../parser/anchor';

/** Teto conservador quando o motor não informa confiança (-1): §4. */
const UNKNOWN_CONFIDENCE_CAP = 0.75;

/** Média ponderada por área dos blocos efetivamente usados na extração. */
export function ocrConfidence(usedItems: PositionedText[]): number {
  if (usedItems.length === 0) return 0;

  let weightedSum = 0;
  let totalArea = 0;
  let hasUnknown = false;

  for (const item of usedItems) {
    const area = Math.max(item.box.w * item.box.h, 1e-6);
    const conf = item.confidence < 0 ? UNKNOWN_CONFIDENCE_CAP : item.confidence;
    if (item.confidence < 0) hasUnknown = true;
    weightedSum += conf * area;
    totalArea += area;
  }

  const mean = weightedSum / totalArea;
  return hasUnknown ? Math.min(mean, UNKNOWN_CONFIDENCE_CAP) : mean;
}

export interface ScoreInput {
  ocrConfidence: number;
  layoutConfidence: number;
  validationPenalty: number;
  /** Teto opcional do perfil (genérico força 0.55 — §6.5). */
  cap?: number;
}

export function finalScore(input: ScoreInput): number {
  const raw = Math.min(
    input.ocrConfidence,
    input.layoutConfidence,
    1 - input.validationPenalty,
  );
  const capped = input.cap !== undefined ? Math.min(raw, input.cap) : raw;
  return Math.max(0, Math.min(1, capped));
}
