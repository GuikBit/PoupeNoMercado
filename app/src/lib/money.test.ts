import { formatCents, parseCents } from './money';

describe('formatCents', () => {
  it('formata valores comuns de etiqueta', () => {
    expect(formatCents(299)).toBe('R$ 2,99');
    expect(formatCents(4990)).toBe('R$ 49,90');
    expect(formatCents(8190)).toBe('R$ 81,90');
  });

  it('formata zero e valores com milhar', () => {
    expect(formatCents(0)).toBe('R$ 0,00');
    expect(formatCents(123456)).toBe('R$ 1.234,56');
  });

  it('formata negativos (estorno/ajuste)', () => {
    expect(formatCents(-60)).toBe('-R$ 0,60');
  });

  it('rejeita não-inteiros — dinheiro nunca é float', () => {
    expect(() => formatCents(2.99)).toThrow();
  });
});

describe('parseCents', () => {
  it('aceita vírgula e ponto como separador decimal', () => {
    expect(parseCents('2,99')).toBe(299);
    expect(parseCents('2.99')).toBe(299);
    expect(parseCents('49,90')).toBe(4990);
  });

  it('rejeita formatos inválidos', () => {
    expect(parseCents('2,9')).toBeNull();
    expect(parseCents('2,999')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('')).toBeNull();
  });
});
