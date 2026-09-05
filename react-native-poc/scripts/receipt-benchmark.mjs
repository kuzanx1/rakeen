// Twenty real receipts through the real builder: payload size, build time,
// and a rendered image of the largest one.
//
// This is the software half of the benchmark. It cannot measure
// time-to-paper — that needs the printer — and it does not pretend to.
// What it does measure is every millisecond and every byte the app is
// responsible for, which is the half that was previously unmeasured and
// the half that any regression will show up in first.
import { renderReceipt, cacheLogo } from '../src/domain/receiptRenderEscPos.ts';
import { resolveCapabilities } from '../src/domain/printerCapability.ts';
import { render } from './escpos-simulate.mjs';

const caps = resolveCapabilities('sunmi-nt310', 576);

// A logo the size a real one would be, encoded once — the point being to
// prove the cache means it is NOT re-encoded per receipt.
const LOGO_W = 240, LOGO_H = 96;
const logoData = new Uint8Array(LOGO_W * LOGO_H * 4);
for (let i = 0; i < LOGO_W * LOGO_H; i++) {
  const dark = (i * 7919) % 11 < 4;
  logoData[i * 4] = logoData[i * 4 + 1] = logoData[i * 4 + 2] = dark ? 0 : 255;
  logoData[i * 4 + 3] = 255;
}
cacheLogo('hbiah', { width: LOGO_W, height: LOGO_H, data: logoData }, caps);

const PRODUCTS = [
  ['لاتيه', 15], ['سبانيش لاتيه', 16], ['وايت موكا', 16], ['قهوة عربية', 12],
  ['سبانيش لاتيه بارد', 17], ['كرك', 10], ['تشيز كيك', 22], ['كروسان جبن', 18],
  ['أمريكانو', 14], ['V60 بارد', 19],
];
const MODS = [
  { label: 'شوت إضافي', amount: 3 }, { label: 'حليب شوفان', amount: 2 },
  { label: 'بدون سكر', amount: 0 }, { label: 'ثلج زيادة', amount: 0 },
];

function makeReceipt(n, itemCount, withMods, withCharges) {
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const [name, price] = PRODUCTS[(n + i) % PRODUCTS.length];
    const qty = ((n + i) % 3) + 1;
    const modifiers = withMods && i % 2 === 0 ? [MODS[(n + i) % MODS.length], MODS[(n + i + 1) % MODS.length]] : [];
    const modTotal = modifiers.reduce((s, m) => s + m.amount, 0);
    items.push({
      name, qty, unitPrice: price + modTotal,
      lineTotal: (price + modTotal) * qty,
      modifiers,
      note: withMods && i === 1 ? 'سريع من فضلك' : undefined,
    });
  }
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const charges = withCharges
    ? [{ label: 'التوصيل · Delivery', amount: 15 }, { label: 'الخدمة · Service', amount: subtotal * 0.05 }]
    : [];
  const chargeTotal = charges.reduce((s, c) => s + c.amount, 0);
  const discount = n % 4 === 0 ? 10 : 0;
  const net = subtotal + chargeTotal - discount;
  const vat = net * 0.15;
  return {
    businessName: 'هَبيّة | Hbiah',
    branchName: 'الفرع الرئيسي',
    addressLine: 'حي البيعة - الطائف',
    phone: '0555555555',
    vatNumber: '310000000000003',
    orderNumber: String(300 + n),
    orderKind: (['dineIn', 'takeaway', 'delivery', 'pickup'])[n % 4],
    tableNumber: n % 4 === 0 ? String((n % 12) + 1) : undefined,
    customerName: n % 3 === 0 ? 'محمد القحطاني' : undefined,
    customerPhone: n % 3 === 0 ? '0501234567' : undefined,
    cashierName: 'سارة',
    dateLabel: '5 سبتمبر 2026',
    timeLabel: '02:14 ص',
    items,
    subtotal, discount, vat, charges,
    total: net + vat,
    paymentMethodLabel: n % 2 ? 'كاش · Cash' : 'مدى · Mada',
    paidAmount: Math.ceil((net + vat) / 10) * 10,
    change: Math.ceil((net + vat) / 10) * 10 - (net + vat),
    customMessage: 'شكراً لزيارتكم',
    qrPayload: 'AQ5IYmlhaAIPMzEwMDAwMDAwMDAwMDAzAxQyMDI2LTA5LTA1VDAyOjE0OjAwWgQFODAuMDAFBDEyLjA=',
    barcodeValue: `RK${300 + n}`,
    logoKey: 'hbiah',
  };
}

// Small / medium / large, cycling — a real day's mix, not twenty of one shape.
const SHAPES = [
  { items: 2, mods: false, charges: false, label: 'صغيرة' },
  { items: 5, mods: true, charges: false, label: 'متوسطة' },
  { items: 9, mods: true, charges: true, label: 'كبيرة' },
];

const rows = [];
for (let n = 0; n < 20; n++) {
  const shape = SHAPES[n % SHAPES.length];
  const model = makeReceipt(n, shape.items, shape.mods, shape.charges);
  const t0 = process.hrtime.bigint();
  const out = renderReceipt(model, caps);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  rows.push({ n, shape: shape.label, ms, bytes: out.bytes.length, strategy: out.strategy, raster: out.needsRaster.length });
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
const times = rows.map(r => r.ms);
const sizes = rows.map(r => r.bytes);

console.log('عشرون فاتورة حقيقية — عربي وإنجليزي، أصناف وكميات وأسعار،');
console.log('إضافات وملاحظات وخصم وضريبة ورسوم، شعار ورمز QR وباركود.\n');
console.log('  #  الشكل     بناء(ms)   حجم(bytes)  مسار');
for (const r of rows) {
  console.log(`  ${String(r.n).padStart(2)}  ${r.shape.padEnd(8)}  ${r.ms.toFixed(2).padStart(7)}   ${String(r.bytes).padStart(8)}   ${r.strategy}`);
}
console.log();
console.log(`زمن البناء   P50 ${pct(times,0.5).toFixed(2)} ms | P95 ${pct(times,0.95).toFixed(2)} ms | Max ${Math.max(...times).toFixed(2)} ms`);
console.log(`حجم الحمولة  P50 ${(pct(sizes,0.5)/1024).toFixed(1)} KB | P95 ${(pct(sizes,0.95)/1024).toFixed(1)} KB | Max ${(Math.max(...sizes)/1024).toFixed(1)} KB`);
console.log(`المسار       ${rows.filter(r=>r.strategy==='fast').length}/20 نصّي كامل`);

// The largest receipt, rendered as paper.
const big = makeReceipt(2, 9, true, true);
const r = await render(renderReceipt(big, caps).bytes, process.argv[2] ?? './benchmark-receipt.png');
console.log(`\nأكبر فاتورة: ${r.paperMm} مم ورق`);
