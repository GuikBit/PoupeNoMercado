/**
 * Exportação dos casos no formato de fixtures de docs/02 §9:
 *
 *   labels/<label_type>_<nnn>.jpg               ← imagem retificada (entrada dos motores)
 *   labels/<label_type>_<nnn>.expected.json     ← gabarito em snake_case
 *   labels/<label_type>_<nnn>.<engine>.raw.json ← OCR bruto por motor
 *   index.json                                  ← sumário de todos os casos
 *   cases.json                                  ← dump completo (reprocessável)
 *
 * O builder é puro (testável em node); a escrita em disco e o
 * compartilhamento ficam no executor.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import type { GroundTruth, LabCase } from './types';

interface ExportJsonFile {
  /** Caminho relativo à raiz do export. */
  path: string;
  content: unknown;
}

interface ExportImage {
  /** Caminho relativo à raiz do export. */
  path: string;
  /** Caminho da origem, relativo a Paths.document. */
  sourcePath: string;
}

export interface ExportBundle {
  jsonFiles: ExportJsonFile[];
  images: ExportImage[];
}

/** Gabarito em snake_case, como no exemplo de docs/06 §3. */
function groundTruthToExpected(gt: GroundTruth): Record<string, unknown> {
  return {
    raw_name: gt.rawName,
    base_price_cents: gt.pricing.basePriceCents,
    tiers: gt.pricing.tiers.map((tier) => ({
      min_qty: tier.minQty,
      price_cents: tier.priceCents,
      condition:
        tier.condition.kind === 'storeCard'
          ? { kind: 'store_card', card_name: tier.condition.cardName }
          : { kind: 'none' },
    })),
    sale_unit: gt.pricing.saleUnit,
    ...(gt.pricing.measurePrice
      ? {
          measure_price: {
            value_cents: gt.pricing.measurePrice.valueCents,
            unit: gt.pricing.measurePrice.unit,
            per_amount: gt.pricing.measurePrice.perAmount,
          },
        }
      : {}),
    ...(gt.internalCode ? { internal_code: gt.internalCode } : {}),
  };
}

export function buildExportBundle(cases: LabCase[]): ExportBundle {
  // Numeração estável por tipo, na ordem de captura.
  const ordered = [...cases].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const counters = new Map<string, number>();
  const jsonFiles: ExportJsonFile[] = [];
  const images: ExportImage[] = [];
  const index: Record<string, unknown>[] = [];

  for (const labCase of ordered) {
    const seq = (counters.get(labCase.labelType) ?? 0) + 1;
    counters.set(labCase.labelType, seq);
    const baseName = `${labCase.labelType}_${String(seq).padStart(3, '0')}`;

    images.push({
      path: `labels/${baseName}.jpg`,
      sourcePath: labCase.rectifiedPath ?? labCase.imagePath,
    });

    if (labCase.groundTruth) {
      jsonFiles.push({
        path: `labels/${baseName}.expected.json`,
        content: groundTruthToExpected(labCase.groundTruth),
      });
    }

    const engineSummaries: Record<string, unknown> = {};
    for (const [engineId, run] of Object.entries(labCase.engines)) {
      jsonFiles.push({
        path: `labels/${baseName}.${engineId}.raw.json`,
        content: {
          engine_id: engineId,
          latency_ms: run.latencyMs,
          ...(run.error ? { error: run.error } : {}),
          blocks: run.ocrRaw,
        },
      });
      engineSummaries[engineId] = {
        latency_ms: run.latencyMs,
        confidence: run.confidence,
        parsed_base_price_cents: run.parsed?.pricing.basePriceCents ?? null,
        ...(run.error ? { error: run.error } : {}),
      };
    }

    index.push({
      id: labCase.id,
      file: baseName,
      label_type: labCase.labelType,
      captured_at: labCase.capturedAt,
      detect_method: labCase.detectMethod,
      dominant_hue: labCase.dominantHue,
      capture_conditions: labCase.captureConditions,
      has_ground_truth: labCase.groundTruth !== null,
      human_verdict: labCase.humanVerdict,
      engines: engineSummaries,
    });
  }

  jsonFiles.push({ path: 'index.json', content: index });
  jsonFiles.push({ path: 'cases.json', content: ordered });
  return { jsonFiles, images };
}

/**
 * Escreve o bundle em Paths.document/exports/lab-<data>/ e compartilha o
 * index.json. As imagens ficam na árvore para transferência via `adb pull`
 * (expo-sharing compartilha um arquivo por vez).
 */
export async function exportCases(cases: LabCase[], dateIso: string): Promise<string> {
  const bundle = buildExportBundle(cases);
  const root = new Directory(Paths.document, `exports/lab-${dateIso.slice(0, 10)}`);
  if (!root.exists) {
    root.create({ intermediates: true });
  }
  const labels = new Directory(root, 'labels');
  if (!labels.exists) {
    labels.create();
  }

  for (const jsonFile of bundle.jsonFiles) {
    new File(root, jsonFile.path).write(JSON.stringify(jsonFile.content, null, 2));
  }
  for (const image of bundle.images) {
    const source = new File(Paths.document, image.sourcePath);
    const dest = new File(root, image.path);
    if (source.exists && !dest.exists) {
      source.copy(dest);
    }
  }

  if (await isAvailableAsync()) {
    await shareAsync(new File(root, 'index.json').uri, { mimeType: 'application/json' });
  }
  return root.uri;
}
