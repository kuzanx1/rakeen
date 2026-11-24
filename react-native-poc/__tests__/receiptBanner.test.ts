import { BANNER_COPY, PAD, PAPER, layoutReceipt, stubMeasure } from '../../shared/receipt';
import type { BannerKind, DrawOp, RectOp, ReceiptModel, TextOp } from '../../shared/receipt';

/**
 * شريطُ الفاتورة الوطنيّ -- ما لا تمسكه الصورةُ المرجعية.
 *
 * الانحدارُ البصريُّ يُصوّر الورقةَ ويقارنها، فيمسك ما تغيّر شكلُه.
 * وهذه تمسك ما لا شكلَ له:
 *
 *   • كتلةٌ سوداءُ أقصرُ من نصِّها الأبيض -- والسطرُ الخارجُ عنها أبيضُ
 *     على ورقٍ أبيض، أي غائبٌ تماماً. والصورةُ المرجعيةُ تُعتمد على ما
 *     فيها، فلو وُلدت ناقصةً لَبقي النقصُ مرجعاً.
 *   • وسطرٌ يتجاوز عرضَ الورقة فيُقصّ عند الطبع -- ولا شيءَ في المعاينة
 *     يقول إنّه قُصّ.
 *   • وشريطٌ يُطبع بعد إطفائه، وهو أسوأُ ما يقع في ميزةٍ مؤقّتة.
 */

const RIYAL = 'ر.س';

function model(): ReceiptModel {
  return {
    businessName: 'مقهى هبيّة', tagline: 'قهوة مختصة',
    branchName: 'الفرع الرئيسي', vatNumber: '310000000000003',
    orderNumber: '1042', dateLabel: '2026/09/08 — 14:32',
    cashierName: 'عمّار', metaLabel: 'محلي',
    items: [{ name: 'سبانيش لاتيه', nameEn: 'Spanish Latte', qty: 1, unitPrice: 18, lineTotal: 18, mods: [], note: null }],
    subtotal: 18, discount: 0, vat: 2.35, total: 18,
    paymentMethodLabel: 'نقداً', change: 0,
  };
}

const lay = (banner: BannerKind | null, paperWidth: number = PAPER.mm80) =>
  layoutReceipt({ receipt: model(), measure: stubMeasure, paperWidth, theme: 'classic', currency: RIYAL, banner });

const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.op === 'text');
const displayTexts = (ops: DrawOp[]): TextOp[] => texts(ops).filter(t => t.family === 'display');

function leftEdge(t: TextOp): number {
  const w = stubMeasure(t.text, t.size, t.weight, t.family);
  if (t.align === 'right') return t.x - w;
  if (t.align === 'center') return t.x - w / 2;
  return t.x;
}

const KINDS: BannerKind[] = ['shield', 'plain', 'invert'];

describe('شريط الفاتورة', () => {
  it('«بلا شريط» لا يرسم شيئاً ولا يطيل الورقة', () => {
    const off = lay('none');
    const nothing = lay(null);
    expect(displayTexts(off.ops)).toHaveLength(0);
    expect(off.height).toBe(nothing.height);
    expect(off.ops.length).toBe(nothing.ops.length);
  });

  it.each(KINDS)('«%s» يُطبع بخطّ العرض لا بخطّ النصّ', (kind) => {
    const drawn = displayTexts(lay(kind).ops);
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    // والسطرُ الكبيرُ كبيرٌ فعلاً: فوق اسمِ المنشأة (٣٠)، وهو المقصود.
    expect(Math.max(...drawn.map(t => t.size))).toBeGreaterThan(30);
  });

  it.each(KINDS)('«%s» يبقى داخل الورقة في العرضين', (kind) => {
    for (const width of [PAPER.mm80, PAPER.mm58]) {
      for (const t of displayTexts(lay(kind, width).ops)) {
        const left = leftEdge(t);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + stubMeasure(t.text, t.size, t.weight, t.family)).toBeLessThanOrEqual(width);
      }
      for (const op of lay(kind, width).ops) {
        if (op.op === 'rect') {
          expect(op.x).toBeGreaterThanOrEqual(0);
          expect(op.x + op.w).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  /**
   * الكتلةُ السوداءُ تَسَعُ كلَّ ما كُتب فوقها.
   *
   * وهو الفحصُ الذي لولاه لَمرّ سطرٌ أبيضُ خارجَ كتلته صامتاً: لا خطأ،
   * ولا تداخل، ولا شيءَ ينقص في عدد العمليات -- ورقةٌ ينقصها سطر.
   */
  it('«خلفية سوداء»: كلُّ نصٍّ أبيضَ داخلَ الكتلة السوداء', () => {
    for (const width of [PAPER.mm80, PAPER.mm58]) {
      const ops = lay('invert', width).ops;
      const block = ops.filter((o): o is RectOp => o.op === 'rect' && o.color === 'ink' && o.h > 40)
        .sort((a, b) => b.h - a.h)[0];
      expect(block).toBeTruthy();
      const white = texts(ops).filter(t => t.color === 'paper');
      expect(white.length).toBeGreaterThanOrEqual(3);
      for (const t of white) {
        expect(t.y - t.size / 2).toBeGreaterThanOrEqual(block.y);
        expect(t.y + t.size / 2).toBeLessThanOrEqual(block.y + block.h);
        expect(leftEdge(t)).toBeGreaterThanOrEqual(block.x);
      }
      const marks = ops.filter((o): o is RectOp => o.op === 'rect' && o.color === 'paper');
      expect(marks.length).toBeGreaterThan(20);
      for (const m of marks) {
        expect(m.y).toBeGreaterThanOrEqual(block.y);
        expect(m.y + m.h).toBeLessThanOrEqual(block.y + block.h);
      }
    }
  });

  it.each(KINDS)('«%s» تحت هويّة المطعم وفوق بيانات المعاملة', (kind) => {
    const ops = lay(kind).ops;
    const all = texts(ops);
    const tagline = all.find(t => t.text === 'قهوة مختصة');
    const branch = all.find(t => t.text === 'الفرع الرئيسي');
    const head = all.find(t => t.family === 'display');
    expect(tagline && branch && head).toBeTruthy();
    expect(head!.y).toBeGreaterThan(tagline!.y);
    expect(head!.y).toBeLessThan(branch!.y);
  });

  it('نصُّ الشريط مصدرُه المحرّك، فيصل الورقةَ كما هو', () => {
    const drawn = displayTexts(lay('shield').ops).map(t => t.text);
    expect(drawn).toContain(BANNER_COPY.shield.head);
    expect(drawn).toContain(BANNER_COPY.shield.sub);
  });

  it('الزخرفةُ مرسومةٌ بنقاطٍ لا بمسارٍ مائل', () => {
    const ops = lay('plain').ops;
    const thin = ops.filter(o => o.op === 'rect' && o.h === 1);
    // مثلّثا سدو من صفوفٍ بعرضٍ متدرّج -- لا خطَّ واحدٍ مائل.
    expect(thin.length).toBeGreaterThan(100);
    // وبعرضٍ متدرّج فعلاً -- صفوفٌ متساويةُ العرض شريطٌ لا مثلّث.
    const widths = new Set(thin.map(o => (o as { w: number }).w));
    expect(widths.size).toBeGreaterThan(4);
  });

  it.each(KINDS)('«%s»: ما يأكله من ورقٍ معلومٌ ومحدود', (kind) => {
    const extra = lay(kind).height - lay('none').height;
    expect(extra).toBeGreaterThan(8 * 18);
    // وسقفٌ مقصود: خمسةُ سنتيمترات من ورقٍ لشريطٍ ضيفٍ على ورقة المطعم كثير.
    expect(extra).toBeLessThan(8 * 50);
  });
});
