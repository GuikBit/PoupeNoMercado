/**
 * Catálogo de variantes de pré-processamento (Etapa 3).
 *
 * Módulo PURO — só declara as variantes e seus parâmetros. A execução em
 * OpenCV fica em `apply.ts`, que não carrega em node. Assim o lote e os
 * relatórios podem falar de variantes sem depender de módulo nativo.
 *
 * ⚠️ Não há hipótese vencedora aqui de propósito. O plano original mandava
 * "binarização adaptativa + upscale 2×" mirando o Tipo C, e a coleta de
 * 08/08/2026 mostrou que o Tipo C é o MELHOR tipo — a falha do ML Kit está no
 * dígito em fonte GRANDE, onde upscale pode até piorar. Quem decide é a
 * medição (`npm run analyze:batch`), não este arquivo.
 */

export type PreprocessVariantId =
  | 'none'
  | 'stretch'
  | 'upscale2x'
  | 'stretch_upscale2x'
  | 'otsu'
  | 'adaptive'
  | 'adaptive_upscale2x'
  | 'unsharp';

export interface PreprocessVariant {
  id: PreprocessVariantId;
  /** O que faz, em uma linha — vai para o relatório. */
  description: string;
  /** Hipótese que a variante testa. */
  hypothesis: string;
}

export const PREPROCESS_VARIANTS: readonly PreprocessVariant[] = [
  {
    id: 'none',
    description: 'imagem retificada, sem tratamento',
    hypothesis: 'linha de base — todo o resto é comparado contra esta',
  },
  {
    id: 'stretch',
    description: 'cinza + alongamento linear de contraste (min→0, max→255)',
    hypothesis: 'a etiqueta amarela tem contraste baixo; separar tinta de fundo basta',
  },
  {
    id: 'upscale2x',
    description: 'ampliação 2× bicúbica',
    hypothesis: 'o motor precisa de mais pixels por glifo',
  },
  {
    id: 'stretch_upscale2x',
    description: 'contraste + ampliação 2×',
    hypothesis: 'as duas coisas acima são complementares',
  },
  {
    id: 'otsu',
    description: 'cinza + desfoque leve + binarização global de Otsu',
    hypothesis: 'a etiqueta tem iluminação uniforme; limiar global é suficiente e mais estável',
  },
  {
    id: 'adaptive',
    description: 'cinza + binarização adaptativa gaussiana (bloco 31, C 10)',
    hypothesis: 'o plano original — lida com iluminação desigual na gôndola',
  },
  {
    id: 'adaptive_upscale2x',
    description: 'ampliação 2× e então binarização adaptativa',
    hypothesis: 'binarizar depois de ampliar preserva melhor a borda do glifo',
  },
  {
    id: 'unsharp',
    description: 'cinza + máscara de nitidez (unsharp, 1.5/−0.5)',
    hypothesis: 'o dígito grande perde definição na borda; realçar sem binarizar preserva o tom',
  },
] as const;

export const DEFAULT_VARIANT_IDS: readonly PreprocessVariantId[] = PREPROCESS_VARIANTS.map(
  (v) => v.id,
);

export function findVariant(id: string): PreprocessVariant | undefined {
  return PREPROCESS_VARIANTS.find((v) => v.id === id);
}
