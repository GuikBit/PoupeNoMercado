/**
 * Dump caso a caso das divergências do parser ATUAL contra o gabarito.
 *
 * O analyze:lab dá o agregado (M1–M7); este dá o detalhe que diz o que
 * consertar. Re-executa o parser sobre o OCR bruto salvo — nenhuma ida ao
 * mercado necessária.
 *
 * Uso:
 *   npm run lab:failures -- fixtures/lab-2026-08-08.cases.json
 *   npm run lab:failures -- <cases.json> --engine mlkit --only tiers
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PriceTier } from '../src/domain/pricing';
import type { LabCase } from '../src/lab/types';
import { parseLabel } from '../src/ocr/parser/parse';

const FALLBACK_SIZE = { width: 1200, height: 500 };

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const casesPath = resolve(process.argv[2] ?? 'fixtures/cases.json');
const engineId = flag('engine', 'cloudvision');
const only = flag('only', 'all'); // all | base | tiers
const cases = JSON.parse(readFileSync(casesPath, 'utf-8')) as LabCase[];

const fmt = (c: number | null | undefined): string => (c == null ? 'null' : (c / 100).toFixed(2));

function tierStr(tiers: PriceTier[] | undefined): string {
  const parts = (tiers ?? [])
    .map(
      (t) =>
        `${t.minQty}>${fmt(t.priceCents)}${t.condition.kind === 'storeCard' ? '(card)' : ''}`,
    )
    .sort();
  return parts.length > 0 ? parts.join(' ') : '(vazio)';
}

let divergentes = 0;
let baseErros = 0;
let tierErros = 0;

for (const labCase of cases) {
  const gt = labCase.groundTruth;
  const run = labCase.engines[engineId];
  if (!gt || !run || run.error !== undefined) continue;

  const reading = parseLabel(
    {
      blocks: run.ocrRaw,
      engineId,
      latencyMs: run.latencyMs,
      imageSize: run.imageSize ?? FALLBACK_SIZE,
    },
    { dominantHue: labCase.dominantHue ?? undefined },
  );

  const parsed = reading?.pricing;
  const baseErr = (parsed?.basePriceCents ?? null) !== gt.pricing.basePriceCents;
  const gtTiers = tierStr(gt.pricing.tiers);
  const gotTiers = tierStr(parsed?.tiers);
  const tierErr = gtTiers !== gotTiers;

  if (baseErr) baseErros++;
  if (tierErr) tierErros++;

  const mostrar =
    only === 'base' ? baseErr : only === 'tiers' ? tierErr : baseErr || tierErr;
  if (!mostrar) continue;
  divergentes++;

  console.log(`\n--- ${labCase.id.slice(0, 8)} [${labCase.labelType}] ${gt.rawName}`);
  console.log(`    confianca ${reading ? reading.confidence.score.toFixed(2) : 'ABSTEVE'}`);
  if (baseErr) {
    console.log(`  BASE   esperado ${fmt(gt.pricing.basePriceCents)}   obtido ${fmt(parsed?.basePriceCents)}`);
  }
  if (tierErr) {
    console.log(`  FAIXAS esperado ${gtTiers}`);
    console.log(`         obtido   ${gotTiers}`);
  }
  const texto = run.ocrRaw.map((b) => b.text.replace(/\n/g, ' / ')).join(' | ');
  console.log(`  TEXTO  ${texto.slice(0, 300)}`);
}

console.log(
  `\n${engineId}: ${divergentes} casos mostrados · ${baseErros} erros de base · ${tierErros} erros de faixa`,
);
