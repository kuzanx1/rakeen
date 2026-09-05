import { EscPosText, COLUMNS_80MM, COLUMNS_58MM } from './escposText';
import { ReceiptPrintable } from './receiptPrintable';
import { bi } from './receiptTheme';
import { zatcaQrBase64 } from './zatca';
import { rgbaToEscPosRaster, RgbaBuffer } from './escposRaster';

/**
 * The receipt as ESC/POS TEXT, drawn by the printer's own font.
 *
 * Measured at Hbiah on a SUNMI NT310: our full-page raster receipt took
 * 30-45 seconds; Foodics on the SAME printer takes about one. One second
 * is impossible for an 87mm bitmap at any speed, so the gap was never
 * degree but kind -- they send text, we sent a picture. Our transport was
 * never involved: 20ms from connect to the printer closing the stream.
 *
 * WHAT THE PRINTER DOES AND DOES NOT DO -- established by printing a
 * probe slip on the actual unit, not from a datasheet:
 *
 *   ✓ Arabic glyphs are present.
 *   ✓ Letters JOIN correctly. Each word is shaped properly from its
 *     logical character order, so characters must NOT be pre-reversed --
 *     doing that would break the shaping this printer gets right.
 *   ✗ WORDS are not reordered. "مرحبا بك" printed as "بك مرحبا": runs are
 *     laid down left to right in the order received.
 *
 * So exactly one transformation is needed, and only one: reverse the word
 * ORDER per line, leaving every word's letters alone. rtl() below.
 *
 * Numbers are printed in LATIN digits (0-9), never Arabic-Indic. Not a
 * style choice: the probe showed Latin text and Latin digits print
 * correctly, while a digit run inside an Arabic line came back reordered,
 * and a price that prints 15.00 as 00.51 is worse than a slow receipt.
 * Foodics' own slip on this counter uses Latin digits too.
 */

const ESC_GS = 0x1d;

/**
 * A line ready for a printer that shapes words but does not order them.
 *
 * Reverses word order only. Every word keeps its own letters in logical
 * order, because that is what the printer shapes from correctly.
 *
 * Words are split on spaces and rejoined the same way, so column padding
 * built before this call survives it: the run of spaces between a label
 * and its number is itself a "word" and simply moves to the other side,
 * which is where it belongs once the line is mirrored.
 */
export function rtl(line: string): string {
  if (!/[؀-ۿ]/.test(line)) return line; // pure Latin/digits: leave it
  return line.split(' ').reverse().join(' ');
}

/**
 * ESC/POS Model-2 QR: store the payload, then print it.
 *
 * model (fn 65) → module size (fn 67) → error correction (fn 69) →
 * store (fn 80) → print (fn 81). All five, in order.
 *
 * Native rather than a rendered bitmap on purpose: the QR is the one
 * graphic a simplified tax invoice legally must carry, and rasterising it
 * would put a slow-path image back into every receipt that has a VAT
 * number -- handing back most of what this whole change wins.
 */
function qrCommands(payload: string): number[] {
  const data: number[] = [];
  for (const ch of payload) data.push(ch.charCodeAt(0) & 0xff);
  const len = data.length + 3;
  return [
    ESC_GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06,
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    ESC_GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...data,
    ESC_GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/** Latin digits, always. See the header for why. */
function money(n: number): string {
  return n.toFixed(2);
}

/**
 * qty, name and price on ONE line — the arrangement the owner compared us
 * against, in characters rather than pixels.
 *
 * Built in VISUAL order (price at the left edge, name, qty at the right)
 * and then mirrored by rtl(), because the printer will mirror it back.
 */
function itemLine(qty: number, name: string, price: string, columns: number): string {
  const q = String(qty);
  const room = columns - q.length - 1 - price.length - 1;
  const nameChars = [...name];
  const shown = nameChars.length > room ? nameChars.slice(0, Math.max(1, room - 1)).join('') + '…' : name;
  const pad = Math.max(1, columns - q.length - 1 - [...shown].length - price.length);
  return `${q} ${shown}${' '.repeat(pad)}${price}`;
}

/**
 * بايتات الشعار، محسوبة مرة وتُعاد كما هي.
 *
 * الشعار لا يتغيّر بين فاتورة وأخرى، وإعادة ترميزه في كل مرة عمل مكرر
 * بلا مقابل. المفتاح هو الرابط: تغيّره يُبطل المخزون من نفسه.
 */
let logoCacheKey: string | null = null;
let logoCacheBytes: number[] | null = null;

export function cacheReceiptLogo(key: string, buffer: RgbaBuffer): void {
  logoCacheKey = key;
  logoCacheBytes = rgbaToEscPosRaster(buffer);
}

export function clearReceiptLogoCache(): void {
  logoCacheKey = null;
  logoCacheBytes = null;
}

function cachedLogo(key?: string | null): number[] | null {
  if (!key || key !== logoCacheKey) return null;
  return logoCacheBytes;
}

export function buildTextReceipt(receipt: ReceiptPrintable, logoKey?: string | null): number[] {
  const columns = receipt.paperWidthPx >= 500 ? COLUMNS_80MM : COLUMNS_58MM;
  const t = new EscPosText();
  const line = (s: string) => t.line(rtl(s));
  const row = (label: string, value: string) => {
    const pad = Math.max(1, columns - [...label].length - value.length);
    return t.line(rtl(`${label}${' '.repeat(pad)}${value}`));
  };

  t.align('center');

  // الشعار وحده صورة، والباقي نص. هذا هو الهجين: صوّر ما لا يُطبع نصاً
  // فقط، لا الفاتورة كلها.
  const logo = cachedLogo(logoKey);
  if (logo) {
    t.raw(logo);
    t.line();
  }

  t.size(0, 1).bold(true);
  line(receipt.businessName);
  t.bold(false).size(0, 0);
  if (receipt.branchName) line(receipt.branchName);
  line(receipt.dateLabel);
  t.bold(true);
  line(`${bi('رقم الطلب', 'Order')} #${receipt.orderNumber}`);
  t.bold(false);
  if (receipt.metaLabel) line(receipt.metaLabel);

  // ZATCA Phase 1: heading and seller VAT number are mandatory on a
  // simplified tax invoice, in text mode exactly as in raster.
  if (receipt.vatNumber) {
    line(bi('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'));
    line(`${bi('الرقم الضريبي', 'VAT')} ${receipt.vatNumber}`);
  }

  // الأسطر التي فيها رقم تُحاذى لليسار: بعد المرآة يصير الرقم أول ما
  // يُطبَع، فيلتصق بالحافة ويتكوّن عمود مضبوط بلا اعتماد على عرض الخط.
  t.align('left').rule(columns);
  line(itemLine(0, bi('المنتج', 'Item'), bi('السعر', 'Price'), columns).replace(/^0 /, '  '));
  t.rule(columns);

  for (const item of receipt.items) {
    line(itemLine(item.qty, item.name, money(item.lineTotal), columns));
    // The unit price only earns a line when quantity is more than one; at
    // one it repeats the number already printed beside it.
    if (item.qty > 1) line(`   ${money(item.unitPrice)} x ${item.qty}`);
    for (const mod of item.mods) line(`   ${mod}`);
  }

  t.rule(columns);
  row(bi('المجموع الفرعي', 'Subtotal'), money(receipt.subtotal));
  if (receipt.discount > 0) row(bi('الخصم', 'Discount'), `-${money(receipt.discount)}`);
  row(bi('ضريبة القيمة المضافة', 'VAT'), money(receipt.vat));
  t.bold(true);
  row(bi('الإجمالي', 'Total'), money(receipt.total));
  t.bold(false);
  t.rule(columns);

  t.align('right');
  line(receipt.paymentMethodLabel);
  t.align('left');
  if (receipt.change > 0) row(bi('الباقي', 'Change'), money(receipt.change));

  if (receipt.vatNumber) {
    t.align('center').line();
    t.raw(qrCommands(zatcaQrBase64(
      receipt.businessName, receipt.vatNumber, receipt.timestampISO, receipt.total, receipt.vat,
    )));
    t.line();
  }

  t.align('center');
  if (receipt.customMessage) line(receipt.customMessage);
  t.feed(3).cut();
  return t.build();
}
