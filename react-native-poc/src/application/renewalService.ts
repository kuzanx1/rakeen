import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { getItem, setItem, removeItem } from '../infrastructure/mmkvStorage';
import { Renewal, Subscription, riyadhDayKey } from '../domain/renewal';

/**
 * حالة التجديد كما يقولها الخادم، ومتى تُعرض البطاقة.
 *
 * ولا استطلاع دوريّ هنا (قاعدة المالك: event-driven، no polling): نفس
 * لحظات فحص الإيقاف هي لحظات الفحص -- أول تحميل، ورجوع التطبيق للواجهة،
 * وعودة الشبكة. فإن لم يتغيّر شيء لم يُنادَ الخادم أصلاً.
 */

const CARD_DAY_KEY = 'rakeen_renewal_card_day';
const STRIP_DAY_KEY = 'rakeen_renewal_strip_day';

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
let cardDay: string | null = null;
/** قراءةٌ واحدةٌ للمفتاح مهما تعدّد من ينتظرها. */
let cardDayLoad: Promise<void> | null = null;
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

/**
 * «ذكّرني بكرة» واليوم الواحد: نفس المفتاح، تاريخ الرياض.
 *
 * وتُنتظر قبل أي قرارٍ بعرض البطاقة: القراءةُ من التخزين غيرُ فوريّة،
 * ولو سبقتها حالةُ التجديد لظهرت البطاقةُ مرّةً ثانيةً في يومٍ عُرضت فيه.
 */
export function loadCardDay(): Promise<void> {
  if (!cardDayLoad) {
    cardDayLoad = getItem(CARD_DAY_KEY)
      .then(v => {
        cardDay = v;
      })
      .catch(() => {
        cardDay = null;
      });
  }
  return cardDayLoad;
}

export function cardSeenToday(now: number): boolean {
  return cardDay === riyadhDayKey(now);
}

/**
 * «أغلقتُ الشريط اليوم» -- في التخزين لا في حالة المكوّن.
 *
 * فتبديلُ التبويب في هذا التطبيق يفكّ الشاشة ويعيد تركيبها
 * (project_rn_pos_perf_findings)، فحالةٌ محلّيةٌ تعني شريطاً يرجع مع كل
 * رجوعٍ إلى «الرئيسية» -- وهذا هو الإزعاج بعينه.
 */
let stripDay: string | null = null;
let stripDayLoad: Promise<void> | null = null;

export function loadStripDay(): Promise<void> {
  if (!stripDayLoad) {
    stripDayLoad = getItem(STRIP_DAY_KEY)
      .then(v => {
        stripDay = v;
      })
      .catch(() => {
        stripDay = null;
      });
  }
  return stripDayLoad;
}

export function stripClosedToday(now: number): boolean {
  return stripDay === riyadhDayKey(now);
}

/**
 * يمسح «عُرضت اليوم» للبطاقة والشريط معاً، ويعيد القراءة من الخادم.
 *
 * موجودٌ لأجل التجربة: الحالاتُ السبع تُمشى واحدةً واحدةً على جهازٍ
 * حقيقيّ، والبطاقةُ تظهر مرّةً في اليوم -- فبلا هذا لا تُرى إلا أولُ
 * حالةٍ ثم يسكت كلُّ شيء إلى الغد. وهو في «التشخيص» لا في شاشةٍ يمرّ
 * عليها كاشير.
 */
export async function resetRenewalSeen(): Promise<void> {
  cardDay = null;
  stripDay = null;
  cardDayLoad = Promise.resolve();
  stripDayLoad = Promise.resolve();
  await removeItem(CARD_DAY_KEY).catch(() => {});
  await removeItem(STRIP_DAY_KEY).catch(() => {});
  await refreshRenewal();
  /**
   * نسخةٌ جديدةٌ من الكائن، لا الكائنُ نفسُه.
   *
   * فالبطاقةُ والشريطُ يقرآن «عُرض اليوم» في أثرٍ مفتاحُه هذا الكائن.
   * والحالةُ لم تتغيّر -- ستةُ أيامٍ تبقى ستةً -- فيردّ refreshRenewal
   * المرجعَ نفسَه، فلا يُعيد React تشغيلَ الأثر، فلا يُقرأ المفتاحُ
   * الممسوح، فلا يعود شيءٌ إلى الشاشة. وهذا ما رآه المالك على السُنمي:
   * النقطةُ وحدها -- لأنها لا تعتمد على أثرٍ أصلاً.
   */
  current = { ...current, renewal: current.renewal ? { ...current.renewal } : null };
  emit();
}

export async function markStripClosed(now: number): Promise<void> {
  stripDay = riyadhDayKey(now);
  await setItem(STRIP_DAY_KEY, stripDay).catch(() => {});
}

export async function markCardSeen(now: number): Promise<void> {
  cardDay = riyadhDayKey(now);
  await setItem(CARD_DAY_KEY, cardDay).catch(() => {});
}
