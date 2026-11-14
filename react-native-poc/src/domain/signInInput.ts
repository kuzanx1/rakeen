/**
 * فحص بيانات «تجهيز هذا الجهاز» قبل أن تُرسل، وترجمة رفض الخادم.
 *
 * كان الزر يقبل بريداً ناقصاً (بلا @) أو خانةً فاضية ويرسلها، فيرجع
 * الخادم بـ"Invalid login credentials" بالإنجليزي -- والمالك لا يدري:
 * هل البريد غلط أم كلمة المرور أم النت؟ الآن كل حالة تُسمّى باسمها،
 * وتُعلَّم الخانة نفسها.
 *
 * نفس النصوص في الويب: provCheckInput() / provExplainSignInError()
 * في public/pos/rakeen-pos.js. أيّ تغيير هنا يُنقل هناك.
 */
export type SignInField = 'email' | 'password';

export interface SignInProblem {
  field: SignInField;
  message: string;
}

/** a@b.cc على الأقل: حرف، @، نطاق فيه نقطة. لا أكثر -- الخادم هو الحكم. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkSignInInput(email: string, password: string): SignInProblem | null {
  const e = email.trim();
  if (!e) return { field: 'email', message: 'اكتب بريدك الإلكتروني.' };
  if (!EMAIL_SHAPE.test(e)) {
    return { field: 'email', message: 'البريد ناقص أو غلط. اكتبه كامل، مثل: name@gmail.com' };
  }
  if (!password) return { field: 'password', message: 'اكتب كلمة المرور.' };
  if (password.length < 6) return { field: 'password', message: 'كلمة المرور قصيرة: ٦ أحرف أو أكثر.' };
  return null;
}

/** رفض supabase-js بالإنجليزي ← جملة يفهمها المالك. وغيره يمرّ كما هو. */
export function explainSignInError(message: string): string {
  if (/invalid login credentials|invalid_credentials/i.test(message)) {
    return 'البريد أو كلمة المرور غلط. تأكد منهم وجرّب مرة ثانية.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'بريدك ما تأكّد بعد. افتح رسالة التأكيد اللي وصلتك، وبعدها ارجع هنا.';
  }
  if (/too many|rate limit/i.test(message)) {
    return 'محاولات كثيرة. انتظر دقيقة وجرّب مرة ثانية.';
  }
  return message;
}
