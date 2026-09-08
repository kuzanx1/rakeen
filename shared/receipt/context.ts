/**
 * بدائيّاتُ الرسم -- تشترك فيها مستنداتُ النظام كلُّها.
 *
 * الفاتورةُ وتذكرةُ المطبخ وتقريرُ الوردية ثلاثةُ أوراقٍ مختلفةِ الشكل،
 * لكنّ ما تُبنى منه واحد: سطرٌ وسطيّ، وسطرٌ طرفاه، وفاصل، وصندوق. وقد
 * كان لكلٍّ منها نسختُها من هذه البدائيّات في كلٍّ من العميلين -- ستُّ
 * نسخٍ لأربع دوالّ، تُصلَح واحدةٌ وتبقى خمس.
 *
 * فصارت هنا مرّةً واحدة. ومن أراد ورقةً جديدة نادى هذا السياقَ ولم يكتب
 * سطراً من حسابِ مواضع.
 */

import { BORDER, DASH, INVERT_BAR, PAD, TRACKING, WEIGHT } from './tokens';
import type { Align, Dir, DrawOp, Family, Ink, Measurer } from './types';

const ARABIC = /[؀-ۿ]/;

export interface LayoutContext {
  readonly ops: DrawOp[];
  readonly width: number;
  readonly contentWidth: number;
  /** خطُّ الأساس الحاليّ -- يتقدّم مع كلّ سطر. */
  y: number;
  /** وحدةُ الإيقاع الرأسيّ لهذا المستند. */
  readonly line: number;
  gap(n: number): number;
  text(t: string, x: number, size: number, weight: number, family: Family,
       align: Align, dir: Dir,
       opts?: { color?: Ink; letterSpacing?: number; at?: number }): void;
  rect(x: number, y: number, w: number, h: number, color?: Ink): void;
  measure: Measurer;
  wrap(t: string, size: number, weight: number, family: Family, maxW: number): string[];
  centerText(t: string, size: number, bold: boolean, step?: number): void;
  rowText(leftMono: string, rightArabic: string, size: number, bold: boolean, step?: number): void;
  /** فاصلٌ صلب -- الشكلُ الافتراضيّ، وتُغيّره الفاتورةُ بحسب قالبها. */
  rule(after: number): void;
  dash(y: number, on: number, off: number, thickness?: number): void;
  invertBar(t: string, size: number, after: number): void;
  spacedText(t: string, size: number, bold: boolean, step?: number): void;
  /** إطارٌ من أربعة أشرطةٍ ممتلئة لا خطٌّ مرسوم. */
  box(x: number, y: number, w: number, h: number, thickness: number): void;
  /** قلبٌ مرسوم -- بديلُ الإيموجي، انظر types.ts. */
  heart(cx: number, cy: number, size: number): void;
}

export function createContext(opts: {
  width: number;
  line: number;
  measure: Measurer;
  /** كثافةُ القالب؛ واحدٌ لما لا قالبَ له. */
  density?: number;
}): LayoutContext {
  const ops: DrawOp[] = [];
  const { width, line, measure } = opts;
  const density = opts.density ?? 1;

  const ctx: LayoutContext = {
    ops,
    width,
    contentWidth: width - PAD * 2,
    y: PAD + line / 2,
    line,

    gap: (n) => line * n * density,

    text(t, x, size, weight, family, align, dir, o) {
      ops.push({
        op: 'text', x, y: o?.at ?? ctx.y, text: String(t), size, weight, family,
        align, dir, color: o?.color || 'ink',
        ...(o?.letterSpacing ? { letterSpacing: o.letterSpacing } : {}),
      });
    },

    rect(x, y, w, h, color = 'ink') {
      ops.push({ op: 'rect', x, y, w, h, color });
    },

    measure,

    /**
     * اللفُّ داخل عرضٍ معيَّن.
     *
     * وmaxW ليس عرضَ الورقة دائماً: اسمُ الصنف يلتفّ في عموده هو، وإلّا
     * زحف على الكمية والسعر وقُرئ متداخلاً.
     */
    wrap(t, size, weight, family, maxW) {
      /**
       * وكلمةٌ لا مسافةَ فيها تُكسر بالحرف.
       *
       * كان اللفُّ يقع عند المسافات وحدها، فاسمٌ بلا مسافة -- أو رمزُ
       * صنفٍ طويل، أو رابطٌ في ملاحظة -- يبقى سطراً واحداً مهما بلغ
       * فيخرج من حافّة الورقة. ويُقصّ عند الطبع، ولا شيء في المعاينة
       * يقول إنّه قُصّ.
       *
       * والكسرُ يشوّه وصلَ الحروف العربية في موضعه، لكنّ نصفَ الاسم
       * ظاهراً أهونُ من نصفه مفقوداً.
       */
      const breakLong = (word: string): string[] => {
        if (measure(word, size, weight, family) <= maxW) return [word];
        const out: string[] = [];
        let piece = '';
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

      const words: string[] = [];
      for (const w of String(t).split(' ')) words.push(...breakLong(w));
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (measure(test, size, weight, family) > maxW && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      return lines.length > 0 ? lines : [''];
    },

    centerText(t, size, bold, step) {
      ctx.text(t, width / 2, size, bold ? WEIGHT.bold : WEIGHT.regular, 'sans', 'center', 'rtl');
      ctx.y += ctx.gap(step ?? (size > 22 ? 1.3 : 1));
    },

    /** عربيٌّ يميناً ورقمٌ يساراً -- وهو ترتيبُ كلّ سطور الحساب. */
    rowText(leftMono, rightArabic, size, bold, step) {
      ctx.text(rightArabic, width - PAD, size, bold ? WEIGHT.bold : WEIGHT.regular, 'sans', 'right', 'rtl');
      if (leftMono) ctx.text(leftMono, PAD, size, WEIGHT.mono, 'mono', 'left', 'ltr');
      ctx.y += ctx.gap(step ?? 1);
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
      ops.push({ op: 'dash', y, x1: PAD, x2: width - PAD, on, off, thickness });
    },

    /** شريطٌ أسودُ بكتابةٍ بيضاء: أقوى تمييزٍ تقدر عليه طابعةٌ بلونٍ واحد. */
    invertBar(t, size, after) {
      const h = Math.round(size * INVERT_BAR.height);
      ctx.rect(PAD * INVERT_BAR.inset, ctx.y - h / 2, width - PAD, h);
      ctx.text(t, width / 2, size, WEIGHT.bold, 'sans', 'center', 'rtl', { color: 'paper' });
      ctx.y += h / 2 + ctx.gap(after);
    },

    /** حروفٌ متباعدةٌ وسطية -- ولا تُباعد العربيةُ فحروفُها متّصلة. */
    spacedText(t, size, bold, step) {
      const ls = ARABIC.test(t) ? 0 : Math.round(size * TRACKING);
      ctx.text(t, width / 2, size, bold ? WEIGHT.bold : WEIGHT.regular, 'sans', 'center', 'rtl', { letterSpacing: ls });
      ctx.y += ctx.gap(step ?? (size > 22 ? 1.3 : 1));
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
      ops.push({ op: 'glyph', shape: 'heart', cx, cy, size });
    },
  };

  return ctx;
}

/** نقاطٌ موصِلة بين طرفَي سطر -- تملأ ما بينهما بالضبط فلا تلامسهما. */
export function leaderDots(ctx: LayoutContext, from: number, to: number): void {
  for (let x = from; x < to; x += DASH.leader.step) {
    ctx.rect(x, ctx.y - DASH.leader.size / 2, DASH.leader.size, DASH.leader.size);
  }
}
