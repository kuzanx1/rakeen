/* «سعره بالنقاط» في المتجر الإلكتروني — في نظام النقاط وحده.
 *
 * الزيارات والأكواب لا يُشترى فيهما منتجٌ برصيد: يُكمل العميل عدداً
 * فيأخذ مكافأةً واحدة مسمّاة سلفاً. فرقمٌ بالنقاط تحت سعر المنتج هناك
 * يَعِد بما لا يُعطى — وهذا هو ما يُحرَس هنا، لا شكل الرقاقة.
 *
 * والدوال مقتطعة من الملف المنشور (public/order/rakeen-order.js) لا
 * مكتوبة هنا: لو تغيّر الشرط ولم يتغيّر هذا، رسب.
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'public/order/rakeen-order.js', 'utf8');

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

const body = [
  line('const PTS_ICON ='), line('const POINTS_REDEEM_HINT_AR ='), line('const POINTS_REDEEM_HINT_EN ='),
  line('const PLACEHOLDER_SVG ='),
  fn('formatPrice'), fn('pointsChipHtml'), fn('pointsNoteHtml'), fn('productCardHtml'), fn('sheetHeroHtml'),
].join('\n');

// قالب المعاينة السريعة يُكتب في DOM — يُقتطع وحده ويُشغَّل بنفس القيم.
const qvStart = src.indexOf('function openDisplayQuickView(');
const qvTpl = src.slice(src.indexOf('`', src.indexOf('omModifierBody', qvStart)), src.indexOf('`;', qvStart) + 1);

const ITEMS = [
  { id: 1, name: 'لاتيه', nameEn: 'Latte', price: 18, image: null, costMode: 'simple', pointsPrice: 120, tagLabel: '', tagColor: '' },
  { id: 2, name: 'كابتشينو', nameEn: '', price: 16, image: null, costMode: 'simple', pointsPrice: null, tagLabel: '', tagColor: '' },
];

function render(pointsMode, items) {
  const ctx = { CART: [], BOX_PRODUCTS: {}, DISPLAY_MODE: false, POINTS_MODE: pointsMode, __p: items };
  return new Function('ctx', `with (ctx) { ${body}
    const product = ctx.__p[0];
    return { note: pointsNoteHtml(ctx.__p), cards: ctx.__p.map(productCardHtml),
             quick: ${qvTpl}, hero: sheetHeroHtml(product, '') }; }`)(ctx);
}

let fails = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? '✓ ' : '✗ ') + name + (detail !== undefined ? '  →  ' + detail : ''));
  if (!cond) fails++;
};
const has = (h) => /om-points-chip/.test(h);

const ON = render(true, ITEMS);

console.log('=== نظام النقاط: الرقم يظهر ===');
ok('بطاقة منتجٍ له سعرٌ بالنقاط', has(ON.cards[0]));
ok('الرقم هو المحفوظ لا غيره', /om-points-n[^>]*>120</.test(ON.cards[0]));
ok('بالعربي والإنجليزي', /نقطة/.test(ON.cards[0]) && /pts/.test(ON.cards[0]));
ok('بطاقة منتجٍ بلا سعرٍ بالنقاط — بلا رقاقة', !has(ON.cards[1]));
ok('سطرٌ يقول أين تُستبدل', /om-points-note/.test(ON.note));
ok('المعاينة السريعة', has(ON.quick) && /om-points-hint/.test(ON.quick));
ok('ترويسة ورقة التخصيص', has(ON.hero));

console.log('\n=== الزيارات والأكواب: لا أثر لها إطلاقاً ===');
const OFF = render(false, ITEMS);
ok('لا رقاقة في البطاقات', !OFF.cards.some(has));
ok('لا سطر فوق المنيو', OFF.note === '', JSON.stringify(OFF.note));
ok('لا شيء في المعاينة السريعة', !/om-points/.test(OFF.quick));
ok('لا شيء في ترويسة التخصيص', !/om-points/.test(OFF.hero));

console.log('\n=== صفرٌ أو سالبٌ ليس سعراً ===');
/* قيد الجدول نفسه: points_redeem_price is null or > 0 (20260802140255).
   ورقاقةٌ تقول «٠ نقطة» تعني مجاناً — وهي لا تعني ذلك. */
for (const bad of [0, null, undefined]) {
  const r = render(true, [{ ...ITEMS[0], pointsPrice: bad }]);
  ok('pointsPrice = ' + String(bad), !has(r.cards[0]));
}

console.log('\n=== المصدر: النظام يُقرأ باستعلامٍ مستقل ===');
/* أعمدة businesses ممنوحة لـanon عموداً عموداً، وPostgREST يردّ 42501
   على الطلب كلّه إن ورد فيه عمودٌ غير ممنوح. فضمّ loyalty_system_type
   إلى استعلام المتجر الأساسي = متجرٌ مطفأ عند كل مطعم قبل الترحيل. */
const mainSel = src.slice(src.indexOf("from('businesses')"), src.indexOf("from('businesses')") + 1400);
ok('ليس في استعلام المتجر الأساسي', !/online_tagline_hero[^)]*loyalty_/.test(mainSel));
ok('له استعلامه المستقل', /select\('loyalty_enabled, loyalty_system_type'\)/.test(src));
ok('محروسٌ بـtry/catch', /try \{[\s\S]{0,400}loyalty_system_type[\s\S]{0,300}catch/.test(src));

console.log('\n' + (fails === 0 ? 'كل الحالات صحيحة ✓' : fails + ' فشل ✗'));
process.exit(fails ? 1 : 0);
