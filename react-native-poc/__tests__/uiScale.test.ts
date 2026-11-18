jest.mock('../src/infrastructure/mmkvStorage', () => ({
  getItemSync: () => null,
  setItem: async () => {},
}));

import { scaleStyleSheet, UI_SCALES } from '../src/ui/theme';

describe('scaleStyleSheet («حجم الواجهة»)', () => {
  const sheet = {
    card: { width: 128, padding: 10, borderRadius: 24, borderWidth: 1, flex: 1, opacity: 0.5, fontSize: 12 },
    icon: { width: '100%', height: 72, position: 'absolute', top: 8, end: 5 },
  } as const;

  it('returns the same sheet at normal size', () => {
    expect(scaleStyleSheet(sheet, 1)).toBe(sheet);
  });

  it('scales sizes, spacing and fonts, keeps borders/flex/opacity/percent', () => {
    const s = scaleStyleSheet(sheet, 1.3) as any;
    expect(s.card).toEqual({ width: 166.5, padding: 13, borderRadius: 31, borderWidth: 1, flex: 1, opacity: 0.5, fontSize: 15.5 });
    expect(s.icon).toEqual({ width: '100%', height: 93.5, position: 'absolute', top: 10.5, end: 6.5 });
  });

  it('starts on normal and offers only sane sizes', () => {
    expect(UI_SCALES[0].value).toBe(1);
    expect(Math.max(...UI_SCALES.map(s => s.value))).toBeLessThanOrEqual(1.5);
  });
});
