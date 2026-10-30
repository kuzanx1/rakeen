import { getItem, setItem } from '../infrastructure/mmkvStorage';

/**
 * الطلبات اللي سوّاها هالجهاز نفسه.
 *
 * جهاز الطباعة (printStationService) يطبع طلبات الأجهزة الثانية، وطلبات
 * الجهاز نفسه طبعها هو وقت البيع -- فلازم يعرفها عشان ما تنطبع مرتين.
 * تنسجّل لحظة إرسالها للسيرفر (orderService.dispatchQueuedPayload)، قبل
 * ما تنكتب هناك، فما يسبقها جهاز الطباعة أبداً.
 */

const KEY = 'rk_own_orders_v1';
const KEEP = 300;

let uuids: string[] | null = null;
let paidIds: number[] | null = null;

async function load(): Promise<void> {
  if (uuids && paidIds) return;
  try {
    const raw = await getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    uuids = Array.isArray(v?.uuids) ? v.uuids : [];
    paidIds = Array.isArray(v?.paidIds) ? v.paidIds : [];
  } catch {
    uuids = [];
    paidIds = [];
  }
}

async function save(): Promise<void> {
  try {
    await setItem(KEY, JSON.stringify({ uuids: (uuids ?? []).slice(-KEEP), paidIds: (paidIds ?? []).slice(-KEEP) }));
  } catch {
    // حفظ أفضل-جهد: لو فشل يبقى في الذاكرة لين يطفى التطبيق.
  }
}

/** طلب جديد (أو جولة طاولة) طلع من هالجهاز. */
export async function markOwnOrder(clientOrderUuid: string | null | undefined): Promise<void> {
  if (!clientOrderUuid) return;
  await load();
  if (!uuids!.includes(clientOrderUuid)) uuids!.push(clientOrderUuid);
  await save();
}

/** دفع طاولة انحسب من هالجهاز (فاتورته طبعها هو). */
export async function markOwnPayment(orderId: number | null | undefined): Promise<void> {
  if (orderId == null) return;
  await load();
  if (!paidIds!.includes(orderId)) paidIds!.push(orderId);
  await save();
}

export async function isOwnOrder(clientOrderUuid: string | null | undefined): Promise<boolean> {
  if (!clientOrderUuid) return false;
  await load();
  return uuids!.includes(clientOrderUuid);
}

export async function isOwnPayment(orderId: number): Promise<boolean> {
  await load();
  return paidIds!.includes(orderId);
}
