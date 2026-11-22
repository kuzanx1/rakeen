/* عدّاد الإضافة في كاشير الويب: كل حبة بسعرها.
 *
 * قاعدة المالك: «كل زايدة وحدة زيادة حسب قيمة الخيار». خمس شرائح جبن
 * بريالين = عشرة، على خمسة ساندوتشات كانت أو مكدّسة على واحد. وهذه هي
 * نفس الأرقام التي يحرسها __tests__/paidOptionCounts.test.ts في
 * التطبيق -- فإن افترق العميلان في الحساب، رسب أحدهما هنا.
 *
 * والدوال مقتطعة من الملف المنشور (public/pos/rakeen-pos.js) لا مكتوبة
 * هنا: لو تغيّرت المعادلة ولم يتغيّر هذا، رسب.
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'public/pos/rakeen-pos.js', 'utf8');

function carve(i) {
  let k = src.indexOf('{', i), depth = 0, inS = null;
  for (; k < src.length; k++) {
    const ch = src[k];
    if (inS) { if (ch === inS && src[k - 1] !== '\\') inS = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inS = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) break;
  }
  return src.slice(i, k + 1);
}
const fn = (n) => { const i = src.indexOf('function ' + n + '('); if (i < 0) throw new Error('ما لقيت: ' + n); return carve(i); };
const line = (needle) => { const i = src.indexOf(needle); if (i < 0) throw new Error('ما لقيت: ' + needle); return src.slice(i, src.indexOf('\n', i)); };

const SANDWICH = 10;
const PRODUCTS = [{ id: 1, name: 'ساندوتش', price: SANDWICH }];
const MODIFIER_PRODUCTS = {
  1: {
    groups: [{
      id: 'g1', name: 'الإضافات', type: 'multiple', required: false, max: 9,
      options: [
        { id: 'cheese', name: 'جبنة', price: 2 },
        { id: 'noFries', name: 'بدون بطاطس', price: 0 },
      ],
    }],
  },
};
const state = { orderChannel: 'dine_in', deliveryPlatformId: null };
const PLATFORM_PRICES = {};

const body = [
  line('const RK_OPT_COUNTS ='),
  line('const RK_MAX_OPT_COUNT ='),
  fn('productBasePrice'), fn('lineUnitPrice'), fn('rkOptionCount'), fn('rkWithOptionCount'),
  fn('rkOptionTakesCount'), fn('rkApplyOptionCounts'),
  fn('lineOptionsExtra'), fn('lineTotalPrice'),
  'return { lineUnitPrice, lineOptionsExtra, lineTotalPrice, rkOptionCount, rkWithOptionCount, rkOptionTakesCount, rkApplyOptionCounts, RK_MAX_OPT_COUNT };',
].join('\n');

const api = new Function('PRODUCTS', 'MODIFIER_PRODUCTS', 'state', 'PLATFORM_PRICES', body)(
  PRODUCTS, MODIFIER_PRODUCTS, state, PLATFORM_PRICES,
);

const modDef = MODIFIER_PRODUCTS[1];
const group = modDef.groups[0];
const cheese = group.options[0];
const noFries = group.options[1];

const withCount = (optId, qty, count) => ({
  productId: 1, qty,
  config: api.rkApplyOptionCounts({ g1: [optId] }, { [optId]: count }, qty, modDef),
});

let failed = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`✗ ${label}: جا ${JSON.stringify(got)}، والمنتظر ${JSON.stringify(want)}`); }
  return ok;
}

// ١) ٥ ساندوتش و٥ شرائح جبن = ٦٠، والجبن منها ١٠. لا عدّاد يُكتب.
const five = withCount('cheese', 5, 5);
is('٥ ساندوتش و٥ جبن: لا عدّاد', api.rkOptionCount(five.config, 'cheese'), null);
is('٥ ساندوتش و٥ جبن: الفرق صفر', api.lineOptionsExtra(five), 0);
is('٥ ساندوتش و٥ جبن = ٦٠', api.lineTotalPrice(five), 60);

// ٢) ساندوتش واحد و٥ شرائح = ٢٠، والجبن منها ١٠ برضو.
const stacked = withCount('cheese', 1, 5);
is('ساندوتش و٥ جبن: العدّاد ٥', api.rkOptionCount(stacked.config, 'cheese'), 5);
is('ساندوتش و٥ جبن: سعر الوحدة ١٢', api.lineUnitPrice(stacked), 12);
is('ساندوتش و٥ جبن: الفرق ٨', api.lineOptionsExtra(stacked), 8);
is('ساندوتش و٥ جبن = ٢٠', api.lineTotalPrice(stacked), 20);

// ٣) ٥ ساندوتش والجبن على اثنين = ٥٤.
const two = withCount('cheese', 5, 2);
is('الجبن على اثنين: الفرق −٦', api.lineOptionsExtra(two), -6);
is('الجبن على اثنين = ٥٤', api.lineTotalPrice(two), 54);

// ٤) العدد مطلق: رفع الكمية بعد الإضافة لا يحرّك ثمن الجبن.
is('العدد مطلق', api.lineTotalPrice({ ...stacked, qty: 3 }), SANDWICH * 3 + 2 * 5);

// ٥) بلا عدّاد: الحساب كما كان قبل الميزة.
is('بلا عدّاد', api.lineTotalPrice({ productId: 1, qty: 5, config: { g1: ['cheese'] } }), 60);

// ٦) المجانية: عدّها لا يغيّر ريالاً.
const free = withCount('noFries', 5, 2);
is('المجانية: العدّاد ٢', api.rkOptionCount(free.config, 'noFries'), 2);
is('المجانية: الفرق صفر', api.lineOptionsExtra(free), 0);
is('المجانية = ٥٠', api.lineTotalPrice(free), 50);

// ٧) المجاني والمدفوع سواء -- الفرق السعر وحده.
is('المدفوعة على حبة واحدة', api.rkOptionTakesCount(group), true);
is('والمجانية مثلها تماماً', api.rkOptionTakesCount(group), true);
is('الحجم (single)', api.rkOptionTakesCount({ type: 'single' }), false);
is('السقف واحدٌ للجميع: ٩٩', api.RK_MAX_OPT_COUNT, 99);
const ketchup = withCount('noFries', 1, 3); // كتشب مجاني ×٣ على ساندوتشٍ واحد
is('كتشب ×3 على حبة واحدة: يُعَدّ', api.rkOptionCount(ketchup.config, 'noFries'), 3);
is('وبلا ريال', api.lineTotalPrice(ketchup), SANDWICH);

// ٨) نقص الكمية بعد العدّ: العدد مطلق، يبقى على حاله في الاثنين.
is('المجانية تبقى ٤ ولو الكمية ٢', api.rkOptionCount(api.rkApplyOptionCounts({ g1: ['noFries'] }, { noFries: 4 }, 2, modDef), 'noFries'), 4);
is('والمدفوعة كذلك', api.rkOptionCount(api.rkApplyOptionCounts({ g1: ['cheese'] }, { cheese: 4 }, 2, modDef), 'cheese'), 4);

// ٩) النص المطبوع.
is('«جبنة ×5»', api.rkWithOptionCount('جبنة', stacked.config, 'cheese'), 'جبنة ×5');
is('بلا عدّاد: «جبنة»', api.rkWithOptionCount('جبنة', five.config, 'cheese'), 'جبنة');

if (failed) { console.error(`\n✗ ${failed} فحص رسب في عدّاد الإضافات`); process.exit(1); }
console.log('✓ عدّاد الإضافات في كاشير الويب: كل حبة بسعرها (٢١ فحصاً)');
