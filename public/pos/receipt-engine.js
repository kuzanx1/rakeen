/* مولَّد -- لا يُحرَّر. المصدر: shared/receipt/
   يُعاد بناؤه بـ: npm run receipt:build */
"use strict";
var RakeenReceiptEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // shared/receipt/index.ts
  var index_exports = {};
  __export(index_exports, {
    BORDER: () => BORDER,
    COLUMNS: () => COLUMNS,
    CSS_DPI: () => CSS_DPI,
    DASH: () => DASH,
    DEFAULT_PAPER_WIDTH: () => DEFAULT_PAPER_WIDTH,
    INVERT_BAR: () => INVERT_BAR,
    LINE: () => LINE,
    LOGO: () => LOGO,
    ORDER_BOX: () => ORDER_BOX,
    PAD: () => PAD,
    PAPER: () => PAPER,
    PRINTER_DPI: () => PRINTER_DPI,
    QR_MAX: () => QR_MAX,
    SPACE: () => SPACE,
    THEMES: () => THEMES,
    TOTAL_BOX: () => TOTAL_BOX,
    TRACKING: () => TRACKING,
    TYPE: () => TYPE,
    WEIGHT: () => WEIGHT,
    bi: () => bi,
    dotsFromCss: () => dotsFromCss,
    dotsFromMm: () => dotsFromMm,
    layoutReceipt: () => layoutReceipt,
    stubMeasure: () => stubMeasure,
    themeTokens: () => themeTokens
  });

  // shared/receipt/tokens.ts
  var PRINTER_DPI = 203;
  var CSS_DPI = 96;
  function dotsFromCss(px) {
    return Math.round(px * PRINTER_DPI / CSS_DPI);
  }
  function dotsFromMm(mm) {
    return Math.round(mm * PRINTER_DPI / 25.4);
  }
  var PAPER = {
    mm80: 576,
    mm58: 384
  };
  var DEFAULT_PAPER_WIDTH = PAPER.mm80;
  var PAD = 16;
  var LINE = 32;
  var TYPE = {
    /** اسمُ المنشأة -- أكبرُ ما في الترويسة. */
    businessName: 30,
    /** السطرُ التعريفيّ تحت الاسم. */
    tagline: 17,
    /** الفرعُ والحيُّ والمدينة. */
    where: 16,
    /** اسمُ الفرع وحدَه حين لا يوجد عنوان. */
    branchOnly: 19,
    /** عنوانُ "فاتورة ضريبية مبسطة" -- تفرضه هيئةُ الزكاة. */
    zatcaHeading: 16,
    /** الرقمُ الضريبيّ. */
    zatcaVatNo: 15,
    /** ملصقُ "رقم الطلب" داخل الصندوق. */
    orderLabel: 16,
    /** رقمُ الطلب داخل الصندوق -- أكبرُ رقمٍ على الورقة. */
    orderNumber: 38,
    /** رقمُ الطلب في القالب المضغوط: سطرٌ واحد بلا صندوق. */
    orderPlain: 17,
    /** رقمُ الطلب في الشريط المقلوب. */
    orderInvert: 24,
    /** الملصقُ والرقم في القالب الأنيق (حروفٌ متباعدة). */
    orderSpacedLabel: 15,
    orderSpacedNumber: 28,
    /** تاريخُ الطلب. */
    date: 15,
    /** عناوينُ الأقسام الصغيرة: «الطلب»، «الحساب». */
    sectionLabel: 14,
    /** الكاشير، نوعُ الطلب، العميل، الجوال. */
    meta: 15,
    /** اسمُ الصنف. */
    itemName: 21,
    /** الكميةُ والسعرُ في عمودَيهما. */
    itemNumeric: 19,
    /** الإضافاتُ والملاحظاتُ تحت الصنف. */
    itemSub: 16,
    /** سطرُ «٢ × ١٢٫٠٠» حين تتعدّد الكمية. */
    itemUnitPrice: 15,
    /** الصنفُ في قالب النقاط الموصِلة. */
    itemLeader: 17,
    /** ملاحظةُ الطلب كلِّه. */
    orderNote: 15,
    /** المجموعُ الفرعيّ، والخصم، والضريبة. */
    totalRow: 18,
    /** الإجماليُّ النهائيّ، بحسب القالب. */
    grandTotalBold: 24,
    grandTotalPlain: 19,
    grandTotalBox: 22,
    grandTotalInvert: 21,
    /** طريقةُ الدفع والباقي. */
    payment: 17,
    /** رسالةُ الخاتمة. */
    footer: 18
  };
  var WEIGHT = {
    regular: 600,
    medium: 700,
    bold: 800,
    mono: 500
  };
  var SPACE = {
    /** سطرٌ عاديّ يتبع سطراً. */
    row: 1,
    /** سطرٌ كبير (اسمُ المنشأة ونحوه). */
    rowLarge: 1.3,
    /** تحت الفاصل الصلب. */
    afterRule: 0.6,
    /** تحت الشريط الأسود. */
    afterBar: 0.75,
    /** بدلُ الفاصل في القالب المضغوط -- فراغٌ يفصل بلا خطّ. */
    ruleless: 0.55,
    /** فوق الخيط الخفيف وتحته. الفاصلُ بلا مسافةٍ حوله شَطبٌ لا فَصل. */
    hairlineAbove: 0.3,
    hairlineBelow: 0.45,
    /** سطرُ اسمِ الصنف. */
    itemNameLine: 0.85,
    /** سطرُ إضافةٍ أو ملاحظة. */
    itemSubLine: 0.7,
    /** بعد الصنف وقبل الذي يليه. */
    afterItem: 0.25,
    /** قبل صندوق رقم الطلب. */
    beforeOrderBox: 0.7,
    /** بعده. */
    afterOrderBox: 0.55,
    /** قبل التاريخ. */
    beforeDate: 0.25,
    /** حول الرقم الضريبيّ. */
    beforeZatca: 0.2,
    /** حول ملاحظة الطلب. */
    beforeOrderNote: 0.25,
    afterOrderNote: 0.1,
    /** بعد الإجمالي المؤطَّر. */
    afterTotalBox: 0.3,
    afterBoxedTotal: 0.35,
    /** بعد الشريط المقلوب. */
    afterInvert: 0.5,
    /** حول رمز الاستجابة. */
    beforeQr: 0.5,
    afterQr: 0.3,
    /** قبل الخاتمة. */
    beforeFooter: 0.4,
    /** تحت الشعار. */
    afterLogo: 0.45
  };
  var BORDER = {
    /** الفاصلُ الصلب بين الأقسام. */
    rule: 1,
    /** الشريطُ الأسود في القالب الفخم. */
    bar: 6,
    /**
     * حدُّ صندوق رقم الطلب.
     *
     * نقطتان لا واحدة: الرأسُ الحراريُّ يطبع الخطَّ المفردَ متفاوتاً --
     * يظهر هنا ويسقط هناك -- والنقطتان تخرجان نظيفتين.
     */
    box: 2,
    /** إطارُ الإجمالي. */
    totalBox: 1.5
  };
  var DASH = {
    /** الفاصلُ المنقّط في القالب الأنيق. */
    rule: { on: 2, off: 4 },
    /** الخيطُ الخفيف بين الأصناف. */
    hairline: { on: 2, off: 3 },
    /** النقاطُ الموصِلة بين الاسم وسعره. */
    leader: { size: 2, step: 6, clearance: 8 }
  };
  var COLUMNS = {
    qty: 0.09,
    price: 0.26
  };
  var ORDER_BOX = {
    /** حشوةٌ رأسيةٌ واحدة أعلى وأسفل -- بها يستوي الصندوق. */
    padY: 0.62,
    /** بين الملصق والرقم. */
    gapY: 0.3,
    /** كم يعلو الصندوقُ خطَّ الأساس الحاليّ. */
    liftY: 0.3,
    /** عرضُه من عرض المحتوى. */
    width: 0.66,
    /** نسبةُ خطّ الأساس من أعلى الحرف -- الكانفسُ يرسم من الوسط. */
    baseline: 0.8
  };
  var TOTAL_BOX = {
    inset: 0.6,
    liftY: 0.55,
    dropY: 0.2,
    strokeDropY: 0.15
  };
  var LOGO = {
    /** سقفُ ارتفاعه من عرض الورق: شعارٌ طويل كان يبتلع نصف الورقة. */
    maxHeight: 0.34,
    /**
     * أكبرُ بالنصف ممّا يقرّره القالب.
     *
     * والمُعامِلُ على ما يقرّره القالبُ لا بدلاً منه: «الفخم» يبقى أكبرَ
     * من «الكلاسيكيّ»، وتبقى النسبُ بينهما كما صُمّمت.
     */
    boost: 1.5,
    /**
     * بلا فراغٍ فوقه: هو أوّلُ ما يُرى، لا ما يُرى بعد فراغ.
     *
     * كان يبدأ بعد نصفِ سطرٍ من أعلى الورقة ثم يُرسم صغيراً، فيبدو فراغٌ
     * ثمّ شيءٌ صغير -- وأوّلُ ما تقع عليه العينُ من الفاتورة هو الفراغ.
     */
    topPad: 0.4
  };
  var INVERT_BAR = { height: 1.9, inset: 0.5 };
  var TRACKING = 0.18;
  var QR_MAX = 220;
  var THEMES = {
    // التقليديّ: أعمدةٌ وخطوطٌ صلبة، كما تُطبع الفواتيرُ منذ عُرفت الطابعات.
    classic: {
      density: 1,
      typeScale: 1,
      showLogo: true,
      logoWidth: 0.3,
      rule: "solid",
      orderStyle: "box",
      totalStyle: "bold",
      itemStyle: "columns",
      sectionLabels: false,
      headerBand: false,
      boxedTotal: false,
      qrMaxSize: 220
    },
    // المضغوط: أقصرُ ورقةٍ ممكنة. بلا شعارٍ ولا خطوطٍ ولا عناوين -- الفراغُ
    // وحدَه يفصل، والصنفُ وسعرُه على سطرٍ واحد تصلهما نقاط.
    compact: {
      density: 0.68,
      typeScale: 0.88,
      showLogo: false,
      logoWidth: 0.24,
      rule: "none",
      orderStyle: "plain",
      totalStyle: "plain",
      itemStyle: "leaders",
      sectionLabels: false,
      headerBand: false,
      boxedTotal: false,
      qrMaxSize: 170
    },
    // الأنيق: هادئٌ ومتّسع. خطوطٌ منقّطةٌ رفيعة، وعناوينُ أقسامٍ بحروفٍ
    // متباعدة، ونقاطٌ موصِلة -- مظهرُ المطاعم الراقية.
    elegant: {
      density: 1.15,
      typeScale: 1.04,
      showLogo: true,
      logoWidth: 0.34,
      rule: "dotted",
      orderStyle: "spaced",
      totalStyle: "box",
      itemStyle: "leaders",
      sectionLabels: true,
      headerBand: true,
      boxedTotal: true,
      qrMaxSize: 220
    },
    // الفخم: بيان. شعارٌ كبير، ورقمُ الطلب والإجماليُّ أبيضُ على أسود.
    // تُعرف الورقةُ من آخر الصالة.
    signature: {
      density: 1.12,
      typeScale: 1.02,
      showLogo: true,
      logoWidth: 0.52,
      rule: "bar",
      orderStyle: "invert",
      totalStyle: "invert",
      itemStyle: "columns",
      sectionLabels: true,
      headerBand: false,
      boxedTotal: true,
      qrMaxSize: 220
    }
  };
  function themeTokens(id) {
    return THEMES[id || ""] || THEMES.classic;
  }

  // shared/receipt/layout.ts
  function bi(ar, en) {
    return ar + " · " + en;
  }
  var ARABIC = /[؀-ۿ]/;
  function layoutReceipt(input) {
    const { receipt, measure, paperWidth: width, currency, logo, qr } = input;
    const th = themeTokens(input.theme);
    const ops = [];
    const contentWidth = width - PAD * 2;
    const gap = (n) => LINE * n * th.density;
    const sz = (n) => Math.round(n * th.typeScale);
    let logoW = 0;
    let logoH = 0;
    if (logo && th.showLogo) {
      const w0 = Math.round(width * th.logoWidth * LOGO.boost);
      const ratio = logo.height / logo.width;
      const capH = Math.round(width * LOGO.maxHeight * LOGO.boost);
      logoW = w0 * ratio > capH ? Math.round(capH / ratio) : w0;
      logoH = Math.round(logoW * ratio);
    }
    let y = logoW > 0 ? PAD * LOGO.topPad : PAD + LINE / 2;
    const text = (t, x, size, weight, family, align, dir, opts) => {
      var _a;
      ops.push(__spreadValues({
        op: "text",
        x,
        y: (_a = opts == null ? void 0 : opts.at) != null ? _a : y,
        text: String(t),
        size,
        weight,
        family,
        align,
        dir,
        color: (opts == null ? void 0 : opts.color) || "ink"
      }, (opts == null ? void 0 : opts.letterSpacing) ? { letterSpacing: opts.letterSpacing } : {}));
    };
    const rect = (x, ry, w, h, color = "ink") => {
      ops.push({ op: "rect", x, y: ry, w, h, color });
    };
    const wrap = (t, size, weight, family, maxW) => {
      const words = String(t).split(" ");
      const lines = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (measure(test, size, weight, family) > maxW && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const centerText = (t, size, bold) => {
      text(t, width / 2, size, bold ? WEIGHT.bold : WEIGHT.regular, "sans", "center", "rtl");
      y += gap(size > 22 ? SPACE.rowLarge : SPACE.row);
    };
    const rowText = (leftMono, rightArabic, size, bold) => {
      text(rightArabic, width - PAD, size, bold ? WEIGHT.bold : WEIGHT.regular, "sans", "right", "rtl");
      if (leftMono) text(leftMono, PAD, size, WEIGHT.mono, "mono", "left", "ltr");
      y += gap(SPACE.row);
    };
    const divider = () => {
      const mode = th.rule;
      if (mode === "none") {
        y += gap(SPACE.ruleless);
        return;
      }
      if (mode === "bar") {
        rect(PAD, y - BORDER.bar / 2, contentWidth, BORDER.bar);
        y += gap(SPACE.afterBar);
        return;
      }
      if (mode === "dotted") {
        ops.push({
          op: "dash",
          y: Math.round(y) + 0.5,
          x1: PAD,
          x2: width - PAD,
          on: DASH.rule.on,
          off: DASH.rule.off,
          thickness: BORDER.rule
        });
        y += gap(SPACE.afterRule);
        return;
      }
      rect(PAD, y, contentWidth, BORDER.rule);
      y += gap(SPACE.afterRule);
    };
    const hairline = () => {
      y += gap(SPACE.hairlineAbove);
      ops.push({
        op: "dash",
        y: Math.round(y) + 0.5,
        x1: PAD,
        x2: width - PAD,
        on: DASH.hairline.on,
        off: DASH.hairline.off,
        thickness: BORDER.rule
      });
      y += gap(SPACE.hairlineBelow);
    };
    const invertBar = (t, size) => {
      const h = Math.round(size * INVERT_BAR.height);
      rect(PAD * INVERT_BAR.inset, y - h / 2, width - PAD, h);
      text(t, width / 2, size, WEIGHT.bold, "sans", "center", "rtl", { color: "paper" });
      y += h / 2 + gap(SPACE.afterInvert);
    };
    const spacedText = (t, size, bold) => {
      const ls = ARABIC.test(t) ? 0 : Math.round(size * TRACKING);
      text(t, width / 2, size, bold ? WEIGHT.bold : WEIGHT.regular, "sans", "center", "rtl", { letterSpacing: ls });
      y += gap(size > 22 ? SPACE.rowLarge : SPACE.row);
    };
    const leaderRow = (name, price, size, bold) => {
      var _a;
      const weight = bold ? WEIGHT.bold : WEIGHT.regular;
      const priceW2 = measure(price, size, WEIGHT.regular, "mono");
      const room = contentWidth - priceW2 - DASH.leader.clearance * 2;
      const lines = wrap(name, size, weight, "sans", room);
      lines.slice(0, -1).forEach((line) => {
        text(line, width - PAD, size, weight, "sans", "right", "rtl");
        y += gap(SPACE.row);
      });
      const last = (_a = lines[lines.length - 1]) != null ? _a : name;
      text(last, width - PAD, size, weight, "sans", "right", "rtl");
      text(price, PAD, size, WEIGHT.regular, "mono", "left", "ltr");
      const nameW2 = measure(last, size, weight, "sans");
      const from = PAD + priceW2 + DASH.leader.clearance;
      const to = width - PAD - nameW2 - DASH.leader.clearance;
      for (let x = from; x < to; x += DASH.leader.step) {
        rect(x, y - DASH.leader.size / 2, DASH.leader.size, DASH.leader.size);
      }
      y += gap(SPACE.row);
    };
    const money = (n) => n.toFixed(2) + " " + currency;
    if (logoW > 0) {
      ops.push({ op: "image", ref: "logo", x: (width - logoW) / 2, y, w: logoW, h: logoH });
      y += logoH + LINE * SPACE.afterLogo;
    }
    if (th.headerBand) divider();
    const nameShown = receipt.showBusinessName !== false || logoW <= 0;
    if (nameShown) centerText(receipt.businessName || "ركين", sz(TYPE.businessName), true);
    if (th.headerBand) divider();
    if (receipt.tagline) centerText(receipt.tagline, sz(TYPE.tagline), false);
    const whereLine = [receipt.branchLabel, receipt.locationLine].filter(Boolean).join(" — ");
    if (whereLine) centerText(whereLine, sz(TYPE.where), false);
    else if (receipt.branchName) centerText(receipt.branchName, sz(TYPE.branchOnly), false);
    if (receipt.vatNumber) {
      y += gap(SPACE.beforeZatca);
      centerText(bi("فاتورة ضريبية مبسطة", "Simplified Tax Invoice"), sz(TYPE.zatcaHeading), true);
      centerText(bi("الرقم الضريبي", "VAT No") + ": " + receipt.vatNumber, sz(TYPE.zatcaVatNo), false);
    }
    y += gap(SPACE.beforeOrderBox);
    if (th.orderStyle === "invert") {
      invertBar(bi("رقم الطلب", "Order No") + "   " + receipt.orderNumber, sz(TYPE.orderInvert));
    } else if (th.orderStyle === "plain") {
      centerText(bi("رقم الطلب", "Order") + ": " + receipt.orderNumber, sz(TYPE.orderPlain), true);
    } else if (th.orderStyle === "spaced") {
      spacedText(bi("رقم الطلب", "Order No"), sz(TYPE.orderSpacedLabel), false);
      y -= gap(ORDER_BOX.liftY / 2);
      spacedText(receipt.orderNumber, sz(TYPE.orderSpacedNumber), true);
    } else {
      const labelSz = sz(TYPE.orderLabel);
      const numSz = sz(TYPE.orderNumber);
      const padIn = Math.round(LINE * ORDER_BOX.padY);
      const gapIn = Math.round(LINE * ORDER_BOX.gapY);
      const boxH = padIn + labelSz + gapIn + numSz + padIn;
      const boxW = Math.round(contentWidth * ORDER_BOX.width);
      const boxX = Math.round((width - boxW) / 2);
      const boxTop = y - LINE * ORDER_BOX.liftY;
      const bw = BORDER.box;
      rect(boxX, boxTop, boxW, bw);
      rect(boxX, boxTop + boxH - bw, boxW, bw);
      rect(boxX, boxTop, bw, boxH);
      rect(boxX + boxW - bw, boxTop, bw, boxH);
      text(
        bi("رقم الطلب", "Order No"),
        width / 2,
        labelSz,
        WEIGHT.bold,
        "sans",
        "center",
        "rtl",
        { at: boxTop + padIn + labelSz * ORDER_BOX.baseline }
      );
      text(
        receipt.orderNumber,
        width / 2,
        numSz,
        WEIGHT.bold,
        "sans",
        "center",
        "ltr",
        { at: boxTop + padIn + labelSz + gapIn + numSz * ORDER_BOX.baseline }
      );
      y = boxTop + boxH;
    }
    y += gap(SPACE.afterOrderBox);
    centerText(receipt.dateLabel, sz(TYPE.date), false);
    y += gap(SPACE.beforeDate);
    divider();
    if (th.sectionLabels) spacedText(bi("الطلب", "ORDER"), sz(TYPE.sectionLabel), true);
    const metaSz = sz(TYPE.meta);
    if (receipt.cashierName) rowText("", bi("تمت بواسطة", "Served by") + ": " + receipt.cashierName, metaSz, false);
    if (receipt.metaLabel) rowText("", bi("نوع الطلب", "Type") + ": " + receipt.metaLabel, metaSz, false);
    if (receipt.refundOfOrder) rowText("", bi("استرجاع من الطلب", "Refund of") + ": " + receipt.refundOfOrder, metaSz, true);
    if (receipt.customerName) rowText("", bi("العميل", "Customer") + ": " + receipt.customerName, metaSz, false);
    if (receipt.customerPhone) rowText("", bi("الجوال", "Phone") + ": " + receipt.customerPhone, metaSz, false);
    divider();
    const qtyW = Math.round(width * COLUMNS.qty);
    const priceW = Math.round(width * COLUMNS.price);
    const nameW = contentWidth - qtyW - priceW;
    const nameRight = width - PAD - qtyW;
    receipt.items.forEach((it, idx) => {
      const mods = it.mods || [];
      const isLast = idx === receipt.items.length - 1;
      if (th.itemStyle === "leaders") {
        const shown = it.qty + "x " + (it.nameEn ? it.name + " | " + it.nameEn : it.name);
        leaderRow(shown, money(it.lineTotal), sz(TYPE.itemLeader), true);
        const subSz2 = sz(TYPE.itemSub);
        mods.forEach((m) => {
          wrap("— " + m, subSz2, WEIGHT.regular, "sans", contentWidth).forEach((line) => rowText("", line, subSz2, false));
        });
        if (it.note) {
          wrap("ملاحظات: " + it.note, subSz2, WEIGHT.regular, "sans", contentWidth).forEach((line) => rowText("", line, subSz2, false));
        }
        if (!isLast) hairline();
        return;
      }
      const nameSz = sz(TYPE.itemName);
      const nameOnly = it.nameEn ? it.name + " | " + it.nameEn : it.name;
      const firstY = y;
      wrap(nameOnly, nameSz, WEIGHT.medium, "sans", nameW).forEach((line) => {
        text(line, nameRight, nameSz, WEIGHT.medium, "sans", "right", "rtl");
        y += gap(SPACE.itemNameLine);
      });
      const numSz = sz(TYPE.itemNumeric);
      text(String(it.qty), width - PAD, numSz, WEIGHT.medium, "sans", "right", "ltr", { at: firstY });
      text(money(it.lineTotal), PAD, numSz, WEIGHT.medium, "sans", "left", "ltr", { at: firstY });
      const subSz = sz(TYPE.itemSub);
      mods.forEach((m) => {
        wrap("— " + m, subSz, WEIGHT.regular, "sans", nameW).forEach((line) => {
          text(line, nameRight, subSz, WEIGHT.regular, "sans", "right", "rtl");
          y += gap(SPACE.itemSubLine);
        });
      });
      if (it.note) {
        wrap("ملاحظات: " + it.note, subSz, WEIGHT.regular, "sans", nameW).forEach((line) => {
          text(line, nameRight, subSz, WEIGHT.regular, "sans", "right", "rtl");
          y += gap(SPACE.itemSubLine);
        });
      }
      if (it.qty > 1) {
        text(
          it.qty + " × " + money(it.unitPrice),
          nameRight,
          sz(TYPE.itemUnitPrice),
          WEIGHT.regular,
          "sans",
          "right",
          "rtl"
        );
        y += gap(SPACE.itemSubLine);
      }
      y += gap(SPACE.afterItem);
      if ((mods.length > 0 || it.note) && !isLast) hairline();
    });
    if (receipt.orderNote) {
      y += gap(SPACE.beforeOrderNote);
      const noteSz = sz(TYPE.orderNote);
      wrap("ملاحظات الطلب: " + receipt.orderNote, noteSz, WEIGHT.regular, "sans", contentWidth).forEach((line) => rowText("", line, noteSz, false));
      y += gap(SPACE.afterOrderNote);
    }
    divider();
    if (th.sectionLabels) spacedText(bi("الحساب", "PAYMENT"), sz(TYPE.sectionLabel), true);
    const rowSz = sz(TYPE.totalRow);
    rowText(money(receipt.subtotal), bi("المجموع الفرعي", "Subtotal"), rowSz, false);
    if (receipt.discount > 0) rowText("-" + money(receipt.discount), bi("الخصم", "Discount"), rowSz, false);
    rowText(money(receipt.vat), bi("ضريبة القيمة المضافة", "VAT"), rowSz, false);
    const totalTop = y - LINE * TOTAL_BOX.liftY;
    if (th.totalStyle === "invert") {
      invertBar(bi("الإجمالي", "Total") + "   " + money(receipt.total), sz(TYPE.grandTotalInvert));
    } else if (th.totalStyle === "box") {
      const tTop = y - LINE * TOTAL_BOX.liftY;
      rowText(money(receipt.total), bi("الإجمالي", "Total"), sz(TYPE.grandTotalBox), true);
      const tH = y - LINE * TOTAL_BOX.dropY - tTop;
      const bx = PAD * TOTAL_BOX.inset;
      const bw2 = width - PAD * TOTAL_BOX.inset * 2;
      const t = BORDER.totalBox;
      rect(bx, tTop, bw2, t);
      rect(bx, tTop + tH - t, bw2, t);
      rect(bx, tTop, t, tH);
      rect(width - bx - t, tTop, t, tH);
      y += gap(SPACE.afterTotalBox);
    } else {
      rowText(
        money(receipt.total),
        bi("الإجمالي", "Total"),
        sz(th.totalStyle === "plain" ? TYPE.grandTotalPlain : TYPE.grandTotalBold),
        true
      );
    }
    if (th.boxedTotal) {
      const bx = PAD * TOTAL_BOX.inset;
      const bw2 = width - PAD * TOTAL_BOX.inset * 2;
      const bh = y - totalTop - LINE * TOTAL_BOX.strokeDropY;
      const t = BORDER.totalBox;
      rect(bx, totalTop, bw2, t);
      rect(bx, totalTop + bh - t, bw2, t);
      rect(bx, totalTop, t, bh);
      rect(bx + bw2 - t, totalTop, t, bh);
      y += gap(SPACE.afterBoxedTotal);
    }
    divider();
    const paySz = sz(TYPE.payment);
    rowText("", receipt.paymentMethodLabel, paySz, false);
    if (receipt.change > 0) rowText(receipt.change.toFixed(2), "الباقي", paySz, false);
    if (qr) {
      const qrSize = Math.min(QR_MAX, th.qrMaxSize, contentWidth);
      y += LINE * SPACE.beforeQr;
      ops.push({ op: "image", ref: "qr", x: (width - qrSize) / 2, y, w: qrSize, h: qrSize });
      y += qrSize + LINE * SPACE.afterQr;
    }
    y += LINE * SPACE.beforeFooter;
    const footSz = sz(TYPE.footer);
    (receipt.customMessage || "شكراً لزيارتكم").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((part) => {
      wrap(part, footSz, WEIGHT.regular, "sans", contentWidth).forEach((line) => centerText(line, footSz, false));
    });
    y += PAD;
    return { width, height: Math.ceil(y), ops };
  }

  // shared/receipt/stubMeasure.ts
  var NARROW = /[ ,.:|]/;
  var WIDE = /[؀-ۿ]/;
  function stubMeasure(text, size, weight, family) {
    if (family === "mono") return text.length * size * 0.6;
    let w = 0;
    for (const ch of text) {
      if (NARROW.test(ch)) w += size * 0.28;
      else if (WIDE.test(ch)) w += size * 0.52;
      else w += size * 0.46;
    }
    return weight >= 800 ? w * 1.04 : w;
  }
  return __toCommonJS(index_exports);
})();
