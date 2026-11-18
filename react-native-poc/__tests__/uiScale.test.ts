jest.mock('../src/infrastructure/mmkvStorage', () => ({
  getItemSync: () => null,
  setItem: async () => {},
}));

import { autoScaleFor, effectiveScale, layout, scaleStyleSheet, UI_SCALES } from '../src/ui/theme';

describe('scaleStyleSheet', () => {
  const sheet = {
    card: { width: 128, padding: 10, borderRadius: 24, borderWidth: 1, flex: 1, opacity: 0.5, fontSize: 12, aspectRatio: 1.5 },
    icon: { width: '100%', height: 72, position: 'absolute', top: 8, end: 5 },
  } as const;

  it('returns the same sheet at 100%', () => {
    expect(scaleStyleSheet(sheet, 1)).toBe(sheet);
  });

  it('scales sizes, spacing and fonts; keeps borders, flex, opacity, percent, aspectRatio', () => {
    const s = scaleStyleSheet(sheet, 1.3) as any;
    expect(s.card).toEqual({ width: 166.5, padding: 13, borderRadius: 31, borderWidth: 1, flex: 1, opacity: 0.5, fontSize: 15.5, aspectRatio: 1.5 });
    expect(s.icon).toEqual({ width: '100%', height: 93.5, position: 'absolute', top: 10.5, end: 6.5 });
  });
});

/**
 * The screens Rakeen actually runs on, as Android reports them to the app
 * (dp = px / (dpi / 160)). Each must get a sane scale, and the layout math
 * that shell.tsx and ProductsScreen.tsx do with it must fit on the screen.
 */
const SCREENS: { name: string; w: number; h: number; expect: number }[] = [
  { name: 'phone portrait (411x914)', w: 411, h: 914, expect: 0.9 },
  { name: 'small phone (360x780)', w: 360, h: 780, expect: 0.9 },
  { name: 'SUNMI V2s handheld (360x720)', w: 360, h: 720, expect: 0.9 },
  { name: '8" tablet landscape (1280x800)', w: 1280, h: 800, expect: 1.1 },
  { name: 'SUNMI D3/T2 (1280x720)', w: 1280, h: 720, expect: 1 },
  { name: 'SUNMI T2s 213dpi (1440x811)', w: 1442, h: 811, expect: 1.15 },
  { name: '10" tablet (1340x800)', w: 1340, h: 800, expect: 1.1 },
  { name: 'iPad landscape (1180x820)', w: 1180, h: 820, expect: 1.15 },
  { name: 'rewaa R10a 15.6" (1920x1080 @160)', w: 1920, h: 1080, expect: 1.5 },
  { name: '21" 1080p @160 (1920x1080)', w: 1920, h: 1080, expect: 1.5 },
  { name: '4K-ish @160 (2560x1440) — capped', w: 2560, h: 1440, expect: 1.5 },
];

/** Same formulas as shell.tsx + ProductsScreen.tsx gridColumns. */
function layoutFor(w: number, h: number, scale: number) {
  const designWidth = w / scale;
  const sideBySide = designWidth >= layout.sideBySideMinWidth;
  const orderPanelWidth = Math.round(
    (designWidth <= layout.narrowPanelMaxWidth ? layout.orderPanelWidthNarrow : layout.orderPanelWidth) * scale,
  );
  const sidePadding = 40 * scale;
  const gap = 10 * scale;
  const available = sideBySide ? w - layout.catSidebarWidth * scale - orderPanelWidth - sidePadding : w - sidePadding;
  const minTile = (sideBySide ? 128 : 122) * scale;
  const columns = Math.max(1, Math.floor(available / minTile));
  const tile = (available - gap * (columns - 1)) / columns;
  const bottomNav = layout.bottomNavHeight * scale;
  return { sideBySide, orderPanelWidth, available, columns, tile, bottomNav, minTile, h };
}

describe.each(SCREENS)('$name', ({ w, h, expect: want }) => {
  const scale = autoScaleFor(w, h);

  it(`auto scale = ${want}`, () => {
    expect(scale).toBeCloseTo(want, 5);
  });

  it('products, cart and bars fit on the screen', () => {
    const L = layoutFor(w, h, scale);
    expect(L.available).toBeGreaterThan(0);
    expect(L.columns).toBeGreaterThanOrEqual(2);
    // the grid divides before taking out the gaps (old behaviour), so a tile can
    // come out a few percent under the minimum -- never more than 10%.
    expect(L.tile).toBeGreaterThanOrEqual(L.minTile * 0.9);
    expect(L.tile).toBeLessThan(L.minTile * 2);
    // the cart never eats more than half of a side-by-side screen
    if (L.sideBySide) expect(L.orderPanelWidth).toBeLessThanOrEqual(w / 2);
    // the bottom bar stays a bar, not a third of the screen
    expect(L.bottomNav).toBeLessThan(h * 0.15);
  });

  it('same layout decisions as the design screen at the same design width', () => {
    // R10a at 1.5 must decide exactly like a SUNMI at 1.0 (both 1280 wide in design units).
    const L = layoutFor(w, h, scale);
    const D = layoutFor(w / scale, h / scale, 1);
    expect(L.sideBySide).toBe(D.sideBySide);
    expect(L.columns).toBe(D.columns);
  });
});

describe('«حجم الواجهة» on top of automatic', () => {
  it('starts on automatic, with one smaller and two bigger steps', () => {
    expect(UI_SCALES.map(s => s.value)).toEqual([0.9, 1, 1.15, 1.3]);
  });
  it('the combined size is capped so nothing explodes', () => {
    expect(effectiveScale(1.5, 1.3)).toBe(1.8);
    expect(effectiveScale(0.9, 0.9)).toBe(0.8);
    expect(effectiveScale(1, 1)).toBe(1);
  });
});
