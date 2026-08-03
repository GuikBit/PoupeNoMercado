/**
 * Regras de plausibilidade (E5) — docs/02-MOTOR-RECONHECIMENTO.md §7.1.
 * Executadas em ordem; cada falha registra em failedRules e aplica penalidade.
 * V1 e V2 rejeitam a leitura por completo.
 */
import type { PricingPolicy } from '../../domain/pricing';

export interface ValidationInput {
  pricing: PricingPolicy;
  rawName: string;
  /** ISO 8601, quando extraída. */
  labelDate?: string;
  /** "Agora" injetável para teste do V10. */
  now?: Date;
}

export interface ValidationResult {
  rejected: boolean;
  failedRules: string[];
  weakFields: string[];
  /** Soma das penalidades (0..1). */
  penalty: number;
}

/** Extrai o tamanho da embalagem do nome ("750ML", "1LT", "120G") na unidade base (L ou KG). */
function packageSizeFromName(name: string): { amount: number; unit: 'KG' | 'L' } | null {
  const m = /(\d+(?:[,.]\d+)?)\s*(ML|LT|L|KG|G)\b/.exec(name);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const value = Number(m[1].replace(',', '.'));
  switch (m[2]) {
    case 'ML':
      return { amount: value / 1000, unit: 'L' };
    case 'LT':
    case 'L':
      return { amount: value, unit: 'L' };
    case 'G':
      return { amount: value / 1000, unit: 'KG' };
    case 'KG':
      return { amount: value, unit: 'KG' };
    default:
      return null;
  }
}

export function validateReading(input: ValidationInput): ValidationResult {
  const { pricing, rawName } = input;
  const failedRules: string[] = [];
  const weakFields: string[] = [];
  let penalty = 0;
  let rejected = false;

  // V1 — preço base dentro da faixa plausível (R$ 0,01 a R$ 9.999,99)
  if (pricing.basePriceCents < 1 || pricing.basePriceCents > 999_999) {
    failedRules.push('V1');
    rejected = true;
  }

  // V2 — centavos são inteiros (equivale a "exatamente 2 casas decimais")
  if (!Number.isInteger(pricing.basePriceCents)) {
    failedRules.push('V2');
    rejected = true;
  }

  // V3 — toda faixa deve ser mais barata que o preço base
  if (pricing.tiers.some((t) => t.priceCents >= pricing.basePriceCents)) {
    failedRules.push('V3');
    penalty += 0.3;
  }

  // V4 — preços monotonicamente decrescentes por minQty crescente (sem condição de cartão)
  const unconditional = [...pricing.tiers]
    .filter((t) => t.condition.kind === 'none')
    .sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < unconditional.length; i++) {
    const prev = unconditional[i - 1];
    const curr = unconditional[i];
    if (prev && curr && curr.priceCents > prev.priceCents) {
      failedRules.push('V4');
      penalty += 0.25;
      break;
    }
  }

  // V5 — preço riscado deve ser maior que o preço atual
  if (
    pricing.previousPriceCents !== undefined &&
    pricing.previousPriceCents <= pricing.basePriceCents
  ) {
    failedRules.push('V5');
    penalty += 0.2;
  }

  // V6 — preço por medida coerente com o base (±40%), quando o tamanho é extraível do nome
  if (pricing.measurePrice) {
    const size = packageSizeFromName(rawName);
    if (size && (size.unit === pricing.measurePrice.unit as string)) {
      const impliedPerUnit = pricing.basePriceCents / size.amount;
      const declaredPerUnit = pricing.measurePrice.valueCents / pricing.measurePrice.perAmount;
      const ratio = impliedPerUnit / declaredPerUnit;
      if (ratio < 0.6 || ratio > 1.4) {
        failedRules.push('V6');
        penalty += 0.15;
        weakFields.push('measurePrice');
      }
    }
  }

  // V7 — item por quilo acima de R$ 200/kg é implausível
  if (pricing.saleUnit === 'KG' && pricing.basePriceCents > 20_000) {
    failedRules.push('V7');
    penalty += 0.2;
  }

  // V8 — item por unidade acima de R$ 500 é implausível em supermercado
  if (pricing.saleUnit === 'UN' && pricing.basePriceCents > 50_000) {
    failedRules.push('V8');
    penalty += 0.15;
  }

  // V9 — nome minimamente legível: ≥ 3 caracteres e ≥ 1 vogal
  if (rawName.trim().length < 3 || !/[AEIOU]/i.test(rawName)) {
    failedRules.push('V9');
    penalty += 0.2;
    weakFields.push('rawName');
  }

  // V10 — data da etiqueta até 90 dias no passado
  if (input.labelDate) {
    const now = input.now ?? new Date();
    const date = new Date(input.labelDate);
    if (!Number.isNaN(date.getTime())) {
      const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
      if (ageDays > 90) {
        failedRules.push('V10');
        penalty += 0.1;
      }
    }
  }

  return { rejected, failedRules, weakFields, penalty: Math.min(1, penalty) };
}
