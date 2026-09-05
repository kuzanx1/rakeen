import { Skia } from '@shopify/react-native-skia';
import { loadRemoteImage } from '../platform/receiptCanvas';
import { cacheLogo, isLogoCached } from '../domain/receiptRenderEscPos';
import { PrinterCapabilityProfile } from '../domain/printerCapability';

/**
 * Prepares the business logo once, for every receipt after it.
 *
 * The text path had a logo cache and nothing that filled it, so the logo
 * silently never printed — the receipt looked finished and was missing the
 * one element the owner asked for by name. Found by tracing the call graph
 * rather than by looking at output, which is the only way a missing call
 * shows up.
 *
 * The pipeline, run exactly once per logo:
 *
 *   fetch → draw at the printer's own width → read pixels → 1-bit → pack
 *
 * Never at the source resolution. Hbiah's logo is 1536px wide against a
 * 576-dot head: sending it whole would be three times the data for a
 * printer that must throw two thirds of it away, slowly.
 *
 * A failure here is never fatal. A receipt without a logo is a receipt; a
 * receipt that did not print because a logo host was slow is a lost sale.
 *
 * NOT trimmed here on purpose. A logo file usually carries its own margin
 * (Hbiah's is 1536x1024 with the mark floating in the middle), and that
 * margin prints as blank paper between the logo and the name. Trimming it
 * belongs in the upload, where the owner can see the result -- doing it at
 * print time would silently change how their mark is framed, and a mark
 * whose spacing the owner chose is not ours to crop.
 */

/** Share of the paper the logo occupies. Wide enough to read a mark,
 *  narrow enough that it does not become the receipt. */
const LOGO_WIDTH_SHARE = 0.42;

export async function ensureLogoCached(
  url: string | undefined,
  caps: PrinterCapabilityProfile,
): Promise<boolean> {
  if (!url) return false;
  if (isLogoCached(url)) return true;

  try {
    const image = await loadRemoteImage(url);
    if (!image) return false;

    const targetW = Math.round(caps.printableDots * LOGO_WIDTH_SHARE);
    const scale = targetW / image.width();
    const targetH = Math.max(1, Math.round(image.height() * scale));

    // Drawn onto an opaque white surface rather than read straight from
    // the source: a logo with transparency would otherwise threshold its
    // transparent pixels against whatever happened to be in memory.
    const surface = Skia.Surface.MakeOffscreen(targetW, targetH);
    if (!surface) return false;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('#ffffff'));
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, targetW, targetH),
      Skia.Paint(),
    );
    surface.flush();

    const snapshot = surface.makeImageSnapshot();
    const pixels = snapshot.readPixels(0, 0, {
      width: targetW,
      height: targetH,
      colorType: snapshot.getImageInfo().colorType,
      alphaType: snapshot.getImageInfo().alphaType,
    });
    if (!pixels) return false;

    cacheLogo(url, { width: targetW, height: targetH, data: pixels as Uint8Array }, caps);
    return true;
  } catch {
    // Never block a sale on a logo.
    return false;
  }
}
