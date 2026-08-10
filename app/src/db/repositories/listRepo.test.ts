/**
 * Listas de compras. O ponto sensível é a exclusão lógica: a sincronização
 * precisa propagar a remoção, então DELETE físico não serve.
 */
import { pendingOutbox } from '../outbox';
import { createTestDb, type TestDb } from '../testDb';
import {
  addListItem,
  createList,
  deleteList,
  deleteListItem,
  getList,
  itemsOfList,
  listAll,
  reorderListItems,
  setListItemChecked,
  updateList,
} from './listRepo';

let t: TestDb;
beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

describe('listas', () => {
  it('cria com orçamento opcional', () => {
    const semTeto = createList(t.ctx, { name: 'Mensal' });
    expect(semTeto.budgetCents).toBeNull();
    expect(createList(t.ctx, { name: 'Semana', budgetCents: 20_000 }).budgetCents).toBe(20_000);
  });

  it('renomeia e ajusta o teto', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    const atualizada = updateList(t.ctx, lista.id, { name: 'Mensal Julho', budgetCents: 15_000 });
    expect(atualizada.name).toBe('Mensal Julho');
    expect(atualizada.budgetCents).toBe(15_000);
  });

  it('distingue "não mexer no teto" de "remover o teto"', () => {
    const lista = createList(t.ctx, { name: 'X', budgetCents: 5000 });
    expect(updateList(t.ctx, lista.id, { name: 'Y' }).budgetCents).toBe(5000);
    expect(updateList(t.ctx, lista.id, { budgetCents: null }).budgetCents).toBeNull();
  });

  it('exclusão é lógica e some das consultas', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    const apagada = deleteList(t.ctx, lista.id);
    expect(apagada.deletedAt).not.toBeNull();
    expect(getList(t.db, lista.id)).toBeNull();
    expect(listAll(t.db)).toHaveLength(0);
  });

  it('recusa mexer em lista inexistente', () => {
    expect(() => updateList(t.ctx, 'nada', { name: 'x' })).toThrow(/não encontrada/i);
  });
});

describe('itens da lista', () => {
  it('entra no fim e mantém a ordem', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    addListItem(t.ctx, lista.id, { name: 'arroz' });
    addListItem(t.ctx, lista.id, { name: 'feijão' });
    addListItem(t.ctx, lista.id, { name: 'vinagre' });

    expect(itemsOfList(t.db, lista.id).map((i) => [i.name, i.position])).toEqual([
      ['arroz', 0],
      ['feijão', 1],
      ['vinagre', 2],
    ]);
  });

  it('marca e desmarca', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    const item = addListItem(t.ctx, lista.id, { name: 'arroz' });
    expect(setListItemChecked(t.ctx, item.id, true).checked).toBe(1);
    expect(setListItemChecked(t.ctx, item.id, false).checked).toBe(0);
  });

  it('reordena', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    const a = addListItem(t.ctx, lista.id, { name: 'arroz' });
    const b = addListItem(t.ctx, lista.id, { name: 'feijão' });
    reorderListItems(t.ctx, [b.id, a.id]);
    expect(itemsOfList(t.db, lista.id).map((i) => i.name)).toEqual(['feijão', 'arroz']);
  });

  it('remover não deixa buraco na posição do próximo', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    const a = addListItem(t.ctx, lista.id, { name: 'arroz' });
    addListItem(t.ctx, lista.id, { name: 'feijão' });
    deleteListItem(t.ctx, a.id);

    const novo = addListItem(t.ctx, lista.id, { name: 'sal' });
    expect(novo.position).toBe(1);
    expect(itemsOfList(t.db, lista.id)).toHaveLength(2);
  });

  it('a chave estrangeira impede item órfão', () => {
    expect(() => addListItem(t.ctx, 'lista-inexistente', { name: 'x' })).toThrow();
  });
});

describe('outbox das listas', () => {
  it('enfileira criação, alteração e exclusão', () => {
    const lista = createList(t.ctx, { name: 'Mensal' });
    const item = addListItem(t.ctx, lista.id, { name: 'arroz' });
    setListItemChecked(t.ctx, item.id, true);
    deleteListItem(t.ctx, item.id);

    expect(pendingOutbox(t.db).map((e) => [e.entity, e.op])).toEqual([
      ['shopping_list', 'upsert'],
      ['list_item', 'upsert'],
      ['list_item', 'upsert'],
      ['list_item', 'delete'],
    ]);
  });

  it('item órfão não deixa entrada na fila', () => {
    expect(() => addListItem(t.ctx, 'lista-inexistente', { name: 'x' })).toThrow();
    expect(pendingOutbox(t.db)).toHaveLength(0);
  });
});
