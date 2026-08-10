/**
 * Testes do carrinho. A meta da Etapa 4 é simular uma compra inteira sem abrir
 * o app — o último bloco faz exatamente isso.
 */
import {
  addItem,
  type Cart,
  emptyCart,
  isSameProduct,
  removeItem,
  setBudget,
  setQuantity,
  setUseStoreCard,
  summarize,
} from './cart';
import type { PricingPolicy } from './pricing';

/** Vinagre de Álcool Peixe 750ML — a etiqueta-âncora do CLAUDE.md. */
const VINAGRE: PricingPolicy = {
  basePriceCents: 299,
  saleUnit: 'UN',
  tiers: [
    { minQty: 3, priceCents: 279, condition: { kind: 'none' } },
    { minQty: 24, priceCents: 259, condition: { kind: 'none' } },
    { minQty: 1, priceCents: 259, condition: { kind: 'storeCard', cardName: 'BAHAMAS CRED' } },
  ],
  measurePrice: { valueCents: 398, unit: 'L', perAmount: 1 },
};

const PICANHA: PricingPolicy = {
  basePriceCents: 4990,
  saleUnit: 'KG',
  tiers: [],
};

function cartWithVinagre(qty: number): Cart {
  return addItem(emptyCart(), {
    id: 'v1',
    product: { rawName: 'VINAGRE DE ALCOOL PEIXE 750ML' },
    policy: VINAGRE,
    quantity: qty,
  });
}

describe('recálculo por faixa ao mudar a quantidade', () => {
  it('usa o preço base abaixo da primeira faixa', () => {
    const s = summarize(cartWithVinagre(2));
    expect(s.lines[0]?.unitPriceCents).toBe(299);
    expect(s.totalCents).toBe(598);
  });

  it('aplica a faixa de 3 e reprecifica TODAS as unidades', () => {
    const s = summarize(cartWithVinagre(3));
    expect(s.lines[0]?.unitPriceCents).toBe(279);
    expect(s.totalCents).toBe(837); // 3 × 2,79 — não 2×2,99 + 1×2,79
  });

  it('aplica a faixa de 24', () => {
    const s = summarize(cartWithVinagre(24));
    expect(s.lines[0]?.unitPriceCents).toBe(259);
    expect(s.totalCents).toBe(6216);
  });

  it('mudar a quantidade para baixo devolve o preço base', () => {
    const cart = setQuantity(cartWithVinagre(3), 'v1', 2);
    expect(summarize(cart).lines[0]?.unitPriceCents).toBe(299);
  });
});

describe('cartão da loja', () => {
  it('sem cartão, a faixa condicionada é ignorada', () => {
    expect(summarize(cartWithVinagre(1)).lines[0]?.unitPriceCents).toBe(299);
  });

  it('com cartão, vale 2,59 já na primeira unidade', () => {
    const cart = setUseStoreCard(cartWithVinagre(1), true);
    expect(summarize(cart).lines[0]?.unitPriceCents).toBe(259);
  });

  it('ligar o cartão reprecifica o carrinho inteiro', () => {
    const semCartao = summarize(cartWithVinagre(2)).totalCents;
    const comCartao = summarize(setUseStoreCard(cartWithVinagre(2), true)).totalCents;
    expect(semCartao).toBe(598);
    expect(comCartao).toBe(518);
  });
});

describe('dica da próxima faixa', () => {
  it('diz quantas faltam e quanto economiza por unidade', () => {
    const hint = summarize(cartWithVinagre(1)).lines[0]?.hint;
    expect(hint).toEqual({
      qtyNeeded: 2,
      newUnitPriceCents: 279,
      savingsPerUnitCents: 20,
      savingsAtTierCents: 60,
    });
  });

  it('aponta a faixa seguinte depois de já estar numa faixa', () => {
    const hint = summarize(cartWithVinagre(3)).lines[0]?.hint;
    expect(hint?.qtyNeeded).toBe(21);
    expect(hint?.newUnitPriceCents).toBe(259);
  });

  it('some quando não há mais faixa a alcançar', () => {
    expect(summarize(cartWithVinagre(24)).lines[0]?.hint).toBeNull();
  });
});

describe('fusão do mesmo produto', () => {
  it('escanear três vezes alcança a faixa de 3', () => {
    let cart = emptyCart();
    for (const id of ['a', 'b', 'c']) {
      cart = addItem(cart, {
        id,
        product: { rawName: 'VINAGRE DE ALCOOL PEIXE 750ML' },
        policy: VINAGRE,
        quantity: 1,
      });
    }
    expect(cart.items).toHaveLength(1);
    const s = summarize(cart);
    expect(s.lines[0]?.item.quantity).toBe(3);
    expect(s.lines[0]?.unitPriceCents).toBe(279);
  });

  it('funde ignorando token de embalagem no nome', () => {
    let cart = cartWithVinagre(1);
    cart = addItem(cart, {
      id: 'v2',
      product: { rawName: 'VINAGRE DE ALCOOL PEIXE  750 ML' },
      policy: VINAGRE,
      quantity: 1,
    });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(2);
  });

  it('código interno manda sobre o nome', () => {
    const a = {
      id: 'a',
      product: { rawName: 'NOME LIDO ERRADO', internalCode: '65954' },
      policy: VINAGRE,
      quantity: 1,
    };
    const b = {
      id: 'b',
      product: { rawName: 'VINAGRE DE ALCOOL PEIXE', internalCode: '65954' },
      policy: VINAGRE,
      quantity: 1,
    };
    const cart = addItem(addItem(emptyCart(), a), b);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(2);
  });

  it('NÃO funde unidades de venda diferentes', () => {
    const porUnidade = {
      id: 'a',
      product: { rawName: 'PICANHA' },
      policy: { ...PICANHA, saleUnit: 'UN' as const },
      quantity: 1,
    };
    const porQuilo = { id: 'b', product: { rawName: 'PICANHA' }, policy: PICANHA, quantity: 1.5 };
    const cart = addItem(addItem(emptyCart(), porUnidade), porQuilo);
    expect(cart.items).toHaveLength(2);
  });

  it('isSameProduct exige unidade de venda igual', () => {
    const item = {
      id: 'a',
      product: { rawName: 'PICANHA' },
      policy: PICANHA,
      quantity: 1,
      source: 'scan' as const,
    };
    expect(isSameProduct(item, { product: { rawName: 'PICANHA' }, policy: PICANHA })).toBe(true);
    expect(
      isSameProduct(item, {
        product: { rawName: 'PICANHA' },
        policy: { ...PICANHA, saleUnit: 'UN' },
      }),
    ).toBe(false);
  });
});

describe('item por peso', () => {
  it('aceita peso decimal e arredonda só o total', () => {
    const cart = addItem(emptyCart(), {
      id: 'p1',
      product: { rawName: 'CORACAO ALCATRA KG' },
      policy: PICANHA,
      quantity: 0.734,
    });
    // 4990 × 0,734 = 3662,66 → 3663, arredondado no TOTAL como o caixa faz.
    expect(summarize(cart).totalCents).toBe(3663);
  });

  it('recusa quantidade fracionária em item por unidade', () => {
    expect(() =>
      addItem(emptyCart(), {
        id: 'x',
        product: { rawName: 'VINAGRE' },
        policy: VINAGRE,
        quantity: 1.5,
      }),
    ).toThrow(/quantidade inteira/i);
  });

  it('item por peso conta como 1 na contagem de itens', () => {
    let cart = addItem(emptyCart(), {
      id: 'p1',
      product: { rawName: 'CARNE KG' },
      policy: PICANHA,
      quantity: 2.5,
    });
    cart = addItem(cart, {
      id: 'v1',
      product: { rawName: 'VINAGRE' },
      policy: VINAGRE,
      quantity: 3,
    });
    expect(summarize(cart).itemCount).toBe(4); // 1 (peso) + 3 (unidades)
  });
});

describe('economia acumulada', () => {
  it('mede contra o preço base, não contra o preço riscado', () => {
    const s = summarize(cartWithVinagre(3));
    expect(s.savedCents).toBe(60); // 3 × (2,99 − 2,79)
  });

  it('é zero quando nenhuma faixa se aplica', () => {
    expect(summarize(cartWithVinagre(1)).savedCents).toBe(0);
  });
});

describe('operações do carrinho', () => {
  it('remove item', () => {
    expect(removeItem(cartWithVinagre(1), 'v1').items).toHaveLength(0);
  });

  it('recusa quantidade não positiva', () => {
    expect(() => setQuantity(cartWithVinagre(1), 'v1', 0)).toThrow(/positiva/i);
  });

  it('recusa mexer em item ausente', () => {
    expect(() => setQuantity(emptyCart(), 'inexistente', 1)).toThrow(/não está no carrinho/i);
  });

  it('não muta o carrinho original', () => {
    const original = cartWithVinagre(1);
    const alterado = setQuantity(original, 'v1', 5);
    expect(original.items[0]?.quantity).toBe(1);
    expect(alterado.items[0]?.quantity).toBe(5);
  });
});

describe('orçamento', () => {
  it('verde bem abaixo do teto', () => {
    const cart = setBudget(cartWithVinagre(1), 10000);
    expect(summarize(cart).budget.state).toBe('ok');
  });

  it('amarelo a partir de 85%', () => {
    // 3 × 2,79 = 8,37 sobre teto de 9,00 → 93%
    const cart = setBudget(cartWithVinagre(3), 900);
    const budget = summarize(cart).budget;
    expect(budget.state).toBe('warning');
    expect(budget.remainingCents).toBe(63);
  });

  it('vermelho ao passar do teto', () => {
    const cart = setBudget(cartWithVinagre(3), 800);
    const budget = summarize(cart).budget;
    expect(budget.state).toBe('over');
    expect(budget.remainingCents).toBe(-37);
  });

  it('sem teto nunca alarma', () => {
    const budget = summarize(cartWithVinagre(24)).budget;
    expect(budget.state).toBe('ok');
    expect(budget.ratio).toBeNull();
  });

  it('recusa teto não positivo', () => {
    expect(() => setBudget(emptyCart(), 0)).toThrow(/positivo/i);
  });
});

describe('compra inteira simulada — meta da Etapa 4', () => {
  it('monta, ajusta e fecha uma compra sem abrir o app', () => {
    let cart = setBudget(emptyCart(), 5000);

    // Escaneia o vinagre duas vezes: ainda no preço base.
    cart = addItem(cart, {
      id: 'v',
      product: { rawName: 'VINAGRE DE ALCOOL PEIXE 750ML' },
      policy: VINAGRE,
      quantity: 2,
    });
    expect(summarize(cart).totalCents).toBe(598);

    // A dica diz que falta 1 para a faixa; o usuário pega mais uma.
    const hint = summarize(cart).lines[0]?.hint;
    expect(hint?.qtyNeeded).toBe(1);
    cart = setQuantity(cart, 'v', 3);
    expect(summarize(cart).totalCents).toBe(837);

    // Carne por peso.
    cart = addItem(cart, {
      id: 'c',
      product: { rawName: 'CORACAO ALCATRA KG' },
      policy: PICANHA,
      quantity: 0.8,
    });
    let s = summarize(cart);
    expect(s.totalCents).toBe(837 + 3992);
    expect(s.budget.state).toBe('warning'); // 48,29 de 50,00 → 96%

    // Passou do orçamento ao aumentar a carne — devolve um pouco.
    cart = setQuantity(cart, 'c', 1.2);
    expect(summarize(cart).budget.state).toBe('over');
    cart = setQuantity(cart, 'c', 0.5);

    s = summarize(cart);
    expect(s.budget.state).toBe('ok');
    expect(s.totalCents).toBe(837 + 2495);
    expect(s.savedCents).toBe(60);
    expect(s.itemCount).toBe(4);
  });
});
