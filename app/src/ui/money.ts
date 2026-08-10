/**
 * Formatação e entrada de dinheiro. Módulo puro.
 *
 * Dinheiro é SEMPRE inteiro em centavos (CLAUDE.md). Estas funções são a única
 * fronteira entre os centavos do domínio e o texto que o usuário vê ou digita —
 * nada de `parseFloat` espalhado por tela.
 */

/** "R$ 12,34". Aceita negativo (saldo estourado do orçamento). */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}R$ ${grouped},${centavos}`;
}

/** "12,34" — sem símbolo, para caber em campo de edição. */
export function formatCentsPlain(cents: number): string {
  return formatCents(cents).replace('R$ ', '');
}

/**
 * Teclado numérico de caixa: os dígitos entram pela DIREITA, como numa
 * calculadora de mercado. Digitar 1·2·3·4 produz 12,34 — sem vírgula, sem
 * cursor, sem ambiguidade. É o jeito que não erra com a mão apressada.
 */
export function pushDigit(currentCents: number, digit: number): number {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    throw new Error(`Dígito inválido: ${digit}`);
  }
  const next = currentCents * 10 + digit;
  // Teto de R$ 99.999,99 — acima disso é erro de digitação, não preço.
  return next > 9_999_999 ? currentCents : next;
}

export function popDigit(currentCents: number): number {
  return Math.floor(currentCents / 10);
}

/**
 * Peso/volume digitado em gramas ou mililitros → quantidade na unidade base.
 * O usuário digita "734" para 0,734 kg, na mesma lógica de dígitos à direita.
 */
export function gramsToQuantity(grams: number): number {
  return grams / 1000;
}

export function formatQuantity(quantity: number, saleUnit: string): string {
  if (saleUnit === 'UN') return String(quantity);
  // Três casas cobrem grama e mililitro sem exibir ruído de ponto flutuante.
  return `${quantity.toFixed(3).replace(/\.?0+$/, '').replace('.', ',')} ${saleUnit.toLowerCase()}`;
}
