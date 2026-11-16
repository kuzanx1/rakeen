import uuid from 'react-native-uuid';
import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { currentOrderSeries, setDayCutoffHour } from './orderSeries';

/**
 * أرقام طلبات محجوزة لهذا الجهاز.
 *
 * كانت الفاتورة تنتظر complete_pos_order (لين ٣٫٥ ثانية) لتعرف رقم الطلب.
 * الجهاز يحجز من الخادم دفعة صغيرة (٦) من عدّاد منشأته، كل رقم مربوط
 * بـ uuid ولّده هو. عند البيع ياخذ واحداً: الـ uuid يصير client_order_uuid
 * للطلب، ورقم المنشأة (no) ينطبع فوراً، والرقم الداخلي (id) يُربط به
 * البيجر والطاولة. ولما يوصل الطلب، الـ trigger يعطيه نفس الاثنين
 * (supabase/migrations/20261114180000_business_order_numbers.sql).
 *
 * لكل منشأة عدّادها: ١، ٢، ٣… فما يتكرر بين جهازين ولا يقفز بمبيعات غيرها.
 * ولو ما فيه حجز (الخادم قديم، أو خلص المخزون بلا نت) يرجع البيع للمسار
 * القديم كما هو -- ما فيه حالة تتعطّل فيها الفاتورة.
 *
 * ورقم الطلب يرجع ١ مع بداية كل يوم عمل (لكل فرع عدّاده --
 * 20261115120000_shift_order_numbers.sql): كل رقم محجوز يحمل يوم عمله
 * (s = YYYYMMDD)، والجهاز يرمي أي رقم من يوم غير اليوم -- وإلا انطبع #43
 * من أمس وسط أرقام اليوم ١، ٢، ٣. اليوم يقفل بساعة المحل (c)، فينحسب
 * بلا نت (orderSeries.ts).
 *
 * ثم صار يرجع ١ مع كل فتح وردية (20261116140000): السلسلة = 10000000000 +
 * رقم الوردية، وصاحب المحل يختار أول رقم. الجهاز يحفظ وردية مخزونه (sh)
 * ولو تغيّرت الوردية يرمي المخزون ويحجز من جديد (syncOrderPoolShift)،
 * وأي رقم من سلسلة أقدم من آخر سلسلة شافها (ps) ينرمى.
 *
 * بلا مؤقّت: يُعبّأ عند الدخول وبعد كل بيع، لا غير.
 * الويب: rkOrderNumberPool في public/pos/rakeen-pos.js -- نفس الأرقام.
 */

const KEY = 'rk_order_number_pool_v2';
/** دفعة صغيرة: الفرق بين أرقام جهازين بالفرع ما يكبر. */
const TARGET = 6;
const REFILL_BELOW = 3;
/** الخادم يحذف غير المستخدم بعد ٤٠ يوم؛ الجهاز يتركه قبلها بعشرة. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** دالة الحجز ما نزلت في القاعدة بعد؟ لا يُعاد السؤال قبل ساعة. */
const UNSUPPORTED_BACKOFF_MS = 60 * 60 * 1000;

export interface ReservedOrderNumber {
  uuid: string;
  /** الرقم الداخلي orders.id -- للربط فقط، ما ينطبع. */
  id: number;
  /** رقم الطلب في المنشأة: هذا اللي ينطبع ويُعرض. */
  no: number;
}

interface Pool {
  branchId: number;
  /** s: يوم العمل اللي ينتمي له الرقم (غائب = خادم قبل التصفير، صالح دائماً). */
  items: { u: string; id: number; no: number; at: number; s?: number }[];
  /** c: ساعة إقفال يوم العمل من الخادم (r_day_cutoff). */
  c?: number;
  /** sh: الوردية اللي انحجز لها المخزون. */
  sh?: number | null;
  /** ps: أحدث سلسلة رجعت من الخادم (الأكبر = الأحدث). */
  ps?: number;
}

/** سلاسل الورديات تبدأ من هنا؛ اللي تحتها سلاسل أيام قديمة (YYYYMMDD). */
const SHIFT_SERIES_BASE = 10000000000;

function stillValid(p: Pool, s: number | undefined): boolean {
  if (s == null) return true;
  if (p.ps != null && s < p.ps) return false;
  // سلسلة يوم (قبل ترحيل الورديات): تنرمى لو اليوم تغيّر.
  if (s < SHIFT_SERIES_BASE) {
    const cur = currentOrderSeries();
    return cur == null || s === cur;
  }
  return true;
}


let mem: Pool | null = null;
let loaded = false;
/** كل قراءة/كتابة تمرّ بالدور: بيعان متتاليان ما ياخذون نفس الرقم. */
let chain: Promise<unknown> = Promise.resolve();
let refilling: Promise<void> | null = null;
let unsupportedUntil = 0;
/** المنشأة مفعّل لها رقم خاص (آخر حجز رجّع أرقام). محفوظ عبر الإعادة. */
const ON_KEY = 'rk_order_numbers_on';
let numbersOn: boolean | null = null;

async function setNumbersOn(v: boolean): Promise<void> {
  numbersOn = v;
  try {
    await setItem(ON_KEY, v ? '1' : '0');
  } catch {
    // يبقى بالذاكرة.
  }
}

export async function isNumbersOn(): Promise<boolean> {
  if (numbersOn == null) {
    try {
      numbersOn = (await getItem(ON_KEY)) === '1';
    } catch {
      numbersOn = false;
    }
  }
  return numbersOn;
}

/**
 * رقم المنشأة لطلب عُرف رقمه الداخلي فقط (طلب ما كان له حجز: طاولة، أو
 * المخزون فاضي). سؤال واحد سريع، وبس للمنشأة المفعّلة -- غيرها ما لها
 * رقم خاص فما يتأخّر بيعها. فشل أو تأخّر؟ null، ويُعرض الرقم الداخلي.
 */
export async function orderNoFor(orderId: number | null | undefined): Promise<number | null> {
  if (orderId == null || !(orderId > 0)) return null;
  if (!(await isNumbersOn())) return null;
  try {
    const q = supabase.from('orders').select('order_no').eq('id', orderId).maybeSingle();
    const timeout = new Promise<null>(r => setTimeout(() => r(null), 2000));
    const res = (await Promise.race([q, timeout])) as { data: { order_no: number | null } | null } | null;
    const no = res?.data?.order_no;
    return no != null && Number(no) > 0 ? Number(no) : null;
  } catch {
    return null;
  }
}

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function load(branchId: number): Promise<Pool> {
  if (!loaded) {
    loaded = true;
    try {
      const raw = await getItem(KEY);
      mem = raw ? (JSON.parse(raw) as Pool) : null;
    } catch {
      mem = null;
    }
  }
  const now = Date.now();
  if (!mem || mem.branchId !== branchId) mem = { branchId, items: [] };
  setDayCutoffHour(mem.c);
  mem.items = mem.items.filter(
    i =>
      now - i.at < MAX_AGE_MS &&
      Number.isFinite(i.id) && i.id > 0 &&
      Number.isFinite(i.no) && i.no > 0 &&
      stillValid(mem!, i.s),
  );
  return mem;
}

async function save(p: Pool): Promise<void> {
  mem = p;
  try {
    await setItem(KEY, JSON.stringify(p));
  } catch {
    // يبقى بالذاكرة.
  }
}

/** ياخذ رقماً محجوزاً، أو null فيرجع البيع للمسار القديم. */
export function takeReservedOrderNumber(branchId: number): Promise<ReservedOrderNumber | null> {
  return serial(async () => {
    const p = await load(branchId);
    const item = p.items.shift();
    await save(p);
    return item ? { uuid: item.u, id: item.id, no: item.no } : null;
  }).finally(() => {
    void refillOrderNumberPool(branchId);
  });
}

/**
 * الوردية المفتوحة تغيّرت (انفتحت جديدة هنا أو من جهاز ثاني)؟ أرقام الوردية
 * السابقة تنرمى ويُحجز من جديد -- فأول فاتورة تطلع #١ (أو الرقم اللي
 * اختاره). نفس الوردية؟ تعبئة عادية بس.
 */
export function syncOrderPoolShift(branchId: number, shiftId: number | null): Promise<void> {
  return serial(async () => {
    const p = await load(branchId);
    if (shiftId != null && p.sh !== shiftId) {
      p.items = [];
      p.sh = shiftId;
      await save(p);
    }
  }).then(() => refillOrderNumberPool(branchId));
}

/** يعبّي المخزون لين TARGET. ما يرمي أبداً. */
export function refillOrderNumberPool(branchId: number): Promise<void> {
  if (refilling) return refilling;
  refilling = (async () => {
    try {
      if (Date.now() < unsupportedUntil) return;
      const have = (await serial(() => load(branchId))).items.length;
      if (have >= REFILL_BELOW) return;
      const uuids = Array.from({ length: TARGET - have }, () => uuid.v4() as string);
      const { data, error } = await supabase.rpc('reserve_order_numbers', { p_branch_id: branchId, p_uuids: uuids });
      if (error) {
        // الدالة ما نزلت بعد (PGRST202 / 42883): انتظر ساعة. غيرها (نت): المرة الجاية.
        if (/PGRST202|42883|could not find the function/i.test(`${error.code} ${error.message}`)) {
          unsupportedUntil = Date.now() + UNSUPPORTED_BACKOFF_MS;
        }
        return;
      }
      const rows = (data || []) as { r_order_no: number; r_order_id: number; r_client_order_uuid: string; r_series?: number | null; r_day_cutoff?: number | null }[];
      if (rows.length === 0) {
        // المنشأة ما تفعّلت (order_number_blocks_enabled): ساعة قبل السؤال مرة ثانية.
        unsupportedUntil = Date.now() + UNSUPPORTED_BACKOFF_MS;
        await setNumbersOn(false);
        return;
      }
      await setNumbersOn(true);
      const asked = new Set(uuids);
      const now = Date.now();
      let p0Cut: number | null = null;
      await serial(async () => {
        const cut = rows.find(r => r.r_day_cutoff != null)?.r_day_cutoff;
        if (cut != null) {
          setDayCutoffHour(Number(cut));
          p0Cut = Number(cut);
        }
        const p = await load(branchId);
        if (p0Cut != null) p.c = p0Cut;
        const known = new Set(p.items.map(i => i.u));
        for (const r of rows) {
          const id = Number(r.r_order_id);
          const no = Number(r.r_order_no);
          const s = r.r_series != null && Number(r.r_series) > 0 ? Number(r.r_series) : undefined;
          if (!asked.has(r.r_client_order_uuid) || known.has(r.r_client_order_uuid) || !(id > 0) || !(no > 0)) continue;
          // سلسلة أحدث من المخزون (انفتحت وردية): القديم كله ينرمى.
          if (s != null && s >= SHIFT_SERIES_BASE && (p.ps == null || s > p.ps)) {
            p.ps = s;
            p.items = p.items.filter(i => i.s === s);
          }
          // من يوم/وردية سابقة (والطلب بالطريق): ما يُحفظ.
          if (!stillValid(p, s)) continue;
          p.items.push({ u: r.r_client_order_uuid, id, no, at: now, s });
        }
        // الأقدم أولاً: الأرقام تطلع بترتيبها على الفواتير.
        p.items.sort((a, b) => a.no - b.no);
        await save(p);
      });
    } catch {
      // بلا نت أو بلا جلسة: المرة الجاية.
    } finally {
      refilling = null;
    }
  })();
  return refilling;
}
