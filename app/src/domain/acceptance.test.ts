/**
 * Testes da política de aceitação. O que se protege aqui é o princípio nº 5:
 * nenhuma leitura entra sozinha fora da faixa medida como 100% precisa.
 */
import { decideAcceptance, thresholdsFor } from './acceptance';
import type { LabelReading } from './reading';

function reading(
  engineId: string,
  score: number,
  weakFields: string[] = [],
): LabelReading {
  return {
    product: { rawName: 'AZEITONA VERDE BAHAMAS', normalizedName: 'AZEITONA VERDE BAHAMAS' },
    pricing: { basePriceCents: 699, tiers: [], saleUnit: 'UN' },
    confidence: { level: 'medium', score, weakFields, failedRules: [] },
    provenance: { engineId, layoutProfileId: 'bahamas_gondola', latencyMs: 130, capturedAt: '' },
  };
}

describe('decideAcceptance', () => {
  it('manda para o manual quando o motor não devolveu leitura', () => {
    expect(decideAcceptance(null)).toEqual({
      action: 'manual',
      reason: expect.stringContaining('não devolveu'),
    });
  });

  it('nunca aceita ML Kit sozinho, mesmo no topo da escala dele', () => {
    // 0,78 é o máximo observado do ML Kit em 45 leituras reais.
    expect(decideAcceptance(reading('mlkit', 0.78)).action).toBe('confirm');
    expect(decideAcceptance(reading('mlkit', 0.99)).action).toBe('confirm');
  });

  it('pré-preenche o ML Kit em confiança média — poupa digitação sem commitar', () => {
    const decision = decideAcceptance(reading('mlkit', 0.65));
    expect(decision.action).toBe('confirm');
  });

  it('manda para o manual abaixo do piso', () => {
    expect(decideAcceptance(reading('mlkit', 0.2)).action).toBe('manual');
  });

  it('aceita Cloud Vision sozinho a partir de 0.85 — faixa medida com 100% de precisão', () => {
    expect(decideAcceptance(reading('cloudvision', 0.85)).action).toBe('auto');
    expect(decideAcceptance(reading('cloudvision', 0.98)).action).toBe('auto');
    expect(decideAcceptance(reading('cloudvision', 0.84)).action).toBe('confirm');
  });

  it('campo de preço frágil derruba o automático mesmo com score alto', () => {
    // Faixa errada produz total errado igual — princípio nº 2.
    expect(decideAcceptance(reading('cloudvision', 0.95, ['tiers'])).action).toBe('confirm');
    expect(decideAcceptance(reading('cloudvision', 0.95, ['saleUnit'])).action).toBe('confirm');
  });

  it('campo frágil irrelevante ao preço não impede o automático', () => {
    expect(decideAcceptance(reading('cloudvision', 0.95, ['rawName'])).action).toBe('auto');
  });

  it('motor desconhecido nunca entra no automático', () => {
    expect(thresholdsFor('paddleocr').auto).toBeNull();
    expect(decideAcceptance(reading('paddleocr', 0.99)).action).toBe('confirm');
  });
});
