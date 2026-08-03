import type { LabDb, SqlParams } from './db';
import { caseToRow, createLabCaseRepository, type LabCaseRow, rowToCase } from './repository';
import type { LabCase } from './types';

const sampleCase: LabCase = {
  id: '0192f3a1-0000-4000-8000-000000000001',
  capturedAt: '2026-08-03T14:32:10.000Z',
  imagePath: 'lab-cases/0192f3a1.jpg',
  rectifiedPath: 'lab-cases/0192f3a1.rect.jpg',
  labelType: 'bahamas_gondola',
  detectMethod: 'quad',
  dominantHue: 52,
  captureConditions: { lighting: 'normal', angle: 'oblique', condition: 'flat' },
  engines: {
    mlkit: {
      latencyMs: 312,
      ocrRaw: [
        {
          text: 'R$ 2,99',
          box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
          confidence: 0.9,
        },
      ],
      parsed: null,
      confidence: null,
      error: undefined,
    },
    cloudvision: {
      latencyMs: 890,
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
      tiers: [
        { minQty: 3, priceCents: 279, condition: { kind: 'none' } },
        { minQty: 24, priceCents: 259, condition: { kind: 'none' } },
      ],
      saleUnit: 'UN',
      measurePrice: { valueCents: 398, unit: 'L', perAmount: 1 },
    },
    internalCode: '25421',
  },
  humanVerdict: { bestEngine: 'mlkit', note: 'Cloud pegou o preço/litro como base' },
};

describe('serialização caseToRow/rowToCase', () => {
  it('faz round-trip sem perda', () => {
    const row = caseToRow(sampleCase);
    expect(row.id).toBe(sampleCase.id);
    expect(row.schema_version).toBe(1);
    const back = rowToCase(row);
    // `error: undefined` some no JSON — normaliza para comparar o resto.
    const normalized = JSON.parse(JSON.stringify(sampleCase)) as LabCase;
    expect(back).toEqual(normalized);
  });

  it('campos opcionais nulos viram colunas NULL', () => {
    const bare: LabCase = {
      ...sampleCase,
      rectifiedPath: null,
      dominantHue: null,
      groundTruth: null,
      humanVerdict: null,
    };
    const row = caseToRow(bare);
    expect(row.rectified_path).toBeNull();
    expect(row.ground_truth).toBeNull();
    expect(row.human_verdict).toBeNull();
    const back = rowToCase(row);
    expect(back.groundTruth).toBeNull();
    expect(back.humanVerdict).toBeNull();
  });
});

/** Fake in-memory da interface LabDb, ciente das queries do repositório. */
function createFakeDb(): LabDb {
  const rows = new Map<string, LabCaseRow>();
  return {
    execSync(): void {},
    runSync(sql: string, params: SqlParams): void {
      if (!sql.includes('INSERT')) throw new Error(`SQL inesperado: ${sql}`);
      const [
        id,
        captured_at,
        image_path,
        rectified_path,
        label_type,
        detect_method,
        dominant_hue,
        capture_conditions,
        engines,
        ground_truth,
        human_verdict,
        schema_version,
      ] = params;
      rows.set(String(id), {
        id: String(id),
        captured_at: String(captured_at),
        image_path: String(image_path),
        rectified_path: rectified_path === null ? null : String(rectified_path),
        label_type: String(label_type),
        detect_method: String(detect_method),
        dominant_hue: dominant_hue === null ? null : Number(dominant_hue),
        capture_conditions: String(capture_conditions),
        engines: String(engines),
        ground_truth: ground_truth === null ? null : String(ground_truth),
        human_verdict: human_verdict === null ? null : String(human_verdict),
        schema_version: Number(schema_version),
      });
    },
    getAllSync(sql: string): Record<string, unknown>[] {
      if (sql.includes('GROUP BY label_type')) {
        const byType = new Map<string, number>();
        for (const row of rows.values()) {
          byType.set(row.label_type, (byType.get(row.label_type) ?? 0) + 1);
        }
        return [...byType.entries()].map(([label_type, total]) => ({ label_type, total }));
      }
      return [...rows.values()].sort((a, b) =>
        b.captured_at.localeCompare(a.captured_at),
      ) as unknown as Record<string, unknown>[];
    },
    getFirstSync(sql: string, params: SqlParams): Record<string, unknown> | null {
      if (sql.includes('COUNT(*)')) return { total: rows.size };
      const row = rows.get(String(params[0]));
      return row ? (row as unknown as Record<string, unknown>) : null;
    },
  };
}

describe('createLabCaseRepository', () => {
  it('salva, recupera por id e lista em ordem decrescente de captura', () => {
    const repo = createLabCaseRepository(createFakeDb());
    const older: LabCase = { ...sampleCase, id: 'a', capturedAt: '2026-08-01T10:00:00.000Z' };
    const newer: LabCase = { ...sampleCase, id: 'b', capturedAt: '2026-08-03T10:00:00.000Z' };
    repo.save(older);
    repo.save(newer);

    expect(repo.count()).toBe(2);
    expect(repo.getById('a')?.capturedAt).toBe(older.capturedAt);
    expect(repo.getById('zzz')).toBeNull();
    expect(repo.list().map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('save é upsert — regravar o mesmo id não duplica', () => {
    const repo = createLabCaseRepository(createFakeDb());
    repo.save(sampleCase);
    repo.save({ ...sampleCase, labelType: 'adversarial' });
    expect(repo.count()).toBe(1);
    expect(repo.getById(sampleCase.id)?.labelType).toBe('adversarial');
  });

  it('countByType acompanha a cota da coleta', () => {
    const repo = createLabCaseRepository(createFakeDb());
    repo.save({ ...sampleCase, id: '1' });
    repo.save({ ...sampleCase, id: '2' });
    repo.save({ ...sampleCase, id: '3', labelType: 'bahamas_perecivel' });
    expect(repo.countByType()).toEqual({ bahamas_gondola: 2, bahamas_perecivel: 1 });
  });
});
