/* تجهيز جهاز الكاشير ورمز الفرع (الويب والتطبيق).
   قبلها: التجهيز يربط الجهاز بالفرع بس، والرمز من لوحة التحكم، ففرع بلا رمز
   = شاشة رمز ما أحد يقدر يعدّيها (Asador). ومشروع بلا فرع = يعلق برسالة.
   التشغيل: node tools/accounting-checks/pos-provision.cjs */
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}

console.log('=== كاشير الويب ===');
const pos = read('public/pos/rakeen-pos.js');
ok('فرع واحد ومتعدد يمرون على فحص الرمز (provFinishBranch)', (pos.match(/await provFinishBranch\(/g) || []).length === 2);
ok('الفحص نفس فحص اللوحة: حساب كاشير للفرع', pos.includes(".from('profiles').select('id').eq('branch_id', branch.id).eq('user_type', 'employee').limit(1)"));
ok('فحص فاشل ما يعتبر «بلا رمز» (ما يغيّر رمز الفرع)', pos.includes("if(tillErr || !Array.isArray(till) || till.length){"));
ok('الرمز ينحفظ بنفس مسار اللوحة وجلسة المالك', pos.includes("fetch('/api/pos/provision-branch'") && pos.includes("Authorization: 'Bearer ' + session.access_token"));
ok('الرمز مرتين ولازم ٤ أرقام', pos.includes("if(!/^\\d{4}$/.test(pin)) return provSetError(") && pos.includes("if(pin !== pin2) return provSetError("));
ok('بعد الحفظ يفتح الكاشير بنفس الرمز', /provSavePin[\s\S]{0,1600}loginPinEntry = pin;\s+renderLoginPin\(\);\s+attemptCashierLogin\(\);/.test(pos));
ok('مشروع بلا فرع: ينشأ «الفرع الرئيسي»', pos.includes(".from('branches').insert({ business_id: profile.business_id, name: 'الفرع الرئيسي' })"));

console.log('\n=== التطبيق ===');
const auth = read('react-native-poc/src/application/authService.ts');
const login = read('react-native-poc/src/ui/LoginScreen.tsx');
ok('فرع واحد ومتعدد يمرون على فحص الرمز (finishBranch)', auth.includes('return finishBranch(profile.business_id, businessName, branches[0]);') && auth.includes('return finishBranch(businessId, businessName, branch);'));
ok('فحص فاشل ما يعتبر «بلا رمز»', auth.includes("if (!tillError && Array.isArray(till) && till.length === 0) {"));
ok('الرمز ينحفظ بنفس المسار وجلسة المالك', auth.includes('${RAKEEN_API_BASE_URL}/api/pos/provision-branch') && auth.includes('Authorization: `Bearer ${session.access_token}`'));
ok('مشروع بلا فرع: ينشأ «الفرع الرئيسي»', auth.includes(".insert({ business_id: profile.business_id, name: 'الفرع الرئيسي' })"));
ok('شاشة الرمز الجديد وبعدها يدخل بنفس الرمز', login.includes("label=\"حفظ الرمز وفتح الكاشير\"") && login.includes('const login = await loginCashierWithPin(result.device.branchId!, p1);'));
ok('needs-pin من الفرع الواحد ومن اختيار الفرع', (login.match(/=== 'needs-pin'/g) || []).length === 2);

console.log(fails ? `\n✗ ${fails} فشل` : '\nكلها ناجحة');
process.exit(fails ? 1 : 0);
