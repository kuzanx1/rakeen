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
  /** modifier_options.name_en (migration 20260908040000). */
  nameEn?: string | null;
  /** price_delta in the source schema -- added to (or subtracted from,
   *  if negative) the product's base price when selected. */
  price: number;
  default?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** modifier_groups.name_en (migration 20260908040000). */
  nameEn?: string | null;
  type: 'single' | 'multi';
  /** min_select > 0 (migration 20260909100000). */
  required: boolean;
  /** modifier_groups.min_select — how many the cashier must pick. */
  minSelect?: number;
  max: number | null;
  options: ModifierOption[];
}

/** Only the standard-group shape is modeled here -- isBox/isMeal products
 *  are excluded at the catalogService layer for this checkpoint (see file
 *  header) rather than given a half-built representation here. */
/**
 * A modifier option that draws from a real stock item -- "extra cheese"
 * taking 20g off the cheese in the store room.
 *
 * Only options with `cost_mode = 'stock'` AND a stock_item_id have one.
 * Everything else is a price change with no inventory consequence.
 */
export interface ModifierOptionStockLink {
  stockItemId: number;
  qty: number;
  /** The unit the RECIPE is written in, which need not be the unit the
   *  stock item is tracked in. */
  unit: string;
}

/** Keyed `${groupId}_${optionId}`, matching the source's own map. */
export type ModifierOptionStockMap = Record<string, ModifierOptionStockLink>;

/**
 * convertToUnit() (rakeen-pos.js:5720), verbatim.
 *
 * Only g<->kg convert. Anything else passes through unchanged, which is
 * correct rather than lazy: a recipe written in pieces against an item
 * tracked in pieces needs no conversion, and inventing a litre/kg factor
 * would mean guessing a density.
 */
export function convertToUnit(qty: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return qty;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  return qty;
}

export interface StockDecrement {
  stock_item_id: number;
  qty: number;
}

/**
 * computeLineStockDecrements() (rakeen-pos.js:2041).
 *
 * ONLY modifier extras. Recipe lines and box picks are resolved
 * server-side from the menu item's own stored recipe, so the till never
 * needs to know an ingredient name, quantity or unit cost to ring up a
 * sale -- it only reports the extras the customer actually chose, which
 * were already shown to them at checkout.
 */
export function computeLineStockDecrements(
  line: { productId: number; qty: number; config: Record<string, string | string[]> | null },
  modDef: ModifierDefinition | undefined,
  optionStock: ModifierOptionStockMap,
  stockUnitById: Record<number, string>,
): StockDecrement[] {
  const decrements: StockDecrement[] = [];
  if (!modDef || !line.config) return decrements;
  for (const group of modDef.groups ?? []) {
    const selected = line.config[group.id];
    const ids = Array.isArray(selected) ? selected : selected != null ? [selected] : [];
    for (const optId of ids) {
      const link = optionStock[`${group.id}_${optId}`];
      if (!link) continue;
      const qtyInStockUnit = convertToUnit(link.qty, link.unit, stockUnitById[link.stockItemId] || link.unit);
      // «×2 من 5»: الإضافة على حبتين بس.
      const units = Math.min(line.qty, optionCount(line.config, optId) ?? line.qty);
      decrements.push({ stock_item_id: link.stockItemId, qty: qtyInStockUnit * units });
    }
  }
  return decrements;
}

/**
 * A "box" product: one price, and the customer picks what goes in it.
 *
 * A 12-piece pastry box at 60 riyals where the customer chooses 4 cheese,
 * 4 zaatar, 4 meat. The price never changes with the mix -- but the STOCK
 * decrement does, which is the whole reason the picks have to be recorded.
 *
 * `slots` is menu_items.total_pieces; `items` are the eligible choices the
 * owner allowed, keyed by their own box_eligible_items row id (NOT the
 * stock item id -- a 'simple' choice has no stock item at all, so the row
 * id is the only key that works for every option).
 */
export interface BoxDefinition {
  isBox: true;
  alwaysCustomize: true;
  slots: number;
  items: { id: string; name: string }[];
}

/** How many of each eligible item the customer picked. */
export interface BoxConfig {
  selections: Record<string, number>;
}

export interface BoxSelectionPayload {
  eligible_item_id: number;
  qty: number;
}

/**
 * computeLineBoxSelections() (rakeen-pos.js:2066).
 *
 * Sends only WHICH eligible row was chosen and how many pieces -- both
 * already shown to the customer at checkout. The server looks up what each
 * pick actually decrements from its own recipe data, so this never carries
 * a stock_item_id, a unit cost, or an ingredient name.
 */
export function computeLineBoxSelections(
  line: { qty: number; config: unknown },
  isBox: boolean,
): BoxSelectionPayload[] {
  if (!isBox) return [];
  const selections = (line.config as BoxConfig | null)?.selections;
  if (!selections) return [];
  return Object.entries(selections)
    .filter(([, pieceQty]) => pieceQty > 0)
    .map(([eligibleId, pieceQty]) => ({ eligible_item_id: parseInt(eligibleId, 10), qty: pieceQty }));
}

/** The box branch of formatConfigLabels() -- "جبن ×4" per chosen item. */
export function formatBoxLabels(config: unknown, box: BoxDefinition): string[] {
  const selections = (config as BoxConfig | null)?.selections;
  if (!selections) return [];
  return Object.entries(selections)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const item = box.items.find(i => i.id === id);
      return `${item ? item.name : id} ×${qty}`;
    });
}

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
  /**
   * مكافأة ولاء مجانية، لا استبدال نقاط.
   *
   * الاثنان يشتركان في أن السطر أُعطي ولم يُبَع -- فسعره صفر ولا يُعدّ
   * في الولاء -- ويفترقان في الثمن: استبدال النقاط يخصم نقاطاً،
   * والمكافأة خُصمت من رصيد المكافآت وحده. ولولا هذه العلامة لخسر
   * الزبون مكافأةً ونقاطاً معاً كلما كان الصنف المجاني قابلاً
   * للاستبدال بالنقاط أيضاً -- وهو الشائع، إذ يُختار للعرضين معاً.
   */
  isFreeReward?: boolean;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

/**
 * عدد لكل إضافة: «5 كباب، 2 منها بدون بطاطس». ينحفظ داخل config نفسه تحت
 * مفتاح ما يطابق أي مجموعة، كقائمة "optId:n" (يناسب نوع CartLineConfig)،
 * فكل الكود اللي يمر على المجموعات ما يشوفه، والأسطر بعدد مختلف ما
 * تندمج (configsEqual يقارن JSON). ينحفظ بس لما العدد أقل من الكمية؛
 * بدون عدد = الإضافة على الكل زي قبل.
 */
export const OPTION_COUNTS_KEY = '__n';

export function optionCount(config: CartLineConfig | null | undefined, optionId: string): number | null {
  const list = config?.[OPTION_COUNTS_KEY];
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    const i = entry.lastIndexOf(':');
    if (i > 0 && entry.slice(0, i) === optionId) {
      const n = parseInt(entry.slice(i + 1), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

/** «بدون بطاطس» أو «بدون بطاطس ×2». */
export function withOptionCount(label: string, config: CartLineConfig | null | undefined, optionId: string): string {
  const n = optionCount(config, optionId);
  return n ? `${label} ×${n}` : label;
}

/** الإضافات المجانية في مجموعة متعددة هي اللي ينفع لها عدد. */
export function optionTakesCount(group: { type: string }, option: { price: number }): boolean {
  return group.type === 'multiple' && !option.price;
}

/** يكتب العدّادات في config عند «إضافة»: المختار، المجاني، وأقل من الكمية. */
export function applyOptionCounts(
  config: CartLineConfig,
  counts: Record<string, number>,
  qty: number,
  modDef: ModifierDefinition,
): CartLineConfig {
  const out: CartLineConfig = { ...config };
  delete out[OPTION_COUNTS_KEY];
  const list: string[] = [];
  for (const g of modDef.groups) {
    const sel = config[g.id];
    if (!Array.isArray(sel)) continue;
    for (const id of sel) {
      const opt = g.options.find(o => o.id === id);
      const n = counts[id];
      if (opt && optionTakesCount(g, opt) && n && n < qty) list.push(`${id}:${n}`);
    }
  }
  if (list.length) out[OPTION_COUNTS_KEY] = list;
  return out;
}

export function configsEqual(a: CartLineConfig | null, b: CartLineConfig | null): boolean {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

export function buildDefaultConfig(modDef: ModifierDefinition | undefined): CartLineConfig | null {
  if (!modDef) return null;
  // A box has no `groups` at all -- iterating them would throw. Its own
  // default is an empty pick set, which the builder fills in.
  if ((modDef as unknown as { isBox?: boolean }).isBox) {
    return { selections: {} } as unknown as CartLineConfig;
  }
  const config: CartLineConfig = {};
  modDef.groups.forEach(g => {
    if (g.type === 'single') {
      // Single groups START UNSELECTED now -- no silent first-option
      // default. Optional + blank = base price, no label. Required + blank
      // blocks "أضف" until the cashier picks (see ModifierModal).
      const def = g.options.find(o => o.default);
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
  // A box (the mix platters) has no groups and is sold at its own price,
  // same as lineUnitPrice() in rakeen-pos.js; walking its groups threw
  // «Cannot read property 'forEach' of undefined» the moment one was added.
  if (!modDef || !item.config || (modDef as unknown as { isBox?: boolean }).isBox) return resolvedBase;
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
  /** خصم بمبلغ ثابت (ريال) -- يغلب النسبة، وما يتعدّى المجموع. */
  discountFixed: number = 0,
): CartTotals {
  const subtotal = lines.reduce((s, i) => s + unitPriceOf(i) * i.qty, 0);
  const discount = discountFixed > 0 ? Math.min(round2(discountFixed), subtotal) : subtotal * (discountPct / 100);
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

/** Feature Parity Pass -- Loyalty. Ported verbatim from the PWA's real
 *  addPointsRedemptionToCart() -- always a fresh qty-1 line with no
 *  config/note, never merged into an existing identical-product line
 *  (a paid item and a points-redeemed one must stay visually and
 *  financially distinct on the receipt, never summed together). Its
 *  points cost is intentionally NOT stored here -- domain/order.ts's
 *  buildItems() looks it up from the product's own pointsRedeemPrice at
 *  checkout time, exactly matching the source's MENU_ITEM_META lookup. */
export function addPointsRedemptionToCart(cart: CartLine[], productId: number, nextLineId: () => number): CartLine[] {
  return [...cart, { lineId: nextLineId(), productId, qty: 1, note: '', config: null, isPointsRedemption: true }];
}

/** مكافأة الولاء: كسطر الاستبدال في السعر والعدّ، وبلا ثمنٍ بالنقاط. */
export function addFreeRewardToCart(cart: CartLine[], productId: number, nextLineId: () => number): CartLine[] {
  return [...cart, { lineId: nextLineId(), productId, qty: 1, note: '', config: null, isPointsRedemption: true, isFreeReward: true }];
}

export function changeQty(cart: CartLine[], lineId: number, delta: number): CartLine[] {
  const next = cart.map(i => (i.lineId === lineId ? { ...i, qty: i.qty + delta } : i));
  return next.filter(i => i.qty > 0);
}

export function removeFromCart(cart: CartLine[], lineId: number): CartLine[] {
  return cart.filter(i => i.lineId !== lineId);
}
