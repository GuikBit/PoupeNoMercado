/**
 * Testes do casamento com a lista (docs/02 §8).
 * O que se protege aqui é o falso positivo: marcar o item errado como comprado
 * faz a pessoa sair do mercado sem o produto.
 */
import { matchToList, normalizeProductName, type ShoppingListItem } from './matching';

const lista: ShoppingListItem[] = [
  { id: '1', name: 'pão de forma', done: false },
  { id: '2', name: 'vinagre', done: false },
  { id: '3', name: 'detergente', done: false },
];

describe('normalizeProductName', () => {
  it('remove acento e caixa', () => {
    expect(normalizeProductName('Pão de Fôrma')).toBe('PAO DE FORMA');
  });

  it('remove tokens de embalagem', () => {
    expect(normalizeProductName('VINAGRE DE ALCOOL PEIXE 750ML')).toBe('VINAGRE DE ALCOOL PEIXE');
    expect(normalizeProductName('AZEITONA SACHE 120G')).toBe('AZEITONA SACHE');
    expect(normalizeProductName('LEITE 1L')).toBe('LEITE');
  });

  it('remove multipack', () => {
    expect(normalizeProductName('SABONETE DOVE 90G C/4')).toBe('SABONETE DOVE');
  });

  it('não come dígitos que fazem parte do nome', () => {
    expect(normalizeProductName('REFRIGERANTE 7UP')).toBe('REFRIGERANTE 7UP');
  });

  it('colapsa pontuação e espaço', () => {
    expect(normalizeProductName('  PAO   DE//FORMA  ')).toBe('PAO DE FORMA');
  });
});

describe('matchToList', () => {
  it('marca sozinho quando o nome bate', () => {
    const r = matchToList('PAO DE FORMA TRADICIONAL 400G', lista);
    expect(r.action).toBe('auto');
    expect(r.item?.id).toBe('1');
  });

  it('não sugere nada quando não há parecido', () => {
    const r = matchToList('DETERGENTE YPE NEUTRO 500ML', [
      { id: '9', name: 'picanha', done: false },
    ]);
    expect(r.action).toBe('none');
    expect(r.item).toBeNull();
  });

  it('ignora itens já comprados', () => {
    const r = matchToList('VINAGRE DE ALCOOL PEIXE 750ML', [
      { id: '2', name: 'vinagre', done: true },
    ]);
    expect(r.action).toBe('none');
  });

  it('nome vazio não casa com nada', () => {
    expect(matchToList('   ', lista).action).toBe('none');
  });

  it('escolhe o melhor candidato entre vários', () => {
    const r = matchToList('VINAGRE DE ALCOOL PEIXE 750ML', lista);
    expect(r.item?.id).toBe('2');
  });

  it('empate resolve pelo primeiro da lista, de forma determinística', () => {
    const duplicada: ShoppingListItem[] = [
      { id: 'a', name: 'vinagre', done: false },
      { id: 'b', name: 'vinagre', done: false },
    ];
    expect(matchToList('VINAGRE', duplicada).item?.id).toBe('a');
  });

  // A contenção palavra a palavra existe para casar termo curto com nome longo.
  // Estes testes provam que ela não abriu a porta para o falso positivo que a
  // §8 teme — marcar o item errado tira a pessoa do mercado sem o produto.
  it('não casa prefixo de palavra: "sal" não é "salgadinho"', () => {
    const r = matchToList('SALGADINHO FOFURA 50G', [{ id: 's', name: 'sal', done: false }]);
    expect(r.action).toBe('none');
  });

  it('não casa produto diferente que compartilha palavra', () => {
    const r = matchToList('LEITE CONDENSADO MOCA 395G', [
      { id: 'l', name: 'leite em pó', done: false },
    ]);
    expect(r.action).not.toBe('auto');
  });

  it('casa termo curto da lista com nome longo da etiqueta', () => {
    expect(matchToList('VINAGRE DE ALCOOL PEIXE 750ML', [
      { id: 'v', name: 'vinagre', done: false },
    ]).action).toBe('auto');
  });

  it('palavra extra na lista derruba para sugestão, não marca sozinho', () => {
    const r = matchToList('VINAGRE DE ALCOOL PEIXE 750ML', [
      { id: 'v', name: 'vinagre balsamico', done: false },
    ]);
    expect(r.action).not.toBe('auto');
  });

  it('o limiar automático é alto — parcial vira sugestão, não marcação', () => {
    const r = matchToList('PAO', [{ id: '1', name: 'pão de forma integral', done: false }]);
    expect(r.action).not.toBe('auto');
    expect(r.score).toBeLessThan(0.75);
  });
});
