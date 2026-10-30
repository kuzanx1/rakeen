import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { subscribeToPostgresChanges } from '../infrastructure/realtimeChannel';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { shouldPrintCustomerReceipt, shouldPrintKitchenTicket, shouldPrintReceiptLogo } from '../domain/printerProfile';
import type { KitchenTicketData, ReceiptData } from '../domain/receipt';
import { getOrderHistoryDetail, OrderHistoryDetail } from './orderHistoryService';
import { enqueuePrintJob } from './printService';
import { getDeviceConfig } from './authService';
import { getReceiptBranding, getServiceSettings } from './catalogService';
import { planHas } from './planService';
import { isOwnOrder, isOwnPayment } from './ownOrders';
import { formatPickupAt } from '../domain/arabicDate';
import NetInfo from '@react-native-community/netinfo';
import { shouldTriggerSyncOnNetChange } from '../domain/sync';

/**
 * «جهاز الطباعة للفرع».
 *
 * عربة فود ترك: الكاشير بالجوال عند الزبون، والطابعة على سنمي عند
 * العمال. الطلب ينحفظ من الجوال، بس الطباعة كانت من الجهاز اللي سوّى
 * الطلب بس -- فما ينطبع شي. الجهاز اللي مفعّل عليه «جهاز الطباعة» يراقب
 * طلبات فرعه ويطبع اللي سوّتها أجهزة ثانية (الآيفون، الكاشير من المتصفح،
 * أي جهاز)، بطابعته هو وإعدادات طباعته هو، بدون أي تغيير على الجهاز
 * المرسل.
 *
 * - طلب جديد: تذكرة المطبخ (لو مفعّلة)، وفاتورة العميل لو انحسب مبلغه.
 * - طاولة انسجلت بدون دفع: تنتظر، وفاتورتها تنطبع لما تندفع.
 * - طلبات هالجهاز نفسه (ownOrders) والطلبات الإلكترونية (لها مسار القبول)
 *   ما تنطبع هنا.
 * - رجوع الجهاز بعد انقطاع: يكمل من آخر طلب شافه، بس ما يطبع طلبات أقدم
 *   من نص ساعة -- ورق طلبات خلصت يربك أكثر مما يفيد.
 *
 * الحدث المباشر (realtime) يسرّع، والفحص كل ثمان ثواني هو الضامن.
 */

const KEY = 'rk_print_station_v1';
const POLL_MS = 60000;
const MAX_AGE_MS = 30 * 60 * 1000;
const WATCH_MAX_MS = 12 * 60 * 60 * 1000;

interface StationState {
  branchId: number;
  lastId: number;
  /** طلبات طاولة من أجهزة ثانية تنتظر الدفع: id → وقت إنشائها. */
  watch: Record<string, number>;
  /** آخر طلب انطبع من جهاز ثاني -- يطلع في إعدادات الطابعة. */
  lastPrinted?: { id: number; at: number };
}

async function loadState(): Promise<StationState | null> {
  try {
    const raw = await getItem(KEY);
    return raw ? (JSON.parse(raw) as StationState) : null;
  } catch {
    return null;
  }
}

async function saveState(s: StationState): Promise<void> {
  try {
    await setItem(KEY, JSON.stringify(s));
  } catch {
    // يكمل من الذاكرة.
  }
}

/** للعرض في إعدادات الطابعة. */
export async function getPrintStationLastPrinted(): Promise<{ id: number; at: number } | null> {
  return (await loadState())?.lastPrinted ?? null;
}

const CHANNEL_LABELS: Record<string, string> = { dine_in: 'محلي', pickup: 'سفري', delivery: 'تطبيقات التوصيل' };

function metaLabelOf(d: OrderHistoryDetail): string {
  const table = d.tableNumber != null ? ` — طاولة ${d.tableNumber}` : '';
  if (d.source === 'online') return 'طلب إلكتروني — ' + (d.channel === 'delivery' ? 'توصيل' : 'استلام') + table;
  return (CHANNEL_LABELS[d.channel] || d.channel) + table;
}

function pickupAtOf(d: OrderHistoryDetail): string | undefined {
  return d.scheduledFor ? formatPickupAt(d.scheduledFor, new Date(d.createdAt)) : undefined;
}

function linesOf(d: OrderHistoryDetail) {
  return d.items.map(it => ({
    name: it.name,
    nameEn: it.nameEn,
    qty: it.qty,
    unitPrice: it.unitPrice,
    lineTotal: it.lineTotal,
    mods: it.mods,
    note: it.note || undefined,
  }));
}

async function receiptFor(d: OrderHistoryDetail): Promise<ReceiptData> {
  const device = await getDeviceConfig();
  const printerProfile = await getPrinterProfile();
  const branding = device.businessId != null ? await getReceiptBranding(device.businessId, device.branchId ?? null) : null;
  return {
    orderId: d.id,
    lines: linesOf(d),
    subtotal: d.subtotal,
    discount: d.discountAmount,
    vat: d.vatAmount,
    total: d.total,
    paymentMethod: d.paymentMethod,
    change: 0,
    businessName: device.businessName ?? undefined,
    branchName: device.branchName ?? undefined,
    vatNumber: branding?.vatNumber || undefined,
    logoUrl: shouldPrintReceiptLogo(printerProfile) ? branding?.logoUrl || undefined : undefined,
    customMessage: branding?.customMessage || undefined,
    tagline: branding?.tagline || undefined,
    showBusinessName: branding?.showBusinessName,
    locationLine: branding?.locationLine || undefined,
    branchLabel: branding?.branchLabel || undefined,
    createdAtISO: d.createdAt,
    metaLabel: metaLabelOf(d),
    pickupAt: pickupAtOf(d),
    platformName: d.platformName || undefined,
    platformInvoiceLast4: d.platformInvoiceLast4 || undefined,
    pagerNumber: d.pagerNumber ?? undefined,
    customerName: d.source === 'online' ? d.customerName || undefined : undefined,
    customerPhone: d.source === 'online' ? d.customerPhone || undefined : undefined,
    orderNote: d.source === 'online' ? d.onlineNote || undefined : undefined,
  } as ReceiptData;
}

async function kitchenFor(d: OrderHistoryDetail): Promise<KitchenTicketData> {
  const device = await getDeviceConfig();
  return {
    orderId: d.id,
    tableNumber: d.tableNumber ?? null,
    lines: linesOf(d),
    branchName: device.branchName ?? undefined,
    createdAtISO: d.createdAt,
    metaLabel: metaLabelOf(d) + (d.platformName ? ` — ${d.platformName}` : ''),
    pickupAt: pickupAtOf(d),
    pagerNumber: d.pagerNumber ?? undefined,
  } satisfies KitchenTicketData;
}

/** طلب جديد من جهاز ثاني: نفس أوراق البيع من الكاشير نفسه. */
async function printNewOrder(d: OrderHistoryDetail, paid: boolean): Promise<void> {
  const profile = await getPrinterProfile();
  if (paid && shouldPrintCustomerReceipt(profile)) {
    await enqueuePrintJob('receipt', { ...(await receiptFor(d)) });
  }
  if (shouldPrintKitchenTicket(profile) && planHas('kds')) {
    const device = await getDeviceConfig();
    const service = device.businessId != null ? await getServiceSettings(device.businessId) : null;
    if (service?.kitchenTicketMode === 'copy') {
      await enqueuePrintJob('receipt', { ...(await receiptFor(d)) });
    } else {
      await enqueuePrintJob('kitchen', { ...(await kitchenFor(d)) });
    }
  }
}

async function printPaidReceipt(d: OrderHistoryDetail): Promise<void> {
  const profile = await getPrinterProfile();
  if (shouldPrintCustomerReceipt(profile)) {
    await enqueuePrintJob('receipt', { ...(await receiptFor(d)) });
  }
}

interface OrderRow {
  id: number;
  client_order_uuid: string | null;
  source: string | null;
  status: string | null;
  payment_status: string | null;
  created_at: string;
}

let running = false;
let again = false;

/** دورة وحدة. ما تتداخل: لو جات إشارة وهي شغالة، تعيد مرة بعدها. */
export async function printStationTick(branchId: number): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await tickOnce(branchId);
    } while (again);
  } catch {
    // الشبكة: الدورة الجاية تكمل من نفس المكان.
  } finally {
    running = false;
  }
}

async function tickOnce(branchId: number): Promise<void> {
  const profile = await getPrinterProfile();
  if (profile?.printStation !== true) {
    // انطفى: ينسى مكانه، فلو انشغّل بعدين يبدأ من لحظتها، مو من قبل.
    if (await getItem(KEY)) await setItem(KEY, '');
    return;
  }

  let state = await loadState();
  if (!state || state.branchId !== branchId) {
    // أول تشغيل: يبدأ من الحين، ما يطبع اللي قبل.
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('branch_id', branchId)
      .order('id', { ascending: false })
      .limit(1);
    state = { branchId, lastId: data?.[0]?.id != null ? Number(data[0].id) : 0, watch: {} };
    await saveState(state);
    return;
  }

  const { data: rows, error } = await supabase
    .from('orders')
    .select('id, client_order_uuid, source, status, payment_status, created_at')
    .eq('branch_id', branchId)
    .gt('id', state.lastId)
    .order('id', { ascending: true })
    .limit(30);
  if (error) throw error;

  for (const r of (rows || []) as OrderRow[]) {
    const id = Number(r.id);
    const created = new Date(r.created_at).getTime();
    const skip =
      r.source === 'online' ||
      r.status === 'cancelled' ||
      Number.isNaN(created) ||
      Date.now() - created > MAX_AGE_MS ||
      (await isOwnOrder(r.client_order_uuid));
    if (!skip) {
      const d = await getOrderHistoryDetail(id);
      if (d && d.items.length > 0) {
        const paid = r.payment_status === 'paid';
        await printNewOrder(d, paid);
        if (!paid) state.watch[String(id)] = created;
        state.lastPrinted = { id, at: Date.now() };
      }
    }
    // يتقدّم بعد كل طلب، عشان انقطاع بالنص ما يعيد طباعة اللي انطبع.
    state.lastId = id;
    await saveState(state);
  }

  // طاولات تنتظر الدفع.
  const waiting = Object.keys(state.watch).map(Number);
  if (waiting.length > 0) {
    const { data: wrows, error: werr } = await supabase
      .from('orders')
      .select('id, status, payment_status')
      .in('id', waiting);
    if (werr) throw werr;
    const byId = new Map(((wrows || []) as OrderRow[]).map(w => [Number(w.id), w]));
    for (const id of waiting) {
      const w = byId.get(id);
      const tooOld = Date.now() - (state.watch[String(id)] ?? 0) > WATCH_MAX_MS;
      if (!w || w.status === 'cancelled' || tooOld) {
        delete state.watch[String(id)];
        continue;
      }
      if (w.payment_status !== 'paid') continue;
      delete state.watch[String(id)];
      if (!(await isOwnPayment(id))) {
        const d = await getOrderHistoryDetail(id);
        if (d) {
          await printPaidReceipt(d);
          state.lastPrinted = { id, at: Date.now() };
        }
      }
    }
    await saveState(state);
  }
}

/**
 * طلب طباعة من جهاز ثاني: «إعادة طباعة» أو «تذكرة المطبخ» على جهاز ما
 * عنده طابعة. يوصل على قناة بث للفرع (بدون كتابة في قاعدة البيانات)، وجهاز
 * الطباعة يطبعه ويرد بتأكيد عشان المرسل يعرف إنه انطبع.
 */
export type RemotePrintKind = 'receipt' | 'kitchen';
const printTopic = (branchId: number) => `rk-print-station:${branchId}`;

export async function handleRemotePrint(orderId: number, kind: RemotePrintKind): Promise<boolean> {
  const profile = await getPrinterProfile();
  if (profile?.printStation !== true) return false;
  const d = await getOrderHistoryDetail(orderId);
  if (!d) return false;
  if (kind === 'kitchen') await enqueuePrintJob('kitchen', { ...(await kitchenFor(d)) });
  else await enqueuePrintJob('receipt', { ...(await receiptFor(d)) });
  const state = await loadState();
  if (state) await saveState({ ...state, lastPrinted: { id: orderId, at: Date.now() } });
  return true;
}

/** المرسل: يرجّع true لما جهاز الطباعة يأكّد خلال سبع ثواني. */
export function sendToPrintStation(branchId: number, orderId: number, kind: RemotePrintKind): Promise<boolean> {
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise(resolve => {
    let done = false;
    const channel = supabase.channel(`${printTopic(branchId)}:${reqId}`, { config: { broadcast: { self: false } } });
    const stationChannel = supabase.channel(printTopic(branchId), { config: { broadcast: { self: false } } });
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try {
        supabase.removeChannel(channel);
        supabase.removeChannel(stationChannel);
      } catch {
        // القنوات انقفلت أصلاً.
      }
      resolve(ok);
    };
    const timeout = setTimeout(() => finish(false), 7000);
    // الرد يجي على قناة خاصة بهالطلب، فما يختلط بطلب جهاز ثاني.
    channel.on('broadcast', { event: 'ack' }, () => finish(true)).subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      stationChannel.subscribe(s => {
        if (s === 'SUBSCRIBED') stationChannel.send({ type: 'broadcast', event: 'print', payload: { orderId, kind, reqId } });
      });
    });
  });
}

/** يشتغل مع تسجيل دخول الكاشير، ويوقف بخروجه. يرجّع دالة الإيقاف. */
export function startPrintStation(branchId: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (timer) return;
    // ثانية ونص: يخلي السيرفر يكمّل كتابة أصناف الطلب قبل ما نقرأه.
    timer = setTimeout(() => {
      timer = null;
      printStationTick(branchId);
    }, 1500);
  };
  printStationTick(branchId);
  // الطلب الجديد يوصل بالإشعار المباشر (realtime) لحظتها. الفحص الدوري
  // احتياط بس -- لو انقطع الإشعار -- فمرة بالدقيقة، ومع كل رجوع للنت.
  const interval = setInterval(() => printStationTick(branchId), POLL_MS);
  const netSub = NetInfo.addEventListener(state => {
    if (shouldTriggerSyncOnNetChange(state)) soon();
  });
  const unsubscribe = subscribeToPostgresChanges(
    `pos-print-station:${branchId}`,
    { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
    () => soon(),
  );
  const station = supabase.channel(printTopic(branchId), { config: { broadcast: { self: false } } });
  station
    .on('broadcast', { event: 'print' }, ({ payload }) => {
      const p = payload as { orderId?: number; kind?: RemotePrintKind; reqId?: string };
      if (p?.orderId == null || !p.reqId) return;
      handleRemotePrint(Number(p.orderId), p.kind === 'kitchen' ? 'kitchen' : 'receipt')
        .then(ok => {
          if (!ok) return;
          const reply = supabase.channel(`${printTopic(branchId)}:${p.reqId}`);
          reply.subscribe(s => {
            if (s !== 'SUBSCRIBED') return;
            reply.send({ type: 'broadcast', event: 'ack', payload: {} }).finally(() => supabase.removeChannel(reply));
          });
        })
        .catch(() => {});
    })
    .subscribe();
  return () => {
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    netSub();
    unsubscribe();
    try {
      supabase.removeChannel(station);
    } catch {
      // انقفلت.
    }
  };
}
