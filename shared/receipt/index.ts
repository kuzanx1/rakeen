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
export { layoutKitchenTicket } from './kitchenLayout';
export { layoutShiftReport } from './shiftLayout';
export type { KitchenTicketModel, KitchenLayoutInput } from './kitchenLayout';
export type { ShiftReportModel, ShiftLayoutInput } from './shiftLayout';
export { createContext, leaderDots } from './context';
export type { LayoutContext } from './context';
export {
  PAPER, PAD, LINE, TYPE, WEIGHT, SPACE, BORDER, DASH, COLUMNS,
  ORDER_BOX, TOTAL_BOX, LOGO, INVERT_BAR, TRACKING, QR_MAX,
  KITCHEN, KITCHEN_SPACE, SHIFT, SHIFT_SPACE, HEART, LARGE_TYPE_ABOVE,
  THEMES, themeTokens, dotsFromCss, dotsFromMm,
  PRINTER_DPI, CSS_DPI, DEFAULT_PAPER_WIDTH,
} from './tokens';
export type { ReceiptThemeTokens } from './tokens';
export type {
  Align, Dir, Family, Ink, DrawOp, TextOp, RectOp, DashOp, ImageOp, GlyphOp,
  Measurer, ImageSize, ReceiptItem, ReceiptModel, LayoutInput, LayoutResult,
} from './types';
export { stubMeasure } from './stubMeasure';
/* والحالاتُ المرجعيةُ ليست هنا قصداً (`./scenarios`).
   هي بياناتُ فحصٍ لا شيفرةُ طباعة، ولو صُدِّرت من المدخل لَحُزمت مع
   محرّك الويب وشُحنت إلى كلّ جهاز كاشير -- ستةُ كيلوبايتاتٍ من طلباتٍ
   وهمية على جهازٍ يُقلع في مطعم. فمن أرادها استوردها بنفسها. */
