import {
  PAPER, PAD, KITCHEN, SHIFT,
  layoutKitchenTicket, layoutShiftReport, stubMeasure,
} from '../../shared/receipt';
import type {
  DrawOp, KitchenTicketModel, LayoutResult, ReceiptItem, ShiftReportModel, TextOp,
} from '../../shared/receipt';

/**
 * تذكرةُ المطبخ وتقريرُ الوردية -- على المحرّك نفسِه، وبالحراسة نفسِها.
 *
 * كانا آخرَ راسمَين منفصلَين: تذكرةٌ في ملفّ الويب وأخرى في ملفّ
 * التطبيق، وتقريرٌ هنا وتقريرٌ هناك. ولم يُختبر أيٌّ منها قطّ -- تُطبع
 * فتُقرأ أو لا تُقرأ، ولا شيء بينهما.
 */

const RIYAL = '﷼';

function kItem(over: Partial<ReceiptItem> = {}): ReceiptItem {
  return { name: 'برجر دجاج', nameEn: 'Chicken Burger', qty: 1, unitPrice: 25, lineTotal: 25, mods: [], note: null, ...over };
}

function ticket(over: Partial<KitchenTicketModel> = {}): KitchenTicketModel {
  return {
    branchName: 'الفرع الرئيسي',
    dateLabel: '2026/09/08 — 14:32',
    metaLabel: 'محلي',
    orderNumber: '1042',
    cashierName: 'عمّار',
    items: [kItem()],
    ...over,
  };
}

function report(over: Partial<ShiftReportModel> = {}): ShiftReportModel {
  return {
    businessName: 'مقهى هبيّة',
    branchName: 'الفرع الرئيسي',
    dateLabel: '2026/09/08 — 23:10',
    staffName: 'عمّار',
    shiftStart: '2026/09/08 — 07:00',
    grossSales: 4820.5, discountsTotal: 120, refundsTotal: 63, refundsCount: 3,
    vatTotal: 611.28, netSales: 4637.5,
    cashSales: 1900, cardTotal: 2500, deliveryPlatformTotal: 237.5, onlineTotal: 0,
    openingCash: 300, cashExpected: 2137, cashCounted: 2130, cashVariance: -7,
    ordersCount: 214, avgTicket: 21.67,
    ...over,
  };
}

const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.op === 'text');

function leftEdge(t: TextOp): number {
  const w = stubMeasure(t.text, t.size, t.weight, t.family);
  if (t.align === 'right') return t.x - w;
  if (t.align === 'center') return t.x - w / 2;
  return t.x;
}
const rightEdge = (t: TextOp): number => leftEdge(t) + stubMeasure(t.text, t.size, t.weight, t.family);

/** ما يجب أن يصحّ في كلّ ورقةٍ مهما كان مستندُها. */
function assertSound(out: LayoutResult): void {
  for (const t of texts(out.ops)) {
    expect(leftEdge(t)).toBeGreaterThanOrEqual(-1);
    expect(rightEdge(t)).toBeLessThanOrEqual(out.width + 1);
    expect(t.size).toBeGreaterThanOrEqual(12);
  }
  for (const op of out.ops) {
    const bottom =
      op.op === 'text' ? op.y + op.size
      : op.op === 'dash' ? op.y
      : op.op === 'glyph' ? op.cy + op.size
      : op.y + op.h;
    expect(bottom).toBeLessThanOrEqual(out.height);
  }
  expect(out.height).toBeGreaterThan(150);
}

const sign = (ops: DrawOp[]): string[] =>
  ops.map(o => {
    if (o.op === 'text') return `T ${Math.round(o.x)},${Math.round(o.y)} ${o.size}/${o.weight} ${o.family} ${o.align} ${o.dir}${o.color === 'paper' ? ' inv' : ''} «${o.text}»`;
    if (o.op === 'rect') return `R ${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}x${Math.round(o.h)}`;
    if (o.op === 'dash') return `D ${Math.round(o.y)} ${Math.round(o.x1)}→${Math.round(o.x2)} ${o.on}/${o.off}`;
    if (o.op === 'glyph') return `G ${o.shape} ${Math.round(o.cx)},${Math.round(o.cy)} ${Math.round(o.size)}`;
    return `I ${o.ref} ${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}x${Math.round(o.h)}`;
  });

// ── تذكرةُ المطبخ ───────────────────────────────────────────────────
const KITCHEN_CASES: Array<[string, KitchenTicketModel, { width?: number; logo?: boolean }]> = [
  ['صنف واحد', ticket(), {}],
  ['بشعار', ticket(), { logo: true }],
  ['جهاز نداء بدل رقم الطلب', ticket({ pagerNumber: 17 }), {}],
  ['١٠ أصناف', ticket({ items: Array.from({ length: 10 }, (_, i) => kItem({ name: `صنف ${i + 1}`, nameEn: null, qty: (i % 4) + 1 })) }), {}],
  ['٣٠ صنفاً', ticket({ items: Array.from({ length: 30 }, (_, i) => kItem({ name: `منتج ${i + 1}`, nameEn: null })) }), {}],
  ['اسم عربي طويل جداً', ticket({ items: [kItem({ name: 'شاورما دجاج حارّة بالثوم والمخلل والبطاطس المقلية داخل خبز صاج كبير', nameEn: null })] }), {}],
  ['إضافات كثيرة', ticket({ items: [kItem({ mods: ['بدون بصل', 'إضافي صوص', 'جبن شيدر', 'بدون مخلل', 'حار جداً', 'خبز محمّص', 'بطاطس بدل السلطة'] })] }), {}],
  ['ملاحظة طويلة', ticket({ items: [kItem({ note: 'الزبون لديه حساسية من المكسرات، يرجى تنظيف السطح جيداً قبل التحضير وعدم استخدام نفس السكين' })] }), {}],
  ['٥٨ ملم', ticket(), { width: PAPER.mm58 }],
];

describe('تذكرة المطبخ', () => {
  for (const [label, model, o] of KITCHEN_CASES) {
    it(label, () => {
      const out = layoutKitchenTicket({
        ticket: model, measure: stubMeasure,
        paperWidth: o.width ?? PAPER.mm80,
        logo: o.logo ? { width: 300, height: 200 } : null,
      });
      assertSound(out);
      expect({ height: out.height, ops: sign(out.ops) }).toMatchSnapshot();
    });
  }

  it('لا مالَ على ورقة المطبخ -- لا سعرٌ ولا ضريبةٌ ولا إجمالي', () => {
    const out = layoutKitchenTicket({ ticket: ticket(), measure: stubMeasure, paperWidth: PAPER.mm80 });
    const all = texts(out.ops).map(t => t.text).join('\n');
    expect(all).not.toMatch(/ضريبة|الإجمالي|المجموع|﷼/);
  });

  it('جهاز النداء يحلّ محلّ رقم الطلب ولا يجتمعان', () => {
    const withPager = texts(layoutKitchenTicket({ ticket: ticket({ pagerNumber: 17 }), measure: stubMeasure, paperWidth: PAPER.mm80 }).ops).map(t => t.text);
    expect(withPager.join('\n')).toContain('جهاز النداء');
    expect(withPager).toContain('17');
    expect(withPager.join('\n')).not.toContain('رقم الطلب');
  });

  it('الإضافات مزاحة داخل الورقة لا خارجها', () => {
    const out = layoutKitchenTicket({
      ticket: ticket({ items: [kItem({ mods: ['بدون بصل وبدون مخلل وبدون طماطم مع صوص إضافي حار جداً على الجانب'] })] }),
      measure: stubMeasure, paperWidth: PAPER.mm80,
    });
    const subs = texts(out.ops).filter(t => t.size === KITCHEN.sub);
    expect(subs.length).toBeGreaterThan(0);
    for (const t of subs) expect(t.x).toBeLessThanOrEqual(out.width - PAD - KITCHEN.subIndent + 0.01);
  });

  it('القلب مرسوم لا مكتوب -- الإيموجي يخرج مربّعاً على الطابعة', () => {
    const out = layoutKitchenTicket({ ticket: ticket(), measure: stubMeasure, paperWidth: PAPER.mm80 });
    expect(out.ops.some(o => o.op === 'glyph' && o.shape === 'heart')).toBe(true);
    expect(texts(out.ops).map(t => t.text).join('')).not.toMatch(/[❤\u{1F600}-\u{1F64F}]/u);
  });
});

// ── تقريرُ إغلاق الوردية ────────────────────────────────────────────
const SHIFT_CASES: Array<[string, ShiftReportModel, number?]> = [
  ['كامل', report(), undefined],
  ['فرق موجب', report({ cashCounted: 2150, cashVariance: 13 }), undefined],
  ['بلا فرق', report({ cashCounted: 2137, cashVariance: 0 }), undefined],
  ['دفع إلكتروني مفعّل', report({ onlinePaymentsEnabled: true, onlineTotal: 415.75 }), undefined],
  ['أقسام مخفيّة', report({ options: { discounts: false, refunds: false, counts: false, signatures: false } }), undefined],
  ['أرقام كبيرة', report({ grossSales: 987654.32, netSales: 912345.67, cashSales: 456789.01, cashExpected: 457089.01, cashCounted: 457000, cashVariance: -89.01 }), undefined],
  ['٥٨ ملم', report(), PAPER.mm58],
];

describe('تقرير إغلاق الوردية', () => {
  for (const [label, model, width] of SHIFT_CASES) {
    it(label, () => {
      const out = layoutShiftReport({ report: model, measure: stubMeasure, paperWidth: width ?? PAPER.mm80, currency: RIYAL });
      assertSound(out);
      expect({ height: out.height, ops: sign(out.ops) }).toMatchSnapshot();
    });
  }

  it('معادلة الصندوق كاملة -- ما من رقم بلا أصل', () => {
    const all = texts(layoutShiftReport({ report: report(), measure: stubMeasure, paperWidth: PAPER.mm80, currency: RIYAL }).ops)
      .map(t => t.text).join('\n');
    for (const line of ['الرصيد الافتتاحي', 'مبيعات الكاش', 'مرتجعات كاش', 'المتوقع في الدرج', 'المعدود', 'الفرق']) {
      expect(all).toContain(line);
    }
  });

  it('الفرق داخل إطار -- هو السطر الوحيد الذي يُفتح عليه تحقيق', () => {
    const out = layoutShiftReport({ report: report(), measure: stubMeasure, paperWidth: PAPER.mm80, currency: RIYAL });
    const variance = texts(out.ops).find(t => t.size === SHIFT.variance);
    expect(variance).toBeDefined();
    // أربعةُ أضلاعٍ حول سطر الفرق
    const near = out.ops.filter(o => o.op === 'rect' && Math.abs(o.y - variance!.y) < out.height);
    expect(near.length).toBeGreaterThanOrEqual(4);
  });

  it('الدفع الإلكتروني لا يظهر لمن لم يفعّله', () => {
    const off = texts(layoutShiftReport({ report: report(), measure: stubMeasure, paperWidth: PAPER.mm80, currency: RIYAL }).ops).map(t => t.text).join('\n');
    const on = texts(layoutShiftReport({ report: report({ onlinePaymentsEnabled: true }), measure: stubMeasure, paperWidth: PAPER.mm80, currency: RIYAL }).ops).map(t => t.text).join('\n');
    expect(off).not.toContain('دفع إلكتروني');
    expect(on).toContain('دفع إلكتروني');
  });

  it('العملة واحدة في كل سطر مالي', () => {
    const rows = texts(layoutShiftReport({ report: report(), measure: stubMeasure, paperWidth: PAPER.mm80, currency: RIYAL }).ops)
      .filter(t => t.family === 'mono');
    expect(rows.length).toBeGreaterThan(8);
    for (const r of rows) {
      if (/\d/.test(r.text) && !/^[+-]?\d+$/.test(r.text)) expect(r.text).toContain(RIYAL);
    }
  });
});
