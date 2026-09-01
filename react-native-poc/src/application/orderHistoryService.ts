import { supabase } from '../infrastructure/supabaseClient';

/**
 * Feature Parity Pass -- Refunds/Void/Cancellation. Ported from the PWA's
 * real Orders screen queries (public/pos/rakeen-pos.js's renderOrdersList
 * "completed"/"cancelled" tabs, ~line 3385, and openOrderDetail, ~line
 * 3501) -- same columns, same branch scope, same recent-first/limit-30
 * shape. Deliberately does NOT port the "جارية" (running) tab's delivery/
 * pickup lifecycle dashboard (ready/out-for-delivery/countdown timers) --
 * that's a separate, much larger feature with no bearing on refund/void,
 * which is this item's actual scope.
 */

export type OrderHistoryStatus = 'completed' | 'cancelled' | 'refunded';

export interface OrderHistoryRow {
  id: number;
  total: number;
  createdAt: string;
  customerName: string | null;
  channel: string;
  status: OrderHistoryStatus;
}

export async function listOrderHistory(branchId: number, status: OrderHistoryStatus): Promise<OrderHistoryRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, total, created_at, customer_name, channel, status')
    .eq('branch_id', branchId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map(o => ({
    id: o.id,
    total: Number(o.total),
    createdAt: o.created_at,
    customerName: o.customer_name,
    channel: o.channel,
    status: o.status,
  }));
}

export interface OrderHistoryItem {
  menuItemId: number | null;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  mods: string[];
  note: string | null;
}

export interface OrderHistoryDetail {
  id: number;
  status: OrderHistoryStatus | string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  channel: string;
  paymentMethod: string;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  tableNumber: number | null;
  items: OrderHistoryItem[];
}

export async function getOrderHistoryDetail(orderId: number): Promise<OrderHistoryDetail | null> {
  const [{ data: order }, { data: items }] = await Promise.all([
    supabase.from('orders').select('*, restaurant_tables!orders_table_id_fkey(number)').eq('id', orderId).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', orderId),
  ]);
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    createdAt: order.created_at,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    channel: order.channel,
    paymentMethod: order.payment_method,
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discount_amount || 0),
    vatAmount: Number(order.vat_amount),
    total: Number(order.total),
    tableNumber: order.restaurant_tables?.number ?? null,
    items: (items || []).map((it: any) => ({
      menuItemId: it.menu_item_id,
      name: it.menu_item_id != null ? `#${it.menu_item_id}` : it.service_id != null ? `#${it.service_id}` : 'صنف',
      qty: Number(it.qty),
      unitPrice: Number(it.unit_price),
      lineTotal: Number(it.line_total),
      mods: (it.selected_modifiers || []).map((m: any) => m.text || m.name || String(m)),
      note: it.note,
    })),
  };
}

/** Ported from refund_pos_order(p_order_id) -- see
 *  supabase/migrations/20260801235653_refund_pos_order.sql, unchanged
 *  since it was first written: only a 'completed' order can be refunded
 *  (the RPC itself enforces this, raising an exception otherwise -- never
 *  duplicated/re-validated here), flips status to 'refunded', does not
 *  restock (a real, disclosed limitation of the RPC itself, not this
 *  client). Gated behind ManagerPinModal by every real caller, matching
 *  the PWA's own refundOrderBtn handler -- never called unguarded. */
export async function refundPosOrder(orderId: number): Promise<void> {
  const { error } = await supabase.rpc('refund_pos_order', { p_order_id: orderId });
  if (error) throw error;
}
