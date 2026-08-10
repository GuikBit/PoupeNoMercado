/**
 * Testes do reprocessamento em lote. Tudo injetado — nem OpenCV nem motor
 * real; o que se testa aqui é a orquestração: ordem, isolamento de falha,
 * progresso e cancelamento.
 */
import type { ImageRef, OcrResult } from '../ocr/types';
import { type BatchProgress, runBatch } from './batch';
import type { LabCase } from './types';

function labCase(id: string): LabCase {
  return {
    id,
    capturedAt: '2026-08-08T10:00:00.000Z',
    imagePath: `lab-cases/${id}.jpg`,
    rectifiedPath: `lab-cases/${id}.rect.jpg`,
    labelType: 'bahamas_gondola',
    detectMethod: 'quad',
    dominantHue: 54,
    captureConditions: { lighting: 'normal', angle: 'frontal', condition: 'flat' },
    engines: {
      mlkit: {
        latencyMs: 120,
        imageSize: { width: 1200, height: 500 },
        ocrRaw: [],
        parsed: null,
        confidence: null,
      },
    },
    groundTruth: null,
    humanVerdict: null,
  };
}

const image: ImageRef = { uri: 'file:///x.jpg', width: 1200, height: 500 };

function ocrResult(text: string): OcrResult {
  return {
    blocks: [{ text, box: { x: 0, y: 0, w: 1, h: 1 }, confidence: 0.9 }],
    engineId: 'mlkit',
    latencyMs: 130,
    imageSize: { width: 1200, height: 500 },
  };
}

const baseOptions = {
  loadImageFn: async () => image,
  preprocessFn: async (_img: ImageRef, variant: string) => ({
    ...image,
    uri: `file:///${variant}.jpg`,
  }),
};

describe('runBatch', () => {
  it('roda todas as variantes de cada caso e guarda o OCR bruto', async () => {
    const report = await runBatch([labCase('a'), labCase('b')], {
      ...baseOptions,
      variants: ['none', 'otsu'],
      recognizeFn: async (img) => ocrResult(`texto de ${img.uri}`),
    });

    expect(report.cases).toHaveLength(2);
    expect(report.cases[0]?.runs.map((r) => r.variant)).toEqual(['none', 'otsu']);
    expect(report.cases[0]?.runs[1]?.ocrRaw[0]?.text).toBe('texto de file:///otsu.jpg');
    expect(report.engineId).toBe('mlkit');
  });

  it('isola falha de uma variante sem derrubar as outras', async () => {
    const report = await runBatch([labCase('a')], {
      ...baseOptions,
      variants: ['none', 'adaptive', 'otsu'],
      preprocessFn: async (_img, variant) => {
        if (variant === 'adaptive') throw new Error('OpenCV explodiu');
        return { ...image, uri: `file:///${variant}.jpg` };
      },
      recognizeFn: async () => ocrResult('ok'),
    });

    const runs = report.cases[0]?.runs ?? [];
    expect(runs[1]?.error).toBe('OpenCV explodiu');
    expect(runs[1]?.ocrRaw).toEqual([]);
    expect(runs[0]?.error).toBeUndefined();
    expect(runs[2]?.error).toBeUndefined();
  });

  it('registra erro em todas as variantes quando a imagem não abre', async () => {
    const report = await runBatch([labCase('a')], {
      ...baseOptions,
      variants: ['none', 'otsu'],
      loadImageFn: async () => {
        throw new Error('imagem ausente: lab-cases/a.rect.jpg');
      },
      recognizeFn: async () => ocrResult('nunca chamado'),
    });

    const runs = report.cases[0]?.runs ?? [];
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.error?.includes('imagem ausente'))).toBe(true);
  });

  it('não chama o motor quando a imagem não abre', async () => {
    const recognize = jest.fn(async () => ocrResult('x'));
    await runBatch([labCase('a')], {
      ...baseOptions,
      variants: ['none'],
      loadImageFn: async () => {
        throw new Error('sem imagem');
      },
      recognizeFn: recognize,
    });
    expect(recognize).not.toHaveBeenCalled();
  });

  it('reporta progresso a cada unidade', async () => {
    const seen: BatchProgress[] = [];
    await runBatch([labCase('a'), labCase('b')], {
      ...baseOptions,
      variants: ['none', 'otsu'],
      recognizeFn: async () => ocrResult('x'),
      onProgress: (p) => seen.push(p),
    });

    expect(seen).toHaveLength(4);
    expect(seen[0]).toMatchObject({ doneUnits: 1, totalUnits: 4, caseIndex: 0 });
    expect(seen[3]).toMatchObject({ doneUnits: 4, totalUnits: 4, caseIndex: 1 });
  });

  it('para no cancelamento e devolve o que já mediu', async () => {
    let calls = 0;
    const report = await runBatch([labCase('a'), labCase('b'), labCase('c')], {
      ...baseOptions,
      variants: ['none', 'otsu'],
      recognizeFn: async () => {
        calls++;
        return ocrResult('x');
      },
      shouldCancel: () => calls >= 2,
    });

    expect(calls).toBe(2);
    // O caso 'a' completou as duas variantes; o lote parou antes de gravar 'b'.
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]?.caseId).toBe('a');
  });

  it('exige o motor injetado', async () => {
    await expect(runBatch([labCase('a')], baseOptions)).rejects.toThrow(/recognizeFn/);
  });
});
