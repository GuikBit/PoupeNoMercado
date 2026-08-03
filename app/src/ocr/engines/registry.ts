/**
 * Registro e seleção de motores de OCR.
 * Trocar de motor é mudar uma linha de configuração — nenhum código de domínio
 * importa um motor concreto (princípio 3 do CLAUDE.md).
 */
import type { OcrEngine } from '../types';

const engines = new Map<string, OcrEngine>();

export function registerEngine(engine: OcrEngine): void {
  engines.set(engine.id, engine);
}

export function getEngine(id: string): OcrEngine {
  const engine = engines.get(id);
  if (!engine) {
    throw new Error(`Motor de OCR não registrado: ${id}`);
  }
  return engine;
}

export function listEngines(): OcrEngine[] {
  return [...engines.values()];
}

/** Somente para testes. */
export function clearEngines(): void {
  engines.clear();
}
