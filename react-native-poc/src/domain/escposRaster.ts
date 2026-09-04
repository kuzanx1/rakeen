/**
 * A rendered RGBA pixel buffer as an ESC/POS raster image.
 *
 * Uses `GS 8 L` function 112 (store graphics) followed by `GS ( L`
 * function 50 (print), which is the CURRENT graphics command. `GS v 0`,
 * which this replaces, is marked obsolete in Epson's own ESC/POS
 * reference with `GS ( L` named as its replacement.
 *
 * That is not a style preference — it is the measurement. On a SUNMI
 * NT310 at Hbiah, a 694-row receipt sent as `GS v 0` took 45 seconds.
 * Thermal printing runs 5–20ms per dot row, so 694 rows should cost 3.5
 * to 14 seconds at the very worst; 45 seconds is 65ms per row, three to
 * thirteen times outside the physical range. And Foodics on the SAME
 * printer prints a receipt of roughly the same dot-row count in about a
 * second. Same rows, same paper, same hardware, 45x the time — so the
 * cost was never "images are heavy", it was this command taking a slow
 * path through the firmware.
 *
 * The transport was never involved: the trace shows 20ms from connect to
 * the printer closing the stream itself.
 *
 * ONE PIECE, deliberately. An earlier attempt split the image into 128-row
 * bands on the theory that a huge single command was choking the firmware.
 * It did not help, and the reasoning was backwards: fragmenting a raster
 * into many separately-printed parts is a documented CAUSE of slow image
 * printing, not a cure. The band loop is gone.
 */

export interface RgbaBuffer {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Any pixel dark enough to be worth heat. Alpha counts: a transparent
 *  pixel is paper, whatever its colour channels say. */
function isPixelDark(r: number, g: number, b: number, a: number): boolean {
  if (a < 128) return false;
  return (r * 299 + g * 587 + b * 114) / 1000 < 160;
}

function packBitmap(buffer: RgbaBuffer): { bitmap: Uint8Array; bytesPerRow: number } {
  const { width, height, data } = buffer;
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      if (isPixelDark(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2], data[pixelIndex + 3])) {
        bitmap[y * bytesPerRow + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }
  return { bitmap, bytesPerRow };
}

/**
 * `GS 8 L` fn112 + `GS ( L` fn50 — store the graphics, then print them.
 *
 * Layout of the store command, in order:
 *   1D 38 4C  p1 p2 p3 p4  30 70 30  bx by c  xL xH  yL yH  <data>
 *
 *   p1..p4  little-endian 32-bit byte count of everything after it,
 *           i.e. 10 header bytes + the bitmap.
 *   30 70 30  m = 48, fn = 112 ('p'), a = 48.
 *   bx by   horizontal and vertical zoom, 1 each — the image is already
 *           rendered at the printer's own resolution, so scaling here
 *           would only blur it.
 *   c       49, single-colour.
 *   xL xH   width in DOTS (not bytes), little-endian.
 *   yL yH   height in dots, little-endian.
 *
 * `GS 8 L` rather than `GS ( L` for the store: its length field is 32-bit,
 * so a full-length receipt cannot overflow it. The print that follows is
 * the short `GS ( L` form, which takes no data.
 */
export function rgbaToEscPosRaster(buffer: RgbaBuffer): number[] {
  const { width, height } = buffer;
  const { bitmap, bytesPerRow } = packBitmap(buffer);

  const p = 10 + bitmap.length;
  const out: number[] = [
    0x1d, 0x38, 0x4c,
    p & 0xff, (p >> 8) & 0xff, (p >> 16) & 0xff, (p >> 24) & 0xff,
    0x30, 0x70, 0x30,
    0x01, 0x01, 0x31,
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ];
  for (let i = 0; i < bitmap.length; i++) out.push(bitmap[i]);

  // fn50: print what was just stored.
  out.push(0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32);

  void bytesPerRow;
  return out;
}

/**
 * The previous encoder, kept for one reason: `GS ( L` is the modern
 * command but not a universal one, and a printer that ignores it prints
 * nothing at all rather than printing slowly. If that happens on some
 * unit in the field, this is the one-line fallback — not dead code, a
 * documented escape hatch with a known trigger.
 */
export function rgbaToEscPosRasterLegacy(buffer: RgbaBuffer): number[] {
  const { height } = buffer;
  const { bitmap, bytesPerRow } = packBitmap(buffer);
  return [
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    ...Array.from(bitmap),
  ];
}
