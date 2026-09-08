import { Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { createReceiptSurface, loadRemoteImage } from '../platform/receiptCanvas';
import { loadReceiptTypefaces } from '../platform/receiptFonts';
import { buildReceiptFontProvider, paintTextAnchored, measureTextWidthWeighted } from '../platform/receiptText';
import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, RgbaBuffer } from '../domain/escposRaster';
import type { PrintTimer } from './printTiming';
import { bytesToBase64 } from '../domain/escposText';
import { zatcaQrBase64 } from '../domain/zatca';
import { buildQrMatrix } from '../domain/qrMatrix';
import { toReceiptPrintable, toKitchenTicketPrintable, ReceiptPrintable, KitchenTicketPrintable } from '../domain/receiptPrintable';
import { ReceiptData, KitchenTicketData, buildReceiptEscPosBase64, buildKitchenTicketEscPosBase64 } from '../domain/receipt';
import type { ClosingReport } from '../domain/shift';
// محرّكُ الطباعة المشترك -- هو نفسُه الذي يبنيه الويب من
// `shared/receipt/` إلى `public/pos/receipt-engine.js`. مصدرٌ واحد،
// فلا تُعدَّل الورقةُ مرّتين ولا تفترق النسختان.
import { layoutReceipt, layoutKitchenTicket, layoutShiftReport, HEART, DEFAULT_PAPER_WIDTH } from '../../../shared/receipt';
import type { LayoutResult, Measurer, KitchenTicketModel, ShiftReportModel } from '../../../shared/receipt';

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

/* ولا مقاسَ هنا: كانت PAD وLINE_H وKITCHEN_LINE_H تعيش في هذا الملفّ
   ونظائرُها في ملفّ الويب، فتُعدَّل واحدةٌ وتبقى الأخرى. هي الآن في
   `shared/receipt/tokens.ts` وحدها. */


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
/**
 * رمزُ الريال على الورقة: ﷼ (U+FDFC) -- وهو نفسُه الذي يطبعه الويب.
 *
 * كان التطبيقُ يرسم ⃁ والويبُ يكتب «ريال» بالحروف، فالورقتان تختلفان
 * في العملة نفسِها. و⃁ يحتاج خطاً قائماً بذاته، ونسخةُ الويب منه
 * تُرسم معكوسةً فتحتاج قلباً -- وهو ما لا تفعله لوحةُ الرسم.
 *
 * و﷼ يملكه الخطّان كلاهما بغلافه الخاصّ (قِيس في المتصفّح: بصمةُ
 * بكسلاته تخالف بصمةَ احتياطيّ النظام)، فلا قلبَ ولا ملفَّ زائد.
 *
 * وواجهةُ التطبيق تبقى على ⃁ (ui/Money.tsx): تلك شاشةٌ تعرف الخطوطَ
 * وتقدر على القلب، وهذه ورقةٌ تُرسل صورةً إلى طابعة.
 */
const RIYAL = '﷼';

async function buildFontProviderReady() {
  const { regular, bold, riyalRegular, riyalBold, monoRegular, monoBold } = await loadReceiptTypefaces();
  return buildReceiptFontProvider(regular, bold, riyalRegular, riyalBold, monoRegular, monoBold);
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
export function paintReceiptOps(
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
    if (op.op === 'glyph') {
      /* قلبٌ مرسومٌ بمنحنياته لا محرفُ إيموجي: الإيموجي يحتاج خطاً
         ملوّناً لا تحمله طابعةٌ حرارية، فيخرج مربّعاً فارغاً. ونِسَبُه
         من المقاسات المشتركة، فهو قلبُ الويب نفسُه لا شبيهُه. */
      const w = op.size;
      const h = op.size * HEART.aspect;
      const path = Skia.Path.Make();
      path.moveTo(op.cx, op.cy + h * HEART.bottom);
      path.cubicTo(op.cx - w * HEART.c1x, op.cy - h * HEART.c1y,
                   op.cx - w * HEART.c2x, op.cy - h * HEART.c2y,
                   op.cx, op.cy - h * HEART.dip);
      path.cubicTo(op.cx + w * HEART.c2x, op.cy - h * HEART.c2y,
                   op.cx + w * HEART.c1x, op.cy - h * HEART.c1y,
                   op.cx, op.cy + h * HEART.bottom);
      path.close();
      fill.setColor(Skia.Color('#000000'));
      canvas.drawPath(path, fill);
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
      family: op.family,
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
    const measure: Measurer = (text, size, weight, family) => measureTextWidthWeighted(provider, text, size, weight, family);

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
  const width = printerPaperWidthPx ?? DEFAULT_PAPER_WIDTH;
  const provider = await buildFontProviderReady();
  const measure: Measurer = (text, size, weight, family) => measureTextWidthWeighted(provider, text, size, weight, family);

  // ورقةٌ واحدةٌ لمنشأةٍ واحدة لا يجوز أن تختلف باختلاف الجهاز الذي
  // طبعها -- فالتخطيطُ من المحرّك المشترك، وهذا ينفّذه لا غير.
  const layout = layoutShiftReport({
    report: report as unknown as ShiftReportModel,
    measure,
    paperWidth: width,
    currency: RIYAL,
  });

  const surface = createReceiptSurface(layout.width, layout.height);
  const { canvas } = surface;
  canvas.clear(Skia.Color('#ffffff'));
  paintReceiptOps(canvas, provider, layout, { logo: null, qrPayload: null });

  const rgba = surface.toRgba(layout.height);
  const raster = encodeRaster(rgba, rasterCommand);
  const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
  return bytesToBase64(bytes);
}

export async function renderKitchenTicketToEscPosBase64(data: KitchenTicketData, printerPaperWidthPx?: number, rasterCommand?: 'modern' | 'legacy', timer?: PrintTimer): Promise<string> {
  try {
    const ticket = toKitchenTicketPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = await buildFontProviderReady();
    // شعارُ المطبخ لا يمنع الطباعة: تذكرةٌ بلا شعارٍ تذكرة، وتذكرةٌ لم
    // تُطبع لأنّ مضيفَ الصور بطيء هي طلبٌ ضاع في المطبخ.
    const logoImage = data.logoUrl ? await loadRemoteImage(data.logoUrl).catch(() => null) : null;
    const measure: Measurer = (text, size, weight, family) => measureTextWidthWeighted(provider, text, size, weight, family);

    const layout = layoutKitchenTicket({
      ticket: ticket as unknown as KitchenTicketModel,
      measure,
      paperWidth: ticket.paperWidthPx,
      logo: logoImage ? { width: logoImage.width(), height: logoImage.height() } : null,
    });

    const surface = createReceiptSurface(layout.width, layout.height);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));
    paintReceiptOps(canvas, provider, layout, { logo: logoImage, qrPayload: null });

    const rgba = surface.toRgba(layout.height);
    const raster = encodeRaster(rgba, rasterCommand);
    const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
    return bytesToBase64(bytes);
  } catch (e) {
    console.error('[receiptRenderer] kitchen ticket rendering failed, falling back to ASCII:', e);
    return buildKitchenTicketEscPosBase64(data);
  }
}

export type { ReceiptPrintable, KitchenTicketPrintable };
