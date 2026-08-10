/**
 * Cola entre a leitura da etiqueta e a lista de compras (docs/02 §8).
 *
 * O `matching.ts` do domínio decide SE casa; este módulo traduz isso para o
 * que a tela faz. A separação existe porque o limiar é regra de negócio e a
 * reação é decisão de UI.
 *
 * A regra que governa tudo aqui: **falso positivo custa mais que falso
 * negativo**. Marcar o item errado como comprado faz a pessoa sair do mercado
 * sem o produto — por isso `suggest` pergunta em vez de marcar.
 */
import type { ListItemRow } from '../db/schema';
import { matchToList, type ShoppingListItem } from '../domain/matching';

export interface ListMatch {
  action: 'auto' | 'suggest' | 'none';
  item: ListItemRow | null;
  score: number;
}

/** Converte as linhas do banco para o formato do domínio e casa. */
export function matchScanToList(scannedName: string, rows: readonly ListItemRow[]): ListMatch {
  const candidates: ShoppingListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    done: row.checked === 1,
  }));

  const result = matchToList(scannedName, candidates);
  return {
    action: result.action,
    item: result.item ? (rows.find((r) => r.id === result.item?.id) ?? null) : null,
    score: result.score,
  };
}

/** Texto da pergunta de confirmação, quando o casamento é só sugestão. */
export function suggestionLabel(match: ListMatch): string | null {
  if (match.action !== 'suggest' || !match.item) return null;
  return `Marcar "${match.item.name}" como comprado?`;
}
