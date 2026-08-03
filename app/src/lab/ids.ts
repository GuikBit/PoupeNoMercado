/** Geração de id de caso — isolada para ser trocável/mockável em teste. */
import { randomUUID } from 'expo-crypto';

export function newCaseId(): string {
  return randomUUID();
}
