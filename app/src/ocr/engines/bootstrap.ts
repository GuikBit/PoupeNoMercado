/**
 * Registro dos motores padrão. Vive dentro de `engines/` de propósito:
 * é o único lugar (além dos próprios adaptadores) autorizado a importar
 * motores concretos — código de fora usa apenas o registry (princípio 3).
 */
import { createCloudVisionEngine } from './cloudvision';
import { createMlKitEngine } from './mlkit';
import { listEngines, registerEngine } from './registry';

/** Idempotente — seguro chamar em todo mount da tela do Laboratório. */
export function registerDefaultEngines(): void {
  if (listEngines().length > 0) return;
  registerEngine(createMlKitEngine());
  registerEngine(createCloudVisionEngine());
}
