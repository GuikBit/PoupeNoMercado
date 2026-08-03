import type { ImageRef } from '../types';
import { createCloudVisionEngine, parseVisionResponse } from './cloudvision';

const image: ImageRef = { uri: 'file:///fake.jpg', width: 1000, height: 500 };

const sampleResponse = {
  responses: [
    {
      fullTextAnnotation: {
        pages: [
          {
            width: 1000,
            height: 500,
            blocks: [
              {
                confidence: 0.93,
                boundingBox: {
                  vertices: [{ x: 20, y: 15 }, { x: 620, y: 15 }, { x: 620, y: 75 }, { x: 20, y: 75 }],
                },
                paragraphs: [
                  {
                    confidence: 0.93,
                    boundingBox: {
                      vertices: [{ x: 20, y: 15 }, { x: 620, y: 15 }, { x: 620, y: 75 }, { x: 20, y: 75 }],
                    },
                    words: [
                      { symbols: [{ text: 'R' }, { text: '$' }] },
                      { symbols: [{ text: '2' }, { text: ',' }, { text: '9' }, { text: '9' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('parseVisionResponse', () => {
  it('converte blocos com caixas normalizadas 0..1', () => {
    const blocks = parseVisionResponse(sampleResponse, { width: 1000, height: 500 });
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block?.text).toBe('R$ 2,99');
    expect(block?.box).toEqual({ x: 0.02, y: 0.03, w: 0.6, h: 0.12 });
    expect(block?.confidence).toBe(0.93);
    expect(block?.lines).toHaveLength(1);
  });

  it('confiança ausente vira -1 (desconhecida), nunca falsa certeza', () => {
    const noConf = {
      responses: [
        {
          fullTextAnnotation: {
            pages: [
              {
                width: 100,
                height: 100,
                blocks: [{ paragraphs: [{ words: [{ symbols: [{ text: 'X' }] }] }] }],
              },
            ],
          },
        },
      ],
    };
    const blocks = parseVisionResponse(noConf, { width: 100, height: 100 });
    expect(blocks[0]?.confidence).toBe(-1);
  });

  it('resposta vazia produz lista vazia, não erro', () => {
    expect(parseVisionResponse({}, { width: 100, height: 100 })).toEqual([]);
  });
});

describe('createCloudVisionEngine', () => {
  it('indisponível sem chave; recognize rejeita', async () => {
    const engine = createCloudVisionEngine({ apiKey: '' });
    await expect(engine.isAvailable()).resolves.toBe(false);
    await expect(engine.recognize(image)).rejects.toThrow(/API_KEY/);
  });

  it('devolve OcrResult bem-formado a partir da resposta REST', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    }) as unknown as typeof fetch;

    const engine = createCloudVisionEngine({
      apiKey: 'test-key',
      fetchFn,
      readBase64: async () => 'aGVsbG8=',
    });

    const result = await engine.recognize(image);
    expect(result.engineId).toBe('cloudvision');
    expect(result.blocks).toHaveLength(1);
    expect(result.imageSize).toEqual({ width: 1000, height: 500 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const call = (fetchFn as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain('key=test-key');
    const body = JSON.parse(String(call[1].body)) as {
      requests: { features: { type: string }[] }[];
    };
    expect(body.requests[0]?.features[0]?.type).toBe('DOCUMENT_TEXT_DETECTION');
  });

  it('propaga erro da API como exceção', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [{ error: { message: 'quota exceeded' } }] }),
    }) as unknown as typeof fetch;

    const engine = createCloudVisionEngine({
      apiKey: 'k',
      fetchFn,
      readBase64: async () => '',
    });
    await expect(engine.recognize(image)).rejects.toThrow(/quota/);
  });
});
