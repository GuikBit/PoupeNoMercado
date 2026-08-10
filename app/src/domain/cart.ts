/**
 * Carrinho da compra. TypeScript puro, sem I/O — a compra inteira é simulável
 * em teste, sem abrir o app.
 *
 * Dois pontos que governam o desenho:
 *
 * 1. **Preço é estrutura, nunca escalar** (princípio nº 2). O carrinho guarda a
 *    `PricingPolicy` de cada item e resolve o preço a CADA leitura do total.
 *    Nada de guardar "preço unitário" congelado: mudar a quantidade muda a
 *    faixa, e portanto o preço de todas as unidades daquele item.
 * 2. **O mesmo produto funde.** Escanear três vezes o mesmo item tem de
 *    alcançar a faixa "a partir de 3" — é o diferencial do produto. Somar
 *    linhas separadas jogaria isso fora silenciosamente.
 *
 * Todas as funções são puras e devolvem um carrinho novo.
 */
import { type BudgetStatus,budgetStatus } from './budget';
import { normalizeProductName } from './matching';
import {
  itemTotalCents,
  type PriceTier,
  type PricingPolicy,
  resolvePrice,
  type SaleUnit,
} from './pricing';

export interface CartProduct {
  rawName: string;
  internalCode?: string;
  ean?: string;
}

export interface CartItem {
  id: string;
  product: CartProduct;
  policy: PricingPolicy;
  /** Inteiro para UN; decimal (peso/volume) para KG, L e M. */
  quantity: number;
  /** De onde veio — leitura confirmada ou digitação. Para diagnóstico. */
  source: 'scan' | 'manual';
}

export interface Cart {
  items: CartItem[];
  /** Teto da compra, ou null quando o usuário não definiu. */
  budgetCents: number | null;
  /** O usuário tem o cartão da loja? Vale para o carrinho inteiro. */
  useStoreCard: boolean;
}

/** Dica de faixa: "leve mais 2 e economize R$ 0,60 cada". */
export interface TierHint {
  qtyNeeded: number;
  newUnitPriceCents: number;
  savingsPerUnitCents: number;
  /** Economia total se levar exatamente a quantidade da faixa. */
  savingsAtTierCents: number;
}

export interface CartLine {
  item: CartItem;
  unitPriceCents: number;
  appliedTier: PriceTier | null;
  totalCents: number;
  /** Quanto esta linha já economiza contra o preço base. */
  savedCents: number;
  hint: TierHint | null;
}

export interface CartSummary {
  lines: CartLine[];
  totalCents: number;
  /** Soma das quantidades de itens por unidade; itens por peso contam 1. */
  itemCount: number;
  savedCents: number;
  budget: BudgetStatus;
}

export function emptyCart(options: { budgetCents?: number | null; useStoreCard?: boolean } = {}): Cart {
  return {
    items: [],
    budgetCents: options.budgetCents ?? null,
    useStoreCard: options.useStoreCard ?? false,
  };
}

function assertQuantity(quantity: number, saleUnit: SaleUnit): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Quantidade deve ser positiva, recebeu ${quantity}`);
  }
  if (saleUnit === 'UN' && !Number.isInteger(quantity)) {
    throw new Error(`Item por unidade exige quantidade inteira, recebeu ${quantity}`);
  }
}

/**
 * Mesmo produto? Código interno e EAN mandam quando os dois lados têm; senão
 * cai no nome normalizado (sem tokens de embalagem).
 *
 * ⚠️ Só compara unidades de venda iguais: "PICANHA KG" e "PICANHA UN" são
 * coisas diferentes e fundir daria total errado.
 */
export function isSameProduct(a: CartItem, b: { product: CartProduct; policy: PricingPolicy }): boolean {
  if (a.policy.saleUnit !== b.policy.saleUnit) return false;
  if (a.product.internalCode && b.product.internalCode) {
    return a.product.internalCode === b.product.internalCode;
  }
  if (a.product.ean && b.product.ean) {
    return a.product.ean === b.product.ean;
  }
  return normalizeProductName(a.product.rawName) === normalizeProductName(b.product.rawName);
}

export interface AddItemInput {
  id: string;
  product: CartProduct;
  policy: PricingPolicy;
  quantity: number;
  source?: 'scan' | 'manual';
}

/**
 * Adiciona ao carrinho, fundindo com o mesmo produto quando já existe — é o
 * que permite alcançar a faixa de quantidade escaneando o item várias vezes.
 *
 * A política do item existente é substituída pela nova: a etiqueta acabou de
 * ser lida, então é a informação mais recente da gôndola.
 */
export function addItem(cart: Cart, input: AddItemInput): Cart {
  assertQuantity(input.quantity, input.policy.saleUnit);

  const existing = cart.items.findIndex((item) => isSameProduct(item, input));
  if (existing >= 0) {
    const current = cart.items[existing] as CartItem;
    const merged: CartItem = {
      ...current,
      policy: input.policy,
      quantity: current.quantity + input.quantity,
    };
    const items = [...cart.items];
    items[existing] = merged;
    return { ...cart, items };
  }

  return {
    ...cart,
    items: [
      ...cart.items,
      {
        id: input.id,
        product: input.product,
        policy: input.policy,
        quantity: input.quantity,
        source: input.source ?? 'scan',
      },
    ],
  };
}

export function removeItem(cart: Cart, itemId: string): Cart {
  return { ...cart, items: cart.items.filter((item) => item.id !== itemId) };
}

/**
 * Troca a quantidade. O preço unitário NÃO é ajustado aqui — ele é derivado no
 * `summarize`, que é o que garante o recálculo por faixa a cada mudança.
 */
export function setQuantity(cart: Cart, itemId: string, quantity: number): Cart {
  const index = cart.items.findIndex((item) => item.id === itemId);
  if (index < 0) {
    throw new Error(`Item não está no carrinho: ${itemId}`);
  }
  const current = cart.items[index] as CartItem;
  assertQuantity(quantity, current.policy.saleUnit);

  const items = [...cart.items];
  items[index] = { ...current, quantity };
  return { ...cart, items };
}

export function setUseStoreCard(cart: Cart, useStoreCard: boolean): Cart {
  return { ...cart, useStoreCard };
}

export function setBudget(cart: Cart, budgetCents: number | null): Cart {
  if (budgetCents !== null && budgetCents <= 0) {
    throw new Error(`Orçamento deve ser positivo, recebeu ${budgetCents}`);
  }
  return { ...cart, budgetCents };
}

/** Uma linha resolvida — preço, total, economia e dica da próxima faixa. */
export function summarizeLine(item: CartItem, useStoreCard: boolean): CartLine {
  const resolution = resolvePrice(item.policy, item.quantity, useStoreCard);
  const totalCents = itemTotalCents(resolution.unitPriceCents, item.policy.saleUnit, item.quantity);
  const baseTotal = itemTotalCents(
    item.policy.basePriceCents,
    item.policy.saleUnit,
    item.quantity,
  );

  const next = resolution.nextTier;
  const hint: TierHint | null = next
    ? {
        qtyNeeded: next.qtyNeeded,
        newUnitPriceCents: next.tier.priceCents,
        savingsPerUnitCents: resolution.unitPriceCents - next.tier.priceCents,
        savingsAtTierCents: next.savingsCents,
      }
    : null;

  return {
    item,
    unitPriceCents: resolution.unitPriceCents,
    appliedTier: resolution.appliedTier,
    totalCents,
    savedCents: baseTotal - totalCents,
    hint,
  };
}

/**
 * Estado completo do carrinho. É aqui que o recálculo por faixa acontece —
 * chame a cada render; é barato e não guarda preço congelado.
 */
export function summarize(cart: Cart): CartSummary {
  const lines = cart.items.map((item) => summarizeLine(item, cart.useStoreCard));
  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const savedCents = lines.reduce((sum, line) => sum + line.savedCents, 0);
  const itemCount = cart.items.reduce(
    (sum, item) => sum + (item.policy.saleUnit === 'UN' ? item.quantity : 1),
    0,
  );

  return {
    lines,
    totalCents,
    itemCount,
    savedCents,
    budget: budgetStatus(totalCents, cart.budgetCents),
  };
}
