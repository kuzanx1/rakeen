import React from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { fonts, useTheme } from './theme';

/**
 * rkMoney() (rakeen-pos.js:100) -- the PWA's ONE money formatter. Every
 * price, total, change figure and summary row in the cashier goes through
 * it, so getting it wrong is wrong everywhere at once. It is not a
 * string: it emits three separately-styled pieces.
 *
 *   `<span class="rk-money mono">${sign}${whole}
 *      <span class="rk-money-frac">.${frac}</span>
 *      <span class="rk-riyal">${RK_RIYAL_CHAR}</span></span>`
 *
 * with (rakeen-pos.css:65-71)
 *
 *   .rk-money      { direction:ltr; unicode-bidi:isolate; display:inline-flex;
 *                    align-items:baseline; gap:3px; font-family:'IBM Plex Mono' }
 *   .rk-money-frac { font-size:0.72em; opacity:0.82 }
 *   .rk-riyal      { font-family:'saudi_riyal'; font-weight:inherit;
 *                    display:inline-block; transform:scaleX(-1) }
 *
 * Three things here are easy to get wrong and were all verified against
 * the live page rather than read off the stylesheet:
 *
 *  - The riyal mark is U+20C1, and it is drawn MIRRORED. `scaleX(-1)` is
 *    not decorative -- the glyph in the shipped font faces the other way,
 *    so dropping the transform prints a backwards riyal.
 *  - The fraction really is 0.72em against the parent, measured at
 *    21.6px inside a 30px `.due-amount`, at 82% opacity. A flat
 *    same-size fraction reads as a completely different typographic
 *    treatment.
 *  - `font-weight:inherit` on the mark means money set at 800 resolves to
 *    the font's BOLD face. document.fonts reported the 400 face
 *    "unloaded" and the 700 face "loaded" on the live page, confirming
 *    the bold is the one that actually ships in the UI.
 *
 * This app previously rendered every amount as a plain `12.50 ر.س`
 * string: no fraction treatment, and an Arabic abbreviation in place of
 * the riyal mark the PWA has used since the currency symbol changed.
 */

/** RK_RIYAL_CHAR (rakeen-pos.js:99) -- U+20C1, verified live. */
export const RIYAL = '⃁';

export default function Money({
  value,
  size = 12,
  color,
  style,
}: {
  value: number;
  /** The `1em` the fraction's 0.72 and the mark's own size derive from. */
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const ink = color ?? colors.text;

  // `const n = Number(amount) || 0` -- NaN and undefined both collapse to
  // zero rather than printing "NaN" at a customer.
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');

  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.whole, { fontSize: size, color: ink }]}>
        {sign}
        {whole}
      </Text>
      <Text style={[styles.frac, { fontSize: size * 0.72, color: ink }]}>.{frac}</Text>
      <Text style={[styles.riyal, { fontSize: size, color: ink }]}>{RIYAL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.rk-money { direction: ltr }` -- the money box reads left to right no
  // matter what surrounds it: whole, then fraction, then the mark.
  //
  // The previous note here claimed `flexDirection:'row'` "does not flip
  // under I18nManager". It does. `row` follows the writing direction in
  // Yoga exactly as it does in CSS, and index.js forces RTL app-wide, so
  // the three pieces were laid out right-to-left -- the mirror of the
  // source. On screen that put the mark and the fraction to the LEFT of
  // the integer: an amount reading ".0099" instead of "99.00".
  //
  // `row-reverse` under an RTL direction resolves to left-to-right, which
  // is the whole point; the ternary keeps it correct if RTL is ever off.
  // Done this way rather than with the `direction:'ltr'` style prop
  // because that one is documented iOS-only, and this needs no platform
  // to honour anything beyond flexbox.
  row: { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 3 },
  // This piece carries the minus sign on a discount line. A bare '-' is
  // bidi-neutral, so in an RTL paragraph it would attach to the wrong end
  // of the digits; pinning the direction keeps "-12.50" from rendering as
  // "12.50-".
  whole: { fontFamily: fonts.monoBold, writingDirection: 'ltr' },
  frac: { fontFamily: fonts.monoBold, opacity: 0.82, writingDirection: 'ltr' },
  riyal: {
    fontFamily: 'SaudiRiyal-Bold',
    // transform:scaleX(-1)
    transform: [{ scaleX: -1 }],
  },
});

/** The same three pieces as a plain string, for the places that genuinely
 *  cannot host a View -- a printed receipt line, a toast, an accessibility
 *  label. Keeps the mark, drops only the per-piece styling. */
export function moneyText(value: number): string {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toFixed(2)} ${RIYAL}`;
}

export const moneyStyles: { whole: TextStyle; frac: TextStyle; riyal: TextStyle } = {
  whole: styles.whole,
  frac: styles.frac,
  riyal: styles.riyal,
};
