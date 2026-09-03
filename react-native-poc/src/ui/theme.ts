import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * Design tokens ported verbatim from the PWA's own POS/Kitchen stylesheet
 * (app/pos/rakeen-pos.css, app/pos/rakeen-pos-additions.css) -- the only
 * design system relevant here, since the RN app implements the
 * cashier/POS role. Values are copied, not reinterpreted: every hex,
 * rgba(), radius, spacing and breakpoint below has a literal counterpart
 * in that CSS file. Do not add a color or size here that isn't traceable
 * back to it.
 *
 * THEME DEFAULT IS LIGHT. rakeen-pos.css writes its dark values into bare
 * `:root` (so a raw stylesheet read makes dark look like the default),
 * but the real app never renders that state: app/pos/POSPage.tsx line 24
 * runs `document.documentElement.setAttribute("data-theme", "light")`
 * unconditionally on mount, before the POS script boots. Every real POS
 * session therefore STARTS light, and .theme-toggle (rakeen-pos.js:464)
 * flips it for the session only -- nothing is persisted, so every fresh
 * launch is light again. MODE_DEFAULT below encodes exactly that.
 */

export type ThemeMode = 'light' | 'dark';

export const MODE_DEFAULT: ThemeMode = 'light';

/** Values shared by both themes -- rakeen-pos.css only redefines the
 *  surface/text/state tokens under [data-theme="light"]; the brand ramp
 *  (lime/flag-green/sand/graphite/ivory) is identical in both. */
const BRAND = {
  lime: '#C7FF4D',
  limeDeep: '#8FCB17',
  flagGreen: '#0B6B3A',
  flagGreenDeep: '#053E22',
  sand: '#E8C77A',
  graphite: '#0A1710',
  ivory: '#FBFAF4',
  limeRgb: '199,255,77',
  limeDeepRgb: '143,203,23',
  flagGreenRgb: '11,107,58',
  /** .product-price's chip background (rakeen-pos.css:225) -- a fixed
   *  near-black in both themes, not a surface token. */
  priceChipBg: 'rgba(5,15,10,0.72)',
  /** .modal-overlay (rakeen-pos.css:550) -- also fixed across themes. */
  modalOverlay: 'rgba(6,16,10,0.78)',
} as const;

export interface Palette {
  lime: string;
  limeDeep: string;
  flagGreen: string;
  flagGreenDeep: string;
  sand: string;
  graphite: string;
  ivory: string;
  limeRgb: string;
  limeDeepRgb: string;
  flagGreenRgb: string;
  priceChipBg: string;
  modalOverlay: string;
  canvas: string;
  bg: string;
  text: string;
  cardBg: string;
  surf1: string;
  surf2: string;
  line: string;
  muted: string;
  danger: string;
  amber: string;
  dangerRgb: string;
  amberRgb: string;
  /**
   * rakeen-pos.css states a lime accent twice for most text: a base rule
   * using --lime-deep, then a `[data-theme="dark"] ...` override using
   * --lime (lime-deep is too dark to read on a dark surface, lime too
   * bright on a light one). Rather than repeat that pair at ~10 call
   * sites, this one semantic token IS that rule -- limeDeep in light,
   * lime in dark. Covers .product-price, .sum-row.total .mono,
   * .nav-tab.active, .table-status(serving|occupied), .pm-tab.active,
   * .shift-stat-row.total .mono, .change-row .mono, .mod-chip-price,
   * .pin-dot.filled and .more-item svg.
   */
  accentText: string;
}

/** [data-theme="light"] block, rakeen-pos.css:30-38 (plus the brand ramp
 *  and the base --lime-deep accent that its dark counterpart overrides). */
export const LIGHT: Palette = {
  ...BRAND,
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
  accentText: BRAND.limeDeep,
};

/** `:root, [data-theme="dark"]` block, rakeen-pos.css:13-28. */
export const DARK: Palette = {
  ...BRAND,
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
  dangerRgb: '224,138,106',
  amberRgb: '224,184,74',
  accentText: BRAND.lime,
};

export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Shadows {
  sm: Shadow;
  md: Shadow;
  panel: Shadow;
}

/**
 * --shadow-sm / --shadow-md / --shadow-panel, per theme. rakeen-pos.css
 * deliberately uses small-blur, large-offset shadows (its own comment:
 * large-blur box-shadows measured 1-3s repaint cost on real POS
 * hardware). CSS `0 Ypx Bpx rgba(...)` maps to shadowOffset.height=Y,
 * shadowRadius=B, and the rgba's alpha to shadowOpacity; `elevation` is
 * Android's only knob and is sized to match visually.
 */
const SHADOWS_LIGHT: Shadows = {
  sm: { shadowColor: '#12261A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  md: { shadowColor: '#12261A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.11, shadowRadius: 14, elevation: 4 },
  panel: { shadowColor: '#12261A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 22, elevation: 8 },
};

const SHADOWS_DARK: Shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 14, elevation: 4 },
  panel: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 22, elevation: 8 },
};

/** --r-sm .. --r-full (rakeen-pos.css:39). Theme-independent. */
export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 28,
  full: 999,
};

/** --sp-1 .. --sp-6 (rakeen-pos.css:40). Theme-independent. */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
};

/** --icon-sm/md/lg (rakeen-pos.css:41). */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * Fixed layout dimensions taken straight from rakeen-pos.css rather than
 * chosen here: the order panel is a FIXED 360px column (.order-panel:252,
 * narrowed to 300px between 761-1100px by rakeen-pos-additions.css:417),
 * the category rail is a fixed 84px (.cat-sidebar:161), and the bottom
 * nav is exactly 68px tall (.bottom-nav:351). The 760/761px boundary is
 * the same one rakeen-pos-additions.css:434 uses to switch the whole
 * home screen from side-by-side to stacked.
 */
export const layout = {
  orderPanelWidth: 360,
  orderPanelWidthNarrow: 300,
  catSidebarWidth: 84,
  bottomNavHeight: 68,
  /** @media (min-width:761px) -- side-by-side above this, stacked below. */
  sideBySideMinWidth: 761,
  /** @media (max-width:1100px) and (min-width:761px) -- narrower panel. */
  narrowPanelMaxWidth: 1100,
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

/** Linear-gradient stops, verbatim from rakeen-pos.css. Both stops of
 *  every gradient come from the brand ramp, which is theme-independent,
 *  so these are shared. */
export const gradients = {
  // .product-icon (rakeen-pos.css:214): linear-gradient(155deg, ...)
  productIcon: {
    colors: [
      `rgba(${BRAND.limeRgb},0.2)`,
      `rgba(${BRAND.flagGreenRgb},0.16)`,
      `rgba(${BRAND.limeDeepRgb},0.12)`,
    ],
    locations: [0, 0.55, 1],
    // CSS 155deg is measured from the top, clockwise -- near top-left to
    // near bottom-right.
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
  },
  // .pay-btn (rakeen-pos.css:342) / .confirm-pay-btn (589) /
  // .modifier-add-btn (654): linear-gradient(155deg, lime, lime-deep)
  payButton: {
    colors: [BRAND.lime, BRAND.limeDeep],
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
  },
  // .product-card::before top accent line (rakeen-pos.css:206):
  // linear-gradient(90deg, lime-deep, lime) -- left to right.
  cardAccent: {
    colors: [BRAND.limeDeep, BRAND.lime],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
};

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  shadows: Shadows;
  /** Flips light <-> dark, exactly like .theme-toggle's click handler
   *  (rakeen-pos.js:464-467). Session-only: the PWA persists nothing, so
   *  neither does this. */
  toggle: () => void;
}

const ThemeContext = createContext<Theme>({
  mode: MODE_DEFAULT,
  colors: LIGHT,
  shadows: SHADOWS_LIGHT,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(MODE_DEFAULT);
  const value = useMemo<Theme>(
    () => ({
      mode,
      colors: mode === 'light' ? LIGHT : DARK,
      shadows: mode === 'light' ? SHADOWS_LIGHT : SHADOWS_DARK,
      toggle: () => setMode(m => (m === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds a theme-aware StyleSheet hook for one screen/modal file.
 *
 * StyleSheet.create() at module scope can't see the active theme, which
 * is why every screen's colors used to be frozen at import time. This
 * keeps the same authoring shape (one StyleSheet.create per file) while
 * making it a function of the palette, and caches the result per mode so
 * flipping the toggle builds each sheet at most once per theme rather
 * than on every render. Any component in the file -- including small
 * helpers defined outside the default export -- can call the returned
 * hook, so styles never have to be threaded through props.
 */
export function createStyles<T extends Record<string, unknown>>(
  factory: (colors: Palette, shadows: Shadows) => T,
): () => T {
  const cache = new Map<ThemeMode, T>();
  return function useStyles(): T {
    const { mode, colors, shadows } = useTheme();
    return useMemo(() => {
      const cached = cache.get(mode);
      if (cached) return cached;
      const built = factory(colors, shadows);
      cache.set(mode, built);
      return built;
    }, [mode, colors, shadows]);
  };
}
