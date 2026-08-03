import type { OcrEngine } from '../types';
import { clearEngines, getEngine, listEngines, registerEngine } from './registry';

function fakeEngine(id: string): OcrEngine {
  return {
    id,
    requiresNetwork: false,
    costPerCallCents: 0,
    recognize: jest.fn(),
    isAvailable: async () => true,
  };
}

describe('registry', () => {
  beforeEach(() => clearEngines());

  it('registra e recupera motores por id', () => {
    registerEngine(fakeEngine('mlkit'));
    registerEngine(fakeEngine('cloudvision'));
    expect(getEngine('mlkit').id).toBe('mlkit');
    expect(listEngines()).toHaveLength(2);
  });

  it('lança erro claro para motor não registrado', () => {
    expect(() => getEngine('paddle')).toThrow(/não registrado/);
  });
});
