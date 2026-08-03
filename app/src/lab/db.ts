/**
 * Banco local do Laboratório — expo-sqlite puro, uma tabela.
 * Drizzle entra só na Etapa 5, quando houver o schema real de docs/03.
 */
import { openDatabaseSync } from 'expo-sqlite';

export type SqlParams = (string | number | null)[];

/** Interface estreita — o repositório é testável com um fake in-memory. */
export interface LabDb {
  execSync(sql: string): void;
  runSync(sql: string, params: SqlParams): void;
  getAllSync(sql: string, params: SqlParams): Record<string, unknown>[];
  getFirstSync(sql: string, params: SqlParams): Record<string, unknown> | null;
}

export const CREATE_LAB_CASE_TABLE = `
  CREATE TABLE IF NOT EXISTS lab_case (
    id TEXT PRIMARY KEY,
    captured_at TEXT NOT NULL,
    image_path TEXT NOT NULL,
    rectified_path TEXT,
    label_type TEXT NOT NULL,
    detect_method TEXT NOT NULL,
    dominant_hue REAL,
    capture_conditions TEXT NOT NULL,
    engines TEXT NOT NULL,
    ground_truth TEXT,
    human_verdict TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1
  );
`;

export function migrate(db: LabDb): void {
  db.execSync(CREATE_LAB_CASE_TABLE);
}

let singleton: LabDb | null = null;

/**
 * Abre (e migra) o banco do Laboratório — UMA vez por processo.
 * Reabrir a cada mount da tela dispara NullPointerException no Android:
 * o handle antigo é finalizado enquanto o novo usa a mesma conexão.
 */
export function openLabDb(): LabDb {
  if (!singleton) {
    const db = openDatabaseSync('lab.db');
    migrate(db);
    singleton = db;
  }
  return singleton;
}
