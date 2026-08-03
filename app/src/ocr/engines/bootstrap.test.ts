import { registerDefaultEngines } from './bootstrap';
import { clearEngines, getEngine, listEngines } from './registry';

describe('registerDefaultEngines', () => {
  beforeEach(() => clearEngines());

  it('registra mlkit e cloudvision', () => {
    registerDefaultEngines();
    expect(listEngines().map((e) => e.id).sort()).toEqual(['cloudvision', 'mlkit']);
    expect(getEngine('mlkit').requiresNetwork).toBe(false);
    expect(getEngine('cloudvision').requiresNetwork).toBe(true);
  });

  it('é idempotente — não duplica registros', () => {
    registerDefaultEngines();
    registerDefaultEngines();
    expect(listEngines()).toHaveLength(2);
  });
});
