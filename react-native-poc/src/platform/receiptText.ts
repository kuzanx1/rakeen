import { Skia, TextAlign, TextDirection, FontWeight } from '@shopify/react-native-skia';
import type { SkCanvas, SkTypeface, SkTypefaceFontProvider } from '@shopify/react-native-skia';

/**
 * Feature Parity Pass -- Real Receipt Rendering. Real bidi-aware Arabic
 * text drawing via Skia's Paragraph API -- NOT plain canvas.drawText,
 * which (confirmed by reading the installed package's own Paragraph
 * type declarations) does no bidi reordering at all. The PWA gets RTL
 * shaping/reordering for free from the browser's text engine
 * (ctx.direction = 'rtl'); Skia's offscreen/native canvas has no
 * browser underneath it, so ParagraphStyle.textDirection is the real,
 * documented equivalent -- this file exists specifically to supply it,
 * rather than drawing visually-wrong unreordered glyph runs.
 *
 * UNVERIFIED beyond real CI compilation: whether Skia's on-device text
 * shaper actually joins/reorders these specific Arabic glyphs correctly
 * for IBM Plex Sans Arabic can only be confirmed on real iOS/Android
 * hardware, per this feature's own standing rule -- never claimed here.
 */

const RECEIPT_FONT_FAMILY = 'RakeenReceiptArabic';

export function buildReceiptFontProvider(regular: SkTypeface | null, bold: SkTypeface | null): SkTypefaceFontProvider {
  const provider = Skia.TypefaceFontProvider.Make();
  // Both weights register under the SAME family name -- pushStyle's
  // fontStyle.weight below is what picks Regular vs. Bold at paint time,
  // matching how a real font family with multiple weights works.
  if (regular) provider.registerFont(regular, RECEIPT_FONT_FAMILY);
  if (bold) provider.registerFont(bold, RECEIPT_FONT_FAMILY);
  return provider;
}

export type TextAlignment = 'left' | 'right' | 'center';
export type TextDir = 'rtl' | 'ltr';

export interface DrawTextOptions {
  size: number;
  bold?: boolean;
  /** '#rrggbb' or '#rrggbbaa'. Defaults to opaque black. */
  color?: string;
  align: TextAlignment;
  direction?: TextDir; // defaults to 'rtl' -- every PWA text call site does, except the LTR mono amount column
}

function toTextAlign(align: TextAlignment): TextAlign {
  if (align === 'right') return TextAlign.Right;
  if (align === 'center') return TextAlign.Center;
  return TextAlign.Left;
}

/**
 * Lays out and paints one paragraph, returning its rendered height so
 * callers can advance their own running Y cursor -- the same manual
 * cumulative-layout style the PWA's renderReceiptCanvas() itself uses
 * (`y += lineH`), since Skia's canvas, like a DOM canvas, has no
 * automatic flow layout of its own.
 */
export function paintText(
  canvas: SkCanvas,
  provider: SkTypefaceFontProvider,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: DrawTextOptions,
): number {
  const builder = Skia.ParagraphBuilder.Make(
    {
      textAlign: toTextAlign(opts.align),
      textDirection: opts.direction === 'ltr' ? TextDirection.LTR : TextDirection.RTL,
    },
    provider,
  );
  builder.pushStyle({
    color: Skia.Color(opts.color ?? '#000000'),
    fontFamilies: [RECEIPT_FONT_FAMILY],
    fontSize: opts.size,
    fontStyle: { weight: opts.bold ? FontWeight.ExtraBold : FontWeight.Normal },
  });
  builder.addText(text);
  const paragraph = builder.build();
  paragraph.layout(maxWidth);
  paragraph.paint(canvas, x, y);
  return paragraph.getHeight();
}

/**
 * Word-wraps `text` to fit `maxWidth` at the given style, ported from
 * the PWA's real wrapLine() (measure-and-break on spaces). Needed
 * because callers here draw each wrapped line as ITS OWN paragraph
 * (matching the PWA's own per-line y+=lineH stepping for item
 * names/mods), rather than relying on Skia's own paragraph-internal
 * wrapping -- which would still lay out correctly, but wouldn't let the
 * PWA's exact per-line spacing constants (lineH*0.85, lineH*0.7, ...)
 * be reproduced faithfully.
 */
export function measureAndWrapText(
  provider: SkTypefaceFontProvider,
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
): string[] {
  const words = String(text).split(' ');
  const lines: string[] = [];
  let current = '';
  const widthOf = (candidate: string): number => {
    const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Right, textDirection: TextDirection.RTL }, provider);
    builder.pushStyle({
      fontFamilies: [RECEIPT_FONT_FAMILY],
      fontSize: size,
      fontStyle: { weight: bold ? FontWeight.ExtraBold : FontWeight.Normal },
    });
    builder.addText(candidate);
    const paragraph = builder.build();
    paragraph.layout(100000); // effectively unbounded -- measuring the candidate's own natural width, not wrapping it here
    return paragraph.getMaxIntrinsicWidth();
  };
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && widthOf(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}
