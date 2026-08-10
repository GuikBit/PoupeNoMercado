/**
 * Preferências e consentimentos. O que se protege aqui: consentimento começa
 * DESLIGADO. O padrão do produto é não mandar nada para fora do aparelho.
 */
import { createTestDb, type TestDb } from '../testDb';
import { DEFAULT_SETTINGS, loadSettings, setSetting } from './settingsRepo';

let t: TestDb;
beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

describe('settingsRepo', () => {
  it('banco novo começa com tudo desligado', () => {
    expect(loadSettings(t.db)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.consentCloudOcr).toBe(false);
    expect(DEFAULT_SETTINGS.consentShareReadings).toBe(false);
  });

  it('grava e relê cada preferência', () => {
    setSetting(t.ctx, 'defaultUseStoreCard', true);
    expect(loadSettings(t.db).defaultUseStoreCard).toBe(true);

    setSetting(t.ctx, 'consentCloudOcr', true);
    expect(loadSettings(t.db).consentCloudOcr).toBe(true);
  });

  it('desligar de volta funciona — consentimento é revogável', () => {
    setSetting(t.ctx, 'consentShareReadings', true);
    expect(loadSettings(t.db).consentShareReadings).toBe(true);

    setSetting(t.ctx, 'consentShareReadings', false);
    expect(loadSettings(t.db).consentShareReadings).toBe(false);
  });

  it('uma preferência não contamina a outra', () => {
    setSetting(t.ctx, 'consentCloudOcr', true);
    const s = loadSettings(t.db);
    expect(s.consentCloudOcr).toBe(true);
    expect(s.consentShareReadings).toBe(false);
    expect(s.defaultUseStoreCard).toBe(false);
  });

  it('devolve o estado completo já atualizado', () => {
    const depois = setSetting(t.ctx, 'defaultUseStoreCard', true);
    expect(depois.defaultUseStoreCard).toBe(true);
  });

  it('gravar duas vezes não duplica linha', () => {
    setSetting(t.ctx, 'consentCloudOcr', true);
    setSetting(t.ctx, 'consentCloudOcr', false);
    setSetting(t.ctx, 'consentCloudOcr', true);
    expect(loadSettings(t.db).consentCloudOcr).toBe(true);
  });
});
