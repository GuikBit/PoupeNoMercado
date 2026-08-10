import { createTestDb, type TestDb } from '../db/testDb';
import { resetListStore, useListStore } from './listStore';

let t: TestDb;
const store = () => useListStore.getState();

beforeEach(() => {
  resetListStore();
  t = createTestDb();
  store().attach(t.ctx);
});
afterEach(() => t.close());

describe('listas', () => {
  it('cria e lista', () => {
    store().create('Mensal');
    store().create('Feira');
    expect(store().lists.map((l) => l.name)).toEqual(['Mensal', 'Feira']);
  });

  it('renomeia', () => {
    const lista = store().create('Mensal')!;
    store().rename(lista.id, 'Mensal Agosto');
    expect(store().lists[0]?.name).toBe('Mensal Agosto');
  });

  it('remover some da listagem e fecha se estiver aberta', () => {
    const lista = store().create('Mensal')!;
    store().open(lista.id);
    store().remove(lista.id);
    expect(store().lists).toHaveLength(0);
    expect(store().openListId).toBeNull();
  });
});

describe('itens', () => {
  beforeEach(() => {
    const lista = store().create('Mensal')!;
    store().open(lista.id);
  });

  it('adiciona na ordem', () => {
    store().addItem('arroz');
    store().addItem('feijão');
    expect(store().items.map((i) => i.name)).toEqual(['arroz', 'feijão']);
  });

  it('não adiciona sem lista aberta', () => {
    store().open(null);
    store().addItem('arroz');
    expect(store().items).toHaveLength(0);
  });

  it('marca e desmarca', () => {
    store().addItem('arroz');
    const item = store().items[0]!;
    store().toggle(item.id, true);
    expect(store().items[0]?.checked).toBe(1);
    store().toggle(item.id, false);
    expect(store().items[0]?.checked).toBe(0);
  });

  it('move para baixo e para cima', () => {
    store().addItem('arroz');
    store().addItem('feijão');
    store().addItem('sal');

    store().move(store().items[0]!.id, 1);
    expect(store().items.map((i) => i.name)).toEqual(['feijão', 'arroz', 'sal']);

    store().move(store().items[2]!.id, -1);
    expect(store().items.map((i) => i.name)).toEqual(['feijão', 'sal', 'arroz']);
  });

  it('mover além da borda não faz nada', () => {
    store().addItem('arroz');
    store().addItem('feijão');
    store().move(store().items[0]!.id, -1);
    store().move(store().items[1]!.id, 1);
    expect(store().items.map((i) => i.name)).toEqual(['arroz', 'feijão']);
  });

  it('remove item', () => {
    store().addItem('arroz');
    store().removeItem(store().items[0]!.id);
    expect(store().items).toHaveLength(0);
  });
});
