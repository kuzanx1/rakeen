import { Skia, PaintStyle } from '@shopify/react-native-skia';
import { createReceiptSurface, loadRemoteImage } from '../platform/receiptCanvas';
import { loadReceiptTypefaces } from '../platform/receiptFonts';
import { buildReceiptFontProvider, paintText, measureTextWidth, measureAndWrapText } from '../platform/receiptText';
import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, RgbaBuffer } from '../domain/escposRaster';
import type { PrintTimer } from './printTiming';
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
 * The lighter rule that separates one item from the next.
 *
 * Dashed, not a thinner or greyer solid line: this canvas is reduced to
 * one bit per dot before it reaches the printer, so a line is either a
 * dot or nothing and neither colour nor sub-pixel width survives the
 * trip. Dash spacing is the only weight that does — which is also how the
 * text renderer separates its items, so the two paths agree on paper.
 */
function drawItemRule(canvas: ReturnType<typeof createReceiptSurface>['canvas'], width: number, y: number): void {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  paint.setPathEffect(Skia.PathEffect.MakeDash([2, 3], 0));
  canvas.drawLine(PAD, Math.round(y) + 0.5, width - PAD, Math.round(y) + 0.5, paint);
}

/**
 * العملة على الورق: الكلمة لا الرمز.
 *
 * رمز الريال الجديد ليس في أي خط تحمله الطابعة ولا في IBM Plex الذي
 * نرسم به -- وتعليق ‎.rk-riyal‎ في CSS الكاشير يقول ذلك صراحةً: أي نص
 * يعرضه خارج تلك الفئة يخرج مربعاً فارغاً، وهو فوق ذلك مرسوم معكوساً
 * في خطه. ومربع فارغ جنب كل سعر أسوأ من غياب العملة.
 */
const RIYAL = 'ريال';

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

/** الفاصل بحسب القالب: أربع لغات بصرية لنفس الوظيفة. */
function drawThemedRule(
  canvas: ReturnType<typeof createReceiptSurface>['canvas'],
  width: number, y: number, mode: string,
): void {
  if (mode === 'none') return;
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  if (mode === 'bar') {
    // شريط سميك: يُرى من بعيد، ويجعل الأقسام كتلاً لا سطوراً.
    canvas.drawRect(Skia.XYWHRect(PAD, y - 3, width - PAD * 2, 6), paint);
    return;
  }
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1);
  if (mode === 'dotted') paint.setPathEffect(Skia.PathEffect.MakeDash([2, 4], 0));
  canvas.drawLine(PAD, Math.round(y) + 0.5, width - PAD, Math.round(y) + 0.5, paint);
}

/** شريط أسود بكتابة بيضاء -- أقوى تمييز تقدر عليه طابعة بلون واحد. */
function drawInvertBar(ctx: RenderContext, y: number, text: string, size: number): number {
  const h = Math.round(size * 1.9);
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  ctx.canvas.drawRect(Skia.XYWHRect(PAD * 0.5, y - h / 2, ctx.width - PAD, h), paint);
  paintText(ctx.canvas, ctx.provider, text, PAD, y - size * 0.72, ctx.contentWidth, {
    size, bold: true, align: 'center', direction: 'rtl', color: '#ffffff',
  });
  return y + h / 2 + LINE_H * 0.5;
}

/**
 * حروف متباعدة.
 *
 * بإدراج مسافة رفيعة بين الحروف لا بخاصية تباعد: العربية تتصل حروفها
 * فالمباعدة تفكّها، فتُطبَّق على اللاتيني والأرقام وحدها.
 */
function drawSpacedText(ctx: RenderContext, y: number, text: string, size: number, bold: boolean): number {
  const shown = /[؀-ۿ]/.test(text) ? text : [...text].join(' ');
  paintText(ctx.canvas, ctx.provider, shown, PAD, y - size * 0.7, ctx.contentWidth, {
    size, bold, align: 'center', direction: 'rtl',
  });
  return y + LINE_H * (size > 22 ? 1.3 : 1);
}

/** سطر صنف بنقاط موصِلة بين اسمه وسعره -- مظهر التذاكر القديمة. */
function drawLeaderRow(ctx: RenderContext, y: number, name: string, price: string, size: number, bold: boolean): number {
  paintText(ctx.canvas, ctx.provider, name, PAD, y, ctx.contentWidth, { size, bold, align: 'right', direction: 'rtl' });
  paintText(ctx.canvas, ctx.provider, price, PAD, y, ctx.contentWidth, { size, bold: false, align: 'left', direction: 'ltr' });
  const nameW = measureTextWidth(ctx.provider, name, size, bold);
  const priceW = measureTextWidth(ctx.provider, price, size, false);
  const from = PAD + priceW + 8;
  const to = ctx.width - PAD - nameW - 8;
  if (to > from) {
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('#000000'));
    for (let x = from; x < to; x += 6) {
      ctx.canvas.drawRect(Skia.XYWHRect(x, y + size * 0.62, 2, 2), paint);
    }
  }
  return y + LINE_H;
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
  rasterCommand?: 'modern' | 'legacy',
  timer?: PrintTimer,
): Promise<string> {
  try {
    // Spacing, type scale and rules come from the theme; the ZATCA fields
    // below never do. A theme decides how a receipt looks, never what a
    // tax invoice must contain.
    const th = receiptTheme(themeId);
    const gap = (n: number) => LINE_H * n * th.density;
    const sz = (n: number) => Math.round(n * th.typeScale);
    const receipt = toReceiptPrintable(printerPaperWidthPx != null ? { ...data, paperWidthPx: printerPaperWidthPx } : data);
    const provider = timer
      ? await timer.stage('fontsReady', () => buildFontProviderReady())
      : await buildFontProviderReady();
    const logoImage = data.logoUrl
      ? timer
        ? await timer.stage('logoLoad', () => loadRemoteImage(data.logoUrl as string))
        : await loadRemoteImage(data.logoUrl)
      : null;

    const width = receipt.paperWidthPx;
    const contentWidth = width - PAD * 2;
    const qrSize = Math.min(220, contentWidth);
    // الشعار بنسبة أبعاده الأصلية.
    //
    // كان يُرسم في مربع مهما كانت أبعاده، فشعار عريض ٣:٢ -- وهو الشائع --
    // يُضغط أفقياً. العرض وحده مضبوط الآن والارتفاع يتبعه، مع سقفٍ
    // للارتفاع حتى لا يبتلع شعارٌ طويل نصف الورقة.
    const logoW0 = logoImage && th.showLogo ? Math.round(width * (th.logoWidth ?? 0.3)) : 0;
    const logoRatio = logoImage ? logoImage.height() / logoImage.width() : 1;
    const logoCapH = Math.round(width * 0.34);
    const logoW = logoW0 * logoRatio > logoCapH ? Math.round(logoCapH / logoRatio) : logoW0;
    const logoH = Math.round(logoW * logoRatio);
    const maxHeight = 2400 + receipt.items.length * 200 + (receipt.vatNumber ? qrSize + 120 : 0) + (logoImage ? logoH + 40 : 0);

    const surface = createReceiptSurface(width, maxHeight);
    const { canvas } = surface;
    canvas.clear(Skia.Color('#ffffff'));
    const ctx: RenderContext = { canvas, provider, width, contentWidth };

    let y = PAD + LINE_H / 2;

    if (logoImage && th.showLogo && logoW > 0) {
      canvas.drawImageRect(
        logoImage,
        Skia.XYWHRect(0, 0, logoImage.width(), logoImage.height()),
        Skia.XYWHRect((width - logoW) / 2, y, logoW, logoH),
        Skia.Paint(),
      );
      y += logoH + LINE_H * 0.45;
    }

    // The elegant theme frames the name between two rules; the others
    // just print it.
    if (th.headerBand) {
      drawThemedRule(canvas, width, y, th.rule);
      y += gap(0.5);
    }
    // الاسم تحت الشعار اختياري -- أغلب الشعارات تحمله داخلها. لكن بلا
    // شعار يصير الاسم هو الترويسة كلها، فلا يُخفى مهما كان الإعداد.
    const nameShown = receipt.showBusinessName || !(logoImage && th.showLogo && logoW > 0);
    if (nameShown) y = drawCenterLine(ctx, y, receipt.businessName, sz(30), true);
    if (th.headerBand) {
      y += gap(0.15);
      drawThemedRule(canvas, width, y, th.rule);
      y += gap(0.5);
    }
    if (receipt.tagline) {
      y += gap(0.25);
      y = drawCenterLine(ctx, y, receipt.tagline, sz(17), false);
      y += gap(0.2);
    }
    // اسم الفرع يسبق الحي والمدينة، ولا يُمرَّر إلا لمنشأة لها أكثر من فرع.
    const whereLine = [receipt.branchLabel, receipt.locationLine].filter(Boolean).join(' — ');
    if (whereLine) y = drawCenterLine(ctx, y, whereLine, sz(16), false);
    else if (receipt.branchName) y = drawCenterLine(ctx, y, receipt.branchName, sz(17), false);

    if (receipt.vatNumber) {
      y += gap(0.2);
      y = drawCenterLine(ctx, y, bi('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'), sz(16), true);
      y = drawCenterLine(ctx, y, `${bi('الرقم الضريبي', 'VAT No')}: ${receipt.vatNumber}`, sz(14), false);
    }

    // رقم الطلب في صندوق. الملصق صغير فوقه، والرقم وحده كبيراً -- الرقم
    // هو المطلوب، فلا تزاحمه الكلمة الدالة عليه بنفس حجمه.
    y += gap(0.7);
    if (th.orderStyle === 'invert') {
      y = drawInvertBar(ctx, y, `${bi('رقم الطلب', 'Order No')}   ${receipt.orderNumber}`, sz(24));
    } else if (th.orderStyle === 'plain') {
      y = drawCenterLine(ctx, y, `${bi('رقم الطلب', 'Order')}: ${receipt.orderNumber}`, sz(17), true);
    } else if (th.orderStyle === 'spaced') {
      y = drawSpacedText(ctx, y, bi('رقم الطلب', 'Order No'), sz(12), false);
      y = drawSpacedText(ctx, y, receipt.orderNumber, sz(28), true);
    } else {
      const boxTop = y;
      y += gap(0.45);
      y = drawCenterLine(ctx, y, bi('رقم الطلب', 'Order No'), sz(14), false);
      y = drawCenterLine(ctx, y, receipt.orderNumber, sz(30), true);
      y += gap(0.35);
      drawBox(canvas, PAD + contentWidth * 0.2, boxTop, contentWidth * 0.6, y - boxTop);
    }
    y += gap(0.5);

    y = drawCenterLine(ctx, y, receipt.dateLabel, sz(15), false);
    y += gap(0.35);
    drawThemedRule(canvas, width, y, th.rule);
    y += gap(0.45);

    // من أصدرها ونوعها، صفّين معنونين.
    if (th.sectionLabels) y = drawSpacedText(ctx, y, bi('الطلب', 'ORDER'), sz(11), false);
    if (receipt.cashierName) y = drawRow(ctx, y, '', `${bi('تمت بواسطة', 'Served by')}: ${receipt.cashierName}`, sz(15), false);
    if (receipt.metaLabel) y = drawRow(ctx, y, '', `${bi('نوع الطلب', 'Type')}: ${receipt.metaLabel}`, sz(15), false);
    y += gap(0.1);
    drawThemedRule(canvas, width, y, th.rule);
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
    drawThemedRule(canvas, width, y, th.rule);
    y += gap(0.35);

    receipt.items.forEach((item, index) => {
      // العربي والإنجليزي على سطر واحد يفصلهما شَرطة.
      //
      // هذا ما عجز عنه وضع النص: الفاصل محرف محايد بين مقطعين بلغتين،
      // وموضعه بعد ترتيب المقاطع غير محدَّد، فكان يقع مرة يمين العربي
      // ومرة يسار الإنجليزي بلا قاعدة. أما هنا فالنص يُرسم بترتيب
      // ثنائي الاتجاه صحيح، فالسطر الواحد يصحّ -- ويوفّر سطراً لكل صنف.
      // الكمية ملتصقة بالاسم: "2x سبانيش لاتيه".
      //
      // عمودٌ مستقل للكمية كان يفصل الرقم عن الصنف الذي يعدّه بعرض
      // الورقة كلها، فتقفز العين بينهما. والرقم ملتصقاً يُقرأ مع اسمه في
      // نظرة واحدة، ويحرّر العمود لصالح الاسم -- وهو ما يحتاجه اسمان
      // بلغتين.
      const named = item.nameEn ? `${item.name} | ${item.nameEn}` : item.name;
      const fullName = `${item.qty}x ${named}`;
      if (th.itemStyle === 'leaders') {
        y = drawLeaderRow(ctx, y, fullName, `${item.lineTotal.toFixed(2)} ${RIYAL}`, sz(17), true);
        for (const modText of item.mods) y = drawRow(ctx, y, '', `— ${modText}`, sz(14), false);
        if (item.note) y = drawRow(ctx, y, '', `ملاحظات: ${item.note}`, sz(14), false);
        if (index < receipt.items.length - 1) { y += gap(0.2); drawItemRule(canvas, width, y); y += gap(0.3); }
        else y += gap(0.22);
        return;
      }
      const nameLines = measureAndWrapText(provider, fullName, cols.name + cols.qty, sz(20), true);
      y = drawItemLine(
        ctx, y,
        '',
        nameLines,
        `${item.lineTotal.toFixed(2)} ${RIYAL}`,
        sz(20), true,
      );
      // سعر الوحدة يُذكر فقط حين تتعدد الكمية — عند الواحدة يكرر السعر
      // المكتوب يمينه ولا يضيف شيئاً غير سطر يطيل الورقة.
      // سعر الوحدة سطر مستقل فقط حين تتعدد الكمية: عند الواحد يكرر
      // الرقم المطبوع بجانبه، فيتوقف القارئ ليتأكد أنه لم يُحاسَب مرتين.
      if (item.qty > 1) {
        y = drawItemLine(
          ctx, y, '',
          [`${item.unitPrice.toFixed(2)} ${RIYAL} × ${item.qty}`],
          '', sz(14), false, '#555555',
        );
      }
      for (const modText of item.mods) {
        for (const line of measureAndWrapText(provider, `+ ${modText}`, cols.name, sz(14), false)) {
          y = drawItemLine(ctx, y, '', [line], '', sz(14), false, '#555555');
        }
      }
      // الملاحظة تحمل اسمها، وإلا أشبهت اسم منتج بلا سعر.
      if (item.note) {
        for (const line of measureAndWrapText(provider, `ملاحظات: ${item.note}`, cols.name, sz(14), false)) {
          y = drawItemLine(ctx, y, '', [line], '', sz(14), false, '#333333');
        }
      }
      // فاصل بين كل منتج والذي يليه، لا بعد آخرها: خط القسم تحته يغلق
      // الجدول. وهو مرقّط لا كامل، وإلا تساوى حدّ الصنف بحدّ القسم
      // فصارت الفاتورة شبكة.
      if (index < receipt.items.length - 1) {
        y += gap(0.2);
        drawItemRule(canvas, width, y);
        y += gap(0.3);
      } else {
        y += gap(0.22);
      }
    });

    // ملاحظة الزبون على الطلب كله: أسفل الأصناف وقبل الأرقام.
    //
    // ليست ملاحظة صنف فتُكتب تحته، ولا سطر حساب فتُكتب بين المبالغ --
    // هي تعليمات تخصّ ما فوقها جميعاً، فموضعها بينهما.
    if (receipt.orderNote) {
      y += gap(0.25);
      for (const line of measureAndWrapText(provider, `ملاحظات الطلب: ${receipt.orderNote}`, contentWidth, sz(15), false)) {
        y = drawRow(ctx, y, '', line, sz(15), false);
      }
      y += gap(0.1);
    }

    drawThemedRule(canvas, width, y, th.rule);
    y += gap(0.6);

    if (th.sectionLabels) y = drawSpacedText(ctx, y, bi('الحساب', 'PAYMENT'), sz(11), false);
    y = drawRow(ctx, y, `${receipt.subtotal.toFixed(2)} ${RIYAL}`, bi('المجموع الفرعي', 'Subtotal'), sz(18), false);
    if (receipt.discount > 0) {
      y = drawRow(ctx, y, `-${receipt.discount.toFixed(2)} ${RIYAL}`, bi('الخصم', 'Discount'), sz(18), false);
    }
    // ZATCA: the VAT amount is a mandatory line, in every theme.
    y = drawRow(ctx, y, `${receipt.vat.toFixed(2)} ${RIYAL}`, bi('ضريبة القيمة المضافة', 'VAT'), sz(18), false);
    if (th.totalStyle === 'invert') {
      y = drawInvertBar(ctx, y, `${bi('الإجمالي', 'Total')}   ${receipt.total.toFixed(2)} ${RIYAL}`, sz(21));
    } else if (th.totalStyle === 'box') {
      const boxTop = y - LINE_H * 0.55;
      y = drawRow(ctx, y, `${receipt.total.toFixed(2)} ${RIYAL}`, bi('الإجمالي', 'Total'), sz(22), true);
      drawBox(canvas, PAD * 0.6, boxTop, width - PAD * 1.2, y - boxTop - LINE_H * 0.15);
      y += gap(0.35);
    } else {
      y = drawRow(ctx, y, `${receipt.total.toFixed(2)} ${RIYAL}`, bi('الإجمالي', 'Total'),
        th.totalStyle === 'plain' ? sz(19) : sz(24), true);
    }
    drawThemedRule(canvas, width, y, th.rule);
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
    const rgba = timer ? await timer.stage('pixelsRead', () => surface.toRgba(finalHeight)) : surface.toRgba(finalHeight);
    const raster = timer
      ? await timer.stage('escposBuild', () => encodeRaster(rgba, rasterCommand))
      : encodeRaster(rgba, rasterCommand);
    const bytes = [0x1b, 0x40, ...raster, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
    return timer ? await timer.stage('base64', () => bytesToBase64(bytes)) : bytesToBase64(bytes);
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
