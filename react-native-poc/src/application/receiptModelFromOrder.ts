import { ReceiptData } from '../domain/receipt';
import { ReceiptModel, ReceiptItem, OrderKind } from '../domain/receiptModel';
import { zatcaQrBase64 } from '../domain/zatca';
import { formatArabicDateTimeShort, formatArabicTime } from '../domain/arabicDate';

/**
 * ReceiptData (what a checkout produces) → ReceiptModel (what a receipt
 * contains).
 *
 * The two are separate on purpose. ReceiptData is shaped by the till: it
 * carries an order id, a payment method string, whatever the cart had.
 * ReceiptModel is shaped by the paper: header, order, items, money,
 * payment, proof. Keeping the seam here means the receipt can be
 * redesigned, or rendered to something other than a printer, without
 * touching checkout — and checkout can gain a field without the renderer
 * having to care.
 *
 * It is also where every "printed" decision that is not layout lives: the
 * ZATCA payload is built here rather than in the renderer, so the renderer
 * stays a pure function of the model and needs no crypto.
 */

/** Free-text channel labels the till already uses, mapped to order kinds. */
function orderKindFrom(metaLabel?: string): OrderKind | undefined {
  if (!metaLabel) return undefined;
  if (/طاولة|محلي|بالمطعم|dine/i.test(metaLabel)) return 'dineIn';
  if (/سفري|takeaway/i.test(metaLabel)) return 'takeaway';
  if (/توصيل|delivery/i.test(metaLabel)) return 'delivery';
  if (/استلام|pickup/i.test(metaLabel)) return 'pickup';
  return undefined;
}

/** "بالمطعم — طاولة 4" carries the table number inside a free-text line. */
function tableFrom(metaLabel?: string): string | undefined {
  const m = metaLabel?.match(/طاولة\s*(\d+)/);
  return m ? m[1] : undefined;
}

export function receiptModelFromOrder(data: ReceiptData): ReceiptModel {
  const timestamp = data.createdAtISO ?? new Date().toISOString();
  const when = new Date(timestamp);

  const items: ReceiptItem[] = data.lines.map(line => ({
    name: line.name,
    qty: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    // The till carries modifiers as plain strings; a priced add-on is
    // already folded into the line total, so it is shown at zero here
    // rather than double-counted.
    modifiers: (line.mods ?? []).map(label => ({ label, amount: 0 })),
    note: line.note,
  }));

  return {
    businessName: data.businessName ?? '',
    branchName: data.branchName,
    vatNumber: data.vatNumber || undefined,

    orderNumber: data.orderId != null ? String(data.orderId) : '—',
    orderKind: orderKindFrom(data.metaLabel),
    tableNumber: tableFrom(data.metaLabel),
    dateLabel: formatArabicDateTimeShort(when).replace(formatArabicTime(when), '').trim(),
    timeLabel: formatArabicTime(when),

    items,

    subtotal: data.subtotal,
    discount: data.discount,
    vat: data.vat,
    // No till-side charges yet; the field exists so delivery and service
    // fees are data when they arrive rather than a schema change.
    charges: [],
    total: data.total,

    paymentMethodLabel: data.paymentMethod,
    change: 0,

    customMessage: data.customMessage,
    // ZATCA Phase 1: the QR is required precisely when a VAT number makes
    // this a tax invoice, and encoding one without a seller VAT number
    // would be actively wrong.
    qrPayload: data.vatNumber
      ? zatcaQrBase64(data.businessName ?? '', data.vatNumber, timestamp, data.total, data.vat)
      : undefined,
    logoKey: data.logoUrl || undefined,
  };
}
