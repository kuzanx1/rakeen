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
    HEART: () => HEART,
    INVERT_BAR: () => INVERT_BAR,
    KITCHEN: () => KITCHEN,
    KITCHEN_SPACE: () => KITCHEN_SPACE,
    LARGE_TYPE_ABOVE: () => LARGE_TYPE_ABOVE,
    LINE: () => LINE,
    LOGO: () => LOGO,
    ORDER_BOX: () => ORDER_BOX,
    PAD: () => PAD,
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
        wrap("— " + m, subSz, WEIGHT.regular, "sans", nameW).forEach((line) => {
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
        ctx.wrap("— " + m, KITCHEN.sub, WEIGHT.regular, "sans", ctx.contentWidth - KITCHEN.subIndent).forEach((l) => {
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
    if (on("discounts")) ctx.rowText("-" + money(report.discountsTotal), "الخصومات · Discounts", SHIFT.row, false);
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
  return __toCommonJS(index_exports);
})();
