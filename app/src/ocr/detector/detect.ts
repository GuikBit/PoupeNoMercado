/**
 * Detector de etiqueta (E1 do pipeline, docs/02 §2): localiza o retângulo da
 * etiqueta pela borda amarela, corrige a perspectiva e mede o matiz dominante.
 * Sem quadrilátero confiável, recorta a região central do guia visual —
 * o fallback nunca bloqueia (Tipo A é papel branco, sem borda amarela).
 *
 * Processamento síncrono na JS thread — aceitável no Laboratório porque a
 * imagem é reduzida para ≤1600 px antes de tocar o OpenCV.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  BorderTypes,
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  DecompTypes,
  InterpolationFlags,
  Mat,
  MorphShapes,
  MorphTypes,
  OpenCV,
  Point2f,
  Point2fVector,
  PointVector,
  PointVectorOfVectors,
  Rect,
  RetrievalModes,
  Scalar,
  Size,
} from 'react-native-fast-opencv';

import type { ImageRef } from '../types';
import {
  centralCropRect,
  GUIDE_RATIO,
  opencvHueToDegrees,
  orderCorners,
  pickLargestQuad,
  type PixelPoint,
  targetSizeFromQuad,
  YELLOW_HSV_LOWER,
  YELLOW_HSV_UPPER,
} from './geometry';

export interface DetectResult {
  /** Imagem retificada (ou recorte do guia), salva em cache. */
  image: ImageRef;
  /** Matiz dominante 0..360 — alimenta ParseOptions.dominantHue. */
  dominantHue?: number;
  method: 'quad' | 'fallback';
}

/** Lado maior máximo antes do OpenCV — suficiente para OCR de etiqueta. */
const MAX_SIDE = 1600;
/** Cobertura mínima da máscara amarela para confiar no matiz medido. */
const MIN_HUE_COVERAGE = 0.15;
/** Fração da épsilon do approxPolyDP sobre o perímetro do contorno. */
const APPROX_EPSILON = 0.02;

interface Releasable {
  release(): void;
}

/**
 * Normaliza EXIF e limita o tamanho — a MESMA imagem alimenta OpenCV e OCR
 * (o ML Kit aplica EXIF sozinho; o decode base64 do OpenCV não).
 */
async function normalizePhoto(
  photo: ImageRef,
): Promise<{ base64: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_SIDE) {
    context.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
  if (!saved.base64) {
    throw new Error('Detector: falha ao obter base64 da imagem normalizada');
  }
  return { base64: saved.base64, width: saved.width, height: saved.height };
}

function saveMat(mat: Mat, tag: string): ImageRef {
  const dir = new Directory(Paths.cache, 'detector');
  if (!dir.exists) {
    dir.create();
  }
  const file = new File(dir, `${tag}-${Date.now()}.jpg`);
  // Compressão na escala 0..1 (a v1 do fast-opencv rejeita 0..100).
  mat.saveToFile(file.uri.replace('file://', ''), 'jpeg', 0.9);
  return { uri: file.uri, width: mat.cols, height: mat.rows };
}

export async function detectLabel(photo: ImageRef): Promise<DetectResult> {
  const normalized = await normalizePhoto(photo);

  const released: Releasable[] = [];
  const track = <T extends Releasable>(obj: T): T => {
    released.push(obj);
    return obj;
  };

  try {
    const src = track(Mat.createFromBase64(normalized.base64));
    const imageSize = { width: src.cols, height: src.rows };

    // Máscara amarela em HSV (decode base64 entrega BGR, convenção OpenCV).
    const hsv = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.cvtColor(src, hsv, ColorConversionCodes.COLOR_BGR2HSV);
    const mask = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.inRange(
      hsv,
      track(Scalar.create(YELLOW_HSV_LOWER.h, YELLOW_HSV_LOWER.s, YELLOW_HSV_LOWER.v)),
      track(Scalar.create(YELLOW_HSV_UPPER.h, YELLOW_HSV_UPPER.s, YELLOW_HSV_UPPER.v)),
      mask,
    );
    const kernel = track(
      OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, track(Size.create(5, 5))),
    );
    OpenCV.morphologyEx(mask, mask, MorphTypes.MORPH_CLOSE, kernel);

    // Contornos externos → candidatos a quadrilátero.
    const contours = track(PointVectorOfVectors.create());
    OpenCV.findContours(
      mask,
      contours,
      RetrievalModes.RETR_EXTERNAL,
      ContourApproximationModes.CHAIN_APPROX_SIMPLE,
    );
    const quads: PixelPoint[][] = [];
    for (let i = 0; i < contours.length; i++) {
      const contour = contours.get(i);
      const perimeter = OpenCV.arcLength(contour, true).value;
      const approx = track(PointVector.create());
      OpenCV.approxPolyDP(contour, approx, APPROX_EPSILON * perimeter, true);
      if (approx.length === 4) {
        quads.push(approx.getAll().map((p) => ({ x: p.x, y: p.y })));
      }
    }

    const quad = pickLargestQuad(quads, imageSize);
    if (quad) {
      const corners = orderCorners(quad);
      const target = targetSizeFromQuad(corners);
      // Popular com push(): o create([...]) com array deixa o vetor vazio no
      // binding e o getPerspectiveTransform falha com checkVector != 4.
      const srcPts = track(Point2fVector.create());
      for (const p of corners) {
        srcPts.push(Point2f.create(p.x, p.y));
      }
      const dstPts = track(Point2fVector.create());
      dstPts.push(Point2f.create(0, 0));
      dstPts.push(Point2f.create(target.width, 0));
      dstPts.push(Point2f.create(target.width, target.height));
      dstPts.push(Point2f.create(0, target.height));
      const transform = track(OpenCV.getPerspectiveTransform(srcPts, dstPts, DecompTypes.DECOMP_LU));
      const out = track(Mat.create(0, 0, DataTypes.CV_8U));
      OpenCV.warpPerspective(
        src,
        out,
        transform,
        track(Size.create(target.width, target.height)),
        InterpolationFlags.INTER_LINEAR,
        BorderTypes.BORDER_CONSTANT,
        track(Scalar.create(0, 0, 0)),
      );
      const dominantHue = opencvHueToDegrees(OpenCV.mean(hsv, mask).a);
      return { image: saveMat(out, 'quad'), dominantHue, method: 'quad' };
    }

    // Fallback: recorte central com a proporção do guia visual.
    const rect = centralCropRect(imageSize, GUIDE_RATIO);
    const roi = track(Rect.create(rect.x, rect.y, rect.width, rect.height));
    const out = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.crop(src, out, roi);
    const hsvCrop = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.crop(hsv, hsvCrop, roi);
    const maskCrop = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.crop(mask, maskCrop, roi);
    const coverage = OpenCV.countNonZero(maskCrop).value / (rect.width * rect.height);
    const dominantHue =
      coverage >= MIN_HUE_COVERAGE
        ? opencvHueToDegrees(OpenCV.mean(hsvCrop, maskCrop).a)
        : undefined;
    return { image: saveMat(out, 'fallback'), dominantHue, method: 'fallback' };
  } finally {
    // O GC do JSI recolheria sozinho, mas Mats de imagem são grandes — libere já.
    for (const obj of released.reverse()) {
      obj.release();
    }
  }
}
