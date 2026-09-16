/* اختبار معادلة الربح بعد إدخال الهدر.
   يقتطع recomputeAccounting من الملف نفسه ويشغّلها على حالاتٍ محسوبة
   يدويًّا -- فما يُختبر هو الكود المنشور لا نسخةٌ منه. */
const fs = require('fs');
const src = fs.readFileSync('public/dashboard/rakeen-dashboard.js', 'utf8');

const a = src.indexOf('function recomputeAccounting(){');
const b = src.indexOf('\n}', src.indexOf('TODAY.profit = netProfit')) + 2;
const fnSrc = src.slice(a, b);

function run(scn) {
  const TODAY = { grossSales: scn.gross, netSales: scn.net, profit: 0 };
  const ctx = {
    TODAY,
    TODAY_COGS: scn.cogs,
    TODAY_DELIVERY_PLATFORM_COST: scn.delivery,
    TODAY_GENERAL_EXPENSES_TOTAL: scn.expenses,
    TODAY_WASTE_COST: scn.waste,
    getMonthlyFixedCostsTotal: () => scn.fixedMonthly,
  };
  const names = Object.keys(ctx);
  // ACCOUNTING تُعرَّف داخل الجسم المُقتطع لا في السياق -- وإلّا صار
  // تعريفًا مكرّرًا.
  const f = new Function(...names,
    'let ACCOUNTING;' + fnSrc + '; recomputeAccounting(); return {ACCOUNTING, profit: TODAY.profit};');
  return f(...names.map(k => ctx[k]));
}

const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
let fails = 0;
const near = (x, y) => Math.abs(x - y) < 0.005;

function check(name, scn, expect) {
  const { ACCOUNTING: A, profit } = run(scn);
  const rows = [
    ['الإيرادات', A.revenue, expect.revenue],
    ['الخصومات', A.discounts, expect.discounts],
    ['الضريبة', A.vat, expect.vat],
    ['قبل الضريبة', A.subtotal, expect.subtotal],
    ['مجمل الربح', A.grossProfit, expect.grossProfit],
    ['الهدر', A.wasteCost, expect.waste],
    ['المصاريف', A.opex, expect.opex],
    ['صافي الربح', A.netProfit, expect.netProfit],
  ];
  const bad = rows.filter(r => !near(r[1], r[2]));
  const kpiOk = near(profit, A.netProfit);
  console.log((bad.length === 0 && kpiOk ? '✓' : '✗') + ' ' + name);
  rows.forEach(([lbl, got, want]) => {
    const ok = near(got, want);
    if (!ok) console.log('      ✗ ' + lbl + ': طلع ' + got.toFixed(2) + ' والمفروض ' + want.toFixed(2));
  });
  if (!kpiOk) console.log('      ✗ مؤشّر الرئيسية ما يطابق صافي الربح');
  if (bad.length || !kpiOk) fails++;
  return A;
}

console.log('=== أيام الشهر المستعملة في التوزيع: ' + daysInMonth + ' ===\n');

// ١) حالة كاملة محسوبة بالورقة
{
  const fixedMonthly = 30000, waste = 500;
  const opex = fixedMonthly / daysInMonth + 300;
  const net = 12000, vat = net - net / 1.15, subtotal = net - vat;
  const gp = subtotal - 4200 - 600;
  check('حالة كاملة — فيها هدر ٥٠٠',
    { gross: 13000, net, cogs: 4200, delivery: 600, expenses: 300, waste, fixedMonthly },
    { revenue: 13000, discounts: 1000, vat, subtotal, grossProfit: gp, waste,
      opex, netProfit: gp - waste - opex });
}

// ٢) صفر هدر = نفس نتيجة النظام القديم بالضبط
{
  const fixedMonthly = 30000;
  const opex = fixedMonthly / daysInMonth + 300;
  const net = 12000, vat = net - net / 1.15, subtotal = net - vat;
  const gp = subtotal - 4200 - 600;
  const A = check('بلا هدر — يطابق المعادلة القديمة',
    { gross: 13000, net, cogs: 4200, delivery: 600, expenses: 300, waste: 0, fixedMonthly },
    { revenue: 13000, discounts: 1000, vat, subtotal, grossProfit: gp, waste: 0,
      opex, netProfit: gp - opex });
  console.log('      (صافي الربح = ' + A.netProfit.toFixed(2) + ' — لا يتغيّر عمّا كان)');
}

// ٣) هدر يقلب الربح خسارة
{
  const fixedMonthly = 0, waste = 900;
  const net = 1000, vat = net - net / 1.15, subtotal = net - vat;
  const gp = subtotal - 300 - 0;
  const A = check('هدر يقلب اليوم خسارة',
    { gross: 1000, net, cogs: 300, delivery: 0, expenses: 0, waste, fixedMonthly },
    { revenue: 1000, discounts: 0, vat, subtotal, grossProfit: gp, waste,
      opex: 0, netProfit: gp - waste });
  if (A.netProfit >= 0) { console.log('      ✗ كان المفروض يطلع سالب'); fails++; }
  else console.log('      (صافي الربح = ' + A.netProfit.toFixed(2) + ' — سالب، وهذا الصحيح)');
}

// ٤) يوم بلا مبيعات وفيه هدر
{
  const waste = 120;
  check('بلا مبيعات وفيه هدر',
    { gross: 0, net: 0, cogs: 0, delivery: 0, expenses: 0, waste, fixedMonthly: 0 },
    { revenue: 0, discounts: 0, vat: 0, subtotal: 0, grossProfit: 0, waste,
      opex: 0, netProfit: -waste });
}

// ٥) الفرق بين قبل وبعد = الهدر بالضبط، لا أكثر ولا أقل
{
  const base = { gross: 13000, net: 12000, cogs: 4200, delivery: 600, expenses: 300, fixedMonthly: 30000 };
  const before = run({ ...base, waste: 0 }).ACCOUNTING.netProfit;
  const after = run({ ...base, waste: 777.25 }).ACCOUNTING.netProfit;
  const diff = before - after;
  const ok = near(diff, 777.25);
  console.log((ok ? '✓' : '✗') + ' الفرق قبل/بعد = الهدر بالضبط (' + diff.toFixed(2) + ')');
  if (!ok) fails++;
  // ولا يمسّ مجمل الربح ولا تكلفة البضاعة
  const A0 = run({ ...base, waste: 0 }).ACCOUNTING;
  const A1 = run({ ...base, waste: 777.25 }).ACCOUNTING;
  const untouched = near(A0.grossProfit, A1.grossProfit) && near(A0.cogs, A1.cogs)
    && near(A0.vat, A1.vat) && near(A0.netSales, A1.netSales);
  console.log((untouched ? '✓' : '✗') + ' الهدر ما مسّ مجمل الربح ولا COGS ولا الضريبة ولا المبيعات');
  if (!untouched) fails++;
}

console.log('\n' + (fails === 0 ? 'كل الاختبارات نجحت ✓' : fails + ' اختبار فشل ✗'));
process.exit(fails ? 1 : 0);
