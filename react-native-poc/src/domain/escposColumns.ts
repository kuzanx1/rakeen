import { EscPosText } from './escposText';
import { PrinterCapabilityProfile, arabicLineFor } from './printerCapability';

/**
 * Columns positioned in DOTS, not in spaces.
 *
 * Padding a line with spaces silently assumes every character is the same
 * width. That holds for the printer's built-in Latin font and does not
 * hold for Arabic: one wide letter shifts a price out of line with the
 * price above it, and the column drifts a little further with every row.
 * The receipt still prints, so nothing fails — it just looks amateur, in
 * the one place a customer actually looks.
 *
 * `ESC $ nL nH` sets the absolute horizontal print position in dots from
 * the left margin. It is font-independent by construction: whatever the
 * glyphs measure, the next character starts exactly where it was told.
 * That makes the price column exact on 58mm and 80mm alike, with no
 * measurement and no assumption about the font.
 *
 * Segments are emitted left to right because that is the order the print
 * head moves; a segment that would start before the head already sits is
 * pushed to the current position rather than being dropped.
 */

export interface Segment {
  text: string;
  /** Left edge of this segment, in dots from the left margin. */
  x: number;
  /** Width available. Used to right-align within the column. */
  width: number;
  align?: 'left' | 'right';
  bold?: boolean;
}

/** `ESC $` — absolute horizontal position, little-endian, in dots. */
function moveTo(dots: number): number[] {
  const n = Math.max(0, Math.round(dots));
  return [0x1b, 0x24, n & 0xff, (n >> 8) & 0xff];
}

/**
 * Estimated width of a run, in dots.
 *
 * Exact for the built-in Latin font, which is fixed-width. For Arabic it
 * is an estimate and is used ONLY to right-align a segment inside its own
 * column — never to position the column itself, which is why an imperfect
 * estimate cannot make columns drift.
 */
export function estimateDots(text: string, caps: PrinterCapabilityProfile): number {
  let dots = 0;
  for (const ch of text) {
    // Arabic letters average slightly narrower than the Latin cell in the
    // printers measured; the ratio only affects alignment inside a column.
    dots += /[؀-ۿ]/.test(ch) ? caps.latinCharDots * 0.85 : caps.latinCharDots;
  }
  return Math.round(dots);
}

/**
 * Writes one line made of columns, each starting at an exact dot offset.
 *
 * Every segment's text passes through the capability layer first, so a
 * printer that orders Arabic itself gets it untouched and one that does
 * not gets it prepared — the caller never decides that.
 */
export function writeColumns(
  t: EscPosText,
  segments: Segment[],
  caps: PrinterCapabilityProfile,
): void {
  const bytes: number[] = [];
  let head = 0;

  for (const seg of segments) {
    const prepared = arabicLineFor(seg.text, caps);
    // A null means this run cannot be printed as text on this printer.
    // The caller is responsible for rasterising it; skipping here keeps a
    // half-broken line from reaching paper.
    if (prepared === null || prepared === '') continue;

    const w = estimateDots(prepared, caps);
    const x = seg.align === 'right' ? seg.x + seg.width - w : seg.x;
    const target = Math.max(head, x);

    bytes.push(...moveTo(target));
    if (seg.bold) bytes.push(0x1b, 0x45, 1);
    for (const ch of prepared) {
      const cp = ch.codePointAt(0) as number;
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
    if (seg.bold) bytes.push(0x1b, 0x45, 0);

    head = target + w;
  }

  bytes.push(0x0a);
  t.raw(bytes);
}

/**
 * The item table's column geometry, derived from the printer's own width.
 *
 * Proportions rather than fixed dots so 58mm is a narrower version of the
 * same table rather than a different design — and so a printer with an
 * unusual printable width still gets a sane table instead of a clipped one.
 */
export function itemColumns(caps: PrinterCapabilityProfile) {
  const W = caps.printableDots;
  const price = Math.round(W * 0.22);
  const qty = Math.round(W * 0.13);
  return {
    /** Price sits hard against the left edge: the column a customer scans. */
    price: { x: 0, width: price, align: 'right' as const },
    /** Quantity against the right edge, beside the name it belongs to. */
    qty: { x: W - qty, width: qty, align: 'right' as const },
    /** The name takes everything left over. */
    name: { x: price + Math.round(W * 0.03), width: W - price - qty - Math.round(W * 0.06), align: 'right' as const },
    totalWidth: W,
  };
}
