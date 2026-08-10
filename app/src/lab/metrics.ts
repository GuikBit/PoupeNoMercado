/**
 * Métricas M1–M7 do Laboratório (docs/06-PLANO-VALIDACAO.md §5).
 * Módulo PURO: recebe os casos e uma função de parse injetada — o script
 * scripts/analyze-lab.ts injeta o parser real e imprime o relatório.
 *
 * As métricas re-executam o parser sobre o OCR bruto salvo: é isso que
 * permite validar qualquer mudança no parser em segundos, sem voltar ao
 * mercado. Latência (M6) usa o valor medido no device.
 */
import type { PriceTier } from '../domain/pricing';
import type { LabelReading } from '../domain/reading';
import { trigramSimilarity } from '../domain/similarity';
import type { EngineRun, LabCase } from './types';

export type ParseRunFn = (
  run: EngineRun,
  labCase: LabCase,
  engineId: string,
) => LabelReading | null;

export interface CaseEvaluation {
  caseId: string;
  labelType: string;
  engineId: string;
  hasGroundTruth: boolean;
  engineFailed: boolean;
  abstained: boolean;
  /** 0 quando o parser se absteve. */
  confidence: number;
  latencyMs: number;
  priceCorrect?: boolean;
  parsedPriceCents?: number | null;
  expectedPriceCents?: number;
  tiersCorrect?: boolean;
  unitCorrect?: boolean;
  nameSimilarity?: number;
}

// A similaridade vive no domínio (src/domain/similarity.ts) — é usada tanto
// aqui quanto pelo casamento com a lista. Re-exportada para não quebrar quem
// já importava daqui.
export { trigramSimilarity };

function tierKey(tier: PriceTier): string {
  const cond = tier.condition.kind === 'storeCard' ? 'card' : 'none';
  return `${tier.minQty}:${tier.priceCents}:${cond}`;
}

function tiersEqual(a: PriceTier[], b: PriceTier[]): boolean {
  const ka = a.map(tierKey).sort();
  const kb = b.map(tierKey).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

export function evaluateCases(cases: LabCase[], parseRun: ParseRunFn): CaseEvaluation[] {
  const out: CaseEvaluation[] = [];
  for (const labCase of cases) {
    for (const [engineId, run] of Object.entries(labCase.engines)) {
      const engineFailed = run.error !== undefined;
      const parsed = engineFailed ? null : parseRun(run, labCase, engineId);
      const gt = labCase.groundTruth;

      const evaluation: CaseEvaluation = {
        caseId: labCase.id,
        labelType: labCase.labelType,
        engineId,
        hasGroundTruth: gt !== null,
        engineFailed,
        abstained: parsed === null,
        confidence: parsed?.confidence.score ?? 0,
        latencyMs: run.latencyMs,
      };

      if (gt && !engineFailed) {
        evaluation.parsedPriceCents = parsed?.pricing.basePriceCents ?? null;
        evaluation.expectedPriceCents = gt.pricing.basePriceCents;
        evaluation.priceCorrect = parsed?.pricing.basePriceCents === gt.pricing.basePriceCents;
        evaluation.tiersCorrect = parsed ? tiersEqual(parsed.pricing.tiers, gt.pricing.tiers) : false;
        evaluation.unitCorrect = parsed ? parsed.pricing.saleUnit === gt.pricing.saleUnit : false;
        evaluation.nameSimilarity = parsed ? trigramSimilarity(parsed.product.rawName, gt.rawName) : 0;
      }
      out.push(evaluation);
    }
  }
  return out;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

export interface TypeSummary {
  labelType: string;
  scored: number;
  priceAccuracy: number | null;
  tierAccuracy: number | null;
}

export interface EngineSummary {
  engineId: string;
  byType: TypeSummary[];
  /** M1 agregada nos tipos A+B (meta ≥ 95%). */
  priceAccuracyAB: number | null;
  /** M3 — errado E confiança ≥ 0.85, sobre casos com gabarito (meta ≤ 1%). */
  confidentErrorRate: number | null;
  confidentErrors: CaseEvaluation[];
  /** M4 (meta ≥ 98%). */
  unitAccuracy: number | null;
  /** M5 média (meta ≥ 0.85). */
  nameSimilarityMean: number | null;
  /** M6 (meta p95 ≤ 800 ms). */
  latencyP50: number;
  latencyP95: number;
  /** M7 — dos errados, % com confiança < 0.60 (meta ≥ 70%). */
  abstentionCoverage: number | null;
  engineFailures: number;
}

export interface LabReport {
  totalCases: number;
  withGroundTruth: number;
  engines: EngineSummary[];
  verdictTally: Record<string, number>;
}

function ratio(hits: number, total: number): number | null {
  return total === 0 ? null : hits / total;
}

const AB_TYPES = new Set(['bahamas_oferta', 'bahamas_gondola']);

export function summarize(cases: LabCase[], evaluations: CaseEvaluation[]): LabReport {
  const engineIds = [...new Set(evaluations.map((e) => e.engineId))].sort();
  const labelTypes = [...new Set(evaluations.map((e) => e.labelType))].sort();

  const engines: EngineSummary[] = engineIds.map((engineId) => {
    const all = evaluations.filter((e) => e.engineId === engineId);
    const scored = all.filter((e) => e.hasGroundTruth && !e.engineFailed);

    const byType: TypeSummary[] = labelTypes.map((labelType) => {
      const rows = scored.filter((e) => e.labelType === labelType);
      return {
        labelType,
        scored: rows.length,
        priceAccuracy: ratio(rows.filter((e) => e.priceCorrect).length, rows.length),
        tierAccuracy: ratio(rows.filter((e) => e.tiersCorrect).length, rows.length),
      };
    });

    const ab = scored.filter((e) => AB_TYPES.has(e.labelType));
    const wrong = scored.filter((e) => e.priceCorrect === false);
    const confidentErrors = wrong.filter((e) => e.confidence >= 0.85);
    const latencies = all.filter((e) => e.latencyMs >= 0).map((e) => e.latencyMs);
    const withName = scored.filter((e) => e.nameSimilarity !== undefined);

    return {
      engineId,
      byType,
      priceAccuracyAB: ratio(ab.filter((e) => e.priceCorrect).length, ab.length),
      confidentErrorRate: ratio(confidentErrors.length, scored.length),
      confidentErrors,
      unitAccuracy: ratio(scored.filter((e) => e.unitCorrect).length, scored.length),
      nameSimilarityMean:
        withName.length === 0
          ? null
          : withName.reduce((sum, e) => sum + (e.nameSimilarity ?? 0), 0) / withName.length,
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      abstentionCoverage: ratio(wrong.filter((e) => e.confidence < 0.6).length, wrong.length),
      engineFailures: all.filter((e) => e.engineFailed).length,
    };
  });

  const verdictTally: Record<string, number> = {};
  for (const labCase of cases) {
    const best = labCase.humanVerdict?.bestEngine ?? 'sem veredito';
    verdictTally[best] = (verdictTally[best] ?? 0) + 1;
  }

  return {
    totalCases: cases.length,
    withGroundTruth: cases.filter((c) => c.groundTruth !== null).length,
    engines,
    verdictTally,
  };
}

function pct(value: number | null): string {
  return value === null ? '   —  ' : `${(value * 100).toFixed(1).padStart(5)}%`;
}

function goal(value: number | null, target: number, higherIsBetter = true): string {
  if (value === null) return ' ';
  return (higherIsBetter ? value >= target : value <= target) ? '✓' : '✗';
}

/** Relatório em texto no formato de docs/06 §7. */
export function renderReport(report: LabReport): string {
  const lines: string[] = [];
  const engines = report.engines;
  const header = engines.map((e) => e.engineId.padStart(14)).join('');

  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(
    ` LABORATÓRIO DE ETIQUETAS — ${report.totalCases} casos (${report.withGroundTruth} com gabarito)`,
  );
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('M1 · ACURÁCIA DE PREÇO (por tipo)');
  lines.push(`  tipo            ${header}`);
  const types = engines[0]?.byType.map((t) => t.labelType) ?? [];
  for (const labelType of types) {
    const cols = engines
      .map((e) => {
        const t = e.byType.find((x) => x.labelType === labelType);
        return `${pct(t?.priceAccuracy ?? null)} (${t?.scored ?? 0})`.padStart(14);
      })
      .join('');
    lines.push(`  ${labelType.padEnd(18)}${cols}`);
  }
  lines.push(
    `  A+B (meta 95%)  ${engines
      .map((e) => `${pct(e.priceAccuracyAB)} ${goal(e.priceAccuracyAB, 0.95)}`.padStart(14))
      .join('')}`,
  );
  lines.push('');
  lines.push(
    `M2 · FAIXAS (gôndola)${engines
      .map((e) => {
        const t = e.byType.find((x) => x.labelType === 'bahamas_gondola');
        return `${pct(t?.tierAccuracy ?? null)} ${goal(t?.tierAccuracy ?? null, 0.9)}`.padStart(13);
      })
      .join('')}`,
  );
  lines.push(
    `M3 · ERRO CONFIANTE ${engines
      .map((e) => `${pct(e.confidentErrorRate)} ${goal(e.confidentErrorRate, 0.01, false)}`.padStart(13))
      .join('')}  ← crítico`,
  );
  lines.push(
    `M4 · UNIDADE        ${engines
      .map((e) => `${pct(e.unitAccuracy)} ${goal(e.unitAccuracy, 0.98)}`.padStart(13))
      .join('')}`,
  );
  lines.push(
    `M5 · NOME (trigram) ${engines
      .map((e) =>
        `${e.nameSimilarityMean === null ? '  —' : e.nameSimilarityMean.toFixed(2)} ${goal(e.nameSimilarityMean, 0.85)}`.padStart(13),
      )
      .join('')}`,
  );
  lines.push(
    `M6 · LATÊNCIA p50/95${engines
      .map((e) => `${e.latencyP50}/${e.latencyP95}ms ${goal(e.latencyP95, 800, false)}`.padStart(15))
      .join('')}`,
  );
  lines.push(
    `M7 · ABSTENÇÃO      ${engines
      .map((e) => `${pct(e.abstentionCoverage)} ${goal(e.abstentionCoverage, 0.7)}`.padStart(13))
      .join('')}`,
  );
  lines.push(
    `FALHAS DE MOTOR     ${engines.map((e) => String(e.engineFailures).padStart(13)).join('')}`,
  );
  lines.push('');
  lines.push('VEREDITO HUMANO');
  for (const [engine, count] of Object.entries(report.verdictTally)) {
    lines.push(`  ${engine.padEnd(14)} ${count}`);
  }

  const allConfidentErrors = engines.flatMap((e) =>
    e.confidentErrors.map((err) => ({ engineId: e.engineId, err })),
  );
  if (allConfidentErrors.length > 0) {
    lines.push('');
    lines.push('CASOS COM ERRO CONFIANTE (revisar manualmente)');
    for (const { engineId, err } of allConfidentErrors) {
      lines.push(
        `  ${err.caseId.slice(0, 8)} ${engineId}  esperado ${err.expectedPriceCents}  obteve ${err.parsedPriceCents}  conf ${err.confidence.toFixed(2)}`,
      );
    }
  }
  lines.push('═══════════════════════════════════════════════════════════');
  return lines.join('\n');
}
