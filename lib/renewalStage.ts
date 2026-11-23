/**
 * متى يُذكَّر الكاشير بتجديد الاشتراك، وبأيّ مرحلة.
 *
 * منفصلةٌ عن المسار (app/api/pos/account-status) لأنها القاعدةُ نفسُها
 * التي يبني عليها العميلان ما يعرضانه، ولأنّ قاعدةَ تاريخٍ بلا I/O
 * تُفحص بالأرقام لا بالنظر. والمقابلُ عند العميل:
 * react-native-poc/src/domain/renewal.ts و rkRenewal* في rakeen-pos.js.
 *
 * والحسابُ بأيّامِ التقويم لا بالساعات، وهذا مقصود: «باقي ٦ أيام» عند
 * صاحب المطعم تعني ستّةَ تواريخَ لا ١٤٤ ساعة. وحسابُ الساعات كان يُخطئ
 * في الطرفين معاً -- يُسقط اليومَ السادس من النافذة أصلاً، ويقول «٣»
 * لدفعةٍ تستحقّ بعد يومين -- لأنّ الفرقَ من ظهر اليوم إلى آخر يومِ
 * الاستحقاق كسرٌ يُجبر إلى أعلى. وبأيّام التقويم لا يتغيّر الرقمُ بين
 * صباحِ اليوم ومسائه: الكاشير يرى «٦» طولَ اليوم ثم «٥» في الذي يليه.
 */

const DAY = 86_400_000;
/** الرياض +٣ ثابتةً، بلا توقيتٍ صيفيّ. */
const RIYADH = 3 * 3_600_000;
/** اختيارُ المالك: الكاشير يدخل عند ستة أيام، واللوحة عند سبعة. */
export const NOTICE_DAYS = 6;
/** نفس المهلة التي تعدّها اللوحة (BillingNotice.tsx GRACE_DAYS). */
export const GRACE_DAYS = 7;

export type RenewalStage = "upcoming" | "grace" | "expired" | "rejected";
export type Renewal = { stage: RenewalStage; days: number };
export type OpenPayment = { due_date: string; status: string };

/** رقمُ اليومِ بتقويم الرياض، لحظةً ما. */
function riyadhDay(ms: number): number {
  return Math.floor((ms + RIYADH) / DAY);
}

/** كم تاريخاً بين اليوم وتاريخ الاستحقاق: موجبٌ قبله، سالبٌ بعده، صفرٌ اليوم. */
export function daysUntil(isoDate: string, now: number): number {
  // ظهرُ يومِ الاستحقاق: نقطةٌ لا يزحزحها فرقُ منطقةٍ ولا تقريبُ تحليل.
  return riyadhDay(Date.parse(`${isoDate}T12:00:00+03:00`)) - riyadhDay(now);
}

/**
 * الشيءُ الواحدُ الذي يستحقّ أن يُقال للكاشير، أو null للسكوت.
 *
 * والسكوتُ هو الحالةُ الشائعةُ والافتراضُ الصحيح: منشأةٌ مسدِّدة، أو
 * ما زالت داخل مدّتها، أو ننتظر مراجعةَ إيصالٍ وصلنا منها -- لا تذكيرَ
 * لها أصلاً. والإيصالُ تحت المراجعة ("submitted") يُحسب منتهياً هنا:
 * صاحبُ المطعم فعل ما عليه، وملاحقتُه ونحن نراجع هي ما يحوّل التذكير
 * إلى إزعاج.
 */
export function pickRenewal(payments: OpenPayment[], now: number): Renewal | null {
  const open = [...payments].sort((a, b) => a.due_date.localeCompare(b.due_date));

  // الإيصالُ المرفوض أوّلاً: صاحبُ المطعم يحسب أنه سدّد، ولا شيءَ
  // غيرُ هذا يخبره بخلافه.
  const rejected = open.find((p) => p.status === "rejected");
  if (rejected) {
    return { stage: "rejected", days: Math.max(0, daysUntil(rejected.due_date, now) + GRACE_DAYS) };
  }

  const due = open.find((p) => p.status === "due" && daysUntil(p.due_date, now) <= NOTICE_DAYS);
  if (!due) return null;

  const d = daysUntil(due.due_date, now);
  if (d >= 0) return { stage: "upcoming", days: d };
  if (d + GRACE_DAYS >= 0) return { stage: "grace", days: d + GRACE_DAYS };
  return { stage: "expired", days: 0 };
}

/**
 * عدّادُ الاشتراك الدائم في «المزيد» -- لا تذكيرٌ ولا نافذةُ ستّةِ أيام.
 *
 * فالتذكيرُ فوق يسكت أكثرَ الشهر، وهذا مقصود. لكنّ صاحبَ المطعم سأل
 * سؤالاً آخر: «كم باقي؟» -- يريد الرقمَ موجوداً دائماً لا أن يُفاجأ
 * به. فهذا يردّ أقربَ دفعةٍ غيرِ مسدَّدة كما هي: كم تاريخاً باقياً
 * (سالبٌ إن عدّى)، وتاريخَها، وحالَها -- بلا مبلغ.
 *
 * و"أقربُ دفعةٍ مفتوحة" هي الصوابُ حتى لو كانت قديمةً متأخّرة: دَينٌ
 * معلَّقٌ من شهرٍ مضى هو الذي يقف بينه وبين الاستمرار، لا الدفعةُ
 * التالية التي بعده.
 *
 * ويُردّ null حين لا يكون في يدنا تاريخٌ نقوله: لا عقدَ موقَّعاً، أو
 * كلُّ الدفعات مسدَّدةٌ ولا جدولَ بعدها. ولا يُخترع رقمٌ في هذي الحال.
 */
export type Subscription = { days: number; date: string; status: string };

export function pickSubscription(payments: OpenPayment[], now: number): Subscription | null {
  /**
   * والمسدَّدُ يُستثنى هنا كذلك، لا في السيكوال وحدَه.
   *
   * فالمسارُ لا يسحب الصفوفَ المسدَّدة أصلاً (`.neq("status","paid")`)،
   * لكنّ `pickRenewal` فوق يشترط `status === "due"` بنفسه فلا يُطلِع
   * تذكيراً لدفعةٍ مؤكَّدةٍ ولو وصلته، وهذا كان لا يشترط شيئاً: صفٌّ
   * مسدَّدٌ عدّى موعدَه يُطلِع «3 أيام تأخير» بالأحمر لمن سدَّد فعلاً.
   * فحمايةٌ واحدةٌ في سطرِ سيكوالٍ يحذفه أيُّ تعديلٍ غيرُ كافية.
   */
  const open = payments.filter((p) => p.status !== "paid");
  const next = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (!next) return null;
  return { days: daysUntil(next.due_date, now), date: next.due_date, status: next.status };
}

/**
 * موعدُ التجديدِ المستنتَجُ من العقد، حين لا تبقى دفعةٌ مفتوحة.
 *
 * فالدفعاتُ تُضاف يدوياً من /admin، وجدولُ العقد قد يكون سطراً واحداً --
 * وهذي حالُ السنويِّ المسدِّدِ مقدَّماً بالذات. فلحظةَ تُؤكَّد دفعتُه
 * يصير في قاعدةِ البيانات صفرُ صفوفٍ مفتوحة، فيختفي العدّادُ كلُّه عن
 * أكثرِ الناسِ استحقاقاً له. وطلبُ المالك كان «ثابت دايم».
 *
 * ولا تاريخَ انتهاءٍ للاشتراكِ في الجدولِ أصلاً: `subscription_contracts`
 * فيه `billing_period` و`start_date` ولا `end_date`، و`expires_at` هو
 * انتهاءُ رابطِ العرضِ لا الاشتراك. فالدورةُ تُحسب: من آخرِ دفعةٍ
 * معروفةٍ (أو من بدايةِ العقدِ إن لم تكن) دورةً دورةً حتى يصير التاريخُ
 * اليومَ أو بعدَه.
 *
 * وحالُها `projected` لا `due`: ليست ديناً مستحقّاً، إنما متى تدور
 * الدورةُ القادمة. فالتذكيرُ لا يُبنى عليها أبداً -- لا إيصالَ يُرفع
 * لدفعةٍ غيرِ موجودة -- والعدّادُ وحدَه يقرؤها.
 */
export type CycleContract = { start_date: string; billing_period: string };

/** آخرُ يومٍ في شهرٍ ميلاديّ. */
function monthDays(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** دورةٌ واحدةٌ إلى الأمام، ويومُ الشهرِ يُثبَّت على آخرِه إن قَصُر (31 ← 28). */
export function addCycle(isoDate: string, period: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const d = Number(m[3]);
  if (period === "annual") y += 1;
  else if (period === "monthly") {
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  } else return null;
  const day = Math.min(d, monthDays(y, mo));
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function projectSubscription(
  contract: CycleContract | null,
  lastDueDate: string | null,
  now: number,
): Subscription | null {
  if (!contract) return null;
  let date = lastDueDate || contract.start_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // دورةً دورةً حتى اليومَ أو بعدَه. والحدُّ حمايةٌ من عقدٍ قديمٍ بتاريخٍ غريب.
  for (let i = 0; i < 600; i++) {
    const next = addCycle(date, contract.billing_period);
    if (!next) return null;
    date = next;
    if (daysUntil(date, now) >= 0) return { days: daysUntil(date, now), date, status: "projected" };
  }
  return null;
}
