import { Image } from 'react-native';
import { Skia, SkFont, SkTypeface } from '@shopify/react-native-skia';

/**
 * Feature Parity Pass -- Real Receipt Rendering. Loads the real IBM
 * Plex Sans Arabic font (same family the PWA already uses for receipts
 * via a Google Fonts <link>, downloaded here as bundled .ttf assets --
 * assets/fonts/IBMPlexSansArabic-{Regular,Bold}.ttf, SIL Open Font
 * License) directly into Skia via MakeFreeTypeFaceFromData, bypassing
 * the OS font system entirely (no Info.plist UIAppFonts entry, no
 * Android assets/fonts/ native linking, no pbxproj edits needed) --
 * Skia manages its own font rendering independent of native platform
 * font registration once it has the raw bytes.
 *
 * `require(...)` on a .ttf file is a normal bundleable Metro asset
 * (`ttf` is in @react-native/metro-config's default assetExts) --
 * `Image.resolveAssetSource` is the standard bare-RN mechanism for
 * turning that into a real, fetchable URI, despite the "Image" name;
 * this works for any registered asset type, not just images.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const REGULAR_ASSET = require('../../assets/fonts/IBMPlexSansArabic-Regular.ttf');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BOLD_ASSET = require('../../assets/fonts/IBMPlexSansArabic-Bold.ttf');

let cachedRegular: SkTypeface | null = null;
let cachedBold: SkTypeface | null = null;

async function loadTypefaceFromAsset(asset: number): Promise<SkTypeface | null> {
  try {
    const source = Image.resolveAssetSource(asset);
    if (!source?.uri) return null;
    const response = await fetch(source.uri);
    const arrayBuffer = await response.arrayBuffer();
    const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
    return Skia.Typeface.MakeFreeTypeFaceFromData(data);
  } catch {
    // A font that fails to load must never crash printing -- the
    // caller falls back to Skia's default system typeface (readable,
    // just not IBM Plex Sans Arabic specifically), same "never let a
    // missing asset block printing" contract as loadRemoteImage().
    return null;
  }
}

export async function loadReceiptTypefaces(): Promise<{ regular: SkTypeface | null; bold: SkTypeface | null }> {
  if (!cachedRegular) cachedRegular = await loadTypefaceFromAsset(REGULAR_ASSET);
  if (!cachedBold) cachedBold = await loadTypefaceFromAsset(BOLD_ASSET);
  return { regular: cachedRegular, bold: cachedBold };
}

export function makeFont(typeface: SkTypeface | null, size: number): SkFont {
  // Skia.Font(null, size) falls back to its built-in default typeface --
  // an honest degradation (readable Latin/generic glyphs, Arabic shaping
  // not guaranteed) rather than throwing when the real font failed to load.
  return Skia.Font(typeface ?? undefined, size);
}
