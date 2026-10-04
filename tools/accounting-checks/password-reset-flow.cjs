/* «نسيت كلمة المرور»: الرابط كان href="#" بلا أي كود.
   يفحص: الشاشتان في الصفحة، قراءة رابط الاسترجاع من #hash، ورسائل الأخطاء. */
const fs = require('fs');
const src = fs.readFileSync('public/dashboard/rakeen-dashboard.js', 'utf8');
const markup = fs.readFileSync('app/dashboard/dashboard-markup.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/DashboardPage.tsx', 'utf8');
const home = fs.readFileSync('app/page.tsx', 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}
const cut = (name) => {
  let s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error(name + ' not found in shipped file');
  if (src.slice(s - 6, s) === 'async ') s -= 6;
  return src.slice(s, src.indexOf('\n}', s) + 2);
};

console.log('=== الصفحة ===');
for (const id of ['forgotPasswordLink', 'forgotPanel', 'forgotEmail', 'forgotSubmitBtn', 'forgotBackLink',
  'forgotError', 'forgotDone', 'resetPanel', 'resetPassword', 'resetPassword2', 'resetSubmitBtn', 'resetError'])
  ok('العنصر ' + id + ' موجود', markup.includes('id=\\"' + id + '\\"'));
ok('الرابط ما عاد href="#" بلا معرّف', !markup.includes('href=\\"#\\">نسيت كلمة المرور'));
ok('الطلب بعميلٍ implicit يرجع لـ /dashboard',
  /flowType: "implicit"/.test(page) && /resetPasswordForEmail\(email, \{ redirectTo: window\.location\.origin \+ "\/dashboard" \}\)/.test(page));
ok('الصفحة الرئيسية تحوّل رابط الاسترجاع للوحة', /type=recovery\|error_code=/.test(home) && home.includes("'/dashboard'+h"));

console.log('\n=== قراءة الرابط ===');
async function take(hash, setSessionResult) {
  let replaced = null, setArgs = null;
  const window = {
    location: { hash, pathname: '/dashboard', search: '' },
    history: { state: null, replaceState: (_s, _t, url) => { replaced = url; } },
    supabaseClient: { auth: { setSession: async (a) => { setArgs = a; return setSessionResult; } } },
  };
  const f = new Function('window', 'URLSearchParams', cut('rkTakeRecoveryFromUrl') + '; return rkTakeRecoveryFromUrl();');
  const r = await f(window, URLSearchParams);
  return { r, replaced, setArgs };
}
(async () => {
  const good = await take('#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=recovery',
    { data: { session: { user: { id: 'u' } } }, error: null });
  ok('رابط صالح ← جلسة', !!(good.r && good.r.session));
  ok('يمرّر التوكنين لـ setSession', good.setArgs && good.setArgs.access_token === 'AT' && good.setArgs.refresh_token === 'RT');
  ok('يمسح التوكن من شريط العنوان', good.replaced === '/dashboard');

  const expired = await take('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  ok('رابط منتهي ← خطأ (يطلب رابط جديد)', !!(expired.r && expired.r.error) && expired.setArgs === null);
  ok('يمسحه من شريط العنوان أيضاً', expired.replaced === '/dashboard');

  const bad = await take('#access_token=X&refresh_token=Y&type=recovery', { data: { session: null }, error: { message: 'bad' } });
  ok('توكن مرفوض ← خطأ', !!(bad.r && bad.r.error));

  const none = await take('', null);
  ok('بدون رابط ← لا شيء (دخول عادي)', none.r === null && none.replaced === null);
  const other = await take('#section=orders', null);
  ok('hash آخر لا يُلمس', other.r === null && other.replaced === null);

  console.log('\n=== رسائل الأخطاء ===');
  const reqErr = new Function(cut('rkResetRequestError') + '; return rkResetRequestError;')();
  const pwErr = new Function(cut('rkNewPasswordError') + '; return rkNewPasswordError;')();
  ok('كثرة الطلبات', /انتظر/.test(reqErr({ status: 429, code: 'over_email_send_rate_limit' })));
  ok('خطأ إرسال عام', /تعذّر/.test(reqErr({ status: 500, message: 'Error sending recovery email' })));
  ok('نفس الكلمة القديمة', /نفس كلمة المرور/.test(pwErr({ code: 'same_password' })));
  ok('كلمة ضعيفة', /ضعيفة/.test(pwErr({ code: 'weak_password' })));
  ok('جلسة منتهية', /انتهى/.test(pwErr({ name: 'AuthSessionMissingError' })));

  console.log('\n' + (fails === 0 ? 'كل الحالات صحيحة ✓' : fails + ' خلل ✗'));
  process.exit(fails ? 1 : 0);
})();
