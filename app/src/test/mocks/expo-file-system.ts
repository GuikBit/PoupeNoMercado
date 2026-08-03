/**
 * Mock do expo-file-system para testes em Node (ts-jest, sem device).
 * Os adaptadores injetam `readBase64` nos testes; este stub só evita o
 * require do módulo nativo.
 */
export class File {
  constructor(public uri: string) {}
  base64(): string {
    throw new Error('File.base64 não disponível em teste — injete readBase64');
  }
}

export class Directory {
  exists = false;
  create(): void {}
}

export const Paths = { document: '/mock-documents' };
