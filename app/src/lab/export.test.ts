import { buildExportBundle } from './export';
import type { LabCase } from './types';

function makeCase(overrides: Partial<LabCase>): LabCase {
  return {
    id: 'id-1',
    capturedAt: '2026-08-03T10:00:00.000Z',
    imagePath: 'lab-cases/id-1.jpg',
    rectifiedPath: 'lab-cases/id-1.rect.jpg',
    labelType: 'bahamas_gondola',
    detectMethod: 'quad',
    dominantHue: 52,
    captureConditions: { lighting: 'normal', angle: 'frontal', condition: 'flat' },
    engines: {
      mlkit: {
        latencyMs: 312,
        ocrRaw: [{ text: 'R$ 2,99', box: { x: 0, y: 0, w: 1, h: 1 }, confidence: 0.9 }],
        parsed: null,
        confidence: 0.88,
      },
      cloudvision: {
        latencyMs: -1,
        ocrRaw: [],
        parsed: null,
        confidence: null,
        error: 'sem rede',
      },
    },
    groundTruth: {
      rawName: 'VINAGRE DE ALCOOL PEIXE 750ML',
      pricing: {
        basePriceCents: 299,
        tiers: [{ minQty: 3, priceCents: 279, condition: { kind: 'none' } }],
        saleUnit: 'UN',
        measurePrice: { valueCents: 398, unit: 'L', perAmount: 1 },
      },
      internalCode: '25421',
    },
    humanVerdict: { bestEngine: 'mlkit', note: '' },
    ...overrides,
  };
}

describe('buildExportBundle', () => {
  it('gera a árvore de fixtures de docs/02 §9 com numeração por tipo', () => {
    const bundle = buildExportBundle([
      makeCase({ id: 'b2', capturedAt: '2026-08-03T11:00:00.000Z' }),
      makeCase({ id: 'b1', capturedAt: '2026-08-03T10:00:00.000Z' }),
      makeCase({
        id: 'c1',
        capturedAt: '2026-08-03T10:30:00.000Z',
        labelType: 'bahamas_perecivel',
        groundTruth: null,
      }),
    ]);

    const paths = bundle.jsonFiles.map((f) => f.path);
    // Numeração segue a ordem de captura: b1 (10h) vem antes de b2 (11h).
    expect(paths).toContain('labels/bahamas_gondola_001.expected.json');
    expect(paths).toContain('labels/bahamas_gondola_002.expected.json');
    expect(paths).toContain('labels/bahamas_gondola_001.mlkit.raw.json');
    expect(paths).toContain('labels/bahamas_gondola_001.cloudvision.raw.json');
    // Caso sem gabarito não gera expected.json, mas gera raw e imagem.
    expect(paths).not.toContain('labels/bahamas_perecivel_001.expected.json');
    expect(paths).toContain('labels/bahamas_perecivel_001.mlkit.raw.json');
    expect(paths).toContain('index.json');
    expect(paths).toContain('cases.json');

    expect(bundle.images.map((i) => i.path)).toEqual([
      'labels/bahamas_gondola_001.jpg',
      'labels/bahamas_perecivel_001.jpg',
      'labels/bahamas_gondola_002.jpg',
    ]);
    expect(bundle.images[0]?.sourcePath).toBe('lab-cases/id-1.rect.jpg');
  });

  it('expected.json sai em snake_case, no formato de docs/06 §3', () => {
    const bundle = buildExportBundle([makeCase({})]);
    const expected = bundle.jsonFiles.find(
      (f) => f.path === 'labels/bahamas_gondola_001.expected.json',
    )?.content as Record<string, unknown>;

    expect(expected).toEqual({
      raw_name: 'VINAGRE DE ALCOOL PEIXE 750ML',
      base_price_cents: 299,
      tiers: [{ min_qty: 3, price_cents: 279, condition: { kind: 'none' } }],
      sale_unit: 'UN',
      measure_price: { value_cents: 398, unit: 'L', per_amount: 1 },
      internal_code: '25421',
    });
  });

  it('index.json resume motores com latência, confiança e erro', () => {
    const bundle = buildExportBundle([makeCase({})]);
    const index = bundle.jsonFiles.find((f) => f.path === 'index.json')?.content as Record<
      string,
      unknown
    >[];
    expect(index).toHaveLength(1);
    const entry = index[0] as {
      engines: Record<string, { latency_ms: number; error?: string }>;
      file: string;
    };
    expect(entry.file).toBe('bahamas_gondola_001');
    expect(entry.engines.mlkit?.latency_ms).toBe(312);
    expect(entry.engines.cloudvision?.error).toBe('sem rede');
  });
});
