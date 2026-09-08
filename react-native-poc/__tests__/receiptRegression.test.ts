import { COLUMNS, PAD, PAPER, TYPE, layoutReceipt, stubMeasure } from '../../shared/receipt';
import type { DrawOp, LayoutResult, ReceiptItem, ReceiptModel, TextOp } from '../../shared/receipt';

/**
 * حالاتٌ لا يجوز أن تعود.
 *
 * كلُّ واحدةٍ منها شكلٌ من أشكال العطل الذي شُكي منه: نصٌّ يخرج عن
 * الورقة، أو يزحف على عمودٍ ليس له، أو يُقصّ عند الطبع ولا شيء في
 * المعاينة يقول إنّه قُصّ. وهي أوّلُ ما ينكسر حين يُعدَّل مقاس.
 *
 * والاختبارُ هنا لا يصف الشكلَ الحسن -- ذلك عملُ البصمات. إنّما يمنع
 * الفساد: أن يتداخل شيءٌ بشيء، أو يخرج عن حدّه.
 */

const RIYAL = '﷼';
const THEMES = ['classic', 'compact', 'elegant', 'signature'];

function item(over: Partial<ReceiptItem> = {}): ReceiptItem {
  return { name: 'لاتيه', nameEn: 'Latte', qty: 1, unitPrice: 18, lineTotal: 18, mods: [], note: null, ...over };
}

function receipt(over: Partial<ReceiptModel> = {}): ReceiptModel {
  return {
    businessName: 'مقهى هبيّة', tagline: 'قهوة مختصة', branchName: 'الفرع الرئيسي',
    vatNumber: '310000000000003', orderNumber: '1042', dateLabel: '2026/09/08 — 14:32',
    cashierName: 'عمّار', metaLabel: 'محلي', items: [item()],
    subtotal: 18, discount: 0, vat: 2.35, total: 18,
    paymentMethodLabel: 'نقداً', change: 0, ...over,
  };
}

const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.op === 'text');
function leftEdge(t: TextOp): number {
  const w = stubMeasure(t.text, t.size, t.weight, t.family);
  return t.align === 'right' ? t.x - w : t.align === 'center' ? t.x - w / 2 : t.x;
}
const rightEdge = (t: TextOp): number => leftEdge(t) + stubMeasure(t.text, t.size, t.weight, t.family);

function run(model: ReceiptModel, theme = 'classic', width: number = PAPER.mm80, currency = RIYAL): LayoutResult {
  return layoutReceipt({ receipt: model, measure: stubMeasure, paperWidth: width, theme, currency });
}

/** لا خروجَ عن الورقة، ولا رسمَ تحت آخرها، ولا حرفَ دون ما يُطبع. */
function assertContained(out: LayoutResult): void {
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
}

/** الاسمُ لا يزحف على عمودَي الكمية والسعر -- هذا معنى الشبكة. */
function assertColumnsIntact(out: LayoutResult): void {
  const qtyW = Math.round(out.width * COLUMNS.qty);
  const priceW = Math.round(out.width * COLUMNS.price);
  const nameRight = out.width - PAD - qtyW;
  const priceRight = PAD + priceW;
  for (const t of texts(out.ops).filter(t => t.size === TYPE.itemName && t.align === 'right')) {
    expect(rightEdge(t)).toBeLessThanOrEqual(nameRight + 1);
    expect(leftEdge(t)).toBeGreaterThanOrEqual(priceRight - 1);
  }
}

const AR_LONG = 'قهوة مختصة إثيوبية يرغاتشيف مقطّرة على البارد مع حليب الشوفان والكراميل المملّح ورشّة قرفة';
const EN_LONG = 'Ethiopian Yirgacheffe Single Origin Cold Brew With Oat Milk Salted Caramel And Cinnamon Dust';

const CASES: Array<[string, ReceiptModel]> = [
  ['اسم عربي طويل جداً', receipt({ items: [item({ name: AR_LONG, nameEn: null, qty: 3, lineTotal: 54 })] })],
  ['اسم إنجليزي طويل', receipt({ items: [item({ name: EN_LONG, nameEn: null, qty: 2, lineTotal: 36 })] })],
  ['خليط عربي وإنجليزي', receipt({ items: [item({ name: AR_LONG, nameEn: EN_LONG, qty: 2, lineTotal: 36 })] })],
  // كلمةٌ واحدةٌ أطولُ من العمود: لا فراغَ فيها يُلَفّ عنده.
  ['كلمة واحدة لا تُلَفّ', receipt({ items: [item({ name: 'قهوةمختصةإثيوبيةيرغاتشيفمقطّرةعلىالباردمعحليبالشوفان', nameEn: null })] })],
  ['إضافات كثيرة', receipt({ items: [item({ mods: ['حليب شوفان بدل الحليب العادي', 'شوت إسبريسو إضافي', 'بدون سكر نهائياً', 'ثلج قليل', 'كراميل مملّح', 'قرفة', 'كوب كبير'] })] })],
  ['ملاحظات طويلة', receipt({
    items: [item({ note: 'اجعل القهوة ساخنة جداً وأضف الحليب على جانب الكوب بدون رغوة نهائياً مع ملعقة إضافية' })],
    orderNote: 'الطلب لشخصين، يرجى وضع كل مشروب في كيس منفصل مع مناديل إضافية وشوكة بلاستيكية',
  })],
  ['خصم', receipt({ subtotal: 240, discount: 36, vat: 26.61, total: 204 })],
  ['خصم يبتلع الفاتورة', receipt({ subtotal: 100, discount: 100, vat: 0, total: 0 })],
  ['مرتجع', receipt({
    metaLabel: 'إشعار دائن — استرجاع', refundOfOrder: '#1042',
    items: [item({ qty: 2, unitPrice: -18, lineTotal: -36 })],
    subtotal: -36, discount: 0, vat: -4.7, total: -36, paymentMethodLabel: 'استرجاع كاش',
  })],
  // تقسيمُ الفاتورة: طريقتا دفعٍ في سطرٍ واحد -- وهو أطولُ سطرٍ ماليّ.
  ['تقسيم الفاتورة', receipt({
    subtotal: 240, vat: 31.3, total: 240, change: 15.5,
    paymentMethodLabel: 'مقسّمة · نقداً 120.00 ﷼ + شبكة 120.00 ﷼',
  })],
  // ضريبتان: النموذجُ يحمل حقلاً واحداً، فتُجمعان في سطرٍ يقول تركيبَه.
  ['أكثر من ضريبة', receipt({ subtotal: 200, vat: 40, total: 240, orderNote: 'ضريبة القيمة المضافة 30.00 + رسوم بلدية 10.00' })],
  ['باقي كبير', receipt({ total: 18, change: 482 })],
  ['بلا رقم ضريبي', receipt({ vatNumber: null })],
  ['بلا كاشير ولا نوع', receipt({ cashierName: null, metaLabel: null })],
  ['عميل باسم وجوال', receipt({ customerName: 'عبدالرحمن بن عبدالعزيز الشمري', customerPhone: '0557444227' })],
  ['رسالة ختام متعدّدة الأسطر', receipt({ customMessage: 'مدة الجلوس ٦٠ دقيقة\nشكراً لزيارتكم\nنسعد بملاحظاتكم على 0557444227' })],
];

describe('حالات لا يجوز أن تعود', () => {
  for (const [label, model] of CASES) {
    for (const theme of THEMES) {
      it(`${label} · ${theme}`, () => {
        const out = run(model, theme);
        assertContained(out);
        if (theme === 'classic' || theme === 'signature') assertColumnsIntact(out);
      });
    }
    it(`${label} · ٥٨ملم`, () => {
      const out = run(model, 'classic', PAPER.mm58);
      assertContained(out);
      assertColumnsIntact(out);
    });
  }
});

describe('العملة', () => {
  /**
   * العملةُ مُدخَلٌ لا ثابتٌ في الراسم.
   *
   * فلو أُريد يوماً ريالٌ ودولارٌ على ورقتين، أو تغيّر الرمزُ كما تغيّر
   * قبل عامين، فالتغييرُ في نداءٍ لا في تخطيط. ويُختبر أنّ الورقة تبقى
   * سليمةً مهما طال الرمز.
   */
  for (const cur of ['﷼', 'SAR', 'ر.س', 'USD', '$']) {
    it(`تبقى الورقة سليمة بـ«${cur}»`, () => {
      const out = run(receipt({ subtotal: 12345.67, vat: 1851.85, total: 14197.52 }), 'classic', PAPER.mm80, cur);
      assertContained(out);
      expect(texts(out.ops).map(t => t.text).join('\n')).toContain(cur);
    });
  }

  it('لا يبقى أثرٌ لرمزٍ قديم في التخطيط نفسِه', () => {
    const all = texts(run(receipt(), 'classic', PAPER.mm80, 'SAR').ops).map(t => t.text).join('\n');
    // ⃁ كان رمزَ التطبيق وحده، و«ريال» كلمةَ الويب وحده. ولا واحدَ منهما
    // مكتوبٌ في المحرّك -- العملةُ تأتي من خارجه دائماً.
    expect(all).not.toContain('⃁');
    expect(all).not.toContain('﷼');
  });
});

describe('حدود الطلب', () => {
  for (const n of [1, 10, 30, 100]) {
    it(`${n} صنفاً -- الورقة سليمة وأطول ممّا قبلها`, () => {
      const model = receipt({
        items: Array.from({ length: n }, (_, i) =>
          item({ name: `صنف ${i + 1}`, nameEn: `Item ${i + 1}`, qty: (i % 3) + 1, lineTotal: 12 * ((i % 3) + 1) })),
        subtotal: 24 * n, vat: 3.13 * n, total: 24 * n,
      });
      const out = run(model);
      assertContained(out);
      assertColumnsIntact(out);
      expect(texts(out.ops).filter(t => t.size === TYPE.itemName).length).toBeGreaterThanOrEqual(n);
    });
  }

  it('طلبٌ فارغ لا يكسر الورقة', () => {
    const out = run(receipt({ items: [], subtotal: 0, vat: 0, total: 0 }));
    assertContained(out);
    expect(texts(out.ops).map(t => t.text).join('\n')).toContain('الإجمالي');
  });
});
