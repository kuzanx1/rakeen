import React, { createContext, useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { layout } from './theme';

/**
 * The app-shell geometry every screen has to agree on, so that the
 * >=761px layout in rakeen-pos.css can be reproduced exactly instead of
 * approximated per screen.
 *
 * What the source actually does at that width (rakeen-pos.css:375-443):
 *
 *   .app > .topbar   { position:absolute; top:0; inset-inline:0; z-index:2 }
 *   .bottom-nav      { position:absolute; bottom:0; inset-inline:0; z-index:2 }
 *   .app.home-active > .topbar,
 *   .app.home-active > .bottom-nav { inset-inline-end: <panel width> }
 *
 * Both bars leave normal flow so `.screens` can span the FULL height
 * behind them -- which is the only way .order-panel genuinely reaches the
 * true top and bottom edges as its own uninterrupted column. On Home the
 * bars additionally stop short by the panel's width so nothing floats
 * above that column. Every screen then compensates for the two bars with
 * its own padding; .order-panel deliberately does not, which is the whole
 * point of the arrangement.
 *
 * Below 761px none of this applies: the bars are in normal flow and the
 * zones stack, so `sideBySide` is false and every inset here is zero.
 *
 * topbarHeight is measured live rather than assumed. The source does the
 * same thing for the same reason -- its own comment notes that a
 * hardcoded offset "drifted out of sync with the real, continuously
 * variable height, leaving a gap/overlap band at the seam", because the
 * topbar wraps to two or three lines on narrower tablets. `--topbar-h`
 * there comes from a ResizeObserver; here it comes from onLayout, with
 * the same 52px fallback the CSS uses.
 */

export const TOPBAR_FALLBACK_HEIGHT = 52;

export interface Shell {
  /** @media (min-width:761px) -- order panel beside the grid. */
  sideBySide: boolean;
  /** True while the Home (cashier) screen is the active one. */
  homeActive: boolean;
  /** .order-panel's live width: 360px, or 300px between 761 and 1100. */
  orderPanelWidth: number;
  /** Measured --topbar-h. */
  topbarHeight: number;
  /** .bottom-nav is a flat 68px at every width -- the source notes it
   *  "never varies", so its clearance is a constant, not a measurement. */
  bottomNavHeight: number;
  /** Space a screen must reserve for the absolutely-positioned bars.
   *  Zero below 761px, where both bars are back in normal flow. */
  insetTop: number;
  insetBottom: number;
}

const ShellContext = createContext<Shell>({
  sideBySide: false,
  homeActive: true,
  orderPanelWidth: layout.orderPanelWidth,
  topbarHeight: TOPBAR_FALLBACK_HEIGHT,
  bottomNavHeight: layout.bottomNavHeight,
  insetTop: 0,
  insetBottom: 0,
});

export function ShellProvider({
  homeActive,
  topbarHeight,
  children,
}: {
  homeActive: boolean;
  topbarHeight: number;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const value = useMemo<Shell>(() => {
    const sideBySide = width >= layout.sideBySideMinWidth;
    const orderPanelWidth =
      width <= layout.narrowPanelMaxWidth ? layout.orderPanelWidthNarrow : layout.orderPanelWidth;
    return {
      sideBySide,
      homeActive,
      orderPanelWidth,
      topbarHeight,
      bottomNavHeight: layout.bottomNavHeight,
      insetTop: sideBySide ? topbarHeight : 0,
      insetBottom: sideBySide ? layout.bottomNavHeight : 0,
    };
  }, [width, homeActive, topbarHeight]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): Shell {
  return useContext(ShellContext);
}
