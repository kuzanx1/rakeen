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
  customerPhone: string | null;
  /** وقت الاستلام اللي حدده الزبون في الطلب الإلكتروني، أو null. */
  scheduledFor: Date | null;
  /** The call-buzzer handed to this customer, if any. */
  pagerNumber: number | null;
  /** Minutes the platform allows for preparation. Delivery only. */
  prepTimeoutMinutes: number;
  /**
   * Cash on delivery: the customer pays at handover, and nobody has been
   * paid yet. These are the only orders on this list whose final button
   * moves money, so the button has to know.
   */
  isCod: boolean;
  /** طلب كاش (ينحسب مبلغه عند الاستلام) -- حتى لو السيرفر علّمه مدفوع وقت الإرسال. */
  isCash: boolean;
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
  const onlineSince = new Date(startToday.getTime() - 3 * 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from('orders')
    .select(
      'id, total, created_at, ready_at, out_for_delivery_at, channel, source, customer_name, customer_phone, scheduled_for, pager_number, payment_method, payment_status, delivery_platform_id, platform_invoice_last4, delivery_platforms(name, prep_timeout_minutes)',
    )
    .eq('branch_id', branchId)
    // A till pickup order does NOT belong here.
    //
    // The customer is standing at the counter: they paid and took the bag,
    // and there is no gap between "made" and "handed over" for anyone to
    // record. Tracking it forced the cashier through جاهز then استلمه
    // العميل for a sale that was already finished, which is what the source
    // avoids by scoping pickup tracking to source = 'online'
    // (rakeen-pos.js:5439).
    //
    // Delivery is different at any source: a delivery-app order is prepared
    // now and collected by a rider later, so the stages are real events
    // somebody has to record.
    // ...and a till order that went out with a call-buzzer. Handing over a
    // buzzer IS the statement that the customer walked away and someone
    // has to call them back, which is the same gap online orders have.
    // Without a buzzer there is no gap: the customer waits at the counter.
    .or('channel.eq.delivery,and(channel.eq.pickup,source.eq.online),pager_number.not.is.null')
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
    // طلبات اليوم، وطلبات المتجر الإلكتروني من آخر ثلاث أيام اللي للحين ما
    // انسلّمت: طلب استلام مجدول انعمل أمس (أو زبون ما جا) كان يختفي من
    // القائمة بعد منتصف الليل، فما يقدر الكاشير يسلّمه ولا يلغيه.
    .or(`created_at.gte."${startToday.toISOString()}",and(source.eq.online,created_at.gte."${onlineSince.toISOString()}")`)
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
      customerPhone: o.customer_phone ?? null,
      scheduledFor: o.scheduled_for ? new Date(o.scheduled_for) : null,
      prepTimeoutMinutes: Number(platform?.prep_timeout_minutes) || DEFAULT_PREP_TIMEOUT_MINUTES,
      isCod: o.payment_method === 'cash' && o.payment_status === 'unpaid',
      isCash: o.payment_method === 'cash',
      pagerNumber: o.pager_number != null ? Number(o.pager_number) : null,
    };
  });
}

/** كم قبل وقت الاستلام المحدد يطلع الطلب من «المجدولة» للتجهيز. */
export const SCHEDULED_HOLD_MINUTES = 30;

/**
 * طلبٌ مجدول لسا بدري عليه: الزبون حدد وقت استلام، وباقي عليه أكثر من
 * نص ساعة، وما جهز. يبقى معلّقاً تحت «مجدولة» بلا زر تجهيز، ويطلع
 * للتجهيز لحاله لما يقرب وقته -- عشان ما ينطبخ قبل وقته ويبرد.
 */
export function isScheduledHold(order: ActiveOrder, now: number = Date.now()): boolean {
  return !order.readyAt && order.scheduledFor != null && order.scheduledFor.getTime() - SCHEDULED_HOLD_MINUTES * 60_000 > now;
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

  // المجدول يُرتّب على وقته لا على وقت إرساله، والمعلّق منه آخر القائمة.
  const due = (o: ActiveOrder) => (o.scheduledFor ?? o.createdAt).getTime();
  const pickupNotReady = pickup
    .filter(o => !o.readyAt && !isScheduledHold(o, now))
    .sort((a, b) => due(a) - due(b));
  const held = orders
    .filter(o => isScheduledHold(o, now))
    .sort((a, b) => due(a) - due(b));
  const pickupReady = pickup
    .filter(o => o.readyAt)
    .sort((a, b) => (a.readyAt!.getTime() || 0) - (b.readyAt!.getTime() || 0));

  return [...deliveryNotReady, ...deliveryReady, ...pickupNotReady, ...pickupReady, ...held];
}

async function callStage(rpc: string, orderId: number, failure: string) {
  const { error } = await supabase.rpc(rpc, { p_order_id: orderId });
  if (error) return { ok: false, error: failure };
  return { ok: true, error: null };
}

/**
 * Attach a call-buzzer to a finished sale.
 *
 * Called after the order exists rather than as part of creating it: the
 * buzzer is handed over at the counter once the money is taken, and it is
 * irrelevant to how the sale was paid. Failing to record it must never
 * undo a completed sale, so the caller treats this as best-effort.
 */
export async function setOrderPager(orderId: number, pagerNumber: number) {
  const { error } = await supabase.rpc('set_order_pager', {
    p_order_id: orderId,
    p_pager_number: pagerNumber,
  });
  if (error) return { ok: false, error: error.message };
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

/** أسباب جاهزة لإلغاء طلب إلكتروني بعد قبوله. */
export const CANCEL_REASONS = ['العميل طلب الإلغاء', 'العميل ما جا يستلم', 'العميل ما رد', 'صنف خلص', 'المطعم مشغول'];

/**
 * إلغاء طلب إلكتروني انقبل (قيد التجهيز أو مجدول) ولسا ما انحسب مبلغه.
 *
 * cancel_online_order يحفظ السبب ويطلع للزبون في صفحة التتبع. لو القاعدة
 * لسا ما فيها هالدالة (ملف 20261024120000 ما انشغّل)، يرجع لـ
 * cancel_dine_in_order اللي يلغي أي طلب غير مدفوع بس بدون سبب --
 * فالإلغاء يشتغل من اليوم، والسبب يتسجل أول ما تنضاف الدالة.
 */
export async function cancelOnlineOrder(
  orderId: number,
  reason: string,
): Promise<{ ok: boolean; error: string | null; reasonSaved: boolean }> {
  const first = await supabase.rpc('cancel_online_order', { p_order_id: orderId, p_reason: reason });
  if (!first.error) return { ok: true, error: null, reasonSaved: true };
  const missing = first.error.code === 'PGRST202' || /could not find the function/i.test(first.error.message || '');
  if (!missing) return { ok: false, error: first.error.message || 'تعذر إلغاء الطلب', reasonSaved: false };
  const fallback = await supabase.rpc('cancel_dine_in_order', { p_order_id: orderId, p_still_occupied: false });
  if (fallback.error) return { ok: false, error: 'تعذر إلغاء الطلب — شغّل ملف cancel_online_order في Supabase أول (الطلب الإلكتروني ينحفظ مدفوع من لحظة إرساله)', reasonSaved: false };
  return { ok: true, error: null, reasonSaved: false };
}

/** Pickup: collected by the customer. */
export function markPickupCollected(orderId: number) {
  return callStage('mark_order_delivered', orderId, 'تعذر تسجيل استلام الطلب');
}
