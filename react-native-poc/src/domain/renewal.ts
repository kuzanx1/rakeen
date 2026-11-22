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

/** يملأ {n} بعد الترجمة، فالرقم واحد في اللغتين. */
export function fillDays(text: string, days: number): string {
  return text.replace('{n}', String(days));
}

/** مفتاح «مرّة في اليوم»: تاريخ الرياض، لا يوم المتصفّح. */
export function riyadhDayKey(now: number): string {
  return new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
}
