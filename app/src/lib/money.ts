/**
 * Dinheiro no projeto é SEMPRE inteiro em centavos (ver CLAUDE.md).
 * Estas funções são a única fronteira entre centavos e representação textual.
 */

/** Formata centavos como moeda brasileira: 299 → "R$ 2,99". */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatCents espera um inteiro em centavos, recebeu ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = (abs % 100).toString().padStart(2, '0');
  return `${sign}R$ ${reais},${centavos}`;
}

/** Converte texto de OCR já validado ("2,99" ou "2.99") em centavos. */
export function parseCents(text: string): number | null {
  const match = /^(\d{1,6})[,.](\d{2})$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const reais = match[1];
  const centavos = match[2];
  if (reais === undefined || centavos === undefined) {
    return null;
  }
  return Number(reais) * 100 + Number(centavos);
}
