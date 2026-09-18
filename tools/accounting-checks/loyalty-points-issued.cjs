/* «نقاط مُنحت اليوم» يجب أن تطابق ما يمنحه الخادم بالضبط.
   الخادم: floor(total / divisor) لكل طلبٍ له عميل (award_loyalty_for_order).
   والتقدير القديم كان: round(مبيعات اليوم كلها / divisor). */
const fs = require('fs');
const src = fs.readFileSync('public/dashboard/rakeen-dashboard.js', 'utf8');

// اقتطع الحساب من الملف المنشور نفسه
const marker = 'TODAY_POINTS_ISSUED = (LOYALTY_RATE > 0)';
const i = src.indexOf(marker);
if (i < 0) throw new Error('computation not found in shipped file');
const j = src.indexOf(': 0;', i) + 4;
const compute = src.slice(i, j);

let fails = 0;
const startToday = new Date('2026-09-18T00:00:00');

function run(orders, rate) {
  const f = new Function('orderList', 'LOYALTY_RATE', 'startToday',
    'let TODAY_POINTS_ISSUED;' + compute + '; return TODAY_POINTS_ISSUED;');
  return f(orders, rate, startToday);
}
// نظير الخادم، مكتوبٌ مستقلًّا للمقارنة
const serverWould = (orders, rate) => orders
  .filter(o => new Date(o.created_at) >= startToday)
  .reduce((s, o) => s + Math.floor(Number(o.total) / rate), 0);

function check(name, orders, rate, anonymousSales) {
  const got = run(orders, rate);
  const want = serverWould(orders, rate);
  const ok = got === want;
  console.log((ok ? '✓ ' : '✗ ') + name + '  →  ' + got + (ok ? '' : ' (المفروض ' + want + ')'));
  if (!ok) fails++;
  if (anonymousSales != null) {
    // التقدير القديم: كل مبيعات اليوم ÷ المعدّل (بما فيها العابرة بلا اسم)
    const customerSales = orders.filter(o => new Date(o.created_at) >= startToday)
      .reduce((s, o) => s + Number(o.total), 0);
    const oldEstimate = Math.round((customerSales + anonymousSales) / rate);
    console.log('        التقدير القديم كان: ' + oldEstimate
      + '  (أعلى بـ' + (oldEstimate - got) + ')');
  }
  return got;
}

const T = (h, total) => ({ created_at: new Date('2026-09-18T' + h + ':00').toISOString(), total });

console.log('=== مطابقة قاعدة الخادم ===');
check('عشرون فاتورة صغيرة (٢٣ ر.س، معدّل ١٠)',
  Array.from({ length: 20 }, () => T('12', 23)), 10, 0);
check('فواتير مختلفة',
  [T('09', 100), T('10', 47), T('11', 9), T('13', 250)], 10, 0);
check('طلبات أمس لا تُحسب',
  [{ created_at: '2026-09-17T20:00:00', total: 500 }, T('10', 100)], 10, 0);
check('معدّل كبير يبتلع الفواتير الصغيرة',
  [T('10', 9), T('11', 9), T('12', 9)], 10, 0);

console.log('\n=== أثر الطلبات العابرة بلا عميل ===');
// مقهى: ٨ فواتير لعملاء معروفين، و٤٠٠٠ ريال مبيعات عابرة
check('٨ فواتير باسم + ٤٠٠٠ ر.س عابرة',
  Array.from({ length: 8 }, () => T('14', 50)), 10, 4000);

console.log('\n' + (fails === 0 ? 'يطابق الخادم في كل الحالات ✓' : fails + ' اختلاف ✗'));
process.exit(fails ? 1 : 0);
