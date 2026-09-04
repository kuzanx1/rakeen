/**
 * Receipt themes.
 *
 * A thermal printer gives you one ink colour, one paper width and a roll
 * that costs money, so a "theme" here is not decoration — it is a set of
 * decisions about density, hierarchy and how much paper a sale is worth
 * spending. Three genuinely different answers, not three palettes.
 *
 * Every theme prints the same ZATCA Phase 1 simplified tax invoice fields:
 * the "فاتورة ضريبية مبسطة" heading, the seller's VAT number, the
 * timestamp, the total including VAT, the VAT amount, and the TLV QR. That
 * set is a compliance requirement and no theme may drop any of it — the
 * themes vary spacing, type scale and rules, never the content.
 */

export type ReceiptThemeId = 'classic' | 'compact' | 'elegant';

export const RECEIPT_THEME_IDS: ReceiptThemeId[] = ['classic', 'compact', 'elegant'];

export interface ReceiptTheme {
  id: ReceiptThemeId;
  /** Arabic name, for the dashboard's picker. */
  label: string;
  /** Multiplies every vertical gap. Below 1 the receipt gets shorter. */
  density: number;
  /** Multiplies every font size. */
  typeScale: number;
  /** Print the business logo when one is configured. */
  showLogo: boolean;
  /** A rule between each item, not just between sections. */
  ruleBetweenItems: boolean;
  /** Letter-spaced, centred business name with rules above and below. */
  headerBand: boolean;
  /** Draw a box around the total line. */
  boxedTotal: boolean;
  /** QR size ceiling in px. */
  qrMaxSize: number;
}

const THEMES: Record<ReceiptThemeId, ReceiptTheme> = {
  /**
   * The balanced default: logo, section rules, comfortable spacing.
   * What most businesses expect a receipt to look like.
   */
  classic: {
    id: 'classic',
    label: 'كلاسيكي',
    density: 1,
    typeScale: 1,
    showLogo: true,
    ruleBetweenItems: false,
    headerBand: false,
    boxedTotal: false,
    qrMaxSize: 220,
  },

  /**
   * Paper-saving. No logo, tighter leading, smaller type, and a smaller QR
   * that is still comfortably scannable. Everything ZATCA requires stays;
   * what goes is the whitespace. Roughly a third shorter than classic,
   * which is real money at a few hundred receipts a day.
   */
  compact: {
    id: 'compact',
    label: 'مضغوط — يوفّر ورق',
    density: 0.68,
    typeScale: 0.88,
    showLogo: false,
    ruleBetweenItems: false,
    headerBand: false,
    boxedTotal: false,
    qrMaxSize: 170,
  },

  /**
   * The presentation option: a letter-spaced name between two rules, a
   * hairline under every item so the list reads as a table rather than a
   * run of text, and the total in its own box. Costs more paper than
   * classic and is meant to — it is for places where the receipt is part
   * of how the room feels.
   */
  elegant: {
    id: 'elegant',
    label: 'أنيق',
    density: 1.15,
    typeScale: 1.04,
    showLogo: true,
    ruleBetweenItems: true,
    headerBand: true,
    boxedTotal: true,
    qrMaxSize: 220,
  },
};

export function receiptTheme(id: string | null | undefined): ReceiptTheme {
  return THEMES[(id as ReceiptThemeId) ?? 'classic'] ?? THEMES.classic;
}

/**
 * A bilingual label.
 *
 * Arabic first, then English after a thin separator, on one line. Saudi
 * receipts are read by both, and stacking the two doubles the height of
 * every row on a roll that is already the expensive part. One line keeps
 * the receipt short and the pairing obvious.
 *
 * Numbers are never translated -- they are the same glyphs either way.
 */
export function bi(ar: string, en: string): string {
  return `${ar} · ${en}`;
}
