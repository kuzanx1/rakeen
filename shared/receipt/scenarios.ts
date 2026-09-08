/**
 * الحالاتُ المرجعية -- مصدرٌ واحدٌ للويب وللأيباد.
 *
 * المقارنةُ البصريةُ لا تصحّ إلّا إذا كانت الورقتان لطلبٍ واحد. ولو
 * كُتبت الحالاتُ هنا ونظائرُها هناك لَاختلفتا بحرفٍ أو بكمية، ثمّ
 * قِيست الصورتان فاختلفتا -- ولا يُدرى: أالخطُّ اختلف أم الطلب؟
 *
 * فهي هنا مرّةً واحدة: يبنيها فحصُ الانحدار البصريّ في CI، ويبنيها
 * التطبيقُ في شاشة التشخيص. وكلُّ حالةٍ باسمها، فتُقارن صورةٌ بصورةٍ
 * تحمل الاسمَ نفسَه.
 */

import type { KitchenTicketModel } from './kitchenLayout';
import type { ShiftReportModel } from './shiftLayout';
import { PAPER } from './tokens';
import type { ReceiptItem, ReceiptModel } from './types';

const AR_LONG = 'قهوة مختصة إثيوبية يرغاتشيف مقطّرة على البارد مع حليب الشوفان والكراميل';
const EN_LONG = 'Ethiopian Yirgacheffe Cold Brew With Oat Milk And Salted Caramel';

function item(o: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    name: 'سبانيش لاتيه', nameEn: 'Spanish Latte',
    qty: 1, unitPrice: 18, lineTotal: 18, mods: [], note: '', ...o,
  };
}

const BASE: ReceiptModel = {
  businessName: 'مقهى هبيّة', tagline: 'قهوة مختصة',
  branchName: 'الفرع الرئيسي', vatNumber: '310000000000003',
  orderNumber: '1042', dateLabel: '2026/09/08 — 14:32',
  cashierName: 'عمّار', metaLabel: 'محلي',
  items: [item()],
  subtotal: 18, discount: 0, vat: 2.35, total: 18,
  paymentMethodLabel: 'نقداً', change: 0,
  customMessage: 'شكراً لزيارتكم',
};

const R = (o: Partial<ReceiptModel> = {}): ReceiptModel => ({ ...BASE, ...o });

const many = (n: number): ReceiptItem[] =>
  Array.from({ length: n }, (_, i) =>
    item({ name: `صنف ${i + 1}`, nameEn: `Item ${i + 1}`, qty: (i % 3) + 1, lineTotal: 12 * ((i % 3) + 1) }));

export const RECEIPT_SCENARIOS: Array<[string, ReceiptModel]> = [
  ['one-item', R()],
  ['ten-items', R({ items: many(10), subtotal: 240, vat: 31.3, total: 240 })],
  ['thirty-items', R({ items: many(30), subtotal: 720, vat: 93.9, total: 720 })],
  ['long-arabic', R({ items: [item({ name: AR_LONG, nameEn: null, qty: 3, lineTotal: 54 })] })],
  ['mixed-ar-en', R({ items: [item({ name: AR_LONG, nameEn: EN_LONG, qty: 2, lineTotal: 36 })] })],
  ['many-mods', R({ items: [item({ mods: ['حليب شوفان', 'شوت إضافي', 'بدون سكر', 'ثلج قليل', 'كراميل مملّح'] })] })],
  ['long-notes', R({
    items: [item({ note: 'اجعل القهوة ساخنة جداً وأضف الحليب على جانب الكوب بدون رغوة' })],
    orderNote: 'الطلب لشخصين، يرجى وضع كل مشروب في كيس منفصل مع مناديل إضافية',
  })],
  ['discount', R({ subtotal: 240, discount: 36, vat: 26.61, total: 204 })],
  ['refund', R({
    metaLabel: 'إشعار دائن — استرجاع', refundOfOrder: '#1042',
    items: [item({ qty: 2, unitPrice: -18, lineTotal: -36 })],
    subtotal: -36, vat: -4.7, total: -36, paymentMethodLabel: 'استرجاع كاش',
  })],
  ['split-bill', R({
    subtotal: 240, vat: 31.3, total: 240, change: 15.5,
    paymentMethodLabel: 'مقسّمة · نقداً 120.00 ﷼ + شبكة 120.00 ﷼',
  })],
  ['customer', R({ customerName: 'عبدالرحمن الشمري', customerPhone: '0557444227' })],
];

export const THEME_IDS = ['classic', 'compact', 'elegant', 'signature'] as const;

export const KITCHEN_SCENARIO: KitchenTicketModel = {
  branchName: 'الفرع الرئيسي', dateLabel: '2026/09/08 — 14:32',
  metaLabel: 'محلي', orderNumber: '1042', cashierName: 'عمّار',
  items: [
    item({ name: 'برجر دجاج', nameEn: 'Chicken Burger', qty: 2, mods: ['بدون بصل', 'صوص إضافي'] }),
    item({ name: AR_LONG, nameEn: null, qty: 1, note: 'حساسية من المكسرات — نظّف السطح قبل التحضير' }),
  ],
};

export const SHIFT_SCENARIO: ShiftReportModel = {
  businessName: 'مقهى هبيّة', branchName: 'الفرع الرئيسي',
  dateLabel: '2026/09/08 — 23:10', staffName: 'عمّار', shiftStart: '2026/09/08 — 07:00',
  grossSales: 4820.5, discountsTotal: 120, refundsTotal: 63, refundsCount: 3,
  vatTotal: 611.28, netSales: 4637.5,
  cashSales: 1900, cardTotal: 2500, deliveryPlatformTotal: 237.5, onlineTotal: 0,
  openingCash: 300, cashExpected: 2137, cashCounted: 2130, cashVariance: -7,
  ordersCount: 214, avgTicket: 21.67,
};

export type ScenarioDoc = 'receipt' | 'kitchen' | 'shift';

export interface Scenario {
  /** الاسمُ الذي تُسمّى به الصورةُ المرجعية -- به تُقارن صورةٌ بصورة. */
  id: string;
  doc: ScenarioDoc;
  model: ReceiptModel | KitchenTicketModel | ShiftReportModel;
  theme?: string;
  width?: number;
}

/** كلُّ ما يُصوَّر ويُقارن -- في الويب وعلى الجهاز سواء. */
export function buildScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const [id, model] of RECEIPT_SCENARIOS) {
    for (const theme of THEME_IDS) out.push({ id: `receipt-${id}-${theme}`, doc: 'receipt', model, theme });
  }
  // ورقُ الثمانٍ والخمسين: القوالبُ نفسُها على عرضٍ آخر.
  for (const theme of THEME_IDS) {
    out.push({
      id: `receipt-58mm-${theme}`, doc: 'receipt',
      model: R({ items: many(3), subtotal: 72, vat: 9.39, total: 72 }),
      theme, width: PAPER.mm58,
    });
  }
  out.push({ id: 'kitchen-full', doc: 'kitchen', model: KITCHEN_SCENARIO });
  out.push({ id: 'kitchen-pager', doc: 'kitchen', model: { ...KITCHEN_SCENARIO, pagerNumber: 17 } });
  out.push({ id: 'kitchen-58mm', doc: 'kitchen', model: KITCHEN_SCENARIO, width: PAPER.mm58 });
  out.push({ id: 'shift-full', doc: 'shift', model: SHIFT_SCENARIO });
  out.push({ id: 'shift-positive-variance', doc: 'shift', model: { ...SHIFT_SCENARIO, cashCounted: 2150, cashVariance: 13 } });
  out.push({ id: 'shift-online', doc: 'shift', model: { ...SHIFT_SCENARIO, onlinePaymentsEnabled: true, onlineTotal: 415.75 } });
  out.push({ id: 'shift-58mm', doc: 'shift', model: SHIFT_SCENARIO, width: PAPER.mm58 });
  return out;
}
