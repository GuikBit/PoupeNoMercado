/**
 * Casos de teste obrigatórios T1–T14 — docs/02-MOTOR-RECONHECIMENTO.md §10.
 * Fixtures sintéticas derivadas dos layouts reais documentados em §3.
 * T11–T14 protegem contra as armadilhas — são os testes mais importantes.
 */
import { resolvePrice } from '../../domain/pricing';
import type { OcrBlock, OcrResult } from '../types';
import { parseLabel } from './parse';

const NOW = new Date('2026-08-03T12:00:00Z');

function L(text: string, x: number, y: number, w: number, h: number, confidence = 0.9): OcrBlock {
  return { text, box: { x, y, w, h }, confidence };
}

function frame(width: number, height: number, blocks: OcrBlock[]): OcrResult {
  return { blocks, engineId: 'test', latencyMs: 0, imageSize: { width, height } };
}

const parse = (ocr: OcrResult) => parseLabel(ocr, { now: NOW });

// ─── Tipo B — gôndola ────────────────────────────────────────────────────────

const vinagre = frame(1200, 500, [
  L('VINAGRE DE ALCOOL PEIXE 750ML', 0.02, 0.03, 0.6, 0.12),
  L('De R$ 2,99 a Unidade', 0.02, 0.18, 0.35, 0.1),
  L('24/07/26', 0.75, 0.18, 0.15, 0.08),
  L('NESTA EMBALAGEM 1LT R$ 3,98', 0.02, 0.3, 0.4, 0.08),
  L('25421', 0.78, 0.3, 0.12, 0.08),
  L('Min 143', 0.78, 0.4, 0.12, 0.08),
  L('A PARTIR DE 3', 0.05, 0.48, 0.25, 0.08),
  L('R$ 2,79', 0.05, 0.58, 0.15, 0.1),
  L('NESTA EMBAL. 1LT R$ 3,72', 0.05, 0.7, 0.25, 0.06),
  L('Economize R$ 0,60', 0.05, 0.78, 0.2, 0.06),
  L('A PARTIR DE 24', 0.35, 0.48, 0.25, 0.08),
  L('R$ 2,59', 0.35, 0.58, 0.15, 0.1),
  L('NESTA EMBALAGEM 1LT R$ 3,45', 0.35, 0.7, 0.3, 0.06),
  L('OU NO BAHAMAS CRED', 0.62, 0.55, 0.3, 0.07),
  L('a partir de 1 unid.', 0.62, 0.64, 0.25, 0.06),
  L('R$ 2,59', 0.62, 0.72, 0.15, 0.08),
]);

describe('T1 — Vinagre (Tipo B)', () => {
  const r = parse(vinagre);

  it('classifica como gôndola e extrai a política completa', () => {
    expect(r).not.toBeNull();
    expect(r?.provenance.layoutProfileId).toBe('bahamas_gondola');
    expect(r?.pricing.basePriceCents).toBe(299);
    expect(r?.pricing.saleUnit).toBe('UN');
    expect(r?.pricing.savingsCents).toBe(60);
  });

  it('extrai as faixas [3→279, 24→259, cartão 1→259]', () => {
    const tiers = r?.pricing.tiers ?? [];
    expect(tiers).toHaveLength(3);
    expect(tiers.find((t) => t.minQty === 3 && t.condition.kind === 'none')?.priceCents).toBe(279);
    expect(tiers.find((t) => t.minQty === 24 && t.condition.kind === 'none')?.priceCents).toBe(259);
    const card = tiers.find((t) => t.condition.kind === 'storeCard');
    expect(card?.minQty).toBe(1);
    expect(card?.priceCents).toBe(259);
  });

  it('extrai measure 398/L, código interno e data', () => {
    expect(r?.pricing.measurePrice).toEqual({ valueCents: 398, unit: 'L', perAmount: 1 });
    expect(r?.product.internalCode).toBe('25421');
    expect(r?.labelDate).toBe('2026-07-24');
  });
});

describe('T2 — Dove (Tipo B)', () => {
  const dove = frame(1200, 500, [
    L('SABONETE DOVE ORIGINAL 90G', 0.02, 0.03, 0.5, 0.12),
    L('De R$ 19,98 a Unidade', 0.02, 0.18, 0.35, 0.1),
    L('26/07/26', 0.75, 0.18, 0.15, 0.08),
    L('31122', 0.78, 0.3, 0.12, 0.08),
    L('A PARTIR DE 3', 0.05, 0.48, 0.25, 0.08),
    L('R$ 19,68', 0.05, 0.58, 0.15, 0.1),
    L('A PARTIR DE 12', 0.35, 0.48, 0.25, 0.08),
    L('R$ 19,48', 0.35, 0.58, 0.15, 0.1),
    L('OU NO BAHAMAS CRED', 0.62, 0.55, 0.3, 0.07),
    L('a partir de 1 unid.', 0.62, 0.64, 0.25, 0.06),
    L('R$ 19,48', 0.62, 0.72, 0.15, 0.08),
  ]);
  const r = parse(dove);

  it('base 1998, faixas [3→1968, 12→1948, cartão 1→1948]', () => {
    expect(r?.pricing.basePriceCents).toBe(1998);
    const tiers = r?.pricing.tiers ?? [];
    expect(tiers.find((t) => t.minQty === 3 && t.condition.kind === 'none')?.priceCents).toBe(1968);
    expect(tiers.find((t) => t.minQty === 12)?.priceCents).toBe(1948);
    expect(tiers.find((t) => t.condition.kind === 'storeCard')?.priceCents).toBe(1948);
  });
});

describe('T3 — Papel Alumínio (Tipo B, sem cartão)', () => {
  const papel = frame(1200, 500, [
    L('PAPEL ALUMINIO WYDA', 0.02, 0.03, 0.5, 0.12),
    L('De R$ 9,29 a Unidade', 0.02, 0.18, 0.35, 0.1),
    L('22/07/26', 0.75, 0.18, 0.15, 0.08),
    L('44821', 0.78, 0.3, 0.12, 0.08),
    L('A PARTIR DE 3', 0.05, 0.48, 0.25, 0.08),
    L('R$ 7,99', 0.05, 0.58, 0.15, 0.1),
    L('A PARTIR DE 25', 0.4, 0.48, 0.25, 0.08),
    L('R$ 6,99', 0.4, 0.58, 0.15, 0.1),
  ]);
  const r = parse(papel);

  it('base 929, faixas [3→799, 25→699]', () => {
    expect(r?.pricing.basePriceCents).toBe(929);
    const tiers = r?.pricing.tiers ?? [];
    expect(tiers).toHaveLength(2);
    expect(tiers.find((t) => t.minQty === 3)?.priceCents).toBe(799);
    expect(tiers.find((t) => t.minQty === 25)?.priceCents).toBe(699);
  });
});

describe('T4 — Lâmpada 20W (Tipo B, faixa única + cartão)', () => {
  const lampada = frame(1200, 500, [
    L('LAMPADA LED BRANCA', 0.02, 0.03, 0.5, 0.12),
    L('De R$ 9,39 a Unidade', 0.02, 0.18, 0.35, 0.1),
    L('20/07/26', 0.75, 0.18, 0.15, 0.08),
    L('88132', 0.78, 0.3, 0.12, 0.08),
    L('A PARTIR DE 3', 0.05, 0.48, 0.25, 0.08),
    L('R$ 8,19', 0.05, 0.58, 0.15, 0.1),
    L('OU NO BAHAMAS CRED', 0.55, 0.55, 0.3, 0.07),
    L('a partir de 1 unid.', 0.55, 0.64, 0.25, 0.06),
    L('R$ 8,19', 0.55, 0.72, 0.15, 0.08),
  ]);
  const r = parse(lampada);

  it('base 939, faixa [3→819] e cartão [1→819]', () => {
    expect(r?.pricing.basePriceCents).toBe(939);
    const tiers = r?.pricing.tiers ?? [];
    expect(tiers.find((t) => t.condition.kind === 'none')?.priceCents).toBe(819);
    const card = tiers.find((t) => t.condition.kind === 'storeCard');
    expect(card?.minQty).toBe(1);
    expect(card?.priceCents).toBe(819);
  });
});

// ─── Tipo A — oferta ─────────────────────────────────────────────────────────

const azeitona = frame(600, 800, [
  L('AZEITONA VERDE BAHAMAS', 0.1, 0.15, 0.7, 0.05),
  L('SACHE 120G SEM CAROCO', 0.1, 0.22, 0.7, 0.05),
  L('DE: R$ 6,29', 0.1, 0.35, 0.4, 0.05),
  L('POR: R$', 0.1, 0.45, 0.3, 0.06),
  L('4,99 UN', 0.25, 0.52, 0.5, 0.15),
  L('PREÇO/KG REGULAR: R$ 52,41', 0.1, 0.72, 0.6, 0.04),
  L('PREÇO/KG OFERTA: R$ 41,58', 0.1, 0.78, 0.6, 0.04),
  L('24/07/2026', 0.1, 0.86, 0.25, 0.04),
  L('Cód 168439', 0.55, 0.86, 0.3, 0.04),
  L('7898174854351', 0.3, 0.95, 0.4, 0.04),
]);

describe('T5 — Azeitona (Tipo A)', () => {
  const r = parse(azeitona);

  it('classifica como oferta: base 499, riscado 629, UN', () => {
    expect(r?.provenance.layoutProfileId).toBe('bahamas_oferta');
    expect(r?.pricing.basePriceCents).toBe(499);
    expect(r?.pricing.previousPriceCents).toBe(629);
    expect(r?.pricing.saleUnit).toBe('UN');
    expect(r?.pricing.tiers).toHaveLength(0);
  });

  it('measure 4158/KG (linha OFERTA preferida) e EAN preenchido', () => {
    expect(r?.pricing.measurePrice).toEqual({ valueCents: 4158, unit: 'KG', perAmount: 1 });
    expect(r?.product.ean).toBe('7898174854351');
    expect(r?.product.internalCode).toBe('168439');
  });
});

describe('T6 — Pão de Forma (Tipo A)', () => {
  const pao = frame(600, 800, [
    L('PAO DE FORMA BAHAMAS 500G', 0.1, 0.18, 0.7, 0.05),
    L('DE: R$ 5,99', 0.1, 0.35, 0.4, 0.05),
    L('POR: R$', 0.1, 0.45, 0.3, 0.06),
    L('4,99 UN', 0.25, 0.52, 0.5, 0.15),
    L('PREÇO/KG REGULAR: R$ 9,98', 0.1, 0.72, 0.6, 0.04),
    L('25/07/2026', 0.1, 0.86, 0.25, 0.04),
    L('Cód 23456', 0.55, 0.86, 0.3, 0.04),
  ]);
  const r = parse(pao);

  it('base 499, riscado 599, UN', () => {
    expect(r?.pricing.basePriceCents).toBe(499);
    expect(r?.pricing.previousPriceCents).toBe(599);
    expect(r?.pricing.saleUnit).toBe('UN');
  });
});

describe('T7 — Cobertura Garoto (Tipo A, valor alto)', () => {
  const cobertura = frame(600, 800, [
    L('COBERTURA GAROTO CHOCOLATE', 0.1, 0.18, 0.7, 0.05),
    L('DE: R$ 91,90', 0.1, 0.35, 0.4, 0.05),
    L('POR: R$', 0.1, 0.45, 0.3, 0.06),
    L('81,90 UN', 0.25, 0.52, 0.5, 0.15),
    L('PREÇO/KG OFERTA: R$ 40,95', 0.1, 0.78, 0.6, 0.04),
    L('23/07/2026', 0.1, 0.86, 0.25, 0.04),
  ]);
  const r = parse(cobertura);

  it('base 8190, riscado 9190, UN', () => {
    expect(r?.pricing.basePriceCents).toBe(8190);
    expect(r?.pricing.previousPriceCents).toBe(9190);
    expect(r?.pricing.saleUnit).toBe('UN');
  });
});

// ─── Tipo C — perecível ──────────────────────────────────────────────────────

const coxa = frame(1000, 400, [
  L('COXA SOBRECOXA DE FRANGO AVE NOVA KG', 0.02, 0.05, 0.6, 0.1, 0.5),
  L('29/07/26', 0.7, 0.2, 0.2, 0.1),
  L('59162', 0.72, 0.35, 0.15, 0.1),
  L('Min 1051', 0.72, 0.5, 0.15, 0.1),
  L('R$ 7,89', 0.1, 0.4, 0.3, 0.25),
]);

describe('T8 — Coxa Sobrecoxa (Tipo C)', () => {
  const r = parse(coxa);

  it('base 789, unidade KG, nome sempre em weakFields', () => {
    expect(r?.provenance.layoutProfileId).toBe('bahamas_perecivel');
    expect(r?.pricing.basePriceCents).toBe(789);
    expect(r?.pricing.saleUnit).toBe('KG');
    expect(r?.confidence.weakFields).toContain('rawName');
  });

  it('prioriza o código interno para identificação', () => {
    expect(r?.product.internalCode).toBe('59162');
  });

  it('nome degradado não gera confiança alta', () => {
    expect(r?.confidence.level).not.toBe('high');
  });
});

describe('T9 — Asa de Frango (Tipo C)', () => {
  const asa = frame(1000, 400, [
    L('ASA DE FRANGO AVE NOVA KG', 0.02, 0.05, 0.6, 0.1, 0.5),
    L('30/07/26', 0.7, 0.2, 0.2, 0.1),
    L('59201', 0.72, 0.35, 0.15, 0.1),
    L('R$ 13,99', 0.1, 0.4, 0.3, 0.25),
  ]);
  const r = parse(asa);

  it('base 1399, unidade KG', () => {
    expect(r?.pricing.basePriceCents).toBe(1399);
    expect(r?.pricing.saleUnit).toBe('KG');
  });
});

// ─── Tipo D — cartaz ─────────────────────────────────────────────────────────

describe('T10 — Coração Alcatra (Tipo D)', () => {
  const coracao = frame(600, 800, [
    L('CORACAO ALCATRA BOVINO DI PRIMA KG', 0.05, 0.08, 0.85, 0.08),
    L('DE: R$ 54,90', 0.1, 0.35, 0.4, 0.06),
    L('POR: R$', 0.1, 0.45, 0.3, 0.07),
    L('49,90 KG', 0.2, 0.52, 0.55, 0.16),
    L('30/07/2026', 0.1, 0.8, 0.25, 0.04),
    L('Cód 65954', 0.5, 0.8, 0.3, 0.04),
    L('65954', 0.5, 0.93, 0.25, 0.04),
  ]);
  const r = parse(coracao);

  it('classifica como cartaz: base 4990, riscado 5490, KG', () => {
    expect(r?.provenance.layoutProfileId).toBe('bahamas_cartaz');
    expect(r?.pricing.basePriceCents).toBe(4990);
    expect(r?.pricing.previousPriceCents).toBe(5490);
    expect(r?.pricing.saleUnit).toBe('KG');
  });

  it('barcode é código interno — EAN NUNCA é populado no Tipo D', () => {
    expect(r?.product.ean).toBeUndefined();
    expect(r?.product.internalCode).toBe('65954');
  });
});

// ─── T11–T14 — armadilhas ────────────────────────────────────────────────────

describe('T11 — armadilha do preço por medida (Vinagre)', () => {
  it('measurePrice NUNCA vira basePriceCents', () => {
    const r = parse(vinagre);
    expect(r?.pricing.basePriceCents).toBe(299);
    expect(r?.pricing.basePriceCents).not.toBe(398);
    expect(r?.pricing.measurePrice?.valueCents).toBe(398);
  });
});

describe('T12 — armadilha do preço/kg (Azeitona)', () => {
  it('R$ 52,41 (preço/kg) NUNCA vira preço de venda', () => {
    const r = parse(azeitona);
    expect(r?.pricing.basePriceCents).toBe(499);
    expect(r?.pricing.basePriceCents).not.toBe(5241);
    expect(r?.pricing.basePriceCents).not.toBe(4158);
  });
});

describe('T13 — preço riscado nunca entra em resolvePrice', () => {
  it('todas as quantidades resolvem para o preço POR, jamais o DE', () => {
    const r = parse(azeitona);
    expect(r).not.toBeNull();
    if (!r) return;
    for (const qty of [1, 2, 5, 10]) {
      const res = resolvePrice(r.pricing, qty, false);
      expect(res.unitPriceCents).toBe(499);
      expect(res.unitPriceCents).not.toBe(629);
    }
  });
});

describe('T14 — foto com duas etiquetas', () => {
  it('retorna apenas a enquadrada ou confiança rebaixada — nunca aceita cegamente', () => {
    // Frame largo demais (AR 4.0) com conteúdo de duas etiquetas misturado.
    const twoLabels = frame(2000, 500, [
      L('VINAGRE DE ALCOOL PEIXE 750ML', 0.02, 0.03, 0.3, 0.12),
      L('De R$ 2,99 a Unidade', 0.02, 0.18, 0.2, 0.1),
      L('A PARTIR DE 3', 0.03, 0.48, 0.12, 0.08),
      L('R$ 2,79', 0.03, 0.58, 0.08, 0.1),
      L('COXA SOBRECOXA DE FRANGO AVE NOVA KG', 0.55, 0.05, 0.4, 0.1, 0.5),
      L('R$ 7,89', 0.6, 0.4, 0.2, 0.25),
      L('59162', 0.85, 0.2, 0.1, 0.1),
    ]);
    const r = parse(twoLabels);
    if (r !== null) {
      expect(r.confidence.level).not.toBe('high');
    }
  });
});
