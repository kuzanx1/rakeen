import { inkMask, rgbaToEscPosRasterLegacy, RgbaBuffer } from '../src/domain/escposRaster';
import { resolvePrintDarkness, emptyPrinterProfile } from '../src/domain/printerProfile';

/** صورة بيضاء، ونرسم فيها بكسلات بإضاءة محددة. */
function canvas(width: number, height: number): RgbaBuffer {
  const data = new Uint8Array(width * height * 4).fill(255);
  return { width, height, data };
}
function setLum(b: RgbaBuffer, x: number, y: number, lum: number) {
  const p = (y * b.width + x) * 4;
  b.data[p] = b.data[p + 1] = b.data[p + 2] = lum;
  b.data[p + 3] = 255;
}
const at = (m: Uint8Array, b: RgbaBuffer, x: number, y: number) => m[y * b.width + x];

/** الخوارزمية الأصلية قبل التغميق، حرفياً، للمقارنة. */
function legacyMask(b: RgbaBuffer): Uint8Array {
  const m = new Uint8Array(b.width * b.height);
  for (let i = 0; i < m.length; i++) {
    const p = i * 4, a = b.data[p + 3] / 255;
    const lum = (b.data[p] * 299 + b.data[p + 1] * 587 + b.data[p + 2] * 114) / 1000;
    m[i] = lum * a + 255 * (1 - a) < 160 ? 1 : 0;
  }
  return m;
}

describe('print darkness', () => {
  test('normal (and no option) is byte-identical to the original output', () => {
    const b = canvas(24, 6);
    for (let i = 0; i < 24 * 6; i++) setLum(b, i % 24, Math.floor(i / 24), (i * 37) % 256);
    expect(Array.from(inkMask(b))).toEqual(Array.from(legacyMask(b)));
    expect(Array.from(inkMask(b, { darkness: 'normal' }))).toEqual(Array.from(legacyMask(b)));
    expect(rgbaToEscPosRasterLegacy(b, { darkness: 'normal' })).toEqual(rgbaToEscPosRasterLegacy(b));
  });

  test('dark: a 1-dot vertical stroke becomes 2 dots wide', () => {
    const b = canvas(8, 4);
    for (let y = 0; y < 4; y++) setLum(b, 3, y, 0);
    const m = inkMask(b, { darkness: 'dark' });
    for (let y = 0; y < 4; y++) {
      expect(at(m, b, 3, y)).toBe(1);
      expect(at(m, b, 4, y)).toBe(1);
      expect(at(m, b, 5, y)).toBe(0);
      expect(at(m, b, 2, y)).toBe(0);
    }
  });

  test('dark: grey anti-aliased edge (lum 180) becomes ink, plain paper stays paper', () => {
    const b = canvas(4, 1);
    setLum(b, 0, 0, 180);
    const m = inkMask(b, { darkness: 'dark' });
    expect(at(legacyMask(b), b, 0, 0)).toBe(0);
    expect(at(m, b, 0, 0)).toBe(1);
    expect(at(m, b, 2, 0)).toBe(0);
    expect(at(m, b, 3, 0)).toBe(0);
  });

  test('darker: a 1-dot horizontal stroke becomes 2 dots tall', () => {
    const b = canvas(6, 5);
    for (let x = 0; x < 6; x++) setLum(b, x, 2, 0);
    const m = inkMask(b, { darkness: 'darker' });
    for (let x = 0; x < 6; x++) {
      expect(at(m, b, x, 2)).toBe(1);
      expect(at(m, b, x, 3)).toBe(1);
      expect(at(m, b, x, 1)).toBe(0);
      expect(at(m, b, x, 4)).toBe(0);
    }
  });

  test('protected area (QR / logo / black bar) is left exactly as normal', () => {
    const b = canvas(10, 10);
    // نمط رقعة شطرنج داخل المنطقة المحمية + رمادي 180
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) setLum(b, x, y, (x + y) % 2 ? 0 : 180);
    const protect = [{ x: 2, y: 2, w: 6, h: 6 }];
    const normal = legacyMask(b);
    const m = inkMask(b, { darkness: 'darker', protect });
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      expect(at(m, b, x, y)).toBe(at(normal, b, x, y));
    }
  });
});

describe('resolvePrintDarkness', () => {
  test('SUNMI InnerPrinter defaults to normal, any other printer to dark', () => {
    const net = emptyPrinterProfile();
    expect(resolvePrintDarkness(net)).toBe('dark');
    expect(resolvePrintDarkness({ ...net, transport: 'bluetooth', bluetoothId: 'x', bluetoothName: 'InnerPrinter' })).toBe('normal');
    expect(resolvePrintDarkness({ ...net, transport: 'bluetooth', bluetoothId: 'x', bluetoothName: 'XP-P323B' })).toBe('dark');
    expect(resolvePrintDarkness(null)).toBe('dark');
  });
  test('an explicit choice always wins', () => {
    const inner = { ...emptyPrinterProfile(), transport: 'bluetooth' as const, bluetoothId: 'x', bluetoothName: 'InnerPrinter' };
    expect(resolvePrintDarkness({ ...inner, printDarkness: 'darker' })).toBe('darker');
    expect(resolvePrintDarkness({ ...emptyPrinterProfile(), printDarkness: 'normal' })).toBe('normal');
  });
});
