/**
 * Repositório dos casos do Laboratório. Serialização em funções puras
 * (testáveis em node); acesso a dados atrás da interface estreita LabDb.
 */
import type { LabDb } from './db';
import type {
  CaptureConditions,
  EngineRun,
  GroundTruth,
  HumanVerdict,
  LabCase,
  LabLabelType,
} from './types';

/** Linha da tabela lab_case — colunas JSON como TEXT. */
export interface LabCaseRow {
  id: string;
  captured_at: string;
  image_path: string;
  rectified_path: string | null;
  label_type: string;
  detect_method: string;
  dominant_hue: number | null;
  capture_conditions: string;
  engines: string;
  ground_truth: string | null;
  human_verdict: string | null;
  schema_version: number;
}

export function caseToRow(labCase: LabCase): LabCaseRow {
  return {
    id: labCase.id,
    captured_at: labCase.capturedAt,
    image_path: labCase.imagePath,
    rectified_path: labCase.rectifiedPath,
    label_type: labCase.labelType,
    detect_method: labCase.detectMethod,
    dominant_hue: labCase.dominantHue,
    capture_conditions: JSON.stringify(labCase.captureConditions),
    engines: JSON.stringify(labCase.engines),
    ground_truth: labCase.groundTruth ? JSON.stringify(labCase.groundTruth) : null,
    human_verdict: labCase.humanVerdict ? JSON.stringify(labCase.humanVerdict) : null,
    schema_version: 1,
  };
}

export function rowToCase(row: LabCaseRow): LabCase {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    imagePath: row.image_path,
    rectifiedPath: row.rectified_path,
    labelType: row.label_type as LabLabelType,
    detectMethod: row.detect_method === 'quad' ? 'quad' : 'fallback',
    dominantHue: row.dominant_hue,
    captureConditions: JSON.parse(row.capture_conditions) as CaptureConditions,
    engines: JSON.parse(row.engines) as Record<string, EngineRun>,
    groundTruth: row.ground_truth ? (JSON.parse(row.ground_truth) as GroundTruth) : null,
    humanVerdict: row.human_verdict ? (JSON.parse(row.human_verdict) as HumanVerdict) : null,
  };
}

export interface LabCaseRepository {
  save(labCase: LabCase): void;
  getById(id: string): LabCase | null;
  /** Mais recentes primeiro. */
  list(): LabCase[];
  count(): number;
  /** Contagem por tipo — acompanha a cota da coleta (docs/06 §4). */
  countByType(): Record<string, number>;
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO lab_case (
    id, captured_at, image_path, rectified_path, label_type, detect_method,
    dominant_hue, capture_conditions, engines, ground_truth, human_verdict,
    schema_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

export function createLabCaseRepository(db: LabDb): LabCaseRepository {
  return {
    save(labCase: LabCase): void {
      const row = caseToRow(labCase);
      db.runSync(INSERT_SQL, [
        row.id,
        row.captured_at,
        row.image_path,
        row.rectified_path,
        row.label_type,
        row.detect_method,
        row.dominant_hue,
        row.capture_conditions,
        row.engines,
        row.ground_truth,
        row.human_verdict,
        row.schema_version,
      ]);
    },

    getById(id: string): LabCase | null {
      const row = db.getFirstSync('SELECT * FROM lab_case WHERE id = ?;', [id]);
      return row ? rowToCase(row as unknown as LabCaseRow) : null;
    },

    list(): LabCase[] {
      const rows = db.getAllSync('SELECT * FROM lab_case ORDER BY captured_at DESC;', []);
      return rows.map((row) => rowToCase(row as unknown as LabCaseRow));
    },

    count(): number {
      const row = db.getFirstSync('SELECT COUNT(*) AS total FROM lab_case;', []);
      return row ? Number(row.total) : 0;
    },

    countByType(): Record<string, number> {
      const rows = db.getAllSync(
        'SELECT label_type, COUNT(*) AS total FROM lab_case GROUP BY label_type;',
        [],
      );
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[String(row.label_type)] = Number(row.total);
      }
      return result;
    },
  };
}
