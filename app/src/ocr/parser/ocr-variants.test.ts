/**
 * Regressão do caso real "SABONETE DOVE" (Laboratório, 03/08/2026):
 * o OCR lê o símbolo monetário como "B$", "RS" ou "R $" e o parser rejeitava
 * a etiqueta de gôndola inteira por não achar a âncora "DE R$ ... A UNIDADE".
 */
import type { OcrBlock, OcrResult } from '../types';
import { normalizeText } from './normalize';
import { parseLabel } from './parse';

describe('normalizeText — variantes de OCR do símbolo R$', () => {
  it('canoniza RS / R5 / B$ / R $ seguidos de valor monetário', () => {
    expect(normalizeText('De B$ 19,98 a Unidade')).toBe('DE R$ 19,98 A UNIDADE');
    expect(normalizeText('De R $ 19,98 a Unidade')).toBe('DE R$ 19,98 A UNIDADE');
    expect(normalizeText('NESTA EMBALAGEM 1KG RS 55,50')).toBe('NESTA EMBALAGEM 1KG R$ 55,50');
    expect(normalizeText('R5 19,68')).toBe('R$ 19,68');
    expect(normalizeText('RS19,68')).toBe('R$ 19,68');
  });

  it('não toca "RS" fora de contexto monetário', () => {
    expect(normalizeText('PORTO ALEGRE RS')).toBe('PORTO ALEGRE RS');
    expect(normalizeText('SABONETE DOVE ORGINAL 90G')).toBe('SABONETE DOVE ORGINAL 90G');
  });
});

function line(text: string, y: number, x = 0.05, w = 0.6): OcrBlock {
  return { text, box: { x, y, w, h: 0.08 }, confidence: 0.9 };
}

function ocrResult(blocks: OcrBlock[], engineId: string): OcrResult {
  return { blocks, engineId, latencyMs: 100, imageSize: { width: 1200, height: 500 } };
}

describe('parseLabel — gôndola com símbolos monetários corrompidos', () => {
  it('caso Dove via ML Kit: B$/RS, preços em linhas separadas', () => {
    const reading = parseLabel(
      ocrResult(
        [
          line('SABONETE DOVE ORGINAL 90G C/4', 0.02),
          line('De B$ 19,98 a Unidade', 0.14),
          line('NESTA EMBALAGEM 1KG RS 55,50', 0.26),
          line('A PARTIR DE 3', 0.4, 0.05, 0.25),
          line('RS 19,68', 0.5, 0.05, 0.2),
          line('NESTA EMBALAGEM 1KG RS 54,66', 0.62),
          line('Economize R$ 0,90', 0.74),
          line('A PARTIR DE 12', 0.8, 0.05, 0.25),
          line('R$ 18,75', 0.9, 0.05, 0.2),
        ],
        'mlkit',
      ),
      { dominantHue: 54 },
    );

    expect(reading).not.toBeNull();
    expect(reading?.provenance.layoutProfileId).toBe('bahamas_gondola');
    expect(reading?.pricing.basePriceCents).toBe(1998);
    expect(reading?.pricing.tiers.map((t) => [t.minQty, t.priceCents])).toEqual([
      [3, 1968],
      [12, 1875],
    ]);
    // O preço por KG da embalagem nunca vira preço de venda.
    expect(reading?.pricing.measurePrice).toEqual({ perAmount: 1, unit: 'KG', valueCents: 5550 });
    expect(reading?.pricing.savingsCents).toBe(90);
  });

  it('caso Dove via Cloud Vision: "R $" e faixa com preço na MESMA linha', () => {
    const reading = parseLabel(
      ocrResult(
        [
          line('SABONETE DOVE ORGINAL 90G C/4', 0.02),
          line('De R $ 19,98 a Unidade', 0.14),
          line('NESTA EMBALAGEM 1KG R $ 55,50', 0.26),
          line('A PARTIR DE 3 R $ 19,68', 0.45),
          line('NESTA EMBALAGEM 1KG R $ 54,66', 0.6),
          line('Economize R $ 0,90', 0.72),
          line('A PARTIR DE 12 R $ 18,75', 0.85),
        ],
        'cloudvision',
      ),
      { dominantHue: 54 },
    );

    expect(reading).not.toBeNull();
    expect(reading?.pricing.basePriceCents).toBe(1998);
    expect(reading?.pricing.tiers.map((t) => [t.minQty, t.priceCents])).toEqual([
      [3, 1968],
      [12, 1875],
    ]);
  });
});
