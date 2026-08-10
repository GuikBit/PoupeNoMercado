/**
 * Escrita e compartilhamento do resultado do lote.
 *
 * Diferente do export de casos, aqui o arquivo único já é o entregável — dá
 * para mandar direto pelo compartilhamento, sem `adb pull`. É a única coisa
 * que precisa sair do device para medir as variantes.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import type { BatchReport } from './batch';

export interface BatchExportResult {
  uri: string;
  sizeBytes: number;
}

export async function exportBatchReport(
  report: BatchReport,
  dateIso: string,
): Promise<BatchExportResult> {
  const root = new Directory(Paths.document, 'exports');
  if (!root.exists) {
    root.create({ intermediates: true });
  }
  const file = new File(root, `batch-${dateIso.slice(0, 19).replace(/[:]/g, '')}.json`);
  const payload = JSON.stringify(report);
  file.write(payload);

  if (await isAvailableAsync()) {
    await shareAsync(file.uri, { mimeType: 'application/json' });
  }
  return { uri: file.uri, sizeBytes: payload.length };
}
