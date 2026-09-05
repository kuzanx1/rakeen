/**
 * What a receipt CONTAINS, with nothing about how it is printed.
 *
 * The layer that existed before this described a receipt in terms of what
 * the renderer happened to need, so adding a field meant touching the
 * renderer, and changing the design risked changing the data. Separating
 * them is what lets the receipt be redesigned without going near the
 * transport, and lets a second output (a PDF, an emailed copy, a kitchen
 * ticket) reuse the same model instead of re-deriving it.
 *
 * Every field is optional except the ones a sale cannot exist without.
 * A till that has no customer, no table and no delivery fee simply omits
 * them, and the layout closes the gap rather than printing an empty label.
 */

export type OrderKind = 'dineIn' | 'takeaway' | 'delivery' | 'pickup';

export interface ReceiptCharge {
  label: string;
  amount: number;
}

export interface ReceiptModifier {
  label: string;
  /** Zero for a free choice ("no sugar"); printed only when non-zero. */
  amount: number;
}

export interface ReceiptItem {
  name: string;
  /** الاسم الإنجليزي، سطراً تحت العربي. سطران لا سطر واحد بفاصل: الفاصل
   *  محرف محايد، وموضعه بعد ترتيب المقاطع يتأرجح بين طرفي الحدّ اللغوي. */
  nameEn?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: ReceiptModifier[];
  /** A free-text kitchen note, printed under the modifiers. */
  note?: string;
}

export interface ReceiptModel {
  // ---- Header -------------------------------------------------------
  businessName: string;
  branchName?: string;
  /** شعار الفاتورة وحده. غيابه يعني الاسم فقط -- ولا يرتدّ إلى شعار
   *  المتجر: صاحب المطعم اختار ألّا يطبع شعاراً، لا أن يطبع غيره. */
  /** سطر تحت الاسم يكتبه صاحب المطعم. */
  tagline?: string;
  /** أين هذا الفرع: الحي والمدينة. */
  locationLine?: string;
  /** يُطبع فقط حين يكون للمنشأة أكثر من فرع -- فرع واحد لا يحتاج تمييزاً،
   *  وطباعة اسمه على كل فاتورة سطر بلا معنى. المُحوّل يقرر، لا العارض. */
  branchLabel?: string;
  /** Street address or any line the business wants under its name. */
  addressLine?: string;
  phone?: string;
  /** Present only for a VAT-registered seller. Its presence is what makes
   *  this a simplified TAX invoice, and what requires the ZATCA QR. */
  vatNumber?: string;

  // ---- Order --------------------------------------------------------
  orderNumber: string;
  orderKind?: OrderKind;
  /** يتقدّم على orderKind حين يكون المصدر تطبيق توصيل باسمه. */
  orderKindLabel?: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  /** Already formatted for display; the model does not own locale. */
  dateLabel: string;
  timeLabel?: string;

  // ---- Body ---------------------------------------------------------
  items: ReceiptItem[];

  // ---- Money --------------------------------------------------------
  subtotal: number;
  discount: number;
  vat: number;
  /** Delivery, service, packaging — anything added after the subtotal.
   *  A list rather than named fields so a new charge is data, not code. */
  charges: ReceiptCharge[];
  total: number;

  // ---- Payment ------------------------------------------------------
  paymentMethodLabel: string;
  paidAmount?: number;
  change: number;

  // ---- Footer -------------------------------------------------------
  customMessage?: string;
  /** ZATCA TLV, base64. Built by the caller so this module needs no
   *  crypto and stays a plain data description. */
  qrPayload?: string;
  /** An order barcode, when the business uses one for pickup. */
  barcodeValue?: string;

  /** Cache key for the logo bytes; absent means no logo on this receipt. */
  logoKey?: string;
}

/** Arabic labels for the order kinds, kept beside the type they describe. */
export const ORDER_KIND_LABEL: Record<OrderKind, { ar: string; en: string }> = {
  dineIn: { ar: 'محلي', en: 'Dine-in' },
  takeaway: { ar: 'سفري', en: 'Takeaway' },
  delivery: { ar: 'توصيل', en: 'Delivery' },
  pickup: { ar: 'استلام', en: 'Pickup' },
};
