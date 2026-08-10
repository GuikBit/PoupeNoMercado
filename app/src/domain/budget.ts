/**
 * Orçamento da compra (F2 de docs/00 §requisitos): verde → amarelo (85%) →
 * vermelho. Módulo puro, dinheiro sempre em centavos inteiros.
 *
 * O estado existe para o usuário decidir ANTES do caixa — é a razão de ser do
 * produto. Por isso o amarelo entra em 85%, não em 100%: avisar quando já não
 * dá mais tempo de reagir não serve para nada.
 */

export type BudgetState =
  /** Abaixo de 85% do teto. */
  | 'ok'
  /** De 85% até o teto, inclusive. */
  | 'warning'
  /** Acima do teto. */
  | 'over';

/** Fração do teto em que o aviso começa. */
export const WARNING_RATIO = 0.85;

export interface BudgetStatus {
  state: BudgetState;
  /** Teto definido pelo usuário, ou null quando não há. */
  limitCents: number | null;
  spentCents: number;
  /** Quanto ainda cabe. Negativo quando estourou; null sem teto. */
  remainingCents: number | null;
  /** Gasto / teto. null sem teto. Pode passar de 1. */
  ratio: number | null;
}

/**
 * Sem teto definido o estado é sempre 'ok' — o app não inventa um limite que o
 * usuário não pediu.
 */
export function budgetStatus(spentCents: number, limitCents: number | null): BudgetStatus {
  if (limitCents === null) {
    return { state: 'ok', limitCents: null, spentCents, remainingCents: null, ratio: null };
  }
  if (limitCents <= 0) {
    throw new Error(`Orçamento deve ser positivo, recebeu ${limitCents}`);
  }

  const ratio = spentCents / limitCents;
  const state: BudgetState = ratio > 1 ? 'over' : ratio >= WARNING_RATIO ? 'warning' : 'ok';

  return {
    state,
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    ratio,
  };
}
