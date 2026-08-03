/**
 * Persistência de um caso: copia as imagens para um diretório estável
 * (nome derivado do id) e grava a linha no SQLite. Caminhos salvos são
 * RELATIVOS a Paths.document — o prefixo absoluto muda entre instalações.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { newCaseId } from './ids';
import type { LabRun } from './pipeline';
import type { LabCaseRepository } from './repository';
import type {
  CaptureConditions,
  GroundTruth,
  HumanVerdict,
  LabCase,
  LabLabelType,
} from './types';

export interface SaveCaseInput {
  run: LabRun;
  labelType: LabLabelType;
  conditions: CaptureConditions;
  groundTruth: GroundTruth | null;
  verdict: HumanVerdict | null;
}

export const LAB_CASES_DIR = 'lab-cases';

export function saveCase(repo: LabCaseRepository, input: SaveCaseInput): LabCase {
  const id = newCaseId();
  const dir = new Directory(Paths.document, LAB_CASES_DIR);
  if (!dir.exists) {
    dir.create();
  }

  new File(input.run.photo.uri).copy(new File(dir, `${id}.jpg`));
  new File(input.run.detect.image.uri).copy(new File(dir, `${id}.rect.jpg`));

  const labCase: LabCase = {
    id,
    capturedAt: input.run.capturedAt,
    imagePath: `${LAB_CASES_DIR}/${id}.jpg`,
    rectifiedPath: `${LAB_CASES_DIR}/${id}.rect.jpg`,
    labelType: input.labelType,
    detectMethod: input.run.detect.method,
    dominantHue: input.run.detect.dominantHue ?? null,
    captureConditions: input.conditions,
    engines: input.run.engines,
    groundTruth: input.groundTruth,
    humanVerdict: input.verdict,
  };
  repo.save(labCase);
  return labCase;
}
