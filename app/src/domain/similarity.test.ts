/**
 * Similaridade por trigrama — a mesma convenção do `similarity()` do pg_trgm,
 * para que o app e o backend concordem.
 */
import { trigramSimilarity } from './similarity';

describe('trigramSimilarity', () => {
  it('é 1 para strings idênticas', () => {
    expect(trigramSimilarity('VINAGRE', 'VINAGRE')).toBe(1);
  });

  it('ignora acento e caixa', () => {
    expect(trigramSimilarity('Pão', 'PAO')).toBe(1);
  });

  it('é 0 sem nada em comum', () => {
    expect(trigramSimilarity('VINAGRE', 'PICANHA')).toBe(0);
  });

  it('duas strings vazias são iguais por convenção', () => {
    expect(trigramSimilarity('', '')).toBe(1);
  });

  it('vazio contra não-vazio é 0', () => {
    expect(trigramSimilarity('', 'VINAGRE')).toBe(0);
    expect(trigramSimilarity('VINAGRE', '')).toBe(0);
  });

  it('pontuação pura conta como vazia', () => {
    expect(trigramSimilarity('---', '///')).toBe(1);
  });

  it('fica entre 0 e 1 para parecidos', () => {
    const score = trigramSimilarity('PAO DE FORMA', 'PAO DE FORMA INTEGRAL');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('é simétrica', () => {
    const a = trigramSimilarity('VINAGRE DE ALCOOL', 'VINAGRE');
    const b = trigramSimilarity('VINAGRE', 'VINAGRE DE ALCOOL');
    expect(a).toBe(b);
  });
});
