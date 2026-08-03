/**
 * Análise do Laboratório de Etiquetas — relatório M1–M7 (docs/06 §5 e §7).
 *
 * Re-executa o parser ATUAL sobre o OCR bruto salvo em cada caso: toda
 * mudança no parser é validada em segundos contra o gabarito, sem voltar
 * ao mercado.
 *
 * Uso:
 *   npm run analyze:lab                       # lê app/fixtures/cases.json
 *   npm run analyze:lab -- caminho/cases.json # ou um export específico
 */
 
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { evaluateCases, renderReport, summarize } from '../src/lab/metrics';
import type { LabCase } from '../src/lab/types';
import { parseLabel } from '../src/ocr/parser/parse';

/** Casos antigos não gravaram imageSize — proporção típica de gôndola. */
const FALLBACK_SIZE = { width: 1200, height: 500 };

function resolveCasesPath(arg: string | undefined): string {
  const target = resolve(arg ?? join('fixtures', 'cases.json'));
  const stats = statSync(target);
  return stats.isDirectory() ? join(target, 'cases.json') : target;
}

const casesPath = resolveCasesPath(process.argv[2]);
const cases = JSON.parse(readFileSync(casesPath, 'utf-8')) as LabCase[];

let missingSize = 0;
const evaluations = evaluateCases(cases, (run, labCase, engineId) => {
  if (!run.imageSize) missingSize++;
  return parseLabel(
    {
      blocks: run.ocrRaw,
      engineId,
      latencyMs: run.latencyMs,
      imageSize: run.imageSize ?? FALLBACK_SIZE,
    },
    { dominantHue: labCase.dominantHue ?? undefined },
  );
});

console.log(`Fonte: ${casesPath}\n`);
console.log(renderReport(summarize(cases, evaluations)));
if (missingSize > 0) {
  console.log(
    `\n⚠ ${missingSize} leituras sem imageSize gravado (casos antigos) — usando ${FALLBACK_SIZE.width}x${FALLBACK_SIZE.height}; a classificação por proporção pode divergir.`,
  );
}
