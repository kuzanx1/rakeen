/**
 * مدخلُ محرّك الطباعة.
 *
 * التطبيقُ يستورد من هنا مباشرةً. والويبُ لا يستطيع -- ملفُّ الكاشير
 * يُقدَّم نصّاً خاماً بلا حزم -- فيُبنى له من هذا المدخل نفسِه ملفٌّ
 * واحد بـ`npm run receipt:build`، ويحرس طزاجتَه اختبار.
 *
 * فالمصدرُ واحدٌ يُكتب، والمخرجاتُ تُولَّد.
 */

export { layoutReceipt, bi } from './layout';
export {
  PAPER, PAD, LINE, TYPE, WEIGHT, SPACE, BORDER, DASH, COLUMNS,
  ORDER_BOX, TOTAL_BOX, LOGO, INVERT_BAR, TRACKING, QR_MAX,
  THEMES, themeTokens, dotsFromCss, dotsFromMm,
  PRINTER_DPI, CSS_DPI, DEFAULT_PAPER_WIDTH,
} from './tokens';
export type { ReceiptThemeTokens } from './tokens';
export type {
  Align, Dir, Family, Ink, DrawOp, TextOp, RectOp, DashOp, ImageOp,
  Measurer, ImageSize, ReceiptItem, ReceiptModel, LayoutInput, LayoutResult,
} from './types';
export { stubMeasure } from './stubMeasure';
