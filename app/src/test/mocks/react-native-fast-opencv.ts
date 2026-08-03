/**
 * Stub do react-native-fast-opencv para Jest (node).
 * Qualquer uso falha alto — o detector só roda em device; os testes cobrem
 * a geometria pura (geometry.ts) e injetam detectFn no pipeline do Lab.
 */
function unavailable(): never {
  throw new Error('react-native-fast-opencv indisponível em testes — injete detectFn');
}

const throwing: Record<string, unknown> = new Proxy(
  {},
  {
    get: () => unavailable,
  },
);

export const OpenCV = throwing;
export const Mat = throwing;
export const MatVector = throwing;
export const Point = throwing;
export const Point2f = throwing;
export const Point2fVector = throwing;
export const PointVector = throwing;
export const PointVectorOfVectors = throwing;
export const Rect = throwing;
export const RectVector = throwing;
export const Scalar = throwing;
export const Size = throwing;
export const BorderTypes = throwing;
export const ColorConversionCodes = throwing;
export const ContourApproximationModes = throwing;
export const DataTypes = throwing;
export const DecompTypes = throwing;
export const InterpolationFlags = throwing;
export const MorphShapes = throwing;
export const MorphTypes = throwing;
export const RetrievalModes = throwing;
