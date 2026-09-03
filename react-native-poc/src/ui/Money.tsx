import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  // `direction:ltr; unicode-bidi:isolate` -- a money box never reorders
  // under the surrounding RTL text. In RN that means an explicitly
  // 'row' (not 'row-reverse') flex box, which does not flip under
  // I18nManager the way `start`/`end` do.
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  whole: { fontFamily: fonts.monoBold },
  frac: { fontFamily: fonts.monoBold, opacity: 0.82 },
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
