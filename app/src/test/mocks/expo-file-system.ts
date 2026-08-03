/**
 * Mock do expo-file-system para testes em Node (ts-jest, sem device).
 * Os adaptadores injetam `readBase64` nos testes; este stub só evita o
 * require do módulo nativo.
 */
export class File {
  uri: string;
  exists = false;

  constructor(base: string | { uri: string }, name?: string) {
    const baseUri = typeof base === 'string' ? base : base.uri;
    this.uri = name ? `${baseUri}/${name}` : baseUri;
  }

  base64(): string {
    throw new Error('File.base64 não disponível em teste — injete readBase64');
  }

  write(): void {}
  move(): void {}
  copy(): void {}
}

export class Directory {
  uri: string;
  exists = false;

  constructor(base: string | { uri: string }, name?: string) {
    const baseUri = typeof base === 'string' ? base : base.uri;
    this.uri = name ? `${baseUri}/${name}` : baseUri;
  }

  create(): void {}
}

export const Paths = { document: '/mock-documents', cache: '/mock-cache' };
