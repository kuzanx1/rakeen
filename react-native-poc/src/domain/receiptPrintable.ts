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
  mods: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptPrintable {
  businessName: string;
  branchName: string;
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
  name: string;
  mods: string[];
  qty: number;
  note: string;
}

export interface KitchenTicketPrintable {
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

function toItemPrintable(line: { name: string; qty: number; unitPrice: number; lineTotal: number; mods?: string[] }): ReceiptItemPrintable {
  return { name: line.name, mods: line.mods ?? [], qty: line.qty, unitPrice: line.unitPrice, lineTotal: line.lineTotal };
}

export function toReceiptPrintable(data: ReceiptData): ReceiptPrintable {
  const createdAt = data.createdAtISO ? new Date(data.createdAtISO) : new Date();
  const timestampISO = data.createdAtISO ?? createdAt.toISOString();
  return {
    businessName: data.businessName || 'ركين',
    branchName: data.branchName ?? '',
    dateLabel: formatArabicDateLabel(createdAt),
    // Ported from the PWA's own real orderNumber fallback text
    // (rakeen-pos.js:2923) -- an order still offline-queued has no
    // server-assigned id yet, and "#null" would be actively misleading.
    orderNumber: data.orderId != null ? `#${data.orderId}` : 'سيُحدَّد عند الاتصال',
    metaLabel: data.metaLabel ?? '',
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
    metaLabel:
      data.metaLabel ??
      (data.tableNumber != null ? `طاولة ${data.tableNumber}` : '') + (data.orderId != null ? ` — #${data.orderId}` : ''),
    items: data.lines.map(line => ({ name: line.name, mods: line.mods ?? [], qty: line.qty, note: line.note ?? '' })),
    pagerNumber: data.pagerNumber ?? null,
    paperWidthPx: data.paperWidthPx ?? 576,
  };
}
