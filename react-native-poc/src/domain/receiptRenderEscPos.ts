import { EscPosText } from './escposText';
import { writeColumns, itemColumns, estimateDots } from './escposColumns';
import { PrinterCapabilityProfile, arabicLineFor } from './printerCapability';
import { ReceiptModel, ORDER_KIND_LABEL } from './receiptModel';
import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, RgbaBuffer } from './escposRaster';

/**
 * A ReceiptModel printed as ESC/POS, at the best fidelity this printer
 * supports.
 *
 * Three strategies, chosen per capability rather than per printer:
 *
 *   FAST      text + native QR + native barcode + cached logo
 *   PARTIAL   text + Arabic runs rasterised + native QR + cached logo
 *   FALLBACK  the whole receipt rasterised (owned by the Skia renderer,
 *             not this module)
 *
 * Full raster is never the default. It was, and on a SUNMI NT310 that
 * cost 45 seconds a receipt against Foodics' one on the same machine —
 * not because images are heavy but because handing a printer a page-sized
 * bitmap asks it to do the one thing it is slowest at.
 *
 * INFORMATION ORDER, and why:
 *   who sold it → which sale → what was bought → what it cost →
 *   how it was paid → proof
 * A customer checking a receipt reads the total first and the header
 * almost never; a cashier resolving a dispute reads the order number
 * first. So the order number is the largest thing in the header block and
 * the total is the largest thing on the receipt, and everything else is
 * quieter than both. Nothing is centred except the header and the footer,
 * because a centred line in the middle of a table breaks the scan.
 */

const ESC_GS = 0x1d;

/** Latin digits everywhere. An Arabic-Indic digit run comes back reordered
 *  on a shaping-only printer, and a price that prints 15.00 as 00.51 is
 *  worse than a slow receipt. */
function money(n: number): string {
  return n.toFixed(2);
}

/**
 * ملصق بلغة واحدة.
 *
 * الملصق ثنائي اللغة يحتاج فاصلاً، والفاصل رمز لا ينتمي لأي من اللغتين
 * فموضعه بعد المرآة يتأرجح بين طرفي الحدّ اللغوي. الغموض في المحتوى لا
 * في الخوارزمية، فيُزال من المحتوى.
 *
 * أسماء المنتجات تبقى كما يكتبها صاحب المطعم — قد تكون ثنائية، وهي
 * مقطع واحد يُعالَج صحيحاً.
 */
function label(ar: string, en: string): string {
  return LANG === 'en' ? en : ar;
}

/** لغة الفاتورة. تُمرَّر من الأعلى؛ العربية هي الأصل. */
let LANG: 'ar' | 'en' = 'ar';
export function setReceiptLanguage(lang: 'ar' | 'en'): void {
  LANG = lang;
}

/** `GS ( k` Model-2 QR: model → module size → correction → store → print. */
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

/** `GS k` CODE128, height 60 dots, HRI text below. */
function barcodeCommands(value: string): number[] {
  const data: number[] = [];
  for (const ch of value) data.push(ch.charCodeAt(0) & 0xff);
  return [
    ESC_GS, 0x68, 0x3c,             // height 60 dots
    ESC_GS, 0x77, 0x02,             // module width 2
    ESC_GS, 0x48, 0x02,             // HRI below the bars
    ESC_GS, 0x6b, 0x49, data.length + 2, 0x7b, 0x42, ...data,
  ];
}

/** Logo bytes, encoded once per logo and reused for every receipt. */
const logoCache = new Map<string, number[]>();

export function cacheLogo(key: string, buffer: RgbaBuffer, caps: PrinterCapabilityProfile): void {
  logoCache.set(key, caps.modernGraphics ? rgbaToEscPosRaster(buffer) : rgbaToEscPosRasterLegacy(buffer));
}

export function clearLogoCache(): void {
  logoCache.clear();
}

export function isLogoCached(key: string): boolean {
  return logoCache.has(key);
}

/** Arabic runs a text-only printer cannot render, for the caller to raster. */
export interface UnprintableRun {
  text: string;
  /** Where it belongs, so the caller can splice a strip in. */
  index: number;
}

export interface RenderResult {
  bytes: number[];
  /** Non-empty only on an `arabic: 'none'` printer — the PARTIAL strategy's
   *  work list. Empty means the whole receipt printed as text. */
  needsRaster: UnprintableRun[];
  strategy: 'fast' | 'partial';
}

export function renderReceipt(model: ReceiptModel, caps: PrinterCapabilityProfile): RenderResult {
  const t = new EscPosText();
  const col = itemColumns(caps);
  const needsRaster: UnprintableRun[] = [];
  let lineIndex = 0;

  /** A centred line, or a raster request when this printer cannot set it. */
  const centre = (text: string, opts?: { bold?: boolean; tall?: boolean }) => {
    const prepared = arabicLineFor(text, caps);
    lineIndex++;
    if (prepared === null) {
      needsRaster.push({ text, index: lineIndex });
      return;
    }
    t.align('center');
    if (opts?.tall) t.size(0, 1);
    if (opts?.bold) t.bold(true);
    t.line(prepared);
    if (opts?.bold) t.bold(false);
    if (opts?.tall) t.size(0, 0);
  };

  /** A label/value pair with the value hard against the left edge. */
  const pair = (label: string, value: string, bold = false) => {
    lineIndex++;
    writeColumns(t, [
      { text: value, x: 0, width: col.price.width, align: 'right', bold },
      { text: label, x: col.name.x, width: col.name.width, align: 'right', bold },
    ], caps);
  };

  const rule = () => {
    lineIndex++;
    t.align('left').rule(Math.floor(caps.printableDots / caps.latinCharDots));
  };

  // ---- Header ---------------------------------------------------------
  const logo = model.logoKey ? logoCache.get(model.logoKey) : undefined;
  if (logo) {
    t.align('center').raw(logo).line();
  }
  centre(model.businessName, { bold: true, tall: true });
  if (model.branchName) centre(model.branchName);
  if (model.addressLine) centre(model.addressLine);
  if (model.phone) centre(model.phone);
  if (model.vatNumber) {
    centre(label('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'));
    centre(`${label('الرقم الضريبي', 'VAT')} ${model.vatNumber}`);
  }

  rule();

  // ---- Order ----------------------------------------------------------
  // The order number is the one thing a cashier looks for first, so it is
  // the largest line in this block rather than another grey label.
  centre(`${label('رقم الطلب', 'Order')} #${model.orderNumber}`, { bold: true, tall: true });

  // Order type as a labelled pair like every other order field, not a
  // centred line of its own: it belongs to the same scan column as the
  // table number and the cashier, and centring it would break that column.
  const kind = model.orderKind ? ORDER_KIND_LABEL[model.orderKind] : null;
  if (kind) pair(label('النوع', 'Type'), label(kind.ar, kind.en));
  if (model.tableNumber) pair(label('طاولة', 'Table'), model.tableNumber);
  if (model.customerName) pair(label('العميل', 'Customer'), model.customerName);
  if (model.customerPhone) pair(label('الجوال', 'Phone'), model.customerPhone);
  if (model.cashierName) pair(label('الكاشير', 'Cashier'), model.cashierName);
  pair(label('التاريخ', 'Date'), model.timeLabel ? `${model.dateLabel}  ${model.timeLabel}` : model.dateLabel);

  rule();

  // ---- Items ----------------------------------------------------------
  lineIndex++;
  writeColumns(t, [
    { text: label('السعر', 'Price'), x: col.price.x, width: col.price.width, align: 'right' },
    { text: label('المنتج', 'Item'), x: col.name.x, width: col.name.width, align: 'right' },
    { text: label('كمية', 'Qty'), x: col.qty.x, width: col.qty.width, align: 'right' },
  ], caps);
  rule();

  for (const item of model.items) {
    lineIndex++;
    writeColumns(t, [
      { text: money(item.lineTotal), x: col.price.x, width: col.price.width, align: 'right', bold: true },
      { text: item.name, x: col.name.x, width: col.name.width, align: 'right', bold: true },
      { text: String(item.qty), x: col.qty.x, width: col.qty.width, align: 'right' },
    ], caps);

    // The unit price only earns a line when quantity is more than one; at
    // one it repeats the number already printed beside it.
    if (item.qty > 1) {
      lineIndex++;
      writeColumns(t, [
        { text: `${money(item.unitPrice)} x ${item.qty}`, x: col.name.x, width: col.name.width, align: 'right' },
      ], caps);
    }

    // Modifiers are indented and carry their own price, so an add-on can
    // never be mistaken for a product or lost inside one.
    for (const mod of item.modifiers) {
      lineIndex++;
      const indent = col.name.x;
      writeColumns(t, [
        ...(mod.amount !== 0
          ? [{ text: money(mod.amount), x: col.price.x, width: col.price.width, align: 'right' as const }]
          : []),
        { text: `+ ${mod.label}`, x: indent, width: col.name.width - Math.round(caps.printableDots * 0.04), align: 'right' as const },
      ], caps);
    }

    if (item.note) {
      lineIndex++;
      writeColumns(t, [
        { text: `* ${item.note}`, x: col.name.x, width: col.name.width, align: 'right' },
      ], caps);
    }
  }

  rule();

  // ---- Money ----------------------------------------------------------
  pair(label('المجموع الفرعي', 'Subtotal'), money(model.subtotal));
  if (model.discount > 0) pair(label('الخصم', 'Discount'), `-${money(model.discount)}`);
  for (const charge of model.charges) pair(charge.label, money(charge.amount));
  pair(label('ضريبة القيمة المضافة', 'VAT'), money(model.vat));

  // The total is the only line printed double-height. It is what the
  // customer checks and the only number worth finding without reading.
  lineIndex++;
  t.size(0, 1);
  writeColumns(t, [
    { text: money(model.total), x: col.price.x, width: col.price.width, align: 'right', bold: true },
    { text: label('الإجمالي', 'Total'), x: col.name.x, width: col.name.width, align: 'right', bold: true },
  ], caps);
  t.size(0, 0);

  rule();

  // ---- Payment --------------------------------------------------------
  pair(label('الدفع', 'Payment'), model.paymentMethodLabel);
  if (model.paidAmount != null) pair(label('المدفوع', 'Paid'), money(model.paidAmount));
  if (model.change > 0) pair(label('الباقي', 'Change'), money(model.change));

  // ---- Proof ----------------------------------------------------------
  if (model.qrPayload && caps.nativeQr) {
    t.align('center').line();
    t.raw(qrCommands(model.qrPayload));
    t.line();
  }
  if (model.barcodeValue && caps.nativeBarcode) {
    t.align('center').line();
    t.raw(barcodeCommands(model.barcodeValue));
    t.line();
  }

  if (model.customMessage) centre(model.customMessage);

  t.feed(3);
  if (caps.supportsCut) t.cut();

  return {
    bytes: t.build(),
    needsRaster,
    strategy: needsRaster.length === 0 ? 'fast' : 'partial',
  };
}

/** Exposed for the layout tests, which assert dot positions not spaces. */
export const _internals = { estimateDots, itemColumns };
