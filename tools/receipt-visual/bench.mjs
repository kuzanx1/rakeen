/**
 * قياسُ المحرّك: زمنُ التخطيط، وما يخصّصه، وما يحجزه الرسم.
 *
 * وهو نصفُ القياس لا كلُّه: التخطيطُ يقع هنا، والرسمُ يقع على الجهاز.
 * فما يُقاس في node هو الحسابُ وحدَه -- وهو المشترك بين الويب
 * والتطبيق، فرقمُه واحدٌ فيهما. وزمنُ الرسم وذاكرتُه على الأيباد
 * يقيسهما التطبيقُ بنفسه (شاشة التشخيص ← «قياس الطباعة»).
 *
 *   node tools/receipt-visual/bench.mjs
 */

import { build } from 'esbuild';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const TMP = join(HERE, '.bench');

await mkdir(TMP, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'shared/receipt/index.ts')],
  bundle: true, format: 'esm', outfile: join(TMP, 'engine.mjs'),
  target: ['node18'], charset: 'utf8', logLevel: 'silent',
});
const E = await import('file://' + join(TMP, 'engine.mjs'));

const item = (i) => ({
  name: `سبانيش لاتيه ${i}`, nameEn: `Spanish Latte ${i}`,
  qty: (i % 3) + 1, unitPrice: 18, lineTotal: 18 * ((i % 3) + 1),
  mods: i % 4 === 0 ? ['حليب شوفان', 'شوت إضافي'] : [],
  note: i % 7 === 0 ? 'بدون سكر نهائياً مع ملعقة إضافية' : '',
});

const receipt = (n) => ({
  businessName: 'مقهى هبيّة', tagline: 'قهوة مختصة', branchName: 'الفرع الرئيسي',
  vatNumber: '310000000000003', orderNumber: '1042', dateLabel: '2026/09/08 — 14:32',
  cashierName: 'عمّار', metaLabel: 'محلي',
  items: Array.from({ length: n }, (_, i) => item(i + 1)),
  subtotal: 24 * n, discount: 0, vat: 3.13 * n, total: 24 * n,
  paymentMethodLabel: 'نقداً', change: 0, customMessage: 'شكراً لزيارتكم',
});

/**
 * القياسُ الصوريُّ لا الحقيقيّ.
 *
 * الحقيقيُّ عند الخطّ، والخطُّ في المتصفّح أو على الجهاز. وهذا يعطي
 * الرقمَ الذي يعطيه الحسابُ نفسُه بلا اختلافِ آلة -- والمقصودُ مقارنةُ
 * حجمٍ بحجم، لا الرقمُ المطلق.
 */
const measure = E.stubMeasure;

function bench(label, fn, runs) {
  for (let i = 0; i < Math.min(runs, 20); i++) fn(); // إحماء
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
}

console.log('محرّك الفاتورة — قياسُ التخطيط (٨٠ملم، قالب classic)\n');
console.log('  أصناف │ زمن التخطيط │ أوامر الرسم │ ارتفاع │ بكسلات اللوحة │ ذاكرة اللوحة');
console.log('  ──────┼─────────────┼─────────────┼────────┼───────────────┼─────────────');

const rows = [];
for (const n of [1, 10, 30, 100]) {
  const model = receipt(n);
  const call = () => E.layoutReceipt({
    receipt: model, measure, paperWidth: 576, theme: 'classic', currency: '﷼',
  });
  const out = call();
  const ms = bench(String(n), call, 200);
  // اللوحةُ أربعةُ بايتاتٍ للبكسل (RGBA) -- وهي أكبرُ ما يُحجز في
  // الطباعة كلِّها، وأوّلُ ما يُتَّهم عند انهيار ذاكرة.
  const px = out.width * out.height;
  const mb = (px * 4) / 1048576;
  rows.push({ n, ms, ops: out.ops.length, h: out.height, px, mb });
  console.log(
    `  ${String(n).padStart(6)} │ ${ms.toFixed(3).padStart(8)} ms │ ${String(out.ops.length).padStart(11)} │ ${String(out.height).padStart(6)} │ ${String(px).padStart(13)} │ ${mb.toFixed(2).padStart(8)} م.ب`,
  );
}

console.log('\nالمستندات الأخرى (طلب من ١٠ أصناف):');
const kitchen = {
  branchName: 'الفرع الرئيسي', dateLabel: '2026/09/08 — 14:32', metaLabel: 'محلي',
  orderNumber: '1042', cashierName: 'عمّار',
  items: Array.from({ length: 10 }, (_, i) => item(i + 1)),
};
const kMs = bench('kitchen', () => E.layoutKitchenTicket({ ticket: kitchen, measure, paperWidth: 576 }), 200);
const kOut = E.layoutKitchenTicket({ ticket: kitchen, measure, paperWidth: 576 });
console.log(`  تذكرة المطبخ   ${kMs.toFixed(3)} ms — ${kOut.ops.length} أمر — ارتفاع ${kOut.height}`);

const report = {
  businessName: 'مقهى هبيّة', branchName: 'الفرع الرئيسي', dateLabel: '2026/09/08 — 23:10',
  staffName: 'عمّار', shiftStart: '07:00',
  grossSales: 4820.5, discountsTotal: 120, refundsTotal: 63, refundsCount: 3,
  vatTotal: 611.28, netSales: 4637.5, cashSales: 1900, cardTotal: 2500,
  deliveryPlatformTotal: 237.5, onlineTotal: 0, openingCash: 300,
  cashExpected: 2137, cashCounted: 2130, cashVariance: -7, ordersCount: 214, avgTicket: 21.67,
};
const sMs = bench('shift', () => E.layoutShiftReport({ report, measure, paperWidth: 576, currency: '﷼' }), 200);
const sOut = E.layoutShiftReport({ report, measure, paperWidth: 576, currency: '﷼' });
console.log(`  تقرير الوردية  ${sMs.toFixed(3)} ms — ${sOut.ops.length} أمر — ارتفاع ${sOut.height}`);

console.log('\nالتقديرُ السخيُّ الذي كان يُحجز قبل حساب الارتفاع:');
for (const r of rows) {
  const old = 2400 + r.n * 200;
  const oldMb = (576 * old * 4) / 1048576;
  console.log(`  ${String(r.n).padStart(3)} صنف: ${old} بدل ${r.h} — ${oldMb.toFixed(1)} م.ب بدل ${r.mb.toFixed(1)} م.ب (وفّرنا ${(100 - (r.h / old) * 100).toFixed(0)}٪)`);
}

await rm(TMP, { recursive: true, force: true });
