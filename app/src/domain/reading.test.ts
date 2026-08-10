/**
 * Limiares de confiança de docs/02 §7.3.
 *
 * ⚠️ Estes são os limiares de EXIBIÇÃO (como a UI rotula a leitura). A decisão
 * de preencher sozinho ou pedir confirmação NÃO usa esta escala — ela não é
 * comparável entre motores; ver acceptance.ts e o §11 do relatório de 10/08.
 */
import { confidenceLevel } from './reading';

describe('confidenceLevel', () => {
  it('alto a partir de 0.85', () => {
    expect(confidenceLevel(0.85)).toBe('high');
    expect(confidenceLevel(1)).toBe('high');
  });

  it('médio entre 0.6 e 0.85', () => {
    expect(confidenceLevel(0.6)).toBe('medium');
    expect(confidenceLevel(0.84)).toBe('medium');
  });

  it('baixo abaixo de 0.6', () => {
    expect(confidenceLevel(0.59)).toBe('low');
    expect(confidenceLevel(0)).toBe('low');
  });
});
