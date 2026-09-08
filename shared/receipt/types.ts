/**
 * لغةُ الرسم المشتركة.
 *
 * المحرّكُ لا يرسم شيئاً: يحسب ويُخرج قائمةَ أوامرَ صغيرة -- نصٌّ في
 * موضع، ومستطيلٌ ممتلئ، وخطٌّ متقطّع، وصورة. ثم يُنفّذها الكانفس في
 * الويب وSkia في التطبيق تنفيذاً أعمى.
 *
 * وهذا هو الذي يجعل الورقتين واحدة: الحسابُ يقع مرّةً واحدة في مكانٍ
 * واحد، والمنفّذُ لا رأيَ له. ولو قرّر أحدُ المنفّذَين شيئاً من عنده --
 * هامشاً أو ارتفاعَ سطر -- لعادت الورقتان تفترقان من حيث لا يُرى.
 *
 * ولذلك الأوامرُ بدائيةٌ عمداً: لا "صندوق" ولا "شريطٌ مقلوب" ولا "نقاطٌ
 * موصِلة" -- هذه كلُّها تتفكّك في المحرّك إلى مستطيلاتٍ ونصوص. فما
 * يستطيع المنفّذُ أن يخطئ فيه أقلُّ ما يمكن.
 */

export type Align = 'left' | 'center' | 'right';
export type Dir = 'rtl' | 'ltr';
/** العربيةُ والعناوين بـsans، والأرقامُ والمبالغُ بـmono لتصطفّ خاناتُها. */
export type Family = 'sans' | 'mono';
/** الورقُ الحراريُّ لونان لا ثالث: محروقٌ أو لا. */
export type Ink = 'ink' | 'paper';

export interface TextOp {
  op: 'text';
  x: number;
  /** خطُّ الأساس الأوسط -- textBaseline='middle' في الكانفس. */
  y: number;
  text: string;
  size: number;
  weight: number;
  family: Family;
  align: Align;
  dir: Dir;
  color: Ink;
  /** تباعدُ الحروف بالنقاط؛ لا يُطبَّق على العربية فحروفُها متّصلة. */
  letterSpacing?: number;
}

/** مستطيلٌ ممتلئ. منه تُبنى الخطوطُ والحدودُ والأشرطةُ المقلوبة. */
export interface RectOp {
  op: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  color: Ink;
}

/**
 * خطٌّ متقطّع.
 *
 * ولا رماديَّ بديلاً عنه: اللوحةُ تُحوَّل إلى لونين قبل أن تبلغ الطابعة
 * (إضاءةٌ دون ١٦٠ حبر)، فخطٌّ رماديٌّ رفيع يُنعَّم إلى ١٩٥ فيظهر في
 * المعاينة ولا يُطبع أصلاً. التقطيعُ يحمل الخِفّةَ حيث لا يحملها اللون.
 */
export interface DashOp {
  op: 'dash';
  y: number;
  x1: number;
  x2: number;
  on: number;
  off: number;
  thickness: number;
}

export interface ImageOp {
  op: 'image';
  ref: 'logo' | 'qr';
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * شكلٌ مرسوم -- ما لا يُكتب حرفاً.
 *
 * والقلبُ مثالُه: «بالعافية عليكم» يتبعها قلبٌ على تذكرة المطبخ. وهو
 * مرسومٌ لا مكتوب لأنّ الإيموجي محرفٌ يحتاج خطاً ملوّناً لا تحمله
 * طابعةٌ حرارية، فيخرج مربّعاً فارغاً بيد الطبّاخ.
 *
 * وشكلٌ مسمّىً لا مسارُ منحنياتٍ عامّ: هو المنحنى الوحيد في النظام
 * كلِّه، ومسارٌ عامٌّ يُلزم كلَّ منفّذٍ بمحرّك مساراتٍ كامل لأجله.
 */
export interface GlyphOp {
  op: 'glyph';
  shape: 'heart';
  cx: number;
  cy: number;
  size: number;
}

export type DrawOp = TextOp | RectOp | DashOp | ImageOp | GlyphOp;

/**
 * قياسُ النصّ -- الشيءُ الوحيد الذي لا يستطيع المحرّكُ فعلَه بنفسه.
 *
 * عرضُ الكلمة لا يُعرف إلا من الخطّ نفسِه، والخطُّ عند المنفّذ. فيُمرَّر
 * القياسُ إلى المحرّك ويبقى الحسابُ كلُّه عنده -- وهذا أيضاً ما يجعل
 * الاختبارَ ممكناً بلا كانفسَ ولا Skia: يُمرَّر قياسٌ صوريٌّ ثابت.
 */
export type Measurer = (
  text: string,
  size: number,
  weight: number,
  family: Family,
) => number;

/** أبعادُ صورةٍ يعرفها المنفّذ ولا يعرفها المحرّك. */
export interface ImageSize {
  width: number;
  height: number;
}

export interface ReceiptItem {
  name: string;
  nameEn?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  mods?: string[] | null;
  note?: string | null;
}

/** بيانات الورقة. لا مقاسَ فيها -- المقاسُ كلُّه في tokens. */
export interface ReceiptModel {
  businessName?: string | null;
  showBusinessName?: boolean;
  tagline?: string | null;
  branchLabel?: string | null;
  branchName?: string | null;
  locationLine?: string | null;
  /** الرقمُ الضريبيّ: فاتورةٌ مبسّطة لا تصحّ بدونه (هيئة الزكاة). */
  vatNumber?: string | null;
  orderNumber: string;
  dateLabel: string;
  cashierName?: string | null;
  metaLabel?: string | null;
  /** في إشعار الاسترجاع: رقمُ الطلب الذي استُرجع منه. */
  refundOfOrder?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items: ReceiptItem[];
  orderNote?: string | null;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethodLabel: string;
  change: number;
  customMessage?: string | null;
}

export interface LayoutInput {
  receipt: ReceiptModel;
  measure: Measurer;
  /** عرضُ الورق بالنقاط: ٥٧٦ لثمانين ملّيمتراً، ٣٨٤ لثمانٍ وخمسين. */
  paperWidth: number;
  theme: string;
  /** رمزُ العملة كما يُطبع -- بالحروف، فرمزُ الريال الجديد ليس في خطّ الطابعة. */
  currency: string;
  logo?: ImageSize | null;
  qr?: ImageSize | null;
}

export interface LayoutResult {
  width: number;
  /** الارتفاعُ المحسوب بالضبط -- لا تقديرٌ سخيّ ثم قصّ. */
  height: number;
  ops: DrawOp[];
}
