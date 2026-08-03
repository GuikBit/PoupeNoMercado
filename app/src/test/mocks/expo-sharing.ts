/** Stub do expo-sharing para Jest (node). */
export async function isAvailableAsync(): Promise<boolean> {
  return false;
}

export async function shareAsync(): Promise<void> {
  throw new Error('expo-sharing indisponível em testes');
}
