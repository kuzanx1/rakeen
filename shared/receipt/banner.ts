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
 * ── مرسومٌ لا مكتوبٌ بخطّ النصّ ──
 * أوّلُ نسخةٍ من هذا الملفّ كتبت الشريطَ بخطّ الفاتورة نفسِه وبمقاسٍ
 * دونَ اسمِ المنشأة، على أنّ الصورةَ خطرٌ والنصَّ أسلم. وكان التعليلُ
 * نصفَ صحيح، ونصفُه الخطأ هو الذي أخرج ورقةً باهتة:
 *
 *   • أنّ «الصورة تزن عشراتِ الكيلوبايتات» خطأٌ في هذا المحرّك: الفاتورةُ
 *     كلُّها تُرسم لوحةً ثمّ تُحوَّل إلى لونين ثمّ تُرسل راستراً. فالورقةُ
 *     صورةٌ أصلاً، ووزنُها دالّةُ ارتفاعِها وحدَه -- لا فرقَ بايتاً واحداً
 *     بين مِلّيمترِ نصٍّ ومِلّيمترِ رسم.
 *   • وأنّ «الصورةَ تتفتّت» صحيحٌ لصورةٍ رماديّةٍ تُعاد عيّنتُها، وباطلٌ
 *     لما يُرسم على مقاسِ الطابعة بذاته: المثلّثُ المبنيُّ من صفوفِ نقاطٍ
 *     حوافُّه نقاطٌ، فلا شيءَ فيه يُنعَّم ولا شيءَ يسقط عند التحويل.
 *
 * فالفخامةُ هنا من ثلاثةٍ، كلُّها مرسومةٌ على مقاس ٢٠٣ نقطة/إنش:
 *   ١) خطُّ عرضٍ حقيقيّ (`'display'` -- Thmanyah Serif Display Black)،
 *      لا خطُّ النصّ مُغمَّقاً.
 *   ٢) مقاسٌ من عرضِ الورقة لا من بقيّة الأسطر: `fitSize` يُنزل الحجمَ
 *      حتّى يستوي السطرُ في العرض، فيخرج بأربعين نقطةً ونيّف.
 *   ٣) زخرفةٌ هندسيّةٌ من أصلها (`saduBand`, `diamondRule`) -- شريطُ سدو
 *      مبنيٌّ نقطةً نقطة. وهي زخرفتُنا: لم تُنقل رسمةُ أحد.
 *
 * ويبقى من التعليل الأوّل ما هو صحيحٌ ولم يُنقض: النصُّ يلتفّ ويضيق،
 * فالشريطُ يخرج تامّاً على ٥٨مم كما يخرج على ٨٠مم، والصورةُ الجاهزةُ
 * كانت ستُصغَّر إلى الثلثين فتُقرأ بالكاد. ولا صورةَ هنا، إنّما مقاسٌ
 * يُحسب لكلّ عرضٍ على حدة.
 */

import type { LayoutContext } from './context';
import { APACHE } from './art';
import type { Art } from './art';
import { BANNER, PAD, WEIGHT } from './tokens';
import type { Ink } from './types';

/** `none` ليست قيمةً تُخزَّن، إنّما غيابُ الشريط. */
export type BannerKind = 'none' | 'shield' | 'plain' | 'invert';

export const BANNER_KINDS: readonly BannerKind[] = ['none', 'shield', 'plain', 'invert'] as const;

export function isBannerKind(v: unknown): v is BannerKind {
  return typeof v === 'string' && (BANNER_KINDS as readonly string[]).includes(v);
}

/**
 * نصُّ كلِّ تصميم في مكانٍ واحد، فلا يُعدَّل في العميلين.
 *
 * وخطُّ العرضِ محزومٌ مُجزَّأً على هذه المحارفِ وحدَها، فحرفٌ يُزاد هنا
 * ولا يُزاد في الخطّ يخرج مربّعاً فارغاً على الورق. يحرسه
 * tools/accounting-checks/receipt-banner.cjs -- يقرأ cmap الملفّ
 * ويقابله بهذا الكائن محرفاً محرفاً، ويمنع النشرَ إن نقص واحد.
 */
export const BANNER_COPY = {
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

/* ───────────────────────── أدواتُ الرسم ───────────────────────── */

/**
 * أكبرُ حجمٍ يستوي فيه السطرُ في العرض المتاح، نزولاً من السقف.
 *
 * وهو ما يجعل السطرَ الكبيرَ كبيراً فعلاً: مقاسٌ ثابتٌ يُختار ليسلم على
 * ٥٨مم يخرج صغيراً على ٨٠مم، ومقاسٌ يُختار ليفخم على ٨٠مم يُقصّ على
 * ٥٨مم. فيُقاس النصُّ ويُنزل الحجمُ حتّى يسلم -- في العرضين، ومهما
 * تبدّل النصّ.
 */
function fitSize(ctx: LayoutContext, text: string, max: number, weight: number, maxW: number): number {
  /* ويُترك هامشٌ صغير: القياسُ عرضُ المحارف، والحرفُ العربيّ قد يمدّ
     طرفَه خارجَ عرضه المقيس بنقطةٍ أو نقطتين -- فسطرٌ «يسَعُ تماماً»
     يلامس الحافّة، وعلى ٥٨مم يُقصّ طرفُه. */
  const room = maxW - BANNER.fitInset;
  let size = max;
  while (size > 12 && ctx.measure(text, size, weight, 'display') > room) size -= 1;
  return size;
}

/** سطرٌ وسطيٌّ بخطّ العرض. يُعيد ارتفاعَ صندوقه. */
function displayLine(
  ctx: LayoutContext, text: string, size: number, weight: number, top: number, color: Ink,
): number {
  const box = Math.round(size * BANNER.lineBox);
  ctx.text(text, ctx.width / 2, size, weight, 'display', 'center', 'rtl', { color, at: top + box / 2 });
  return box;
}

/**
 * شريطُ سدو: صفُّ مثلّثاتٍ واقفةٍ على خطّ.
 *
 * والمثلّثُ صفوفُ مستطيلاتٍ بعرضٍ متزايد، كلُّ صفٍّ نقطةً واحدة -- فحدُّه
 * المائلُ درجاتٌ من نقاط، وهو أحدُّ ما تطبعه طابعةٌ حرارية. ولو رُسم
 * مساراً مائلاً لَنُعِّمت حافّتُه رماديّاً ثمّ سقط الرماديُّ عند التحويل
 * إلى لونين، فخرج المثلّثُ مُشرَّشَ الحدّ.
 *
 * `down` يقلبه ليصير الخطُّ فوقَه والمثلّثاتُ معلَّقةً منه، فيُؤطَّر
 * النصُّ من فوقَ ومن تحتَ بشريطَين متناظرَين.
 */
function saduBand(ctx: LayoutContext, x: number, y: number, w: number, color: Ink, down: boolean): number {
  const u = BANNER.saduUnit;
  const rule = BANNER.saduRule;
  const base = u * 2;
  const n = Math.floor(w / base);
  if (n < 2) return 0;
  const lead = x + Math.round((w - n * base) / 2);

  const ruleY = down ? y : y + u;
  ctx.rect(x, ruleY, w, rule, color);

  for (let t = 0; t < n; t += 1) {
    const cx = lead + t * base + u;
    for (let row = 0; row < u; row += 1) {
      /* الأعلى يقف على خطّه فيتّسع نزولاً، والأسفلُ يتدلّى من خطّه
         فيضيق نزولاً -- فيتناظر الشريطان حول النصّ لا يتكرّران. */
      const half = down ? u - row : row + 1;
      const rowY = down ? y + rule + row : y + row;
      ctx.rect(cx - half, rowY, half * 2, 1, color);
    }
  }
  return u + rule;
}

/**
 * رسمةٌ من بِتّاتها -- مستطيلاتٌ بعرض مقاطعها السوداء.
 *
 * ولا صورةَ تُحمَّل ولا عمليةَ رسمٍ جديدة: المقاطعُ تصير `rect` كغيرها،
 * فما يعرف أن يرسم فاتورةً يعرف أن يرسم هذه. وقد حُوّلت إلى لونين في
 * الأداة لا هنا (tools/receipt-art/build.mjs)، فتخرج على ورقة التطبيق
 * كما تخرج على ورقة الويب -- نقطةً نقطة، بلا عتبةٍ تختلف بين منفّذٍ
 * وآخر.
 */
function drawArt(ctx: LayoutContext, art: Art, x: number, y: number, color: Ink): void {
  const rows = art.runs.split(';');
  let prev = '';
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r] === '-' ? prev : rows[r];
    prev = row;
    let at = 0;
    let ink = false;
    for (const part of row.split(',')) {
      const n = parseInt(part, 36);
      if (!(n >= 0)) continue;
      if (ink && n > 0) ctx.rect(x + at, y + r, n, 1, color);
      at += n;
      ink = !ink;
    }
  }
}

/** فاصلٌ بين السطرين: خطٌّ رفيعٌ تتوسّطه ماسة. يُعيد ارتفاعَه. */
function diamondRule(ctx: LayoutContext, x: number, y: number, w: number, color: Ink): number {
  const k = BANNER.diamond;
  const h = k * 2 + 1;
  const cy = y + k;
  const cx = x + w / 2;
  const stop = k + BANNER.dividerGap;

  const leftW = Math.round(cx - stop - x);
  if (leftW > 0) ctx.rect(x, cy, leftW, BANNER.dividerRule, color);
  const rightX = Math.round(cx + stop);
  const rightW = x + w - rightX;
  if (rightW > 0) ctx.rect(rightX, cy, rightW, BANNER.dividerRule, color);

  for (let i = -k; i <= k; i += 1) {
    const half = k - Math.abs(i);
    ctx.rect(Math.round(cx - half), cy + i, half * 2 + 1, 1, color);
  }
  return h;
}

/* ───────────────────────── التصاميمُ الثلاثة ───────────────────────── */

/**
 * ١: إطارٌ مزدوجٌ ورسمةٌ وسطرٌ كبير.
 *
 * والإطارُ خطّان لا خطّ: سميكٌ خارجاً ورفيعٌ داخلاً بفراغٍ بينهما -- وهو
 * ما يفصل «محاطٌ بخطّ» عن «مُؤطَّر». والفرقُ ثلاثُ نقاطٍ من ورق.
 *
 * والرسمةُ فوق السطر لا بجانبه: صورةُ ظلٍّ تُقرأ لحظةً قبل أن يُقرأ
 * الحرف، فهي المدخلُ لا الحاشية. وهي أغلى ما في التصاميم ورقاً --
 * خمسةٌ وعشرون مِلّيمتراً وحدَها -- ولذلك لم تدخل الثلاثةَ كلَّها.
 */
function drawShield(ctx: LayoutContext): void {
  const pad = Math.round(ctx.line * BANNER.framePad);
  const frameW = BANNER.frame + BANNER.frameGap + BANNER.frameInner;
  const boxW = ctx.contentWidth;
  const boxX = PAD;
  const innerW = boxW - (frameW + pad) * 2;

  const headSz = fitSize(ctx, BANNER_COPY.shield.head, BANNER.headSize, WEIGHT.bold, innerW);
  const subSz = fitSize(ctx, BANNER_COPY.shield.sub, BANNER.subSize, WEIGHT.regular, innerW);
  const headBox = Math.round(headSz * BANNER.lineBox);
  const subBox = Math.round(subSz * BANNER.lineBox);
  const divH = BANNER.diamond * 2 + 1;
  const gap = Math.round(ctx.line * BANNER.lineGap);
  /* ولا تتجاوز الرسمةُ عرضَ ما بداخل الإطار: على ورق ٥٨مم تضيق
     المساحةُ فتُقصّ الريشُ من طرفيه -- وطائرةٌ مقصوصةُ الريش أسوأُ
     من لا طائرة. ولا تُكبَّر فوق مقاسها المولَّد. */
  const artW = Math.min(APACHE.w, innerW);
  const artH = artW === APACHE.w ? APACHE.h : Math.round((APACHE.h * artW) / APACHE.w);

  const height = (frameW + pad) * 2 + artH + gap + headBox + gap + divH + gap + subBox;
  const top = ctx.y;

  ctx.box(boxX, top, boxW, height, BANNER.frame);
  const inX = boxX + BANNER.frame + BANNER.frameGap;
  const inY = top + BANNER.frame + BANNER.frameGap;
  ctx.box(inX, inY, boxW - (BANNER.frame + BANNER.frameGap) * 2,
    height - (BANNER.frame + BANNER.frameGap) * 2, BANNER.frameInner);

  let at = top + frameW + pad;
  drawArt(ctx, APACHE, Math.round(ctx.width / 2 - artW / 2), at, 'ink');
  at += artH + gap;
  at += displayLine(ctx, BANNER_COPY.shield.head, headSz, WEIGHT.bold, at, 'ink');
  at += gap;
  at += diamondRule(ctx, boxX + frameW + pad, at, innerW, 'ink');
  at += gap;
  displayLine(ctx, BANNER_COPY.shield.sub, subSz, WEIGHT.regular, at, 'ink');

  ctx.y = top + height;
}

/** ٢: بلا خلفيّة -- حبرٌ على ورق، بين شريطَي سدو. */
function drawPlain(ctx: LayoutContext): void {
  const w = ctx.contentWidth;
  const x = PAD;
  const headSz = fitSize(ctx, BANNER_COPY.speech.head, BANNER.headSize, WEIGHT.bold, w);
  const tailSz = fitSize(ctx, BANNER_COPY.speech.tail, BANNER.tailSize, WEIGHT.bold, w);
  const gap = Math.round(ctx.line * BANNER.lineGap);
  const saduGap = Math.round(ctx.line * BANNER.saduGap);

  let at = ctx.y;
  at += saduBand(ctx, x, at, w, 'ink', false) + saduGap;
  at += displayLine(ctx, BANNER_COPY.speech.head, headSz, WEIGHT.bold, at, 'ink') + gap;
  for (const line of ctx.wrap(BANNER_COPY.speech.body, BANNER.bodySize, WEIGHT.regular, 'display', w)) {
    at += displayLine(ctx, line, BANNER.bodySize, WEIGHT.regular, at, 'ink');
  }
  at += gap;
  at += diamondRule(ctx, x, at, w, 'ink') + gap;
  at += displayLine(ctx, BANNER_COPY.speech.tail, tailSz, WEIGHT.bold, at, 'ink') + saduGap;
  at += saduBand(ctx, x, at, w, 'ink', true);
  ctx.y = at;
}

/**
 * ٣: كتلةٌ سوداءُ ونصٌّ أبيض.
 *
 * والأسطرُ تُقاس أوّلاً ثم تُرسم الكتلةُ بمقاسها ثم يُكتب فوقها: لو
 * رُسمت الكتلةُ بتقديرٍ ثم طال النصُّ لخرج الأبيضُ على الورق الأبيض --
 * أي سطرٌ غائبٌ تماماً، لا سطرٌ مزدحم. وكلُّ الارتفاعاتِ تُحسب بـlineBox
 * نفسِه الذي يُوضع به مركزُ السطر، فلا يفترق المقيسُ عن المرسوم.
 *
 * ولا تُسمَّك حروفُه عند «تغميق الطباعة»: التسميكُ يملأ الفراغَ حول
 * الحرف، والحرفُ هنا هو الفراغ. (receiptRenderer يحمي كلَّ مستطيلٍ
 * ممتلئٍ كبير -- protectRectsOf.)
 */
function drawInvert(ctx: LayoutContext): void {
  const inset = Math.round(PAD * BANNER.blockInset);
  const blockX = inset;
  const blockW = ctx.width - inset * 2;
  const pad = Math.round(ctx.line * BANNER.blockPad);
  const innerX = blockX + pad;
  const innerW = blockW - pad * 2;

  const headSz = fitSize(ctx, BANNER_COPY.speech.head, BANNER.headSize, WEIGHT.bold, innerW);
  const tailSz = fitSize(ctx, BANNER_COPY.speech.tail, BANNER.tailSize, WEIGHT.bold, innerW);
  const body = ctx.wrap(BANNER_COPY.speech.body, BANNER.bodySize, WEIGHT.regular, 'display', innerW);
  const gap = Math.round(ctx.line * BANNER.lineGap);
  const saduGap = Math.round(ctx.line * BANNER.saduGap);
  const bandH = BANNER.saduUnit + BANNER.saduRule;
  const headBox = Math.round(headSz * BANNER.lineBox);
  const tailBox = Math.round(tailSz * BANNER.lineBox);
  const bodyBox = Math.round(BANNER.bodySize * BANNER.lineBox);
  const divH = BANNER.diamond * 2 + 1;

  const height = pad * 2 + bandH + saduGap + headBox + gap + body.length * bodyBox
    + gap + divH + gap + tailBox + saduGap + bandH;

  const top = ctx.y;
  ctx.rect(blockX, top, blockW, height, 'ink');

  let at = top + pad;
  at += saduBand(ctx, innerX, at, innerW, 'paper', false) + saduGap;
  at += displayLine(ctx, BANNER_COPY.speech.head, headSz, WEIGHT.bold, at, 'paper') + gap;
  for (const line of body) {
    at += displayLine(ctx, line, BANNER.bodySize, WEIGHT.regular, at, 'paper');
  }
  at += gap;
  at += diamondRule(ctx, innerX, at, innerW, 'paper') + gap;
  at += displayLine(ctx, BANNER_COPY.speech.tail, tailSz, WEIGHT.bold, at, 'paper') + saduGap;
  saduBand(ctx, innerX, at, innerW, 'paper', true);

  ctx.y = top + height;
}
