/**
 * تقريرُ إغلاق الوردية -- تخطيطاً واحداً للويب والتطبيق.
 *
 * لا أصنافَ فيه ولا أعمدة: صفوفٌ من رقمٍ ووصفه. وترتيبُه من مراجع
 * التسوية المحاسبية لا من عادةٍ عندنا -- مبيعاتٌ ثمّ طرقُ دفعٍ ثمّ
 * صندوقٌ ثمّ توقيع، وكلُّ قسمٍ ينتهي بسطرٍ يُنقل إلى الذي بعده حتى
 * يستطيع المدقّقُ أن يتتبّع الرقمَ بيده.
 */

import { createContext } from './context';
import { BORDER, PAD, SHIFT, SHIFT_SPACE, TOTAL_BOX } from './tokens';
import type { LayoutResult, Measurer } from './types';

export interface ShiftReportModel {
  businessName?: string | null;
  branchName?: string | null;
  dateLabel: string;
  staffName: string;
  shiftStart?: string | null;

  grossSales: number;
  discountsTotal: number;
  refundsTotal: number;
  refundsCount: number;
  vatTotal: number;
  netSales: number;

  cashSales: number;
  cardTotal: number;
  deliveryPlatformTotal: number;
  onlineTotal: number;
  /** الدفعُ الإلكترونيّ لا يظهر إلّا لمن فعّله: صفٌّ بصفرٍ دائماً على
   *  مطعمٍ لا يبيع أونلاين ضجيجٌ في ورقةٍ تُدقَّق. */
  onlinePaymentsEnabled?: boolean;

  openingCash: number;
  cashExpected: number;
  cashCounted: number;
  cashVariance: number;

  ordersCount: number;
  avgTicket: number;

  /** ما يُخفيه صاحبُ المطعم من أقسام. الغيابُ يعني الإظهار. */
  options?: Record<string, boolean> | null;
}

export interface ShiftLayoutInput {
  report: ShiftReportModel;
  measure: Measurer;
  paperWidth: number;
  currency: string;
}

export function layoutShiftReport(input: ShiftLayoutInput): LayoutResult {
  const { report, measure, paperWidth: width, currency } = input;
  const ctx = createContext({ width, line: SHIFT.line, measure });
  const opt = report.options || {};
  const on = (k: string): boolean => opt[k] !== false;
  const money = (n: number): string => n.toFixed(2) + ' ' + currency;

  ctx.centerText(report.businessName || 'ركين', SHIFT.businessName, true);
  if (report.branchName) ctx.centerText(report.branchName, SHIFT.branch, false);
  ctx.y += ctx.gap(SHIFT_SPACE.beforeTitle);
  ctx.centerText('تقرير إغلاق الوردية', SHIFT.title, true);
  ctx.centerText('Shift Close Report', SHIFT.titleEn, false);
  ctx.centerText(report.dateLabel, SHIFT.date, false);
  ctx.rule(SHIFT_SPACE.afterRule);

  ctx.rowText('', 'الكاشير · Cashier: ' + report.staffName, SHIFT.meta, false);
  if (report.shiftStart) ctx.rowText('', 'من · From: ' + report.shiftStart, SHIFT.metaSmall, false);
  ctx.rule(SHIFT_SPACE.afterRule);

  // ١) المبيعات: من الإجمالي إلى الصافي، خطوةً خطوة.
  ctx.centerText('المبيعات · Sales', SHIFT.sectionLabel, true);
  ctx.rowText(money(report.grossSales), 'إجمالي المبيعات · Gross', SHIFT.row, false);
  if (on('discounts')) ctx.rowText('-' + money(report.discountsTotal), 'الخصومات · Discounts', SHIFT.row, false);
  if (on('refunds')) ctx.rowText('-' + money(report.refundsTotal), 'المرتجعات · Refunds (' + report.refundsCount + ')', SHIFT.row, false);
  if (on('vat')) ctx.rowText(money(report.vatTotal), 'ضريبة القيمة المضافة · VAT', SHIFT.row, false);
  ctx.rowText(money(report.netSales), 'صافي المبيعات · Net', SHIFT.net, true);
  ctx.rule(SHIFT_SPACE.afterRule);

  // ٢) طرقُ الدفع، مرتّبةً بالأهمية لا بالأبجدية.
  ctx.centerText('طرق الدفع · Payments', SHIFT.sectionLabel, true);
  ctx.rowText(money(report.cashSales), 'كاش · Cash', SHIFT.row, false);
  ctx.rowText(money(report.cardTotal), 'شبكة · Card', SHIFT.row, false);
  ctx.rowText(money(report.deliveryPlatformTotal), 'تطبيقات توصيل · Delivery Apps', SHIFT.row, false);
  if (report.onlinePaymentsEnabled) ctx.rowText(money(report.onlineTotal), 'دفع إلكتروني · Online', SHIFT.row, false);
  ctx.rule(SHIFT_SPACE.afterRule);

  // ٣) الصندوق: المعادلةُ كاملة، فما من رقمٍ يظهر بلا أصل.
  ctx.centerText('الصندوق · Cash Drawer', SHIFT.sectionLabel, true);
  ctx.rowText(money(report.openingCash), 'الرصيد الافتتاحي · Opening float', SHIFT.row, false);
  ctx.rowText('+' + money(report.cashSales), 'مبيعات الكاش · Cash sales', SHIFT.row, false);
  // السحبُ يُذكر ولو كان صفراً حين تُطبع المرتجعات: معادلةُ الصندوق لا
  // تُقرأ إن غاب أحدُ طرفيها، ومن يجمع بيده يريد أن يجد كلَّ رقم.
  if (report.refundsTotal > 0) ctx.rowText('-' + money(report.refundsTotal), 'مرتجعات كاش · Refunds paid', SHIFT.row, false);
  ctx.rowText(money(report.cashExpected), 'المتوقع في الدرج · Expected', SHIFT.row, true);
  ctx.rowText(money(report.cashCounted), 'المعدود · Counted', SHIFT.row, false);

  const vTop = ctx.y - ctx.line * TOTAL_BOX.liftY;
  ctx.rowText((report.cashVariance >= 0 ? '+' : '') + money(report.cashVariance), 'الفرق · Variance', SHIFT.variance, true);
  // الفرقُ داخل إطار: هو السطرُ الوحيد الذي يُفتح عليه تحقيق.
  ctx.box(
    PAD * TOTAL_BOX.inset,
    vTop,
    width - PAD * TOTAL_BOX.inset * 2,
    ctx.y - ctx.line * TOTAL_BOX.dropY - vTop,
    BORDER.totalBox,
  );
  ctx.y += ctx.gap(SHIFT_SPACE.afterVariance);

  if (on('counts')) {
    ctx.rule(SHIFT_SPACE.afterRule);
    ctx.rowText(String(report.ordersCount), 'عدد الطلبات · Orders', SHIFT.counts, false);
    ctx.rowText(money(report.avgTicket), 'متوسط الفاتورة · Avg ticket', SHIFT.counts, false);
  }

  if (on('signatures')) {
    ctx.rule(SHIFT_SPACE.afterRule);
    ctx.y += ctx.gap(SHIFT_SPACE.aroundSignature);
    ctx.rowText('', 'توقيع الكاشير · Cashier  ______________', SHIFT.signature, false);
    ctx.y += ctx.gap(SHIFT_SPACE.aroundSignature);
    ctx.rowText('', 'توقيع المدير · Manager   ______________', SHIFT.signature, false);
  }
  ctx.y += PAD;

  return { width, height: Math.ceil(ctx.y), ops: ctx.ops };
}
