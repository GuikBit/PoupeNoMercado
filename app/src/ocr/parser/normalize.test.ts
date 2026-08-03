import { normalizeText } from './normalize';

describe('normalizeText', () => {
  it('aplica caixa alta, unaccent e colapso de espaços', () => {
    expect(normalizeText('Vinagre  de Álcool   Peixe')).toBe('VINAGRE DE ALCOOL PEIXE');
    expect(normalizeText('CORAÇÃO ALCATRA')).toBe('CORACAO ALCATRA');
  });

  it('corrige confusões de OCR apenas em contexto numérico', () => {
    expect(normalizeText('R$ Z,99')).toBe('R$ 2,99');
    expect(normalizeText('R$ 2,S9')).toBe('R$ 2,59');
    expect(normalizeText('7B9')).toBe('789');
    expect(normalizeText('1O,99')).toBe('10,99');
  });

  it('NUNCA altera palavras sem dígitos — POTE não vira P0TE', () => {
    expect(normalizeText('POTE PLASTICO')).toBe('POTE PLASTICO');
    expect(normalizeText('SABONETE DOVE')).toBe('SABONETE DOVE');
    expect(normalizeText('OI BOLSA IZA')).toBe('OI BOLSA IZA');
  });

  it('preserva unidades de medida coladas em dígito (1LT, 750ML, 1L)', () => {
    expect(normalizeText('NESTA EMBALAGEM 1LT R$ 3,98')).toBe('NESTA EMBALAGEM 1LT R$ 3,98');
    expect(normalizeText('VINAGRE DE ALCOOL PEIXE 750ML')).toBe('VINAGRE DE ALCOOL PEIXE 750ML');
  });

  it('normaliza separador decimal ponto → vírgula só com 2 casas finais', () => {
    expect(normalizeText('R$ 2.99')).toBe('R$ 2,99');
    expect(normalizeText('COD 168439')).toBe('COD 168439');
    expect(normalizeText('7898174854351')).toBe('7898174854351');
  });
});
