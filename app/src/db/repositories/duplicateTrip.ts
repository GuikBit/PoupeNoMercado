/**
 * "Duplicar esta compra" (Etapa 5.2).
 *
 * ⚠️ Duplicar gera uma LISTA, não um carrinho pronto.
 *
 * A tentação é recriar o carrinho com os itens e preços da compra anterior —
 * e seria errado. Preço de mês passado não é preço de hoje: o total apareceria
 * pronto, com aparência de verdade, e estaria desatualizado. Isso é
 * exatamente o "erro confiante" que o princípio nº 5 proíbe.
 *
 * Então a duplicação carrega o que NÃO envelhece (o que comprar) e descarta o
 * que envelhece (quanto custava). Os preços vêm do escaneamento novo.
 *
 * Módulo separado porque cruza dois repositórios; deixá-lo dentro de um deles
 * criaria dependência circular.
 */
import type { RepoContext } from '../outbox';
import type { ShoppingListRow } from '../schema';
import { addListItem, createList } from './listRepo';
import { itemsOfTrip } from './tripRepo';

export interface DuplicateResult {
  list: ShoppingListRow;
  itemCount: number;
  /** Itens ignorados por serem duplicata dentro da mesma compra. */
  skipped: number;
}

/**
 * Cria uma lista a partir dos itens de uma compra. Nomes repetidos entram uma
 * vez só: no carrinho o mesmo produto pode aparecer em linhas distintas, mas
 * na lista isso vira ruído.
 */
export function duplicateTripAsList(
  ctx: RepoContext,
  tripId: string,
  listName: string,
): DuplicateResult {
  const items = itemsOfTrip(ctx.db, tripId);
  const list = createList(ctx, { name: listName });

  const vistos = new Set<string>();
  let added = 0;
  let skipped = 0;

  for (const item of items) {
    const chave = item.normalizedName || item.rawName.toUpperCase();
    if (vistos.has(chave)) {
      skipped++;
      continue;
    }
    vistos.add(chave);
    addListItem(ctx, list.id, { name: item.rawName, unit: item.saleUnit });
    added++;
  }

  return { list, itemCount: added, skipped };
}
