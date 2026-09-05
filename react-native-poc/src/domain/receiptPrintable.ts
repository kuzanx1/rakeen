import type { ReceiptData, KitchenTicketData } from './receipt';

/**
 * Feature Parity Pass -- Real Receipt Rendering. Pure (zero-I/O, no
 * Skia import) mapping from the print queue's persisted job data
 * (domain/receipt.ts's ReceiptData/KitchenTicketData -- whatever a
 * caller happened to have on hand at enqueue time, with most fields
 * optional) to the exact shape the PWA's real renderReceiptCanvas() /
 * renderKitchenTicketCanvas() consume (public/pos/rakeen-pos.js, lines
 * ~2302-2500 and ~2900-2930) -- same field names, same fallback text,
 * same defaults, ported deliberately rather than reinvented. Kept
 * separate from application/receiptRenderer.ts (the Skia-touching file)
 * so this mapping stays independently testable with plain objects, the
 * same pattern already established by domain/escposRaster.ts and
 * domain/zatca.ts.
 */

export interface ReceiptItemPrintable {
  name: string;
  /** menu_items.name_en -- يُطبع مع العربي على السطر نفسه. */
  nameEn: string;
  mods: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** الملاحظة تُطبع على فاتورة العميل أيضاً الآن، بطلب صاحب المطعم --
   *  كانت للمطبخ وحده، فكان الزبون لا يرى ما طلبه بنفسه. */
  note: string;
}

export interface ReceiptPrintable {
  businessName: string;
  branchName: string;
  /** سطر تعريفي تحت الاسم، والحي والمدينة، واسم الفرع عند تعدد الفروع. */
  tagline: string;
  locationLine: string;
  branchLabel: string;
  cashierName: string;
  customerName: string;
  customerPhone: string;
  /** ملاحظة الزبون على الطلب كله. تُطبع أسفل الأصناف وحدها. */
  orderNote: string;
  /** هل يُطبع الاسم تحت الشعار. يُتجاهل حين لا شعار. */
  showBusinessName: boolean;
  dateLabel: string;
  orderNumber: string;
  metaLabel: string;
  vatNumber: string;
  items: ReceiptItemPrintable[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethodLabel: string;
  change: number;
  customMessage: string;
  timestampISO: string;
  paperWidthPx: number;
}

export interface KitchenTicketItemPrintable {
  /** الاسم الإنجليزي -- المطبخ فيه من لا يقرأ العربية. */
  nameEn: string;
  name: string;
  mods: string[];
  qty: number;
  note: string;
}

export interface KitchenTicketPrintable {
  /** رقم الطلب. المطبخ يناديه، والكاشير يطابق به الكيس بصاحبه. */
  orderNumber: string;
  /** من طبعها -- يُسأل حين يلتبس صنف. */
  cashierName: string;
  /** The call-buzzer handed to this customer. Printed large, because on a
   *  kitchen ticket it is the one number somebody has to read off the
   *  paper and type into the base station to call them over. */
  pagerNumber: number | null;
  branchName: string;
  dateLabel: string;
  metaLabel: string;
  items: KitchenTicketItemPrintable[];
  paperWidthPx: number;
}

/** Ported verbatim from the PWA's real PAYMENT_METHOD_LABELS_POS
 *  (public/pos/rakeen-pos.js:3592). An unrecognized method (should
 *  never happen -- domain/order.ts's payment methods are a closed set)
 *  falls back to printing the raw method string rather than throwing. */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  split: 'تقسيم دفع',
  delivery_platform: 'مدفوع عبر التطبيق',
};

/**
 * Ported from the PWA's own `new Date().toLocaleString('ar-SA', {...})`
 * call sites. Wrapped in try/catch rather than called directly: Hermes
 * (React Native's default JS engine) does not always ship full ICU/Intl
 * locale data, so a plain toLocaleString('ar-SA') call can throw a
 * RangeError on some builds -- something the browser-only PWA never had
 * to consider. A thrown formatter must never take down receipt
 * printing, so this falls back to a manual, always-available
 * DD/MM/YYYY HH:MM construction (Western digits, still fully readable
 * and still the correct information) rather than crashing.
 */
export function formatArabicDateLabel(date: Date): string {
  try {
    return date.toLocaleString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

function toItemPrintable(line: { name: string; nameEn?: string; qty: number; unitPrice?: number; lineTotal: number; mods?: string[]; note?: string }): ReceiptItemPrintable {
  return {
    name: line.name,
    nameEn: line.nameEn ?? '',
    mods: line.mods ?? [],
    qty: line.qty,
    // يُحسب حين لا يُمرَّر: الطلب الإلكتروني يصل بمجموع السطر وحده،
    // وقراءة toFixed من undefined كانت تُسقط تصيير الفاتورة كلها إلى
    // النسخة الاحتياطية بالإنجليزية -- وهي التي خرجت "؟؟؟؟؟" على ورق هبية.
    unitPrice: line.unitPrice ?? (line.qty > 0 ? line.lineTotal / line.qty : 0),
    lineTotal: line.lineTotal,
    note: line.note ?? '',
  };
}

/**
 * نوع الطلب بالعربية والإنجليزية.
 *
 * الورقة تُقرأ في مطبخ فيه من لا يقرأ العربية وفي صالة فيها من لا يقرأ
 * الإنجليزية، والكلمة الواحدة هنا تقرر أين يذهب الطلب. فتُكتب باللغتين
 * لا بواحدة، ولو كلّف ذلك بضعة ملّيمترات من الورق.
 */
const ORDER_KIND_BILINGUAL: Record<string, string> = {
  'محلي': 'محلي · Dine-in',
  'بالمطعم': 'محلي · Dine-in',
  'سفري': 'سفري · Takeaway',
  'توصيل': 'توصيل · Delivery',
  'استلام': 'استلام · Pickup',
  'طلب إلكتروني': 'طلب إلكتروني · Online Order',
};

export function bilingualOrderKind(metaLabel: string): string {
  if (!metaLabel) return '';
  // "محلي — طاولة 7" يحمل النوع وما بعده، فيُترجم النوع ويبقى الباقي.
  for (const [ar, both] of Object.entries(ORDER_KIND_BILINGUAL)) {
    if (metaLabel.startsWith(ar)) return both + metaLabel.slice(ar.length);
  }
  return metaLabel;
}

export function toReceiptPrintable(data: ReceiptData): ReceiptPrintable {
  const createdAt = data.createdAtISO ? new Date(data.createdAtISO) : new Date();
  const timestampISO = data.createdAtISO ?? createdAt.toISOString();
  return {
    businessName: data.businessName || 'ركين',
    branchName: data.branchName ?? '',
    tagline: data.tagline ?? '',
    locationLine: data.locationLine ?? '',
    branchLabel: data.branchLabel ?? '',
    cashierName: data.cashierName ?? '',
    // إلا إذا أُطفئ صراحةً، فجهاز على إعدادات قديمة يطبع الاسم كما كان.
    showBusinessName: data.showBusinessName !== false,
    dateLabel: formatArabicDateLabel(createdAt),
    // Ported from the PWA's own real orderNumber fallback text
    // (rakeen-pos.js:2923) -- an order still offline-queued has no
    // server-assigned id yet, and "#null" would be actively misleading.
    orderNumber: data.orderId != null ? `#${data.orderId}` : 'سيُحدَّد عند الاتصال',
    metaLabel: bilingualOrderKind(data.metaLabel ?? ''),
    customerName: data.customerName ?? '',
    customerPhone: data.customerPhone ?? '',
    orderNote: data.orderNote ?? '',
    vatNumber: data.vatNumber ?? '',
    items: data.lines.map(toItemPrintable),
    subtotal: data.subtotal,
    discount: data.discount,
    vat: data.vat,
    total: data.total,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod,
    change: data.change ?? 0,
    customMessage: data.customMessage || 'شكراً لزيارتكم',
    timestampISO,
    paperWidthPx: data.paperWidthPx ?? 576,
  };
}

export function toKitchenTicketPrintable(data: KitchenTicketData): KitchenTicketPrintable {
  const createdAt = data.createdAtISO ? new Date(data.createdAtISO) : new Date();
  return {
    branchName: data.branchName ?? '',
    dateLabel: formatArabicDateLabel(createdAt),
    // رقم الطلب سطر قائم بذاته الآن، لا مطويّاً في نص النوع: المطبخ
    // ينادي به، والكاشير يطابق به الكيس بصاحبه.
    orderNumber: data.orderId != null ? `#${data.orderId}` : '—',
    cashierName: data.cashierName ?? '',
    metaLabel: bilingualOrderKind(
      data.metaLabel ?? (data.tableNumber != null ? `طاولة ${data.tableNumber}` : ''),
    ),
    items: data.lines.map(line => ({
      name: line.name,
      nameEn: line.nameEn ?? '',
      mods: line.mods ?? [],
      qty: line.qty,
      note: line.note ?? '',
    })),
    pagerNumber: data.pagerNumber ?? null,
    paperWidthPx: data.paperWidthPx ?? 576,
  };
}
