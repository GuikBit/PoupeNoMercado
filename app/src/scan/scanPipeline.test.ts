/**
 * Pipeline de leitura em produção. O que se protege aqui é a política do
 * ADR-002 virando comportamento: ML Kit sempre confirma, e a nuvem só entra
 * quando não há o que aproveitar.
 */
import type { DetectResult } from '../ocr/detector/detect';
import type { ImageRef, OcrBlock, OcrResult } from '../ocr/types';
import { scanLabel } from './scanPipeline';

const image: ImageRef = { uri: 'file:///rect.jpg', width: 1200, height: 500 };
const detect: DetectResult = { image, dominantHue: 54, method: 'quad' };

function blocks(lines: string[]): OcrBlock[] {
  return lines.map((text, i) => ({
    text,
    box: { x: 0.05, y: 0.05 + i * 0.12, w: 0.7, h: 0.1 },
    confidence: 0.9,
  }));
}

function ocr(engineId: string, lines: string[], latencyMs = 130): OcrResult {
  return { blocks: blocks(lines), engineId, latencyMs, imageSize: { width: 1200, height: 500 } };
}

const ETIQUETA_BOA = [
  'VINAGRE DE ALCOOL PEIXE 750ML',
  'De R$ 2,99 a Unidade',
  'A PARTIR DE 3',
  'R$ 2,79',
];

const base = { detectFn: async () => detect };

describe('scanLabel', () => {
  it('lê a etiqueta e pede confirmação — ML Kit nunca preenche sozinho', async () => {
    const out = await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ETIQUETA_BOA),
    });

    expect(out.reading?.pricing.basePriceCents).toBe(299);
    expect(out.decision.action).toBe('confirm');
    expect(out.engineId).toBe('mlkit');
    expect(out.escalated).toBe(false);
  });

  it('leitura inaproveitável cai no manual', async () => {
    const out = await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ['BORRAO ILEGIVEL']),
    });
    expect(out.decision.action).toBe('manual');
    expect(out.reading).toBeNull();
  });

  it('não escalona quando o titular já resolveu — nuvem custa tempo e dinheiro', async () => {
    const escalate = jest.fn(async () => ocr('cloudvision', ETIQUETA_BOA, 1600));
    await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ETIQUETA_BOA),
      escalateFn: escalate,
    });
    expect(escalate).not.toHaveBeenCalled();
  });

  it('escalona para a nuvem quando o titular não deu nada', async () => {
    const out = await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ['BORRAO']),
      escalateFn: async () => ocr('cloudvision', ETIQUETA_BOA, 1600),
    });

    expect(out.escalated).toBe(true);
    expect(out.engineId).toBe('cloudvision');
    expect(out.reading?.pricing.basePriceCents).toBe(299);
    expect(out.latencyMs).toBe(130 + 1600);
  });

  it('sem rede o escalonamento devolve null e o fluxo segue para o manual', async () => {
    const out = await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ['BORRAO']),
      escalateFn: async () => null,
    });
    expect(out.decision.action).toBe('manual');
    expect(out.escalated).toBe(false);
  });

  it('escalonamento que também falha não fica preso na nuvem', async () => {
    const out = await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ['BORRAO']),
      escalateFn: async () => ocr('cloudvision', ['BORRAO TAMBEM'], 1600),
    });
    expect(out.decision.action).toBe('manual');
    expect(out.engineId).toBe('mlkit');
    expect(out.escalated).toBe(false);
  });

  it('devolve o OCR bruto e a imagem retificada para auditoria', async () => {
    const out = await scanLabel(image, {
      ...base,
      recognizeFn: async () => ocr('mlkit', ETIQUETA_BOA),
    });
    expect(out.ocrRaw).toHaveLength(ETIQUETA_BOA.length);
    expect(out.imageUri).toBe('file:///rect.jpg');
  });
});
