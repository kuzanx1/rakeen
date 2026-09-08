import {
  COLUMNS, LINE, PAD, PAPER, TYPE, layoutReceipt, stubMeasure, themeTokens,
} from '../../shared/receipt';
import type { DrawOp, ReceiptItem, ReceiptModel, TextOp } from '../../shared/receipt';

/**
 * اختبارُ المقارنة: الورقةُ تُحسب فتُقاس، لا تُنظر فيُقال حسنة.
 *
 * وهو ما لم يكن: كانت الورقةُ تُراجَع بالعين على المتصفّح، فما تغيّر في
 * راسمٍ ولم يتغيّر في الآخر لا يشتكي أحد -- الورقةُ تُطبع، وإنّما تُطبع
 * مختلفة. والعينُ لا ترى فرقَ نقطتين، والطابعةُ تراه.
 *
 * فيُثبَّت هنا ما يجب أن يبقى: لا تداخلَ بين عمود وعمود، ولا نصَّ يخرج
 * عن الورقة، ولا حرفَ دون ما تقدر الطابعةُ على طبعه. ثم بصمةٌ كاملة
 * للتخطيط -- فأيُّ تغييرٍ في مقاسٍ يظهر في الفرق قبل أن يُنشر.
 */

const RIYAL = 'ر.س';

function item(over: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    name: 'سبانيش لاتيه',
    nameEn: 'Spanish Latte',
    qty: 1,
    unitPrice: 18,
    lineTotal: 18,
    mods: [],
    note: null,
    ...over,
  };
}

function receipt(over: Partial<ReceiptModel> = {}): ReceiptModel {
  return {
    businessName: 'مقهى هبيّة',
    tagline: 'قهوة مختصة',
    branchName: 'الفرع الرئيسي',
    vatNumber: '310000000000003',
    orderNumber: '1042',
    dateLabel: '2026/09/08 — 14:32',
    cashierName: 'عمّار',
    metaLabel: 'محلي',
    items: [item()],
    subtotal: 18,
    discount: 0,
    vat: 2.35,
    total: 18,
    paymentMethodLabel: 'نقداً',
    change: 0,
    ...over,
  };
}

function layout(model: ReceiptModel, theme = 'classic', paperWidth: number = PAPER.mm80) {
  return layoutReceipt({
    receipt: model,
    measure: stubMeasure,
    paperWidth,
    theme,
    currency: RIYAL,
  });
}

const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.op === 'text');

/** الحافّةُ اليسرى للنصّ بحسب محاذاته -- فالموضعُ نقطةُ ارتساء لا يسار. */
function leftEdge(t: TextOp): number {
  const w = stubMeasure(t.text, t.size, t.weight, t.family);
  if (t.align === 'right') return t.x - w;
  if (t.align === 'center') return t.x - w / 2;
  return t.x;
}
const rightEdge = (t: TextOp): number => leftEdge(t) + stubMeasure(t.text, t.size, t.weight, t.family);

// ── ما يجب أن يصحّ في كلّ ورقة ──────────────────────────────────────
const SCENARIOS: Array<[string, ReceiptModel]> = [
  ['صنف واحد', receipt()],
  ['عشرة أصناف', receipt({
    items: Array.from({ length: 10 }, (_, i) =>
      item({ name: `صنف ${i + 1}`, nameEn: `Item ${i + 1}`, qty: (i % 3) + 1, lineTotal: 12 * ((i % 3) + 1) })),
    subtotal: 240, vat: 31.3, total: 240,
  })],
  ['ثلاثون صنفاً', receipt({
    items: Array.from({ length: 30 }, (_, i) =>
      item({ name: `منتج رقم ${i + 1}`, nameEn: null, qty: 1, lineTotal: 9.5 })),
    subtotal: 285, vat: 37.17, total: 285,
  })],
  ['اسم عربي طويل', receipt({
    items: [item({
      name: 'قهوة مختصة إثيوبية يرغاتشيف مقطّرة على البارد مع حليب الشوفان',
      nameEn: null,
    })],
  })],
  ['عربي وإنجليزي مختلط', receipt({
    items: [item({ name: 'آيس سبانيش لاتيه دبل شوت', nameEn: 'Iced Spanish Latte Double Shot' })],
  })],
  ['إضافات متعددة', receipt({
    items: [item({ mods: ['حليب شوفان', 'شوت إضافي', 'بدون سكر', 'ثلج قليل', 'كراميل'] })],
  })],
  ['ملاحظة طويلة', receipt({
    items: [item({ note: 'من فضلك اجعل القهوة ساخنة جداً وأضف الحليب على جانب الكوب بدون رغوة' })],
    orderNote: 'الطلب لشخصين، يرجى وضع كل مشروب في كيس منفصل مع مناديل إضافية',
  })],
  ['خصم', receipt({ subtotal: 100, discount: 15, vat: 11.09, total: 85 })],
  ['استرجاع', receipt({
    metaLabel: 'إشعار دائن — استرجاع',
    refundOfOrder: '#1042',
    items: [item({ lineTotal: -18, unitPrice: -18 })],
    subtotal: -18, vat: -2.35, total: -18,
  })],
];

const THEME_IDS = ['classic', 'compact', 'elegant', 'signature'];

describe('محرّك الفاتورة — ما لا يجوز أن يقع', () => {
  for (const [label, model] of SCENARIOS) {
    for (const theme of THEME_IDS) {
      describe(`${label} · ${theme}`, () => {
        const out = layout(model, theme);

        it('لا شيء يخرج عن الورقة', () => {
          for (const t of texts(out.ops)) {
            expect(leftEdge(t)).toBeGreaterThanOrEqual(-1);
            expect(rightEdge(t)).toBeLessThanOrEqual(out.width + 1);
          }
        });

        it('لا شيء يُرسم تحت آخر الورقة', () => {
          for (const op of out.ops) {
            const bottom = op.op === 'text' ? op.y + op.size : op.op === 'dash' ? op.y : op.y + op.h;
            expect(bottom).toBeLessThanOrEqual(out.height);
          }
        });

        it('لا حرف أدقّ ممّا تطبعه الطابعة', () => {
          // دون أربعةَ عشرَ تسقط سيقانُ العربية عند التحويل إلى لونين،
          // فيخرج الحرفُ مقطوعاً -- وهو العطلُ الذي شُكي منه.
          for (const t of texts(out.ops)) expect(t.size).toBeGreaterThanOrEqual(12);
        });

        it('الارتفاع موجب ومعقول', () => {
          expect(out.height).toBeGreaterThan(200);
          expect(out.height).toBeLessThan(20000);
        });
      });
    }
  }

  /**
   * التداخلُ بين الأعمدة: هو ما شُكي منه بالعين -- «الكمية والمنتج
   * تقطع الكلام اللي تحته». فيُقاس هنا بدل أن يُنظر.
   */
  it('لا يزحف الاسم على عمودَي الكمية والسعر', () => {
    const model = receipt({
      items: [item({
        name: 'قهوة مختصة إثيوبية يرغاتشيف مقطّرة على البارد مع حليب الشوفان والكراميل',
        nameEn: 'Ethiopian Yirgacheffe Cold Brew With Oat Milk And Caramel',
        qty: 3, lineTotal: 54,
      })],
    });
    const out = layout(model, 'classic');
    const qtyW = Math.round(out.width * COLUMNS.qty);
    const priceW = Math.round(out.width * COLUMNS.price);
    const nameRight = out.width - PAD - qtyW;
    const priceRight = PAD + priceW;

    const nameLines = texts(out.ops).filter(t => t.size === TYPE.itemName && t.align === 'right');
    expect(nameLines.length).toBeGreaterThan(1); // فعلاً التفّ
    for (const line of nameLines) {
      expect(rightEdge(line)).toBeLessThanOrEqual(nameRight + 1);
      expect(leftEdge(line)).toBeGreaterThanOrEqual(priceRight - 1);
    }
  });

  it('الكمية والسعر على سطر الاسم الأول لا على آخره', () => {
    const out = layout(receipt({
      items: [item({ name: 'اسم طويل جداً يلتفّ على أكثر من سطر بلا شكّ أبداً', qty: 2, lineTotal: 36 })],
    }), 'classic');
    const names = texts(out.ops).filter(t => t.size === TYPE.itemName);
    const qty = texts(out.ops).find(t => t.text === '2' && t.dir === 'ltr');
    expect(names.length).toBeGreaterThan(1);
    expect(qty).toBeDefined();
    expect(qty!.y).toBe(names[0].y);
  });

  /** فاتورةٌ مبسّطة بلا رقمٍ ضريبيّ مخالفة -- هيئة الزكاة، المرحلة الأولى. */
  it('الرقم الضريبي وعنوان الفاتورة في كل قالب', () => {
    for (const theme of THEME_IDS) {
      const out = layout(receipt(), theme);
      const all = texts(out.ops).map(t => t.text).join('\n');
      expect(all).toContain('310000000000003');
      expect(all).toContain('فاتورة ضريبية مبسطة');
      expect(all).toContain('ضريبة القيمة المضافة');
    }
  });

  it('رقم الطلب سطر قائم بذاته في كل قالب', () => {
    for (const theme of THEME_IDS) {
      const all = texts(layout(receipt(), theme).ops).map(t => t.text).join('\n');
      expect(all).toContain('1042');
    }
  });

  it('إشعار الاسترجاع يحمل رقم الطلب الأصلي', () => {
    const model = SCENARIOS.find(([l]) => l === 'استرجاع')![1];
    const all = texts(layout(model).ops).map(t => t.text).join('\n');
    expect(all).toContain('استرجاع من الطلب');
    expect(all).toContain('#1042');
  });

  it('سعر الوحدة لا يُطبع حين الكمية واحد', () => {
    const one = texts(layout(receipt({ items: [item({ qty: 1 })] })).ops).map(t => t.text);
    const two = texts(layout(receipt({ items: [item({ qty: 2, lineTotal: 36 })] })).ops).map(t => t.text);
    expect(one.some(t => t.includes('×'))).toBe(false);
    expect(two.some(t => t.includes('×'))).toBe(true);
  });

  it('الورقة تطول بطول الطلب', () => {
    const h1 = layout(SCENARIOS[0][1]).height;
    const h10 = layout(SCENARIOS[1][1]).height;
    const h30 = layout(SCENARIOS[2][1]).height;
    expect(h10).toBeGreaterThan(h1);
    expect(h30).toBeGreaterThan(h10);
  });
});

// ── ورقُ الثمانٍ والخمسين ────────────────────────────────────────────
describe('تغيير عرض الورق من مكان واحد', () => {
  it('كل شيء ينكمش معه ولا شيء يخرج عنه', () => {
    for (const [label, model] of SCENARIOS) {
      const out = layout(model, 'classic', PAPER.mm58);
      expect(out.width).toBe(PAPER.mm58);
      for (const t of texts(out.ops)) {
        expect(rightEdge(t)).toBeLessThanOrEqual(out.width + 1);
        expect(leftEdge(t)).toBeGreaterThanOrEqual(-1);
      }
      expect(label).toBeTruthy();
    }
  });

  it('الأعمدة نسبٌ لا أرقام، فتتبع الورق', () => {
    const wide = layout(receipt(), 'classic', PAPER.mm80);
    const narrow = layout(receipt(), 'classic', PAPER.mm58);
    expect(narrow.width / wide.width).toBeCloseTo(PAPER.mm58 / PAPER.mm80, 5);
  });
});

// ── سلامةُ المقاسات نفسِها ───────────────────────────────────────────
describe('المقاسات', () => {
  it('عمود الاسم يبقى أوسع عمود مهما تغيّر الورق', () => {
    for (const w of [PAPER.mm80, PAPER.mm58]) {
      const qty = Math.round(w * COLUMNS.qty);
      const price = Math.round(w * COLUMNS.price);
      const name = w - PAD * 2 - qty - price;
      expect(name).toBeGreaterThan(price);
      expect(name).toBeGreaterThan(qty);
    }
  });

  it('لا مقاس خطّ دون ما تطبعه الطابعة', () => {
    for (const [key, v] of Object.entries(TYPE)) {
      expect({ key, v }).toEqual({ key, v: expect.any(Number) });
      expect(v).toBeGreaterThanOrEqual(14);
    }
  });

  it('القوالب كلها معرّفة ولا واحد منها يسقط إلى الافتراضي بالخطأ', () => {
    for (const id of THEME_IDS) expect(themeTokens(id)).toBe(themeTokens(id));
    expect(themeTokens('لا-يوجد')).toBe(themeTokens('classic'));
  });

  it('وحدة الإيقاع والهامش ثابتتان معلومتان', () => {
    expect(LINE).toBe(32);
    expect(PAD).toBe(16);
  });
});

// ── البصمة: أيُّ تغييرٍ في التخطيط يظهر هنا قبل أن يُنشر ─────────────
describe('بصمة التخطيط', () => {
  /** يُختصر الأمرُ إلى سطرٍ مقروء: الفرقُ يجب أن يُقرأ لا أن يُفكّ. */
  const sign = (ops: DrawOp[]): string[] =>
    ops.map(o => {
      if (o.op === 'text') {
        return `T ${Math.round(o.x)},${Math.round(o.y)} ${o.size}/${o.weight} ${o.family} ${o.align} ${o.dir}${o.color === 'paper' ? ' inv' : ''} «${o.text}»`;
      }
      if (o.op === 'rect') return `R ${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}x${Math.round(o.h)}`;
      if (o.op === 'dash') return `D ${Math.round(o.y)} ${Math.round(o.x1)}→${Math.round(o.x2)} ${o.on}/${o.off}`;
      return `I ${o.ref} ${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}x${Math.round(o.h)}`;
    });

  for (const [label, model] of SCENARIOS) {
    for (const theme of THEME_IDS) {
      it(`${label} · ${theme}`, () => {
        const out = layout(model, theme);
        expect({ height: out.height, ops: sign(out.ops) }).toMatchSnapshot();
      });
    }
  }

  it('ورق ٥٨ملم · classic', () => {
    const out = layout(receipt(), 'classic', PAPER.mm58);
    expect({ height: out.height, ops: sign(out.ops) }).toMatchSnapshot();
  });
});
