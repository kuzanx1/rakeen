/**
 * What a given printer can actually do, and what to do when it cannot.
 *
 * Rakeen prints to whatever ESC/POS-speaking device a restaurant already
 * owns. Those devices differ in the one way that matters most here: how
 * they handle Arabic. Three separate abilities, and a printer can have any
 * combination of them:
 *
 *   1. GLYPHS   — does its font contain Arabic letters at all?
 *   2. SHAPING  — does it JOIN them? "كتب" or "ك ت ب"?
 *   3. ORDERING — does it lay a line out right-to-left?
 *
 * The SUNMI NT310 measured at Hbiah has the first two and not the third,
 * which is why sending it word-reversed text works. That is a fact about
 * that printer, not about printers — and baking it in as a global rule
 * would silently corrupt every receipt on a printer that DOES order
 * correctly, by reversing a line that was already right.
 *
 * So the reversal lives here, behind a declared capability, and the
 * receipt builder never decides it.
 */

export type ArabicSupport =
  /** Full native Arabic: glyphs, shaping and RTL ordering. Send as-is. */
  | 'native'
  /** Glyphs and shaping, but lays words out in received order (LTR).
   *  Measured on SUNMI NT310. Word order is reversed before sending. */
  | 'shapingOnly'
  /** No usable Arabic. Arabic runs are rasterised; everything else stays
   *  text. */
  | 'none';

export interface PrinterCapabilityProfile {
  /** Dots across the printable area. 384 = 58mm, 576 = 80mm at 203dpi. */
  printableDots: number;
  /** Dot pitch, for turning millimetres into dots. 203dpi = 8 dots/mm. */
  dotsPerMm: number;
  arabic: ArabicSupport;
  /** `GS ( k` Model-2 QR. False means the QR is rasterised instead. */
  nativeQr: boolean;
  /** `GS k` barcodes. */
  nativeBarcode: boolean;
  /** `GS ( L` / `GS 8 L` graphics. False falls back to `GS v 0`.
   *  False unless a specific printer has been seen to print an image from
   *  the modern command ON PAPER. The NT310 at Hbiah does not: it printed
   *  the raster payload as characters. A printer that does not know a
   *  command prints its bytes, it does not skip them. */
  modernGraphics: boolean;
  supportsCut: boolean;
  /** Width of one character in the printer's built-in Latin font, in dots.
   *  Font A is 12; Font B is 9. Used only for Latin runs — Arabic is never
   *  assumed to be monospaced, which is why columns are positioned in DOTS
   *  rather than in spaces. */
  latinCharDots: number;
}

/**
 * The safe assumption for a printer nobody has tested.
 *
 * Deliberately pessimistic about Arabic and optimistic about nothing: an
 * untested printer gets the strategy that cannot produce garbage, even
 * though it is the slowest. A wrong guess in the other direction prints
 * unreadable receipts to real customers, and speed is not worth that.
 */
export const DEFAULT_CAPABILITIES: PrinterCapabilityProfile = {
  printableDots: 576,
  dotsPerMm: 8,
  arabic: 'none',
  nativeQr: false,
  nativeBarcode: false,
  modernGraphics: false,
  supportsCut: true,
  latinCharDots: 12,
};

/**
 * Confirmed profiles, keyed by what the owner selects in settings.
 *
 * A profile only appears here once its behaviour has been printed and
 * read on real paper. `sunmi-nt310`'s Arabic value is the direct result
 * of the probe slip printed at Hbiah: "مرحبا بك" came out "بك مرحبا",
 * with every letter correctly joined.
 */
export const KNOWN_PROFILES: Record<string, Partial<PrinterCapabilityProfile>> = {
  'sunmi-nt310': {
    printableDots: 576,
    arabic: 'shapingOnly',
    nativeQr: true,
    nativeBarcode: true,
    // Measured on paper at Hbiah, not assumed: sent `GS 8 L` fn112, the
    // printer printed the bitmap as text. It does not have this command.
    modernGraphics: false,
    supportsCut: true,
  },
  /** Any 80mm printer the owner has confirmed prints Arabic correctly. */
  'generic-80mm-arabic': {
    printableDots: 576,
    arabic: 'native',
    nativeQr: true,
    nativeBarcode: true,
  },
  /** 80mm with no Arabic font — Arabic runs get rasterised. */
  'generic-80mm-latin': {
    printableDots: 576,
    arabic: 'none',
    nativeQr: true,
    nativeBarcode: true,
  },
  'generic-58mm': {
    printableDots: 384,
    arabic: 'none',
    nativeQr: false,
    nativeBarcode: false,
  },
};

export function resolveCapabilities(
  profileId?: string | null,
  paperWidthPx?: number,
): PrinterCapabilityProfile {
  const known = profileId ? KNOWN_PROFILES[profileId] : undefined;
  const merged = { ...DEFAULT_CAPABILITIES, ...(known ?? {}) };
  // An explicitly configured paper width always wins: it is the one thing
  // the owner can see and verify by looking at the roll in the machine.
  if (paperWidthPx) merged.printableDots = paperWidthPx;
  return merged;
}

/**
 * Mirrors a mixed line for a printer that shapes but does not order.
 *
 * Reverses the order of RUNS, not of words. A run is a stretch of Arabic
 * or a stretch of Latin; inside a Latin run the words keep their order,
 * because English does not become right-to-left just because it sits in
 * an Arabic sentence. Reversing word-by-word turned "Simplified Tax
 * Invoice" into "Invoice Tax Simplified" — correct Arabic, broken English,
 * and invisible to anyone testing with single words.
 *
 * This is the one rule of bidirectional layout that matters on a receipt:
 * the paragraph runs right to left, each embedded run runs its own way.
 */
export function mirrorRuns(line: string): string {
  type Run = { kind: 'ar' | 'latin'; words: string[] };
  const runs: Run[] = [];

  for (const w of line.split(' ')) {
    const hasArabic = /[؀-ۿ]/.test(w);
    const hasLatin = /[A-Za-z]/.test(w);
    // A token with no letters at all — "·", "#302", "-", "15.00" — is
    // neutral: it belongs to whatever it was written next to. Giving it a
    // run of its own would split a phrase in two and swap the halves.
    const neutral = !hasArabic && !hasLatin;
    const last = runs[runs.length - 1];

    if (neutral && last) {
      last.words.push(w);
      continue;
    }
    const kind: Run['kind'] = hasArabic ? 'ar' : 'latin';
    if (last && last.kind === kind) last.words.push(w);
    else runs.push({ kind, words: [w] });
  }

  return runs
    .reverse()
    .map(r =>
      // Arabic runs are reversed as well: the printer lays their words out
      // left to right, so they have to arrive backwards to read forwards.
      // Latin runs are NOT — English inside an Arabic line still reads
      // left to right, and reversing it produced "Invoice Tax Simplified".
      (r.kind === 'ar' ? [...r.words].reverse() : r.words).join(' '),
    )
    .join(' ');
}

/**
 * Turns an Arabic line into what THIS printer needs to receive.
 *
 * Returns null when the caller must rasterise the line instead — the
 * decision is made here so no renderer has to know why.
 */
export function arabicLineFor(line: string, caps: PrinterCapabilityProfile): string | null {
  if (!/[؀-ۿ]/.test(line)) return line; // no Arabic: nothing to decide
  switch (caps.arabic) {
    case 'native':
      return line;
    case 'shapingOnly':
      return mirrorRuns(line);
    case 'none':
      return null;
  }
}
