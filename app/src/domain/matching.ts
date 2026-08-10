/**
 * Casamento entre o produto escaneado e a lista de compras do usuário.
 * Especificação: docs/02-MOTOR-RECONHECIMENTO.md §8.
 *
 * O limiar de marcação automática é alto (0,75) DE PROPÓSITO: falso positivo
 * aqui irrita muito mais que falso negativo — marcar o item errado como
 * comprado faz a pessoa sair do mercado sem o produto.
 */
import { trigramSimilarity } from './similarity';

/** Marca sozinho a partir daqui. */
export const AUTO_MATCH_THRESHOLD = 0.75;
/** Entre este e o de cima, sugere e pergunta. Abaixo, silêncio. */
export const SUGGEST_MATCH_THRESHOLD = 0.45;

/** Tokens de embalagem que só atrapalham a comparação: "500G", "2L", "C/4". */
const PACKAGE_TOKEN = /\b\d+\s*(G|ML|KG|LT|L|UN|CX|PC|PCT|GR)\b/g;
const MULTIPACK = /\bC\s*\/\s*\d+\b/g;

/**
 * Normaliza para comparação (§8.1): caixa alta, sem acento, sem tokens de
 * embalagem, sem pontuação, espaços colapsados.
 */
export function normalizeProductName(raw: string): string {
  return raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(MULTIPACK, ' ')
    .replace(PACKAGE_TOKEN, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Quanto do termo da lista está presente no nome escaneado, palavra a palavra.
 *
 * ⚠️ Jaccard puro sobre trigramas (o `similarity()` do pg_trgm) NÃO serve aqui:
 * a lista traz termo curto e genérico ("vinagre") e a etiqueta traz nome longo
 * e específico ("VINAGRE DE ALCOOL PEIXE 750ML"). Eles compartilham pouco da
 * *união*, então o score afunda mesmo sendo o mesmo produto.
 *
 * O análogo correto é o `word_similarity()` do pg_trgm — contenção, não
 * interseção. Mas contenção sobre a string inteira reintroduz o falso positivo
 * que a §8 teme ("SAL" casaria com "SALGADINHO"), então a contenção é medida
 * PALAVRA A PALAVRA: cada palavra do termo da lista procura a melhor
 * correspondente no nome escaneado, e o score é a média ponderada pelo
 * comprimento da palavra (palavra longa pesa mais que "DE").
 */
export function listMatchScore(scannedName: string, listItemName: string): number {
  const scannedWords = normalizeProductName(scannedName).split(' ').filter(Boolean);
  const listWords = normalizeProductName(listItemName).split(' ').filter(Boolean);
  if (scannedWords.length === 0 || listWords.length === 0) return 0;

  let weighted = 0;
  let weight = 0;
  for (const word of listWords) {
    let best = 0;
    for (const candidate of scannedWords) {
      const score = word === candidate ? 1 : trigramSimilarity(word, candidate);
      if (score > best) best = score;
    }
    weighted += best * word.length;
    weight += word.length;
  }
  return weight === 0 ? 0 : weighted / weight;
}

export interface ShoppingListItem {
  id: string;
  /** Como o usuário escreveu: "pão de forma". */
  name: string;
  /** Itens já comprados não competem pelo casamento. */
  done: boolean;
}

export type MatchAction = 'auto' | 'suggest' | 'none';

export interface MatchResult {
  action: MatchAction;
  item: ShoppingListItem | null;
  score: number;
}

/**
 * Melhor candidato entre os itens PENDENTES da lista.
 * Empate resolve pelo primeiro da lista — determinístico, sem surpresa.
 */
export function matchToList(scannedName: string, list: readonly ShoppingListItem[]): MatchResult {
  const scanned = normalizeProductName(scannedName);
  if (scanned.length === 0) {
    return { action: 'none', item: null, score: 0 };
  }

  let best: ShoppingListItem | null = null;
  let bestScore = 0;
  for (const item of list) {
    if (item.done) continue;
    const score = listMatchScore(scanned, item.name);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best === null || bestScore < SUGGEST_MATCH_THRESHOLD) {
    return { action: 'none', item: null, score: bestScore };
  }
  return {
    action: bestScore >= AUTO_MATCH_THRESHOLD ? 'auto' : 'suggest',
    item: best,
    score: bestScore,
  };
}
