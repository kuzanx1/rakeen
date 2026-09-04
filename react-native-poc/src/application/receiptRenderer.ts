import { Skia, PaintStyle } from '@shopify/react-native-skia';
import { createReceiptSurface, loadRemoteImage } from '../platform/receiptCanvas';
import { loadReceiptTypefaces } from '../platform/receiptFonts';
import { buildReceiptFontProvider, paintText, measureAndWrapText } from '../platform/receiptText';
import { rgbaToEscPosRaster } from '../domain/escposRaster';
import { bytesToBase64 } from '../domain/escposText';
import { zatcaQrBase64 } from '../domain/zatca';
import { buildQrMatrix } from '../domain/qrMatrix';
import { toReceiptPrintable, toKitchenTicketPrintable, ReceiptPrintable, KitchenTicketPrintable } from '../domain/receiptPrintable';
import { ReceiptData, KitchenTicketData, buildReceiptEscPosBase64, buildKitchenTicketEscPosBase64 } from '../domain/receipt';
import type { ClosingReport } from '../domain/shift';
import { bi, receiptTheme } from '../domain/receiptTheme';

/**
 * Feature Parity Pass -- Real Receipt Rendering. This is the real
 * renderer domain/receipt.ts's own doc comment always anticipated:
 * ported line-for-line from the PWA's real renderReceiptCanvas() /
 * renderKitchenTicketCanvas() (public/pos/rakeen-pos.js, ~2302-2500),
 * same padding/line-height/font-size constants, same draw order, same
 * QR-skip-when-no-VAT-number rule -- onto a real Skia offscreen surface
 * via the Paragraph API for actual RTL-aware Arabic text (see
 * platform/receiptText.ts's own doc comment for why plain drawText
 * would be wrong here).
 *
 * UNVERIFIED beyond real CI compilation from this Windows environment:
 * whether the resulting bytes look correct on an actual thermal
 * printer -- Windows cannot run RN's JSI native modules, so on-device
 * text shaping/rasterization/printing can only be confirmed on real
 * iOS/Android hardware. Never claim printing "works" from this alone.
 */

const PAD = 16;
const LINE_H = 32;
const KITCHEN_LINE_H = 36;


/** Draws a QR bit-matrix as a grid of filled black squares -- the same
 *  visual result as the PWA's SVG QR image, just built directly out of
 *  domain/qrMatrix.ts's boolean grid instead of rasterizing an <img>. */
function drawQrMatrix(canvas: ReturnType<typeof createReceiptSurface>['canvas'], data: string, x: number, y: number, sizePx: number): void {
  const matrix = buildQrMatrix(data);
  const moduleSize = sizePx / matrix.size;
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  const whitePaint = Skia.Paint();
  whitePaint.setColor(Skia.Color('#ffffff'));
  canvas.drawRect(Skia.XYWHRect(x, y, sizePx, sizePx), whitePaint);
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.isDark(row, col)) {
        canvas.drawRect(Skia.XYWHRect(x + col * moduleSize, y + row * moduleSize, moduleSize, moduleSize), paint);
      }
    }
  }
}

/** A hairline rectangle, for the elegant theme's boxed total. Four thin
 *  rules rather than a stroked rect: a thermal head renders a 1px stroke
 *  unevenly at low temperature, and filled bars stay crisp. */
function drawBox(
  canvas: ReturnType<typeof createReceiptSurface>['canvas'],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const t = 1.5;
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  canvas.drawRect(Skia.XYWHRect(x, y, w, t), paint);
  canvas.drawRect(Skia.XYWHRect(x, y + h - t, w, t), paint);
  canvas.drawRect(Skia.XYWHRect(x, y, t, h), paint);
  canvas.drawRect(Skia.XYWHRect(x + w - t, y, t, h), paint);
}

function drawDivider(canvas: ReturnType<typeof createReceiptSurface>['canvas'], width: number, y: number): void {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  canvas.drawLine(PAD, y, width - PAD, y, paint);
}

interface RenderContext {
  canvas: ReturnType<typeof createReceiptSurface>['canvas'];
  provider: ReturnType<typeof buildReceiptFontProvider>;
  width: number;
  contentWidth: number;
}

/** Centered Arabic line -- ported from the PWA's centerText(). Returns
 *  the new Y cursor, same "returns next Y" convention every draw helper
 *  here uses (mirrors the source's own `y += ...` after each call). */
function drawCenterLine(ctx: RenderContext, y: number, text: string, size: number, bold: boolean): number {
  const height = paintText(ctx.canvas, ctx.provider, text, PAD, y, ctx.contentWidth, { size, bold, align: 'center', direction: 'rtl' });
  return y + Math.max(height, LINE_H * (size > 22 ? 1.3 : 1));
}

/** Right-aligned Arabic label + left-aligned (LTR) mono amount on the
 *  same line -- ported from the PWA's rowText(). No dedicated mono
 *  typeface is bundled (only IBM Plex Sans Arabic was approved/
 *  downloaded for this pass), so the amount column uses the same
 *  Arabic-family digits -- fully correct information, just not the
 *  PWA's exact monospace typeface; a disclosed, minor simplification. */
/**
 * أعمدة صف الصنف، محسوبة من عرض الورق لا بأرقام ثابتة — الورق ٥٨ مم
 * يصغّرها بنفس النسب بدل أن تتداخل.
 */
function itemColumns(contentWidth: number) {
  const qty = Math.round(contentWidth * 0.1);
  const price = Math.round(contentWidth * 0.24);
  const gutter = 8;
  return { qty, price, name: contentWidth - qty - price - gutter * 2, gutter };
}

/**
 * صنف واحد في سطر واحد: الكمية يميناً، الاسم وسطاً، السعر يساراً.
 *
 * كان الاسم في سطر والسعر في السطر التالي، فالعين لا تربط بينهما
 * والورقة تطول بلا سبب. ثلاثة صناديق على نفس الـy تحلّ الاثنين معاً.
 */
function drawItemLine(
  ctx: RenderContext,
  y: number,
  qtyText: string,
  nameLines: string[],
  priceText: string,
  size: number,
  bold: boolean,
  color?: string,
): number {
  const col = itemColumns(ctx.contentWidth);
  const nameX = PAD + col.price + col.gutter;
  const qtyX = ctx.width - PAD - col.qty;

  nameLines.forEach((line, i) => {
    paintText(ctx.canvas, ctx.provider, line, nameX, y + i * LINE_H * 0.82, col.name, {
      size, bold, align: 'right', direction: 'rtl', color,
    });
  });
  // الكمية والسعر مع السطر الأول من الاسم فقط.
  if (qtyText) {
    paintText(ctx.canvas, ctx.provider, qtyText, qtyX, y, col.qty, {
      size, bold: false, align: 'right', direction: 'ltr', color,
    });
  }
  if (priceText) {
    paintText(ctx.canvas, ctx.provider, priceText, PAD, y, col.price, {
      size, bold, align: 'left', direction: 'ltr', color,
    });
  }
  return y + Math.max(1, nameLines.length) * LINE_H * 0.82;
}

function drawRow(ctx: RenderContext, y: number, leftMono: string, rightArabic: string, size: number, bold: boolean): number {
  paintText(ctx.canvas, ctx.provider, rightArabic, PAD, y, ctx.contentWidth, { size, bold, align: 'right', direction: 'rtl' });
  if (leftMono) {
    paintText(ctx.canvas, ctx.provider, leftMono, PAD, y, ctx.contentWidth, { size, bold: false, align: 'left', direction: 'ltr' });
  }
  return y + LINE_H;
}

async function buildFontProviderReady() {
  const { regular, bold } = await loadReceiptTypefaces();
  return buildReceiptFontProvider(regular, bold);
}

/**
 * `printerPaperWidthPx`, when given, overrides `data.paperWidthPx` --
 * lets application/printService.ts's doDispatch() always print at the
 * CURRENTLY configured printer profile's width (read fresh at each
 * dispatch attempt, same as the printer target itself already is)
 * rather than whatever width happened to be configured back when the
 * job was first enqueued, which may since have changed.
 */
export async function renderReceiptToEscPosBase64(
  data: ReceiptData,
  printerPaperWidthPx?: number,
  themeId?: string | null,
): Promise<string> {
  try {
    // Spacing, type scale and rules come from the theme; the ZATCA fields
    // below never do. A theme decides how a receipt looks, never what a
    // tax invoice must contain.
    const th = receiptTheme(themeId);
    const gap = (n: number) => LINE_H * n * th.density;
    const sz = (n: number) => Math.round(n * th.typeScale);
    const receipt = toReceiptPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = await buildFontProviderReady();
    const logoImage = data.logoUrl ? await loadRemoteImage(data.logoUrl) : null;

    const width = receipt.paperWidthPx;
    const contentWidth = width - PAD * 2;
    const qrSize = Math.min(220, contentWidth);
    const logoSize = logoImage && th.showLogo ? Math.min(90, Math.round(width * 0.18)) : 0;
    const maxHeight = 2400 + receipt.items.length * 200 + (receipt.vatNumber ? qrSize + 120 : 0) + (logoImage ? logoSize + 40 : 0);

    const surface = createReceiptSurface(width, maxHeight);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));
    const ctx: RenderContext = { canvas, provider, width, contentWidth };

    let y = PAD + LINE_H / 2;

    if (logoImage && th.showLogo) {
      canvas.drawImageRect(
        logoImage,
        Skia.XYWHRect(0, 0, logoImage.width(), logoImage.height()),
        Skia.XYWHRect((width - logoSize) / 2, y - logoSize / 2, logoSize, logoSize),
        Skia.Paint(),
      );
      y += logoSize + LINE_H * 0.3;
    }

    // The elegant theme frames the name between two rules; the others
    // just print it.
    if (th.headerBand) {
      drawDivider(canvas, width, y);
      y += gap(0.5);
    }
    y = drawCenterLine(ctx, y, receipt.businessName, sz(30), true);
    if (th.headerBand) {
      y += gap(0.15);
      drawDivider(canvas, width, y);
      y += gap(0.5);
    }
    if (receipt.branchName) y = drawCenterLine(ctx, y, receipt.branchName, sz(19), false);
    y = drawCenterLine(ctx, y, receipt.dateLabel, sz(16), false);
    y = drawCenterLine(ctx, y, `${bi('رقم الطلب', 'Order')}: ${receipt.orderNumber}`, sz(18), true);
    if (receipt.metaLabel) y = drawCenterLine(ctx, y, receipt.metaLabel, sz(15), false);
    // ZATCA Phase 1: the heading and the seller's VAT number are mandatory
    // on a simplified tax invoice. Present in every theme.
    if (receipt.vatNumber) {
      y = drawCenterLine(ctx, y, bi('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'), sz(17), true);
      y = drawCenterLine(ctx, y, `${bi('الرقم الضريبي', 'VAT No')}: ${receipt.vatNumber}`, sz(15), false);
    }
    drawDivider(canvas, width, y);
    y += gap(0.6);

    // عناوين الأعمدة: تقول ما هي الأرقام قبل أن تبدأ. سطر واحد صغير
    // يغني عن تخمين القارئ.
    const cols = itemColumns(contentWidth);
    y = drawItemLine(
      ctx, y,
      bi('الكمية', 'Qty'),
      [bi('المنتج', 'Item')],
      bi('السعر', 'Price'),
      sz(14), false, '#555555',
    );
    y += gap(0.18);
    drawDivider(canvas, width, y);
    y += gap(0.35);

    receipt.items.forEach((item, index) => {
      const nameLines = measureAndWrapText(provider, item.name, cols.name, sz(20), true);
      y = drawItemLine(
        ctx, y,
        String(item.qty),
        nameLines,
        item.lineTotal.toFixed(2),
        sz(20), true,
      );
      // سعر الوحدة يُذكر فقط حين تتعدد الكمية — عند الواحدة يكرر السعر
      // المكتوب يمينه ولا يضيف شيئاً غير سطر يطيل الورقة.
      if (item.qty > 1) {
        y = drawItemLine(
          ctx, y, '',
          [`${item.unitPrice.toFixed(2)} × ${item.qty}`],
          '', sz(14), false, '#555555',
        );
      }
      for (const modText of item.mods) {
        for (const line of measureAndWrapText(provider, modText, cols.name, sz(14), false)) {
          y = drawItemLine(ctx, y, '', [line], '', sz(14), false, '#555555');
        }
      }
      if (th.ruleBetweenItems && index < receipt.items.length - 1) {
        y += gap(0.2);
        drawDivider(canvas, width, y);
        y += gap(0.3);
      } else {
        y += gap(0.22);
      }
    });
    drawDivider(canvas, width, y);
    y += gap(0.6);

    y = drawRow(ctx, y, receipt.subtotal.toFixed(2), bi('المجموع الفرعي', 'Subtotal'), sz(18), false);
    if (receipt.discount > 0) {
      y = drawRow(ctx, y, `-${receipt.discount.toFixed(2)}`, bi('الخصم', 'Discount'), sz(18), false);
    }
    // ZATCA: the VAT amount is a mandatory line, in every theme.
    y = drawRow(ctx, y, receipt.vat.toFixed(2), bi('ضريبة القيمة المضافة', 'VAT'), sz(18), false);
    if (th.boxedTotal) {
      const boxTop = y - LINE_H * 0.55;
      y = drawRow(ctx, y, receipt.total.toFixed(2), bi('الإجمالي', 'Total'), sz(24), true);
      drawBox(canvas, PAD * 0.6, boxTop, width - PAD * 1.2, y - boxTop - LINE_H * 0.15);
      y += gap(0.35);
    } else {
      y = drawRow(ctx, y, receipt.total.toFixed(2), bi('الإجمالي', 'Total'), sz(24), true);
    }
    drawDivider(canvas, width, y);
    y += gap(0.6);

    y = drawRow(ctx, y, '', receipt.paymentMethodLabel, sz(17), false);
    if (receipt.change > 0) {
      y = drawRow(ctx, y, receipt.change.toFixed(2), bi('الباقي', 'Change'), sz(17), false);
    }

    // ZATCA Phase 1 TLV QR -- mandatory, and identical in every theme.
    // Only its printed size varies, and never below a scannable one.
    if (receipt.vatNumber) {
      y += gap(0.5);
      const themedQr = Math.min(qrSize, th.qrMaxSize);
      const payload = zatcaQrBase64(receipt.businessName, receipt.vatNumber, receipt.timestampISO, receipt.total, receipt.vat);
      drawQrMatrix(canvas, payload, (width - themedQr) / 2, y, themedQr);
      y += themedQr + gap(0.3);
    }
    y += gap(0.4);
    for (const line of measureAndWrapText(provider, receipt.customMessage, contentWidth, sz(18), false)) {
      y = drawCenterLine(ctx, y, line, sz(18), false);
    }
    y += PAD;

    const finalHeight = Math.min(Math.ceil(y), maxHeight);
    const raster = rgbaToEscPosRaster(surface.toRgba(finalHeight));
    const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
    return bytesToBase64(bytes);
  } catch (e) {
    // Never let a rendering bug silently fail to print at all -- falls
    // back to the ASCII placeholder (domain/receipt.ts), a real
    // degradation (Arabic text becomes '?' bytes) but still a printed,
    // reconciliation-usable slip rather than nothing. This should not
    // happen in a real RN runtime (Skia.Surface.Make is native/JSI, not
    // network- or asset-dependent the way the logo/font loads are,
    // which already degrade gracefully on their own) -- disclosed here
    // as a safety net, not a normal code path.
    console.error('[receiptRenderer] real rendering failed, falling back to ASCII receipt:', e);
    return buildReceiptEscPosBase64(data);
  }
}

/**
 * renderShiftReportCanvas() + buildShiftReportEscPosBytes()
 * (rakeen-pos.js:3079, :3140) -- the shift closing report, line for line
 * and in the same order as the source lays it out.
 *
 * Built on the same helpers as the receipt above rather than a separate
 * path, so it inherits the real Arabic shaping and the configured paper
 * width instead of falling back to the ASCII placeholder.
 */
export async function renderShiftReportToEscPosBase64(
  report: ClosingReport,
  printerPaperWidthPx?: number,
): Promise<string> {
  const width = printerPaperWidthPx ?? 576;
  const provider = await buildFontProviderReady();
  const contentWidth = width - PAD * 2;
  const surface = createReceiptSurface(width, 1800);
  const { canvas } = surface;
  canvas.clear(Skia.Color('#ffffff'));
  const ctx: RenderContext = { canvas, provider, width, contentWidth };

  let y = PAD + LINE_H / 2;
  y = drawCenterLine(ctx, y, report.businessName || 'ركين', 30, true);
  if (report.branchName) y = drawCenterLine(ctx, y, report.branchName, 19, false);
  y = drawCenterLine(ctx, y, 'تقرير إغلاق الوردية', 20, true);
  y = drawCenterLine(ctx, y, report.dateLabel, 16, false);
  y = drawCenterLine(ctx, y, 'الكاشير: ' + report.staffName, 16, false);

  drawDivider(canvas, width, y);
  y += LINE_H * 0.6;

  y = drawRow(ctx, y, String(report.ordersCount), 'عدد الطلبات', 18, false);
  y = drawRow(ctx, y, report.salesTotal.toFixed(2), 'إجمالي المبيعات', 18, false);
  y = drawRow(ctx, y, report.cardTotal.toFixed(2), 'بطاقة', 18, false);
  y = drawRow(ctx, y, report.deliveryPlatformTotal.toFixed(2), 'توصيل — مدفوع عبر التطبيق', 18, false);

  drawDivider(canvas, width, y);
  y += LINE_H * 0.6;

  if (report.cashIn > 0) y = drawRow(ctx, y, report.cashIn.toFixed(2), 'إيداع بالدرج', 18, false);
  if (report.cashOut > 0) y = drawRow(ctx, y, '-' + report.cashOut.toFixed(2), 'سحب من الدرج', 18, false);
  y = drawRow(ctx, y, report.cashExpected.toFixed(2), 'الكاش المتوقع', 18, false);
  y = drawRow(ctx, y, report.cashCounted.toFixed(2), 'الكاش المعدود', 18, false);
  // The variance keeps its sign: a surplus and a shortfall are different
  // problems, and "+" is what tells them apart at a glance on paper.
  y = drawRow(
    ctx,
    y,
    (report.cashVariance >= 0 ? '+' : '') + report.cashVariance.toFixed(2),
    'الفرق',
    22,
    true,
  );

  drawDivider(canvas, width, y);
  y += LINE_H * 0.6;
  y = drawCenterLine(ctx, y, 'معتمد من المدير', 15, false);
  y += PAD;

  const finalHeight = Math.min(Math.ceil(y), 1800);
  const raster = rgbaToEscPosRaster(surface.toRgba(finalHeight));
  const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
  return bytesToBase64(bytes);
}

export async function renderKitchenTicketToEscPosBase64(data: KitchenTicketData, printerPaperWidthPx?: number): Promise<string> {
  try {
    const ticket = toKitchenTicketPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = await buildFontProviderReady();

    const width = ticket.paperWidthPx;
    const contentWidth = width - PAD * 2;
    const maxHeight = 1200 + ticket.items.length * 260;

    const surface = createReceiptSurface(width, maxHeight);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));
    const ctx: RenderContext = { canvas, provider, width, contentWidth };

    let y = PAD + KITCHEN_LINE_H / 2;
    y = drawKitchenCenterLine(ctx, y, 'طلب مطبخ', 32, true);
    if (ticket.branchName) y = drawKitchenCenterLine(ctx, y, ticket.branchName, 18, false);
    y = drawKitchenCenterLine(ctx, y, ticket.dateLabel, 16, false);
    y = drawKitchenCenterLine(ctx, y, ticket.metaLabel, 20, true);
    // The buzzer number, bigger than anything else on the ticket. Whoever
    // finishes the order reads it off this paper and types it into the
    // base station -- so it has to be legible across a hot kitchen at a
    // glance, not hunted for among the item lines.
    if (ticket.pagerNumber != null) {
      y += KITCHEN_LINE_H * 0.2;
      y = drawKitchenCenterLine(ctx, y, `جهاز النداء  ${ticket.pagerNumber}`, 40, true);
    }
    drawDivider(canvas, width, y);
    y += KITCHEN_LINE_H * 0.6;

    for (const item of ticket.items) {
      for (const line of measureAndWrapText(provider, `${item.qty} × ${item.name}`, contentWidth, 26, true)) {
        paintText(canvas, provider, line, PAD, y, contentWidth, { size: 26, bold: true, align: 'right', direction: 'rtl' });
        y += KITCHEN_LINE_H * 0.9;
      }
      for (const modText of item.mods) {
        for (const line of measureAndWrapText(provider, `— ${modText}`, contentWidth - 14, 18, false)) {
          paintText(canvas, provider, line, PAD, y, contentWidth - 14, { size: 18, bold: false, align: 'right', direction: 'rtl' });
          y += KITCHEN_LINE_H * 0.7;
        }
      }
      if (item.note) {
        for (const line of measureAndWrapText(provider, `📝 ${item.note}`, contentWidth - 14, 18, true)) {
          paintText(canvas, provider, line, PAD, y, contentWidth - 14, { size: 18, bold: true, align: 'right', direction: 'rtl' });
          y += KITCHEN_LINE_H * 0.7;
        }
      }
      y += KITCHEN_LINE_H * 0.3;
    }
    drawDivider(canvas, width, y);
    y += KITCHEN_LINE_H * 0.6 + PAD;

    const finalHeight = Math.min(Math.ceil(y), maxHeight);
    const raster = rgbaToEscPosRaster(surface.toRgba(finalHeight));
    const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
    return bytesToBase64(bytes);
  } catch (e) {
    console.error('[receiptRenderer] real kitchen-ticket rendering failed, falling back to ASCII ticket:', e);
    return buildKitchenTicketEscPosBase64(data);
  }
}

function drawKitchenCenterLine(ctx: RenderContext, y: number, text: string, size: number, bold: boolean): number {
  const height = paintText(ctx.canvas, ctx.provider, text, PAD, y, ctx.contentWidth, { size, bold, align: 'center', direction: 'rtl' });
  return y + Math.max(height, KITCHEN_LINE_H * (size > 22 ? 1.3 : 1));
}

export type { ReceiptPrintable, KitchenTicketPrintable };
