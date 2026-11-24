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

/**
 * محارفُ ملفِّ خطٍّ -- من جدول cmap مباشرةً.
 *
 * ولا مكتبةَ خطوطٍ لأجله: الحاجةُ أن نعرف «أيَحمل هذا الحرفَ أم لا»،
 * وقراءةُ الصيغتين ٤ و١٢ من الجدول تكفيها. وحزمةٌ تُضاف لبوّابة النشر
 * حزمةٌ تُحدَّث وتُكسر يوماً وتُوقف النشرَ لغير سبب.
 */
function cmapOf(buf) {
  const out = new Set();
  const numTables = buf.readUInt16BE(4);
  let cmapOff = 0;
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') cmapOff = buf.readUInt32BE(rec + 8);
  }
  if (!cmapOff) return out;
  const n = buf.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < n; i += 1) {
    const sub = cmapOff + buf.readUInt32BE(cmapOff + 4 + i * 8 + 4);
    const format = buf.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        const end = buf.readUInt16BE(ends + s * 2);
        const start = buf.readUInt16BE(starts + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c += 1) out.add(c);
      }
    } else if (format === 12) {
      const groups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g += 1) {
        const at = sub + 16 + g * 12;
        const start = buf.readUInt32BE(at);
        const end = buf.readUInt32BE(at + 4);
        for (let c = start; c <= end; c += 1) out.add(c);
      }
    }
  }
  return out;
}
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

/* ٥) وخطُّ العرضِ يحمل كلَّ محرفٍ في نصوص الشريط.
      وهو محزومٌ مُجزَّأً عليها وحدَها -- ٥٨ ك.ب بدل ١٧٠ -- فحرفٌ يُزاد
      في النصّ ولا يُزاد في الخطّ لا يُرى في مراجعةٍ ولا في اختبار:
      يخرج مربّعاً فارغاً على ورقةِ زبون. فيُقرأ cmap الملفَّين. */
const CHARS = new Set();
for (const m of banner.matchAll(/^\s*(?:head|sub|body|tail):\s*'([^']+)'/gm)) {
  for (const ch of m[1]) CHARS.add(ch);
}
if (CHARS.size < 20) fails.push('لم تُقرأ نصوصُ الشريط من banner.ts — تعذّر فحصُ الخطّ');
for (const where of ['react-native-poc/assets/fonts', 'public/fonts/thmanyah-serif-display']) {
  for (const weight of ['Black', 'Bold']) {
    const file = path.join(root, where, `ThmanyahSerifDisplay-${weight}.ttf`);
    if (!fs.existsSync(file)) { fails.push(`خطُّ العرض مفقود: ${where}/ThmanyahSerifDisplay-${weight}.ttf`); continue; }
    const have = cmapOf(fs.readFileSync(file));
    const missing = [...CHARS].filter(ch => ch !== ' ' && !have.has(ch.codePointAt(0)));
    if (missing.length) {
      fails.push(`خطُّ العرض (${weight}) لا يحمل: ${missing.join(' ')} — شغّل tools/fonts/subset-display.py`);
    }
  }
}

/* ٦) والعميلان يعرفان العائلة الثالثة -- وإلّا رُسم الشريطُ بخطّ النصّ
      في أحدهما: ورقةٌ تخرج سليمةً، باهتةً، فلا أحدَ يشتكي. */
if (!/family === 'display'/.test(web)) fails.push('كاشيرُ الويب لا يعرف عائلةَ خطِّ العرض');
if (!read('app/pos/rakeen-pos.css').includes("font-family:'RakeenReceiptDisplay'")) {
  fails.push('صفحةُ الكاشير لا تُحمّل خطَّ العرض (@font-face)');
}
const rnText = read('react-native-poc/src/platform/receiptText.ts');
if (!rnText.includes("family === 'display'")) fails.push('التطبيقُ لا يعرف عائلةَ خطِّ العرض');
if (!rnText.includes('DISPLAY_FONT_FAMILY)')) fails.push('التطبيقُ لا يسجّل خطَّ العرض في مزوّد الخطوط');
if (!read('react-native-poc/src/platform/receiptFonts.ts').includes('ThmanyahSerifDisplay-Black.ttf')) {
  fails.push('التطبيقُ لا يحزم خطَّ العرض');
}

/* ٧) وله مُطفئ. */
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
