/**
 * Compara as variantes de pré-processamento (Etapa 3).
 *
 * Junta o resultado do lote (OCR bruto por variante, gerado no device) com o
 * gabarito corrigido do corpus e roda o parser ATUAL sobre cada combinação.
 * A variante `none` é a linha de base — o que importa é o delta contra ela.
 *
 * Uso:
 *   npm run analyze:batch -- <batch-*.json> [cases.json]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BatchReport } from '../src/lab/batch';
import { trigramSimilarity } from '../src/lab/metrics';
import type { LabCase } from '../src/lab/types';
import { parseLabel } from '../src/ocr/parser/parse';
import { findVariant } from '../src/ocr/preprocess/variants';

const FALLBACK_SIZE = { width: 1200, height: 500 };
const CONFIDENT = 0.85;

const batchPath = resolve(process.argv[2] ?? '');
const casesPath = resolve(process.argv[3] ?? 'fixtures/lab-2026-08-08.cases.json');

const report = JSON.parse(readFileSync(batchPath, 'utf-8')) as BatchReport;
const cases = JSON.parse(readFileSync(casesPath, 'utf-8')) as LabCase[];
const byId = new Map(cases.map((c) => [c.id, c]));

/** As metas de docs/06 §6 são definidas sobre os tipos A+B, não sobre o total. */
const AB_TYPES = new Set(['bahamas_oferta', 'bahamas_gondola']);

interface VariantStats {
  variant: string;
  scored: number;
  abScored: number;
  abOk: number;
  priceOk: number;
  tiersOk: number;
  confidentWrong: number;
  abstained: number;
  nameSim: number;
  engineErrors: number;
  latencySum: number;
  preprocessSum: number;
  latencyCount: number;
}

function tierKey(t: { minQty: number; priceCents: number; condition: { kind: string } }): string {
  return `${t.minQty}:${t.priceCents}:${t.condition.kind === 'storeCard' ? 'card' : 'none'}`;
}

function tiersEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  const ka = (a as Parameters<typeof tierKey>[0][]).map(tierKey).sort();
  const kb = (b as Parameters<typeof tierKey>[0][]).map(tierKey).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

const stats = new Map<string, VariantStats>();
const blank = (variant: string): VariantStats => ({
  variant,
  scored: 0,
  abScored: 0,
  abOk: 0,
  priceOk: 0,
  tiersOk: 0,
  confidentWrong: 0,
  abstained: 0,
  nameSim: 0,
  engineErrors: 0,
  latencySum: 0,
  preprocessSum: 0,
  latencyCount: 0,
});

/** Casos que a linha de base errava e a variante acerta (e vice-versa). */
const recovered = new Map<string, string[]>();
const broken = new Map<string, string[]>();
const baselineCorrect = new Set<string>();
/** caseId → variante → acertou o preço base. Base das políticas condicionais. */
const okByCase = new Map<string, Map<string, boolean>>();

for (const pass of [0, 1]) {
  for (const caseResult of report.cases) {
    const labCase = byId.get(caseResult.caseId);
    const gt = labCase?.groundTruth;
    if (!labCase || !gt) continue;

    for (const run of caseResult.runs) {
      if (pass === 0 && run.variant !== 'none') continue;
      if (pass === 1 && run.variant === 'none') continue;

      const s = stats.get(run.variant) ?? blank(run.variant);
      stats.set(run.variant, s);

      if (run.latencyMs >= 0) {
        s.latencySum += run.latencyMs;
        s.preprocessSum += Math.max(0, run.preprocessMs);
        s.latencyCount++;
      }
      if (run.error) {
        s.engineErrors++;
        s.scored++;
        s.abstained++;
        continue;
      }

      const reading = parseLabel(
        {
          blocks: run.ocrRaw,
          engineId: report.engineId,
          latencyMs: run.latencyMs,
          imageSize: run.imageSize ?? FALLBACK_SIZE,
        },
        { dominantHue: caseResult.dominantHue ?? undefined },
      );

      s.scored++;
      const priceOk = reading?.pricing.basePriceCents === gt.pricing.basePriceCents;
      if (priceOk) s.priceOk++;
      if (AB_TYPES.has(labCase.labelType)) {
        s.abScored++;
        if (priceOk) s.abOk++;
      }
      const perCase = okByCase.get(caseResult.caseId) ?? new Map<string, boolean>();
      perCase.set(run.variant, priceOk);
      okByCase.set(caseResult.caseId, perCase);
      if (reading && tiersEqual(reading.pricing.tiers, gt.pricing.tiers)) s.tiersOk++;
      if (!reading) s.abstained++;
      if (!priceOk && (reading?.confidence.score ?? 0) >= CONFIDENT) s.confidentWrong++;
      s.nameSim += reading ? trigramSimilarity(reading.product.rawName, gt.rawName) : 0;

      const short = `${caseResult.caseId.slice(0, 8)} ${gt.rawName.slice(0, 26)}`;
      if (run.variant === 'none') {
        if (priceOk) baselineCorrect.add(caseResult.caseId);
      } else if (priceOk && !baselineCorrect.has(caseResult.caseId)) {
        recovered.set(run.variant, [...(recovered.get(run.variant) ?? []), short]);
      } else if (!priceOk && baselineCorrect.has(caseResult.caseId)) {
        broken.set(run.variant, [...(broken.get(run.variant) ?? []), short]);
      }
    }
  }
}

const pct = (n: number, d: number): string =>
  (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`).padStart(6);
const base = stats.get('none');

console.log(`\nLote: ${batchPath}`);
console.log(`Motor: ${report.engineId} · ${report.cases.length} casos · gabarito de ${casesPath}\n`);
console.log('variante            M1 tudo     Δ   M1 A+B  M2 faixa  M3 conf  abstém  ms(pré+OCR)');
console.log('─'.repeat(88));

const ordered = [...stats.values()].sort((a, b) =>
  a.variant === 'none' ? -1 : b.variant === 'none' ? 1 : b.priceOk - a.priceOk,
);

for (const s of ordered) {
  const delta =
    base && s.variant !== 'none'
      ? `${s.priceOk - base.priceOk >= 0 ? '+' : ''}${s.priceOk - base.priceOk}`
      : '';
  const pre = s.latencyCount > 0 ? Math.round(s.preprocessSum / s.latencyCount) : 0;
  const ocr = s.latencyCount > 0 ? Math.round(s.latencySum / s.latencyCount) : 0;
  console.log(
    `${s.variant.padEnd(20)}${pct(s.priceOk, s.scored)}${String(delta).padStart(6)}  ` +
      `${pct(s.abOk, s.abScored)}   ${pct(s.tiersOk, s.scored)}   ` +
      `${pct(s.confidentWrong, s.scored)}  ${pct(s.abstained, s.scored)}  ` +
      `${String(pre).padStart(4)}+${String(ocr).padStart(4)}`,
  );
}

console.log('\nHIPÓTESES');
for (const s of ordered) {
  const v = findVariant(s.variant);
  if (v) console.log(`  ${v.id.padEnd(20)} ${v.hypothesis}`);
}

console.log('\nMUDANÇAS EM RELAÇÃO À LINHA DE BASE');
for (const s of ordered) {
  if (s.variant === 'none') continue;
  const rec = recovered.get(s.variant) ?? [];
  const brk = broken.get(s.variant) ?? [];
  if (rec.length === 0 && brk.length === 0) continue;
  console.log(`\n  ${s.variant}  (+${rec.length} / −${brk.length})`);
  for (const r of rec) console.log(`    ✓ recuperou  ${r}`);
  for (const b of brk) console.log(`    ✗ quebrou    ${b}`);
}

// ── Políticas condicionais ────────────────────────────────────────────────
// O lote guardou o OCR bruto de TODAS as variantes, então dá para simular
// "usar X quando <condição>, senão Y" sem voltar ao device.
const YELLOW_MIN = 35;
const YELLOW_MAX = 75;

function evaluatePolicy(pick: (hue: number | null, labelType: string) => string): {
  ok: number;
  total: number;
  abOk: number;
  abTotal: number;
} {
  let ok = 0;
  let total = 0;
  let abOk = 0;
  let abTotal = 0;
  for (const caseResult of report.cases) {
    const labCase = byId.get(caseResult.caseId);
    if (!labCase?.groundTruth) continue;
    const chosen = pick(caseResult.dominantHue, labCase.labelType);
    const hit = okByCase.get(caseResult.caseId)?.get(chosen) ?? false;
    total++;
    if (hit) ok++;
    if (AB_TYPES.has(labCase.labelType)) {
      abTotal++;
      if (hit) abOk++;
    }
  }
  return { ok, total, abOk, abTotal };
}

const isYellow = (hue: number | null): boolean =>
  hue !== null && hue >= YELLOW_MIN && hue <= YELLOW_MAX;

const policies: { label: string; pick: (hue: number | null, labelType: string) => string }[] = [
  { label: 'sempre none (base)', pick: () => 'none' },
  { label: 'sempre stretch', pick: () => 'stretch' },
  { label: 'stretch se amarelo', pick: (hue) => (isYellow(hue) ? 'stretch' : 'none') },
  { label: 'unsharp se amarelo', pick: (hue) => (isYellow(hue) ? 'unsharp' : 'none') },
];

console.log('\nPOLÍTICAS CONDICIONAIS (simuladas sobre o mesmo lote)');
for (const p of policies) {
  const r = evaluatePolicy(p.pick);
  console.log(
    `  ${p.label.padEnd(24)} tudo ${pct(r.ok, r.total)}   A+B ${pct(r.abOk, r.abTotal)}`,
  );
}

// Teto teórico: escolher a MELHOR variante caso a caso, com gabarito na mão.
// Não é implementável (exige saber a resposta), mas delimita o quanto ainda
// existe para ganhar nessa direção. Se o teto já é baixo, a direção morreu.
let oracle = 0;
let oracleAb = 0;
let oracleTotal = 0;
let oracleAbTotal = 0;
for (const caseResult of report.cases) {
  const labCase = byId.get(caseResult.caseId);
  if (!labCase?.groundTruth) continue;
  const any = [...(okByCase.get(caseResult.caseId)?.values() ?? [])].some(Boolean);
  oracleTotal++;
  if (any) oracle++;
  if (AB_TYPES.has(labCase.labelType)) {
    oracleAbTotal++;
    if (any) oracleAb++;
  }
}
console.log(
  `\n  TETO TEÓRICO (melhor variante por caso, com gabarito na mão):\n` +
    `    tudo ${pct(oracle, oracleTotal)}   A+B ${pct(oracleAb, oracleAbTotal)}` +
    '\n    Não implementável — delimita o máximo que pré-processamento pode dar.',
);

if (base) {
  console.log(
    `\nLinha de base acerta ${base.priceOk}/${base.scored}. ` +
      'Uma variante só vale a pena se recupera mais do que quebra E não sobe M3.',
  );
}
