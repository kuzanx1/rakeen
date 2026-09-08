/**
 * محرّكُ الفاتورة -- الحسابُ كلُّه هنا، ولا رسمَ فيه.
 *
 * يأخذ بيانات الطلب ومقاسَ الورق، ويُخرج قائمةَ أوامرِ رسمٍ وارتفاعاً
 * محسوباً بالضبط. ثم ينفّذها الكانفسُ في الويب وSkia في التطبيق تنفيذاً
 * أعمى -- فتخرج الورقتان واحدة، لا لأنّ أحداً وازن بينهما، بل لأنّ
 * الحسابَ لم يقع إلّا مرّةً واحدة.
 *
 * وما كان قبلَ اليوم نسختين: راسمٌ في `public/pos/rakeen-pos.js` وراسمٌ
 * في `receiptRenderer.ts`. تُعدَّل واحدةٌ فتبقى الأخرى، ولا شيءَ يشتكي
 * -- الورقةُ تُطبع، وإنّما تُطبع مختلفة.
 *
 * ولا رقمَ عارياً هنا: كلُّ مقاسٍ من `tokens.ts`. فمن أراد تكبيرَ خطٍّ
 * أو ورقاً أضيق، فهناك، لا في هذا الملفّ.
 */

import { createContext, leaderDots } from './context';
import {
  BORDER, COLUMNS, DASH, LINE, LOGO, ORDER_BOX, PAD,
  QR_MAX, SPACE, TOTAL_BOX, TYPE, WEIGHT, themeTokens,
} from './tokens';
import type { LayoutInput, LayoutResult, ReceiptItem } from './types';

/** ملصقٌ بلغتين: الورقةُ يقرؤها الزبونُ ويقرؤها المُراجع. */
export function bi(ar: string, en: string): string {
  return ar + ' · ' + en;
}

const ARABIC = /[؀-ۿ]/;

export function layoutReceipt(input: LayoutInput): LayoutResult {
  const { receipt, measure, paperWidth: width, currency, logo, qr } = input;
  const th = themeTokens(input.theme);
  /* بدائيّاتُ الرسم من السياق المشترك -- هي بعينها التي تبني تذكرةَ
     المطبخ وتقريرَ الوردية. وكانت لكلّ ورقةٍ نسختُها منها. */
  const ctx = createContext({ width, line: LINE, measure, density: th.density });
  const { ops, contentWidth, gap, text, rect, wrap, centerText, rowText, spacedText } = ctx;

  /** حجمُ الخطّ: مقاسُ السُّلَّم مضروباً في سُلَّم القالب. */
  const sz = (n: number): number => Math.round(n * th.typeScale);

  /**
   * الشعارُ بنسبة أبعاده الأصلية.
   *
   * كان يُرسم في مربّعٍ مهما كانت أبعادُه، فشعارٌ عريضٌ ٣:٢ -- وهو
   * الشائع -- يُضغط أفقياً. والعرضُ وحدَه هو المضبوط الآن والارتفاعُ
   * يتبعه، مع سقفٍ للارتفاع حتى لا يبتلع شعارٌ طويلٌ نصفَ الورقة.
   *
   * ويُحسب قبل كلّ شيء لأنّ موضعَ أوّل سطرٍ يتوقّف على وجوده.
   */
  let logoW = 0;
  let logoH = 0;
  if (logo && th.showLogo) {
    const w0 = Math.round(width * th.logoWidth * LOGO.boost);
    const ratio = logo.height / logo.width;
    const capH = Math.round(width * LOGO.maxHeight * LOGO.boost);
    logoW = w0 * ratio > capH ? Math.round(capH / ratio) : w0;
    logoH = Math.round(logoW * ratio);
  }
  // بلا فراغٍ فوق الشعار: هو أوّلُ ما يُرى، لا ما يُرى بعد فراغ.
  if (logoW > 0) ctx.y = PAD * LOGO.topPad;

  /** الفاصلُ بحسب القالب: أربعُ لغاتٍ بصريةٍ لوظيفةٍ واحدة. */
  const divider = (): void => {
    const mode = th.rule;
    if (mode === 'none') { ctx.y += gap(SPACE.ruleless); return; }
    if (mode === 'bar') {
      rect(PAD, ctx.y - BORDER.bar / 2, contentWidth, BORDER.bar);
      ctx.y += gap(SPACE.afterBar);
      return;
    }
    if (mode === 'dotted') {
      ctx.dash(Math.round(ctx.y) + 0.5, DASH.rule.on, DASH.rule.off);
      ctx.y += gap(SPACE.afterRule);
      return;
    }
    ctx.rule(SPACE.afterRule);
  };

  /**
   * خيطٌ خفيف بين الأصناف -- أخفُّ من فاصل الأقسام فلا ينازعه معناه.
   *
   * وله مسافةٌ فوقه كما له تحته: كان يُرسم عند خطّ الأساس فيقع على
   * السطر الذي قبله، فيُقرأ شطباً على النصّ لا فصلاً بين قسمين.
   */
  const hairline = (): void => {
    ctx.y += gap(SPACE.hairlineAbove);
    ctx.dash(Math.round(ctx.y) + 0.5, DASH.hairline.on, DASH.hairline.off);
    ctx.y += gap(SPACE.hairlineBelow);
  };

  const invertBar = (t: string, size: number): void => ctx.invertBar(t, size, SPACE.afterInvert);

  /**
   * سطرٌ بنقاطٍ موصِلة بين الاسم وسعره -- مظهرُ التذاكر القديمة.
   *
   * والاسمُ يلتفّ إن طال: كان يُرسم سطراً واحداً مهما بلغ، فاسمٌ عربيٌّ
   * طويل يزحف على السعر ثم يخرج من حافّة الورقة اليسرى -- يُقصّ عند
   * الطبع ولا يظهر شيءٌ في المعاينة يقول إنه قُصّ.
   */
  const leaderRow = (name: string, price: string, size: number, bold: boolean): void => {
    const weight = bold ? WEIGHT.bold : WEIGHT.regular;
    const priceW = measure(price, size, WEIGHT.regular, 'mono');
    const room = contentWidth - priceW - DASH.leader.clearance * 2;
    const lines = wrap(name, size, weight, 'sans', room);
    lines.slice(0, -1).forEach(line => {
      text(line, width - PAD, size, weight, 'sans', 'right', 'rtl');
      ctx.y += gap(SPACE.row);
    });
    const last = lines[lines.length - 1];
    text(last, width - PAD, size, weight, 'sans', 'right', 'rtl');
    text(price, PAD, size, WEIGHT.regular, 'mono', 'left', 'ltr');
    const nameW = measure(last, size, weight, 'sans');
    leaderDots(ctx, PAD + priceW + DASH.leader.clearance, width - PAD - nameW - DASH.leader.clearance);
    ctx.y += gap(SPACE.row);
  };

  const money = (n: number): string => n.toFixed(2) + ' ' + currency;

  // ── الترويسة ────────────────────────────────────────────────────────
  if (logoW > 0) {
    ops.push({ op: 'image', ref: 'logo', x: (width - logoW) / 2, y: ctx.y, w: logoW, h: logoH });
    ctx.y += logoH + LINE * SPACE.afterLogo;
  }

  if (th.headerBand) divider();
  /**
   * الاسمُ تحت الشعار اختياريّ -- أغلبُ الشعارات تحمل الاسمَ داخلها.
   * لكنّ غيابَ الشعار يجعل الاسمَ هو الترويسةَ كلَّها، فلا يُخفى حينئذٍ
   * مهما كان الإعداد: ورقةٌ بلا اسمٍ ولا شعارٍ ليست فاتورة.
   */
  const nameShown = receipt.showBusinessName !== false || logoW <= 0;
  if (nameShown) centerText(receipt.businessName || 'ركين', sz(TYPE.businessName), true);
  if (th.headerBand) divider();

  if (receipt.tagline) centerText(receipt.tagline, sz(TYPE.tagline), false);
  const whereLine = [receipt.branchLabel, receipt.locationLine].filter(Boolean).join(' — ');
  if (whereLine) centerText(whereLine, sz(TYPE.where), false);
  else if (receipt.branchName) centerText(receipt.branchName, sz(TYPE.branchOnly), false);

  // هيئةُ الزكاة، المرحلة الأولى: العنوانُ والرقمُ الضريبيّ إلزاميّان على
  // الفاتورة المبسّطة، في كلّ قالب. وموضعُهما مع بيانات المنشأة فهما
  // تعريفٌ بالبائع لا ببيانات هذا الطلب.
  if (receipt.vatNumber) {
    ctx.y += gap(SPACE.beforeZatca);
    centerText(bi('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'), sz(TYPE.zatcaHeading), true);
    centerText(bi('الرقم الضريبي', 'VAT No') + ': ' + receipt.vatNumber, sz(TYPE.zatcaVatNo), false);
  }

  // ── رقمُ الطلب ──────────────────────────────────────────────────────
  // أوّلُ ما تبحث عنه العين، فيستحقّ حدّاً يخصّه. وهو سطرٌ قائمٌ بذاته
  // دائماً: كان مطويّاً في سطر النوع فيختفي كلّما طُبعت الفاتورة قبل أن
  // يعطي الخادمُ رقماً، فيخرج الزبونُ بورقةٍ لا يسأل بها عن طلبه.
  ctx.y += gap(SPACE.beforeOrderBox);
  if (th.orderStyle === 'invert') {
    invertBar(bi('رقم الطلب', 'Order No') + '   ' + receipt.orderNumber, sz(TYPE.orderInvert));
  } else if (th.orderStyle === 'plain') {
    centerText(bi('رقم الطلب', 'Order') + ': ' + receipt.orderNumber, sz(TYPE.orderPlain), true);
  } else if (th.orderStyle === 'spaced') {
    spacedText(bi('رقم الطلب', 'Order No'), sz(TYPE.orderSpacedLabel), false);
    ctx.y -= gap(ORDER_BOX.liftY / 2);
    spacedText(receipt.orderNumber, sz(TYPE.orderSpacedNumber), true);
  } else {
    /**
     * صندوقٌ: حشوةٌ متساويةٌ ورقمٌ في وسطها.
     *
     * كان حدُّه يُحسب من موضع خطّ الأساس بعد الرسم، فالمسافةُ فوق
     * الملصق غيرُ المسافة تحت الرقم -- فيُقرأ الصندوقُ مائلاً وإن كان
     * مستقيماً. فتُحسب أبعادُه أوّلاً ثم يُرسم النصُّ داخله، لا العكس.
     */
    const labelSz = sz(TYPE.orderLabel);
    const numSz = sz(TYPE.orderNumber);
    const padIn = Math.round(LINE * ORDER_BOX.padY);
    const gapIn = Math.round(LINE * ORDER_BOX.gapY);
    const boxH = padIn + labelSz + gapIn + numSz + padIn;
    const boxW = Math.round(contentWidth * ORDER_BOX.width);
    const boxX = Math.round((width - boxW) / 2);
    const boxTop = ctx.y - LINE * ORDER_BOX.liftY;
    const bw = BORDER.box;

    ctx.box(boxX, boxTop, boxW, boxH, bw);

    text(bi('رقم الطلب', 'Order No'), width / 2, labelSz, WEIGHT.bold, 'sans', 'center', 'rtl',
      { at: boxTop + padIn + labelSz * ORDER_BOX.baseline });
    text(receipt.orderNumber, width / 2, numSz, WEIGHT.bold, 'sans', 'center', 'ltr',
      { at: boxTop + padIn + labelSz + gapIn + numSz * ORDER_BOX.baseline });

    ctx.y = boxTop + boxH;
  }
  ctx.y += gap(SPACE.afterOrderBox);

  // التاريخُ تحت الرقم: تتمّةُ كتلته، لا سطرٌ في ترويسة المنشأة.
  centerText(receipt.dateLabel, sz(TYPE.date), false);
  ctx.y += gap(SPACE.beforeDate);
  divider();

  if (th.sectionLabels) spacedText(bi('الطلب', 'ORDER'), sz(TYPE.sectionLabel), true);
  const metaSz = sz(TYPE.meta);
  if (receipt.cashierName) rowText('', bi('تمت بواسطة', 'Served by') + ': ' + receipt.cashierName, metaSz, false);
  if (receipt.metaLabel) rowText('', bi('نوع الطلب', 'Type') + ': ' + receipt.metaLabel, metaSz, false);
  /* رقمُ الطلب الأصليّ في إشعار الاسترجاع: الورقةُ تُسند إلى ما استُرجع
     منه، وإلّا كانت مبلغاً بلا مصدرٍ عند الجرد. */
  if (receipt.refundOfOrder) rowText('', bi('استرجاع من الطلب', 'Refund of') + ': ' + receipt.refundOfOrder, metaSz, true);
  if (receipt.customerName) rowText('', bi('العميل', 'Customer') + ': ' + receipt.customerName, metaSz, false);
  if (receipt.customerPhone) rowText('', bi('الجوال', 'Phone') + ': ' + receipt.customerPhone, metaSz, false);
  divider();

  // ── الأصناف ─────────────────────────────────────────────────────────
  const qtyW = Math.round(width * COLUMNS.qty);
  const priceW = Math.round(width * COLUMNS.price);
  const nameW = contentWidth - qtyW - priceW;
  const nameRight = width - PAD - qtyW;

  receipt.items.forEach((it: ReceiptItem, idx: number) => {
    const mods = it.mods || [];
    const isLast = idx === receipt.items.length - 1;

    if (th.itemStyle === 'leaders') {
      // الكميةُ ملتصقةٌ بالاسم: عمودٌ مستقلٌّ كان يفصل الرقمَ عن الصنف
      // الذي يعدّه بعرض الورقة، فتقفز العينُ بينهما.
      const shown = it.qty + 'x ' + (it.nameEn ? it.name + ' | ' + it.nameEn : it.name);
      leaderRow(shown, money(it.lineTotal), sz(TYPE.itemLeader), true);
      /* والإضافاتُ والملاحظةُ تلتفّ كذلك: كانت تُرسم سطراً واحداً بلا
         حدّ، فملاحظةٌ طويلة -- «بدون سكر وحليب على الجانب» وما فوقها --
         تمتدّ خارج الورقة فيُقصّ آخرُها عند الطبع. */
      const subSz = sz(TYPE.itemSub);
      mods.forEach(m => {
        wrap('— ' + m, subSz, WEIGHT.regular, 'sans', contentWidth)
          .forEach(line => rowText('', line, subSz, false));
      });
      if (it.note) {
        wrap('ملاحظات: ' + it.note, subSz, WEIGHT.regular, 'sans', contentWidth)
          .forEach(line => rowText('', line, subSz, false));
      }
      if (!isLast) hairline();
      return;
    }

    /**
     * صفٌّ واحدٌ بأعمدةٍ ثابتة: الكميةُ يميناً، والصنفُ وسطاً، والسعرُ
     * يساراً -- كلُّها على خطّ أساسٍ واحد.
     *
     * كان الصنفُ سطراً وسعرُه سطراً تحته، فالصفُّ الواحدُ ثلاثةُ أسطر
     * والعينُ تنزل وتصعد لتصل الاسمَ بثمنه. ولا عمودَ يحاذي عموداً:
     * الأسعارُ تبدأ حيث انتهى الاسم فتتذبذب من سطرٍ إلى سطر.
     *
     * والأعمدةُ ثابتةُ العرض لا تابعةٌ للنصّ -- هذا معنى الشبكة.
     */
    const nameSz = sz(TYPE.itemName);
    const nameOnly = it.nameEn ? it.name + ' | ' + it.nameEn : it.name;
    const firstY = ctx.y;

    wrap(nameOnly, nameSz, WEIGHT.medium, 'sans', nameW).forEach(line => {
      text(line, nameRight, nameSz, WEIGHT.medium, 'sans', 'right', 'rtl');
      ctx.y += gap(SPACE.itemNameLine);
    });

    // الكميةُ والسعرُ على سطر الاسم الأوّل، لا على آخره مهما طال.
    const numSz = sz(TYPE.itemNumeric);
    text(String(it.qty), width - PAD, numSz, WEIGHT.medium, 'sans', 'right', 'ltr', { at: firstY });
    text(money(it.lineTotal), PAD, numSz, WEIGHT.medium, 'sans', 'left', 'ltr', { at: firstY });

    /* لا رماديَّ على ورقٍ حراريّ: الورقُ لا يعرف إلّا نقطةً محروقةً أو
       بيضاء، وحرفٌ صغيرٌ لا تبلغ سيقانُه تغطيةً تامّة يقع الرماديُّ فيه
       على جانب البياض حيث يثبت الأسود. (قِيست: بتغطية ٥٠٪ يثبت #000
       ويسقط #555.) وسطورُ الإضافات أوّلُ ما يتقطّع، وهي ما كان رمادياً. */
    const subSz = sz(TYPE.itemSub);
    mods.forEach(m => {
      // داخل عمود الاسم لا بعرض الورقة: هي تابعةٌ للصنف فتُزاح معه.
      wrap('— ' + m, subSz, WEIGHT.regular, 'sans', nameW).forEach(line => {
        text(line, nameRight, subSz, WEIGHT.regular, 'sans', 'right', 'rtl');
        ctx.y += gap(SPACE.itemSubLine);
      });
    });
    // الملاحظةُ تُطبع للزبون أيضاً بطلب صاحب المطعم -- كانت للمطبخ وحده،
    // فكان الزبونُ لا يرى ما طلبه بنفسه.
    if (it.note) {
      wrap('ملاحظات: ' + it.note, subSz, WEIGHT.regular, 'sans', nameW).forEach(line => {
        text(line, nameRight, subSz, WEIGHT.regular, 'sans', 'right', 'rtl');
        ctx.y += gap(SPACE.itemSubLine);
      });
    }
    /* سعرُ الوحدة سطرٌ مستقلٌّ فقط حين تتعدّد الكمية.
       عند الواحد كان يطبع «1 × 12.00» بجانب «12.00» -- الرقمُ نفسُه
       مرّتين، فيتوقّف القارئُ ليتأكّد أنه لم يُحاسَب مرّتين. */
    if (it.qty > 1) {
      text(it.qty + ' × ' + money(it.unitPrice), nameRight, sz(TYPE.itemUnitPrice),
        WEIGHT.regular, 'sans', 'right', 'rtl');
      ctx.y += gap(SPACE.itemSubLine);
    }
    ctx.y += gap(SPACE.afterItem);
    /* ولا خطَّ بين كلِّ صنفٍ وصنف: كان الصنفُ ثلاثةَ أسطرٍ فاحتاج خطاً
       يفصله، وقد صار صفاً واحداً بأعمدةٍ مصطفّة فالفراغُ يكفي. ويبقى
       الخطُّ حيث يلزم: بين صنفٍ حمل إضافاتٍ وما بعده، فسطورُه المزاحة
       قد تُقرأ تتمّةً للذي يليه. */
    if ((mods.length > 0 || it.note) && !isLast) hairline();
  });

  // ملاحظةُ الزبون على الطلب كلِّه: أسفلَ الأصناف وقبل الأرقام. ليست
  // ملاحظةَ صنفٍ فتُكتب تحته، ولا سطرَ حسابٍ فتُكتب بين المبالغ.
  if (receipt.orderNote) {
    ctx.y += gap(SPACE.beforeOrderNote);
    const noteSz = sz(TYPE.orderNote);
    wrap('ملاحظات الطلب: ' + receipt.orderNote, noteSz, WEIGHT.regular, 'sans', contentWidth)
      .forEach(line => rowText('', line, noteSz, false));
    ctx.y += gap(SPACE.afterOrderNote);
  }
  divider();

  // ── الحساب ──────────────────────────────────────────────────────────
  if (th.sectionLabels) spacedText(bi('الحساب', 'PAYMENT'), sz(TYPE.sectionLabel), true);
  const rowSz = sz(TYPE.totalRow);
  rowText(money(receipt.subtotal), bi('المجموع الفرعي', 'Subtotal'), rowSz, false);
  if (receipt.discount > 0) rowText('-' + money(receipt.discount), bi('الخصم', 'Discount'), rowSz, false);
  // هيئةُ الزكاة: مبلغُ الضريبة سطرٌ إلزاميٌّ في كلّ قالب.
  rowText(money(receipt.vat), bi('ضريبة القيمة المضافة', 'VAT'), rowSz, false);

  const totalTop = ctx.y - LINE * TOTAL_BOX.liftY;
  if (th.totalStyle === 'invert') {
    invertBar(bi('الإجمالي', 'Total') + '   ' + money(receipt.total), sz(TYPE.grandTotalInvert));
  } else if (th.totalStyle === 'box') {
    const tTop = ctx.y - LINE * TOTAL_BOX.liftY;
    rowText(money(receipt.total), bi('الإجمالي', 'Total'), sz(TYPE.grandTotalBox), true);
    const tH = ctx.y - LINE * TOTAL_BOX.dropY - tTop;
    const bx = PAD * TOTAL_BOX.inset;
    const bw2 = width - PAD * TOTAL_BOX.inset * 2;
    const t = BORDER.totalBox;
    ctx.box(bx, tTop, bw2, tH, t);
    ctx.y += gap(SPACE.afterTotalBox);
  } else {
    rowText(money(receipt.total), bi('الإجمالي', 'Total'),
      sz(th.totalStyle === 'plain' ? TYPE.grandTotalPlain : TYPE.grandTotalBold), true);
  }
  if (th.boxedTotal) {
    const bx = PAD * TOTAL_BOX.inset;
    const bw2 = width - PAD * TOTAL_BOX.inset * 2;
    const bh = ctx.y - totalTop - LINE * TOTAL_BOX.strokeDropY;
    const t = BORDER.totalBox;
    ctx.box(bx, totalTop, bw2, bh, t);
    ctx.y += gap(SPACE.afterBoxedTotal);
  }
  divider();

  const paySz = sz(TYPE.payment);
  rowText('', receipt.paymentMethodLabel, paySz, false);
  if (receipt.change > 0) rowText(receipt.change.toFixed(2), 'الباقي', paySz, false);

  // ── الخاتمة ─────────────────────────────────────────────────────────
  if (qr) {
    const qrSize = Math.min(QR_MAX, th.qrMaxSize, contentWidth);
    ctx.y += LINE * SPACE.beforeQr;
    // في الوسط تماماً: (width - qrSize) / 2 مهما كان عرضُ الورق.
    ops.push({ op: 'image', ref: 'qr', x: (width - qrSize) / 2, y: ctx.y, w: qrSize, h: qrSize });
    ctx.y += qrSize + LINE * SPACE.afterQr;
  }
  ctx.y += LINE * SPACE.beforeFooter;

  // كلُّ سطرٍ يكتبه صاحبُ المطعم يطبع سطراً: «مدة الجلوس ٦٠ دقيقة»
  // و«شكراً لزيارتكم» جملتان، ودمجُهما في فقرةٍ واحدة يطمس الأولى.
  const footSz = sz(TYPE.footer);
  (receipt.customMessage || 'شكراً لزيارتكم')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(part => {
      wrap(part, footSz, WEIGHT.regular, 'sans', contentWidth)
        .forEach(line => centerText(line, footSz, false));
    });
  ctx.y += PAD;

  return { width, height: Math.ceil(ctx.y), ops };
}
