/**
 * ESC/POS receipts as TEXT, printed by the printer's own font.
 *
 * Measured at Hbiah on a SUNMI NT310: our raster receipt takes 30-45
 * seconds, Foodics on the SAME printer takes about one second. One
 * second is impossible for an 87mm full-page bitmap at any print speed,
 * so Foodics is not sending one -- it sends text and the printer draws
 * it with its built-in font. Our transport was never the problem (the
 * trace shows 20ms end to end); the payload was.
 *
 * Raster costs what it costs because the head fires row by row and pays
 * the same for a blank row as for a black one. Text costs a fraction:
 * the printer renders glyphs itself and feeds only as far as the line
 * actually goes.
 *
 * WHAT IS UNPROVEN HERE, and why the test slip below exists:
 * this printer reports `UTF-8 Mode: Yes` and `Font Version: 1.2.5`, which
 * says it has a Unicode font -- but not that its font covers Arabic, nor
 * that it shapes and orders Arabic correctly. Those are three separate
 * questions and no datasheet answers them. buildArabicProbeSlip() asks
 * all three in one 200-byte print, so the answer costs one slip instead
 * of a rewrite.
 *
 * Until that slip comes back, the raster path stays the default and this
 * is opt-in.
 */

/** 80mm at Font A (12 dots wide) = 48 columns. 58mm = 32. */
export const COLUMNS_80MM = 48;
export const COLUMNS_58MM = 32;

/** Base64 for a plain byte array. Lives here rather than in the receipt
 *  renderer because every producer of ESC/POS bytes needs it, and a
 *  second copy is how two encoders drift. */
export function bytesToBase64(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result += b1 !== undefined ? chars[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '=';
    result += b2 !== undefined ? chars[b2 & 63] : '=';
  }
  return result;
}

const ESC = 0x1b;
const GS = 0x1d;

export type Align = 'left' | 'center' | 'right';

/** UTF-8 bytes. The printer is in UTF-8 mode; anything else would need a
 *  code page per script, which is exactly what UTF-8 mode exists to avoid. */
function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

export class EscPosText {
  private bytes: number[] = [ESC, 0x40];

  align(a: Align): this {
    this.bytes.push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** `GS ! n`: the low nibble is the height multiplier, the high nibble
   *  the width. 0 is normal; 1 is double. Anything larger is unreadable
   *  on 80mm paper for anything but a total. */
  size(width: 0 | 1, height: 0 | 1): this {
    this.bytes.push(GS, 0x21, (width << 4) | height);
    return this;
  }

  line(text = ''): this {
    this.bytes.push(...utf8(text), 0x0a);
    return this;
  }

  /**
   * A label and a value on one line, pushed to opposite edges by spaces.
   *
   * Deliberately NOT using two aligned prints: ESC a applies to a whole
   * line, so the only way to get both edges is to build the line itself.
   * Padding is counted in code points, which is right for a monospaced
   * font and approximate for a proportional one -- close enough for a
   * receipt, and the probe slip is what says which this printer has.
   */
  row(label: string, value: string, columns: number): this {
    const pad = Math.max(1, columns - [...label].length - [...value].length);
    return this.line(label + ' '.repeat(pad) + value);
  }

  rule(columns: number): this {
    return this.line('-'.repeat(columns));
  }

  feed(n: number): this {
    for (let i = 0; i < n; i++) this.bytes.push(0x0a);
    return this;
  }

  cut(): this {
    this.bytes.push(GS, 0x56, 0x00);
    return this;
  }

  build(): number[] {
    return this.bytes;
  }
}

/**
 * The 200-byte question: can this printer draw Arabic from UTF-8 text?
 *
 * Three things are being asked at once, and the slip answers each
 * separately -- which is why the lines are what they are:
 *
 *   1. COVERAGE  -- do Arabic glyphs appear at all, or boxes/blanks?
 *   2. SHAPING   -- are the letters JOINED? "مرحبا" printed as five
 *                   separate letterforms means the font has no shaping,
 *                   which is unusable for a receipt however fast it is.
 *   3. ORDER     -- does the word read right-to-left, or reversed?
 *                   "١٢٣" beside it shows whether digits stay LTR inside
 *                   an RTL line, which is where most naive engines break.
 *
 * It also prints a known Latin line, so a completely blank slip can be
 * told apart from an Arabic-only failure.
 */
export function buildArabicProbeSlip(): number[] {
  const t = new EscPosText();
  t.align('center').bold(true).line('RAKEEN TEXT TEST').bold(false);
  t.line('--------------------------------');
  t.align('right');
  t.line('مرحبا بك');
  t.line('قهوة عربية');
  t.line('الإجمالي ١٢٣٫٤٥');
  t.line('Latte 15.00');
  t.align('left');
  t.line('--------------------------------');
  t.align('center').line('if the Arabic above is joined');
  t.line('and reads right-to-left, text mode');
  t.line('works and receipts get 40x faster');
  t.feed(3).cut();
  return t.build();
}
