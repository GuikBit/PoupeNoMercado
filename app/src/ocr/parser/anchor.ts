/**
 * Busca espacial por âncora (§6.2): o parser não busca por posição absoluta —
 * encontra uma âncora textual e procura o valor numa região relativa a ela.
 * Robusto a etiqueta torta, rotação leve e blocos fragmentados pelo OCR.
 */
import type { BoundingBox, OcrBlock } from '../types';
import { normalizeText } from './normalize';

/** Unidade de texto posicionada, já normalizada. */
export interface PositionedText {
  text: string;
  box: BoundingBox;
  confidence: number;
}

export interface AnchorSpec {
  /** Regex aplicada ao texto normalizado. */
  pattern: RegExp;
  /** Onde buscar o valor, relativo à caixa da âncora. */
  search: {
    direction: 'right' | 'below' | 'sameBox' | 'rightOrBelow';
    maxDistanceRatio: number; // fração da dimensão da imagem (coordenadas normalizadas)
    verticalToleranceRatio: number;
  };
  /** Regex que extrai o valor na região encontrada. */
  valuePattern: RegExp;
}

export interface AnchorHit {
  anchor: PositionedText;
  value: PositionedText;
  match: RegExpExecArray;
}

/**
 * Achata a árvore de blocos em linhas posicionadas normalizadas.
 * Quando o bloco tem `lines`, usa as linhas (granularidade melhor para a
 * busca espacial); senão o próprio bloco.
 */
export function flattenToLines(blocks: OcrBlock[]): PositionedText[] {
  const out: PositionedText[] = [];
  for (const block of blocks) {
    if (block.lines && block.lines.length > 0) {
      for (const line of block.lines) {
        out.push({ text: normalizeText(line.text), box: line.box, confidence: line.confidence });
      }
    } else {
      out.push({ text: normalizeText(block.text), box: block.box, confidence: block.confidence });
    }
  }
  return out;
}

function centerY(box: BoundingBox): number {
  return box.y + box.h / 2;
}

function horizontalGap(anchor: BoundingBox, candidate: BoundingBox): number {
  return candidate.x - (anchor.x + anchor.w);
}

function isRightOf(anchor: BoundingBox, c: BoundingBox, spec: AnchorSpec['search']): boolean {
  const gap = horizontalGap(anchor, c);
  const sameLine = Math.abs(centerY(c) - centerY(anchor)) <= spec.verticalToleranceRatio;
  return sameLine && gap > -anchor.w * 0.2 && gap <= spec.maxDistanceRatio;
}

function isBelow(anchor: BoundingBox, c: BoundingBox, spec: AnchorSpec['search']): boolean {
  const verticalGap = c.y - (anchor.y + anchor.h);
  const overlapsX = c.x < anchor.x + anchor.w && c.x + c.w > anchor.x;
  return verticalGap > -anchor.h * 0.3 && verticalGap <= spec.maxDistanceRatio && overlapsX;
}

function distance(anchor: BoundingBox, c: BoundingBox): number {
  const dx = Math.abs(c.x - anchor.x);
  const dy = Math.abs(centerY(c) - centerY(anchor));
  return dx + dy * 2; // proximidade vertical pesa mais — mesma linha vence
}

/** Itens abaixo da caixa, com sobreposição horizontal, ordenados por proximidade. */
export function candidatesBelow(
  items: PositionedText[],
  anchorBox: BoundingBox,
  maxDistanceRatio: number,
): PositionedText[] {
  const spec = { maxDistanceRatio, verticalToleranceRatio: 0, direction: 'below' as const };
  return items
    .filter((c) => c.box !== anchorBox && isBelow(anchorBox, c.box, spec))
    .sort((a, b) => a.box.y - b.box.y || distance(anchorBox, a.box) - distance(anchorBox, b.box));
}

/** Itens à direita, na mesma linha, ordenados por proximidade. */
export function candidatesRightOf(
  items: PositionedText[],
  anchorBox: BoundingBox,
  maxDistanceRatio: number,
  verticalToleranceRatio: number,
): PositionedText[] {
  const spec = { maxDistanceRatio, verticalToleranceRatio, direction: 'right' as const };
  return items
    .filter((c) => c.box !== anchorBox && isRightOf(anchorBox, c.box, spec))
    .sort((a, b) => distance(anchorBox, a.box) - distance(anchorBox, b.box));
}

/**
 * Encontra a primeira âncora que casa com `spec.pattern` e o valor mais
 * próximo na região indicada. Retorna null quando âncora ou valor não existem.
 */
export function findByAnchor(items: PositionedText[], spec: AnchorSpec): AnchorHit | null {
  const anchors = items.filter((i) => spec.pattern.test(i.text));

  for (const anchor of anchors) {
    // sameBox: o valor está no próprio texto da âncora.
    if (spec.search.direction === 'sameBox') {
      const match = spec.valuePattern.exec(anchor.text);
      if (match) return { anchor, value: anchor, match };
      continue;
    }

    const inRegion = (c: PositionedText): boolean => {
      if (c === anchor) return false;
      if (spec.search.direction === 'right') return isRightOf(anchor.box, c.box, spec.search);
      if (spec.search.direction === 'below') return isBelow(anchor.box, c.box, spec.search);
      return isRightOf(anchor.box, c.box, spec.search) || isBelow(anchor.box, c.box, spec.search);
    };

    const candidates = items
      .filter(inRegion)
      .sort((a, b) => distance(anchor.box, a.box) - distance(anchor.box, b.box));

    // O valor pode estar no fim do texto da própria âncora ("DE R$ 2,99 A UNIDADE").
    const selfMatch = spec.valuePattern.exec(anchor.text);
    if (selfMatch) return { anchor, value: anchor, match: selfMatch };

    for (const candidate of candidates) {
      const match = spec.valuePattern.exec(candidate.text);
      if (match) return { anchor, value: candidate, match };
    }
  }
  return null;
}
