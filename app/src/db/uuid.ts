/**
 * UUID v7 — exigido pelo CLAUDE.md em toda tabela sincronizável.
 *
 * Por que v7 e não v4: os 48 bits mais significativos são o timestamp em ms,
 * então os ids ordenam por tempo de criação. Isso dá localidade de índice no
 * SQLite e no Postgres (inserções sempre no fim da árvore, sem fragmentar) e
 * uma ordem estável de sincronização sem precisar de coluna extra.
 *
 * Layout (RFC 9562 §5.7):
 *   48 bits  unix_ts_ms
 *    4 bits  versão (7)
 *   12 bits  rand_a
 *    2 bits  variante (0b10)
 *   62 bits  rand_b
 *
 * A geração é separada das fontes de tempo e aleatoriedade para ser testável
 * sem módulo nativo.
 */

const HEX = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX[(byte >> 4) & 0x0f];
    out += HEX[byte & 0x0f];
  }
  return out;
}

/**
 * Monta o UUID v7 a partir de um timestamp e de 10 bytes aleatórios.
 * Função pura — o wrapper `uuidv7()` fornece as duas coisas.
 */
export function buildUuidV7(timestampMs: number, random: Uint8Array): string {
  if (!Number.isInteger(timestampMs) || timestampMs < 0) {
    throw new Error(`uuidv7 espera timestamp inteiro não negativo, recebeu ${timestampMs}`);
  }
  if (random.length < 10) {
    throw new Error(`uuidv7 precisa de 10 bytes aleatórios, recebeu ${random.length}`);
  }

  const bytes = new Uint8Array(16);

  // 48 bits de timestamp, big-endian. Divisão em duas metades porque um
  // inteiro de 48 bits não cabe nas operações bit a bit de 32 bits do JS.
  const high = Math.floor(timestampMs / 0x1_0000_0000);
  const low = timestampMs >>> 0;
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;

  for (let i = 0; i < 10; i++) {
    bytes[6 + i] = random[i] as number;
  }

  // Versão 7 nos 4 bits altos do byte 6; variante 0b10 nos 2 bits altos do 8.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/** Extrai o instante de criação embutido — útil para diagnóstico e ordenação. */
export function uuidV7Timestamp(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  if (hex.length !== 12 || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`UUID v7 inválido: ${uuid}`);
  }
  return Number.parseInt(hex, 16);
}
