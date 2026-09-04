import { Skia, PaintStyle } from '@shopify/react-native-skia';
import { createReceiptSurface, loadRemoteImage } from '../platform/receiptCanvas';
import { loadReceiptTypefaces } from '../platform/receiptFonts';
import { buildReceiptFontProvider, paintText, measureAndWrapText } from '../platform/receiptText';
import { rgbaToEscPosRaster } from '../domain/escposRaster';
import { zatcaQrBase64 } from '../domain/zatca';
import { buildQrMatrix } from '../domain/qrMatrix';
import { toReceiptPrintable, toKitchenTicketPrintable, ReceiptPrintable, KitchenTicketPrintable } from '../domain/receiptPrintable';
import { ReceiptData, KitchenTicketData, buildReceiptEscPosBase64, buildKitchenTicketEscPosBase64 } from '../domain/receipt';
import type { ClosingReport } from '../domain/shift';

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
export async function renderReceiptToEscPosBase64(data: ReceiptData, printerPaperWidthPx?: number): Promise<string> {
  try {
    const receipt = toReceiptPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = await buildFontProviderReady();
    const logoImage = data.logoUrl ? await loadRemoteImage(data.logoUrl) : null;

    const width = receipt.paperWidthPx;
    const contentWidth = width - PAD * 2;
    const qrSize = Math.min(220, contentWidth);
    const logoSize = logoImage ? Math.min(90, Math.round(width * 0.18)) : 0;
    const maxHeight = 2400 + receipt.items.length * 200 + (receipt.vatNumber ? qrSize + 120 : 0) + (logoImage ? logoSize + 40 : 0);

    const surface = createReceiptSurface(width, maxHeight);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));
    const ctx: RenderContext = { canvas, provider, width, contentWidth };

    let y = PAD + LINE_H / 2;

    if (logoImage) {
      canvas.drawImageRect(
        logoImage,
        Skia.XYWHRect(0, 0, logoImage.width(), logoImage.height()),
        Skia.XYWHRect((width - logoSize) / 2, y - logoSize / 2, logoSize, logoSize),
        Skia.Paint(),
      );
      y += logoSize + LINE_H * 0.3;
    }

    y = drawCenterLine(ctx, y, receipt.businessName, 30, true);
    if (receipt.branchName) y = drawCenterLine(ctx, y, receipt.branchName, 19, false);
    y = drawCenterLine(ctx, y, receipt.dateLabel, 16, false);
    y = drawCenterLine(ctx, y, `رقم الطلب: ${receipt.orderNumber}`, 18, true);
    if (receipt.metaLabel) y = drawCenterLine(ctx, y, receipt.metaLabel, 15, false);
    if (receipt.vatNumber) {
      y = drawCenterLine(ctx, y, 'فاتورة ضريبية مبسطة', 17, true);
      y = drawCenterLine(ctx, y, `الرقم الضريبي: ${receipt.vatNumber}`, 15, false);
    }
    drawDivider(canvas, width, y);
    y += LINE_H * 0.6;

    for (const item of receipt.items) {
      for (const line of measureAndWrapText(provider, item.name, contentWidth, 21, true)) {
        paintText(canvas, provider, line, PAD, y, contentWidth, { size: 21, bold: true, align: 'right', direction: 'rtl' });
        y += LINE_H * 0.85;
      }
      for (const modText of item.mods) {
        for (const line of measureAndWrapText(provider, modText, contentWidth, 15, false)) {
          paintText(canvas, provider, line, PAD, y, contentWidth, { size: 15, bold: false, align: 'right', direction: 'rtl', color: '#333333' });
          y += LINE_H * 0.7;
        }
      }
      y = drawRow(ctx, y, item.lineTotal.toFixed(2), `${item.qty} × ${item.unitPrice.toFixed(2)}`, 18, false);
    }
    drawDivider(canvas, width, y);
    y += LINE_H * 0.6;

    y = drawRow(ctx, y, receipt.subtotal.toFixed(2), 'المجموع الفرعي', 18, false);
    if (receipt.discount > 0) y = drawRow(ctx, y, `-${receipt.discount.toFixed(2)}`, 'الخصم', 18, false);
    y = drawRow(ctx, y, receipt.vat.toFixed(2), 'ضريبة القيمة المضافة', 18, false);
    y = drawRow(ctx, y, receipt.total.toFixed(2), 'الإجمالي', 24, true);
    drawDivider(canvas, width, y);
    y += LINE_H * 0.6;

    y = drawRow(ctx, y, '', receipt.paymentMethodLabel, 17, false);
    if (receipt.change > 0) y = drawRow(ctx, y, receipt.change.toFixed(2), 'الباقي', 17, false);

    if (receipt.vatNumber) {
      y += LINE_H * 0.5;
      const payload = zatcaQrBase64(receipt.businessName, receipt.vatNumber, receipt.timestampISO, receipt.total, receipt.vat);
      drawQrMatrix(canvas, payload, (width - qrSize) / 2, y, qrSize);
      y += qrSize + LINE_H * 0.3;
    }
    y += LINE_H * 0.4;
    for (const line of measureAndWrapText(provider, receipt.customMessage, contentWidth, 18, false)) {
      y = drawCenterLine(ctx, y, line, 18, false);
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
