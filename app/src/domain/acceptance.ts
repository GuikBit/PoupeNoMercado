/**
 * Política de aceitação de uma leitura (ADR-002, quarta opção).
 *
 * Decide o que a UI faz com o resultado do OCR: aceitar sozinho, pré-preencher
 * para o usuário confirmar, ou mandar direto para entrada manual.
 *
 * ⚠️ Os limiares são POR MOTOR, de propósito. A confiança não é comparável
 * entre motores: o ML Kit satura em 0,78 neste corpus enquanto o Cloud Vision
 * vai a 0,98, então um limiar único seria enganoso — foi o que fez o M3 do
 * ML Kit sair 0% por construção. Ver docs/resultados/lab-2026-08-10.md §11.
 *
 * Calibrado em 45 leituras com gabarito (coleta de 08/08/2026),
 * via `npm run confidence:curve`.
 */
import type { LabelReading } from './reading';

export type AcceptanceAction =
  /** Preenche sozinho e segue — o usuário não precisa olhar. */
  | 'auto'
  /** Mostra o valor lido e espera um toque de confirmação. */
  | 'confirm'
  /** Não dá para aproveitar: entrada manual, que nunca bloqueia. */
  | 'manual';

export interface AcceptanceDecision {
  action: AcceptanceAction;
  /** Por que — vai para a UI e para o log de diagnóstico. */
  reason: string;
}

export interface EngineThresholds {
  /**
   * Score a partir do qual a leitura entra sozinha. `null` desabilita o modo
   * automático para o motor — é o caso de todo motor cuja curva de precisão
   * não chega a 100% com cobertura útil.
   */
  auto: number | null;
  /** Score a partir do qual vale pré-preencher para confirmação. */
  confirm: number;
}

/**
 * Medido, não estipulado:
 *
 * - **mlkit** — não existe limiar com zero preço errado e cobertura útil: em
 *   0,75 a precisão chega a 100% mas cobre 8,9% (4 de 45). Logo `auto: null`.
 *   Toda leitura do ML Kit é confirmada pelo usuário. Em compensação ele
 *   produz leitura em 75,6% dos casos com 91,2% de acerto — pré-preencher
 *   poupa digitação em três de cada quatro etiquetas.
 * - **cloudvision** — 100% de precisão em TODA a faixa medida. Em 0,85 cobre
 *   28,9%; é aí que o automático é seguro com folga.
 */
export const ENGINE_THRESHOLDS: Record<string, EngineThresholds> = {
  mlkit: { auto: null, confirm: 0.3 },
  cloudvision: { auto: 0.85, confirm: 0.3 },
};

/** Motor desconhecido é tratado como o mais conservador possível. */
export const UNKNOWN_ENGINE_THRESHOLDS: EngineThresholds = { auto: null, confirm: 0.5 };

export function thresholdsFor(engineId: string): EngineThresholds {
  return ENGINE_THRESHOLDS[engineId] ?? UNKNOWN_ENGINE_THRESHOLDS;
}

/**
 * Campos cuja fraqueza impede o modo automático mesmo com score alto: um preço
 * certo com faixa errada ainda produz total errado (princípio nº 2 — preço é
 * estrutura, não escalar).
 */
const BLOCKING_WEAK_FIELDS = new Set(['tiers', 'basePrice', 'saleUnit']);

export function decideAcceptance(reading: LabelReading | null): AcceptanceDecision {
  if (!reading) {
    return { action: 'manual', reason: 'o motor não devolveu leitura utilizável' };
  }

  const { score } = reading.confidence;
  const limits = thresholdsFor(reading.provenance.engineId);

  if (score < limits.confirm) {
    return { action: 'manual', reason: `confiança ${score.toFixed(2)} abaixo de ${limits.confirm}` };
  }

  const blocking = reading.confidence.weakFields.filter((f) => BLOCKING_WEAK_FIELDS.has(f));
  if (blocking.length > 0) {
    return { action: 'confirm', reason: `campo frágil: ${blocking.join(', ')}` };
  }

  if (limits.auto !== null && score >= limits.auto) {
    return { action: 'auto', reason: `confiança ${score.toFixed(2)} ≥ ${limits.auto}` };
  }

  return {
    action: 'confirm',
    reason:
      limits.auto === null
        ? 'motor sem faixa automática segura — confirmação sempre'
        : `confiança ${score.toFixed(2)} abaixo de ${limits.auto}`,
  };
}
