import type { LabelReading } from '../domain/reading';
import { evaluateCases, percentile, summarize, trigramSimilarity } from './metrics';
import type { EngineRun, LabCase } from './types';

describe('trigramSimilarity', () => {
  it('idênticos = 1, disjuntos ≈ 0, parecidos no meio', () => {
    expect(trigramSimilarity('VINAGRE PEIXE', 'VINAGRE PEIXE')).toBe(1);
    expect(trigramSimilarity('VINAGRE', 'XYZW')).toBe(0);
    const partial = trigramSimilarity('VINAGRE DE ALCOOL PEIXE', 'VINAGRE ALCOOL PEIXE 750ML');
    expect(partial).toBeGreaterThan(0.5);
    expect(partial).toBeLessThan(1);
  });

  it('é imune a caixa e acento', () => {
    expect(trigramSimilarity('Vinagre Álcool', 'VINAGRE ALCOOL')).toBe(1);
  });
});

describe('percentile', () => {
  it('p50 e p95 de uma lista', () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 95)).toBe(1000);
    expect(percentile([], 50)).toBe(0);
  });
});

function reading(basePriceCents: number, score: number): LabelReading {
  return {
    product: { rawName: 'VINAGRE PEIXE 750ML', normalizedName: 'VINAGRE PEIXE 750ML' },
    pricing: { basePriceCents, tiers: [], saleUnit: 'UN' },
    confidence: { level: 'high', score, weakFields: [], failedRules: [] },
    provenance: { engineId: 'mlkit', layoutProfileId: 'bahamas_gondola', latencyMs: 100, capturedAt: '' },
  };
}

function makeCase(id: string, runs: Record<string, EngineRun>): LabCase {
  return {
    id,
    capturedAt: '2026-08-03T10:00:00.000Z',
    imagePath: 'x.jpg',
    rectifiedPath: null,
    labelType: 'bahamas_gondola',
    detectMethod: 'quad',
    dominantHue: 50,
    captureConditions: { lighting: 'normal', angle: 'frontal', condition: 'flat' },
    engines: runs,
    groundTruth: {
      rawName: 'VINAGRE PEIXE 750ML',
      pricing: { basePriceCents: 299, tiers: [], saleUnit: 'UN' },
    },
    humanVerdict: { bestEngine: 'mlkit', note: '' },
  };
}

const emptyRun: EngineRun = { latencyMs: 100, ocrRaw: [], parsed: null, confidence: null };

describe('evaluateCases + summarize', () => {
  it('computa M1, M3 e M7 com acerto, erro confiante e abstenção', () => {
    const cases = [
      makeCase('a', { mlkit: emptyRun }), // vai acertar (299)
      makeCase('b', { mlkit: emptyRun }), // erro confiante (499 @ 0.9)
      makeCase('c', { mlkit: emptyRun }), // abstenção
      makeCase('d', { mlkit: { ...emptyRun, error: 'sem rede' } }), // falha de motor
    ];
    const results: Record<string, LabelReading | null> = {
      a: reading(299, 0.9),
      b: reading(499, 0.9),
      c: null,
    };
    const evals = evaluateCases(cases, (_run, labCase) => results[labCase.id] ?? null);
    const report = summarize(cases, evals);
    const engine = report.engines[0];

    expect(report.totalCases).toBe(4);
    expect(engine?.engineId).toBe('mlkit');
    // 3 avaliáveis (a falha de motor fica de fora): 1 acerto em 3.
    expect(engine?.byType[0]?.scored).toBe(3);
    expect(engine?.priceAccuracyAB).toBeCloseTo(1 / 3);
    // M3: 1 erro confiante em 3 avaliáveis.
    expect(engine?.confidentErrorRate).toBeCloseTo(1 / 3);
    expect(engine?.confidentErrors).toHaveLength(1);
    expect(engine?.confidentErrors[0]?.parsedPriceCents).toBe(499);
    // M7: dos 2 errados (b confiante, c abstido), 1 tem confiança < 0.6.
    expect(engine?.abstentionCoverage).toBeCloseTo(0.5);
    expect(engine?.engineFailures).toBe(1);
    expect(report.verdictTally.mlkit).toBe(4);
  });

  it('caso sem gabarito não entra nas acurácias, mas entra na latência', () => {
    const noGt: LabCase = { ...makeCase('x', { mlkit: emptyRun }), groundTruth: null };
    const evals = evaluateCases([noGt], () => reading(299, 0.9));
    const report = summarize([noGt], evals);
    expect(report.engines[0]?.byType[0]?.scored).toBe(0);
    expect(report.engines[0]?.priceAccuracyAB).toBeNull();
    expect(report.engines[0]?.latencyP50).toBe(100);
  });
});
