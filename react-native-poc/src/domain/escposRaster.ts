/**
 * Feature Parity Pass -- Real Receipt Rendering. Ported from the real
 * PWA's canvasToEscPosRaster() (public/pos/rakeen-pos.js): converts a
 * rendered RGBA pixel buffer into an ESC/POS `GS v 0` raster image
 * command. Pure function -- takes raw pixels in, bytes out, no canvas/
 * Skia dependency at all -- so it's independently testable with a
 * synthetic pixel buffer, the same way the PWA's real algorithm can be
 * (and was) reasoned about without a browser.
 *
 * Same thresholding as the source: luminance = 0.299R + 0.587G + 0.114B,
 * a pixel is "dark" (bit set) when luminance < 160 AND alpha > 10 (a
 * fully/mostly transparent pixel is never printed as ink, matching how
 * the PWA's canvas has a transparent, not white, background before
 * anything is drawn on it).
 */

export interface RgbaBuffer {
  width: number;
  height: number;
  /** Length must be width*height*4, RGBA, one byte per channel, row-major. */
  data: Uint8Array | Uint8ClampedArray;
}

const LUMINANCE_THRESHOLD = 160;
const ALPHA_THRESHOLD = 10;

export function isPixelDark(r: number, g: number, b: number, a: number): boolean {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < LUMINANCE_THRESHOLD && a > ALPHA_THRESHOLD;
}

/**
 * Returns ESC/POS raster bytes: a SEQUENCE of `GS v 0` commands, one per
 * horizontal band of RASTER_BAND_ROWS rows. Each carries the 8-byte
 * header (`1D 76 30 00 xL xH yL yH`, x = bytes-per-row, y = that band's
 * height, both little-endian 16-bit) followed by that band's packed
 * 1-bpp bitmap, MSB-first within each byte (bit 7 = leftmost pixel).
 *
 * Was a single command spanning the whole receipt. See RASTER_BAND_ROWS
 * for the hardware measurement that changed it.
 */
/**
 * عدد الأسطر النقطية في الشريحة الواحدة.
 *
 * ١٢٨ سطراً ≈ ١٦ مم من الورق ≈ ٩ كيلوبايت بعرض ٥٧٦ نقطة. الرقم قابل
 * للضبط: لو بقيت الطباعة بطيئة على عتاد ما فالمحاولة التالية أصغر
 * (٦٤ أو ٢٤)، ولو لم يتغيّر شيء فالسبب ليس هنا.
 */
export const RASTER_BAND_ROWS = 128;

export function rgbaToEscPosRaster(buffer: RgbaBuffer): number[] {
  const { width, height, data } = buffer;
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      const a = data[pixelIndex + 3];
      if (isPixelDark(r, g, b, a)) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        const bitPosition = 7 - (x & 7);
        bitmap[byteIndex] |= 1 << bitPosition;
      }
    }
  }

  // شريحة شريحة، لا كتلة واحدة. قياس على NT310 حقيقي: فاتورة ٨٧ مم
  // بأمر واحد ارتفاعه ٦٩٤ سطراً استغرقت ٣٠ ثانية (٣ مم/ث) بينما
  // الطابعة تطبع ٢٠٠+ مم/ث ونصيبنا من الوقت ٢٠ ملّي ثانية فقط. الصورة
  // على الورق واحدة؛ الفرق أن البرنامج الثابت يعالج شريحة صغيرة في
  // مساره السريع بدل بلع الصورة كلها.
  const out: number[] = [];
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;

  for (let top = 0; top < height; top += RASTER_BAND_ROWS) {
    const rows = Math.min(RASTER_BAND_ROWS, height - top);
    out.push(0x1d, 0x76, 0x30, 0x00, xL, xH, rows & 0xff, (rows >> 8) & 0xff);
    const from = top * bytesPerRow;
    const to = from + rows * bytesPerRow;
    for (let i = from; i < to; i++) out.push(bitmap[i]);
  }

  return out;
}
