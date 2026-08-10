/**
 * Gate de regressão do parser (Etapa 3).
 *
 * Re-executa o parser sobre o corpus de campo e compara com
 * `fixtures/baseline.json`. Falha (exit 1) se qualquer acurácia cair ou se a
 * taxa de erro confiante subir — nenhuma mudança no parser pode piorar o que
 * já funcionava sem que alguém decida explicitamente.
 *
 * Uso:
 *   npm run lab:gate            # verifica
 *   npm run lab:gate -- --update # regrava o baseline (mudança deliberada)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { evaluateCases, summarize } from '../src/lab/metrics';
import type { LabCase } from '../src/lab/types';
import { parseLabel } from '../src/ocr/parser/parse';

const CORPUS = 'fixtures/lab-2026-08-08.cases.json';
const BASELINE = 'fixtures/baseline.json';
const FALLBACK_SIZE = { width: 1200, height: 500 };
/** Folga para ruído de ponto flutuante — não é tolerância a regressão. */
const EPSILON = 1e-9;

interface EngineBaseline {
  priceAccuracyAB: number | null;
  confidentErrorRate: number | null;
  unitAccuracy: number | null;
  nameSimilarityMean: number | null;
  abstentionCoverage: number | null;
  byType: Record<string, { priceAccuracy: number | null; tierAccuracy: number | null }>;
}

interface Baseline {
  corpus: string;
  totalCases: number;
  withGroundTruth: number;
  engines: Record<string, EngineBaseline>;
}

function buildReport(): Baseline {
  const cases = JSON.parse(readFileSync(resolve(CORPUS), 'utf-8')) as LabCase[];
  const evaluations = evaluateCases(cases, (run, labCase, engineId) =>
    parseLabel(
      {
        blocks: run.ocrRaw,
        engineId,
        latencyMs: run.latencyMs,
        imageSize: run.imageSize ?? FALLBACK_SIZE,
      },
      { dominantHue: labCase.dominantHue ?? undefined },
    ),
  );
  const report = summarize(cases, evaluations);

  const engines: Record<string, EngineBaseline> = {};
  for (const engine of report.engines) {
    const byType: EngineBaseline['byType'] = {};
    for (const t of engine.byType) {
      byType[t.labelType] = { priceAccuracy: t.priceAccuracy, tierAccuracy: t.tierAccuracy };
    }
    engines[engine.engineId] = {
      priceAccuracyAB: engine.priceAccuracyAB,
      confidentErrorRate: engine.confidentErrorRate,
      unitAccuracy: engine.unitAccuracy,
      nameSimilarityMean: engine.nameSimilarityMean,
      abstentionCoverage: engine.abstentionCoverage,
      byType,
    };
  }

  return {
    corpus: CORPUS,
    totalCases: report.totalCases,
    withGroundTruth: report.withGroundTruth,
    engines,
  };
}

const current = buildReport();
const baselinePath = resolve(BASELINE);

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`baseline regravado: ${join(BASELINE)}`);
  process.exit(0);
}

let baseline: Baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as Baseline;
} catch {
  console.error(`baseline ausente em ${BASELINE} — rode: npm run lab:gate -- --update`);
  process.exit(1);
}

const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const failures: string[] = [];

/** Métrica em que MAIOR é melhor. */
function checkUp(label: string, was: number | null, now: number | null): void {
  if (was === null) return;
  if (now === null || now < was - EPSILON) {
    failures.push(`${label}: ${pct(was)} → ${pct(now)}`);
  }
}

/** Métrica em que MENOR é melhor. */
function checkDown(label: string, was: number | null, now: number | null): void {
  if (was === null) return;
  if (now === null || now > was + EPSILON) {
    failures.push(`${label}: ${pct(was)} → ${pct(now)}`);
  }
}

for (const [engineId, was] of Object.entries(baseline.engines)) {
  const now = current.engines[engineId];
  if (!now) {
    failures.push(`motor ${engineId} sumiu do relatório`);
    continue;
  }
  checkUp(`${engineId} M1 (A+B)`, was.priceAccuracyAB, now.priceAccuracyAB);
  checkDown(`${engineId} M3 erro confiante`, was.confidentErrorRate, now.confidentErrorRate);
  checkUp(`${engineId} M4 unidade`, was.unitAccuracy, now.unitAccuracy);
  checkUp(`${engineId} M5 nome`, was.nameSimilarityMean, now.nameSimilarityMean);
  checkUp(`${engineId} M7 abstenção`, was.abstentionCoverage, now.abstentionCoverage);
  for (const [labelType, wasType] of Object.entries(was.byType)) {
    const nowType = now.byType[labelType];
    checkUp(`${engineId} M1 ${labelType}`, wasType.priceAccuracy, nowType?.priceAccuracy ?? null);
    checkUp(`${engineId} M2 ${labelType}`, wasType.tierAccuracy, nowType?.tierAccuracy ?? null);
  }
}

if (current.withGroundTruth < baseline.withGroundTruth) {
  failures.push(
    `casos com gabarito: ${baseline.withGroundTruth} → ${current.withGroundTruth}`,
  );
}

if (failures.length > 0) {
  console.error(`\n✗ REGRESSÃO do parser contra ${BASELINE}:\n`);
  for (const f of failures) console.error(`   ${f}`);
  console.error(
    '\nSe a mudança for deliberada, regrave: npm run lab:gate -- --update\n',
  );
  process.exit(1);
}

console.log(`✓ sem regressão contra ${BASELINE} (${current.withGroundTruth} casos com gabarito)`);
