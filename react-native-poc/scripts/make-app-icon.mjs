// Rakeen POS app icon.
//
// The look is taken from the POS's own dark theme, not invented for the
// icon: --canvas #050C08, --flag-green #0B6B3A, --lime #C7FF4D, --ivory
// #FBFAF4. Using the flag green as the middle of the gradient is what
// keeps this off the generic near-black + neon-green shelf the house
// rules warn about — the ramp reads as Saudi, not as a terminal.
//
// Everything an icon has to survive is decided here: one mark, no text,
// no screenshot, no badge, and margins wide enough that the 60pt render
// still has air around it.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('react-native-poc/ios/RakeenPOC/Images.xcassets/AppIcon.appiconset');
const WORDMARK = path.resolve('public/brand/rakeen-wordmark.png');
const S = 1024;

// The glow sits low and off-centre, the way light falls on a card rather
// than the way a lamp points at a wall. A perfectly centred radial reads
// as a button; an offset one reads as a surface.
const bg = Buffer.from(`
<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ground" x1="0.15" y1="0" x2="0.6" y2="1">
      <stop offset="0%"   stop-color="#080B0A"/>
      <stop offset="55%"  stop-color="#0B120F"/>
      <stop offset="100%" stop-color="#101A15"/>
    </linearGradient>
    <!-- A diagonal SHEET of light, not a spot. A radial put a visible
         circular hot-spot low-centre, which reads as a torch pointed at
         the icon; a linear ramp from the bottom-left corner reads as the
         surface itself being lit. The ramp goes straight from brand lime
         to transparent — a mid-green stop in between mixes to olive,
         which is what made the first two passes look muddy. -->
    <linearGradient id="glow" x1="0.04" y1="1" x2="0.62" y2="0.06">
      <stop offset="0%"   stop-color="#C7FF4D" stop-opacity="1"/>
      <stop offset="18%"  stop-color="#9DE83F" stop-opacity="0.66"/>
      <stop offset="40%"  stop-color="#4FC24B" stop-opacity="0.22"/>
      <stop offset="68%"  stop-color="#0B6B3A" stop-opacity="0"/>
    </linearGradient>
    <!-- A single soft highlight along the top edge. Depth on a real card
         comes from one light source, not from an outline on every side. -->
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FBFAF4" stop-opacity="0.10"/>
      <stop offset="18%"  stop-color="#FBFAF4" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#ground)"/>
  <rect width="${S}" height="${S}" fill="url(#glow)"/>
  <rect width="${S}" height="${S}" fill="url(#sheen)"/>
</svg>`);

// The wordmark ships lime on transparent. Its alpha is the shape, so the
// shape is lifted out and refilled with ivory — the mark has to stay the
// brightest thing in the frame, and lime on a lime glow would not.
const src = sharp(WORDMARK);
const meta = await src.metadata();
const markW = Math.round(S * 0.50);
const markH = Math.round((meta.height / meta.width) * markW);

const alpha = await sharp(WORDMARK)
  .resize(markW, markH, { fit: 'fill' })
  .ensureAlpha()
  .extractChannel('alpha')
  .toColourspace('b-w')
  .toBuffer();

const mark = await sharp({
  create: { width: markW, height: markH, channels: 3, background: '#FBFAF4' },
})
  .joinChannel(alpha)
  .png()
  .toBuffer();

// Optically centred, not mathematically: the glow weights the lower half,
// so a mark on the true centre line looks like it has sagged.
const top = Math.round((S - markH) / 2 - S * 0.075);
const left = Math.round((S - markW) / 2);

const base = await sharp(bg)
  .composite([{ input: mark, top, left }])
  .png()
  .toBuffer();

// 1024 is the marketing size and must be fully opaque with square corners
// — iOS applies its own mask, and an icon that arrives pre-rounded gets
// rounded twice.
const sizes = {
  'icon-1024.png': 1024,
  'icon-20@2x.png': 40, 'icon-20@3x.png': 60,
  'icon-29@2x.png': 58, 'icon-29@3x.png': 87,
  'icon-40@2x.png': 80, 'icon-40@3x.png': 120,
  'icon-60@2x.png': 120, 'icon-60@3x.png': 180,
  'icon-76@2x.png': 152, 'icon-83.5@2x.png': 167,
};

for (const [file, px] of Object.entries(sizes)) {
  await sharp(base)
    .resize(px, px, { kernel: 'lanczos3' })
    .flatten({ background: '#080B0A' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));
}

console.log('wrote', Object.keys(sizes).length, 'icons to', OUT);
console.log('mark:', markW + '×' + markH, 'at', left + ',' + top);
