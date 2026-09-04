import { EscPosText, COLUMNS_80MM, COLUMNS_58MM } from './escposText';
import { ReceiptPrintable } from './receiptPrintable';
import { bi } from './receiptTheme';
import { zatcaQrBase64 } from './zatca';

/**
 * The receipt as ESC/POS TEXT, drawn by the printer's own font.
 *
 * Measured on a SUNMI NT310 at Hbiah: our raster receipt took 45 seconds,
 * Foodics on the SAME printer took about one. One second is impossible
 * for an 87mm full-page bitmap at any speed, so the difference is not
 * degree but kind -- they send text, we sent a picture. The transport was
 * never at fault (20ms end to end on the trace).
 *
 * The raster path is not deleted and not a mistake: it renders identically
 * on a printer that has never heard of Arabic, which is the safe default
 * for a product that does not know what hardware it will meet. Its cost is
 * that it charges every printer the price of that insurance, including the
 * ones that can draw Arabic themselves. This module is the other bet, for
 * printers that can -- chosen per printer, after asking.
 *
 * TWO THINGS HERE DEPEND ON THE PRINTER AND CANNOT BE SETTLED FROM CODE:
 *
 *   1. Whether its font covers Arabic, joins letters, and orders them
 *      right-to-left. buildArabicProbeSlip() asks exactly that.
 *   2. Whether column padding lands. `row()` pads by code-point count,
 *      which is exact for a monospaced font and approximate for a
 *      proportional one -- an Arabic label and a Latin number on one line
 *      can drift. The probe prints two padded rows so the drift, if any,
 *      is visible before a single real receipt is printed this way.
 *
 * The ZATCA QR uses the printer's native `GS ( k` command rather than a
 * rendered bitmap. That keeps the one legally mandatory graphic off the
 * slow raster path -- printing a QR as an image would have put most of the
 * saving straight back.
 */

const ESC_GS = 0x1d;

/**
 * ESC/POS Model-2 QR: store the payload, then print it.
 *
 * Four commands, in this order, and all four are required:
 *   model (fn 65), module size (fn 67), error correction (fn 69),
 *   store data (fn 80), print (fn 81).
 * Size 6 keeps a ZATCA TLV payload scannable at 80mm without eating
 * the width; correction level M is the ZATCA reference implementations'
 * usual choice and survives a thermal print that has begun to fade.
 */
function qrCommands(payload: string): number[] {
  const data: number[] = [];
  for (const ch of payload) data.push(ch.charCodeAt(0) & 0xff);
  const len = data.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  return [
    ESC_GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // model 2
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06,       // module size 6
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,       // correction M
    ESC_GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...data,  // store
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,       // print
  ];
}

/**
 * Item lines, laid out to match what the owner compared us against.
 *
 * Foodics puts quantity, name and price on ONE line; ours used two, which
 * is what made our slip read as scattered next to theirs on the same
 * counter. Same arrangement here, in characters instead of pixels.
 */
function itemLine(qty: number, name: string, price: string, columns: number): string {
  const qtyText = String(qty);
  // Reserved: the quantity plus a space, and the price at the far edge.
  const room = columns - qtyText.length - 1 - price.length - 1;
  const trimmed = [...name].length > room ? [...name].slice(0, Math.max(1, room - 1)).join('') + '…' : name;
  const pad = Math.max(1, columns - qtyText.length - 1 - [...trimmed].length - price.length);
  return `${qtyText} ${trimmed}${' '.repeat(pad)}${price}`;
}

export function buildTextReceipt(receipt: ReceiptPrintable): number[] {
  // The printer's own column count, from the paper it is loaded with.
  const columns = receipt.paperWidthPx >= 500 ? COLUMNS_80MM : COLUMNS_58MM;
  const t = new EscPosText();

  t.align('center');
  t.size(0, 1).bold(true).line(receipt.businessName).bold(false).size(0, 0);
  if (receipt.branchName) t.line(receipt.branchName);
  t.line(receipt.dateLabel);
  t.bold(true).line(`${bi('رقم الطلب', 'Order')}: ${receipt.orderNumber}`).bold(false);
  if (receipt.metaLabel) t.line(receipt.metaLabel);

  // ZATCA Phase 1: the heading and the seller's VAT number are mandatory
  // on a simplified tax invoice, in text mode exactly as in raster.
  if (receipt.vatNumber) {
    t.line(bi('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'));
    t.line(`${bi('الرقم الضريبي', 'VAT No')}: ${receipt.vatNumber}`);
  }

  t.align('right').rule(columns);
  t.line(itemLine(0, bi('المنتج', 'Item'), bi('السعر', 'Price'), columns).replace(/^0 /, '  '));
  t.rule(columns);

  for (const item of receipt.items) {
    t.line(itemLine(item.qty, item.name, item.lineTotal.toFixed(2), columns));
    // The unit price only earns a line when the quantity is more than one;
    // at one it repeats the number already printed beside it.
    if (item.qty > 1) {
      t.line(`   ${item.unitPrice.toFixed(2)} × ${item.qty}`);
    }
    for (const mod of item.mods) t.line(`   ${mod}`);
  }

  t.rule(columns);
  t.row(bi('المجموع الفرعي', 'Subtotal'), receipt.subtotal.toFixed(2), columns);
  if (receipt.discount > 0) {
    t.row(bi('الخصم', 'Discount'), `-${receipt.discount.toFixed(2)}`, columns);
  }
  t.row(bi('ضريبة القيمة المضافة', 'VAT'), receipt.vat.toFixed(2), columns);
  t.bold(true).row(bi('الإجمالي', 'Total'), receipt.total.toFixed(2), columns).bold(false);
  t.rule(columns);

  t.line(receipt.paymentMethodLabel);
  if (receipt.change > 0) t.row(bi('الباقي', 'Change'), receipt.change.toFixed(2), columns);

  if (receipt.vatNumber) {
    t.align('center').line();
    const payload = zatcaQrBase64(
      receipt.businessName,
      receipt.vatNumber,
      receipt.timestampISO,
      receipt.total,
      receipt.vat,
    );
    t.raw(qrCommands(payload));
    t.line();
  }

  t.align('center');
  if (receipt.customMessage) t.line(receipt.customMessage);
  t.feed(3).cut();
  return t.build();
}
