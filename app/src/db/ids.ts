/**
 * Fábrica de ids da aplicação. Isolada do gerador puro (`uuid.ts`) porque só
 * ela toca módulo nativo — em teste injeta-se um relógio e uma fonte de bytes.
 */
import { getRandomBytes } from 'expo-crypto';

import { buildUuidV7 } from './uuid';

/**
 * Garante monotonicidade dentro do mesmo milissegundo: dois ids criados no
 * mesmo ms ainda ordenam pela sequência de criação, o que importa para a
 * ordem do outbox.
 */
let lastMs = 0;
let counterInMs = 0;

export interface IdSources {
  now: () => number;
  randomBytes: (length: number) => Uint8Array;
}

const defaultSources: IdSources = {
  now: () => Date.now(),
  randomBytes: (length) => getRandomBytes(length),
};

export function newId(sources: IdSources = defaultSources): string {
  const now = sources.now();
  if (now === lastMs) {
    counterInMs++;
  } else {
    lastMs = now;
    counterInMs = 0;
  }

  const random = sources.randomBytes(10);
  // Os 12 bits de rand_a viram contador dentro do ms — é o que RFC 9562 §6.2
  // chama de "método 1" para monotonicidade.
  const bytes = Uint8Array.from(random);
  bytes[0] = (counterInMs >>> 8) & 0x0f;
  bytes[1] = counterInMs & 0xff;

  return buildUuidV7(now, bytes);
}

/** Somente para teste — zera o estado de monotonicidade. */
export function resetIdCounter(): void {
  lastMs = 0;
  counterInMs = 0;
}
