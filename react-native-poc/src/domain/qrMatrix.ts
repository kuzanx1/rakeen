// @ts-ignore -- qrcode-generator's shipped .d.ts models its legacy global-function API loosely
import qrcodegen from 'qrcode-generator';

/**
 * Feature Parity Pass -- Real Receipt Rendering. The PWA fetches a
 * pre-rendered QR SVG from a server API (/api/qr); RN generates the
 * bit-matrix itself using `qrcode-generator` (pure JS, no native
 * dependency, no network round-trip) so a receipt's QR can render with
 * Internet OFF. This module only turns a string into a 2D boolean grid
 * -- domain/receiptRender.ts is responsible for actually drawing it
 * (as a grid of filled squares) onto the Skia canvas.
 */
export interface QrMatrix {
  size: number; // modules per side (including the quiet-zone-free matrix itself)
  isDark: (row: number, col: number) => boolean;
}

/** Error correction level 'M' (15% recovery) -- matches common ESC/POS
 *  thermal-printer QR expectations; ZATCA doesn't mandate a specific
 *  level, so this is a reasonable, disclosed default, not a compliance
 *  requirement being invented. Type-0 auto-selects the smallest version
 *  that fits the payload. */
export function buildQrMatrix(data: string): QrMatrix {
  const qr = qrcodegen(0, 'M');
  qr.addData(data);
  qr.make();
  const size = qr.getModuleCount();
  return {
    size,
    isDark: (row: number, col: number) => qr.isDark(row, col),
  };
}
