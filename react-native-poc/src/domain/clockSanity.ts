/**
 * «Network request failed» على السنمي كان سببه تاريخ الجهاز (2026-11-08):
 * الجهاز ينطفئ فترة فيرجع تاريخه لسنواتٍ قبل، فكل شهادة أمان تبان «لم
 * تبدأ صلاحيتها بعد» ويفشل كل اتصالٍ آمن -- والرسالة لا تقول ذلك أبداً.
 *
 * ولا نقدر نسأل الخادم عن الوقت (الاتصال نفسه هو اللي يفشل). لكن نعرف
 * حدّاً أدنى أكيداً: هذا التطبيق نفسه بُني بعد هذا التاريخ. فجهازٌ ساعته
 * قبله ساعته غلط قطعاً. (حدٌّ أدنى لا أعلى: ساعةٌ متقدّمة لا نكشفها.)
 */
export const APP_BUILT_AT = Date.UTC(2026, 10, 13); // 2026-11-13 -- حدّثه مع كل نسخة

export const WRONG_CLOCK_MESSAGE =
  'تاريخ الجهاز غلط، فما يقدر يتصل بأمان. عدّل التاريخ والوقت من إعدادات الجهاز (فعّل «التاريخ والوقت التلقائي») وجرّب مرة ثانية.';

export function deviceClockIsBehind(now: number = Date.now()): boolean {
  return now < APP_BUILT_AT - 24 * 60 * 60 * 1000;
}

/** خطأ شبكة؟ لو الساعة متأخرة فهي السبب -- قلها بوضوح بدل رسالة المكتبة. */
export function explainNetworkError(message: string | undefined, fallback: string, now: number = Date.now()): string {
  if (deviceClockIsBehind(now)) return WRONG_CLOCK_MESSAGE;
  return message || fallback;
}
