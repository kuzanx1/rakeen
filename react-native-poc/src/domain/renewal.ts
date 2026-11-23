/**
 * تذكير تجديد الاشتراك على الكاشير.
 *
 * الخادم يحسب المرحلة وكم باقي (app/api/pos/account-status/route.ts)،
 * وهنا يُقرَّر وحده: كم يرتفع الصوت، وأي نصّ يُقال. بلا أي I/O عشان
 * تنختبر، ونفس القواعد حرفياً في كاشير الويب (rakeen-pos.js rkRenewal*).
 *
 * وما فيه مبلغ ولا رقم عقد ولا آيبان في أي نصّ هنا: الكاشير يقف قدّام
 * الزبائن والموظفين، وسعر اشتراك صاحب المطعم شأنه هو.
 */

export type RenewalStage = 'upcoming' | 'grace' | 'expired' | 'rejected';
export interface Renewal {
  stage: RenewalStage;
  days: number;
}

/**
 * هادئ ستة أيام، ثم يرتفع في آخر يومين.
 *
 * والتدرّج هو الفكرة كلّها: شريطٌ يصرخ ستة أيام كاملة يصير جزءاً من
 * الشاشة ولا يُقرأ -- فيُحجز الشريط للحظة التي يعني فيها شيئاً.
 */
export function renewalLoud(r: Renewal): boolean {
  return r.stage !== 'upcoming' || r.days <= 2;
}

/** مفاتيح النصّ عربيّة، والإنجليزي يُلتقط من جدول i18n (ui/i18n.tsx). */
export function renewalTitleKey(r: Renewal): string {
  switch (r.stage) {
    case 'rejected':
      return 'ما قبلنا إيصال التحويل — ارفع إيصال جديد';
    case 'grace':
      return 'تأخّر تجديد اشتراكك';
    case 'expired':
      return 'انتهت مهلة تجديد اشتراكك';
    case 'upcoming':
      if (r.days <= 0) return 'اشتراكك يُجدَّد اليوم';
      if (r.days === 1) return 'باقي يوم واحد على تجديد اشتراكك';
      if (r.days === 2) return 'باقي يومين على تجديد اشتراكك';
      return 'باقي {n} أيام على تجديد اشتراكك';
  }
}

/**
 * النصّ الصغير تحت العنوان.
 *
 * و`canSteer` هي قاعدة المتاجر نفسها (platform/storeRules.ts): نسخة
 * آبل ونسخة جوجل بلاي لا توجّه أحداً ليدفع خارج المتجر، فلا تذكر لوحة
 * ولا إيصالاً ولا زرّاً -- تقول الحال وتسكت.
 */
export function renewalBodyKey(r: Renewal, canSteer: boolean): string {
  if (!canSteer) return 'راجع صاحب المحل.';
  switch (r.stage) {
    case 'rejected':
      return 'ارفع إيصال التحويل مرّة ثانية من لوحة التحكم، أو كلّمنا لو فيه لبس.';
    case 'grace':
      return 'المهلة شغّالة الحين. ارفع إيصال التحويل من لوحة التحكم عشان ما يتوقف الكاشير.';
    /**
     * وهنا وحدها يُقال «معرّض للإيقاف».
     *
     * فالإيقاف بيدنا من اللوحة لا بتوقيتٍ يمشي وحده: الكاشير يشتغل بعد
     * انتهاء المهلة كما كان، ولا يقف حتى نوقفه. فقول «توقفت الخدمة»
     * كذبٌ يراه صاحب المطعم بعينه، وقول «عشان ما تنقطع» بعد انقطاع
     * المهلة لا معنى له -- والصادقُ أنّ القرار صار قرارنا في أي لحظة.
     */
    case 'expired':
      return 'انتهت المهلة، والكاشير معرّض للإيقاف في أي وقت. ارفع إيصال التحويل من لوحة التحكم.';
    case 'upcoming':
      return r.days <= 2
        ? 'ارفع إيصال التحويل من لوحة التحكم اليوم، عشان ما تنقطع الخدمة.'
        : 'ادخل لوحة التحكم وارفع إيصال التحويل، عشان الخدمة تستمر بدون انقطاع.';
  }
}

/**
 * علامةُ اتّجاهٍ قبل سطرٍ يبدأ برقم، حين يكون السطرُ إنجليزيّاً.
 *
 * فالقشرةُ تبقى من اليمين إلى اليسار في اللغتين (قلبُ I18nManager يحتاج
 * إعادةَ تشغيلٍ كاملة، انظر ui/i18n.tsx)، و«5 days» في قالبٍ عربيِّ
 * الاتّجاه ينقلب فيُقرأ «days 5»: الرقمُ مقطعٌ وحدَه والكلمةُ مقطعٌ،
 * فيُرتَّبان من اليمين. وهذا رأيناه في الصورة لا في الكود.
 */
export function dirMark(text: string): string {
  return /[A-Za-z]/.test(text) ? '\u200E' + text : text;
}

/** يملأ {n} بعد الترجمة، فالرقم واحد في اللغتين. */
export function fillDays(text: string, days: number): string {
  return text.replace('{n}', String(days));
}

/** مفتاح «مرّة في اليوم»: تاريخ الرياض، لا يوم المتصفّح. */
export function riyadhDayKey(now: number): string {
  return new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * عدّادُ الاشتراك في «المزيد» -- دائمٌ، لا يسكت ولا يتدرّج.
 *
 * التذكيرُ فوق جوابٌ عن «متى أتحرّك؟»، وهذا جوابٌ عن «كم باقٍ؟».
 * وسأله المالكُ لأنّ السكوتَ -- وهو الصواب للتذكير -- يعني أنّ الرقمَ
 * غيرُ موجودٍ في أيّ مكانٍ يُنظر إليه، فيُفاجأ به أولَ ما يرتفع الصوت.
 *
 * ولا مبلغَ هنا كذلك: نفسُ الحدِّ الذي يقف عنده التذكير.
 */
export interface Subscription {
  /** كم تاريخاً إلى أقربِ دفعةٍ مفتوحة: سالبٌ إن عدّى موعدُها. */
  days: number;
  /** YYYY-MM-DD -- يومُ الاستحقاق كما هو، بلا مبلغٍ ولا رقمِ عقد. */
  date: string;
  status: string;
}

export type SubscriptionTone = 'ok' | 'soon' | 'late' | 'review';

/**
 * لونُ الحال، بنفس حدودِ التذكير لا بحدودٍ جديدة.
 *
 * و«تحت المراجعة» تسبق كلَّ شيء: صاحبُ المطعم رفع إيصالَه، فعدّادٌ
 * أحمرُ يقول «متأخّر» وهو ينتظرنا ظلمٌ له -- ونفسُ القاعدة التي تُسكت
 * التذكير في هذي الحال (pickRenewal).
 */
export function subscriptionTone(s: Subscription): SubscriptionTone {
  if (s.status === 'rejected') return 'late';
  if (s.status === 'submitted') return 'review';
  if (s.days < 0) return 'late';
  if (s.days <= 6) return 'soon';
  return 'ok';
}

/** الكلمةُ في الشارة. */
export function subscriptionPillKey(s: Subscription): string {
  switch (subscriptionTone(s)) {
    case 'late':
      return s.status === 'rejected' ? 'ارفع إيصال جديد' : 'متأخّر';
    case 'review':
      return 'تحت المراجعة';
    case 'soon':
      return 'قريب';
    case 'ok':
      return 'ساري';
  }
}

/**
 * الرقمُ الكبير -- بصيغةٍ عربيّةٍ صحيحةٍ لا «1 يوم» ولا «5 يوم».
 *
 * ومفتاحٌ لكلِّ صيغةٍ لا قالبٌ واحد: المثنّى في العربيّة كلمةٌ لا رقم،
 * والقلّةُ من ثلاثةٍ إلى عشرةٍ جمعٌ («5 أيام») والكثرةُ من أحدَ عشرَ
 * مفردٌ («15 يوم»)، و«One day» في الإنجليزيّة ليست «1 days».
 *
 * وأوّلُ بناءٍ وقف عند المثنّى فكان يقول «5 يوم» و«3 يوم تأخير» --
 * ويناقض شريطَ التذكير على نفس الشاشة، فهو يقول «باقي 5 أيام».
 * والجدولُ يملك التسعَ كلَّها فلا يبقى سطرٌ نصفُه مترجَم.
 */
export function subscriptionBigKey(s: Subscription): string {
  const d = s.days;
  if (d === 0) return 'اليوم';
  const n = Math.abs(d);
  if (d > 0) return n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? '{n} أيام' : '{n} يوم';
  return n === 1 ? 'يوم تأخير' : n === 2 ? 'يومان تأخير' : n <= 10 ? '{n} أيام تأخير' : '{n} يوم تأخير';
}

/** السطرُ الصغير تحته: متى، لا كم. */
export function subscriptionWhenKey(s: Subscription): string {
  if (s.days === 0) return 'موعد التجديد';
  return s.days < 0 ? 'كان يوم التجديد' : 'يُجدَّد';
}

/** التاريخ كما يُقرأ: ١٥/١٢ من YYYY-MM-DD، بلا Intl وبلا Date. */
export function subscriptionDayMonth(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}/${m[2]}` : date;
}
