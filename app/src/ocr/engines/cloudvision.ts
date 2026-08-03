/**
 * Adaptador Google Cloud Vision — teto de referência do Laboratório.
 * Nunca entra no caminho crítico do produto (RNF-01): mede quanto se perde
 * por ser offline. REST puro, chave via .env, timeout de 5 s.
 */
import { File } from 'expo-file-system';

import type { ImageRef, OcrBlock, OcrEngine, OcrResult } from '../types';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const TIMEOUT_MS = 5000;

/** Subconjunto da resposta do Vision que consumimos, tipado estreito. */
interface VisionVertex {
  x?: number;
  y?: number;
}
interface VisionWord {
  symbols?: { text?: string }[];
  confidence?: number;
}
interface VisionParagraph {
  words?: VisionWord[];
  boundingBox?: { vertices?: VisionVertex[] };
  confidence?: number;
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
  boundingBox?: { vertices?: VisionVertex[] };
  confidence?: number;
}
interface VisionPage {
  blocks?: VisionBlock[];
  width?: number;
  height?: number;
}
interface VisionResponse {
  responses?: {
    fullTextAnnotation?: { pages?: VisionPage[] };
    error?: { message?: string };
  }[];
}

function verticesToBox(
  vertices: VisionVertex[] | undefined,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  if (!vertices || vertices.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX / width,
    y: minY / height,
    w: (maxX - minX) / width,
    h: (maxY - minY) / height,
  };
}

function paragraphText(p: VisionParagraph): string {
  return (p.words ?? [])
    .map((w) => (w.symbols ?? []).map((s) => s.text ?? '').join(''))
    .join(' ');
}

export function parseVisionResponse(
  payload: VisionResponse,
  fallbackSize: { width: number; height: number },
): OcrBlock[] {
  const annotation = payload.responses?.[0]?.fullTextAnnotation;
  const page = annotation?.pages?.[0];
  if (!page) return [];

  const width = page.width ?? fallbackSize.width;
  const height = page.height ?? fallbackSize.height;
  const blocks: OcrBlock[] = [];

  for (const block of page.blocks ?? []) {
    const lines: OcrBlock[] = (block.paragraphs ?? []).map((p) => ({
      text: paragraphText(p),
      box: verticesToBox(p.boundingBox?.vertices, width, height),
      confidence: p.confidence ?? -1,
    }));
    blocks.push({
      text: lines.map((l) => l.text).join('\n'),
      box: verticesToBox(block.boundingBox?.vertices, width, height),
      confidence: block.confidence ?? -1,
      lines,
    });
  }
  return blocks;
}

export interface CloudVisionOptions {
  apiKey?: string;
  /** Injetável para teste. */
  fetchFn?: typeof fetch;
  readBase64?: (uri: string) => Promise<string>;
}

async function defaultReadBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

export function createCloudVisionEngine(options: CloudVisionOptions = {}): OcrEngine {
  const apiKey = options.apiKey ?? process.env.EXPO_PUBLIC_CLOUD_VISION_API_KEY ?? '';
  const fetchFn = options.fetchFn ?? fetch;
  const readBase64 = options.readBase64 ?? defaultReadBase64;

  return {
    id: 'cloudvision',
    requiresNetwork: true,
    costPerCallCents: 1,

    async isAvailable(): Promise<boolean> {
      return apiKey.length > 0;
    },

    async recognize(image: ImageRef): Promise<OcrResult> {
      if (!apiKey) {
        throw new Error('Cloud Vision indisponível: EXPO_PUBLIC_CLOUD_VISION_API_KEY ausente');
      }
      const started = Date.now();
      const content = await readBase64(image.uri);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetchFn(`${ENDPOINT}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            requests: [
              {
                image: { content },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                imageContext: { languageHints: ['pt'] },
              },
            ],
          }),
        });
        if (!response.ok) {
          throw new Error(`Cloud Vision HTTP ${response.status}`);
        }
        const payload = (await response.json()) as VisionResponse;
        const apiError = payload.responses?.[0]?.error?.message;
        if (apiError) {
          throw new Error(`Cloud Vision: ${apiError}`);
        }
        return {
          blocks: parseVisionResponse(payload, { width: image.width, height: image.height }),
          engineId: 'cloudvision',
          latencyMs: Date.now() - started,
          imageSize: { width: image.width, height: image.height },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
