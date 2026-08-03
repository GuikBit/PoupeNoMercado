/** Stub do expo-crypto para Jest (node) — UUID determinístico. */
let counter = 0;

export function randomUUID(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

/** Somente para testes. */
export function resetRandomUUID(): void {
  counter = 0;
}
