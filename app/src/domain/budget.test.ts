/**
 * Testes do orçamento. O amarelo entra em 85% de propósito: avisar em 100%
 * seria avisar quando já não dá mais tempo de reagir.
 */
import { budgetStatus, WARNING_RATIO } from './budget';

describe('budgetStatus', () => {
  it('sem teto, nunca alarma', () => {
    const s = budgetStatus(999_999, null);
    expect(s.state).toBe('ok');
    expect(s.remainingCents).toBeNull();
    expect(s.ratio).toBeNull();
  });

  it('verde abaixo de 85%', () => {
    expect(budgetStatus(8499, 10_000).state).toBe('ok');
  });

  it('amarelo exatamente em 85%', () => {
    expect(budgetStatus(8500, 10_000).state).toBe('warning');
    expect(WARNING_RATIO).toBe(0.85);
  });

  it('amarelo exatamente no teto — ainda não estourou', () => {
    const s = budgetStatus(10_000, 10_000);
    expect(s.state).toBe('warning');
    expect(s.remainingCents).toBe(0);
  });

  it('vermelho um centavo acima do teto', () => {
    const s = budgetStatus(10_001, 10_000);
    expect(s.state).toBe('over');
    expect(s.remainingCents).toBe(-1);
  });

  it('carrinho vazio é verde', () => {
    expect(budgetStatus(0, 10_000).state).toBe('ok');
  });

  it('recusa teto não positivo', () => {
    expect(() => budgetStatus(100, 0)).toThrow(/positivo/i);
    expect(() => budgetStatus(100, -1)).toThrow(/positivo/i);
  });
});
