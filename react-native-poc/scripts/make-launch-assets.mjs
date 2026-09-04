// Launch-screen wordmark for the iOS asset catalogue.
//
// The storyboard cannot animate and cannot run code — it is drawn by the
// system before a single line of ours executes. So it gets exactly one
// job: be the still frame the app icon expands INTO. iOS zooms the icon
// out into the launch screen on open, and a mismatch between the two
// reads as a flash. Same ground colour as the icon, same ivory wordmark,
// same proportion — so the open looks like one continuous move.
//
// The lime brand moment belongs in the layer AFTER this one (see
// src/ui/WelcomeSplash.tsx), which can actually animate.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const WORDMARK = path.resolve('public/brand/rakeen-wordmark.png');
const OUT = path.resolve('react-native-poc/ios/RakeenPOC/Images.xcassets/LaunchWordmark.imageset');
fs.mkdirSync(OUT, { recursive: true });

const IVORY = '#FBFAF4';
// 1x is the @1x point size; the storyboard pins a fixed width in points
// and the catalogue serves the right density.
const BASE_W = 190;

const meta = await sharp(WORDMARK).metadata();

for (const scale of [1, 2, 3]) {
  const w = BASE_W * scale;
  const h = Math.round((meta.height / meta.width) * w);

  // The source ships lime on transparent; its alpha is the shape, so the
  // shape is lifted out and refilled with ivory — same treatment as the
  // icon, so the two are literally the same mark.
  const alpha = await sharp(WORDMARK)
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .extractChannel('alpha')
    .toColourspace('b-w')
    .toBuffer();

  await sharp({ create: { width: w, height: h, channels: 3, background: IVORY } })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `wordmark@${scale}x.png`));
}

fs.writeFileSync(
  path.join(OUT, 'Contents.json'),
  JSON.stringify(
    {
      images: [1, 2, 3].map(s => ({
        idiom: 'universal',
        filename: `wordmark@${s}x.png`,
        scale: `${s}x`,
      })),
      info: { version: 1, author: 'xcode' },
    },
    null,
    2,
  ) + '\n',
);

console.log('wrote LaunchWordmark.imageset at', BASE_W, 'pt wide');

// The RN splash lays the wordmark on a LIME sheet, and the shipped mark is
// lime on transparent — invisible on itself. Same alpha, ink fill.
const INK = '#0A0F0C';
const inkW = 570; // 190pt at @3x, downscaled by RN for smaller densities
const inkH = Math.round((meta.height / meta.width) * inkW);
const inkAlpha = await sharp(WORDMARK)
  .resize(inkW, inkH, { fit: 'fill' })
  .ensureAlpha()
  .extractChannel('alpha')
  .toColourspace('b-w')
  .toBuffer();
await sharp({ create: { width: inkW, height: inkH, channels: 3, background: INK } })
  .joinChannel(inkAlpha)
  .png({ compressionLevel: 9 })
  .toFile(path.resolve('react-native-poc/assets/brand/rakeen-wordmark-ink.png'));
console.log('wrote assets/brand/rakeen-wordmark-ink.png', inkW + 'x' + inkH);

// The RN layer cross-fades the SAME mark from ivory (on the dark ground)
// to ink (once the lime has passed it), so it needs both at one size.
const ivoryAlpha = await sharp(WORDMARK)
  .resize(inkW, inkH, { fit: 'fill' })
  .ensureAlpha()
  .extractChannel('alpha')
  .toColourspace('b-w')
  .toBuffer();
await sharp({ create: { width: inkW, height: inkH, channels: 3, background: IVORY } })
  .joinChannel(ivoryAlpha)
  .png({ compressionLevel: 9 })
  .toFile(path.resolve('react-native-poc/assets/brand/rakeen-wordmark-ivory.png'));
console.log('wrote assets/brand/rakeen-wordmark-ivory.png', inkW + 'x' + inkH);
