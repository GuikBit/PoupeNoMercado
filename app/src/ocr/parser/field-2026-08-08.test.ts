/**
 * Regressões da coleta de campo de 08/08/2026 (51 casos, Bahamas Mix).
 * Cada teste reproduz a geometria real de blocos que derrubava o parser —
 * ver docs/resultados/lab-2026-08-10.md §5.
 */
import type { OcrBlock, OcrResult } from '../types';
import { parseLabel } from './parse';
import { validateReading } from './validate';

function block(text: string, x: number, y: number, w: number, h: number): OcrBlock {
  return { text, box: { x, y, w, h }, confidence: 0.95 };
}

function ocr(blocks: OcrBlock[], size = { width: 1200, height: 500 }): OcrResult {
  return { blocks, engineId: 'cloudvision', latencyMs: 100, imageSize: size };
}

describe('faixa escrita como "A PARTIR DE N UNIDADES PAGUE"', () => {
  // Caso BALDE PLASTEX (db4b11b7): a fraseologia do cartaz casava com a regex
  // da faixa de CARTÃO ("...N UNID") e a linha era descartada inteira.
  it('não confunde "3 UNIDADES PAGUE" com a faixa do cartão', () => {
    const reading = parseLabel(
      ocr([
        block('BALDE PLASTEX ECO 10 LITROS', 0.1, 0.05, 0.7, 0.1),
        block('COMPRANDO 1 R$ 14,38', 0.1, 0.35, 0.45, 0.1),
        block('A PARTIR DE 3 UNIDADES PAGUE', 0.15, 0.55, 0.6, 0.09),
        block('R$ 12,28', 0.2, 0.72, 0.45, 0.2),
      ]),
      { dominantHue: 54 },
    );

    expect(reading?.pricing.basePriceCents).toBe(1438);
    expect(reading?.pricing.tiers.map((t) => [t.minQty, t.priceCents])).toEqual([[3, 1228]]);
  });

  it('preserva a faixa de 12 unidades', () => {
    const reading = parseLabel(
      ocr([
        block('AGUA MINERAL COM GAS 500ML', 0.1, 0.05, 0.7, 0.1),
        block('COMPRANDO 1 R$ 1,79', 0.1, 0.3, 0.45, 0.1),
        block('A PARTIR DE 12 UNIDADES PAGUE', 0.15, 0.5, 0.65, 0.09),
        block('R$ 1,69', 0.2, 0.68, 0.45, 0.22),
      ]),
      { dominantHue: 54 },
    );

    expect(reading?.pricing.tiers.map((t) => [t.minQty, t.priceCents])).toEqual([[12, 169]]);
  });
});

describe('faixa do cartão fundida com a linha de medida', () => {
  // Caso OANO PIRATA (092a554d): o Cloud Vision entrega
  // "NESTA EMBALAGEM 1KG R$ 478,00 OU NO BAHAMAS CRED a partir de 1 unid. R$ 2,39"
  // num bloco só. Descartar o bloco por ser linha de medida perdia o cartão.
  it('extrai a faixa do cartão do sufixo do bloco', () => {
    const reading = parseLabel(
      ocr([
        block('OREGANO PIRATA SACHE 5G', 0.1, 0.05, 0.6, 0.09),
        block('De R$ 2,89 a Unidade', 0.1, 0.2, 0.5, 0.09),
        block('A PARTIR DE 3', 0.2, 0.4, 0.3, 0.08),
        block('R$ 2,39', 0.3, 0.52, 0.3, 0.14),
        block(
          'NESTA EMBALAGEM 1KG R$ 478,00 OU NO BAHAMAS CRED a partir de 1 unid . R$ 2,39',
          0.1,
          0.72,
          0.8,
          0.08,
        ),
      ]),
      { dominantHue: 54 },
    );

    expect(reading?.pricing.basePriceCents).toBe(289);
    const card = reading?.pricing.tiers.find((t) => t.condition.kind === 'storeCard');
    expect(card).toEqual({
      minQty: 1,
      priceCents: 239,
      condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' },
    });
    // A medida da embalagem nunca vira preço de venda.
    expect(reading?.pricing.basePriceCents).not.toBe(47800);
  });
});

describe('preço em destaque mais alto que a âncora', () => {
  // Caso BISTECA (c678d94b): o "15,90" gigante começa ACIMA do topo de
  // "POR: R$" mesmo estando visualmente abaixo. Comparar topo com topo
  // descartava o preço certo e o parser se abstinha.
  it('associa o preço grande à âncora POR pelo centro vertical', () => {
    const reading = parseLabel(
      ocr(
        [
          block('BISTECA IN NATURA SUINA SADIA', 0.033, 0.22, 0.923, 0.09),
          block('CONG KG', 0.4, 0.296, 0.255, 0.052),
          block('DE : R$', 0.081, 0.469, 0.124, 0.039),
          block('POR : R$', 0.08, 0.537, 0.153, 0.038),
          block('16,99', 0.22, 0.459, 0.276, 0.07),
          block('15,90', 0.057, 0.479, 0.911, 0.388),
        ],
        { width: 873, height: 945 },
      ),
      { dominantHue: 41 },
    );

    expect(reading).not.toBeNull();
    expect(reading?.pricing.basePriceCents).toBe(1590);
    // O preço riscado nunca entra no cálculo.
    expect(reading?.pricing.basePriceCents).not.toBe(1699);
  });
});

describe('preço ao lado de âncora de texto alto', () => {
  // Caso PAO PAES DE MINAS (0a6ff954): "COMPRANDO 1 R$" tem 0.163 de altura;
  // o "5,39" ao lado ficava fora da tolerância fixa de mesma linha (0.04) e
  // também fora da busca "abaixo", por sobrepor a âncora verticalmente.
  it('acha o preço à direita com tolerância proporcional à altura', () => {
    const reading = parseLabel(
      ocr([
        block('PAO PAES DE MINAS FORMA TRADICIONAL 400G', 0.126, 0.297, 0.695, 0.237),
        block('COMPRANDO 1 R$', 0.114, 0.662, 0.257, 0.163),
        block('UNIDADE', 0.125, 0.734, 0.115, 0.117),
        block('5,39', 0.401, 0.762, 0.103, 0.091),
        block('A PARTIR DE 3 UNIDADES PAGUE', 0.209, 0.896, 0.588, 0.103),
      ]),
    );

    expect(reading?.pricing.basePriceCents).toBe(539);
  });
});

describe('preço base truncado pelo OCR', () => {
  // Caso MIX DE TEMPERO (d5e66785) via ML Kit: o motor perdeu o "7" e entregou
  // "De R$ ,99 aUnidade". A busca espacial então trazia o 7,39 da FAIXA como
  // se fosse o preço base — plausível e errado.
  it('abstém em vez de devolver o preço da faixa como base', () => {
    const reading = parseLabel(
      ocr([
        block('MIX DE TEMPERO KITANO 40G', 0.1, 0.05, 0.6, 0.09),
        block('De R$ ,99 aUnidade', 0.1, 0.2, 0.5, 0.09),
        block('NESTA EMBALAGEM 1KG R$ 199,75', 0.1, 0.32, 0.6, 0.06),
        block('A partir de 3', 0.2, 0.45, 0.3, 0.08),
        block('R$ 7,39', 0.3, 0.57, 0.3, 0.14),
      ]),
      { dominantHue: 54 },
    );

    expect(reading?.pricing.basePriceCents).not.toBe(739);
    expect(reading).toBeNull();
  });

  it('não afeta a âncora que legitimamente não tem valor na própria linha', () => {
    const reading = parseLabel(
      ocr([
        block('BALDE PLASTEX ECO 10 LITROS', 0.1, 0.05, 0.7, 0.1),
        block('COMPRANDO 1 R$', 0.1, 0.35, 0.3, 0.12),
        block('R$ 14,38', 0.45, 0.36, 0.3, 0.11),
        block('A PARTIR DE 3 UNIDADES PAGUE', 0.15, 0.6, 0.6, 0.09),
        block('R$ 12,28', 0.2, 0.75, 0.45, 0.18),
      ]),
      { dominantHue: 54 },
    );

    expect(reading?.pricing.basePriceCents).toBe(1438);
  });
});

describe('V11 — desconto de faixa implausível', () => {
  const base = {
    rawName: 'LAMPADA LED TASCHIBRA 20W',
    pricing: {
      basePriceCents: 939,
      saleUnit: 'UN' as const,
      tiers: [{ minQty: 3, priceCents: 819, condition: { kind: 'none' as const } }],
    },
  };

  it('aceita os descontos reais da rede (máximo observado 22,8%)', () => {
    const result = validateReading(base);
    expect(result.failedRules).not.toContain('V11');
  });

  it('marca como fraca a faixa abaixo de 50% do preço base', () => {
    // "R$ 8,19" lido pelo OCR como "R$ 3,19".
    const result = validateReading({
      ...base,
      pricing: {
        ...base.pricing,
        tiers: [
          ...base.pricing.tiers,
          {
            minQty: 1,
            priceCents: 319,
            condition: { kind: 'storeCard' as const, cardName: 'BAHAMAS CRED' },
          },
        ],
      },
    });

    expect(result.failedRules).toContain('V11');
    expect(result.weakFields).toContain('tiers');
    expect(result.rejected).toBe(false);
  });
});
