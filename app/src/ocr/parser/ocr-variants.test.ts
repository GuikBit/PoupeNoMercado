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

  it('papel alumínio via Cloud Vision: âncora "DE R $" quebrada em linhas separadas', () => {
    const reading = parseLabel(
      ocrResult(
        [
          line('PAPEL ALUMINIO WYDA 30CM X 7,5 METROS', 0.02),
          { text: 'DE R $', box: { x: 0.05, y: 0.14, w: 0.15, h: 0.08 }, confidence: 0.9 },
          { text: '9,29 A UNIDADE', box: { x: 0.22, y: 0.14, w: 0.3, h: 0.08 }, confidence: 0.9 },
          line('NESTA EMBALAGEM 1MT R$ 1,23', 0.26),
          line('A PARTIR DE 3', 0.38, 0.05, 0.25),
          line('R$ 7,99', 0.46, 0.05, 0.2),
          line('ECONOMIZE R$ 3,90', 0.54),
          line('A PARTIR DE 25', 0.62, 0.05, 0.25),
          line('R$ 6,99', 0.7, 0.05, 0.2),
          line('OU NO BAHAMAS CRED A PARTIR DE 1 UNID . R$ 6,99', 0.9),
        ],
        'cloudvision',
      ),
      { dominantHue: 58 },
    );

    expect(reading).not.toBeNull();
    expect(reading?.pricing.basePriceCents).toBe(929);
    const plain = reading?.pricing.tiers.filter((t) => t.condition.kind === 'none');
    expect(plain?.map((t) => [t.minQty, t.priceCents])).toEqual([
      [3, 799],
      [25, 699],
    ]);
    const card = reading?.pricing.tiers.find((t) => t.condition.kind === 'storeCard');
    expect(card?.priceCents).toBe(699);
  });

  it('base fundido com a linha de medida não descarta o preço base', () => {
    const reading = parseLabel(
      ocrResult(
        [
          line('SABONETE DOVE ORIGINAL 90G C / 4', 0.02),
          line('DE R$ 19,98 A UNIDADE NESTA EMBALAGEM 1KG R$ 55,50', 0.14, 0.05, 0.85),
          line('A PARTIR DE 3', 0.3, 0.05, 0.25),
          line('R$ 19,68', 0.38, 0.05, 0.2),
          line('NESTA EMBALAGEM 1KG R$ 54,66', 0.46),
          line('ECONOMIZE R$ 0,90', 0.54),
          line('A PARTIR DE 12', 0.62, 0.05, 0.25),
          line('R$ 19,48', 0.7, 0.05, 0.2),
          line('OU NO BAHAMAS CRED A PARTIR DE 1 UNID . R$ 19,48', 0.9),
        ],
        'cloudvision',
      ),
      { dominantHue: 53 },
    );

    // O base é o 19,98 do prefixo — NUNCA o 55,50 do preço por KG.
    expect(reading?.pricing.basePriceCents).toBe(1998);
    const plain = reading?.pricing.tiers.filter((t) => t.condition.kind === 'none');
    expect(plain?.map((t) => [t.minQty, t.priceCents])).toEqual([
      [3, 1968],
      [12, 1948],
    ]);
  });

  it('lâmpada via ML Kit: "A IIUIDADE" (fuzzy), "DE BS" e decimal com espaço', () => {
    const reading = parseLabel(
      ocrResult(
        [
          line('LAMPADA LED TASCHIBRA 20W 6500K', 0.02),
          line('9,39 A IIUIDADE', 0.15, 0.05, 0.4),
          { text: 'DE BS', box: { x: 0.7, y: 0.15, w: 0.15, h: 0.08 }, confidence: 0.6 },
          line('A PARTIR DE 3', 0.35, 0.05, 0.25),
          line('R$ 8, 19', 0.45, 0.05, 0.2),
          line('OU NO BAHAMAS CRED A PARTIR DE', 0.6),
          line('UNID. R$ 8,19', 0.7),
        ],
        'mlkit',
      ),
      { dominantHue: 52 },
    );

    expect(reading?.pricing.basePriceCents).toBe(939);
    const plain = reading?.pricing.tiers.filter((t) => t.condition.kind === 'none');
    expect(plain?.map((t) => [t.minQty, t.priceCents])).toEqual([[3, 819]]);
  });

  it('variante "COMPRANDO 1 R$ 6,49" vira preço base', () => {
    const reading = parseLabel(
      ocrResult(
        [
          line('NHA MARILAN COCO 5000', 0.02),
          line('COMPRANDO 1 R$ 6,49', 0.2),
          line('UNIDADE', 0.3),
          line('A PARTIR DE 3 UNIDADES PAGUE', 0.45),
        ],
        'cloudvision',
      ),
      {},
    );

    expect(reading?.pricing.basePriceCents).toBe(649);
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
