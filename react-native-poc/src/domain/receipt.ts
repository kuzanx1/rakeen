/**
 * Checkpoint 10 (Print Queue) built these two ESC/POS byte builders as a
 * deliberate ASCII-only placeholder (see git history for the original
 * doc comment) -- real Arabic/QR/logo rendering was explicitly out of
 * scope for the queue checkpoint. The Feature Parity Pass's Real
 * Receipt Rendering item now supersedes them: application/printService.ts's
 * doDispatch() renders real bytes via application/receiptRenderer.ts
 * (Skia raster + Paragraph-based RTL Arabic text, ZATCA QR, logo) and
 * only falls back to the ASCII builders below if that real renderer
 * throws (e.g. Skia truly unavailable) -- never as the normal path, and
 * always disclosed via the job's own error/log, never silently. Kept
 * here, unmodified, as that safety net -- not deleted, since "never let
 * a rendering bug block printing entirely" is a real, worthwhile
 * property this ASCII fallback still provides.
 */

export interface ReceiptLine {
  name: string;
  /** menu_items.name_en -- يُطبع سطراً تحت الاسم العربي حين يوجد. */
  nameEn?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Selected-modifier labels for this line, e.g. "بدون بصل" -- ported
   *  from the PWA's real receipt.items[].mods (renderReceiptCanvas). */
  mods?: string[];
  /** Cashier free-text note, e.g. "إضافي صوص" -- kitchen ticket only in
   *  the PWA (customer receipt never prints it). */
  note?: string;
}

/**
 * Extended (Feature Parity Pass) beyond the Checkpoint 10 minimal shape
 * with every field the PWA's real renderReceiptCanvas()/zatcaQrBase64()
 * need (public/pos/rakeen-pos.js, lines ~2302-2414 and ~2900-2930) --
 * all new fields are OPTIONAL so this stays backward compatible with
 * any already-persisted queue job and with call sites that don't (yet)
 * supply every one; domain/receiptPrintable.ts's toReceiptPrintable()
 * fills honest defaults for whatever is missing, the same
 * never-crash-on-a-gap contract as this file's own text fallback.
 */
export interface ReceiptData {
  orderId: number | null;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethod: string;
  /** businesses.name (device.businessName) -- printed as the receipt's
   *  largest, topmost line. */
  businessName?: string;
  /** device.branchName -- printed under the business name, when set. */
  branchName?: string;
  /** businesses.vat_number -- the ZATCA QR and "فاتورة ضريبية مبسطة"
   *  block are both skipped entirely when this is blank, matching the
   *  PWA's own "a QR encoding an empty VAT number would be actively
   *  wrong" rule. */
  vatNumber?: string;
  /** businesses.logo_url -- fetched and drawn at the top when set; a
   *  failed/slow fetch degrades to no logo, never blocks printing. */
  logoUrl?: string;
  /** businesses.receipt_custom_message -- footer line, defaults to
   *  "شكراً لزيارتكم" (RECEIPT_CUSTOM_MESSAGE's own PWA default) when
   *  blank/absent. */
  customMessage?: string;
  /** ISO order-creation timestamp -- feeds both the printed date label
   *  and the ZATCA QR's Tag 3. Defaults to "now" when absent (e.g. an
   *  order still offline-queued with no server timestamp yet). */
  createdAtISO?: string;
  /** Free-text channel/table meta line, e.g. "بالمطعم — طاولة 4". */
  metaLabel?: string;
  /** اسم الموظف الذي أصدر الفاتورة -- "تمت بواسطة". */
  cashierName?: string;
  /** اسم صاحب الطلب وجواله -- للطلبات الإلكترونية والتوصيل. */
  customerName?: string;
  customerPhone?: string;
  /** ملاحظة الزبون على الطلب كله، لا على صنف بعينه. */
  orderNote?: string;
  /** businesses.receipt_show_name -- هل يُطبع الاسم تحت الشعار. */
  showBusinessName?: boolean;
  /** businesses.receipt_tagline -- سطر تحت الاسم يكتبه صاحب المطعم. */
  tagline?: string;
  /** الحي والمدينة، مركّبين من branches.district/city. */
  locationLine?: string;
  /** اسم الفرع، ويُمرَّر فقط حين تتعدد فروع المنشأة. الجهة المُرسِلة
   *  تعدّ الفروع؛ لا يجوز للعارض ولا للمحوّل أن يخمّنا. */
  branchLabel?: string;
  /** اسم تطبيق التوصيل حين يكون الطلب منه. */
  orderKindLabel?: string;
  /** Cash change due, when > 0 -- PWA's receipt.change. */
  change?: number;
  /** DEVICE.printerPaperWidth in px at ~203dpi (576=80mm, 384=58mm). */
  paperWidthPx?: number;
}

export interface KitchenTicketData {
  /** Call-buzzer number, when the shop hands them out. */
  pagerNumber?: number | null;
  orderId: number | null;
  /** شعار المطعم، يتصدّر التذكرة بدل كلمة "طلب مطبخ". */
  logoUrl?: string;
  /** من طبعها. المطبخ يحتاج أن يعرف بمن يسأل عن صنف غير مفهوم. */
  cashierName?: string;
  tableNumber: number | null;
  lines: ReceiptLine[];
  branchName?: string;
  createdAtISO?: string;
  metaLabel?: string;
  paperWidthPx?: number;
}

function bytesToBase64(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result += b1 !== undefined ? chars[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '=';
    result += b2 !== undefined ? chars[b2 & 63] : '=';
  }
  return result;
}

function textToBytes(bytes: number[], text: string): void {
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    bytes.push(code < 256 ? code : 0x3f); // '?' for anything outside ASCII, never crash on a real Arabic name
  }
  bytes.push(0x0a);
}

const ESC = 0x1b;
const GS = 0x1d;

export function buildReceiptEscPosBase64(data: ReceiptData): string {
  const bytes: number[] = [];
  bytes.push(ESC, 0x40); // init
  textToBytes(bytes, 'RAKEEN POS');
  textToBytes(bytes, data.orderId != null ? `Order #${data.orderId}` : 'Order (offline)');
  textToBytes(bytes, '------------------------');
  for (const line of data.lines) {
    textToBytes(bytes, `${line.qty} x ${line.name} - ${line.lineTotal.toFixed(2)}`);
  }
  textToBytes(bytes, '------------------------');
  textToBytes(bytes, `Subtotal: ${data.subtotal.toFixed(2)}`);
  if (data.discount > 0) textToBytes(bytes, `Discount: -${data.discount.toFixed(2)}`);
  textToBytes(bytes, `VAT: ${data.vat.toFixed(2)}`);
  textToBytes(bytes, `Total: ${data.total.toFixed(2)}`);
  textToBytes(bytes, `Paid via: ${data.paymentMethod}`);
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 0x00); // full cut
  return bytesToBase64(bytes);
}

export function buildKitchenTicketEscPosBase64(data: KitchenTicketData): string {
  const bytes: number[] = [];
  bytes.push(ESC, 0x40);
  textToBytes(bytes, 'KITCHEN TICKET');
  textToBytes(bytes, data.orderId != null ? `Order #${data.orderId}` : 'Order (offline)');
  if (data.tableNumber != null) textToBytes(bytes, `Table ${data.tableNumber}`);
  textToBytes(bytes, '------------------------');
  for (const line of data.lines) {
    textToBytes(bytes, `${line.qty} x ${line.name}`);
  }
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 0x00);
  return bytesToBase64(bytes);
}
