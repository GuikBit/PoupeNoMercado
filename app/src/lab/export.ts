/**
 * Escrita em disco e compartilhamento do export do Laboratório.
 *
 * A construção do bundle (pura, testável em node) vive em `exportBundle.ts`;
 * este módulo só faz I/O. A separação existe porque `expo-file-system` não
 * carrega fora do runtime do app — sem ela, nenhum script de node consegue
 * reaproveitar o formato de export.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { buildExportBundle } from './exportBundle';
import type { LabCase } from './types';

export type { ExportBundle, ExportImage, ExportJsonFile } from './exportBundle';
export { buildExportBundle } from './exportBundle';

/**
 * Escreve o bundle em Paths.document/exports/lab-<data>/ e compartilha o
 * index.json. As imagens ficam na árvore para transferência via `adb pull`
 * (expo-sharing compartilha um arquivo por vez).
 */
export async function exportCases(cases: LabCase[], dateIso: string): Promise<string> {
  const bundle = buildExportBundle(cases);
  const root = new Directory(Paths.document, `exports/lab-${dateIso.slice(0, 10)}`);
  if (!root.exists) {
    root.create({ intermediates: true });
  }
  const labels = new Directory(root, 'labels');
  if (!labels.exists) {
    labels.create();
  }

  for (const jsonFile of bundle.jsonFiles) {
    new File(root, jsonFile.path).write(JSON.stringify(jsonFile.content, null, 2));
  }
  for (const image of bundle.images) {
    const source = new File(Paths.document, image.sourcePath);
    const dest = new File(root, image.path);
    if (source.exists && !dest.exists) {
      source.copy(dest);
    }
  }

  if (await isAvailableAsync()) {
    await shareAsync(new File(root, 'index.json').uri, { mimeType: 'application/json' });
  }
  return root.uri;
}
