/**
 * UUID v7 — o CLAUDE.md exige v7 em toda tabela sincronizável porque os ids
 * precisam ordenar por tempo de criação.
 */
import { newId, resetIdCounter } from './ids';
import { buildUuidV7, uuidV7Timestamp } from './uuid';

const bytes = (fill: number): Uint8Array => new Uint8Array(10).fill(fill);

describe('buildUuidV7', () => {
  it('tem o formato canônico', () => {
    const id = buildUuidV7(1_770_000_000_000, bytes(0xab));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('marca versão 7 e variante RFC 9562', () => {
    const id = buildUuidV7(1_770_000_000_000, bytes(0xff));
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('embute o timestamp nos 48 bits altos', () => {
    const ts = 1_770_123_456_789;
    expect(uuidV7Timestamp(buildUuidV7(ts, bytes(0x00)))).toBe(ts);
  });

  it('ordena lexicograficamente na ordem do tempo', () => {
    const antes = buildUuidV7(1_770_000_000_000, bytes(0xff));
    const depois = buildUuidV7(1_770_000_000_001, bytes(0x00));
    expect(antes < depois).toBe(true);
  });

  it('aguenta timestamp acima de 2^32 ms', () => {
    // 2^32 ms ≈ 1970 + 49 dias; qualquer data real passa disso.
    const ts = 2_000_000_000_000;
    expect(uuidV7Timestamp(buildUuidV7(ts, bytes(0x11)))).toBe(ts);
  });

  it('recusa entrada inválida', () => {
    expect(() => buildUuidV7(-1, bytes(0))).toThrow(/timestamp/i);
    expect(() => buildUuidV7(1.5, bytes(0))).toThrow(/timestamp/i);
    expect(() => buildUuidV7(1, new Uint8Array(4))).toThrow(/10 bytes/i);
  });

  it('uuidV7Timestamp recusa string que não é UUID', () => {
    expect(() => uuidV7Timestamp('nao-e-uuid')).toThrow(/inválido/i);
  });
});

describe('newId', () => {
  beforeEach(() => resetIdCounter());

  it('é monotônico dentro do mesmo milissegundo', () => {
    const sources = { now: () => 1_770_000_000_000, randomBytes: () => bytes(0x00) };
    const ids = [newId(sources), newId(sources), newId(sources)];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(3);
  });

  it('reinicia o contador ao mudar de milissegundo', () => {
    let clock = 1_770_000_000_000;
    const sources = { now: () => clock, randomBytes: () => bytes(0x00) };
    const primeiro = newId(sources);
    clock += 1;
    const segundo = newId(sources);
    expect(primeiro < segundo).toBe(true);
  });
});
