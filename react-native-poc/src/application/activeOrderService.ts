import { supabase } from '../infrastructure/supabaseClient';

/**
 * Orders that are paid for but not yet in the customer's hands.
 *
 * This is the gap the app had: accepting an online order set it to
 * `completed`, so it appeared under مكتملة and there was no way left to
 * say "we've made it", "it's with the driver", or "they took it". The
 * columns were already there (ready_at, out_for_delivery_at,
 * delivered_at) with nothing writing to them.
 *
 * `delivered_at is null` is the filter, NOT `ready_at is null`: an order
 * that is ready but not handed over still belongs on this list. Only a
 * genuinely delivered one is finished and drops off.
 */

export interface ActiveOrder {
  id: number;
  channel: 'delivery' | 'pickup';
  createdAt: Date;
  total: number;
  /** The delivery app's name, or "متجر المطعم" for the restaurant's own
   *  storefront. Null for pickup. */
  platformName: string | null;
  platformId: number | null;
  invoiceLast4: string | null;
  isOnline: boolean;
  readyAt: Date | null;
  outForDeliveryAt: Date | null;
  customerName: string | null;
  /** Minutes the platform allows for preparation. Delivery only. */
  prepTimeoutMinutes: number;
  /**
   * Cash on delivery: the customer pays at handover, and nobody has been
   * paid yet. These are the only orders on this list whose final button
   * moves money, so the button has to know.
   */
  isCod: boolean;
}

/** The source's own default when a platform has no timeout configured. */
export const DEFAULT_PREP_TIMEOUT_MINUTES = 17;

/**
 * Seconds left before this order misses its platform's prep deadline.
 * Negative once it is late, which is exactly what the countdown shows.
 * Pickup has no such deadline -- a prep timeout is a delivery-platform
 * concept -- so it is never called for one.
 */
export function remainingPrepSeconds(order: ActiveOrder, now: number = Date.now()): number {
  const elapsedSec = (now - order.createdAt.getTime()) / 1000;
  return Math.round(order.prepTimeoutMinutes * 60 - elapsedSec);
}

/**
 * Today's undelivered delivery and pickup orders.
 *
 * Scoped to today so a forgotten order from last week cannot sit at the
 * top of the list forever, matching the source's own `gte(created_at,
 * start of today)`.
 */
export async function listActiveOrders(branchId: number): Promise<ActiveOrder[]> {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('orders')
    .select(
      'id, total, created_at, ready_at, out_for_delivery_at, channel, source, customer_name, payment_method, payment_status, delivery_platform_id, platform_invoice_last4, delivery_platforms(name, prep_timeout_minutes)',
    )
    .eq('branch_id', branchId)
    .in('channel', ['delivery', 'pickup'])
    .is('delivered_at', null)
    // Paid orders, PLUS cash-on-delivery ones that are still unpaid --
    // those are exactly the orders waiting for someone to collect the
    // money, so this list is where that happens. Written as a precise OR
    // rather than by dropping the filter: an online CARD order the
    // customer abandoned at the payment page is also unpaid, and it must
    // stay off a list of orders being worked.
    .or('payment_status.eq.paid,and(payment_method.eq.cash,payment_status.eq.unpaid)')
    .neq('status', 'cancelled')
    .neq('status', 'refunded')
    .neq('status', 'rejected')
    .gte('created_at', startToday.toISOString())
    .order('created_at', { ascending: true });

  return (data || []).map((o: any) => {
    const platform = Array.isArray(o.delivery_platforms) ? o.delivery_platforms[0] : o.delivery_platforms;
    const isOnline = o.source === 'online';
    return {
      id: Number(o.id),
      channel: o.channel === 'delivery' ? 'delivery' : 'pickup',
      createdAt: new Date(o.created_at),
      total: Number(o.total),
      platformName:
        o.channel === 'delivery' ? (isOnline ? 'متجر المطعم' : platform?.name || 'توصيل') : null,
      platformId: o.delivery_platform_id != null ? Number(o.delivery_platform_id) : null,
      invoiceLast4: o.platform_invoice_last4 ?? null,
      isOnline,
      readyAt: o.ready_at ? new Date(o.ready_at) : null,
      outForDeliveryAt: o.out_for_delivery_at ? new Date(o.out_for_delivery_at) : null,
      customerName: o.customer_name ?? null,
      prepTimeoutMinutes: Number(platform?.prep_timeout_minutes) || DEFAULT_PREP_TIMEOUT_MINUTES,
      isCod: o.payment_method === 'cash' && o.payment_status === 'unpaid',
    };
  });
}

/**
 * The list, in the order it should be worked.
 *
 * Not-ready orders come first sorted by urgency, then ready-but-unhanded
 * ones oldest-first. The source keeps these as two separate sorts on
 * purpose, and the reason is worth preserving: they answer different
 * questions -- "what is about to be late?" versus "what has been sitting
 * longest waiting to be collected?" -- so one shared sort key would
 * silently mix them.
 *
 * Delivery not-ready sorts by remaining prep time; pickup has no prep
 * deadline, so it sorts oldest-first, where longest-waiting is the most
 * urgent.
 */
export function sortActiveOrders(orders: ActiveOrder[], now: number = Date.now()): ActiveOrder[] {
  const delivery = orders.filter(o => o.channel === 'delivery');
  const pickup = orders.filter(o => o.channel === 'pickup');

  const deliveryNotReady = delivery
    .filter(o => !o.readyAt)
    .sort((a, b) => remainingPrepSeconds(a, now) - remainingPrepSeconds(b, now));
  const deliveryReady = delivery
    .filter(o => o.readyAt)
    .sort((a, b) => (a.readyAt!.getTime() || 0) - (b.readyAt!.getTime() || 0));

  const pickupNotReady = pickup
    .filter(o => !o.readyAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pickupReady = pickup
    .filter(o => o.readyAt)
    .sort((a, b) => (a.readyAt!.getTime() || 0) - (b.readyAt!.getTime() || 0));

  return [...deliveryNotReady, ...deliveryReady, ...pickupNotReady, ...pickupReady];
}

async function callStage(rpc: string, orderId: number, failure: string) {
  const { error } = await supabase.rpc(rpc, { p_order_id: orderId });
  if (error) return { ok: false, error: failure };
  return { ok: true, error: null };
}

/** Delivery: prepared and waiting for the driver. */
export function markDeliveryReady(orderId: number) {
  return callStage('mark_delivery_order_ready', orderId, 'تعذر تسجيل الطلب جاهز');
}

/** Delivery: handed to the driver. */
export function markOutForDelivery(orderId: number) {
  return callStage('mark_order_out_for_delivery', orderId, 'تعذر تسجيل خروج الطلب');
}

/** Delivery: confirmed with the customer. */
export function markDeliveryDelivered(orderId: number) {
  return callStage('mark_delivery_order_delivered', orderId, 'تعذر تسجيل تسليم الطلب');
}

/** Pickup: prepared and waiting on the counter. */
export function markPickupReady(orderId: number) {
  return callStage('mark_order_ready', orderId, 'تعذر تسجيل الطلب جاهز');
}

/**
 * Cash on delivery: the customer has just handed over the money.
 *
 * Replaces the plain delivered/collected call for a cash order, because
 * for those two the handover and the payment are the same event. One RPC
 * marks it paid, attaches it to the open shift, and records the handover
 * together -- so the cash cannot end up banked against no shift.
 */
export async function confirmCodCollected(orderId: number, shiftId: number) {
  const { error } = await supabase.rpc('confirm_cod_collected', {
    p_order_id: orderId,
    p_shift_id: shiftId,
  });
  if (error) return { ok: false, error: error.message || 'تعذر تسجيل استلام المبلغ' };
  return { ok: true, error: null };
}

/** Pickup: collected by the customer. */
export function markPickupCollected(orderId: number) {
  return callStage('mark_order_delivered', orderId, 'تعذر تسجيل استلام الطلب');
}
