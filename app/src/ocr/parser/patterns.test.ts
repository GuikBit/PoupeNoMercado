import { moneyMatchToCents, RE } from './patterns';

function money(text: string): number | null {
  const m = RE.MONEY.exec(text);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return moneyMatchToCents(m[1], m[2]);
}

describe('RE.MONEY', () => {
  it('extrai preços com e sem R$', () => {
    expect(money('R$ 2,99')).toBe(299);
    expect(money('2,99')).toBe(299);
    expect(money('R$49,90 KG')).toBe(4990);
  });

  it('não casa inteiros sem casas decimais', () => {
    expect(money('COD 168439')).toBeNull();
    expect(money('A PARTIR DE 24')).toBeNull();
  });
});

describe('RE.TIER', () => {
  it('extrai a quantidade mínima da faixa', () => {
    expect(RE.TIER.exec('A PARTIR DE 3')?.[1]).toBe('3');
    expect(RE.TIER.exec('A PARTIR DE 24')?.[1]).toBe('24');
  });
});

describe('RE.MEASURE', () => {
  it('extrai o preço por medida da embalagem', () => {
    const m = RE.MEASURE.exec('NESTA EMBALAGEM 1LT R$ 3,98');
    expect(m?.[1]).toBe('1');
    expect(m?.[2]).toBe('LT');
    expect(moneyMatchToCents(m?.[3] ?? '0', m?.[4] ?? '0')).toBe(398);
  });
});

describe('RE.INTERNAL e RE.EAN13', () => {
  it('extrai código interno com âncora COD', () => {
    expect(RE.INTERNAL.exec('COD 168439')?.[1]).toBe('168439');
    expect(RE.INTERNAL.exec('CÓD. 65954')?.[1]).toBe('65954');
  });

  it('extrai EAN-13', () => {
    expect(RE.EAN13.exec('7898174854351')?.[1]).toBe('7898174854351');
    expect(RE.EAN13.exec('65954')).toBeNull();
  });
});

describe('RE.FROM / RE.TO — âncoras do preço riscado', () => {
  it('distingue DE: e POR:', () => {
    expect(RE.FROM.test('DE: R$ 6,29')).toBe(true);
    expect(RE.TO.test('POR: R$ 4,99')).toBe(true);
    expect(RE.FROM.test('POR: R$ 4,99')).toBe(false);
  });
});

describe('RE.STORE_CARD e RE.SAVINGS', () => {
  it('reconhece condicional de cartão e economia', () => {
    expect(RE.STORE_CARD.test('OU NO BAHAMAS CRED')).toBe(true);
    const s = RE.SAVINGS.exec('ECONOMIZE R$ 0,60');
    expect(moneyMatchToCents(s?.[1] ?? '0', s?.[2] ?? '0')).toBe(60);
  });
});
