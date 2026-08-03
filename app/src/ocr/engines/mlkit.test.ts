import type { MlkitRecognizeResponse } from '../../../modules/mlkit-text-recognition';
import type { ImageRef } from '../types';
import { createMlKitEngine, parseMlkitResponse } from './mlkit';

const image: ImageRef = { uri: 'file:///fake.jpg', width: 1000, height: 500 };

const sampleResponse: MlkitRecognizeResponse = {
  width: 1000,
  height: 500,
  blocks: [
    {
      text: 'VINAGRE DE ALCOOL\nR$ 2,99',
      frame: { x: 20, y: 15, w: 600, h: 60 },
      lines: [
        {
          text: 'VINAGRE DE ALCOOL',
          frame: { x: 20, y: 15, w: 600, h: 30 },
          confidence: 0.92,
          angle: 0,
        },
        { text: 'R$ 2,99', frame: { x: 20, y: 45, w: 200, h: 30 }, confidence: 0, angle: 0 },
      ],
    },
  ],
};

describe('parseMlkitResponse', () => {
  it('converte caixas de pixels para 0..1 e preserva as linhas', () => {
    const blocks = parseMlkitResponse(sampleResponse);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block?.text).toBe('VINAGRE DE ALCOOL\nR$ 2,99');
    expect(block?.box).toEqual({ x: 0.02, y: 0.03, w: 0.6, h: 0.12 });
    expect(block?.lines).toHaveLength(2);
    expect(block?.lines?.[0]?.box).toEqual({ x: 0.02, y: 0.03, w: 0.6, h: 0.06 });
  });

  it('confiança 0 do ML Kit vira -1 (não informada), nunca falsa certeza', () => {
    const blocks = parseMlkitResponse(sampleResponse);
    expect(blocks[0]?.lines?.[1]?.confidence).toBe(-1);
    // Confiança do bloco é a média só das linhas conhecidas.
    expect(blocks[0]?.confidence).toBeCloseTo(0.92);
  });

  it('bloco sem nenhuma linha com confiança conhecida fica com -1', () => {
    const noConf: MlkitRecognizeResponse = {
      width: 100,
      height: 100,
      blocks: [
        {
          text: 'X',
          frame: null,
          lines: [{ text: 'X', frame: null, confidence: 0, angle: 0 }],
        },
      ],
    };
    const blocks = parseMlkitResponse(noConf);
    expect(blocks[0]?.confidence).toBe(-1);
    expect(blocks[0]?.box).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('resposta vazia produz lista vazia, não erro', () => {
    expect(parseMlkitResponse({ width: 100, height: 100, blocks: [] })).toEqual([]);
  });
});

describe('createMlKitEngine', () => {
  it('está sempre disponível (modelo bundled) e não usa rede', async () => {
    const engine = createMlKitEngine({ recognizeFn: async () => sampleResponse });
    expect(engine.id).toBe('mlkit');
    expect(engine.requiresNetwork).toBe(false);
    expect(engine.costPerCallCents).toBe(0);
    await expect(engine.isAvailable()).resolves.toBe(true);
  });

  it('devolve OcrResult bem-formado a partir do payload nativo', async () => {
    const recognizeFn = jest.fn(async (uri: string) => {
      expect(uri).toBe(image.uri);
      return sampleResponse;
    });
    const engine = createMlKitEngine({ recognizeFn });

    const result = await engine.recognize(image);
    expect(result.engineId).toBe('mlkit');
    expect(result.blocks).toHaveLength(1);
    expect(result.imageSize).toEqual({ width: 1000, height: 500 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(recognizeFn).toHaveBeenCalledTimes(1);
  });

  it('propaga erro do módulo nativo como exceção', async () => {
    const engine = createMlKitEngine({
      recognizeFn: async () => {
        throw new Error('ERR_IMAGE_LOAD');
      },
    });
    await expect(engine.recognize(image)).rejects.toThrow(/ERR_IMAGE_LOAD/);
  });
});
