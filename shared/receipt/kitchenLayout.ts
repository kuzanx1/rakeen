/**
 * تذكرةُ المطبخ -- تخطيطاً واحداً للويب والتطبيق.
 *
 * ورقةٌ أخرى لا فاتورةٌ مختصرة: أصنافٌ وكمياتٌ وإضافاتٌ وملاحظات، ولا
 * مالَ فيها البتّة. تُقرأ بسرعةٍ فوق طاولةٍ حارّة، فخطُّها أكبرُ من
 * خطّ الفاتورة وسطرُها أوسع.
 *
 * ولا قالبَ لها: قوالبُ الفاتورة زينةٌ للزبون، والمطبخُ يريد أن يقرأ.
 */

import { createContext } from './context';
import { KITCHEN, KITCHEN_SPACE, PAD, WEIGHT } from './tokens';
import type { ImageSize, LayoutResult, Measurer, ReceiptItem } from './types';

export interface KitchenTicketModel {
  branchName?: string | null;
  dateLabel: string;
  metaLabel: string;
  orderNumber?: string | null;
  /** رقمُ جهاز النداء إن وُجد -- يحلّ محلّ رقم الطلب ولا يجتمعان. */
  pagerNumber?: number | string | null;
  cashierName?: string | null;
  items: ReceiptItem[];
}

export interface KitchenLayoutInput {
  ticket: KitchenTicketModel;
  measure: Measurer;
  paperWidth: number;
  logo?: ImageSize | null;
}

export function layoutKitchenTicket(input: KitchenLayoutInput): LayoutResult {
  const { ticket, measure, paperWidth: width, logo } = input;
  const ctx = createContext({ width, line: KITCHEN.line, measure });

  // الشعارُ يتصدّرها، و«KITCHEN RECEIPT» تحته بدل «طلب مطبخ»: الورقةُ
  // تُعرف من شكلها قبل أن تُقرأ.
  if (logo) {
    const lw = Math.round(width * KITCHEN.logoWidth);
    const lh = Math.round(lw * (logo.height / logo.width));
    ctx.ops.push({ op: 'image', ref: 'logo', x: (width - lw) / 2, y: ctx.y, w: lw, h: lh });
    ctx.y += lh + ctx.line * KITCHEN_SPACE.afterLogo;
  }
  ctx.centerText('KITCHEN RECEIPT', logo ? KITCHEN.titleWithLogo : KITCHEN.titleAlone, true);
  if (ticket.branchName) ctx.centerText(ticket.branchName, KITCHEN.branch, false);
  ctx.centerText(ticket.dateLabel, KITCHEN.date, false);
  ctx.centerText(ticket.metaLabel, KITCHEN.meta, true);

  // الرقمُ الذي يُنادى به. ولا يجتمعان -- رقمان كبيران متجاوران يجعلان
  // من يقرؤهما عبر مطبخٍ حارّ يتردّد أيَّهما ينادي.
  ctx.y += ctx.gap(KITCHEN_SPACE.beforeCall);
  if (ticket.pagerNumber != null && ticket.pagerNumber !== '') {
    ctx.centerText('جهاز النداء · Pager', KITCHEN.callLabel, false);
    ctx.centerText(String(ticket.pagerNumber), KITCHEN.pagerNumber, true);
  } else {
    ctx.centerText('رقم الطلب · Order No', KITCHEN.callLabel, false);
    ctx.centerText(ticket.orderNumber || '—', KITCHEN.orderNumber, true);
  }
  ctx.rule(KITCHEN_SPACE.afterRule);

  const subRight = width - PAD - KITCHEN.subIndent;
  for (const it of ticket.items) {
    const name = it.nameEn ? it.name + ' | ' + it.nameEn : it.name;
    ctx.wrap(it.qty + 'x ' + name, KITCHEN.item, WEIGHT.bold, 'sans', ctx.contentWidth)
      .forEach(l => {
        ctx.text(l, width - PAD, KITCHEN.item, WEIGHT.bold, 'sans', 'right', 'rtl');
        ctx.y += ctx.gap(KITCHEN_SPACE.itemLine);
      });
    // الإضافاتُ مزاحةٌ عن حافّة الاسم، فتُقرأ تابعةً له لا صنفاً آخر.
    for (const m of it.mods || []) {
      ctx.wrap('— ' + m, KITCHEN.sub, WEIGHT.regular, 'sans', ctx.contentWidth - KITCHEN.subIndent)
        .forEach(l => {
          ctx.text(l, subRight, KITCHEN.sub, WEIGHT.regular, 'sans', 'right', 'rtl');
          ctx.y += ctx.gap(KITCHEN_SPACE.subLine);
        });
    }
    if (it.note) {
      ctx.wrap('ملاحظات: ' + it.note, KITCHEN.sub, WEIGHT.medium, 'sans', ctx.contentWidth - KITCHEN.subIndent)
        .forEach(l => {
          ctx.text(l, subRight, KITCHEN.sub, WEIGHT.medium, 'sans', 'right', 'rtl');
          ctx.y += ctx.gap(KITCHEN_SPACE.subLine);
        });
    }
    ctx.y += ctx.gap(KITCHEN_SPACE.afterItem);
  }
  ctx.rule(KITCHEN_SPACE.afterRule);
  ctx.y += ctx.gap(KITCHEN_SPACE.beforeBy);

  if (ticket.cashierName) ctx.centerText('طبعها · By: ' + ticket.cashierName, KITCHEN.by, false);

  /**
   * «بالعافية عليكم»، وقلبٌ مرسومٌ بجانبها.
   *
   * مرسومٌ لا مكتوب: الإيموجي محرفٌ يحتاج خطاً ملوّناً لا تحمله طابعةٌ
   * حرارية، فيخرج مربّعاً فارغاً. والمنحنى يُطبع على أيّ جهازٍ لأنّه
   * نقاطٌ لا حروف.
   */
  ctx.y += ctx.gap(KITCHEN_SPACE.beforeBlessing);
  const blessing = 'بالعافية عليكم';
  const bSize = KITCHEN.blessing;
  const heart = bSize * KITCHEN.heartSize;
  const gapX = bSize * KITCHEN.heartGap;
  const bw = measure(blessing, bSize, WEIGHT.bold, 'sans');
  const startX = (width - (bw + gapX + heart)) / 2;
  ctx.text(blessing, startX + heart + gapX + bw, bSize, WEIGHT.bold, 'sans', 'right', 'rtl');
  ctx.heart(startX + heart / 2, ctx.y, heart);
  ctx.y += ctx.gap(KITCHEN_SPACE.afterBlessing) + PAD;

  return { width, height: Math.ceil(ctx.y), ops: ctx.ops };
}
