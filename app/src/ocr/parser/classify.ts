/**
 * Classificação de layout (E3) — docs/02-MOTOR-RECONHECIMENTO.md §6.4.
 * Cada perfil declara uma assinatura; o classificador pontua todos e escolhe
 * o de maior score. Abaixo de 0.5 cai no perfil genérico.
 */
import type { PositionedText } from './anchor';
import { RE } from './patterns';

export interface LayoutSignature {
  /** Tokens que, se presentes, somam pontos. */
  requiredTokens: RegExp[];
  forbiddenTokens: RegExp[];
  /** Faixa de proporção largura/altura da etiqueta retificada. */
  aspectRatio?: { min: number; max: number };
  /** Matiz dominante em HSV (0..360) e tolerância. Vem do detector (E1). */
  dominantHue?: { hue: number; tolerance: number };
}

export type LayoutProfileId =
  | 'bahamas_gondola'
  | 'bahamas_perecivel'
  | 'bahamas_oferta'
  | 'bahamas_cartaz'
  | 'generic_fallback';

export interface ClassifyInput {
  items: PositionedText[];
  imageSize: { width: number; height: number };
  /** Matiz dominante medido pelo detector; undefined quando indisponível. */
  dominantHue?: number;
}

export interface Classification {
  profileId: LayoutProfileId;
  /** Score do vencedor, 0..1 — entra no cálculo de confiança (§7.2). */
  score: number;
}

const YELLOW = { hue: 50, tolerance: 15 };

export const SIGNATURES: Record<Exclude<LayoutProfileId, 'generic_fallback'>, LayoutSignature> = {
  bahamas_gondola: {
    requiredTokens: [RE.TIER, RE.PER_UNIT],
    forbiddenTokens: [],
    aspectRatio: { min: 1.8, max: 3.2 },
    dominantHue: YELLOW,
  },
  bahamas_perecivel: {
    requiredTokens: [],
    forbiddenTokens: [RE.TIER, RE.FROM, RE.TO],
    aspectRatio: { min: 1.2, max: 3.2 },
    dominantHue: YELLOW,
  },
  bahamas_oferta: {
    requiredTokens: [RE.FROM, RE.TO, RE.MEASURE_PRICE_LABEL],
    forbiddenTokens: [RE.TIER],
    aspectRatio: { min: 0.6, max: 0.9 },
  },
  bahamas_cartaz: {
    requiredTokens: [RE.FROM, RE.TO],
    forbiddenTokens: [RE.TIER, RE.MEASURE_PRICE_LABEL],
    aspectRatio: { min: 0.5, max: 1.1 },
    dominantHue: YELLOW,
  },
};

function countMoneyOccurrences(items: PositionedText[]): number {
  let count = 0;
  for (const item of items) {
    const matches = item.text.match(new RegExp(RE.MONEY.source, 'g'));
    count += matches ? matches.length : 0;
  }
  return count;
}

function scoreSignature(sig: LayoutSignature, input: ClassifyInput): number {
  const fullText = input.items.map((i) => i.text).join('\n');
  let score = 0;
  let weight = 0;

  // Tokens obrigatórios — o componente mais discriminante.
  if (sig.requiredTokens.length > 0) {
    const present = sig.requiredTokens.filter((re) => re.test(fullText)).length;
    score += (present / sig.requiredTokens.length) * 0.6;
    weight += 0.6;
  }

  // Proporção da imagem retificada.
  if (sig.aspectRatio) {
    const ar = input.imageSize.width / input.imageSize.height;
    score += ar >= sig.aspectRatio.min && ar <= sig.aspectRatio.max ? 0.25 : 0;
    weight += 0.25;
  }

  // Matiz dominante, quando o detector informou.
  if (sig.dominantHue && input.dominantHue !== undefined) {
    const diff = Math.abs(input.dominantHue - sig.dominantHue.hue);
    score += diff <= sig.dominantHue.tolerance ? 0.15 : 0;
    weight += 0.15;
  }

  let normalized = weight > 0 ? score / weight : 0;

  // Tokens proibidos derrubam o perfil.
  for (const re of sig.forbiddenTokens) {
    if (re.test(fullText)) normalized -= 0.5;
  }

  return Math.max(0, Math.min(1, normalized));
}

/** Score fixo do genérico (§6.4): sempre casa, mas nunca com convicção. */
export const GENERIC_SCORE = 0.3;

export function classifyLayout(input: ClassifyInput): Classification {
  let best: Classification = { profileId: 'generic_fallback', score: GENERIC_SCORE };

  for (const [profileId, sig] of Object.entries(SIGNATURES) as [
    Exclude<LayoutProfileId, 'generic_fallback'>,
    LayoutSignature,
  ][]) {
    let score = scoreSignature(sig, input);

    // Desempate estrutural do perecível: exatamente um preço na etiqueta.
    if (profileId === 'bahamas_perecivel' && countMoneyOccurrences(input.items) !== 1) {
      score *= 0.4;
    }

    if (score > best.score) {
      best = { profileId, score };
    }
  }

  if (best.score < 0.5) {
    return { profileId: 'generic_fallback', score: GENERIC_SCORE };
  }
  return best;
}
