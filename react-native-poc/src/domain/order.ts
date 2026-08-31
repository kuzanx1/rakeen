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
import { CartLine, OrderChannel, ModifierDefinition } from './cart';
import type { Product } from './catalog';

export interface OrderItemPayload {
  menu_item_id: number | null;
  service_id: number | null;
  qty: number;
  unit_price: number;
  modifiers_total: number;
  line_total: number;
  note: string | null;
  selected_modifiers: { text: string }[];
  // stock_decrements / box_selections are always [] in this checkpoint --
  // both require MENU_ITEM_META/BOX_ELIGIBLE_META data this checkpoint
  // doesn't load (see application/catalogService.ts's own deferrals for
  // box-mode products); the server tolerates an empty array identically
  // to "nothing to decrement", so this is a real, safe subset, not a
  // silent behavior change for any product this checkpoint can even
  // build a payload for (box products are excluded from modifiersByProductId
  // already).
  stock_decrements: never[];
  box_selections: never[];
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
export interface OrderPayload {
  type?: 'simple';
  client_order_uuid: string;
  branch_id: number;
  shift_id: number | null;
  staff_member_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: string | null;
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

export interface DineInRegisterPayload {
  type: 'dine_in_register';
  client_order_uuid: string;
  branch_id: number;
  shift_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: string | null;
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

export type QueuedPayload = OrderPayload | DineInRegisterPayload;

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

export function formatConfigLabels(
  config: CartLine['config'],
  modDef: ModifierDefinition | undefined,
): { text: string }[] {
  if (!modDef || !config) return [];
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
  customerId: string | null;
  discountPct: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  subtotal: number;
  channel: OrderChannel;
  deliveryPlatformId: string | null;
  platformInvoiceLast4: string | null;
  tableId: number | null;
}

function buildItems(
  cart: CartLine[],
  productsById: Map<number, Product>,
  modifiersByProductId: Record<number, ModifierDefinition>,
  unitPriceOf: (item: CartLine) => number,
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
    stock_decrements: [],
    box_selections: [],
    is_points_redemption: !!item.isPointsRedemption,
    points_cost: 0, // points redemption isn't ported this checkpoint -- see catalogService's own deferrals
  }));
}

export function buildOrderPayload(
  cart: CartLine[],
  productsById: Map<number, Product>,
  modifiersByProductId: Record<number, ModifierDefinition>,
  unitPriceOf: (item: CartLine) => number,
  ctx: OrderBuildContext,
): OrderPayload {
  return {
    client_order_uuid: generateClientOrderUuid(),
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
    payment_method: 'cash', // see OrderPayload's own doc comment -- deliberate, documented scope limit
    cash_amount: ctx.channel === 'dine_in' ? null : ctx.total,
    channel: ctx.channel,
    delivery_platform_id: ctx.channel === 'delivery' ? ctx.deliveryPlatformId : null,
    platform_invoice_last4: null,
    table_id: ctx.channel === 'dine_in' ? ctx.tableId : null,
    items: buildItems(cart, productsById, modifiersByProductId, unitPriceOf),
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
    items: buildItems(cart, productsById, modifiersByProductId, unitPriceOf),
    table_id: ctx.tableId as number,
    staff_member_id: ctx.staffMemberId,
    existing_order_id: ctx.existingOrderId,
  };
}
