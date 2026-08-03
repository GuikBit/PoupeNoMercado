/** Stub do expo-sqlite para Jest (node) — repositório é testado com fake LabDb. */
export function openDatabaseSync(): never {
  throw new Error('expo-sqlite indisponível em testes — use um fake de LabDb');
}
