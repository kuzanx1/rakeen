/* مولَّد -- لا يُحرَّر. المصدر: shared/receipt/
   يُعاد بناؤه بـ: npm run receipt:build */
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

  // receipt-engine-entry.js
  var receipt_engine_entry_exports = {};
  __export(receipt_engine_entry_exports, {
    BORDER: () => BORDER,
    COLUMNS: () => COLUMNS,
    CSS_DPI: () => CSS_DPI,
    DASH: () => DASH,
    DEFAULT_PAPER_WIDTH: () => DEFAULT_PAPER_WIDTH,
    HEART: () => HEART,
    INVERT_BAR: () => INVERT_BAR,
    KITCHEN: () => KITCHEN,
    KITCHEN_SPACE: () => KITCHEN_SPACE,
    LARGE_TYPE_ABOVE: () => LARGE_TYPE_ABOVE,
    LINE: () => LINE,
    LOGO: () => LOGO,
    ORDER_BOX: () => ORDER_BOX,
    PAD: () => PAD,
    PAGER: () => PAGER,
    PAPER: () => PAPER,
    PRINTER_DPI: () => PRINTER_DPI,
    QR_MAX: () => QR_MAX,
    SHIFT: () => SHIFT,
    SHIFT_SPACE: () => SHIFT_SPACE,
    SPACE: () => SPACE,
    THEMES: () => THEMES,
    TOTAL_BOX: () => TOTAL_BOX,
    TRACKING: () => TRACKING,
    TYPE: () => TYPE,
    WEIGHT: () => WEIGHT,
    bi: () => bi,
    createContext: () => createContext,
    dotsFromCss: () => dotsFromCss,
    dotsFromMm: () => dotsFromMm,
    layoutKitchenTicket: () => layoutKitchenTicket,
    layoutReceipt: () => layoutReceipt,
    layoutShiftReport: () => layoutShiftReport,
    leaderDots: () => leaderDots,
    qrGrid: () => qrGrid,
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
  var LARGE_TYPE_ABOVE = 22;
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
  var PAGER = {
    qr: 200,
    /** عرضُ الإطار الأبيض حول الباركود. */
    quiet: 12,
    /** الحشوةُ داخل الإطار. */
    padY: 14,
    /**
     * سُمك إطار البلوك. كان شريطاً أسودَ مصمتاً: الفاتورة صارت تطبع أبطأ
     * بوضوح (2026-11-08) -- النقاط السوداء تسعة أضعاف، وأكثف شريطٍ فيها
     * 91–96% أسود، والطابعة الحرارية تُبطئ رأسها على الكثافة. فصار إطاراً.
     */
    frame: 3,
    padX: 18,
    /** المسافةُ بين الباركود والكلام في الصفّ العريض. */
    gapX: 18,
    /** أضيقُ عمودِ كلامٍ يُقبل بجانب الباركود؛ دونه يُرصّ عمودياً. */
    minTextW: 220,
    title: 26,
    line: 17,
    tag: 19,
    wifi: 15,
    /** سُمك إطار «طلب ١٢٧». */
    tagBorder: 2,
    before: 0.6,
    after: 0.5
  };
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
  var KITCHEN = {
    /** وحدةُ الإيقاع -- أوسعُ من الفاتورة، فالسطرُ يُقرأ من بعيد. */
    line: 36,
    /** «KITCHEN RECEIPT» -- يصغر حين يعلوه شعار. */
    titleWithLogo: 24,
    titleAlone: 32,
    branch: 18,
    date: 16,
    /** نوعُ الطلب: محلي، سفري، توصيل. */
    meta: 20,
    /** الرقمُ الذي يُنادى به -- جهازُ النداء إن وُجد، وإلّا رقمُ الطلب.
     *  ولا يجتمعان: رقمان كبيران متجاوران يجعلان القارئَ يتردّد أيَّهما
     *  ينادي، وهو واقفٌ في زحام. */
    callLabel: 16,
    pagerNumber: 44,
    orderNumber: 40,
    /** الصنفُ وكميتُه -- أكبرُ نصٍّ يُقرأ في العمل. */
    item: 26,
    /** الإضافاتُ والملاحظات. */
    sub: 18,
    /** «طبعها» في الأسفل. */
    by: 16,
    /** «بالعافية عليكم». */
    blessing: 22,
    logoWidth: 0.34,
    /** إزاحةُ الإضافات عن حافّة الاسم -- تُظهرها تابعةً له. */
    subIndent: 14,
    heartSize: 0.72,
    heartGap: 0.42
  };
  var KITCHEN_SPACE = {
    afterLogo: 0.35,
    beforeCall: 0.2,
    afterRule: 0.6,
    itemLine: 0.9,
    subLine: 0.7,
    afterItem: 0.3,
    beforeBy: 0.15,
    beforeBlessing: 0.35,
    afterBlessing: 0.9
  };
  var SHIFT = {
    line: 32,
    businessName: 30,
    branch: 19,
    title: 20,
    titleEn: 15,
    date: 16,
    /** الكاشيرُ ووقتُ البدء. */
    meta: 17,
    metaSmall: 16,
    /** عناوينُ الأقسام: المبيعات، طرق الدفع، الصندوق. */
    sectionLabel: 16,
    row: 18,
    /** صافي المبيعات -- خلاصةُ قسم المبيعات. */
    net: 20,
    /** الفرق -- السطرُ الوحيد الذي يُفتح عليه تحقيق، فله إطارُه. */
    variance: 22,
    counts: 17,
    signature: 15
  };
  var SHIFT_SPACE = {
    afterRule: 0.6,
    beforeTitle: 0.2,
    afterVariance: 0.35,
    aroundSignature: 0.5
  };
  var HEART = {
    /** ارتفاعُه من عرضه. */
    aspect: 0.9,
    /** أخفضُ نقطةٍ فيه -- طرفُه الأسفل. */
    bottom: 0.42,
    /** الانخفاضُ بين الفصّين. */
    dip: 0.18,
    /** مقبضا المنحنى الخارجيّ. */
    c1x: 0.62,
    c1y: 0.05,
    /** مقبضا المنحنى الداخليّ. */
    c2x: 0.3,
    c2y: 0.62
  };

  // shared/receipt/context.ts
  var ARABIC = /[؀-ۿ]/;
  function createContext(opts) {
    var _a;
    const ops = [];
    const { width, line, measure } = opts;
    const density = (_a = opts.density) != null ? _a : 1;
    const ctx = {
      ops,
      width,
      contentWidth: width - PAD * 2,
      y: PAD + line / 2,
      line,
      gap: (n) => line * n * density,
      text(t, x, size, weight, family, align, dir, o) {
        var _a2;
        ops.push(__spreadValues({
          op: "text",
          x,
          y: (_a2 = o == null ? void 0 : o.at) != null ? _a2 : ctx.y,
          text: String(t),
          size,
          weight,
          family,
          align,
          dir,
          color: (o == null ? void 0 : o.color) || "ink"
        }, (o == null ? void 0 : o.letterSpacing) ? { letterSpacing: o.letterSpacing } : {}));
      },
      rect(x, y, w, h, color = "ink") {
        ops.push({ op: "rect", x, y, w, h, color });
      },
      measure,
      /**
       * اللفُّ داخل عرضٍ معيَّن.
       *
       * وmaxW ليس عرضَ الورقة دائماً: اسمُ الصنف يلتفّ في عموده هو، وإلّا
       * زحف على الكمية والسعر وقُرئ متداخلاً.
       */
      wrap(t, size, weight, family, maxW) {
        const breakLong = (word) => {
          if (measure(word, size, weight, family) <= maxW) return [word];
          const out = [];
          let piece = "";
          for (const ch of word) {
            if (piece && measure(piece + ch, size, weight, family) > maxW) {
              out.push(piece);
              piece = ch;
            } else {
              piece += ch;
            }
          }
          if (piece) out.push(piece);
          return out;
        };
        const words = [];
        for (const w of String(t).split(" ")) words.push(...breakLong(w));
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
        return lines.length > 0 ? lines : [""];
      },
      centerText(t, size, bold, step) {
        ctx.text(t, width / 2, size, bold ? WEIGHT.bold : WEIGHT.regular, "sans", "center", "rtl");
        ctx.y += ctx.gap(step != null ? step : size > 22 ? 1.3 : 1);
      },
      /** عربيٌّ يميناً ورقمٌ يساراً -- وهو ترتيبُ كلّ سطور الحساب. */
      rowText(leftMono, rightArabic, size, bold, step) {
        ctx.text(rightArabic, width - PAD, size, bold ? WEIGHT.bold : WEIGHT.regular, "sans", "right", "rtl");
        if (leftMono) ctx.text(leftMono, PAD, size, WEIGHT.mono, "mono", "left", "ltr");
        ctx.y += ctx.gap(step != null ? step : 1);
      },
      rule(after) {
        ctx.rect(PAD, ctx.y, ctx.contentWidth, BORDER.rule);
        ctx.y += ctx.gap(after);
      },
      /**
       * خطٌّ متقطّع.
       *
       * ولا رماديَّ بديلاً عنه: اللوحةُ تُحوَّل إلى لونين قبل الطابعة
       * (إضاءةٌ دون ١٦٠)، فخطٌّ رماديٌّ رفيع يُنعَّم إلى ١٩٥ فيظهر في
       * المعاينة ولا يُطبع أصلاً.
       */
      dash(y, on, off, thickness = BORDER.rule) {
        ops.push({ op: "dash", y, x1: PAD, x2: width - PAD, on, off, thickness });
      },
      /** شريطٌ أسودُ بكتابةٍ بيضاء: أقوى تمييزٍ تقدر عليه طابعةٌ بلونٍ واحد. */
      invertBar(t, size, after) {
        const h = Math.round(size * INVERT_BAR.height);
        ctx.rect(PAD * INVERT_BAR.inset, ctx.y - h / 2, width - PAD, h);
        ctx.text(t, width / 2, size, WEIGHT.bold, "sans", "center", "rtl", { color: "paper" });
        ctx.y += h / 2 + ctx.gap(after);
      },
      /** حروفٌ متباعدةٌ وسطية -- ولا تُباعد العربيةُ فحروفُها متّصلة. */
      spacedText(t, size, bold, step) {
        const ls = ARABIC.test(t) ? 0 : Math.round(size * TRACKING);
        ctx.text(t, width / 2, size, bold ? WEIGHT.bold : WEIGHT.regular, "sans", "center", "rtl", { letterSpacing: ls });
        ctx.y += ctx.gap(step != null ? step : size > 22 ? 1.3 : 1);
      },
      /**
       * إطارٌ من أربعة أشرطةٍ ممتلئة لا خطٌّ مرسوم.
       *
       * الرأسُ الحراريُّ يطبع الخطَّ الرفيع متفاوتاً -- يظهر هنا ويسقط
       * هناك -- والشريطُ الممتلئ يخرج نظيفاً.
       */
      box(x, y, w, h, thickness) {
        ctx.rect(x, y, w, thickness);
        ctx.rect(x, y + h - thickness, w, thickness);
        ctx.rect(x, y, thickness, h);
        ctx.rect(x + w - thickness, y, thickness, h);
      },
      heart(cx, cy, size) {
        ops.push({ op: "glyph", shape: "heart", cx, cy, size });
      }
    };
    return ctx;
  }
  function leaderDots(ctx, from, to) {
    for (let x = from; x < to; x += DASH.leader.step) {
      ctx.rect(x, ctx.y - DASH.leader.size / 2, DASH.leader.size, DASH.leader.size);
    }
  }

  // shared/receipt/layout.ts
  function bi(ar, en) {
    return ar + " · " + en;
  }
  function modText(m) {
    if (typeof m === "string") return m;
    return m.textEn ? m.text + " | " + m.textEn : m.text;
  }
  function layoutReceipt(input) {
    const { receipt, measure, paperWidth: width, currency, logo, qr } = input;
    const th = themeTokens(input.theme);
    const ctx = createContext({ width, line: LINE, measure, density: th.density });
    const { ops, contentWidth, gap, text, rect, wrap, centerText, rowText, spacedText } = ctx;
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
    if (logoW > 0) ctx.y = PAD * LOGO.topPad;
    const divider = () => {
      const mode = th.rule;
      if (mode === "none") {
        ctx.y += gap(SPACE.ruleless);
        return;
      }
      if (mode === "bar") {
        rect(PAD, ctx.y - BORDER.bar / 2, contentWidth, BORDER.bar);
        ctx.y += gap(SPACE.afterBar);
        return;
      }
      if (mode === "dotted") {
        ctx.dash(Math.round(ctx.y) + 0.5, DASH.rule.on, DASH.rule.off);
        ctx.y += gap(SPACE.afterRule);
        return;
      }
      ctx.rule(SPACE.afterRule);
    };
    const hairline = () => {
      ctx.y += gap(SPACE.hairlineAbove);
      ctx.dash(Math.round(ctx.y) + 0.5, DASH.hairline.on, DASH.hairline.off);
      ctx.y += gap(SPACE.hairlineBelow);
    };
    const invertBar = (t, size) => ctx.invertBar(t, size, SPACE.afterInvert);
    const leaderRow = (name, price, size, bold) => {
      const weight = bold ? WEIGHT.bold : WEIGHT.regular;
      const priceW2 = measure(price, size, WEIGHT.regular, "mono");
      const room = contentWidth - priceW2 - DASH.leader.clearance * 2;
      const lines = wrap(name, size, weight, "sans", room);
      lines.slice(0, -1).forEach((line) => {
        text(line, width - PAD, size, weight, "sans", "right", "rtl");
        ctx.y += gap(SPACE.row);
      });
      const last = lines[lines.length - 1];
      text(last, width - PAD, size, weight, "sans", "right", "rtl");
      text(price, PAD, size, WEIGHT.regular, "mono", "left", "ltr");
      const nameW2 = measure(last, size, weight, "sans");
      leaderDots(ctx, PAD + priceW2 + DASH.leader.clearance, width - PAD - nameW2 - DASH.leader.clearance);
      ctx.y += gap(SPACE.row);
    };
    const money = (n) => n.toFixed(2) + " " + currency;
    const pagerBlock = (pg) => {
      const barX = PAD * INVERT_BAR.inset;
      const barW = width - PAD;
      const qrOuter = PAGER.qr + PAGER.quiet * 2;
      const titleSz = PAGER.title;
      const lineSz = PAGER.line;
      const tagSz = PAGER.tag;
      const titleLH = Math.round(titleSz * 1.3);
      const lineLH = Math.round(lineSz * 1.5);
      const tagPadX = 12;
      const tagPadY = 7;
      const tagH = tagSz + tagPadY * 2;
      const wide = barW - PAGER.padX * 2 - qrOuter - PAGER.gapX >= PAGER.minTextW;
      const textW = wide ? barW - PAGER.padX * 2 - qrOuter - PAGER.gapX : barW - PAGER.padX * 2;
      const titleLines = wrap(pg.title, titleSz, WEIGHT.bold, "sans", textW);
      const lineLines = pg.line ? wrap(pg.line, lineSz, WEIGHT.regular, "sans", textW) : [];
      const tagTextW = measure(pg.tag, tagSz, WEIGHT.bold, "sans");
      const tagW = Math.min(textW, Math.round(tagTextW + tagPadX * 2));
      const frameAt = (x, y, w, h) => {
        const t = PAGER.frame;
        rect(x, y, w, t, "ink");
        rect(x, y + h - t, w, t, "ink");
        rect(x, y, t, h, "ink");
        rect(x + w - t, y, t, h, "ink");
      };
      const qrAt = (x, y) => {
        const n = Math.max(1, pg.qr.size);
        const unit = Math.max(1, Math.floor(PAGER.qr / n));
        const side = unit * n;
        const ox = x + PAGER.quiet + Math.floor((PAGER.qr - side) / 2);
        const oy = y + PAGER.quiet + Math.floor((PAGER.qr - side) / 2);
        for (let r = 0; r < n; r++) {
          let c = 0;
          while (c < n) {
            if (!pg.qr.dark(r, c)) {
              c++;
              continue;
            }
            const start = c;
            while (c < n && pg.qr.dark(r, c)) c++;
            rect(ox + start * unit, oy + r * unit, (c - start) * unit, unit, "ink");
          }
        }
      };
      const tagAt = (rightX, top2, align) => {
        const x = align === "right" ? rightX - tagW : Math.round((width - tagW) / 2);
        const t = PAGER.tagBorder;
        rect(x, top2, tagW, t, "ink");
        rect(x, top2 + tagH - t, tagW, t, "ink");
        rect(x, top2, t, tagH, "ink");
        rect(x + tagW - t, top2, t, tagH, "ink");
        text(
          pg.tag,
          x + tagW / 2,
          tagSz,
          WEIGHT.bold,
          "sans",
          "center",
          "rtl",
          { at: top2 + tagH / 2 }
        );
      };
      const textH = titleLines.length * titleLH + (lineLines.length ? 6 + lineLines.length * lineLH : 0) + 12 + tagH;
      ctx.y += gap(PAGER.before);
      const top = Math.round(ctx.y);
      if (wide) {
        const innerH = Math.max(qrOuter, textH);
        const barH = innerH + PAGER.padY * 2;
        frameAt(barX, top, barW, barH);
        const qrX = barX + barW - PAGER.padX - qrOuter;
        qrAt(qrX, top + PAGER.padY + Math.round((innerH - qrOuter) / 2));
        const right = qrX - PAGER.gapX;
        let y = top + PAGER.padY + Math.round((innerH - textH) / 2);
        titleLines.forEach((l) => {
          text(l, right, titleSz, WEIGHT.bold, "sans", "right", "rtl", { at: y + titleLH / 2 });
          y += titleLH;
        });
        if (lineLines.length) {
          y += 6;
          lineLines.forEach((l) => {
            text(l, right, lineSz, WEIGHT.regular, "sans", "right", "rtl", { at: y + lineLH / 2 });
            y += lineLH;
          });
        }
        tagAt(right, y + 12, "right");
        ctx.y = top + barH;
      } else {
        const barH = PAGER.padY * 2 + titleLines.length * titleLH + 10 + qrOuter + 10 + (lineLines.length ? lineLines.length * lineLH + 6 : 0) + 8 + tagH;
        frameAt(barX, top, barW, barH);
        let y = top + PAGER.padY;
        titleLines.forEach((l) => {
          text(l, width / 2, titleSz, WEIGHT.bold, "sans", "center", "rtl", { at: y + titleLH / 2 });
          y += titleLH;
        });
        y += 10;
        qrAt(Math.round((width - qrOuter) / 2), y);
        y += qrOuter + 10;
        lineLines.forEach((l) => {
          text(l, width / 2, lineSz, WEIGHT.regular, "sans", "center", "rtl", { at: y + lineLH / 2 });
          y += lineLH;
        });
        if (lineLines.length) y += 6;
        tagAt(0, y + 8, "center");
        ctx.y = top + barH;
      }
      ctx.y += gap(PAGER.after);
      if (pg.wifi) {
        ctx.y += gap(0.3);
        wrap("ما عندك نت؟ واي فاي الضيوف: " + pg.wifi, sz(PAGER.wifi), WEIGHT.regular, "sans", contentWidth).forEach((l) => centerText(l, sz(PAGER.wifi), false));
      }
    };
    if (logoW > 0) {
      ops.push({ op: "image", ref: "logo", x: (width - logoW) / 2, y: ctx.y, w: logoW, h: logoH });
      ctx.y += logoH + LINE * SPACE.afterLogo;
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
      ctx.y += gap(SPACE.beforeZatca);
      centerText(bi("فاتورة ضريبية مبسطة", "Simplified Tax Invoice"), sz(TYPE.zatcaHeading), true);
      centerText(bi("الرقم الضريبي", "VAT No") + ": " + receipt.vatNumber, sz(TYPE.zatcaVatNo), false);
    }
    ctx.y += gap(SPACE.beforeOrderBox);
    if (th.orderStyle === "invert") {
      invertBar(bi("رقم الطلب", "Order No") + "   " + receipt.orderNumber, sz(TYPE.orderInvert));
    } else if (th.orderStyle === "plain") {
      centerText(bi("رقم الطلب", "Order") + ": " + receipt.orderNumber, sz(TYPE.orderPlain), true);
    } else if (th.orderStyle === "spaced") {
      spacedText(bi("رقم الطلب", "Order No"), sz(TYPE.orderSpacedLabel), false);
      ctx.y -= gap(ORDER_BOX.liftY / 2);
      spacedText(receipt.orderNumber, sz(TYPE.orderSpacedNumber), true);
    } else {
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
      ctx.y = boxTop + boxH;
    }
    ctx.y += gap(SPACE.afterOrderBox);
    centerText(receipt.dateLabel, sz(TYPE.date), false);
    ctx.y += gap(SPACE.beforeDate);
    divider();
    if (receipt.platformName || receipt.platformInvoiceLast4) {
      if (receipt.platformName) {
        ctx.y += gap(SPACE.afterInvert);
        invertBar(receipt.platformName, sz(TYPE.orderInvert));
      }
      if (receipt.platformInvoiceLast4) {
        centerText(bi("آخر ٤ أرقام فاتورة التطبيق", "App invoice"), sz(TYPE.meta), true);
        spacedText(receipt.platformInvoiceLast4, sz(TYPE.orderSpacedNumber), true);
      }
      divider();
    }
    if (th.sectionLabels) spacedText(bi("الطلب", "ORDER"), sz(TYPE.sectionLabel), true);
    const metaSz = sz(TYPE.meta);
    if (receipt.cashierName) rowText("", bi("تمت بواسطة", "Served by") + ": " + receipt.cashierName, metaSz, false);
    if (receipt.metaLabel) rowText("", bi("نوع الطلب", "Type") + ": " + receipt.metaLabel, metaSz, false);
    if (receipt.pickupAt) rowText("", bi("وقت الاستلام", "Pickup at") + ": " + receipt.pickupAt, metaSz, true);
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
          wrap("— " + modText(m), subSz2, WEIGHT.regular, "sans", contentWidth).forEach((line) => rowText("", line, subSz2, false));
        });
        if (it.note) {
          wrap("ملاحظات: " + it.note, subSz2, WEIGHT.regular, "sans", contentWidth).forEach((line) => rowText("", line, subSz2, false));
        }
        if (!isLast) hairline();
        return;
      }
      const nameSz = sz(TYPE.itemName);
      const nameOnly = it.nameEn ? it.name + " | " + it.nameEn : it.name;
      const firstY = ctx.y;
      wrap(nameOnly, nameSz, WEIGHT.medium, "sans", nameW).forEach((line) => {
        text(line, nameRight, nameSz, WEIGHT.medium, "sans", "right", "rtl");
        ctx.y += gap(SPACE.itemNameLine);
      });
      const numSz = sz(TYPE.itemNumeric);
      text(String(it.qty), width - PAD, numSz, WEIGHT.medium, "sans", "right", "ltr", { at: firstY });
      text(money(it.lineTotal), PAD, numSz, WEIGHT.medium, "sans", "left", "ltr", { at: firstY });
      const subSz = sz(TYPE.itemSub);
      mods.forEach((m) => {
        wrap("— " + modText(m), subSz, WEIGHT.regular, "sans", nameW).forEach((line) => {
          text(line, nameRight, subSz, WEIGHT.regular, "sans", "right", "rtl");
          ctx.y += gap(SPACE.itemSubLine);
        });
      });
      if (it.note) {
        wrap("ملاحظات: " + it.note, subSz, WEIGHT.regular, "sans", nameW).forEach((line) => {
          text(line, nameRight, subSz, WEIGHT.regular, "sans", "right", "rtl");
          ctx.y += gap(SPACE.itemSubLine);
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
        ctx.y += gap(SPACE.itemSubLine);
      }
      ctx.y += gap(SPACE.afterItem);
      if ((mods.length > 0 || it.note) && !isLast) hairline();
    });
    if (receipt.orderNote) {
      ctx.y += gap(SPACE.beforeOrderNote);
      const noteSz = sz(TYPE.orderNote);
      wrap("ملاحظات الطلب: " + receipt.orderNote, noteSz, WEIGHT.regular, "sans", contentWidth).forEach((line) => rowText("", line, noteSz, false));
      ctx.y += gap(SPACE.afterOrderNote);
    }
    divider();
    if (th.sectionLabels) spacedText(bi("الحساب", "PAYMENT"), sz(TYPE.sectionLabel), true);
    const rowSz = sz(TYPE.totalRow);
    rowText(money(receipt.subtotal), bi("المجموع الفرعي", "Subtotal"), rowSz, false);
    if (receipt.discount > 0) rowText("-" + money(receipt.discount), bi("الخصم", "Discount"), rowSz, false);
    rowText(money(receipt.vat), bi("ضريبة القيمة المضافة", "VAT"), rowSz, false);
    const totalTop = ctx.y - LINE * TOTAL_BOX.liftY;
    if (th.totalStyle === "invert") {
      invertBar(bi("الإجمالي", "Total") + "   " + money(receipt.total), sz(TYPE.grandTotalInvert));
    } else if (th.totalStyle === "box") {
      const tTop = ctx.y - LINE * TOTAL_BOX.liftY;
      rowText(money(receipt.total), bi("الإجمالي", "Total"), sz(TYPE.grandTotalBox), true);
      const tH = ctx.y - LINE * TOTAL_BOX.dropY - tTop;
      const bx = PAD * TOTAL_BOX.inset;
      const bw2 = width - PAD * TOTAL_BOX.inset * 2;
      const t = BORDER.totalBox;
      ctx.box(bx, tTop, bw2, tH, t);
      ctx.y += gap(SPACE.afterTotalBox);
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
      const bh = ctx.y - totalTop - LINE * TOTAL_BOX.strokeDropY;
      const t = BORDER.totalBox;
      ctx.box(bx, totalTop, bw2, bh, t);
      ctx.y += gap(SPACE.afterBoxedTotal);
    }
    divider();
    const paySz = sz(TYPE.payment);
    rowText("", receipt.paymentMethodLabel, paySz, false);
    if (receipt.change > 0) rowText(receipt.change.toFixed(2), "الباقي", paySz, false);
    if (input.pager) pagerBlock(input.pager);
    if (qr) {
      const qrSize = Math.min(QR_MAX, th.qrMaxSize, contentWidth);
      ctx.y += LINE * SPACE.beforeQr;
      ops.push({ op: "image", ref: "qr", x: (width - qrSize) / 2, y: ctx.y, w: qrSize, h: qrSize });
      ctx.y += qrSize + LINE * SPACE.afterQr;
    }
    ctx.y += LINE * SPACE.beforeFooter;
    const footSz = sz(TYPE.footer);
    (receipt.customMessage || "شكراً لزيارتكم").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((part) => {
      wrap(part, footSz, WEIGHT.regular, "sans", contentWidth).forEach((line) => centerText(line, footSz, false));
    });
    ctx.y += PAD;
    return { width, height: Math.ceil(ctx.y), ops };
  }

  // shared/receipt/kitchenLayout.ts
  function layoutKitchenTicket(input) {
    const { ticket, measure, paperWidth: width, logo } = input;
    const ctx = createContext({ width, line: KITCHEN.line, measure });
    if (logo) {
      const lw = Math.round(width * KITCHEN.logoWidth);
      const lh = Math.round(lw * (logo.height / logo.width));
      ctx.ops.push({ op: "image", ref: "logo", x: (width - lw) / 2, y: ctx.y, w: lw, h: lh });
      ctx.y += lh + ctx.line * KITCHEN_SPACE.afterLogo;
    }
    ctx.centerText("KITCHEN RECEIPT", logo ? KITCHEN.titleWithLogo : KITCHEN.titleAlone, true);
    if (ticket.branchName) ctx.centerText(ticket.branchName, KITCHEN.branch, false);
    ctx.centerText(ticket.dateLabel, KITCHEN.date, false);
    ctx.centerText(ticket.metaLabel, KITCHEN.meta, true);
    if (ticket.pickupAt) {
      ctx.y += ctx.gap(KITCHEN_SPACE.beforeCall);
      ctx.centerText("جهّزه الساعة · Ready at", KITCHEN.callLabel, false);
      ctx.centerText(ticket.pickupAt, Math.round(KITCHEN.meta * 1.5), true);
    }
    ctx.y += ctx.gap(KITCHEN_SPACE.beforeCall);
    if (ticket.pagerNumber != null && ticket.pagerNumber !== "") {
      ctx.centerText("جهاز النداء · Pager", KITCHEN.callLabel, false);
      ctx.centerText(String(ticket.pagerNumber), KITCHEN.pagerNumber, true);
    } else {
      ctx.centerText("رقم الطلب · Order No", KITCHEN.callLabel, false);
      ctx.centerText(ticket.orderNumber || "—", KITCHEN.orderNumber, true);
    }
    ctx.rule(KITCHEN_SPACE.afterRule);
    const subRight = width - PAD - KITCHEN.subIndent;
    for (const it of ticket.items) {
      const name = it.nameEn ? it.name + " | " + it.nameEn : it.name;
      ctx.wrap(it.qty + "x " + name, KITCHEN.item, WEIGHT.bold, "sans", ctx.contentWidth).forEach((l) => {
        ctx.text(l, width - PAD, KITCHEN.item, WEIGHT.bold, "sans", "right", "rtl");
        ctx.y += ctx.gap(KITCHEN_SPACE.itemLine);
      });
      for (const m of it.mods || []) {
        ctx.wrap("— " + modText(m), KITCHEN.sub, WEIGHT.regular, "sans", ctx.contentWidth - KITCHEN.subIndent).forEach((l) => {
          ctx.text(l, subRight, KITCHEN.sub, WEIGHT.regular, "sans", "right", "rtl");
          ctx.y += ctx.gap(KITCHEN_SPACE.subLine);
        });
      }
      if (it.note) {
        ctx.wrap("ملاحظات: " + it.note, KITCHEN.sub, WEIGHT.medium, "sans", ctx.contentWidth - KITCHEN.subIndent).forEach((l) => {
          ctx.text(l, subRight, KITCHEN.sub, WEIGHT.medium, "sans", "right", "rtl");
          ctx.y += ctx.gap(KITCHEN_SPACE.subLine);
        });
      }
      ctx.y += ctx.gap(KITCHEN_SPACE.afterItem);
    }
    ctx.rule(KITCHEN_SPACE.afterRule);
    ctx.y += ctx.gap(KITCHEN_SPACE.beforeBy);
    if (ticket.cashierName) ctx.centerText("طبعها · By: " + ticket.cashierName, KITCHEN.by, false);
    ctx.y += ctx.gap(KITCHEN_SPACE.beforeBlessing);
    const blessing = "بالعافية عليكم";
    const bSize = KITCHEN.blessing;
    const heart = bSize * KITCHEN.heartSize;
    const gapX = bSize * KITCHEN.heartGap;
    const bw = measure(blessing, bSize, WEIGHT.bold, "sans");
    const startX = (width - (bw + gapX + heart)) / 2;
    ctx.text(blessing, startX + heart + gapX + bw, bSize, WEIGHT.bold, "sans", "right", "rtl");
    ctx.heart(startX + heart / 2, ctx.y, heart);
    ctx.y += ctx.gap(KITCHEN_SPACE.afterBlessing) + PAD;
    return { width, height: Math.ceil(ctx.y), ops: ctx.ops };
  }

  // shared/receipt/shiftLayout.ts
  function layoutShiftReport(input) {
    const { report, measure, paperWidth: width, currency } = input;
    const ctx = createContext({ width, line: SHIFT.line, measure });
    const opt = report.options || {};
    const on = (k) => opt[k] !== false;
    const money = (n) => n.toFixed(2) + " " + currency;
    ctx.centerText(report.businessName || "ركين", SHIFT.businessName, true);
    if (report.branchName) ctx.centerText(report.branchName, SHIFT.branch, false);
    ctx.y += ctx.gap(SHIFT_SPACE.beforeTitle);
    ctx.centerText("تقرير إغلاق الوردية", SHIFT.title, true);
    ctx.centerText("Shift Close Report", SHIFT.titleEn, false);
    ctx.centerText(report.dateLabel, SHIFT.date, false);
    ctx.rule(SHIFT_SPACE.afterRule);
    ctx.rowText("", "الكاشير · Cashier: " + report.staffName, SHIFT.meta, false);
    if (report.shiftStart) ctx.rowText("", "من · From: " + report.shiftStart, SHIFT.metaSmall, false);
    ctx.rule(SHIFT_SPACE.afterRule);
    ctx.centerText("المبيعات · Sales", SHIFT.sectionLabel, true);
    ctx.rowText(money(report.grossSales), "إجمالي المبيعات · Gross", SHIFT.row, false);
    if (on("discounts")) {
      ctx.rowText("-" + money(report.discountsTotal), "الخصومات · Discounts", SHIFT.row, false);
      for (const tier of report.discountBreakdown || []) {
        ctx.rowText(
          tier.count + " طلبات · orders",
          "خصم " + tier.pct + "% · " + tier.pct + "% off",
          SHIFT.metaSmall,
          false
        );
      }
    }
    if (on("refunds")) ctx.rowText("-" + money(report.refundsTotal), "المرتجعات · Refunds (" + report.refundsCount + ")", SHIFT.row, false);
    if (on("vat")) ctx.rowText(money(report.vatTotal), "ضريبة القيمة المضافة · VAT", SHIFT.row, false);
    ctx.rowText(money(report.netSales), "صافي المبيعات · Net", SHIFT.net, true);
    ctx.rule(SHIFT_SPACE.afterRule);
    ctx.centerText("طرق الدفع · Payments", SHIFT.sectionLabel, true);
    ctx.rowText(money(report.cashSales), "كاش · Cash", SHIFT.row, false);
    ctx.rowText(money(report.cardTotal), "شبكة · Card", SHIFT.row, false);
    ctx.rowText(money(report.deliveryPlatformTotal), "تطبيقات توصيل · Delivery Apps", SHIFT.row, false);
    if (report.onlinePaymentsEnabled) ctx.rowText(money(report.onlineTotal), "دفع إلكتروني · Online", SHIFT.row, false);
    ctx.rule(SHIFT_SPACE.afterRule);
    ctx.centerText("الصندوق · Cash Drawer", SHIFT.sectionLabel, true);
    ctx.rowText(money(report.openingCash), "الرصيد الافتتاحي · Opening float", SHIFT.row, false);
    ctx.rowText("+" + money(report.cashSales), "مبيعات الكاش · Cash sales", SHIFT.row, false);
    if (report.refundsTotal > 0) ctx.rowText("-" + money(report.refundsTotal), "مرتجعات كاش · Refunds paid", SHIFT.row, false);
    ctx.rowText(money(report.cashExpected), "المتوقع في الدرج · Expected", SHIFT.row, true);
    ctx.rowText(money(report.cashCounted), "المعدود · Counted", SHIFT.row, false);
    const vTop = ctx.y - ctx.line * TOTAL_BOX.liftY;
    ctx.rowText((report.cashVariance >= 0 ? "+" : "") + money(report.cashVariance), "الفرق · Variance", SHIFT.variance, true);
    ctx.box(
      PAD * TOTAL_BOX.inset,
      vTop,
      width - PAD * TOTAL_BOX.inset * 2,
      ctx.y - ctx.line * TOTAL_BOX.dropY - vTop,
      BORDER.totalBox
    );
    ctx.y += ctx.gap(SHIFT_SPACE.afterVariance);
    if (on("counts")) {
      ctx.rule(SHIFT_SPACE.afterRule);
      ctx.rowText(String(report.ordersCount), "عدد الطلبات · Orders", SHIFT.counts, false);
      ctx.rowText(money(report.avgTicket), "متوسط الفاتورة · Avg ticket", SHIFT.counts, false);
    }
    if (on("signatures")) {
      ctx.rule(SHIFT_SPACE.afterRule);
      ctx.y += ctx.gap(SHIFT_SPACE.aroundSignature);
      ctx.rowText("", "توقيع الكاشير · Cashier  ______________", SHIFT.signature, false);
      ctx.y += ctx.gap(SHIFT_SPACE.aroundSignature);
      ctx.rowText("", "توقيع المدير · Manager   ______________", SHIFT.signature, false);
    }
    ctx.y += PAD;
    return { width, height: Math.ceil(ctx.y), ops: ctx.ops };
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

  // react-native-poc/node_modules/qrcode-generator/dist/qrcode.mjs
  var qrcode = function(typeNumber, errorCorrectionLevel) {
    const PAD0 = 236;
    const PAD1 = 17;
    let _typeNumber = typeNumber;
    const _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    let _modules = null;
    let _moduleCount = 0;
    let _dataCache = null;
    const _dataList = [];
    const _this = {};
    const makeImpl = function(test, maskPattern) {
      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        const modules = new Array(moduleCount);
        for (let row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (let col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);
      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);
      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }
      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }
      mapData(_dataCache, maskPattern);
    };
    const setupPositionProbePattern = function(row, col) {
      for (let r = -1; r <= 7; r += 1) {
        if (row + r <= -1 || _moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c += 1) {
          if (col + c <= -1 || _moduleCount <= col + c) continue;
          if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };
    const getBestMaskPattern = function() {
      let minLostPoint = 0;
      let pattern = 0;
      for (let i = 0; i < 8; i += 1) {
        makeImpl(true, i);
        const lostPoint = QRUtil.getLostPoint(_this);
        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    };
    const setupTimingPattern = function() {
      for (let r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = r % 2 == 0;
      }
      for (let c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = c % 2 == 0;
      }
    };
    const setupPositionAdjustPattern = function() {
      const pos = QRUtil.getPatternPosition(_typeNumber);
      for (let i = 0; i < pos.length; i += 1) {
        for (let j = 0; j < pos.length; j += 1) {
          const row = pos[i];
          const col = pos[j];
          if (_modules[row][col] != null) {
            continue;
          }
          for (let r = -2; r <= 2; r += 1) {
            for (let c = -2; c <= 2; c += 1) {
              if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };
    const setupTypeNumber = function(test) {
      const bits = QRUtil.getBCHTypeNumber(_typeNumber);
      for (let i = 0; i < 18; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }
      for (let i = 0; i < 18; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };
    const setupTypeInfo = function(test, maskPattern) {
      const data = _errorCorrectionLevel << 3 | maskPattern;
      const bits = QRUtil.getBCHTypeInfo(data);
      for (let i = 0; i < 15; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }
      for (let i = 0; i < 15; i += 1) {
        const mod = !test && (bits >> i & 1) == 1;
        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }
      _modules[_moduleCount - 8][8] = !test;
    };
    const mapData = function(data, maskPattern) {
      let inc = -1;
      let row = _moduleCount - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      const maskFunc = QRUtil.getMaskFunction(maskPattern);
      for (let col = _moduleCount - 1; col > 0; col -= 2) {
        if (col == 6) col -= 1;
        while (true) {
          for (let c = 0; c < 2; c += 1) {
            if (_modules[row][col - c] == null) {
              let dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) == 1;
              }
              const mask = maskFunc(row, col - c);
              if (mask) {
                dark = !dark;
              }
              _modules[row][col - c] = dark;
              bitIndex -= 1;
              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };
    const createBytes = function(buffer, rsBlocks) {
      let offset = 0;
      let maxDcCount = 0;
      let maxEcCount = 0;
      const dcdata = new Array(rsBlocks.length);
      const ecdata = new Array(rsBlocks.length);
      for (let r = 0; r < rsBlocks.length; r += 1) {
        const dcCount = rsBlocks[r].dataCount;
        const ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (let i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;
        const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        const rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
        const modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (let i = 0; i < ecdata[r].length; i += 1) {
          const modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
        }
      }
      let totalCodeCount = 0;
      for (let i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }
      const data = new Array(totalCodeCount);
      let index = 0;
      for (let i = 0; i < maxDcCount; i += 1) {
        for (let r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }
      for (let i = 0; i < maxEcCount; i += 1) {
        for (let r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }
      return data;
    };
    const createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
      const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
      const buffer = qrBitBuffer();
      for (let i = 0; i < dataList.length; i += 1) {
        const data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
        data.write(buffer);
      }
      let totalDataCount = 0;
      for (let i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }
      return createBytes(buffer, rsBlocks);
    };
    _this.addData = function(data, mode) {
      mode = mode || "Byte";
      let newData = null;
      switch (mode) {
        case "Numeric":
          newData = qrNumber(data);
          break;
        case "Alphanumeric":
          newData = qrAlphaNum(data);
          break;
        case "Byte":
          newData = qr8BitByte(data);
          break;
        case "Kanji":
          newData = qrKanji(data);
          break;
        default:
          throw "mode:" + mode;
      }
      _dataList.push(newData);
      _dataCache = null;
    };
    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + "," + col;
      }
      return _modules[row][col];
    };
    _this.getModuleCount = function() {
      return _moduleCount;
    };
    _this.make = function() {
      if (_typeNumber < 1) {
        let typeNumber2 = 1;
        for (; typeNumber2 < 40; typeNumber2++) {
          const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
          const buffer = qrBitBuffer();
          for (let i = 0; i < _dataList.length; i++) {
            const data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          let totalDataCount = 0;
          for (let i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }
        _typeNumber = typeNumber2;
      }
      makeImpl(false, getBestMaskPattern());
    };
    _this.createTableTag = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      let qrHtml = "";
      qrHtml += '<table style="';
      qrHtml += " border-width: 0px; border-style: none;";
      qrHtml += " border-collapse: collapse;";
      qrHtml += " padding: 0px; margin: " + margin + "px;";
      qrHtml += '">';
      qrHtml += "<tbody>";
      for (let r = 0; r < _this.getModuleCount(); r += 1) {
        qrHtml += "<tr>";
        for (let c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: 0px;";
          qrHtml += " width: " + cellSize + "px;";
          qrHtml += " height: " + cellSize + "px;";
          qrHtml += " background-color: ";
          qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
          qrHtml += ";";
          qrHtml += '"/>';
        }
        qrHtml += "</tr>";
      }
      qrHtml += "</tbody>";
      qrHtml += "</table>";
      return qrHtml;
    };
    _this.createSvgTag = function(cellSize, margin, alt, title) {
      let opts = {};
      if (typeof arguments[0] == "object") {
        opts = arguments[0];
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      alt = typeof alt === "string" ? { text: alt } : alt || {};
      alt.text = alt.text || null;
      alt.id = alt.text ? alt.id || "qrcode-description" : null;
      title = typeof title === "string" ? { text: title } : title || {};
      title.text = title.text || null;
      title.id = title.text ? title.id || "qrcode-title" : null;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      let c, mc, r, mr, qrSvg = "", rect;
      rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
      qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
      qrSvg += ">";
      qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
      qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';
      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c)) {
            mc = c * cellSize + margin;
            qrSvg += "M" + mc + "," + mr + rect;
          }
        }
      }
      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += "</svg>";
      return qrSvg;
    };
    _this.createDataURL = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      const min = margin;
      const max = size - margin;
      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          const c = Math.floor((x - min) / cellSize);
          const r = Math.floor((y - min) / cellSize);
          return _this.isDark(r, c) ? 0 : 1;
        } else {
          return 1;
        }
      });
    };
    _this.createImgTag = function(cellSize, margin, alt) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      let img = "";
      img += "<img";
      img += ' src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += ' width="';
      img += size;
      img += '"';
      img += ' height="';
      img += size;
      img += '"';
      if (alt) {
        img += ' alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += "/>";
      return img;
    };
    const escapeXml = function(s) {
      let escaped = "";
      for (let i = 0; i < s.length; i += 1) {
        const c = s.charAt(i);
        switch (c) {
          case "<":
            escaped += "&lt;";
            break;
          case ">":
            escaped += "&gt;";
            break;
          case "&":
            escaped += "&amp;";
            break;
          case '"':
            escaped += "&quot;";
            break;
          default:
            escaped += c;
            break;
        }
      }
      return escaped;
    };
    const _createHalfASCII = function(margin) {
      const cellSize = 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      const min = margin;
      const max = size - margin;
      let y, x, r1, r2, p;
      const blocks = {
        "██": "█",
        "█ ": "▀",
        " █": "▄",
        "  ": " "
      };
      const blocksLastLineNoMargin = {
        "██": "▀",
        "█ ": "▀",
        " █": " ",
        "  ": " "
      };
      let ascii = "";
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = "█";
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = " ";
          }
          if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += " ";
          } else {
            p += "█";
          }
          ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
        }
        ascii += "\n";
      }
      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("▀");
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;
      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }
      cellSize -= 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      const size = _this.getModuleCount() * cellSize + margin * 2;
      const min = margin;
      const max = size - margin;
      let y, x, r, p;
      const white = Array(cellSize + 1).join("██");
      const black = Array(cellSize + 1).join("  ");
      let ascii = "";
      let line = "";
      for (y = 0; y < size; y += 1) {
        r = Math.floor((y - min) / cellSize);
        line = "";
        for (x = 0; x < size; x += 1) {
          p = 1;
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }
          line += p ? white : black;
        }
        for (r = 0; r < cellSize; r += 1) {
          ascii += line + "\n";
        }
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      const length = _this.getModuleCount();
      for (let row = 0; row < length; row++) {
        for (let col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? "black" : "white";
          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    };
    return _this;
  };
  qrcode.stringToBytes = function(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      bytes.push(c & 255);
    }
    return bytes;
  };
  qrcode.createStringToBytes = function(unicodeData, numChars) {
    const unicodeMap = function() {
      const bin = base64DecodeInputStream(unicodeData);
      const read = function() {
        const b = bin.read();
        if (b == -1) throw "eof";
        return b;
      };
      let count = 0;
      const unicodeMap2 = {};
      while (true) {
        const b0 = bin.read();
        if (b0 == -1) break;
        const b1 = read();
        const b2 = read();
        const b3 = read();
        const k = String.fromCharCode(b0 << 8 | b1);
        const v = b2 << 8 | b3;
        unicodeMap2[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + " != " + numChars;
      }
      return unicodeMap2;
    }();
    const unknownChar = "?".charCodeAt(0);
    return function(s) {
      const bytes = [];
      for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          const b = unicodeMap[s.charAt(i)];
          if (typeof b == "number") {
            if ((b & 255) == b) {
              bytes.push(b);
            } else {
              bytes.push(b >>> 8);
              bytes.push(b & 255);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };
  var QRMode = {
    MODE_NUMBER: 1 << 0,
    MODE_ALPHA_NUM: 1 << 1,
    MODE_8BIT_BYTE: 1 << 2,
    MODE_KANJI: 1 << 3
  };
  var QRErrorCorrectionLevel = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2
  };
  var QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7
  };
  var QRUtil = function() {
    const PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    const _this = {};
    const getBCHDigit = function(data) {
      let digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };
    _this.getBCHTypeInfo = function(data) {
      let d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
      }
      return (data << 10 | d) ^ G15_MASK;
    };
    _this.getBCHTypeNumber = function(data) {
      let d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
      }
      return data << 12 | d;
    };
    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };
    _this.getMaskFunction = function(maskPattern) {
      switch (maskPattern) {
        case QRMaskPattern.PATTERN000:
          return function(i, j) {
            return (i + j) % 2 == 0;
          };
        case QRMaskPattern.PATTERN001:
          return function(i, j) {
            return i % 2 == 0;
          };
        case QRMaskPattern.PATTERN010:
          return function(i, j) {
            return j % 3 == 0;
          };
        case QRMaskPattern.PATTERN011:
          return function(i, j) {
            return (i + j) % 3 == 0;
          };
        case QRMaskPattern.PATTERN100:
          return function(i, j) {
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
          };
        case QRMaskPattern.PATTERN101:
          return function(i, j) {
            return i * j % 2 + i * j % 3 == 0;
          };
        case QRMaskPattern.PATTERN110:
          return function(i, j) {
            return (i * j % 2 + i * j % 3) % 2 == 0;
          };
        case QRMaskPattern.PATTERN111:
          return function(i, j) {
            return (i * j % 3 + (i + j) % 2) % 2 == 0;
          };
        default:
          throw "bad maskPattern:" + maskPattern;
      }
    };
    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      let a = qrPolynomial([1], 0);
      for (let i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
      }
      return a;
    };
    _this.getLengthInBits = function(mode, type) {
      if (1 <= type && type < 10) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 10;
          case QRMode.MODE_ALPHA_NUM:
            return 9;
          case QRMode.MODE_8BIT_BYTE:
            return 8;
          case QRMode.MODE_KANJI:
            return 8;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 27) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 12;
          case QRMode.MODE_ALPHA_NUM:
            return 11;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 10;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 41) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 14;
          case QRMode.MODE_ALPHA_NUM:
            return 13;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 12;
          default:
            throw "mode:" + mode;
        }
      } else {
        throw "type:" + type;
      }
    };
    _this.getLostPoint = function(qrcode2) {
      const moduleCount = qrcode2.getModuleCount();
      let lostPoint = 0;
      for (let row = 0; row < moduleCount; row += 1) {
        for (let col = 0; col < moduleCount; col += 1) {
          let sameCount = 0;
          const dark = qrcode2.isDark(row, col);
          for (let r = -1; r <= 1; r += 1) {
            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }
            for (let c = -1; c <= 1; c += 1) {
              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }
              if (r == 0 && c == 0) {
                continue;
              }
              if (dark == qrcode2.isDark(row + r, col + c)) {
                sameCount += 1;
              }
            }
          }
          if (sameCount > 5) {
            lostPoint += 3 + sameCount - 5;
          }
        }
      }
      ;
      for (let row = 0; row < moduleCount - 1; row += 1) {
        for (let col = 0; col < moduleCount - 1; col += 1) {
          let count = 0;
          if (qrcode2.isDark(row, col)) count += 1;
          if (qrcode2.isDark(row + 1, col)) count += 1;
          if (qrcode2.isDark(row, col + 1)) count += 1;
          if (qrcode2.isDark(row + 1, col + 1)) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }
      for (let row = 0; row < moduleCount; row += 1) {
        for (let col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode2.isDark(row, col) && !qrcode2.isDark(row, col + 1) && qrcode2.isDark(row, col + 2) && qrcode2.isDark(row, col + 3) && qrcode2.isDark(row, col + 4) && !qrcode2.isDark(row, col + 5) && qrcode2.isDark(row, col + 6)) {
            lostPoint += 40;
          }
        }
      }
      for (let col = 0; col < moduleCount; col += 1) {
        for (let row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode2.isDark(row, col) && !qrcode2.isDark(row + 1, col) && qrcode2.isDark(row + 2, col) && qrcode2.isDark(row + 3, col) && qrcode2.isDark(row + 4, col) && !qrcode2.isDark(row + 5, col) && qrcode2.isDark(row + 6, col)) {
            lostPoint += 40;
          }
        }
      }
      let darkCount = 0;
      for (let col = 0; col < moduleCount; col += 1) {
        for (let row = 0; row < moduleCount; row += 1) {
          if (qrcode2.isDark(row, col)) {
            darkCount += 1;
          }
        }
      }
      const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;
      return lostPoint;
    };
    return _this;
  }();
  var QRMath = function() {
    const EXP_TABLE = new Array(256);
    const LOG_TABLE = new Array(256);
    for (let i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (let i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
    }
    for (let i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i]] = i;
    }
    const _this = {};
    _this.glog = function(n) {
      if (n < 1) {
        throw "glog(" + n + ")";
      }
      return LOG_TABLE[n];
    };
    _this.gexp = function(n) {
      while (n < 0) {
        n += 255;
      }
      while (n >= 256) {
        n -= 255;
      }
      return EXP_TABLE[n];
    };
    return _this;
  }();
  var qrPolynomial = function(num, shift) {
    if (typeof num.length == "undefined") {
      throw num.length + "/" + shift;
    }
    const _num = function() {
      let offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      const _num2 = new Array(num.length - offset + shift);
      for (let i = 0; i < num.length - offset; i += 1) {
        _num2[i] = num[i + offset];
      }
      return _num2;
    }();
    const _this = {};
    _this.getAt = function(index) {
      return _num[index];
    };
    _this.getLength = function() {
      return _num.length;
    };
    _this.multiply = function(e) {
      const num2 = new Array(_this.getLength() + e.getLength() - 1);
      for (let i = 0; i < _this.getLength(); i += 1) {
        for (let j = 0; j < e.getLength(); j += 1) {
          num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
        }
      }
      return qrPolynomial(num2, 0);
    };
    _this.mod = function(e) {
      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }
      const ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
      const num2 = new Array(_this.getLength());
      for (let i = 0; i < _this.getLength(); i += 1) {
        num2[i] = _this.getAt(i);
      }
      for (let i = 0; i < e.getLength(); i += 1) {
        num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
      }
      return qrPolynomial(num2, 0).mod(e);
    };
    return _this;
  };
  var QRRSBlock = function() {
    const RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    const qrRSBlock = function(totalCount, dataCount) {
      const _this2 = {};
      _this2.totalCount = totalCount;
      _this2.dataCount = dataCount;
      return _this2;
    };
    const _this = {};
    const getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case QRErrorCorrectionLevel.L:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectionLevel.M:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectionLevel.Q:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectionLevel.H:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
      const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
      if (typeof rsBlock == "undefined") {
        throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
      }
      const length = rsBlock.length / 3;
      const list = [];
      for (let i = 0; i < length; i += 1) {
        const count = rsBlock[i * 3 + 0];
        const totalCount = rsBlock[i * 3 + 1];
        const dataCount = rsBlock[i * 3 + 2];
        for (let j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    return _this;
  }();
  var qrBitBuffer = function() {
    const _buffer = [];
    let _length = 0;
    const _this = {};
    _this.getBuffer = function() {
      return _buffer;
    };
    _this.getAt = function(index) {
      const bufIndex = Math.floor(index / 8);
      return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
    };
    _this.put = function(num, length) {
      for (let i = 0; i < length; i += 1) {
        _this.putBit((num >>> length - i - 1 & 1) == 1);
      }
    };
    _this.getLengthInBits = function() {
      return _length;
    };
    _this.putBit = function(bit) {
      const bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }
      if (bit) {
        _buffer[bufIndex] |= 128 >>> _length % 8;
      }
      _length += 1;
    };
    return _this;
  };
  var qrNumber = function(data) {
    const _mode = QRMode.MODE_NUMBER;
    const _data = data;
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      const data2 = _data;
      let i = 0;
      while (i + 2 < data2.length) {
        buffer.put(strToNum(data2.substring(i, i + 3)), 10);
        i += 3;
      }
      if (i < data2.length) {
        if (data2.length - i == 1) {
          buffer.put(strToNum(data2.substring(i, i + 1)), 4);
        } else if (data2.length - i == 2) {
          buffer.put(strToNum(data2.substring(i, i + 2)), 7);
        }
      }
    };
    const strToNum = function(s) {
      let num = 0;
      for (let i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i));
      }
      return num;
    };
    const chatToNum = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      }
      throw "illegal char :" + c;
    };
    return _this;
  };
  var qrAlphaNum = function(data) {
    const _mode = QRMode.MODE_ALPHA_NUM;
    const _data = data;
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      const s = _data;
      let i = 0;
      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
          11
        );
        i += 2;
      }
      if (i < s.length) {
        buffer.put(getCode(s.charAt(i)), 6);
      }
    };
    const getCode = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      } else if ("A" <= c && c <= "Z") {
        return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
      } else {
        switch (c) {
          case " ":
            return 36;
          case "$":
            return 37;
          case "%":
            return 38;
          case "*":
            return 39;
          case "+":
            return 40;
          case "-":
            return 41;
          case ".":
            return 42;
          case "/":
            return 43;
          case ":":
            return 44;
          default:
            throw "illegal char :" + c;
        }
      }
    };
    return _this;
  };
  var qr8BitByte = function(data) {
    const _mode = QRMode.MODE_8BIT_BYTE;
    const _data = data;
    const _bytes = qrcode.stringToBytes(data);
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _bytes.length;
    };
    _this.write = function(buffer) {
      for (let i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };
    return _this;
  };
  var qrKanji = function(data) {
    const _mode = QRMode.MODE_KANJI;
    const _data = data;
    const stringToBytes2 = qrcode.stringToBytes;
    !function(c, code) {
      const test = stringToBytes2(c);
      if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
        throw "sjis not supported.";
      }
    }("友", 38726);
    const _bytes = stringToBytes2(data);
    const _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };
    _this.write = function(buffer) {
      const data2 = _bytes;
      let i = 0;
      while (i + 1 < data2.length) {
        let c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
        if (33088 <= c && c <= 40956) {
          c -= 33088;
        } else if (57408 <= c && c <= 60351) {
          c -= 49472;
        } else {
          throw "illegal char at " + (i + 1) + "/" + c;
        }
        c = (c >>> 8 & 255) * 192 + (c & 255);
        buffer.put(c, 13);
        i += 2;
      }
      if (i < data2.length) {
        throw "illegal char at " + (i + 1);
      }
    };
    return _this;
  };
  var byteArrayOutputStream = function() {
    const _bytes = [];
    const _this = {};
    _this.writeByte = function(b) {
      _bytes.push(b & 255);
    };
    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };
    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (let i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };
    _this.writeString = function(s) {
      for (let i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i));
      }
    };
    _this.toByteArray = function() {
      return _bytes;
    };
    _this.toString = function() {
      let s = "";
      s += "[";
      for (let i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ",";
        }
        s += _bytes[i];
      }
      s += "]";
      return s;
    };
    return _this;
  };
  var base64EncodeOutputStream = function() {
    let _buffer = 0;
    let _buflen = 0;
    let _length = 0;
    let _base64 = "";
    const _this = {};
    const writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 63));
    };
    const encode = function(n) {
      if (n < 0) {
        throw "n:" + n;
      } else if (n < 26) {
        return 65 + n;
      } else if (n < 52) {
        return 97 + (n - 26);
      } else if (n < 62) {
        return 48 + (n - 52);
      } else if (n == 62) {
        return 43;
      } else if (n == 63) {
        return 47;
      } else {
        throw "n:" + n;
      }
    };
    _this.writeByte = function(n) {
      _buffer = _buffer << 8 | n & 255;
      _buflen += 8;
      _length += 1;
      while (_buflen >= 6) {
        writeEncoded(_buffer >>> _buflen - 6);
        _buflen -= 6;
      }
    };
    _this.flush = function() {
      if (_buflen > 0) {
        writeEncoded(_buffer << 6 - _buflen);
        _buffer = 0;
        _buflen = 0;
      }
      if (_length % 3 != 0) {
        const padlen = 3 - _length % 3;
        for (let i = 0; i < padlen; i += 1) {
          _base64 += "=";
        }
      }
    };
    _this.toString = function() {
      return _base64;
    };
    return _this;
  };
  var base64DecodeInputStream = function(str) {
    const _str = str;
    let _pos = 0;
    let _buffer = 0;
    let _buflen = 0;
    const _this = {};
    _this.read = function() {
      while (_buflen < 8) {
        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw "unexpected end of file./" + _buflen;
        }
        const c = _str.charAt(_pos);
        _pos += 1;
        if (c == "=") {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/)) {
          continue;
        }
        _buffer = _buffer << 6 | decode(c.charCodeAt(0));
        _buflen += 6;
      }
      const n = _buffer >>> _buflen - 8 & 255;
      _buflen -= 8;
      return n;
    };
    const decode = function(c) {
      if (65 <= c && c <= 90) {
        return c - 65;
      } else if (97 <= c && c <= 122) {
        return c - 97 + 26;
      } else if (48 <= c && c <= 57) {
        return c - 48 + 52;
      } else if (c == 43) {
        return 62;
      } else if (c == 47) {
        return 63;
      } else {
        throw "c:" + c;
      }
    };
    return _this;
  };
  var gifImage = function(width, height) {
    const _width = width;
    const _height = height;
    const _data = new Array(width * height);
    const _this = {};
    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };
    _this.write = function(out) {
      out.writeString("GIF87a");
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(128);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(255);
      out.writeByte(255);
      out.writeByte(255);
      out.writeString(",");
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);
      const lzwMinCodeSize = 2;
      const raster = getLZWRaster(lzwMinCodeSize);
      out.writeByte(lzwMinCodeSize);
      let offset = 0;
      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }
      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0);
      out.writeString(";");
    };
    const bitOutputStream = function(out) {
      const _out = out;
      let _bitLength = 0;
      let _bitBuffer = 0;
      const _this2 = {};
      _this2.write = function(data, length) {
        if (data >>> length != 0) {
          throw "length over";
        }
        while (_bitLength + length >= 8) {
          _out.writeByte(255 & (data << _bitLength | _bitBuffer));
          length -= 8 - _bitLength;
          data >>>= 8 - _bitLength;
          _bitBuffer = 0;
          _bitLength = 0;
        }
        _bitBuffer = data << _bitLength | _bitBuffer;
        _bitLength = _bitLength + length;
      };
      _this2.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };
      return _this2;
    };
    const getLZWRaster = function(lzwMinCodeSize) {
      const clearCode = 1 << lzwMinCodeSize;
      const endCode = (1 << lzwMinCodeSize) + 1;
      let bitLength = lzwMinCodeSize + 1;
      const table = lzwTable();
      for (let i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i));
      }
      table.add(String.fromCharCode(clearCode));
      table.add(String.fromCharCode(endCode));
      const byteOut = byteArrayOutputStream();
      const bitOut = bitOutputStream(byteOut);
      bitOut.write(clearCode, bitLength);
      let dataIndex = 0;
      let s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      while (dataIndex < _data.length) {
        const c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;
        if (table.contains(s + c)) {
          s = s + c;
        } else {
          bitOut.write(table.indexOf(s), bitLength);
          if (table.size() < 4095) {
            if (table.size() == 1 << bitLength) {
              bitLength += 1;
            }
            table.add(s + c);
          }
          s = c;
        }
      }
      bitOut.write(table.indexOf(s), bitLength);
      bitOut.write(endCode, bitLength);
      bitOut.flush();
      return byteOut.toByteArray();
    };
    const lzwTable = function() {
      const _map = {};
      let _size = 0;
      const _this2 = {};
      _this2.add = function(key) {
        if (_this2.contains(key)) {
          throw "dup key:" + key;
        }
        _map[key] = _size;
        _size += 1;
      };
      _this2.size = function() {
        return _size;
      };
      _this2.indexOf = function(key) {
        return _map[key];
      };
      _this2.contains = function(key) {
        return typeof _map[key] != "undefined";
      };
      return _this2;
    };
    return _this;
  };
  var createDataURL = function(width, height, getPixel) {
    const gif = gifImage(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y));
      }
    }
    const b = byteArrayOutputStream();
    gif.write(b);
    const base64 = base64EncodeOutputStream();
    const bytes = b.toByteArray();
    for (let i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();
    return "data:image/gif;base64," + base64;
  };
  var qrcode_default = qrcode;
  var stringToBytes = qrcode.stringToBytes;

  // receipt-engine-entry.js
  function qrGrid(text) {
    const q = qrcode_default(0, "M");
    q.addData(String(text));
    q.make();
    const n = q.getModuleCount();
    return { size: n, dark: (r, c) => q.isDark(r, c) };
  }
  return __toCommonJS(receipt_engine_entry_exports);
})();
