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
  const next = [...payments].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (!next) return null;
  return { days: daysUntil(next.due_date, now), date: next.due_date, status: next.status };
}
