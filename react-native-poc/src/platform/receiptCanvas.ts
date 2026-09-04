import { Skia, AlphaType, ColorType } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import type { RgbaBuffer } from '../domain/escposRaster';

/**
 * Feature Parity Pass -- Real Receipt Rendering. Thin wrapper around
 * @shopify/react-native-skia's CORE, static/offscreen drawing API --
 * deliberately NOT the `<Canvas>` React component or any animation
 * hook. This is a real architectural decision, not an oversight:
 * react-native-skia's newer versions declare `react-native-reanimated`/
 * `react-native-worklets` as peer dependencies, but the package's own
 * `peerDependenciesMeta` marks both `optional: true`, and its
 * `ReanimatedProxy` only `require()`s Reanimated lazily, the first time
 * an animation-specific API is actually touched (confirmed by reading
 * the installed package's own source, not assumed from documentation).
 * Using only `Skia.Surface.Make` + the plain canvas draw calls avoids
 * that entire dependency chain -- a deliberately minimal-dependency
 * choice, consistent with this project's MMKV-v3-over-v4 precedent
 * (Checkpoint 8) of avoiding an unnecessary second native system.
 *
 * UNVERIFIED beyond real CI compilation from this environment: Windows
 * cannot run React Native's JSI native modules, so actual on-device
 * rendering (does Skia's native text shaping correctly join/reorder
 * Arabic glyphs, does the offscreen surface produce real, printable
 * pixels) needs a real iOS/Android runtime. What IS verified here is
 * that this exact import/usage compiles and links on both platforms'
 * real build toolchains (see the CI run this shipped with).
 */

export interface ReceiptSurface {
  widthPx: number;
  heightPx: number;
  /** Real drawing handle -- callers use this exactly like a Canvas 2D
   *  context (drawText/drawImage/drawRect/drawLine), just via Skia's
   *  own canvas API shape instead of the DOM's. */
  canvas: SkCanvas;
  /** Reads back the drawn pixels as a plain RGBA buffer, ready for
   *  domain/escposRaster.ts's pure rgbaToEscPosRaster() -- the actual
   *  ESC/POS byte packing is NOT Skia-specific, by design, so it stays
   *  in the zero-I/O domain layer and stays testable there.
   *
   *  `contentHeightPx` crops the readback to just the top N rows -- the
   *  PWA's real renderReceiptCanvas() allocates a generously-tall
   *  scratch canvas up front (Skia surfaces, like DOM canvases, can't be
   *  resized after creation) then blits only the actually-used height
   *  into a second, exact-size canvas before rasterizing, so a short
   *  receipt never prints a page of blank paper. Same two-step here:
   *  render into a tall surface while tracking a running Y cursor, then
   *  read back only that cursor's final height. */
  toRgba(contentHeightPx?: number): RgbaBuffer;
}

export function createReceiptSurface(widthPx: number, heightPx: number): ReceiptSurface {
  const surface = Skia.Surface.Make(widthPx, heightPx);
  if (!surface) {
    throw new Error('Skia.Surface.Make returned null -- could not allocate an offscreen surface');
  }
  const canvas = surface.getCanvas();

  return {
    widthPx,
    heightPx,
    canvas,
    toRgba(contentHeightPx?: number): RgbaBuffer {
      const readHeight = Math.max(1, Math.min(contentHeightPx ?? heightPx, heightPx));
      surface.flush();
      const image = surface.makeImageSnapshot();
      const pixels = image.readPixels(0, 0, {
        width: widthPx,
        height: readHeight,
        alphaType: AlphaType.Unpremul,
        colorType: ColorType.RGBA_8888,
      });
      if (!pixels) {
        throw new Error('Skia image.readPixels returned null -- could not read back rendered pixels');
      }
      // readPixels() returns the pixel array directly (Uint8Array for
      // RGBA_8888) -- NOT an object wrapping a .buffer. Confirmed by
      // reading the installed package's own type declaration
      // (Image.ts's readPixels signature), not assumed.
      return { width: widthPx, height: readHeight, data: pixels as Uint8Array };
    },
  };
}

/**
 * الصورة المفكوكة الأخيرة ورابطها.
 *
 * كانت تُجلب من الشبكة مع **كل فاتورة**: رحلة إلى التخزين قبل أن تتحرك
 * الطابعة، داخل مسار الطباعة نفسه. والشعار لا يتغيّر بين فاتورة وأخرى.
 *
 * مدخل واحد يكفي: الجهاز الواحد يطبع لمنشأة واحدة، فمفتاح أكبر من ذلك
 * يحمل تعقيداً بلا مقابل. تغيّر الرابط يُبطل المخزون من نفسه.
 */
let cachedLogoUrl: string | null = null;
let cachedLogoImage: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;

export function clearRemoteImageCache(): void {
  cachedLogoUrl = null;
  cachedLogoImage = null;
}

export async function loadRemoteImage(url: string): Promise<ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null> {
  if (cachedLogoUrl === url && cachedLogoImage) return cachedLogoImage;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (image) {
      cachedLogoUrl = url;
      cachedLogoImage = image;
    }
    return image;
  } catch {
    // A missing/slow logo must never block printing -- same "never
    // throw, resolve null" contract as the PWA's own loadLogoImage().
    return null;
  }
}
