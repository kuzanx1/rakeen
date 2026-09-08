import { Skia, PaintStyle } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { createReceiptSurface, loadRemoteImage } from '../platform/receiptCanvas';
import { loadReceiptTypefaces } from '../platform/receiptFonts';
import { buildReceiptFontProvider, paintText, paintTextAnchored, measureTextWidth, measureTextWidthWeighted, measureAndWrapText } from '../platform/receiptText';
import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, RgbaBuffer } from '../domain/escposRaster';
import type { PrintTimer } from './printTiming';
import { bytesToBase64 } from '../domain/escposText';
import { zatcaQrBase64 } from '../domain/zatca';
import { buildQrMatrix } from '../domain/qrMatrix';
import { toReceiptPrintable, toKitchenTicketPrintable, ReceiptPrintable, KitchenTicketPrintable } from '../domain/receiptPrintable';
import { ReceiptData, KitchenTicketData, buildReceiptEscPosBase64, buildKitchenTicketEscPosBase64 } from '../domain/receipt';
import type { ClosingReport } from '../domain/shift';
import { receiptTheme } from '../domain/receiptTheme';
// محرّكُ الطباعة المشترك -- هو نفسُه الذي يبنيه الويب من
// `shared/receipt/` إلى `public/pos/receipt-engine.js`. مصدرٌ واحد،
// فلا تُعدَّل الورقةُ مرّتين ولا تفترق النسختان.
import { layoutReceipt } from '../../../shared/receipt';
import type { LayoutResult, Measurer } from '../../../shared/receipt';

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

/**
 * يختار المُرمِّز حسب إعداد الطابعة المحفوظ. الافتراضي `GS v 0`.
 *
 * كان الافتراضي الأمر الحديث (`GS 8 L`)، على أنه علاج الخمس والأربعين
 * ثانية. ولم يكن: السبب طابور لا يُوقظه أحد قبل عشرين ثانية،
 * وفاتورة ترفضها الطابعة لانشغالها بتذكرة المطبخ قبلها -- وكلاهما
 * أُصلح في مكانه (application/printService.ts)، لا هنا. فلم يبقَ من
 * تغيير الأمر إلا أثره السيّئ وحده.
 *
 * والطابعة التي لا تعرف أمراً لا تصمت عنه، بل تطبع حمولته حروفاً.
 * طابعة هبية لا تعرف `GS 8 L`، فخرجت بايتات الصورة على الورق
 * `<<<<` و `aaaa` بيد الزبون.
 *
 * فالافتراضي هو الأمر الذي تعرفه كل طابعة ESC/POS، وهو نفسه
 * الذي يرسله متصفّح ركين منذ اليوم الأول ولم يشتكِ منه أحد.
 * و'modern' باقٍ اختياراً في الإعدادات، يقلبه المالك حين تثبت
 * طابعته على الورق أنها تعرفه.
 */
function encodeRaster(buffer: RgbaBuffer, command?: 'modern' | 'legacy'): number[] {
  return command === 'modern' ? rgbaToEscPosRaster(buffer) : rgbaToEscPosRasterLegacy(buffer);
}

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

/** A hairline rectangle, for the boxed total and the order number. Four
 *  thin rules rather than a stroked rect: a thermal head renders a 1px
 *  stroke unevenly at low temperature, and filled bars stay crisp.
 *
 *  وهو مما لا يستطيعه وضع النص: يطبع سطراً سطراً، فالضلعان الرأسيان
 *  يحتاجان محرفاً في كل سطر ويخرجان متقطّعين. */
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

/**
 * العملة على الورق: الرمز الجديد، لا الكلمة.
 *
 * كان هنا 'ريال' مكتوبةً، وعلّتُها أن الرمز ليس في أي خط نحمله فيخرج
 * مربعاً فارغاً. وقد كان ذلك صحيحاً يوم كُتب، ثم دخل SaudiRiyal-*.ttf
 * أصولَ التطبيق للواجهة ولم ينتبه أحد أن الفاتورة تستطيع استعماله.
 *
 * وتحقّقتُ من الملف نفسه قبل الاعتماد عليه: U+20C1 موجود فيه بألف
 * وتسعمئة نقطة، ويُرسم بالاتجاه الصحيح كما هو. والانعكاس الذي يذكره
 * ui/Money.tsx يخصّ خط الويب في public/fonts، لا هذا -- ونقلُ ذلك
 * الانعكاس إلى هنا بلا فحص كان سيطبع رمزاً مقلوباً على كل ورقة.
 *
 * والخط مسجَّل عائلةً ثانية في platform/receiptText.ts: Skia تلتمس كل
 * محرف في العائلات بالترتيب، فهذا وحده يأتي منها وبقية النص لا تمسّها.
 */
const RIYAL = '⃁';

/**
 * قلب صغير، مرسوم لا مكتوب.
 *
 * الإيموji محرف يحتاج خطاً ملوّناً لا تحمله طابعة حرارية ولا يحمله
 * IBM Plex، فيخرج مربعاً فارغاً. ومسارٌ من منحنيين يُطبع على أي جهاز
 * لأنه نقاط لا حروف.
 */
function drawHeart(
  canvas: ReturnType<typeof createReceiptSurface>['canvas'],
  cx: number, cy: number, size: number,
): void {
  const p = Skia.Path.Make();
  const w = size, h = size * 0.9;
  p.moveTo(cx, cy + h * 0.42);
  p.cubicTo(cx - w * 0.62, cy - h * 0.05, cx - w * 0.30, cy - h * 0.62, cx, cy - h * 0.18);
  p.cubicTo(cx + w * 0.30, cy - h * 0.62, cx + w * 0.62, cy - h * 0.05, cx, cy + h * 0.42);
  p.close();
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  paint.setAntiAlias(true);
  canvas.drawPath(p, paint);
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

function drawRow(ctx: RenderContext, y: number, leftMono: string, rightArabic: string, size: number, bold: boolean): number {
  paintText(ctx.canvas, ctx.provider, rightArabic, PAD, y, ctx.contentWidth, { size, bold, align: 'right', direction: 'rtl' });
  if (leftMono) {
    paintText(ctx.canvas, ctx.provider, leftMono, PAD, y, ctx.contentWidth, { size, bold: false, align: 'left', direction: 'ltr' });
  }
  return y + LINE_H;
}

async function buildFontProviderReady() {
  const { regular, bold, riyalRegular, riyalBold } = await loadReceiptTypefaces();
  return buildReceiptFontProvider(regular, bold, riyalRegular, riyalBold);
}

/**
 * `printerPaperWidthPx`, when given, overrides `data.paperWidthPx` --
 * lets application/printService.ts's doDispatch() always print at the
 * CURRENTLY configured printer profile's width (read fresh at each
 * dispatch attempt, same as the printer target itself already is)
 * rather than whatever width happened to be configured back when the
 * job was first enqueued, which may since have changed.
 */
/**
 * ينفّذ أوامرَ المحرّك على لوحة Skia -- تنفيذاً أعمى، بلا قرار.
 *
 * لا هامشَ هنا ولا ارتفاعَ سطرٍ ولا حجمَ خطّ: هي كلُّها في
 * `shared/receipt/tokens.ts`، ينادِيها المحرّكُ ويُخرج مواضعَ محسوبة.
 * ولو قرّر هذا المنفّذُ شيئاً من عنده لعادت ورقةُ التطبيق تفارق ورقةَ
 * الويب من حيث لا يُرى -- وهو ما كان يقع حين كان لكلٍّ منهما راسمُه.
 */
function paintReceiptOps(
  canvas: ReturnType<typeof createReceiptSurface>['canvas'],
  provider: ReturnType<typeof buildReceiptFontProvider>,
  layout: LayoutResult,
  images: { logo: SkImage | null; qrPayload: string | null },
): void {
  const fill = Skia.Paint();
  for (const op of layout.ops) {
    if (op.op === 'rect') {
      fill.setColor(Skia.Color(op.color === 'paper' ? '#ffffff' : '#000000'));
      canvas.drawRect(Skia.XYWHRect(op.x, op.y, op.w, op.h), fill);
      continue;
    }
    if (op.op === 'dash') {
      /* متقطّعٌ لا رماديّ: اللوحةُ تُحوَّل إلى لونين قبل الطابعة، فالخطُّ
         الرماديُّ الرفيع يُنعَّم فيظهر في المعاينة ولا يُطبع أصلاً.
         ومربّعاتٌ صغيرةٌ متتابعة لا خطٌّ منقّط: الرأسُ الحراريُّ يطبع
         الشرطةَ الممتلئة نظيفةً ويتفاوت في الخطّ المرسوم. */
      fill.setColor(Skia.Color('#000000'));
      for (let x = op.x1; x < op.x2; x += op.on + op.off) {
        const w = Math.min(op.on, op.x2 - x);
        canvas.drawRect(Skia.XYWHRect(x, op.y - op.thickness / 2, w, op.thickness), fill);
      }
      continue;
    }
    if (op.op === 'image') {
      if (op.ref === 'logo' && images.logo) {
        canvas.drawImageRect(
          images.logo,
          Skia.XYWHRect(0, 0, images.logo.width(), images.logo.height()),
          Skia.XYWHRect(op.x, op.y, op.w, op.h),
          Skia.Paint(),
        );
      } else if (op.ref === 'qr' && images.qrPayload) {
        /* الرمزُ يُبنى مصفوفةَ وحداتٍ ويُرسم مربّعاتٍ، لا صورةً تُحمَّل:
           فلا شبكةَ في مسار الطباعة، والحوافُّ تخرج حادّةً بلا تنعيم --
           وهو ما يقرؤه الماسحُ من ورقٍ حراريّ. */
        drawQrMatrix(canvas, images.qrPayload, op.x, op.y, op.w);
      }
      continue;
    }
    paintTextAnchored(canvas, provider, op.text, {
      x: op.x,
      y: op.y,
      paperWidth: layout.width,
      size: op.size,
      weight: op.weight,
      align: op.align,
      direction: op.dir,
      color: op.color === 'paper' ? '#ffffff' : '#000000',
      letterSpacing: op.letterSpacing,
    });
  }
}

export async function renderReceiptToEscPosBase64(
  data: ReceiptData,
  printerPaperWidthPx?: number,
  themeId?: string | null,
  rasterCommand?: 'modern' | 'legacy',
  timer?: PrintTimer,
): Promise<string> {
  try {
    const receipt = toReceiptPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = timer
      ? await timer.stage('fontsReady', () => buildFontProviderReady())
      : await buildFontProviderReady();
    const logoImage = data.logoUrl
      ? timer
        ? await timer.stage('logoLoad', () => loadRemoteImage(data.logoUrl as string))
        : await loadRemoteImage(data.logoUrl)
      : null;

    /* القياسُ هو الشيءُ الوحيد الذي لا يستطيع المحرّكُ فعلَه بنفسه:
       عرضُ الكلمة لا يُعرف إلا من الخطّ، والخطُّ هنا. فيُمرَّر إليه
       ويبقى الحسابُ كلُّه عنده -- وهذا ما جعل توحيدَ الراسمَين ممكناً. */
    const measure: Measurer = (text, size, weight) => measureTextWidthWeighted(provider, text, size, weight);

    const layout = layoutReceipt({
      receipt: {
        businessName: receipt.businessName,
        showBusinessName: receipt.showBusinessName,
        tagline: receipt.tagline,
        branchLabel: receipt.branchLabel,
        branchName: receipt.branchName,
        locationLine: receipt.locationLine,
        vatNumber: receipt.vatNumber,
        orderNumber: receipt.orderNumber,
        dateLabel: receipt.dateLabel,
        cashierName: receipt.cashierName,
        metaLabel: receipt.metaLabel,
        refundOfOrder: receipt.refundOfOrder,
        customerName: receipt.customerName,
        customerPhone: receipt.customerPhone,
        items: receipt.items,
        orderNote: receipt.orderNote,
        subtotal: receipt.subtotal,
        discount: receipt.discount,
        vat: receipt.vat,
        total: receipt.total,
        paymentMethodLabel: receipt.paymentMethodLabel,
        change: receipt.change,
        customMessage: receipt.customMessage,
      },
      measure,
      paperWidth: receipt.paperWidthPx,
      theme: themeId ?? 'classic',
      currency: RIYAL,
      logo: logoImage ? { width: logoImage.width(), height: logoImage.height() } : null,
      // هيئةُ الزكاة: الرمزُ إلزاميٌّ متى وُجد رقمٌ ضريبيّ، وحجمُه وحدَه
      // ما يختلف بالقالب -- ولا ينزل عمّا يُقرأ.
      qr: receipt.vatNumber ? { width: 1, height: 1 } : null,
    });

    /* ارتفاعٌ محسوبٌ بالضبط قبل أن تُحجز اللوحة.
       كان يُقدَّر تقديراً سخيّاً (٢٤٠٠ + ٢٠٠ لكلّ صنف) ثم يُقصّ، فطلبٌ
       من ثلاثين صنفاً يحجز ما يقارب ثمانيةَ عشرَ ميغابايت من الذاكرة
       لأجل ورقةٍ نصفُها فارغ -- على جهازٍ يعمل الوردية كلَّها. */
    const surface = createReceiptSurface(layout.width, layout.height);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));

    const qrPayload = receipt.vatNumber
      ? zatcaQrBase64(receipt.businessName, receipt.vatNumber, receipt.timestampISO, receipt.total, receipt.vat)
      : null;
    paintReceiptOps(canvas, provider, layout, { logo: logoImage, qrPayload });

    const rgba = timer ? await timer.stage('pixelsRead', () => surface.toRgba(layout.height)) : surface.toRgba(layout.height);
    const raster = timer
      ? await timer.stage('escposBuild', () => encodeRaster(rgba, rasterCommand))
      : encodeRaster(rgba, rasterCommand);
    const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
    return timer ? await timer.stage('base64', () => bytesToBase64(bytes)) : bytesToBase64(bytes);
  } catch (e) {
    // Never let a rendering bug silently fail to print at all -- falls
    // back to the ASCII placeholder (domain/receipt.ts), a real
    // degradation (Arabic text becomes '?' bytes) but still a printed,
    // reconciliation-usable slip rather than nothing.
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
  rasterCommand?: 'modern' | 'legacy',
  timer?: PrintTimer,
): Promise<string> {
  const width = printerPaperWidthPx ?? 576;
  const provider = await buildFontProviderReady();
  const contentWidth = width - PAD * 2;
  const surface = createReceiptSurface(width, 2200);
  const { canvas } = surface;
  canvas.clear(Skia.Color('#ffffff'));
  const ctx: RenderContext = { canvas, provider, width, contentWidth };

  // نفس ترتيب ورقة الكاشير حرفياً: مبيعات ← طرق دفع ← صندوق ← توقيع.
  // ورقة واحدة لمنشأة واحدة لا يجوز أن تختلف باختلاف الجهاز الذي طبعها.
  const opt = report.options ?? {};
  const on = (k: string) => opt[k] !== false;
  const n = (v: number | undefined) => `${(v ?? 0).toFixed(2)} ${RIYAL}`;

  let y = PAD + LINE_H / 2;
  y = drawCenterLine(ctx, y, report.businessName || 'ركين', 30, true);
  if (report.branchName) y = drawCenterLine(ctx, y, report.branchName, 19, false);
  y += LINE_H * 0.2;
  y = drawCenterLine(ctx, y, 'تقرير إغلاق الوردية', 20, true);
  y = drawCenterLine(ctx, y, 'Shift Close Report', 15, false);
  y = drawCenterLine(ctx, y, report.dateLabel, 16, false);
  drawDivider(canvas, width, y);
  y += LINE_H * 0.5;
  y = drawRow(ctx, y, '', 'الكاشير · Cashier: ' + report.staffName, 17, false);
  if (report.shiftStart) y = drawRow(ctx, y, '', 'من · From: ' + report.shiftStart, 16, false);
  drawDivider(canvas, width, y);
  y += LINE_H * 0.5;

  y = drawCenterLine(ctx, y, 'المبيعات · Sales', 16, true);
  y = drawRow(ctx, y, n(report.grossSales ?? report.salesTotal), 'إجمالي المبيعات · Gross', 18, false);
  if (on('discounts')) y = drawRow(ctx, y, '-' + n(report.discountsTotal), 'الخصومات · Discounts', 18, false);
  if (on('refunds')) y = drawRow(ctx, y, '-' + n(report.refundsTotal), `المرتجعات · Refunds (${report.refundsCount ?? 0})`, 18, false);
  if (on('vat')) y = drawRow(ctx, y, n(report.vatTotal), 'ضريبة القيمة المضافة · VAT', 18, false);
  y = drawRow(ctx, y, n(report.netSales ?? report.salesTotal), 'صافي المبيعات · Net', 20, true);
  drawDivider(canvas, width, y);
  y += LINE_H * 0.5;

  y = drawCenterLine(ctx, y, 'طرق الدفع · Payments', 16, true);
  y = drawRow(ctx, y, n(report.cashSales), 'كاش · Cash', 18, false);
  y = drawRow(ctx, y, n(report.cardTotal), 'شبكة · Card', 18, false);
  y = drawRow(ctx, y, n(report.deliveryPlatformTotal), 'تطبيقات توصيل · Delivery Apps', 18, false);
  if (report.onlinePaymentsEnabled) y = drawRow(ctx, y, n(report.onlineTotal), 'دفع إلكتروني · Online', 18, false);
  drawDivider(canvas, width, y);
  y += LINE_H * 0.5;

  y = drawCenterLine(ctx, y, 'الصندوق · Cash Drawer', 16, true);
  y = drawRow(ctx, y, n(report.openingCash), 'الرصيد الافتتاحي · Opening float', 18, false);
  y = drawRow(ctx, y, '+' + n(report.cashSales), 'مبيعات الكاش · Cash sales', 18, false);
  if (report.cashIn > 0) y = drawRow(ctx, y, '+' + n(report.cashIn), 'إيداع بالدرج · Pay-in', 18, false);
  if (report.cashOut > 0) y = drawRow(ctx, y, '-' + n(report.cashOut), 'سحب من الدرج · Pay-out', 18, false);
  if ((report.refundsTotal ?? 0) > 0) y = drawRow(ctx, y, '-' + n(report.refundsTotal), 'مرتجعات كاش · Refunds paid', 18, false);
  y = drawRow(ctx, y, n(report.cashExpected), 'المتوقع في الدرج · Expected', 18, true);
  y = drawRow(ctx, y, n(report.cashCounted), 'المعدود · Counted', 18, false);
  const vTop = y - LINE_H * 0.55;
  // The variance keeps its sign: a surplus and a shortfall are different
  // problems, and "+" is what tells them apart at a glance on paper.
  y = drawRow(
    ctx,
    y,
    (report.cashVariance >= 0 ? '+' : '') + report.cashVariance.toFixed(2) + ' ' + RIYAL,
    'الفرق · Variance',
    22,
    true,
  );

  // الفرق داخل إطار: هو السطر الوحيد الذي يُفتح عليه تحقيق.
  drawBox(canvas, PAD * 0.6, vTop, width - PAD * 1.2, y - vTop - LINE_H * 0.15);
  y += LINE_H * 0.35;

  if (on('counts')) {
    drawDivider(canvas, width, y);
    y += LINE_H * 0.5;
    y = drawRow(ctx, y, String(report.ordersCount), 'عدد الطلبات · Orders', 17, false);
    y = drawRow(ctx, y, n(report.avgTicket), 'متوسط الفاتورة · Avg ticket', 17, false);
  }

  // خانتا توقيع بدل جملة "معتمد من المدير" التي كانت تدّعي اعتماداً بلا
  // مكانٍ يوقَّع فيه.
  if (on('signatures')) {
    drawDivider(canvas, width, y);
    y += LINE_H * 0.9;
    y = drawRow(ctx, y, '', 'توقيع الكاشير · Cashier  ______________', 15, false);
    y += LINE_H * 0.5;
    y = drawRow(ctx, y, '', 'توقيع المدير · Manager   ______________', 15, false);
  }
  y += PAD;

  const finalHeight = Math.min(Math.ceil(y), 2200);
  const raster = encodeRaster(surface.toRgba(finalHeight), rasterCommand);
  const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
  return bytesToBase64(bytes);
}

export async function renderKitchenTicketToEscPosBase64(data: KitchenTicketData, printerPaperWidthPx?: number, rasterCommand?: 'modern' | 'legacy', timer?: PrintTimer): Promise<string> {
  try {
    const ticket = toKitchenTicketPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = await buildFontProviderReady();
    // شعار المطبخ لا يمنع الطباعة: تذكرة بلا شعار تذكرة، وتذكرة لم تُطبع
    // لأن مضيف الصور بطيء هي طلب ضاع في المطبخ.
    const logoImage = data.logoUrl ? await loadRemoteImage(data.logoUrl).catch(() => null) : null;

    const width = ticket.paperWidthPx;
    const contentWidth = width - PAD * 2;
    const maxHeight = 1200 + ticket.items.length * 260;

    const surface = createReceiptSurface(width, maxHeight);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));
    const ctx: RenderContext = { canvas, provider, width, contentWidth };

    let y = PAD + KITCHEN_LINE_H / 2;

    // الشعار يتصدّرها، و"KITCHEN RECEIPT" تحته -- بدل كلمة "طلب مطبخ".
    // المطبخ يعرف أنها تذكرته من شكلها، والسطر الإنجليزي يقولها لمن لا
    // يقرأ العربية دون أن يزاحم الشعار.
    if (logoImage) {
      const lw = Math.round(width * 0.34);
      const lr = logoImage.height() / logoImage.width();
      const lh = Math.round(lw * lr);
      canvas.drawImageRect(
        logoImage,
        Skia.XYWHRect(0, 0, logoImage.width(), logoImage.height()),
        Skia.XYWHRect((width - lw) / 2, y, lw, lh),
        Skia.Paint(),
      );
      y += lh + KITCHEN_LINE_H * 0.35;
    }
    y = drawKitchenCenterLine(ctx, y, 'KITCHEN RECEIPT', logoImage ? 24 : 32, true);
    if (ticket.branchName) y = drawKitchenCenterLine(ctx, y, ticket.branchName, 18, false);
    y = drawKitchenCenterLine(ctx, y, ticket.dateLabel, 16, false);
    y = drawKitchenCenterLine(ctx, y, ticket.metaLabel, 20, true);

    // الرقم الذي يُنادى به.
    //
    // جهاز النداء إن وُجد، وإلا رقم الطلب -- ولا يجتمعان: رقمان كبيران
    // متجاوران يجعلان من يقرأهما عبر مطبخ حار يتردد أيّهما ينادي.
    y += KITCHEN_LINE_H * 0.25;
    if (ticket.pagerNumber != null) {
      y = drawKitchenCenterLine(ctx, y, 'جهاز النداء · Pager', 16, false);
      y = drawKitchenCenterLine(ctx, y, String(ticket.pagerNumber), 44, true);
    } else {
      y = drawKitchenCenterLine(ctx, y, 'رقم الطلب · Order No', 16, false);
      y = drawKitchenCenterLine(ctx, y, ticket.orderNumber, 40, true);
    }
    drawDivider(canvas, width, y);
    y += KITCHEN_LINE_H * 0.6;

    for (const item of ticket.items) {
      const kName = item.nameEn ? `${item.name} | ${item.nameEn}` : item.name;
      for (const line of measureAndWrapText(provider, `${item.qty}x ${kName}`, contentWidth, 26, true)) {
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
        // بلا إيموجي: محرف يحتاج خطاً ملوّناً لا تحمله الطابعة، فيخرج مربعاً.
        for (const line of measureAndWrapText(provider, `ملاحظات: ${item.note}`, contentWidth - 14, 18, true)) {
          paintText(canvas, provider, line, PAD, y, contentWidth - 14, { size: 18, bold: true, align: 'right', direction: 'rtl' });
          y += KITCHEN_LINE_H * 0.7;
        }
      }
      y += KITCHEN_LINE_H * 0.3;
    }
    drawDivider(canvas, width, y);
    y += KITCHEN_LINE_H * 0.55;

    if (ticket.cashierName) {
      y = drawKitchenCenterLine(ctx, y, `طبعها · By: ${ticket.cashierName}`, 16, false);
    }

    // بالعافية عليكم، وقلب مرسوم بجانبها.
    y += KITCHEN_LINE_H * 0.35;
    const blessing = 'بالعافية عليكم';
    const bSize = 22;
    const bw = measureTextWidth(provider, blessing, bSize, true);
    const heart = bSize * 0.72;
    const gapx = bSize * 0.42;
    const totalW = bw + gapx + heart;
    const startX = (width - totalW) / 2;
    paintText(canvas, provider, blessing, startX + heart + gapx, y - bSize * 0.62, bw + 4, {
      size: bSize, bold: true, align: 'right', direction: 'rtl',
    });
    drawHeart(canvas, startX + heart / 2, y - bSize * 0.1, heart);
    y += KITCHEN_LINE_H * 0.9 + PAD;

    const finalHeight = Math.min(Math.ceil(y), maxHeight);
    const rgba = timer ? await timer.stage('pixelsRead', () => surface.toRgba(finalHeight)) : surface.toRgba(finalHeight);
    const raster = timer
      ? await timer.stage('escposBuild', () => encodeRaster(rgba, rasterCommand))
      : encodeRaster(rgba, rasterCommand);
    const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
    return timer ? await timer.stage('base64', () => bytesToBase64(bytes)) : bytesToBase64(bytes);
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
