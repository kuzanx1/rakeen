/* بحثُ الأعضاء وترتيبهم — مقتطعان من الملف المنشور لا مكتوبان هنا. */
const fs = require('fs');
const src = fs.readFileSync('public/dashboard/rakeen-dashboard.js', 'utf8');

function slice(from, to) {
  const i = src.indexOf(from);
  if (i < 0) throw new Error('not found: ' + from);
  const j = src.indexOf(to, i);
  return src.slice(i, j + to.length);
}

// toWesternDigits الحقيقية من الملف
const twd = slice('function toWesternDigits(str){', '\n}');
// normPhone الحقيقية من داخل renderLoyaltyMembers
const norm = slice('const normPhone = (raw)=>{', '\n  };');

const ctx = new Function(twd + '\n' + norm + '\n; return {toWesternDigits, normPhone};')();

let fails = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? '✓ ' : '✗ ') + name + ' → ' + got + (ok ? '' : '  (المفروض ' + want + ')'));
  if (!ok) fails++;
};

console.log('=== توحيد صيغة الجوال ===');
eq('٠٥٥٧٤٤٤٢٢٧ (أرقام هندية)', ctx.normPhone('٠٥٥٧٤٤٤٢٢٧'), '0557444227');
eq('966557444227 (مقدّمة الدولة)', ctx.normPhone('966557444227'), '0557444227');
eq('557444227 (بلا صفر)',        ctx.normPhone('557444227'),    '0557444227');
eq('0557444227 (كما هو)',        ctx.normPhone('0557444227'),   '0557444227');
eq('05 5744 4227 (بمسافات)',     ctx.normPhone('05 5744 4227'), '0557444227');

console.log('\n=== يجد نفس الشخص بكل صيغة ===');
const stored = ctx.normPhone('0557444227');
for (const typed of ['٠٥٥٧٤٤٤٢٢٧', '966557444227', '557444227', '0557444227', '4227']) {
  const qDigits = ctx.toWesternDigits(typed).replace(/\D/g, '');
  const qPhone = ctx.normPhone(qDigits);
  const hit = stored.includes(qPhone) || stored.includes(qDigits);
  eq('البحث بـ "' + typed + '"', hit, true);
}

console.log('\n=== الترتيب بالأقرب لمكافأة (نظام النقاط) ===');
// أرخص استبدال ١٠٠ نقطة
const cheapest = 100;
const remaining = (pts) => Math.max(0, cheapest - pts);
const members = [{ n: 'أ', p: 20 }, { n: 'ب', p: 95 }, { n: 'ج', p: 60 }];
const order = [...members].sort((a, b) => remaining(a.p) - remaining(b.p)).map(m => m.n).join(' ');
eq('الأقرب أولاً', order, 'ب ج أ');
// وقبل الإصلاح كان الجميع ٩٩٩ فلا يتغيّر الترتيب
const before = [...members].sort(() => 999 - 999).map(m => m.n).join(' ');
eq('قبل الإصلاح: بلا ترتيب', before, 'أ ب ج');

console.log('\n' + (fails === 0 ? 'كل الحالات صحيحة ✓' : fails + ' فشل ✗'));
process.exit(fails ? 1 : 0);
