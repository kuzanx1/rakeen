import { buildOrderPayload } from '../src/domain/order';
import type { OrderBuildContext } from '../src/domain/order';
import type { CartLine } from '../src/domain/cart';
import type { Product } from '../src/domain/catalog';
import { PAPER, layoutReceipt, stubMeasure } from '../../shared/receipt';
import { toReceiptPrintable } from '../src/domain/receiptPrintable';

/** أقلُّ ما تقوم به فاتورة: ما عداه يأتي من كل حالة. */
const RECEIPT_BASE = {
  businessName: 'مقهى هبيّة',
  orderNumber: '1042',
  dateLabel: '2026/11/20 — 20:05',
  metaLabel: 'جوال',
  items: [{ name: 'برجر طارق', qty: 1, unitPrice: 25, lineTotal: 25, mods: [], note: null }],
  subtotal: 25,
  discount: 0,
  vat: 3.26,
  total: 25,
  paymentMethodLabel: 'نقداً',
  change: 0,
};

/**
 * آخرُ أربعةٍ تصل الخادمَ، لا تقف عند الشاشة.
 *
 * كانت `platform_invoice_last4: null` مكتوبةً في بناء الحمولة. فالشاشةُ
 * تجمع الأربعةَ وتمنع التأكيد قبلها، والسياقُ يحملها، والخادمُ يخزّنها
 * -- ثم تُلقى في آخرِ خطوة. فكلُّ طلبٍ خرج من التطبيق خرج بخانةٍ
 * فارغة، سنةً كاملة، ولا أحدَ يشتكي: لا خطأَ يظهر، إنما رقمٌ غائب.
 *
 * كشفَه صاحبُ المطعم بالعدّ لا بالنظر: ١٦ طلب جوالٍ في يومٍ واحد عند
 * «كباب طارق»، ولا أربعةَ في واحدٍ منها (٢٠٢٦/١١/٢٠).
 *
 * والحارسُ الذي كُتب لهذه الخانة أمس (accounting-checks/last4-reset.cjs)
 * كان يفحص الشاشةَ ومرّ -- فالطبقةُ التي تُفحص يجب أن تكون التي تُرسل.
 */

const PRODUCT: Product = {
  id: 1,
  name: 'برجر طارق',
  price: 25,
  categoryId: 1,
} as unknown as Product;

const line: CartLine = { lineId: 1, productId: 1, qty: 1, note: '', config: null } as CartLine;

const ctx = (over: Partial<OrderBuildContext> = {}): OrderBuildContext =>
  ({
    branchId: 111,
    shiftId: 215,
    staffMemberId: 39,
    customerName: null,
    customerPhone: null,
    customerId: null,
    discountPct: 0,
    discountAmount: 0,
    discountReason: null,
    vatAmount: 3.26,
    total: 25,
    subtotal: 25,
    channel: 'delivery',
    deliveryPlatformId: null,
    platformInvoiceLast4: null,
    tableId: null,
    paymentMethod: 'cash',
    cashAmount: 25,
    optionStock: {},
    stockUnitById: {},
    ...over,
  }) as OrderBuildContext;

const build = (over: Partial<OrderBuildContext> = {}) =>
  buildOrderPayload([line], new Map([[1, PRODUCT]]), {}, () => 25, ctx(over));

describe('آخرُ أربعةٍ في حمولة الطلب', () => {
  it('طلبُ الجوال يحملها إلى الخادم', () => {
    expect(build({ platformInvoiceLast4: '7788' }).platform_invoice_last4).toBe('7788');
  });

  it('وطلبُ تطبيق التوصيل يحمل رقمَ فاتورته كذلك', () => {
    expect(
      build({ deliveryPlatformId: 29, platformInvoiceLast4: '4421' }).platform_invoice_last4,
    ).toBe('4421');
  });

  it('وبلا أربعةٍ تُرسل فارغةً لا نصّاً فارغاً', () => {
    expect(build({ platformInvoiceLast4: null }).platform_invoice_last4).toBeNull();
    expect(build({ platformInvoiceLast4: '' }).platform_invoice_last4).toBeNull();
  });

  it('ولا تُرسل في غير التوصيل -- ولو بقيت في الشاشة', () => {
    expect(build({ channel: 'pickup', platformInvoiceLast4: '7788' }).platform_invoice_last4).toBeNull();
    expect(build({ channel: 'dine_in', platformInvoiceLast4: '7788' }).platform_invoice_last4).toBeNull();
  });

  it('والقناةُ والمنصّةُ معها على ما هما', () => {
    const p = build({ deliveryPlatformId: 29, platformInvoiceLast4: '4421' });
    expect(p.channel).toBe('delivery');
    expect(p.delivery_platform_id).toBe(29);
  });
});

/**
 * وعنوانُ الأربعة على فاتورة العميل يتبع المصدر.
 *
 * كان مكتوباً «آخر ٤ أرقام فاتورة التطبيق» في كل حال -- فطلبٌ جاء
 * بالهاتف تُكتب على ورقته فاتورةُ تطبيقٍ لا وجودَ له. (أبلغه صاحبُ
 * المطعم بعد تجربةٍ حقيقية، ٢٠٢٦/١١/٢٠.)
 */
describe('عنوانُ الأربعة على الورقة', () => {
  const texts = (model: Record<string, unknown>) =>
    layoutReceipt({
      receipt: { ...RECEIPT_BASE, ...model } as never,
      measure: stubMeasure,
      paperWidth: PAPER.mm80,
      theme: 'classic',
      currency: 'ر.س',
    })
      .ops.filter(o => o.op === 'text')
      .map(o => (o as { text: string }).text)
      .join(' | ');

  it('طلبُ الجوال: من جواله', () => {
    const out = texts({ platformInvoiceLast4: '7788', phoneOrder: true });
    expect(out).toContain('آخر ٤ أرقام من جواله');
    expect(out).not.toContain('فاتورة التطبيق');
  });

  it('وطلبُ التطبيق: من فاتورته', () => {
    const out = texts({ platformName: 'كيتا', platformInvoiceLast4: '4421' });
    expect(out).toContain('آخر ٤ أرقام فاتورة التطبيق');
    expect(out).not.toContain('من جواله');
  });

  it('وبلا أربعةٍ لا عنوانَ أصلاً', () => {
    const out = texts({});
    expect(out).not.toContain('آخر ٤ أرقام');
  });
});

/**
 * والسلسلة كاملةً: ReceiptData -> toReceiptPrintable -> تخطيط الورقة.
 *
 * الطبقةُ الوسطى (receiptPrintable) تنسخ الحقولَ حقلاً حقلاً، فحقلٌ
 * جديدٌ يُنسى فيها يصل الورقةَ فارغاً وإن كان صحيحاً في أصله -- وهي
 * نفسُ علّة آخرِ أربعة في الحمولة.
 */
describe('الورقةُ من بياناتها الخام', () => {
  const data = (over: Record<string, unknown>) =>
    ({
      orderId: 1, orderNo: 1, offlineRef: null,
      lines: [{ name: 'برجر طارق', qty: 1, unitPrice: 25, lineTotal: 25 }],
      subtotal: 25, discount: 0, vat: 3.26, total: 25, paymentMethod: 'cash',
      tableNumber: null, businessName: 'مقهى هبيّة', metaLabel: 'جوال',
      platformInvoiceLast4: '7788', ...over,
    }) as never;

  const render = (d: never) =>
    layoutReceipt({
      receipt: toReceiptPrintable(d) as never,
      measure: stubMeasure,
      paperWidth: PAPER.mm80,
      theme: 'classic',
      currency: 'ر.س',
    })
      .ops.filter(o => o.op === 'text')
      .map(o => (o as { text: string }).text)
      .join(' | ');

  it('علامةُ الجوال تعبر الطبقةَ الوسطى إلى الورقة', () => {
    expect(render(data({ phoneOrder: true }))).toContain('من جواله');
  });

  it('وبدونها تبقى الورقةُ على فاتورة التطبيق', () => {
    expect(render(data({ phoneOrder: false, platformName: 'كيتا' }))).toContain('فاتورة التطبيق');
  });
});
