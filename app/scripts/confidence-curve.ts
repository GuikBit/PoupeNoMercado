/**
 * Curva de precisão × cobertura por limiar de confiança.
 *
 * Responde a pergunta que define a política de aceitação do app:
 * *a partir de qual confiança dá para preencher o preço sozinho sem passar
 * preço errado?*
 *
 * Para cada limiar t, entre as leituras com score ≥ t:
 *   precisão  = quantas têm o preço base correto  (meta: 100%)
 *   cobertura = que fração do total foi aceita     (quanto maior, melhor)
 *
 * Princípio nº 5: precisão vem primeiro. Cobertura é o que se otimiza DEPOIS
 * de garantir que nada errado passa.
 *
 * Uso: npm run confidence:curve [-- <cases.json>]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { LabCase } from '../src/lab/types';
import { parseLabel } from '../src/ocr/parser/parse';

const FALLBACK_SIZE = { width: 1200, height: 500 };
const THRESHOLDS = [0, 0.3, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

const casesPath = resolve(process.argv[2] ?? 'fixtures/lab-2026-08-08.cases.json');
const cases = JSON.parse(readFileSync(casesPath, 'utf-8')) as LabCase[];

interface Reading {
  score: number;
  correct: boolean;
  abstained: boolean;
}

function readingsFor(engineId: string): Reading[] {
  const out: Reading[] = [];
  for (const labCase of cases) {
    const gt = labCase.groundTruth;
    const run = labCase.engines[engineId];
    if (!gt || !run || run.error !== undefined) continue;

    const parsed = parseLabel(
      {
        blocks: run.ocrRaw,
        engineId,
        latencyMs: run.latencyMs,
        imageSize: run.imageSize ?? FALLBACK_SIZE,
      },
      { dominantHue: labCase.dominantHue ?? undefined },
    );
    out.push({
      score: parsed?.confidence.score ?? 0,
      correct: parsed?.pricing.basePriceCents === gt.pricing.basePriceCents,
      abstained: parsed === null,
    });
  }
  return out;
}

const pct = (n: number, d: number): string =>
  (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`).padStart(7);

for (const engineId of ['mlkit', 'cloudvision']) {
  const readings = readingsFor(engineId);
  if (readings.length === 0) continue;

  console.log(`\n═══ ${engineId.toUpperCase()} — ${readings.length} leituras com gabarito ═══`);

  // Distribuição do score: se o máximo do motor não alcança o limiar "alto"
  // de docs/02 §7.3 (0,85), esse limiar é inalcançável e a régua está errada.
  const scores = readings.filter((r) => !r.abstained).map((r) => r.score).sort((a, b) => a - b);
  const at = (p: number): string =>
    (scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] ?? 0).toFixed(2);
  console.log(
    `score: min ${(scores[0] ?? 0).toFixed(2)} · p25 ${at(0.25)} · mediana ${at(0.5)} · ` +
      `p75 ${at(0.75)} · max ${(scores[scores.length - 1] ?? 0).toFixed(2)}` +
      `   (absteve em ${readings.filter((r) => r.abstained).length})`,
  );

  console.log('limiar   aceitas   precisão   cobertura   erros aceitos');
  console.log('─'.repeat(58));

  let safest: { threshold: number; coverage: number } | null = null;
  for (const t of THRESHOLDS) {
    const accepted = readings.filter((r) => !r.abstained && r.score >= t);
    const correct = accepted.filter((r) => r.correct).length;
    const wrong = accepted.length - correct;
    console.log(
      `${t.toFixed(2).padStart(5)}   ${String(accepted.length).padStart(7)}   ` +
        `${pct(correct, accepted.length)}   ${pct(accepted.length, readings.length)}   ` +
        `${String(wrong).padStart(13)}`,
    );
    if (wrong === 0 && accepted.length > 0) {
      if (!safest || accepted.length > safest.coverage) {
        safest = { threshold: t, coverage: accepted.length };
      }
    }
  }

  if (safest) {
    console.log(
      `\n  → menor limiar com ZERO preço errado aceito: ${safest.threshold.toFixed(2)} ` +
        `(cobre ${safest.coverage}/${readings.length} = ${((safest.coverage / readings.length) * 100).toFixed(1)}%)`,
    );
  } else {
    console.log('\n  → NENHUM limiar atinge zero erro aceito. Não dá para auto-preencher.');
  }
}
