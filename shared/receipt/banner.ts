/**
 * شريطُ الفاتورة الوطنيّ -- ميزةٌ مؤقّتة.
 *
 * يُطبع تحت شعارِ المطعم وتحت سطره التعريفيّ، فهو ضيفٌ على ورقتهم لا
 * بديلٌ عن هويّتهم: أوّلُ ما تقع عليه العينُ يبقى المطعمَ نفسَه.
 *
 * ويُشغَّل ويُطفأ من لوحة إدارة ركين (platform_settings مفتاحُه
 * receipt_banner) -- لا ببناءٍ جديدٍ ولا بتحديثٍ على الأجهزة. فحين تنتهي
 * المناسبةُ تُطفأ بزرّ، وتختفي من كلّ فاتورةٍ في كلّ مطعمٍ من الورقة
 * التالية.
 *
 * ونصٌّ لا صورة. والفرقُ ليس تفضيلاً:
 *   • الطباعةُ الحراريّةُ لونان لا ثالث، والصورةُ تُعاد عيّنتُها إلى
 *     ٢٠٣ نقطة/إنش فتتفتّت حوافُّ الحروف العربية -- والنصُّ يُرسم بخطٍّ
 *     حقيقيٍّ على المقاس نفسِه فيخرج حادّاً.
 *   • وصورةٌ بعرض الورقة تزن عشراتِ الكيلوبايتات وتُطيل الورقَ، والورقُ
 *     هو زمنُ الطباعة. والنصُّ لا يزن شيئاً يُذكر.
 *   • ويلتفُّ النصُّ على عرضِ ورقةِ ٥٨مم كما يلتفُّ على ٨٠مم، والصورةُ
 *     تُصغَّر فتصير غيرَ مقروءة.
 */

import type { LayoutContext } from './context';
import { BANNER, PAD, WEIGHT } from './tokens';

/** `none` ليست قيمةً تُخزَّن، إنّما غيابُ الشريط. */
export type BannerKind = 'none' | 'shield' | 'plain' | 'invert';

export const BANNER_KINDS: readonly BannerKind[] = ['none', 'shield', 'plain', 'invert'] as const;

export function isBannerKind(v: unknown): v is BannerKind {
  return typeof v === 'string' && (BANNER_KINDS as readonly string[]).includes(v);
}

/** نصُّ كلِّ تصميم في مكانٍ واحد، فلا يُعدَّل في العميلين. */
const COPY = {
  shield: {
    head: 'السعودية خط أحمر',
    sub: 'تذكّر شكلها فلا تنسى',
  },
  speech: {
    head: 'بالغوا بالدفاع عن وطنكم',
    body: 'فالوطن عقيدة وكرامة وعزة لا تساوم، ولا تسمحوا لحاقد أو خائن أن ينال من أمنكم أو يشكّك في ولائكم',
    tail: 'فالأوطان لا تحيا إلا بأبنائها',
  },
} as const;

/**
 * يرسم الشريطَ على السياق، ويُعيد `true` إن رسم شيئاً.
 *
 * والمقاساتُ لا تُضرب في كثافةِ القالب: الشريطُ واحدٌ في كلِّ المطاعم،
 * فلا يصير في «الفخم» أكبرَ منه في «المضغوط».
 */
export function drawBanner(ctx: LayoutContext, kind: BannerKind): boolean {
  if (kind === 'none') return false;
  ctx.y += ctx.gap(BANNER.before);
  if (kind === 'shield') drawShield(ctx);
  else if (kind === 'invert') drawInvert(ctx);
  else drawPlain(ctx);
  ctx.y += ctx.gap(BANNER.after);
  return true;
}

/** ١: سطرٌ قويٌّ داخل إطار -- أقصرُ الثلاثة ورقاً. */
function drawShield(ctx: LayoutContext): void {
  const headSz = BANNER.headSize;
  const subSz = BANNER.subSize;
  const padIn = Math.round(ctx.line * BANNER.framePad);
  const boxW = ctx.contentWidth;
  const boxX = PAD;
  const inner = padIn + headSz + Math.round(ctx.line * BANNER.lineGap) + subSz + padIn;
  const top = ctx.y;

  ctx.box(boxX, top, boxW, inner, BANNER.frame);
  ctx.text(COPY.shield.head, ctx.width / 2, headSz, WEIGHT.bold, 'sans', 'center', 'rtl',
    { at: top + padIn + headSz * BANNER.baseline });
  ctx.text(COPY.shield.sub, ctx.width / 2, subSz, WEIGHT.regular, 'sans', 'center', 'rtl',
    { at: top + padIn + headSz + Math.round(ctx.line * BANNER.lineGap) + subSz * BANNER.baseline });
  ctx.y = top + inner;
}

/** ٢: بلا خلفيّة -- حبرٌ على ورق، وهو أخفُّ الثلاثة على الرأس الحراريّ. */
function drawPlain(ctx: LayoutContext): void {
  ctx.centerText(COPY.speech.head, BANNER.headSize, true);
  ctx.y += ctx.gap(BANNER.lineGap);
  for (const line of ctx.wrap(COPY.speech.body, BANNER.bodySize, WEIGHT.regular, 'sans', ctx.contentWidth)) {
    ctx.centerText(line, BANNER.bodySize, false);
  }
  ctx.y += ctx.gap(BANNER.lineGap);
  ctx.centerText(COPY.speech.tail, BANNER.tailSize, true);
}

/**
 * ٣: كتلةٌ سوداءُ ونصٌّ أبيض.
 *
 * والأسطرُ تُقاس أوّلاً ثم تُرسم الكتلةُ بمقاسها ثم يُكتب فوقها: لو
 * رُسمت الكتلةُ بتقديرٍ ثم طال النصُّ لخرج الأبيضُ على الورق الأبيض --
 * أي سطرٌ غائبٌ تماماً، لا سطرٌ مزدحم.
 *
 * ولا تُسمَّك حروفُه عند «تغميق الطباعة»: التسميكُ يملأ الفراغَ حول
 * الحرف، والحرفُ هنا هو الفراغ. (receiptRenderer يحمي كلَّ مستطيلٍ
 * ممتلئٍ كبير -- protectRectsOf.)
 */
function drawInvert(ctx: LayoutContext): void {
  const headSz = BANNER.headSize;
  const bodySz = BANNER.bodySize;
  const tailSz = BANNER.tailSize;
  const padIn = Math.round(ctx.line * BANNER.blockPad);
  const step = Math.round(ctx.line * BANNER.lineGap);

  const body = ctx.wrap(COPY.speech.body, bodySz, WEIGHT.regular, 'sans', ctx.contentWidth - padIn * 2);
  const bodyStep = Math.round(bodySz * BANNER.bodyLeading);
  const height = padIn + headSz + step + body.length * bodyStep + step + tailSz + padIn;

  const top = ctx.y;
  ctx.rect(PAD * BANNER.blockInset, top, ctx.width - PAD * BANNER.blockInset * 2, height, 'ink');

  let at = top + padIn + headSz * BANNER.baseline;
  ctx.text(COPY.speech.head, ctx.width / 2, headSz, WEIGHT.bold, 'sans', 'center', 'rtl', { color: 'paper', at });
  at += headSz * (1 - BANNER.baseline) + step + bodySz * BANNER.baseline;
  for (const line of body) {
    ctx.text(line, ctx.width / 2, bodySz, WEIGHT.regular, 'sans', 'center', 'rtl', { color: 'paper', at });
    at += bodyStep;
  }
  at += step - bodyStep + bodySz * (1 - BANNER.baseline) + tailSz * BANNER.baseline;
  ctx.text(COPY.speech.tail, ctx.width / 2, tailSz, WEIGHT.bold, 'sans', 'center', 'rtl', { color: 'paper', at });

  ctx.y = top + height;
}
