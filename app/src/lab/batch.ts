/**
 * Reprocessamento em lote (Etapa 3): roda cada variante de pré-processamento
 * sobre TODAS as imagens já coletadas e grava o OCR bruto de cada combinação.
 *
 * Por que existe: `npm run analyze:lab` re-executa o PARSER sobre o OCR salvo,
 * então não consegue medir pré-processamento — isso muda a entrada do MOTOR e
 * só acontece no device. Este lote fecha esse buraco: uma passada no celular
 * gera o material para medir todas as variantes offline, quantas vezes quiser.
 *
 * A detecção é mantida constante (parte-se da imagem já retificada de cada
 * caso): a única variável entre as variantes é o tratamento da imagem.
 *
 * Sequencial de propósito — cada variante aloca Mats do tamanho da foto;
 * paralelizar estoura a memória do device.
 */
import { File, Paths } from 'expo-file-system';

import { applyPreprocess } from '../ocr/preprocess/apply';
import type { PreprocessVariantId } from '../ocr/preprocess/variants';
import { DEFAULT_VARIANT_IDS } from '../ocr/preprocess/variants';
import type { ImageRef, OcrBlock, OcrResult } from '../ocr/types';
import type { LabCase } from './types';

export interface BatchVariantRun {
  variant: PreprocessVariantId;
  /** Tempo do pré-processamento em si. */
  preprocessMs: number;
  /** Tempo do motor, medido pelo adaptador. */
  latencyMs: number;
  imageSize: { width: number; height: number } | null;
  ocrRaw: OcrBlock[];
  error?: string;
}

export interface BatchCaseResult {
  caseId: string;
  labelType: string;
  dominantHue: number | null;
  runs: BatchVariantRun[];
}

export interface BatchReport {
  startedAt: string;
  engineId: string;
  variants: readonly PreprocessVariantId[];
  cases: BatchCaseResult[];
}

export interface BatchProgress {
  doneUnits: number;
  totalUnits: number;
  caseIndex: number;
  totalCases: number;
  variant: PreprocessVariantId;
}

export interface BatchOptions {
  variants?: readonly PreprocessVariantId[];
  engineId?: string;
  /** Injetáveis para teste — em device usam OpenCV e o motor real. */
  preprocessFn?: (image: ImageRef, variant: PreprocessVariantId, seq: number) => Promise<ImageRef>;
  recognizeFn?: (image: ImageRef) => Promise<OcrResult>;
  loadImageFn?: (labCase: LabCase) => Promise<ImageRef>;
  onProgress?: (progress: BatchProgress) => void;
  /** Cancelamento cooperativo — checado entre cada unidade. */
  shouldCancel?: () => boolean;
  now?: () => number;
  startedAt?: string;
}

/** Imagem retificada do caso, resolvida contra o diretório de documentos. */
async function defaultLoadImage(labCase: LabCase): Promise<ImageRef> {
  const relative = labCase.rectifiedPath ?? labCase.imagePath;
  const file = new File(Paths.document, relative);
  if (!file.exists) {
    throw new Error(`imagem ausente: ${relative}`);
  }
  // O tamanho registrado pelo motor na coleta original evita reabrir o bitmap.
  const known = Object.values(labCase.engines).find((run) => run.imageSize)?.imageSize;
  return {
    uri: file.uri,
    width: known?.width ?? 0,
    height: known?.height ?? 0,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runBatch(
  cases: LabCase[],
  options: BatchOptions = {},
): Promise<BatchReport> {
  const variants = options.variants ?? DEFAULT_VARIANT_IDS;
  const engineId = options.engineId ?? 'mlkit';
  const preprocess = options.preprocessFn ?? applyPreprocess;
  const loadImage = options.loadImageFn ?? defaultLoadImage;
  const now = options.now ?? (() => Date.now());
  const recognize = options.recognizeFn;
  if (!recognize) {
    throw new Error('runBatch: recognizeFn é obrigatório (injete o motor)');
  }

  const totalUnits = cases.length * variants.length;
  const results: BatchCaseResult[] = [];
  let doneUnits = 0;
  let seq = 0;

  for (const [caseIndex, labCase] of cases.entries()) {
    const runs: BatchVariantRun[] = [];

    let source: ImageRef | null = null;
    let loadError: string | null = null;
    try {
      source = await loadImage(labCase);
    } catch (error) {
      loadError = messageOf(error);
    }

    for (const variant of variants) {
      if (options.shouldCancel?.()) {
        return { startedAt: options.startedAt ?? '', engineId, variants, cases: results };
      }

      if (!source) {
        runs.push({
          variant,
          preprocessMs: -1,
          latencyMs: -1,
          imageSize: null,
          ocrRaw: [],
          error: loadError ?? 'imagem indisponível',
        });
      } else {
        seq++;
        const startedPre = now();
        try {
          const prepared = await preprocess(source, variant, seq);
          const preprocessMs = now() - startedPre;
          const ocr = await recognize(prepared);
          runs.push({
            variant,
            preprocessMs,
            latencyMs: ocr.latencyMs,
            imageSize: ocr.imageSize,
            ocrRaw: ocr.blocks,
          });
        } catch (error) {
          runs.push({
            variant,
            preprocessMs: now() - startedPre,
            latencyMs: -1,
            imageSize: null,
            ocrRaw: [],
            error: messageOf(error),
          });
        }
      }

      doneUnits++;
      options.onProgress?.({
        doneUnits,
        totalUnits,
        caseIndex,
        totalCases: cases.length,
        variant,
      });
    }

    results.push({
      caseId: labCase.id,
      labelType: labCase.labelType,
      dominantHue: labCase.dominantHue,
      runs,
    });
  }

  return {
    startedAt: options.startedAt ?? '',
    engineId,
    variants,
    cases: results,
  };
}
