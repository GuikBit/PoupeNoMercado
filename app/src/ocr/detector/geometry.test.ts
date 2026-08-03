import {
  centralCropRect,
  GUIDE_RATIO,
  isConvexQuad,
  opencvHueToDegrees,
  orderCorners,
  pickLargestQuad,
  polygonArea,
  targetSizeFromQuad,
} from './geometry';

describe('opencvHueToDegrees', () => {
  it('converte a escala 0..179 do OpenCV para 0..360 do parser', () => {
    expect(opencvHueToDegrees(25)).toBe(50); // amarelo do classificador
    expect(opencvHueToDegrees(0)).toBe(0);
    expect(opencvHueToDegrees(179)).toBe(358);
  });
});

describe('polygonArea', () => {
  it('calcula área pelo shoelace, independente da orientação', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(100);
  });
});

describe('isConvexQuad', () => {
  it('aceita retângulo e rejeita quadrilátero côncavo', () => {
    expect(
      isConvexQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toBe(true);
    expect(
      isConvexQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 2, y: 2 }, // reentrante
        { x: 0, y: 10 },
      ]),
    ).toBe(false);
  });
});

describe('orderCorners', () => {
  it('ordena como TL, TR, BR, BL a partir de qualquer permutação', () => {
    const tl = { x: 10, y: 20 };
    const tr = { x: 200, y: 25 };
    const br = { x: 205, y: 90 };
    const bl = { x: 12, y: 95 };
    const [a, b, c, d] = orderCorners([br, tl, bl, tr]);
    expect(a).toEqual(tl);
    expect(b).toEqual(tr);
    expect(c).toEqual(br);
    expect(d).toEqual(bl);
  });

  it('rejeita entrada que não tem 4 pontos', () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow(/4 pontos/);
  });
});

describe('pickLargestQuad', () => {
  const image = { width: 100, height: 100 };
  const quadAt = (x: number, y: number, w: number, h: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  it('com duas etiquetas no quadro, fica com a maior (ADV-1/T14)', () => {
    const small = quadAt(0, 0, 30, 15);
    const big = quadAt(40, 40, 50, 30);
    expect(pickLargestQuad([small, big], image)).toBe(big);
  });

  it('descarta quadriláteros abaixo da área mínima relativa', () => {
    expect(pickLargestQuad([quadAt(0, 0, 10, 5)], image)).toBeNull(); // 0,5% da imagem
  });

  it('descarta não-convexos', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 90 },
    ];
    expect(pickLargestQuad([concave], image)).toBeNull();
  });
});

describe('targetSizeFromQuad', () => {
  it('usa a média dos lados opostos, preservando a proporção da etiqueta', () => {
    const size = targetSizeFromQuad([
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 236, y: 100 },
      { x: 4, y: 98 },
    ]);
    expect(size.width).toBeGreaterThan(230);
    expect(size.width).toBeLessThan(240);
    expect(size.height).toBeGreaterThan(95);
    expect(size.height).toBeLessThan(102);
  });
});

describe('centralCropRect', () => {
  it('recorte paisagem centralizado com a proporção do guia', () => {
    const rect = centralCropRect({ width: 1600, height: 1200 });
    expect(rect.width / rect.height).toBeCloseTo(GUIDE_RATIO, 1);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1600);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1200);
  });

  it('em imagem retrato, limita pela largura', () => {
    const rect = centralCropRect({ width: 900, height: 1600 });
    expect(rect.width).toBeLessThanOrEqual(Math.round(900 * 0.92));
    expect(rect.width / rect.height).toBeCloseTo(GUIDE_RATIO, 1);
  });
});
