/* كل شلّالٍ معروض لصاحب المطعم يجب أن يَجمع إلى صافي الربح.
   رقمٌ معروضٌ لا تنطبق عليه جمعةُ ما فوقه أسوأ من رقمٍ غائب: يبدو
   صحيحًا فيُبنى عليه. هذا الاختبار يجمع أسطر كل شلّالٍ بنفسه ويقارن. */
const fs = require('fs');
const src = fs.readFileSync('public/dashboard/rakeen-dashboard.js', 'utf8');
let fails = 0;
const near = (x, y) => Math.abs(x - y) < 0.005;

// حالةٌ واحدة تُمرَّر على كل الشلّالات
const A = {
  revenue: 13000, discounts: 1000, netSales: 12000,
  vat: 12000 - 12000 / 1.15, subtotal: 12000 / 1.15,
  cogs: 4200, deliveryPlatformCost: 600,
  wasteCost: 500, opex: 1300,
};
A.grossProfit = A.subtotal - A.cogs - A.deliveryPlatformCost;
A.netProfit = A.grossProfit - A.wasteCost - A.opex;

function expect(name, got, want) {
  const ok = near(got, want);
  console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : '  → ' + got.toFixed(2) + ' بدل ' + want.toFixed(2)));
  if (!ok) fails++;
}

// ══ ١) شلّال المحاسبة المرسوم (renderWaterfall) ══
{
  const i = src.indexOf('  const steps = [', src.indexOf('function renderWaterfall(){'));
  const j = src.indexOf('  ];', i) + 4;
  const stepsSrc = src.slice(i, j);
  const steps = new Function('a', stepsSrc + '; return steps;')(A);

  const labels = steps.map(s => s.label);
  console.log('   أسطر الشلّال: ' + labels.join(' | '));

  // كل ما هو neg يُطرح، وما هو pos/final علامةُ مرحلة
  const negs = steps.filter(s => s.cls === 'neg').reduce((t, s) => t + (-s.amount), 0);
  const final = steps.find(s => s.cls === 'final');
  // الإيراد − (الخصومات + الضريبة + COGS + التوصيل + الهدر + المصاريف)
  expect('شلّال المحاسبة يجمع إلى صافي الربح', A.revenue - negs, final.amount);
  expect('وفيه سطر الهدر', steps.some(s => s.label === 'الهدر') ? 1 : 0, 1);
  expect('وقيمة سطر الهدر صحيحة',
    -(steps.find(s => s.label === 'الهدر') || { amount: 0 }).amount, A.wasteCost);
}

// ══ ٢) الملخّص المالي المعروض (financialReportHtml) ══
{
  const i = src.indexOf('function financialReportHtml(d){');
  const j = src.indexOf('\n}', i) + 2;
  const f = new Function('REPORT_RANGE_LABEL', src.slice(i, j) + '; return financialReportHtml;')('اليوم');
  const html = f(A);
  const nums = [...html.matchAll(/class="mono">([\-0-9.]+) ر\.س/g)].map(m => parseFloat(m[1]));
  // الترتيب: إيراد، خصومات، صافي مبيعات، ضريبة، COGS، توصيل، مجمل، هدر، مصاريف، صافي
  expect('الملخّص المالي فيه ١٠ أرقام (بعد إضافة الهدر)', nums.length, 10);
  const [rev, disc, , vat, cogs, del, gp, waste, opex, net] = nums;
  expect('  الهدر في مكانه الصحيح', waste, A.wasteCost);
  expect('  مجمل الربح = (صافي المبيعات − ضريبة) − COGS − توصيل', gp, (A.netSales - vat) - cogs - del);
  expect('  صافي الربح = مجمل − هدر − مصاريف', net, gp - waste - opex);
  expect('  والإيراد − الخصومات = صافي المبيعات', rev - disc, A.netSales);
}

// ══ ٣) حمولة التصدير المالي (buildReportPayload) ══
{
  const a = src.indexOf('function buildReportPayload(type){');
  const b = src.indexOf('function renderPrintReport(payload){');
  const ctx = {
    RESTAURANT_INFO: { name: 'ت' }, REPORT_RANGE_LABEL: 'اليوم',
    REPORT_TYPE_LABELS: { financial: 'المالي' }, REPORT_RANGE_DATA: A,
    REPORT_DETAIL_ROWS: [], SALES_COUNTERS: [], SALES_COUNTER_COUNTS: {},
    STOCK_ITEMS: [], MENU_ITEMS: [], SELECTED_DAILY_REPORT: null,
    formatDailyReportDate: d => d, VAT_RETURN_INPUT_DATA: null,
  };
  const names = Object.keys(ctx);
  const build = new Function(...names, src.slice(a, b) + '; return buildReportPayload;')(...names.map(k => ctx[k]));
  const stats = build('financial').stats;
  const val = lbl => parseFloat((stats.find(s => s.label === lbl) || { value: 'x' }).value);
  console.log('   بنود التصدير: ' + stats.map(s => s.label).join(' | '));
  expect('التصدير فيه سطر الهدر', val('الهدر'), A.wasteCost);
  expect('  وصافي ربحه = مجمل − هدر − مصاريف',
    val('صافي الربح'), val('مجمل الربح') - val('الهدر') - val('المصاريف التشغيلية'));
}

// ══ ٤) ملخّص «موظفك في ركين» النصّي ══
{
  const i = src.indexOf("let s = 'شلال الأرباح اليوم");
  const j = src.indexOf('const margin =', i);
  const f = new Function('a', 'b', 'n', 'rkaAcctFmt',
    src.slice(i, j) + '; return s;');
  const txt = f(A, { todayExpenses: 300 }, x => Number(x).toFixed(2), x => Number(x).toFixed(2));
  const lines = txt.split('\n').filter(l => l.startsWith('•'));
  console.log('   أسطر الملخّص: ' + lines.length);
  const num = l => parseFloat((l.match(/([\-0-9.]+) ر\.س/) || [0, '0'])[1]);
  const minus = lines.filter(l => l.includes('−')).reduce((t, l) => t + num(l), 0);
  const finalLine = lines.find(l => l.includes('= صافي الربح'));
  expect('الملخّص النصّي فيه سطر الهدر', lines.some(l => l.includes('الهدر')) ? 1 : 0, 1);
  expect('  والإيراد − كل المطروحات = صافي الربح', A.revenue - minus, num(finalLine));
}

console.log('\n' + (fails === 0 ? 'كل الشلّالات متّسقة ✓' : fails + ' تعارض ✗'));
process.exit(fails ? 1 : 0);
