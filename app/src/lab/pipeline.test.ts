import type { ImageRef, OcrEngine, OcrResult } from '../ocr/types';
import { runLabPipeline } from './pipeline';

const photo: ImageRef = { uri: 'file:///photo.jpg', width: 4000, height: 3000 };
const rectified: ImageRef = { uri: 'file:///rect.jpg', width: 1200, height: 500 };

function fakeEngine(id: string, recognize: (image: ImageRef) => Promise<OcrResult>): OcrEngine {
  return {
    id,
    requiresNetwork: false,
    costPerCallCents: 0,
    isAvailable: async () => true,
    recognize,
  };
}

describe('runLabPipeline', () => {
  it('alimenta todos os motores com o MESMO bitmap retificado', async () => {
    const seen: string[] = [];
    const engine = (id: string) =>
      fakeEngine(id, async (image) => {
        seen.push(image.uri);
        return { blocks: [], engineId: id, latencyMs: 42, imageSize: image };
      });

    const result = await runLabPipeline(photo, {
      detectFn: async () => ({ image: rectified, dominantHue: 50, method: 'quad' }),
      engines: [engine('a'), engine('b')],
      capturedAt: '2026-08-03T12:00:00.000Z',
    });

    expect(seen).toEqual([rectified.uri, rectified.uri]);
    expect(result.capturedAt).toBe('2026-08-03T12:00:00.000Z');
    expect(result.detect.method).toBe('quad');
    expect(result.engines.a?.latencyMs).toBe(42);
    // Sem texto → parser rejeita, mas o caso registra o OCR bruto sem erro.
    expect(result.engines.a?.parsed).toBeNull();
    expect(result.engines.a?.confidence).toBeNull();
    expect(result.engines.a?.error).toBeUndefined();
  });

  it('falha de um motor não derruba os outros (Cloud sem rede no mercado)', async () => {
    const ok = fakeEngine('mlkit', async (image) => ({
      blocks: [],
      engineId: 'mlkit',
      latencyMs: 10,
      imageSize: image,
    }));
    const down = fakeEngine('cloudvision', async () => {
      throw new Error('sem rede');
    });

    const result = await runLabPipeline(photo, {
      detectFn: async () => ({ image: rectified, method: 'fallback' }),
      engines: [ok, down],
    });

    expect(result.engines.mlkit?.error).toBeUndefined();
    expect(result.engines.cloudvision?.error).toBe('sem rede');
    expect(result.engines.cloudvision?.latencyMs).toBe(-1);
    expect(result.engines.cloudvision?.ocrRaw).toEqual([]);
  });
});
