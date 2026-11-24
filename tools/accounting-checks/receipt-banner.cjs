/**
 * شريطُ الفاتورة: العميلان يقرآنه، والمحرّكُ يرسمه، واللوحةُ تُطفئه.
 *
 * وأخطرُ ما في ميزةٍ مؤقّتة أن يسقط نصفُها بصمت: شريطٌ يُرسم في التطبيق
 * ولا يُرسم في الويب يعني مطعمَين على الورقة نفسِها يطبعان ورقتين
 * مختلفتين -- وهو العطبُ الذي كُتبت له قاعدةُ المستودع («التطبيق أولاً
 * ثم الويب، في نفس الدفعة»).
 *
 * والأخطرُ منه أن يبقى الشريطُ بلا مُطفئ: مناسبةٌ تنتهي وشريطُها يُطبع
 * شهراً بعدها لأنّ الزرّ لم يصل اللوحة.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const fails = [];

/* ١) المحرّكُ يعرف الأربعة، ويرسم كلَّ واحدٍ منها. */
const banner = read('shared/receipt/banner.ts');
for (const need of ['drawShield', 'drawPlain', 'drawInvert', "'shield'", "'plain'", "'invert'"]) {
  if (!banner.includes(need)) fails.push(`محرّكُ الشريط بلا ${need}`);
}

/* ٢) ويُرسم تحت الشعار وتحت السطر التعريفيّ -- لا فوقهما.
      هويّةُ المطعم أوّلاً: الشريطُ ضيفٌ على ورقتهم. */
const layout = read('shared/receipt/layout.ts');
const atLogo = layout.indexOf("ref: 'logo'");
const atTag = layout.indexOf('if (receipt.tagline)');
const atBanner = layout.indexOf('drawBanner(ctx, banner)');
const atVat = layout.indexOf('if (receipt.vatNumber)');
if (atBanner < 0) fails.push('التخطيطُ لا يرسم الشريط أصلاً');
else {
  if (atLogo < 0 || atBanner < atLogo) fails.push('الشريطُ فوق شعار المطعم — هويّتهم تُزاح');
  if (atTag < 0 || atBanner < atTag) fails.push('الشريطُ فوق السطر التعريفيّ للمطعم');
  if (atVat > 0 && atBanner > atVat) fails.push('الشريطُ بعد الرقم الضريبيّ — مكانُه مع الترويسة لا مع بيانات المعاملة');
}

/* ٣) العميلان كلاهما يمرّرانه. وغيابُه في أحدهما لا يُرى: الورقةُ تخرج
      سليمةً، ناقصةً شريطاً، فلا أحدَ يشتكي. */
const app = read('react-native-poc/src/application/catalogService.ts');
if (!app.includes("supabase.rpc('rk_receipt_banner')")) fails.push('التطبيقُ لا يقرأ rk_receipt_banner');
const render = read('react-native-poc/src/application/receiptRenderer.ts');
if (!/banner: banner \?\? 'none'/.test(render)) fails.push('التطبيقُ يقرأ الشريطَ ولا يمرّره للمحرّك');
const print = read('react-native-poc/src/application/printService.ts');
if (!print.includes('getReceiptBannerForPrinting()')) fails.push('مسارُ الطباعة في التطبيق لا يجلب الشريط');

const web = read('public/pos/rakeen-pos.js');
if (!web.includes("sb.rpc('rk_receipt_banner')")) fails.push('كاشيرُ الويب لا يقرأ rk_receipt_banner');
if (!/banner: RECEIPT_BANNER/.test(web)) fails.push('كاشيرُ الويب يقرأ الشريطَ ولا يمرّره للمحرّك');

/* ٤) ومحرّكُ الويب المبنيّ يحمله فعلاً -- بناءٌ قديمٌ يُسقط الميزةَ
      كلَّها في الويب بينما المصدرُ يقول إنّها موجودة. */
const engine = read('public/pos/receipt-engine.js');
for (const need of ['isBannerKind', 'drawBanner']) {
  if (!engine.includes(need)) fails.push(`محرّكُ الويب المبنيّ بلا ${need} — شغّل npm run receipt:build`);
}

/* ٥) وله مُطفئ. */
const route = read('app/api/admin/receipt-banner/route.ts');
if (!route.includes('"none"')) fails.push('مسارُ اللوحة لا يعرف «بلا شريط» — ميزةٌ مؤقّتةٌ بلا مُطفئ');
const panel = read('app/admin/ReceiptBannerPanel.tsx');
if (!panel.includes('أطفئ الشريط')) fails.push('لوحةُ الإدارة بلا زرِّ إطفاء');
const dash = read('app/admin/AdminDashboard.tsx');
if (!dash.includes('ReceiptBannerPanel')) fails.push('الشاشةُ غيرُ موصولةٍ بلوحة الإدارة — لا طريقَ للإطفاء');

if (fails.length) {
  console.error('✗ شريط الفاتورة:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ شريط الفاتورة: ثلاثةُ تصاميم، تحت هويّة المطعم، في العميلين، وله مُطفئ');
