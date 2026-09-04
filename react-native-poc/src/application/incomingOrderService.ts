import { supabase } from '../infrastructure/supabaseClient';
import { subscribeToPostgresChanges } from '../infrastructure/realtimeChannel';

/**
 * Online orders arriving from the restaurant's own storefront.
 *
 * This app had none of it. The alert sound existed
 * (soundService.startIncomingOrderSound) but nothing ever triggered it --
 * an order placed by a customer landed in the database and the till never
 * learned about it, not even after a restart.
 *
 * The source uses two mechanisms together, and BOTH are needed:
 *   - a realtime INSERT subscription, which only sees orders from the
 *     moment it connects; and
 *   - a poll at boot, which is what catches everything that arrived while
 *     the device was asleep, offline, or restarting.
 * Either one alone silently drops orders.
 */

export interface IncomingOrderItem {
  menuItemId: number | null;
  name: string;
  qty: number;
  lineTotal: number;
  mods: string[];
  note: string | null;
}

export interface IncomingOrder {
  id: number;
  channel: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  deliveryAddress: string | null;
  scheduledFor: string | null;
  scheduledByCustomer: boolean;
  total: number;
  status: string;
  items: IncomingOrderItem[];
}

/** INCOMING_ORDER_REJECT_REASONS (rakeen-pos.js:6494). */
export const REJECT_REASONS = [
  'عدم توفر الصنف',
  'المطعم مشغول',
  'خارج نطاق التوصيل',
  'الفرع مغلق الآن',
];

/**
 * Every pending order for this branch. loadPendingOnlineOrdersOnBoot()
 * (rakeen-pos.js:6653), oldest first so the queue is genuinely FIFO.
 */
export async function listPendingOnlineOrders(branchId: number): Promise<number[]> {
  const { data } = await supabase
    .from('orders')
    .select('id')
    .eq('branch_id', branchId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return (data || []).map(o => Number(o.id));
}

/** Realtime INSERTs for this branch. Returns an unsubscribe. */
export function subscribeToIncomingOnlineOrders(
  branchId: number,
  onIncoming: (orderId: number) => void,
): () => void {
  return subscribeToPostgresChanges(
    `pos-incoming-online-orders:${branchId}`,
    { event: 'INSERT', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
    payload => {
      const order = payload.new as { id?: number; status?: string } | null;
      if (!order || order.status !== 'pending') return;
      onIncoming(Number(order.id));
    },
  );
}

/**
 * The order plus its lines, with real product names.
 *
 * Returns null when it is no longer pending -- the source drops those and
 * moves on, because another device may already have accepted it and
 * showing a stale card would let two tills answer the same order.
 */
export async function getIncomingOrder(orderId: number): Promise<IncomingOrder | null> {
  const [{ data: order }, { data: items }] = await Promise.all([
    supabase.from('orders').select('*').eq('id', orderId).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', orderId),
  ]);
  if (!order || order.status !== 'pending') return null;

  const rows = (items || []) as Record<string, unknown>[];
  const menuItemIds = rows.map(r => Number(r.menu_item_id)).filter(id => Number.isFinite(id));
  const names = new Map<number, string>();
  if (menuItemIds.length > 0) {
    const { data: menuItems } = await supabase.from('menu_items').select('id, name').in('id', menuItemIds);
    (menuItems || []).forEach(m => names.set(Number(m.id), String(m.name)));
  }

  return {
    id: Number(order.id),
    channel: String(order.channel),
    customerName: order.customer_name ?? null,
    customerPhone: order.customer_phone ?? null,
    paymentMethod: String(order.payment_method),
    deliveryAddress: order.delivery_address ?? null,
    scheduledFor: order.scheduled_for ?? null,
    scheduledByCustomer: order.scheduled_by_customer === true,
    total: Number(order.total),
    status: String(order.status),
    items: rows.map(r => ({
      menuItemId: r.menu_item_id != null ? Number(r.menu_item_id) : null,
      name:
        r.menu_item_id != null
          ? names.get(Number(r.menu_item_id)) || `منتج #${r.menu_item_id}`
          : 'صنف',
      qty: Number(r.qty),
      lineTotal: Number(r.line_total),
      mods: ((r.selected_modifiers as { text?: string }[]) || []).map(m => m.text || '').filter(Boolean),
      note: (r.note as string) || null,
    })),
  };
}

export async function acceptOnlineOrder(orderId: number): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc('accept_online_order', { p_order_id: orderId });
  if (error) return { ok: false, error: 'تعذر قبول الطلب — تحقق من الاتصال وجرّب مرة ثانية' };
  return { ok: true, error: null };
}

export async function rejectOnlineOrder(
  orderId: number,
  reason: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc('reject_online_order', { p_order_id: orderId, p_reason: reason });
  if (error) return { ok: false, error: 'تعذر رفض الطلب — تحقق من الاتصال وجرّب مرة ثانية' };
  return { ok: true, error: null };
}
