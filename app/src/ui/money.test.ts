import {
  formatCents,
  formatCentsPlain,
  formatQuantity,
  gramsToQuantity,
  popDigit,
  pushDigit,
} from './money';

describe('formatCents', () => {
  it('formata em reais com dois decimais', () => {
    expect(formatCents(1234)).toBe('R$ 12,34');
    expect(formatCents(5)).toBe('R$ 0,05');
    expect(formatCents(0)).toBe('R$ 0,00');
  });

  it('agrupa milhar', () => {
    expect(formatCents(123_456)).toBe('R$ 1.234,56');
    expect(formatCents(100_000_00)).toBe('R$ 100.000,00');
  });

  it('marca negativo — saldo estourado do orçamento', () => {
    expect(formatCents(-500)).toBe('−R$ 5,00');
  });

  it('versão sem símbolo para campo de edição', () => {
    expect(formatCentsPlain(1234)).toBe('12,34');
  });
});

describe('pushDigit — teclado de caixa, dígitos entram pela direita', () => {
  it('monta o valor como numa calculadora de mercado', () => {
    let cents = 0;
    for (const d of [1, 2, 3, 4]) cents = pushDigit(cents, d);
    expect(cents).toBe(1234);
    expect(formatCents(cents)).toBe('R$ 12,34');
  });

  it('primeiro dígito vira centavo', () => {
    expect(formatCents(pushDigit(0, 5))).toBe('R$ 0,05');
  });

  it('ignora dígito acima do teto de R$ 99.999,99', () => {
    const noTeto = 9_999_999;
    expect(pushDigit(noTeto, 9)).toBe(noTeto);
  });

  it('recusa entrada que não é dígito', () => {
    expect(() => pushDigit(0, 10)).toThrow(/inválido/i);
    expect(() => pushDigit(0, -1)).toThrow(/inválido/i);
  });

  it('apagar remove o último dígito', () => {
    expect(popDigit(1234)).toBe(123);
    expect(popDigit(0)).toBe(0);
  });
});

describe('quantidade', () => {
  it('gramas viram quilo', () => {
    expect(gramsToQuantity(734)).toBeCloseTo(0.734);
  });

  it('unidade é inteiro puro', () => {
    expect(formatQuantity(3, 'UN')).toBe('3');
  });

  it('peso mostra até 3 casas, sem zero à toa', () => {
    expect(formatQuantity(0.734, 'KG')).toBe('0,734 kg');
    expect(formatQuantity(1.5, 'KG')).toBe('1,5 kg');
    expect(formatQuantity(2, 'KG')).toBe('2 kg');
  });
});
