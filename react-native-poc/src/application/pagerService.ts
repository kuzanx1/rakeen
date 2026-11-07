import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { getPosDeviceId } from './displayScopeService';
import { pagerOnCustomerDisplay, hidePagerOnCustomerDisplay } from '../platform/customerDisplay';
import type { ReceiptPagerData } from '../domain/receipt';

/**
 * بيجر ركين -- جوال الزبون هو جهاز النداء.
 *
 * نسخةُ التطبيق من وحدة الويب (rakeen-pos.js «بيجر ركين») بنفس القرارات
 * حرفاً بحرف، والأزرار كلُّها تمرّ من /api/pager/notify -- المسارِ نفسه
 * الذي يناديه كاشير الويب وشاشة المطبخ -- فلا يختلف ما يصل الزبون
 * باختلاف الجهاز.
 *
 * والمفتاح client_order_uuid لا رقم الطلب: الفاتورة تُطبع قبل أن يصل
 * الطلب للخادم إن كان الجهاز بلا نت، والرقم لم يُعرف بعد.
 */

export type PagerChannel = 'dine_in' | 'pickup';
export interface PagerSettings {
  channels: PagerChannel[];
  prep_min: number;
  buffer_min: number;
  receipt: boolean;
  display: boolean;
  /** 0 = «لين يبدأ الطلب اللي بعده». */
  display_secs: number;
  /** رنّة تذكير تلقائية بعد كذا دقيقة من «جاهز»؛ 0 = لا. */
  remind_min: number;
  /** إقفال تلقائي بعد كذا دقيقة من «جاهز»؛ 0 = بيد الكاشير. */
  close_min: number;
  wifi: string;
  ready_msg: string;
  late_alert: boolean;
  tone: 'chime' | 'bell' | 'beep';
}

export const PAGER_DEFAULTS: PagerSettings = {
  channels: ['dine_in', 'pickup'], prep_min: 10, buffer_min: 5, receipt: true, display: true,
  display_secs: 60, remind_min: 3, close_min: 20, wifi: '', ready_msg: '', late_alert: true, tone: 'chime',
};

export function normalizePagerSettings(raw: unknown): PagerSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const s = { ...PAGER_DEFAULTS, ...r } as Record<string, unknown>;
  const int = (v: unknown, d: number, lo: number, hi: number) => {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    channels: Array.isArray(s.channels)
      ? (s.channels as unknown[]).filter((c): c is PagerChannel => c === 'dine_in' || c === 'pickup')
      : PAGER_DEFAULTS.channels.slice(),
    prep_min: int(s.prep_min, 10, 1, 120),
    buffer_min: int(s.buffer_min, 5, 0, 60),
    receipt: s.receipt !== false,
    display: s.display !== false,
    display_secs: int(s.display_secs, 60, 0, 300),
    remind_min: int(s.remind_min, 3, 0, 60),
    close_min: int(s.close_min, 20, 0, 240),
    wifi: String(s.wifi ?? '').slice(0, 40),
    ready_msg: String(s.ready_msg ?? '').slice(0, 80),
    late_alert: s.late_alert !== false,
    tone: s.tone === 'bell' || s.tone === 'beep' ? s.tone : 'chime',
  };
}

interface PagerConfig {
  enabled: boolean;
  settings: PagerSettings;
  autoReady: { dine_in: boolean; pickup: boolean };
}

const CACHE_KEY = 'rk_pager_cfg:';
let config: PagerConfig = { enabled: false, settings: PAGER_DEFAULTS, autoReady: { dine_in: false, pickup: false } };

export function pagerConfig(): PagerConfig {
  return config;
}

/**
 * يُقرأ مع إقلاع الكاشير، ويُحفظ على الجهاز: كاشيرٌ يقلع بلا نت يطبع
 * باركود البيجر كما طبعه أمس. وقاعدةٌ قبل ملف البيجر = مطفأ، والكاشير
 * يعمل كما كان.
 */
export async function loadPagerConfig(businessId: number): Promise<PagerConfig> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('pager_enabled, pager_settings, auto_ready_dine_in, auto_ready_pickup')
      .eq('id', businessId)
      .single();
    if (error || !data) throw error || new Error('no row');
    config = {
      enabled: data.pager_enabled === true,
      settings: normalizePagerSettings(data.pager_settings),
      autoReady: { dine_in: data.auto_ready_dine_in === true, pickup: data.auto_ready_pickup === true },
    };
    setItem(CACHE_KEY + businessId, JSON.stringify(config)).catch(() => {});
  } catch {
    try {
      const cached = await getItem(CACHE_KEY + businessId);
      if (cached) {
        const c = JSON.parse(cached) as PagerConfig;
        config = { enabled: c.enabled === true, settings: normalizePagerSettings(c.settings), autoReady: c.autoReady || { dine_in: false, pickup: false } };
      } else {
        config = { enabled: false, settings: PAGER_DEFAULTS, autoReady: { dine_in: false, pickup: false } };
      }
    } catch {
      config = { enabled: false, settings: PAGER_DEFAULTS, autoReady: { dine_in: false, pickup: false } };
    }
  }
  return config;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PagerEligibleInput {
  client_order_uuid?: string | null;
  channel: string;
  table_id?: number | null;
}

/** هل لهذا الطلب بيجر؟ نفسُ قرار الخادم (orders_set_pager_eta) حرفاً بحرف. */
export function pagerEligible(p: PagerEligibleInput, dineInMode: 'simple' | 'tables', cfg: PagerConfig = config): boolean {
  if (!cfg.enabled || !p.client_order_uuid || !UUID_RE.test(p.client_order_uuid)) return false;
  const ch = p.channel;
  if (ch !== 'dine_in' && ch !== 'pickup') return false;
  if (!cfg.settings.channels.includes(ch)) return false;
  if (ch === 'dine_in' && (p.table_id != null || dineInMode === 'tables')) return false;
  // «تخطي مرحلة جاهز» لقناته: الطلب جاهزٌ من لحظته، فلا بيجر.
  if (cfg.autoReady[ch]) return false;
  return true;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** uuid ← ٢٢ حرفاً base64url -- نفس lib/pager.ts في الخادم. */
export function pagerKey(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64[b2 & 63];
  }
  return out;
}

export function pagerUrl(uuid: string): string {
  return 'https://rakeenapp.com/p/' + pagerKey(uuid);
}

/** بلوك الفاتورة -- بيانات فقط، والراسم يبني الباركود. */
export function pagerReceiptBlock(p: PagerEligibleInput, orderId: number | null, dineInMode: 'simple' | 'tables'): ReceiptPagerData | null {
  if (!config.settings.receipt || !pagerEligible(p, dineInMode)) return null;
  return {
    url: pagerUrl(p.client_order_uuid!),
    title: 'امسح وخلّ جوالك يناديك',
    line: 'اجلس براحتك، أول ما يجهز طلبك يرن جوالك',
    tag: orderId != null ? `طلب ${orderId}` : 'بيجر طلبك',
    wifi: config.settings.wifi || null,
  };
}

async function authed(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 401, data: { error: 'جلسة غير صالحة' } };
  const res = await fetch(`${RAKEEN_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

let displayShown = false;
let ownPagerOrders = new Set<number>();

/** الطلبات التي أنشأها هذا الجهاز -- وحده يرنّ ويقفل تلقائياً، لا كل كاشيرٍ في الفرع. */
export function isOwnPagerOrder(id: number): boolean {
  return ownPagerOrders.has(id);
}

/**
 * بعد إتمام الدفع: الباركود على شاشة العميل.
 *
 * شاشة سنمي المدمجة تُرسم هنا مباشرةً -- بلا شبكة، فتعمل والجهاز
 * أوفلاين -- وشاشات الويب المقترنة عبر الخادم (نفس مسار الويب).
 */
export async function pagerAfterCheckout(p: PagerEligibleInput, orderId: number | null, dineInMode: 'simple' | 'tables', branchId: number | null): Promise<void> {
  if (!pagerEligible(p, dineInMode)) return;
  if (orderId != null) ownPagerOrders.add(orderId);
  const s = config.settings;
  if (!s.display) return;
  const url = pagerUrl(p.client_order_uuid!);
  pagerOnCustomerDisplay(url, orderId != null ? String(orderId) : '', s.display_secs);
  displayShown = true;
  watchPagerOnDisplay(url, s.display_secs);
  try {
    await authed('/api/pos/show-pager', {
      uuid: p.client_order_uuid, number: orderId, branchId, posDeviceId: await getPosDeviceId(), secs: s.display_secs,
    });
  } catch {
    // بلا نت: الشاشة المدمجة كفت.
  }
}

/* ── بلا سؤال دوري ──────────────────────────────────────────────────
   القاعدة تبثّ على قناة كل طلب بيجر (orders_pager_broadcast) عند كل تغيّر
   فيه، ومنها: فتح الزبون الصفحة. فالشاشة تستمع لقناة البيجر المعروض،
   وأول ما يمسحه الزبون ينزل -- ما يمسحه أحدٌ غيره، ولا طلب إخفاءٍ بعدها. */

/** المفتاح (base64url 22 حرفاً) ← uuid. عكس pagerKey. */
export function keyToUuid(key: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(key)) return null;
  const bytes: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of key) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); }
  }
  if (bytes.length !== 16) return null;
  const h = bytes.map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let displayWatch: ReturnType<typeof supabase.channel> | null = null;
let displayTimer: ReturnType<typeof setTimeout> | null = null;
function unwatchDisplay(): void {
  if (displayTimer) { clearTimeout(displayTimer); displayTimer = null; }
  if (!displayWatch) return;
  try { supabase.removeChannel(displayWatch); } catch { /* أُغلقت */ }
  displayWatch = null;
}

/** البيجر على شاشة العميل: ينزل لما يفتحه الزبون أو يُستلم الطلب. */
export function watchPagerOnDisplay(url: string, secs: number): void {
  unwatchDisplay();
  const m = /\/p\/([A-Za-z0-9_-]{22})$/.exec(url);
  const uuid = m ? keyToUuid(m[1]) : null;
  if (!uuid) return;
  displayWatch = supabase
    .channel(`pager:${uuid}`)
    .on('broadcast', { event: 'pager' }, msg => {
      const p = ((msg as { payload?: { seen?: boolean; collected?: boolean } }).payload) || {};
      if (!p.seen && !p.collected) return;
      hidePagerOnCustomerDisplay();
      displayShown = false;
      unwatchDisplay();
    })
    .subscribe();
  // انتهت مدّته: الشاشة أخفته بعدّادها -- فلا استماع ولا طلب إخفاء بعدها.
  if (secs > 0) displayTimer = setTimeout(() => { displayShown = false; unwatchDisplay(); }, secs * 1000 + 2000);
}

/**
 * قائمة البيجر في «جارية» تتحدّث بالبثّ لا بالسؤال: طلبٌ جديد من جهازٍ آخر،
 * المطبخ جهّز، الزبون فتح البيجر -- كلها تغيّرٌ في orders. ويُجلب مرّةً
 * عند كل إعادة اشتراك (رجع النت): ما فات وقت الانقطاع.
 */
export function subscribePagerOrders(branchId: number, onChange: () => void): () => void {
  let first = true;
  let t: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (t) return;
    t = setTimeout(() => { t = null; onChange(); }, 400);
  };
  const onRow = (p: { new?: { pager_eta_at?: string | null } }) => { if (p.new?.pager_eta_at) kick(); };
  const filter = `branch_id=eq.${branchId}`;
  const ch = supabase
    .channel(`rn-pager-orders:${branchId}`)
    .on('postgres_changes' as never, { event: 'INSERT', schema: 'public', table: 'orders', filter }, onRow)
    .on('postgres_changes' as never, { event: 'UPDATE', schema: 'public', table: 'orders', filter }, onRow)
    .subscribe((status: string) => {
      if (status !== 'SUBSCRIBED') return;
      if (!first) kick();
      first = false;
    });
  return () => {
    if (t) clearTimeout(t);
    try { supabase.removeChannel(ch); } catch { /* أُغلقت */ }
  };
}

/** الطلب الجديد يبدأ: بيجر اللي قبله ينزل من شاشة العميل. */
export async function pagerHideOnNextOrder(branchId: number | null): Promise<void> {
  if (!displayShown) return;
  displayShown = false;
  unwatchDisplay();
  hidePagerOnCustomerDisplay();
  try {
    await authed('/api/pos/show-pager', { hide: true, branchId, posDeviceId: await getPosDeviceId() });
  } catch {
    // لا شيء.
  }
}

export type PagerAction = 'ready' | 'ring' | 'delay' | 'collected';

export interface PagerActionResult {
  ok: boolean;
  error?: string;
  /** كم جوالاً وصله الإشعار. */
  pushed: number;
  /** فتح الزبون الصفحة؟ */
  seen: boolean;
}

export async function pagerAction(orderId: number, action: PagerAction, minutes = 5): Promise<PagerActionResult> {
  try {
    const r = await authed('/api/pager/notify', { orderId, action, minutes });
    if (!r.ok) return { ok: false, error: r.data?.error || 'تعذر التحديث', pushed: 0, seen: false };
    return { ok: true, pushed: Number(r.data?.pushed || 0), seen: !!r.data?.order?.seen_at };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بالخادم', pushed: 0, seen: false };
  }
}

export function pagerActionToast(orderId: number, action: PagerAction, r: PagerActionResult, minutes = 5): string {
  if (!r.ok) return r.error || 'تعذر التحديث';
  const reached = r.pushed > 0 || r.seen;
  switch (action) {
    case 'ready':
      return reached ? `🔔 رنّ جوال الزبون — طلب #${orderId} جاهز` : `طلب #${orderId} جاهز — الزبون ما فتح البيجر، ناده برقمه`;
    case 'ring':
      return `🔔 رنّينا عليه مرة ثانية — طلب #${orderId}`;
    case 'delay':
      return `⏱ أضفنا ${minutes} دقايق وبلّغنا الزبون — طلب #${orderId}`;
    default:
      return `✓ استلم طلبه — #${orderId}`;
  }
}

export interface PagerOrder {
  id: number;
  channel: PagerChannel;
  total: number;
  customerName: string | null;
  createdAt: Date;
  etaAt: Date | null;
  readyAt: Date | null;
  delayedAt: Date | null;
  seenAt: Date | null;
  ringCount: number;
}

/**
 * طلبات اليوم التي معها بيجر ولم تُستلم. استعلامٌ مستقلّ عن قائمة
 * «جارية»: قاعدةٌ قبل ملف البيجر تُسقطه وحده (أعمدةٌ ناقصة)، لا القائمة.
 */
export async function listPagerOrders(branchId: number): Promise<PagerOrder[]> {
  if (!config.enabled) return [];
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('orders')
    .select('id, total, created_at, customer_name, channel, ready_at, pager_eta_at, pager_delayed_at, pager_seen_at, pager_ring_count')
    .eq('branch_id', branchId)
    .not('pager_eta_at', 'is', null)
    .is('delivered_at', null)
    .eq('status', 'completed')
    .gte('created_at', startToday.toISOString())
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data || []).map((o: any) => ({
    id: Number(o.id),
    channel: o.channel === 'dine_in' ? 'dine_in' : 'pickup',
    total: Number(o.total || 0),
    customerName: o.customer_name ?? null,
    createdAt: new Date(o.created_at),
    etaAt: o.pager_eta_at ? new Date(o.pager_eta_at) : null,
    readyAt: o.ready_at ? new Date(o.ready_at) : null,
    delayedAt: o.pager_delayed_at ? new Date(o.pager_delayed_at) : null,
    seenAt: o.pager_seen_at ? new Date(o.pager_seen_at) : null,
    ringCount: Number(o.pager_ring_count || 0),
  }));
}

/** غير الجاهز أولاً حسب الوعد، ثم الجاهز الأقدم انتظاراً. */
export function sortPagerOrders(rows: PagerOrder[]): PagerOrder[] {
  const notReady = rows.filter(o => !o.readyAt).sort((a, b) => (a.etaAt?.getTime() ?? 0) - (b.etaAt?.getTime() ?? 0));
  const ready = rows.filter(o => o.readyAt).sort((a, b) => a.readyAt!.getTime() - b.readyAt!.getTime());
  return [...notReady, ...ready];
}

export type PagerUrgency = 'ok' | 'warn' | 'urgent';

/** عادي ← تجاوز وقت التحضير (warn) ← تجاوز الوعد (urgent). */
export function pagerUrgency(o: PagerOrder, now = Date.now(), s: PagerSettings = config.settings): { urgency: PagerUrgency; secondsLeft: number } {
  const prepAt = o.createdAt.getTime() + s.prep_min * 60_000;
  const eta = o.etaAt ? o.etaAt.getTime() : prepAt;
  return { urgency: now > eta ? 'urgent' : now > prepAt ? 'warn' : 'ok', secondsLeft: Math.round((eta - now) / 1000) };
}

/**
 * ما يفعله الجهاز وحده كل بضع ثوانٍ -- لطلباته هو فقط:
 *   رنّةُ تذكيرٍ واحدة بعد remind_min من «جاهز» إن لم يُستلم،
 *   وإقفالٌ بعد close_min.
 * يرجع الأفعال المطلوبة، والمنادي ينفّذها (يُختبر بلا شبكة).
 */
export function pagerDueAutoActions(rows: PagerOrder[], now = Date.now(), s: PagerSettings = config.settings, own: (id: number) => boolean = isOwnPagerOrder, done = autoDone): { id: number; action: 'ring' | 'collected' }[] {
  const out: { id: number; action: 'ring' | 'collected' }[] = [];
  for (const o of rows) {
    if (!o.readyAt || !own(o.id)) continue;
    const since = now - o.readyAt.getTime();
    if (s.close_min > 0 && since >= s.close_min * 60_000 && !done.has(o.id + ':c')) {
      out.push({ id: o.id, action: 'collected' });
    } else if (s.remind_min > 0 && o.ringCount === 0 && since >= s.remind_min * 60_000 && !done.has(o.id + ':r')) {
      out.push({ id: o.id, action: 'ring' });
    }
  }
  return out;
}
const autoDone = new Set<string>();
export function markAutoDone(id: number, action: 'ring' | 'collected') {
  autoDone.add(id + (action === 'ring' ? ':r' : ':c'));
}
