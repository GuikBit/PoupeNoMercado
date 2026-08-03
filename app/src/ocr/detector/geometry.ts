/**
 * Geometria pura do detector de etiqueta — sem OpenCV, testável em Jest (node).
 * A orquestração impura (Mats, warp) vive em detect.ts.
 */

/** Ponto em pixels da imagem analisada. */
export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Proporção do retículo (guia visual) da câmera — paisagem, próxima da etiqueta
 * de gôndola. A MESMA constante alimenta o fallback do detector e a CaptureView.
 */
export const GUIDE_RATIO = 2.4;

/**
 * Faixa de amarelo em HSV do OpenCV (H em 0..179 — metade dos graus).
 * Equivale ao amarelo do classificador (hue 50°±15 em 0..360, classify.ts).
 */
export const YELLOW_HSV_LOWER = { h: 17, s: 80, v: 80 };
export const YELLOW_HSV_UPPER = { h: 33, s: 255, v: 255 };

/** Converte matiz do OpenCV (0..179) para graus (0..360), escala do parser. */
export function opencvHueToDegrees(h: number): number {
  return h * 2;
}

/** Área de um polígono (shoelace), em px². */
export function polygonArea(pts: PixelPoint[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Um quadrilátero é convexo quando todos os produtos vetoriais têm o mesmo sinal. */
export function isConvexQuad(pts: PixelPoint[]): boolean {
  if (pts.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    if (!a || !b || !c) return false;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const current = Math.sign(cross);
    if (sign === 0) {
      sign = current;
    } else if (current !== sign) {
      return false;
    }
  }
  return sign !== 0;
}

/**
 * Ordena os 4 cantos como TL, TR, BR, BL.
 * TL tem a menor soma x+y, BR a maior; TR tem a menor diferença y-x, BL a maior.
 */
export function orderCorners(
  pts: PixelPoint[],
): [PixelPoint, PixelPoint, PixelPoint, PixelPoint] {
  if (pts.length !== 4) {
    throw new Error(`orderCorners espera 4 pontos, recebeu ${pts.length}`);
  }
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  const tl = bySum[0];
  const br = bySum[3];
  const tr = byDiff[0];
  const bl = byDiff[3];
  if (!tl || !tr || !br || !bl) {
    throw new Error('orderCorners: pontos inválidos');
  }
  return [tl, tr, br, bl];
}

/**
 * Escolhe o maior quadrilátero convexo com área mínima relativa à imagem.
 * Resolve ADV-1/T14 (duas etiquetas no quadro): fica a maior.
 */
export function pickLargestQuad(
  quads: PixelPoint[][],
  image: PixelSize,
  minAreaRatio = 0.08,
): PixelPoint[] | null {
  const imageArea = image.width * image.height;
  if (imageArea <= 0) return null;
  let best: PixelPoint[] | null = null;
  let bestArea = 0;
  for (const quad of quads) {
    if (quad.length !== 4 || !isConvexQuad(quad)) continue;
    const area = polygonArea(quad);
    if (area / imageArea < minAreaRatio) continue;
    if (area > bestArea) {
      best = quad;
      bestArea = area;
    }
  }
  return best;
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Tamanho de saída do warp: média dos lados opostos do quadrilátero ordenado.
 * Preserva a proporção real da etiqueta — o classificador depende dela.
 */
export function targetSizeFromQuad(
  corners: [PixelPoint, PixelPoint, PixelPoint, PixelPoint],
): PixelSize {
  const [tl, tr, br, bl] = corners;
  const width = Math.max(1, Math.round((distance(tl, tr) + distance(bl, br)) / 2));
  const height = Math.max(1, Math.round((distance(tl, bl) + distance(tr, br)) / 2));
  return { width, height };
}

/**
 * Recorte central com a proporção do guia visual — fallback quando não há
 * quadrilátero confiável (ex.: Tipo A, papel branco sem borda amarela).
 */
export function centralCropRect(image: PixelSize, guideRatio = GUIDE_RATIO): PixelRect {
  const maxWidth = image.width * 0.92;
  const maxHeight = image.height * 0.92;
  let width = maxWidth;
  let height = width / guideRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * guideRatio;
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  return {
    x: Math.round((image.width - width) / 2),
    y: Math.round((image.height - height) / 2),
    width,
    height,
  };
}
