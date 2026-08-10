/**
 * Execução das variantes de pré-processamento em OpenCV.
 *
 * Entra entre o detector (E1) e o motor (E2): recebe a imagem já retificada e
 * devolve uma nova imagem em disco, pronta para o OCR. Segurar a detecção
 * constante é o que torna a comparação entre variantes legítima — só muda a
 * entrada do motor.
 *
 * Convenções herdadas de `detector/detect.ts`: tudo que aloca Mat é rastreado
 * e liberado no finally (a v1 do fast-opencv tem GC, mas Mat de imagem é
 * grande demais para esperar por ele).
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  AdaptiveThresholdTypes,
  ColorConversionCodes,
  DataTypes,
  InterpolationFlags,
  Mat,
  OpenCV,
  Size,
  ThresholdTypes,
} from 'react-native-fast-opencv';

import type { ImageRef } from '../types';
import type { PreprocessVariantId } from './variants';

interface Releasable {
  release(): void;
}

/** Bloco da binarização adaptativa — ímpar, na escala do texto da etiqueta. */
const ADAPTIVE_BLOCK = 31;
/** Constante subtraída da média local; maior = mais agressivo contra fundo. */
const ADAPTIVE_C = 10;
/** Teto de lado depois da ampliação — o ML Kit não ganha nada acima disso. */
const MAX_SIDE_AFTER_UPSCALE = 3200;

async function toBase64(image: ImageRef): Promise<string> {
  const rendered = await ImageManipulator.manipulate(image.uri).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
  if (!saved.base64) {
    throw new Error('Pré-processamento: falha ao ler a imagem de entrada');
  }
  return saved.base64;
}

function saveMat(mat: Mat, tag: string, seq: number): ImageRef {
  const dir = new Directory(Paths.cache, 'preprocess');
  if (!dir.exists) {
    dir.create();
  }
  const file = new File(dir, `${tag}-${seq}.jpg`);
  if (file.exists) {
    file.delete();
  }
  // Compressão na escala 0..1 (a v1 do fast-opencv rejeita 0..100).
  mat.saveToFile(file.uri.replace('file://', ''), 'jpeg', 0.95);
  return { uri: file.uri, width: mat.cols, height: mat.rows };
}

/**
 * Aplica a variante e devolve a imagem resultante em disco.
 * `seq` só serve para dar nome único ao arquivo de cache.
 */
export async function applyPreprocess(
  image: ImageRef,
  variant: PreprocessVariantId,
  seq: number,
): Promise<ImageRef> {
  if (variant === 'none') return image;

  const base64 = await toBase64(image);
  const released: Releasable[] = [];
  const track = <T extends Releasable>(obj: T): T => {
    released.push(obj);
    return obj;
  };

  try {
    const src = track(Mat.createFromBase64(base64));
    const upscale = variant === 'upscale2x' || variant === 'stretch_upscale2x' || variant === 'adaptive_upscale2x';

    // Ampliação primeiro quando pedida: binarizar depois de ampliar preserva
    // melhor a borda do glifo do que ampliar um bitmap já binário.
    let working = src;
    if (upscale) {
      const factor = Math.min(2, MAX_SIDE_AFTER_UPSCALE / Math.max(src.cols, src.rows));
      if (factor > 1) {
        const bigger = track(Mat.create(0, 0, DataTypes.CV_8U));
        OpenCV.resize(
          working,
          bigger,
          track(Size.create(Math.round(src.cols * factor), Math.round(src.rows * factor))),
          0,
          0,
          InterpolationFlags.INTER_CUBIC,
        );
        working = bigger;
      }
    }

    if (variant === 'upscale2x') {
      return saveMat(working, variant, seq);
    }

    // Daqui para baixo tudo opera em canal único.
    const gray = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.cvtColor(working, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    const out = track(Mat.create(0, 0, DataTypes.CV_8U));

    switch (variant) {
      case 'stretch':
      case 'stretch_upscale2x': {
        // normalize() do binding só aceita `alpha` — sem `beta` não dá para
        // pedir NORM_MINMAX até 255. Faz-se o alongamento à mão.
        const { minVal, maxVal } = OpenCV.minMaxLoc(gray);
        const span = Math.max(1, maxVal - minVal);
        const alpha = 255 / span;
        OpenCV.convertScaleAbs(gray, out, alpha, -minVal * alpha);
        break;
      }
      case 'otsu': {
        const blurred = track(Mat.create(0, 0, DataTypes.CV_8U));
        OpenCV.GaussianBlur(gray, blurred, track(Size.create(3, 3)), 0);
        OpenCV.threshold(
          blurred,
          out,
          0,
          255,
          ThresholdTypes.THRESH_BINARY | ThresholdTypes.THRESH_OTSU,
        );
        break;
      }
      case 'adaptive':
      case 'adaptive_upscale2x': {
        OpenCV.adaptiveThreshold(
          gray,
          out,
          255,
          AdaptiveThresholdTypes.ADAPTIVE_THRESH_GAUSSIAN_C,
          ThresholdTypes.THRESH_BINARY,
          ADAPTIVE_BLOCK,
          ADAPTIVE_C,
        );
        break;
      }
      case 'unsharp': {
        const blurred = track(Mat.create(0, 0, DataTypes.CV_8U));
        OpenCV.GaussianBlur(gray, blurred, track(Size.create(0, 0)), 3);
        OpenCV.addWeighted(gray, 1.5, blurred, -0.5, 0, out);
        break;
      }
      default: {
        // Exaustividade: qualquer variante nova quebra a compilação aqui.
        const exhaustive: never = variant;
        throw new Error(`variante de pré-processamento desconhecida: ${String(exhaustive)}`);
      }
    }

    // Volta para 3 canais: o encoder JPEG e os motores esperam BGR.
    const bgr = track(Mat.create(0, 0, DataTypes.CV_8U));
    OpenCV.cvtColor(out, bgr, ColorConversionCodes.COLOR_GRAY2BGR);
    return saveMat(bgr, variant, seq);
  } finally {
    for (const obj of released.reverse()) {
      obj.release();
    }
  }
}
