/* معدل النقاط («نقطة لكل كم ريال») يجب أن يرجع إلى حقله كما حُفظ.
   كان الحقل في الصفحة بقيمةٍ ثابتة 10 ولا يُملأ من المحفوظ: فمن حفظ 5
   رجع فرأى 10، وأيُّ حفظٍ بعدها يكتب 10 فوق اختياره. */
const fs = require('fs');
const src = fs.readFileSync('public/dashboard/rakeen-dashboard.js', 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}

// اقتطع الدالة من الملف المنشور نفسه
const i = src.indexOf('function syncLoyaltyRateInput(){');
if (i < 0) throw new Error('syncLoyaltyRateInput not found in shipped file');
const fnSrc = src.slice(i, src.indexOf('\n}', i) + 2);

function run(rate, startValue) {
  const el = { value: startValue };
  const f = new Function('document', 'LOYALTY_RATE', 'renderLoyaltyRuleSummary',
    fnSrc + '; syncLoyaltyRateInput(); ');
  f({ getElementById: id => (id === 'loyaltyRateInput' ? el : null) }, rate, () => {});
  return String(el.value);
}

console.log('=== الحقل يتبع المحفوظ ===');
ok('محفوظ 5 → الحقل 5 (لا 10)', run(5, '10') === '5');
ok('محفوظ 25 → الحقل 25', run(25, '10') === '25');
ok('محفوظ 10 → الحقل 10', run(10, '10') === '10');
ok('قيمة تالفة لا تمسح الحقل', run(NaN, '10') === '10');

console.log('\n=== من ينادي التعبئة ===');
const body = (name) => {
  const s = src.indexOf('function ' + name + '(');
  return src.slice(s, src.indexOf('\n}', s));
};
const load = body('loadLoyaltyBranding');
ok('التحميل يقرأ loyalty_points_divisor', /select\('[^']*loyalty_points_divisor/.test(load));
ok('التحميل يحدّث LOYALTY_RATE', /LOYALTY_RATE = Number\(data\.loyalty_points_divisor\)/.test(load));
ok('التحميل يملأ الحقل', load.includes('syncLoyaltyRateInput()'));
ok('فتح تبويب البرنامج يملأ الحقل', body('renderLoyaltyBrandingPreview').includes('syncLoyaltyRateInput()'));
const guided = body('rkaLoySaveBiz');
ok('مدير الولاء يحدّث المعدل والحقل بعد الحفظ',
  /LOYALTY_RATE = Number\(patch\.loyalty_points_divisor\)/.test(guided) && guided.includes('syncLoyaltyRateInput()'));

console.log('\n' + (fails === 0 ? 'المعدل يرجع كما حُفظ ✓' : fails + ' خلل ✗'));
process.exit(fails ? 1 : 0);
