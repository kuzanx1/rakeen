/* معاينة بطاقة المحفظة: تختلف باختلاف نظام الولاء.
 *
 * ثلاثة أنظمة تعطي ثلاث بطاقات لا ثلاث حالاتٍ لبطاقةٍ واحدة — والمعاينة
 * هي الشيء الوحيد الذي يراه صاحب المطعم قبل أن تصل جيوب زبائنه. فما
 * يُقاس هنا مقتطعٌ من الملف المنشور لا مكتوبٌ فيه: لو تغيّرت الدالة ولم
 * يتغيّر هذا، رسب.
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'public/dashboard/rakeen-dashboard.js', 'utf8');

/** يقتطع دالةً بالاسم بمطابقة الأقواس — لا بعدد أسطرٍ يتغيّر مع كل تحرير. */
function carve(openerIndex) {
  let k = src.indexOf('{', openerIndex), depth = 0, inS = null;
  for (; k < src.length; k++) {
    const ch = src[k];
    if (inS) { if (ch === inS && src[k - 1] !== '\\') inS = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inS = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) break;
  }
  return src.slice(openerIndex, k + 1);
}
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('ما لقيت الدالة: ' + name);
  return carve(i);
}
function constObj(name) {
  const i = src.indexOf('const ' + name + ' = {');
  if (i < 0) throw new Error('ما لقيت الثابت: ' + name);
  return carve(i) + ';';
}

const NAMES = ['rkwHex', 'rkwRgb', 'rkwLum', 'rkwMix', 'rkwCss', 'walletStripBgMode',
  'walletStripModeValue', 'rkwScrim', 'walletStampLayout', 'rkwStampSizePct', 'rkwRise',
  'rkwStamp', 'rkwTrimmedStamp', 'rkwFakeQr', 'rkwLabel', 'rkwHidden', 'escapeHtml',
  'pendingImageUrl', 'loyaltySystemTypeFormValue', 'walletCardPreviewHtml'];
const body = constObj('RKW_STAMP_PATHS') + '\n' + NAMES.map(fn).join('\n');

const OWNER = 'محمد الأحمد';
const REWARD = 'قهوة مجانية';

function render(type, threshold) {
  const vals = {
    loyaltyAccentInput: '#C4FF2B', walletBgInput: '#1D2A1A',
    loyaltyRewardLabelInput: REWARD,
    loyaltyVisitsThresholdInput: String(threshold),
    loyaltyUnitThresholdInput: String(threshold),
    walletNearbyInput: '', walletStripBg1: '#1A0F08', walletStripBg2: '#4A2C17',
  };
  const ctx = {
    document: {
      getElementById: (id) => (id in vals ? { value: vals[id] } : null),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    RK_CLEARED_IMAGES: new Set(), RK_PENDING_URLS: new Map(), RKW_TRIMS: new Map(),
    WALLET_ASSETS: { labels: {}, stripMode: 'behind' },
    LOYALTY_BRANDING: { accentColor: '#C4FF2B', iconStyle: 'cup', rewardLabel: REWARD },
    RESTAURANT_INFO: { name: 'مقهى ركين', ownerName: OWNER },
    RKW_PREV_LANG: 'ar', RKW_PREVIEW_DONE: null, console,
  };
  return new Function('ctx', `with (ctx) { ${body}
    loyaltySystemTypeFormValue = function(){ return ${JSON.stringify(type)}; };
    return walletCardPreviewHtml(); }`)(ctx);
}

let fails = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? '✓ ' : '✗ ') + name + (detail ? '  →  ' + detail : ''));
  if (!cond) fails++;
};
const stampCount = (h) => (h.match(/rkw-cell/g) || []).length;
const scrub = (h) => (h.match(/rkw-scrub-val">([^<]*)</) || [])[1] || '';
const scrubLab = (h) => (h.match(/rkw-scrub-lab">([^<]*)</) || [])[1] || '';

const P = render('points', 6), V = render('visits', 6), U = render('products', 10);

console.log('=== النقاط: رصيد لا أختام ===');
ok('ما فيها أختام', stampCount(P) === 0, stampCount(P) + ' ختم');
ok('فيها الموجة', P.includes('M0 78 C'));
ok('الترويسة «نقاطك»', /rkw-flabel[^>]*>نقاطك</.test(P));
ok('ما فيها شريط تجريب', !P.includes('rkwScrub'));

console.log('\n=== الزيارات: ختم لكل فاتورة ===');
ok('ستة أختام', stampCount(V) === 6, stampCount(V) + '');
ok('الترويسة «زياراتك»', /rkw-flabel[^>]*>زياراتك</.test(V));
ok('التجريب يقول زيارات', /زيارات/.test(scrub(V)), scrub(V));

console.log('\n=== الأكواب: ختم لكل صنف — لا «زيارة» ===');
ok('عشرة أختام', stampCount(U) === 10, stampCount(U) + '');
ok('الترويسة «ختومك»', /rkw-flabel[^>]*>ختومك</.test(U));
ok('التجريب يقول ختوم', /ختوم/.test(scrub(U)), scrub(U));
ok('ولا يقول زيارات', !/زيار/.test(scrub(U)) && !/زيار/.test(scrubLab(U)),
  scrubLab(U) + ' | ' + scrub(U));

console.log('\n=== حقل الاسم اسمٌ في الأنظمة الثلاثة ===');
/* الخادم يكتب secondaryFields[0] = {key:"name"} لكل الأنظمة (lib/wallet-pass.ts).
   وكانت المعاينة تكتب اسم المكافأة تحت تسمية «اسمك» في نظام النقاط. */
for (const [t, h] of [['نقاط', P], ['زيارات', V], ['أكواب', U]]) {
  const m = h.match(/rkw-flabel[^>]*>اسمك<\/div>[\s\S]{0,400}?rkw-fvalue">([^<]*)</);
  ok(t, !!m && m[1].trim() === OWNER, m ? m[1].trim() : '(ما لقيت الحقل)');
}

console.log('\n' + (fails === 0 ? 'كل الحالات صحيحة ✓' : fails + ' فشل ✗'));
process.exit(fails ? 1 : 0);
