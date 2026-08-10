/**
 * Preferências do usuário, sobre a tabela `sync_state` (key-value de docs/03 §3).
 *
 * Não passa pelo outbox: são preferências LOCAIS do aparelho. Sincronizar
 * consentimento entre devices seria errado — consentir num celular não é
 * consentir em outro.
 *
 * Os dois consentimentos existem por causa da LGPD (docs/05): ambos começam
 * DESLIGADOS e só ligam por ação explícita. O padrão do produto é não mandar
 * nada para fora do aparelho.
 */
import { eq } from 'drizzle-orm';

import type { AppDb, RepoContext } from '../outbox';
import { syncState } from '../schema';

export interface Settings {
  /** Marca o cartão da loja como ligado em toda compra nova. */
  defaultUseStoreCard: boolean;
  /**
   * Permite escalar a leitura para o Cloud Vision quando o motor local falhar.
   * ⚠️ Isso manda a IMAGEM da etiqueta para fora do aparelho.
   */
  consentCloudOcr: boolean;
  /**
   * Permite enviar leituras (OCR bruto e correções) para melhorar o parser.
   * É o sinal mais valioso do produto — e por isso mesmo tem de ser opcional.
   */
  consentShareReadings: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultUseStoreCard: false,
  consentCloudOcr: false,
  consentShareReadings: false,
};

const KEYS: Record<keyof Settings, string> = {
  defaultUseStoreCard: 'pref_default_use_store_card',
  consentCloudOcr: 'consent_cloud_ocr',
  consentShareReadings: 'consent_share_readings',
};

function readFlag(db: AppDb, key: string): boolean | null {
  const row = db.select().from(syncState).where(eq(syncState.key, key)).get();
  if (!row) return null;
  return row.value === '1';
}

export function loadSettings(db: AppDb): Settings {
  return {
    defaultUseStoreCard: readFlag(db, KEYS.defaultUseStoreCard) ?? DEFAULT_SETTINGS.defaultUseStoreCard,
    consentCloudOcr: readFlag(db, KEYS.consentCloudOcr) ?? DEFAULT_SETTINGS.consentCloudOcr,
    consentShareReadings:
      readFlag(db, KEYS.consentShareReadings) ?? DEFAULT_SETTINGS.consentShareReadings,
  };
}

export function setSetting<K extends keyof Settings>(
  ctx: RepoContext,
  key: K,
  value: Settings[K],
): Settings {
  const storageKey = KEYS[key];
  const stored = value ? '1' : '0';
  const existing = ctx.db.select().from(syncState).where(eq(syncState.key, storageKey)).get();

  if (existing) {
    ctx.db.update(syncState).set({ value: stored }).where(eq(syncState.key, storageKey)).run();
  } else {
    ctx.db.insert(syncState).values({ key: storageKey, value: stored }).run();
  }
  return loadSettings(ctx.db);
}
