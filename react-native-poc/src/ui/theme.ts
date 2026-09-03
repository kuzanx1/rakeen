/**
 * Design tokens ported verbatim from the PWA's own POS/Kitchen stylesheet
 * (app/pos/rakeen-pos.css, app/pos/rakeen-pos-additions.css) -- the only
 * design system relevant here, since the RN app only implements the
 * cashier/POS role. Values are copied, not reinterpreted: every hex,
 * rgba(), radius, spacing and breakpoint below has a literal counterpart
 * in that CSS file. Do not add a color or size here that isn't traceable
 * back to it.
 *
 * The PWA defaults to its dark theme (`:root, [data-theme="dark"]`) with a
 * `[data-theme="light"]` override -- COLORS_DARK/COLORS_LIGHT mirror both
 * blocks exactly. Dashboard, Order/Booking, and Landing each have their
 * own independent token sets in the PWA and are out of scope until those
 * roles exist in RN at all.
 */

export const COLORS_DARK = {
  lime: '#C7FF4D',
  limeDeep: '#8FCB17',
  flagGreen: '#0B6B3A',
  flagGreenDeep: '#053E22',
  sand: '#E8C77A',
  graphite: '#0A1710',
  ivory: '#FBFAF4',
  canvas: '#050C08',
  bg: '#0E1F16',
  text: '#F4F8F0',
  cardBg: '#16291F',
  surf1: 'rgba(244,248,240,0.05)',
  surf2: 'rgba(244,248,240,0.09)',
  line: 'rgba(244,248,240,0.1)',
  muted: 'rgba(244,248,240,0.55)',
  danger: '#e08a6a',
  amber: '#e0b84a',
  // rgba() triplets used by low-opacity fills the PWA builds inline
  // (e.g. `rgba(var(--lime-rgb), 0.08)`) -- kept as ready-made strings at
  // the exact opacities actually used in rakeen-pos.css, rather than a
  // runtime rgb-triplet + alpha composer nothing else here needs.
  limeRgb: '199,255,77',
  limeDeepRgb: '143,203,23',
  flagGreenRgb: '11,107,58',
  dangerRgb: '224,138,106',
  amberRgb: '224,184,74',
  // .product-price's dark chip background (rakeen-pos.css:225) -- same in
  // both themes, a fixed near-black regardless of surrounding theme.
  priceChipBg: 'rgba(5,15,10,0.72)',
} as const;

export const COLORS_LIGHT = {
  ...COLORS_DARK,
  canvas: '#EEF1E6',
  bg: '#FFFFFF',
  text: '#12261A',
  cardBg: '#FFFFFF',
  surf1: 'rgba(18,38,26,0.035)',
  surf2: 'rgba(18,38,26,0.065)',
  line: 'rgba(18,38,26,0.09)',
  muted: 'rgba(18,38,26,0.52)',
  danger: '#c0523a',
  amber: '#a87a1e',
  dangerRgb: '192,82,58',
  amberRgb: '168,122,30',
} as const;

// The device this ships on first (a handheld cashier terminal, not a
// desktop browser) always renders the PWA's dark theme in practice, and
// there is no theme-toggle screen in RN yet -- default to dark, matching
// the PWA's own `:root` default, until that toggle is ported.
export const colors = COLORS_DARK;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 28,
  full: 999,
};

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
};

export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * Font family names -- must exactly match each .ttf's embedded PostScript
 * name (react-native-poc/assets/fonts/), which is how both iOS
 * (UIAppFonts) and Android (assets/fonts/<name>.ttf) resolve fontFamily.
 * The PWA's `font-weight` numbers map onto these literal font files, not
 * a synthesized bold -- RN does not fake-bold custom fonts reliably.
 */
export const fonts = {
  sansRegular: 'IBMPlexSansArabic-Regular',
  sansMedium: 'IBMPlexSansArabic-Medium',
  sansSemiBold: 'IBMPlexSansArabic-SemiBold',
  sansBold: 'IBMPlexSansArabic-Bold',
  // .mono is only ever used at 500/600/700 weight in the PWA (money/order
  // numbers) -- no regular-weight mono file was needed or bundled.
  monoMedium: 'IBMPlexMono-Medium',
  monoSemiBold: 'IBMPlexMono-SemiBold',
  monoBold: 'IBMPlexMono-Bold',
};

/**
 * Shadows -- rakeen-pos.css deliberately uses small-blur, large-offset
 * shadows (see its own comment: large-blur box-shadows measured 1-3s
 * repaint cost on real POS hardware). RN's shadow* props (iOS) map
 * directly; elevation (Android) is a rough equivalent with no direct
 * offset/blur control, sized to visually match.
 */
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 4,
  },
  panel: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 8,
  },
} as const;

/**
 * Linear-gradient stops, verbatim from rakeen-pos.css, for use with
 * react-native-linear-gradient's colors/locations/start/end props.
 */
export const gradients = {
  // .product-icon (rakeen-pos.css:214): linear-gradient(155deg, ...)
  productIcon: {
    colors: [
      `rgba(${colors.limeRgb},0.2)`,
      `rgba(${colors.flagGreenRgb},0.16)`,
      `rgba(${colors.limeDeepRgb},0.12)`,
    ],
    locations: [0, 0.55, 1],
    // CSS 155deg measured from the top, clockwise -- start near top-left,
    // end near bottom-right.
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
  },
  // .pay-btn (rakeen-pos.css:342): linear-gradient(155deg, lime, limeDeep)
  payButton: {
    colors: [colors.lime, colors.limeDeep],
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
  },
  // .product-card::before top accent line (rakeen-pos.css:206):
  // linear-gradient(90deg, limeDeep, lime) -- left to right.
  cardAccent: {
    colors: [colors.limeDeep, colors.lime],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
};
