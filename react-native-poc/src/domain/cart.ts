/**
 * Domain layer: the cart/pricing engine, ported line-for-line from
 * public/pos/rakeen-pos.js's real state.cart / lineUnitPrice / cartTotals
 * / addToCartWithConfig / changeQty / removeFromCart / configsEqual /
 * buildDefaultConfig. Pure functions, no React, no Supabase, no storage --
 * this is exactly the financial logic the migration must NOT simplify or
 * redesign, so every formula and branch below matches the source file,
 * including the comment explaining WHY (the VAT-inclusive/exclusive
 * branch must match submit_online_order's server-side math exactly).
 *
 * Deliberately NOT ported in this checkpoint: "box"/"meal" modifier
 * products (a meal-builder/box-picker UI, a materially different and
 * larger feature than a standard single/multi option group -- see
 * MODIFIER_PRODUCTS's isBox/isMeal branch in rakeen-pos.js). Standard
 * modifier groups (the common case -- size, add-ons, etc.) ARE ported for
 * real below, since those are exactly the "modifiers where applicable"
 * the migration must preserve.
 */

export type OrderChannel = 'dine_in' | 'pickup' | 'delivery';

export interface ModifierOption {
  id: string;
  name: string;
  /** price_delta in the source schema -- added to (or subtracted from,
   *  if negative) the product's base price when selected. */
  price: number;
  default?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: 'single' | 'multi';
  required: boolean;
  max: number | null;
  options: ModifierOption[];
}

/** Only the standard-group shape is modeled here -- isBox/isMeal products
 *  are excluded at the catalogService layer for this checkpoint (see file
 *  header) rather than given a half-built representation here. */
export interface ModifierDefinition {
  groups: ModifierGroup[];
  alwaysCustomize: boolean;
}

/** Keyed by modifier group id -> selected option id (single) or option ids (multi).
 *  Matches item.config in rakeen-pos.js exactly, including using the group
 *  id as the object key. */
export type CartLineConfig = Record<string, string | string[]>;

export interface CartLine {
  lineId: number;
  /** Positive for a menu_item, negative for a service -- see domain/catalog.ts. */
  productId: number;
  qty: number;
  note: string;
  config: CartLineConfig | null;
  isPointsRedemption?: boolean;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

export function configsEqual(a: CartLineConfig | null, b: CartLineConfig | null): boolean {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

export function buildDefaultConfig(modDef: ModifierDefinition | undefined): CartLineConfig | null {
  if (!modDef) return null;
  const config: CartLineConfig = {};
  modDef.groups.forEach(g => {
    if (g.type === 'single') {
      // A required group can legitimately have zero options for a moment
      // (a manager adds the group before adding options to it) -- null
      // just means "nothing selected yet", matching the source's own
      // defensive comment on this exact branch.
      const def = g.options.find(o => o.default) || g.options[0];
      config[g.id] = def ? def.id : (null as unknown as string);
    } else {
      config[g.id] = g.options.filter(o => o.default).map(o => o.id);
    }
  });
  return config;
}

/** Delivery-channel base price override -- each platform can have its own
 *  price list per item (menu_item_platform_prices). `platformPrices` is
 *  optional and empty by default in this checkpoint: platform price
 *  loading itself is a separate, later concern (delivery integration),
 *  not implemented yet -- when absent, this always falls through to the
 *  product's normal price, same as the source code's own fallback path. */
export function productBasePrice(
  productId: number,
  basePrice: number,
  orderChannel: OrderChannel,
  deliveryPlatformId: string | null,
  platformPrices: Record<string, Record<number, number>> = {},
): number {
  if (orderChannel === 'delivery' && deliveryPlatformId) {
    const override = (platformPrices[deliveryPlatformId] || {})[productId];
    if (override != null) return override;
  }
  return basePrice;
}

export function lineUnitPrice(
  item: CartLine,
  basePrice: number,
  modDef: ModifierDefinition | undefined,
  orderChannel: OrderChannel,
  deliveryPlatformId: string | null,
  platformPrices?: Record<string, Record<number, number>>,
): number {
  if (item.isPointsRedemption) return 0;
  const resolvedBase = productBasePrice(item.productId, basePrice, orderChannel, deliveryPlatformId, platformPrices);
  if (!modDef || !item.config) return resolvedBase;
  let price = resolvedBase;
  modDef.groups.forEach(g => {
    const sel = item.config![g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId => {
      const opt = g.options.find(o => o.id === optId);
      if (opt) price += opt.price || 0;
    });
  });
  return price;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Saudi Ministry of Commerce requires displayed menu prices to be
 * VAT-inclusive -- the tax is already baked into the product's price, not
 * added on top at checkout. `pricesIncludeVat` branches this exactly like
 * the source: inclusive mode derives the VAT portion FROM the discounted
 * amount instead of adding VAT on top of it, matching the server-side
 * `submit_online_order` RPC's math exactly -- this must never drift from
 * that RPC's formula, since the server independently recomputes and would
 * reject/disagree with a client total that used different math.
 */
export function cartTotals(
  lines: CartLine[],
  unitPriceOf: (item: CartLine) => number,
  discountPct: number,
  vatRegistered: boolean,
  vatRate: number,
  pricesIncludeVat: boolean,
): CartTotals {
  const subtotal = lines.reduce((s, i) => s + unitPriceOf(i) * i.qty, 0);
  const discount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discount;
  const rate = vatRegistered ? vatRate : 0;
  let vat: number, total: number;
  if (pricesIncludeVat) {
    vat = round2((afterDiscount * rate) / (1 + rate));
    total = afterDiscount;
  } else {
    vat = round2(afterDiscount * rate);
    total = afterDiscount + vat;
  }
  return { subtotal, discount, vat, total };
}

export function addToCartWithConfig(
  cart: CartLine[],
  productId: number,
  config: CartLineConfig | null,
  qty: number,
  nextLineId: () => number,
): CartLine[] {
  const existing = cart.find(i => i.productId === productId && configsEqual(i.config, config));
  if (existing) {
    return cart.map(i => (i === existing ? { ...i, qty: i.qty + qty } : i));
  }
  return [...cart, { lineId: nextLineId(), productId, qty, note: '', config }];
}

export function changeQty(cart: CartLine[], lineId: number, delta: number): CartLine[] {
  const next = cart.map(i => (i.lineId === lineId ? { ...i, qty: i.qty + delta } : i));
  return next.filter(i => i.qty > 0);
}

export function removeFromCart(cart: CartLine[], lineId: number): CartLine[] {
  return cart.filter(i => i.lineId !== lineId);
}
