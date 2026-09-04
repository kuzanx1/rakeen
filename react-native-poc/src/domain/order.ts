/**
 * Domain layer: order payload shapes and pure builders, ported line-for-
 * line from public/pos/rakeen-pos.js's real buildOrderPayload/
 * buildDineInRegisterPayload/formatConfigLabels. Same field names as the
 * real RPC parameters (complete_pos_order/register_dine_in_order/
 * pay_dine_in_order) -- these are the actual backend contracts, not
 * redesigned for React Native. See application/orderService.ts for where
 * these get sent.
 */

import uuid from 'react-native-uuid';
import { CartLine, OrderChannel, ModifierDefinition, computeLineStockDecrements, computeLineBoxSelections, formatBoxLabels } from './cart';
import type { ModifierOptionStockMap, StockDecrement, BoxSelectionPayload, BoxDefinition } from './cart';
import type { Product } from './catalog';
import type { PaymentMethod, PaymentState, DrawerState } from './payment';

/** Every queued payload carries its own payment/drawer state -- reuses
 *  the SAME SQLite-backed queue already built in Checkpoint 5
 *  (infrastructure/sqliteOrderQueue.ts) rather than a parallel payment
 *  table, per the explicit "build on top of the already verified
 *  architecture" instruction. */
export interface PaymentTracking {
  payment_state: PaymentState;
  drawer_state: DrawerState;
  /** Stable per payment attempt -- reused across retries so a drawer kick
   *  is never repeated for the same logical operation. For a fresh order
   *  (OrderPayload/DineInRegisterPayload) this is the same value as
   *  client_order_uuid; for DineInPayPayload (paying an EXISTING order,
   *  which pay_dine_in_order addresses by order_id, not a uuid -- see
   *  that RPC's own idempotency note in application/paymentService.ts)
   *  it's a stable, order-id-derived id instead. */
  operation_id: string;
}

export interface OrderItemPayload {
  menu_item_id: number | null;
  service_id: number | null;
  qty: number;
  unit_price: number;
  modifiers_total: number;
  line_total: number;
  note: string | null;
  selected_modifiers: { text: string }[];
  /**
   * Stock drawn by this line's modifier EXTRAS -- "extra cheese" taking
   * 20g off the cheese in the store room.
   *
   * Recipe lines and box picks are deliberately NOT here: the server
   * resolves those from the menu item's own stored recipe, so the till
   * never has to know an ingredient name, quantity or unit cost to ring up
   * a sale. This carries only what the customer actually chose, which was
   * already shown to them at checkout.
   *
   * Was hardcoded [] -- so a cheese extra could sell all day and the store
   * room count never moved.
   */
  stock_decrements: StockDecrement[];
  /**
   * The customer's box picks: which eligible ROW and how many pieces,
   * both already shown to them at checkout. The server resolves what each
   * pick actually decrements from its own recipe data, so this never
   * carries a stock_item_id, a unit cost, or an ingredient name.
   */
  box_selections: BoxSelectionPayload[];
  is_points_redemption: boolean;
  points_cost: number;
}

/** Regular / pickup / delivery order -- what complete_pos_order expects.
 *  NOTE: this RPC creates AND pays the order in one atomic call; the
 *  current architecture has no separate "create without paying" step for
 *  these three channels (only dine-in does, via register_dine_in_order).
 *  Per the explicit "order creation only, not payment" scope for this
 *  checkpoint, `payment_method`/`cash_amount` are filled with the
 *  simplest always-valid default (cash, full amount) rather than any real
 *  payment-method selection UI -- no card/split logic, no payment screen,
 *  exists yet. This is a documented, deliberate scope decision, not
 *  something to mistake for Payment (Checkpoint 7) being done. */
export interface OrderPayload extends Partial<PaymentTracking> {
  type?: 'simple';
  client_order_uuid: string;
  branch_id: number;
  shift_id: number | null;
  staff_member_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  // Real DB column/RPC parameter is `bigint`, not text -- a real,
  // load-bearing type bug found during the Feature Parity Pass (this
  // was `string | null` and had never been wired to a real customer,
  // so it was never actually exercised). Fixed here, before customer
  // attachment is wired for real.
  customer_id: number | null;
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  cash_amount: number | null;
  channel: OrderChannel;
  delivery_platform_id: string | null;
  platform_invoice_last4: string | null;
  table_id: number | null;
  items: OrderItemPayload[];
  // Queue bookkeeping -- added once persisted, absent on a fresh payload.
  retry_count?: number;
  next_retry_at?: number;
  stuck?: boolean;
  last_error?: string;
}

export interface DineInRegisterPayload extends Partial<PaymentTracking> {
  type: 'dine_in_register';
  client_order_uuid: string;
  branch_id: number;
  shift_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: number | null; // see OrderPayload's own doc comment on this field
  subtotal: number;
  discount_pct: number;
  items: OrderItemPayload[];
  table_id: number;
  staff_member_id: number | null;
  existing_order_id: number | null;
  retry_count?: number;
  next_retry_at?: number;
  stuck?: boolean;
  last_error?: string;
}

/**
 * Paying an ALREADY-registered dine-in order -- what pay_dine_in_order
 * expects. No client_order_uuid of its own on purpose, matching the real
 * RPC's own idempotency design (see application/paymentService.ts's doc
 * comment on sendDineInPayToServer): its WHERE clause
 * (payment_status='unpaid') already makes a retry a safe no-op at the DB
 * level. `client_order_uuid` here is a LOCAL-ONLY queue key (this app's
 * SQLite table still needs a primary key per queued item) -- it is never
 * sent to the server.
 */
export interface DineInPayPayload extends Partial<PaymentTracking> {
  type: 'dine_in_pay';
  client_order_uuid: string; // local queue key only, see doc comment above
  order_id: number;
  payment_method: PaymentMethod;
  cash_amount: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: number | null; // see OrderPayload's own doc comment on this field
  retry_count?: number;
  next_retry_at?: number;
  stuck?: boolean;
  last_error?: string;
}

export type QueuedPayload = OrderPayload | DineInRegisterPayload | DineInPayPayload;

function generateClientOrderUuid(): string {
  // Real, load-bearing difference from rakeen-pos.js's own fallback
  // (`Date.now()+'-'+Math.random()...` when crypto.randomUUID is
  // unavailable): that fallback string is NOT a valid Postgres `uuid`
  // value, and complete_pos_order/register_dine_in_order's
  // p_client_order_uuid parameter is typed `uuid`, not `text` (see
  // supabase/migrations/20260829200000_fix_pos_checkout_points_and_customer_id.sql).
  // Hermes has no crypto.randomUUID at all (unlike a browser, where that
  // fallback is essentially dead code) -- react-native-uuid is a pure-JS
  // RFC4122 v4 generator that actually runs on Hermes, used here for
  // exactly that reason, not as an arbitrary library choice.
  return uuid.v4() as string;
}

/** Local-only key, never sent to the server -- see DineInPayPayload's doc
 *  comment. Uses the same UUID generator as client_order_uuid for
 *  consistency, not because the server cares about its format here. */
export function generateLocalQueueKey(): string {
  return uuid.v4() as string;
}

/** Stable per logical drawer/payment operation, reused across retries --
 *  see PaymentTracking's doc comment. For a brand-new order this is just
 *  its own client_order_uuid; for paying an EXISTING dine-in order it's
 *  derived from the real, stable order_id instead (an order can only ever
 *  be paid once, so `order_id` alone is already a safe, stable key -- no
 *  need for a separate generated id). */
export function operationIdForOrder(clientOrderUuid: string): string {
  return clientOrderUuid;
}
export function operationIdForDineInPay(orderId: number): string {
  return `dine_in_pay:${orderId}`;
}

export function buildDineInPayPayload(
  orderId: number,
  paymentMethod: PaymentMethod,
  cashAmount: number | null,
  customerName: string | null,
  customerPhone: string | null,
  customerId: number | null,
): DineInPayPayload {
  return {
    type: 'dine_in_pay',
    client_order_uuid: generateLocalQueueKey(),
    order_id: orderId,
    payment_method: paymentMethod,
    cash_amount: cashAmount,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_id: customerId,
    payment_state: 'PAYMENT_PENDING',
    drawer_state: 'DRAWER_PENDING',
    operation_id: operationIdForDineInPay(orderId),
  };
}

export function formatConfigLabels(
  config: CartLine['config'],
  modDef: ModifierDefinition | undefined,
): { text: string }[] {
  if (!modDef || !config) return [];
  // A box has no groups -- its labels come from the piece counts, so the
  // group loop below would produce nothing for one.
  const box = modDef as unknown as BoxDefinition;
  if (box.isBox) return formatBoxLabels(config, box).map(text => ({ text }));
  const labels: { text: string }[] = [];
  modDef.groups.forEach(g => {
    const sel = config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId => {
      if (!optId) return;
      const opt = g.options.find(o => o.id === optId);
      if (!opt) return;
      labels.push({ text: opt.name });
    });
  });
  return labels;
}

export interface OrderBuildContext {
  branchId: number;
  shiftId: number | null;
  staffMemberId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerId: number | null;
  discountPct: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  subtotal: number;
  channel: OrderChannel;
  deliveryPlatformId: string | null;
  platformInvoiceLast4: string | null;
  tableId: number | null;
  /** Real payment method selection (Checkpoint 6) -- defaults to 'cash'
   *  with the full total only when the caller doesn't pass one, matching
   *  Checkpoint 5's original documented default for backward
   *  compatibility with any existing caller that hasn't been updated. */
  paymentMethod?: PaymentMethod;
  cashAmount?: number | null;
  /** MODIFIER_OPTION_STOCK and STOCK_UNIT_BY_ID, from the loaded catalog.
   *  On the context rather than as more positional arguments because
   *  every caller already builds one of these and both maps travel
   *  together with the rest of the order's environment. */
  optionStock: ModifierOptionStockMap;
  stockUnitById: Record<number, string>;
}

function buildItems(
  cart: CartLine[],
  productsById: Map<number, Product>,
  modifiersByProductId: Record<number, ModifierDefinition>,
  unitPriceOf: (item: CartLine) => number,
  optionStock: ModifierOptionStockMap,
  stockUnitById: Record<number, string>,
): OrderItemPayload[] {
  return cart.map(item => ({
    // A service's virtual product id is always negative (see domain/catalog.ts) --
    // real menu_items ids are always positive. Same branch as the source.
    menu_item_id: item.productId < 0 ? null : item.productId,
    service_id: item.productId < 0 ? -item.productId : null,
    qty: item.qty,
    unit_price: unitPriceOf(item),
    modifiers_total: 0,
    line_total: unitPriceOf(item) * item.qty,
    note: item.note || null,
    selected_modifiers: formatConfigLabels(item.config, modifiersByProductId[item.productId]),
    stock_decrements: computeLineStockDecrements(
      item,
      modifiersByProductId[item.productId],
      optionStock,
      stockUnitById,
    ),
    box_selections: computeLineBoxSelections(
      item,
      (modifiersByProductId[item.productId] as unknown as { isBox?: boolean })?.isBox === true,
    ),
    is_points_redemption: !!item.isPointsRedemption,
    // Feature Parity Pass -- Loyalty. Looked up from the product's own
    // pointsRedeemPrice at build time, exactly matching the PWA's real
    // MENU_ITEM_META[item.productId].pointsRedeemPrice lookup (not
    // stored on the cart line itself -- see domain/cart.ts's
    // addPointsRedemptionToCart doc comment).
    points_cost: item.isPointsRedemption ? productsById.get(item.productId)?.pointsRedeemPrice || 0 : 0,
  }));
}

export function buildOrderPayload(
  cart: CartLine[],
  productsById: Map<number, Product>,
  modifiersByProductId: Record<number, ModifierDefinition>,
  unitPriceOf: (item: CartLine) => number,
  ctx: OrderBuildContext,
): OrderPayload {
  const clientOrderUuid = generateClientOrderUuid();
  const paymentMethod = ctx.paymentMethod || 'cash';
  const cashAmount = ctx.cashAmount !== undefined ? ctx.cashAmount : ctx.channel === 'dine_in' ? null : ctx.total;
  return {
    client_order_uuid: clientOrderUuid,
    branch_id: ctx.branchId,
    shift_id: ctx.shiftId,
    staff_member_id: ctx.staffMemberId,
    customer_name: ctx.customerName,
    customer_phone: ctx.customerPhone,
    customer_id: ctx.customerId,
    subtotal: ctx.subtotal,
    discount_pct: ctx.discountPct,
    discount_amount: ctx.discountAmount,
    vat_amount: ctx.vatAmount,
    total: ctx.total,
    payment_method: paymentMethod,
    cash_amount: cashAmount,
    channel: ctx.channel,
    delivery_platform_id: ctx.channel === 'delivery' ? ctx.deliveryPlatformId : null,
    platform_invoice_last4: null,
    table_id: ctx.channel === 'dine_in' ? ctx.tableId : null,
    items: buildItems(cart, productsById, modifiersByProductId, unitPriceOf, ctx.optionStock, ctx.stockUnitById),
    payment_state: 'PAYMENT_PENDING',
    drawer_state: 'DRAWER_PENDING',
    operation_id: operationIdForOrder(clientOrderUuid),
  };
}

export function buildDineInRegisterPayload(
  cart: CartLine[],
  productsById: Map<number, Product>,
  modifiersByProductId: Record<number, ModifierDefinition>,
  unitPriceOf: (item: CartLine) => number,
  ctx: OrderBuildContext & { existingOrderId: number | null },
): DineInRegisterPayload {
  return {
    type: 'dine_in_register',
    client_order_uuid: generateClientOrderUuid(),
    branch_id: ctx.branchId,
    shift_id: ctx.shiftId,
    customer_name: ctx.customerName,
    customer_phone: ctx.customerPhone,
    customer_id: ctx.customerId,
    subtotal: ctx.subtotal,
    discount_pct: ctx.discountPct,
    items: buildItems(cart, productsById, modifiersByProductId, unitPriceOf, ctx.optionStock, ctx.stockUnitById),
    table_id: ctx.tableId as number,
    staff_member_id: ctx.staffMemberId,
    existing_order_id: ctx.existingOrderId,
  };
}
