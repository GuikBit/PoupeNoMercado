/**
 * Regenera os `labels/<nome>.expected.json` a partir do cases.json corrigido.
 *
 * Necessário porque os gabaritos foram corrigidos depois do export original
 * (9 casos, ver docs/resultados/lab-2026-08-10.md §3): os .expected.json
 * copiados do celular ficaram contradizendo o cases.json.
 *
 * Usa buildExportBundle — o mesmo código do app — em vez de reimplementar a
 * conversão para snake_case, para as duas saídas não divergirem.
 *
 * ⚠️ Força labelType = bahamas_gondola só para reproduzir a numeração ORIGINAL
 * dos arquivos (o seletor de tipo ficou travado na coleta e os .jpg já estão
 * nomeados assim). A reclassificação de tipo vive no cases.json.
 *
 * Uso: npx tsx scripts/rebuild-expected.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildExportBundle } from '../src/lab/exportBundle';
import type { LabCase } from '../src/lab/types';

const CORPUS = resolve('fixtures/lab-2026-08-08.cases.json');
const LABELS_DIR = resolve('fixtures/labels');

const cases = JSON.parse(readFileSync(CORPUS, 'utf-8')) as LabCase[];
const asOriginal = cases.map((c) => ({ ...c, labelType: 'bahamas_gondola' as const }));
const bundle = buildExportBundle(asOriginal);

let written = 0;
for (const file of bundle.jsonFiles) {
  if (!file.path.endsWith('.expected.json')) continue;
  const target = join(LABELS_DIR, file.path.replace(/^labels\//, ''));
  writeFileSync(target, `${JSON.stringify(file.content, null, 2)}\n`);
  written++;
}

console.log(`${written} arquivos .expected.json regravados em fixtures/labels/`);
