import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { Renewal, Subscription } from '../domain/renewal';

/**
 * حالة التجديد كما يقولها الخادم، ومتى تُعرض البطاقة.
 *
 * ولا استطلاع دوريّ هنا (قاعدة المالك: event-driven، no polling): نفس
 * لحظات فحص الإيقاف هي لحظات الفحص -- أول تحميل، ورجوع التطبيق للواجهة،
 * وعودة الشبكة. فإن لم يتغيّر شيء لم يُنادَ الخادم أصلاً.
 */


/**
 * جوابان من قراءةٍ واحدة.
 *
 * `renewal` هو التذكيرُ المتدرّج: يسكت أكثرَ الشهر، ويظهر في آخر ستّةِ
 * أيام. و`subscription` هو عدّادُ «المزيد»: كم باقٍ، دائماً، بلا
 * نافذةٍ ولا مرحلة. والخادمُ يحسبهما من نفس صفوفِ الدفعات
 * (lib/renewalStage.ts)، فلا يتناقضان على الشاشة.
 */
export interface RenewalState {
  renewal: Renewal | null;
  subscription: Subscription | null;
}

const EMPTY: RenewalState = { renewal: null, subscription: null };
let current: RenewalState = EMPTY;

/**
 * «شافها وسكّرها» -- لهذه الجلسة فقط، لا ليومٍ كامل.
 *
 * قرارُ المالك (٢٣ نوفمبر): «لا يمديه يقفلها يعني إذا شافها فقط، لكن
 * مو إنه يخلّيها ما تطلع له». فكان الإغلاقُ يُكتب في التخزين بمفتاح
 * يومٍ (تقويم الرياض)، فضغطةٌ واحدةٌ تُسكت التذكيرَ إلى الغد -- وهذا
 * بالضبط ما لا يريده. والآن متغيّرٌ في الذاكرة: يُمسح مع كلِّ عودةٍ
 * للتطبيق من الخلفيّة ومع كلِّ تشغيل، ولا يختفي التذكيرُ نهائيّاً إلا
 * لمّا يتأكّد السدادُ من لوحة الإدارة فيسكت الخادمُ عنه.
 *
 * وهو في الوحدة لا في المكوّن عمداً: تبديلُ التبويب يفكّ الشاشة
 * ويعيد تركيبها (project_rn_pos_perf_findings)، فحالةٌ محلّيةٌ تعني
 * شريطاً يرجع مع كلِّ رجوعٍ إلى «الرئيسية» -- وذاك إزعاجٌ بلا معنى،
 * فهو لم يغادر التطبيقَ أصلاً.
 */
export interface RenewalOff {
  card: boolean;
  strip: boolean;
}
let off: RenewalOff = { card: false, strip: false };
const offListeners = new Set<(o: RenewalOff) => void>();

export function getRenewalOff(): RenewalOff {
  return off;
}

export function subscribeRenewalOff(fn: (o: RenewalOff) => void): () => void {
  offListeners.add(fn);
  return () => {
    offListeners.delete(fn);
  };
}

/** كائنٌ جديدٌ في كلِّ مرّة: React يقارن بالمرجع. */
function setOff(next: RenewalOff) {
  off = next;
  offListeners.forEach(fn => fn(off));
}

export function dismissRenewalCard(): void {
  setOff({ ...off, card: true });
}

export function dismissRenewalStrip(): void {
  setOff({ ...off, strip: true });
}

/** جلسةٌ جديدة: التذكيرُ يرجع. */
export function clearRenewalOff(): void {
  setOff({ card: false, strip: false });
}
/** طلبٌ واحدٌ في الطريق: الشاشةُ وشريطُ التبويبات كلاهما ينادي refresh. */
let inFlight: Promise<void> | null = null;
const listeners = new Set<(s: RenewalState) => void>();

function emit() {
  listeners.forEach(fn => fn(current));
}

export function getRenewalState(): RenewalState {
  return current;
}

export function subscribeRenewal(fn: (s: RenewalState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * يقرأ الحالة من نفس مسار فحص الإيقاف.
 *
 * وسكوتُ الخادم (شبكة ساقطة، 401، ردّ قديم بلا الحقل) يُبقي ما عندنا
 * كما هو ولا يُطلع تذكيراً من العدم: تذكيرٌ خاطئ على كاشير أسوأ من لا
 * تذكير.
 */
export function refreshRenewal(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/account-status`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;
    const out = await res.json();
    if (!('renewal' in out)) return;
    const renewal: Renewal | null =
      out.renewal && typeof out.renewal.stage === 'string' && typeof out.renewal.days === 'number'
        ? { stage: out.renewal.stage, days: out.renewal.days }
        : null;
    // نسخةٌ أقدمُ من الخادم لا ترسل العدّاد أصلاً: يُقرأ وحدَه، فغيابُه
    // يُخفي بطاقةَ «المزيد» ولا يمسّ التذكير.
    const s = out.subscription;
    const subscription: Subscription | null =
      s && typeof s.days === 'number' && typeof s.date === 'string'
        ? { days: s.days, date: s.date, status: typeof s.status === 'string' ? s.status : 'due' }
        : null;
    const next: RenewalState = { renewal, subscription };
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    current = next;
    if (changed) emit();
  } catch {
    /* بلا نت: يبقى ما عندنا */
  }
}

export async function resetRenewalSeen(): Promise<void> {
  clearRenewalOff();
  await refreshRenewal();
}
