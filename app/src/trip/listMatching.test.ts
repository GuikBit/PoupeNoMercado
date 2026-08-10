import type { ListItemRow } from '../db/schema';
import { matchScanToList, suggestionLabel } from './listMatching';

function item(id: string, name: string, checked = 0): ListItemRow {
  return {
    id,
    listId: 'l1',
    name,
    qtyPlanned: null,
    unit: 'UN',
    checked,
    position: 0,
    category: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    deviceId: 'd',
  };
}

const lista = [item('1', 'pão de forma'), item('2', 'vinagre'), item('3', 'detergente')];

describe('matchScanToList', () => {
  it('marca sozinho quando o nome bate', () => {
    const m = matchScanToList('PAO DE FORMA TRADICIONAL 400G', lista);
    expect(m.action).toBe('auto');
    expect(m.item?.id).toBe('1');
  });

  it('devolve a linha do banco, não o objeto do domínio', () => {
    const m = matchScanToList('VINAGRE DE ALCOOL PEIXE 750ML', lista);
    expect(m.item?.listId).toBe('l1');
    expect(m.item?.deviceId).toBe('d');
  });

  it('ignora item já comprado', () => {
    const m = matchScanToList('VINAGRE DE ALCOOL PEIXE 750ML', [item('2', 'vinagre', 1)]);
    expect(m.action).toBe('none');
  });

  it('não casa produto diferente que compartilha palavra', () => {
    const m = matchScanToList('LEITE CONDENSADO MOCA 395G', [item('9', 'leite em pó')]);
    expect(m.action).not.toBe('auto');
  });

  it('lista vazia não casa nada', () => {
    expect(matchScanToList('QUALQUER COISA', []).action).toBe('none');
  });
});

describe('suggestionLabel', () => {
  it('pergunta em vez de marcar quando é só sugestão', () => {
    const label = suggestionLabel({ action: 'suggest', item: item('1', 'pão de forma'), score: 0.6 });
    expect(label).toBe('Marcar "pão de forma" como comprado?');
  });

  it('não pergunta quando marcou sozinho nem quando não achou', () => {
    expect(suggestionLabel({ action: 'auto', item: item('1', 'x'), score: 0.9 })).toBeNull();
    expect(suggestionLabel({ action: 'none', item: null, score: 0 })).toBeNull();
  });
});
