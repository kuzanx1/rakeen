import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, RgbaBuffer } from '../src/domain/escposRaster';

/**
 * Locks the raster command that actually reaches paper.
 *
 * This exists because of a real receipt handed to a real customer at
 * Hbiah: the app had been switched to `GS 8 L` fn112 / `GS ( L` fn50 on
 * the theory that the obsolete `GS v 0` was what made printing take 45
 * seconds. The printer does not implement fn112 — and an ESC/POS printer
 * that does not know a command does not ignore it, it prints the payload
 * as characters. A whole slip of `<<<<` and `aaaa`.
 *
 * Nothing caught it, because every test in the repo asserted what the
 * bitmap PACKING did and none asserted which command wrapped it.
 *
 * So: the byte-level assertions below are the guard. If someone flips the
 * default back to the modern command, this fails before a build reaches a
 * counter — not after a customer is holding the paper.
 */

/** A 16x2 buffer: left half black, right half white, fully opaque. */
function stripeBuffer(): RgbaBuffer {
  const width = 16, height = 2;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = x < 8 ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('GS v 0 is what a printer actually receives', () => {
  it('emits the GS v 0 header, with width in BYTES and height in DOTS', () => {
    const out = rgbaToEscPosRasterLegacy(stripeBuffer());
    // 1D 76 30 00 — GS v 0, mode 0 (normal, no scaling).
    expect(out.slice(0, 4)).toEqual([0x1d, 0x76, 0x30, 0x00]);
    // xL xH = bytes per row. 16 dots wide = 2 bytes, NOT 16 — the single
    // easiest field in this command to get wrong, and a wrong value here
    // shifts every row and prints diagonal mush.
    expect(out.slice(4, 6)).toEqual([2, 0]);
    // yL yH = rows, in dots.
    expect(out.slice(6, 8)).toEqual([2, 0]);
    // 8 header bytes + 2 bytes/row * 2 rows.
    expect(out).toHaveLength(12);
    // Left half black -> high bit first. MSB-first packing, per spec.
    expect(out.slice(8, 12)).toEqual([0xff, 0x00, 0xff, 0x00]);
  });

  it('does NOT emit the modern command that Hbiah printed as text', () => {
    const out = rgbaToEscPosRasterLegacy(stripeBuffer());
    expect(out.slice(0, 3)).not.toEqual([0x1d, 0x38, 0x4c]); // GS 8 L
  });

  it('still offers the modern encoder for a printer that proves it works', () => {
    const out = rgbaToEscPosRaster(stripeBuffer());
    expect(out.slice(0, 3)).toEqual([0x1d, 0x38, 0x4c]);
    // fn50 print-stored-graphics must terminate it, or the image is
    // stored and never printed — a silent blank slip.
    expect(out.slice(-7)).toEqual([0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32]);
  });

  it('encodes a full-length receipt height without overflowing the field', () => {
    // 694 rows is the real Hbiah receipt that started all of this. The
    // height field is two bytes little-endian: 694 = 0xB6 0x02.
    const width = 576, height = 694;
    const buffer: RgbaBuffer = { width, height, data: new Uint8Array(width * height * 4) };
    const out = rgbaToEscPosRasterLegacy(buffer);
    expect(out.slice(4, 8)).toEqual([72, 0, 0xb6, 0x02]); // 576/8 = 72 bytes
    expect(out).toHaveLength(8 + 72 * 694);
  });
});

/**
 * حوافُّ الحروف المُنعَّمة -- وهي أكثرُ الحرف الرفيع في العربية.
 *
 * سطحُ Skia يبدأ شفافاً، فما يُرسم عليه يحمل ألفا التغطية. وبوّابةُ
 * a < 128 كانت تُسقط كلَّ تغطيةٍ دونها، فيسقط الحرفُ الرفيع كلُّه
 * ويخرج مقطوعاً بينما جارُه السميك أسودُ تامّ.
 */
describe('anti-aliased strokes survive the 1-bit threshold', () => {
  /** بكسل واحد بلونٍ وتغطية، ونسأل: أصار حبراً؟ */
  const inks = (r: number, g: number, b: number, a: number): boolean => {
    const bytes = rgbaToEscPosRasterLegacy({
      width: 1, height: 1, data: new Uint8Array([r, g, b, a]),
    });
    // آخرُ بايت هو صفُّ البكسل الواحد: البتُّ الأعلى مضاءٌ إن كان حبراً.
    return (bytes[bytes.length - 1] & 0x80) !== 0;
  };

  it('keeps a black pixel at partial coverage that the old alpha gate dropped', () => {
    // تغطية ١١٠: سطوعُها الفعليّ على أبيض ١٤٥ -- حبر. وكانت تُسقط.
    expect(inks(0, 0, 0, 110)).toBe(true);
    expect(inks(0, 0, 0, 128)).toBe(true);
    expect(inks(0, 0, 0, 255)).toBe(true);
  });

  it('still treats a faint edge as paper', () => {
    // تغطية ٩٠ فأقلّ: حافّةٌ باهتة لا حرف.
    expect(inks(0, 0, 0, 90)).toBe(false);
    expect(inks(0, 0, 0, 30)).toBe(false);
    expect(inks(0, 0, 0, 0)).toBe(false);
  });

  it('leaves white paper white however opaque', () => {
    expect(inks(255, 255, 255, 255)).toBe(false);
  });
});
