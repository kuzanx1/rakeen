/**
 * مقاسُ الفاتورة كلُّه في مكانٍ واحد.
 *
 * كانت الأرقام مبعثرةً في راسمَين: حجمُ خطٍّ هنا وهامشٌ هناك، ومثلُها في
 * الطرف الآخر بقيمةٍ تختلف بواحد. فتُعدَّل الورقةُ مرّتين، وتفترق
 * النسختان بلا أن يلحظ أحد -- وقد افترقتا فعلاً.
 *
 * فما من عددٍ عارٍ في الراسم بعد اليوم: كلُّ مقاسٍ اسمُه هنا. وتكبيرُ
 * الخطّ أو الانتقالُ من ثمانين ملّيمتراً إلى ثمانٍ وخمسين تعديلٌ في هذا
 * الملفّ وحده.
 *
 * ── الوحدة ──
 * كلُّ الأعداد **نقاطُ طابعة** لا بكسلاتِ شاشة. واللوحةُ تُرسم بعرض
 * الطابعة نفسِه (٥٧٦ نقطة لثمانين ملّيمتراً) فالنسبةُ واحدٌ لواحد:
 * حجمُ خطٍّ مكتوبٌ هنا هو عددُ النقاط التي سيشغلها على الورق.
 *
 * ومقاسُ CSS ليس هو. الشاشةُ ستٌّ وتسعون نقطةً في البوصة والطابعةُ
 * مئتان وثلاث، فبينهما ٢٫١١. ومقاسٌ منقولٌ من تصميمٍ على الشاشة يُمرَّر
 * بـdotsFromCss قبل أن يُكتب هنا -- وإلّا خرج ثُلثَ حجمه، وسيقانُ
 * العربية دون النقطة الواحدة فتسقط عند التحويل إلى لونين ويخرج الحرفُ
 * مقطوعاً. وهو ما وقع، ولذلك القِيَمُ أدناه مقيسةٌ على ورقٍ حقيقيّ لا
 * محسوبةٌ من مواصفةِ شاشة.
 */

/** دقّةُ الطابعات الحرارية المتعارف عليها. */
export const PRINTER_DPI = 203;
/** دقّةُ الشاشة التي تُصمَّم عليها مقاساتُ CSS. */
export const CSS_DPI = 96;

/** يحوّل مقاسَ تصميمٍ بالبكسل إلى نقاطِ طابعة. */
export function dotsFromCss(px: number): number {
  return Math.round((px * PRINTER_DPI) / CSS_DPI);
}

/** يحوّل ملّيمترات إلى نقاط. */
export function dotsFromMm(mm: number): number {
  return Math.round((mm * PRINTER_DPI) / 25.4);
}

/** عرضُ الورق. ٨٠ملم هو الشائع، و٥٨ملم للطابعات المحمولة. */
export const PAPER = {
  mm80: 576,
  mm58: 384,
} as const;

export const DEFAULT_PAPER_WIDTH: number = PAPER.mm80;

/** الهامشُ الأيمنُ والأيسر. */
export const PAD = 16;

/**
 * وحدةُ الإيقاع الرأسيّ.
 *
 * كلُّ مسافةٍ في الورقة مضاعفٌ لها -- لا عددٌ يُختار لسطرٍ بعينه. فإن
 * أُريدت ورقةٌ أكثرَ تنفّساً غُيّرت هي وحدها.
 */
export const LINE = 32;

/**
 * سُلَّمُ الخطّ، بالنقاط.
 *
 * القِيَمُ مقيسةٌ لا مشتقّة: جُرِّبت على الورق حتى ثبتت العربيةُ عند
 * التحويل إلى لونين. ولا شيءَ منها دون أربعةَ عشر.
 */
export const TYPE = {
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
  footer: 18,
} as const;

export type TypeToken = keyof typeof TYPE;

/** أوزانُ الخطّ. */
export const WEIGHT = {
  regular: 600,
  medium: 700,
  bold: 800,
  mono: 500,
} as const;

/**
 * المسافاتُ الرأسية، مضاعفاتٍ لـLINE.
 *
 * ولا رقمَ منها في الراسم: يُنادى بالاسم فيُعرف ما يفصل عمّا يفصل.
 */
export const SPACE = {
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
  afterLogo: 0.45,
} as const;

/** الحدودُ والخطوط، بالنقاط. */
export const BORDER = {
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
  totalBox: 1.5,
} as const;

/** تقطيعُ الخطوط: طولُ الشَّرطة ثم الفراغ. */
export const DASH = {
  /** الفاصلُ المنقّط في القالب الأنيق. */
  rule: { on: 2, off: 4 },
  /** الخيطُ الخفيف بين الأصناف. */
  hairline: { on: 2, off: 3 },
  /** النقاطُ الموصِلة بين الاسم وسعره. */
  leader: { size: 2, step: 6, clearance: 8 },
} as const;

/**
 * أعمدةُ جدول الأصناف: الكميةُ يميناً، والاسمُ وسطاً، والسعرُ يساراً.
 *
 * نسبٌ من عرض الورق لا أرقامٌ ثابتة -- فورقُ الثمانٍ والخمسين يأخذ
 * النسبَ نفسَها وتُصغَّر أعمدتُه معاً، ولا يُكتب له جدولٌ ثانٍ.
 *
 * والاسمُ يأخذ ما بقي بعدهما من عرض المحتوى، فيلتفّ في عموده ولا يزحف
 * على جارَيه.
 */
export const COLUMNS = {
  qty: 0.09,
  price: 0.26,
} as const;

/** صندوقُ رقم الطلب. */
export const ORDER_BOX = {
  /** حشوةٌ رأسيةٌ واحدة أعلى وأسفل -- بها يستوي الصندوق. */
  padY: 0.62,
  /** بين الملصق والرقم. */
  gapY: 0.3,
  /** كم يعلو الصندوقُ خطَّ الأساس الحاليّ. */
  liftY: 0.3,
  /** عرضُه من عرض المحتوى. */
  width: 0.66,
  /** نسبةُ خطّ الأساس من أعلى الحرف -- الكانفسُ يرسم من الوسط. */
  baseline: 0.8,
} as const;

/** إطارُ الإجمالي: يتجاوز هامشَ النصّ قليلاً فيبدو محيطاً به. */
export const TOTAL_BOX = {
  inset: 0.6,
  liftY: 0.55,
  dropY: 0.2,
  strokeDropY: 0.15,
} as const;

/** الشعار. */
export const LOGO = {
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
  topPad: 0.4,
} as const;

/** الشريطُ الأسود: ارتفاعُه مضاعفٌ لحجم خطّه. */
export const INVERT_BAR = { height: 1.9, inset: 0.5 } as const;

/** حروفٌ متباعدة -- ولا تُطبَّق على العربية فحروفُها متّصلة. */
export const TRACKING = 0.18;

/** سقفُ رمز الاستجابة السريعة. */
export const QR_MAX = 220;

/**
 * القوالب.
 *
 * أربعُ لغاتٍ بصريةٍ لورقةٍ واحدة، لا أربعُ ورقات: كلُّها تنادي المقاسات
 * أعلاه، وإنّما تختار منها وتضربها في كثافتها وسُلّم خطّها.
 */
export interface ReceiptThemeTokens {
  density: number;
  typeScale: number;
  showLogo: boolean;
  logoWidth: number;
  rule: 'solid' | 'none' | 'dotted' | 'bar';
  orderStyle: 'box' | 'plain' | 'spaced' | 'invert';
  totalStyle: 'bold' | 'plain' | 'box' | 'invert';
  itemStyle: 'columns' | 'leaders';
  sectionLabels: boolean;
  headerBand: boolean;
  boxedTotal: boolean;
  qrMaxSize: number;
}

export const THEMES: Record<string, ReceiptThemeTokens> = {
  // التقليديّ: أعمدةٌ وخطوطٌ صلبة، كما تُطبع الفواتيرُ منذ عُرفت الطابعات.
  classic: {
    density: 1, typeScale: 1, showLogo: true, logoWidth: 0.3,
    rule: 'solid', orderStyle: 'box', totalStyle: 'bold', itemStyle: 'columns',
    sectionLabels: false, headerBand: false, boxedTotal: false, qrMaxSize: 220,
  },
  // المضغوط: أقصرُ ورقةٍ ممكنة. بلا شعارٍ ولا خطوطٍ ولا عناوين -- الفراغُ
  // وحدَه يفصل، والصنفُ وسعرُه على سطرٍ واحد تصلهما نقاط.
  compact: {
    density: 0.68, typeScale: 0.88, showLogo: false, logoWidth: 0.24,
    rule: 'none', orderStyle: 'plain', totalStyle: 'plain', itemStyle: 'leaders',
    sectionLabels: false, headerBand: false, boxedTotal: false, qrMaxSize: 170,
  },
  // الأنيق: هادئٌ ومتّسع. خطوطٌ منقّطةٌ رفيعة، وعناوينُ أقسامٍ بحروفٍ
  // متباعدة، ونقاطٌ موصِلة -- مظهرُ المطاعم الراقية.
  elegant: {
    density: 1.15, typeScale: 1.04, showLogo: true, logoWidth: 0.34,
    rule: 'dotted', orderStyle: 'spaced', totalStyle: 'box', itemStyle: 'leaders',
    sectionLabels: true, headerBand: true, boxedTotal: true, qrMaxSize: 220,
  },
  // الفخم: بيان. شعارٌ كبير، ورقمُ الطلب والإجماليُّ أبيضُ على أسود.
  // تُعرف الورقةُ من آخر الصالة.
  signature: {
    density: 1.12, typeScale: 1.02, showLogo: true, logoWidth: 0.52,
    rule: 'bar', orderStyle: 'invert', totalStyle: 'invert', itemStyle: 'columns',
    sectionLabels: true, headerBand: false, boxedTotal: true, qrMaxSize: 220,
  },
};

export function themeTokens(id: string | null | undefined): ReceiptThemeTokens {
  return THEMES[id || ''] || THEMES.classic;
}
