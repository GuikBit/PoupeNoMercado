/**
 * Depuração de um caso: mostra classificação, blocos posicionados normalizados
 * e o resultado do parser. Uso:
 *   npx tsx scripts/debug-case.ts fixtures/lab-2026-08-08.cases.json 4cb72abb [engine]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { LabCase } from '../src/lab/types';
import { flattenToLines } from '../src/ocr/parser/anchor';
import { classifyLayout } from '../src/ocr/parser/classify';
import { parseLabel } from '../src/ocr/parser/parse';

const FALLBACK_SIZE = { width: 1200, height: 500 };

const casesPath = resolve(process.argv[2] ?? 'fixtures/cases.json');
const idPrefix = process.argv[3] ?? '';
const engineId = process.argv[4] ?? 'cloudvision';

const cases = JSON.parse(readFileSync(casesPath, 'utf-8')) as LabCase[];
const labCase = cases.find((c) => c.id.startsWith(idPrefix));
if (!labCase) throw new Error(`caso ${idPrefix} nao encontrado`);

const run = labCase.engines[engineId];
if (!run) throw new Error(`motor ${engineId} ausente`);

const imageSize = run.imageSize ?? FALLBACK_SIZE;
const items = flattenToLines(run.ocrRaw);
const classification = classifyLayout({
  items,
  imageSize,
  dominantHue: labCase.dominantHue ?? undefined,
});

console.log(`caso ${labCase.id.slice(0, 8)} · motor ${engineId}`);
console.log(`imageSize ${imageSize.width}x${imageSize.height} (ar ${(imageSize.width / imageSize.height).toFixed(2)})`);
console.log(`dominantHue ${labCase.dominantHue ?? 'null'}`);
console.log(`classificacao -> ${classification.profileId} (score ${classification.score.toFixed(2)})`);
console.log(`\nBLOCOS NORMALIZADOS (${items.length}) — x y w h`);
for (const i of items) {
  const b = i.box;
  console.log(
    `  [${b.x.toFixed(3)} ${b.y.toFixed(3)} ${b.w.toFixed(3)} ${b.h.toFixed(3)}] conf ${i.confidence.toFixed(2)}  ${JSON.stringify(i.text)}`,
  );
}

const reading = parseLabel({ blocks: run.ocrRaw, engineId, latencyMs: run.latencyMs, imageSize }, {
  dominantHue: labCase.dominantHue ?? undefined,
});
console.log('\nRESULTADO');
if (!reading) {
  console.log('  ABSTEVE (pricing null ou rejeitado por V1/V2)');
} else {
  console.log(`  base ${reading.pricing.basePriceCents} · unidade ${reading.pricing.saleUnit}`);
  console.log(`  faixas ${JSON.stringify(reading.pricing.tiers)}`);
  console.log(`  confianca ${reading.confidence.score.toFixed(2)} ${reading.confidence.level}`);
  console.log(`  regras falhas ${JSON.stringify(reading.confidence.failedRules)}`);
  console.log(`  campos fracos ${JSON.stringify(reading.confidence.weakFields)}`);
}
console.log(`\nGABARITO base ${labCase.groundTruth?.pricing.basePriceCents} faixas ${JSON.stringify(labCase.groundTruth?.pricing.tiers)}`);
