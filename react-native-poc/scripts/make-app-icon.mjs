// Rakeen POS app icon.
//
// The look is taken from the POS's own dark theme, not invented for the
// icon: --canvas #050C08, --flag-green #0B6B3A, --lime #C7FF4D, --ivory
// #FBFAF4. Using the flag green as the middle of the gradient is what
// keeps this off the generic near-black + neon-green shelf the house
// rules warn about — the ramp reads as Saudi, not as a terminal.
//
// Everything an icon has to survive is decided here: one lockup, no
// screenshot, no badge, and margins wide enough that the 60pt render
// still has air around it.
import sharp from 'sharp';
import path from 'node:path';

const OUT = path.resolve('react-native-poc/ios/RakeenPOC/Images.xcassets/AppIcon.appiconset');
const WORDMARK = path.resolve('public/brand/rakeen-wordmark.png');
// The product's own type. A second typeface for three Latin letters is
// how a mark starts looking assembled rather than drawn.
const FONT = path.resolve('react-native-poc/ios/RakeenPOC/Fonts/IBMPlexSansArabic-Bold.ttf');
const S = 1024;

const IVORY = '#FBFAF4';
const LIME = '#C7FF4D';

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
         the icon; a linear ramp reads as the surface itself being lit.
         Straight from brand lime to transparent — a mid-green stop in
         between mixes to olive, which is what made the first passes
         muddy. -->
    <linearGradient id="glow" x1="0.06" y1="1.02" x2="0.72" y2="-0.04">
      <stop offset="0%"   stop-color="#D9FF7A" stop-opacity="0.85"/>
      <stop offset="12%"  stop-color="#C7FF4D" stop-opacity="0.50"/>
      <stop offset="30%"  stop-color="#9DE83F" stop-opacity="0.21"/>
      <stop offset="55%"  stop-color="#4FC24B" stop-opacity="0.07"/>
      <stop offset="80%"  stop-color="#0B6B3A" stop-opacity="0"/>
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
const meta = await sharp(WORDMARK).metadata();
const markW = Math.round(S * 0.58);
const markH = Math.round((meta.height / meta.width) * markW);

const alpha = await sharp(WORDMARK)
  .resize(markW, markH, { fit: 'fill' })
  .ensureAlpha()
  .extractChannel('alpha')
  .toColourspace('b-w')
  .toBuffer();

const mark = await sharp({
  create: { width: markW, height: markH, channels: 3, background: IVORY },
})
  .joinChannel(alpha)
  .png()
  .toBuffer();

// "POS", set in the product's own type and widely tracked.
//
// It is lime rather than ivory for one reason: at this size a second
// ivory line reads as a subtitle competing with the wordmark, while the
// brand accent reads as a mark OF the wordmark. It also puts the lime
// somewhere other than the corner glow, which is what stopped the ramp
// from looking like decoration hung off one edge.
//
// Trimmed because Pango leaves the tracking hanging off the final S; the
// untrimmed box centres three letters plus an invisible fourth space.
const pos = await sharp({
  text: {
    text: `<span letter_spacing="26000" foreground="${LIME}">POS</span>`,
    fontfile: FONT,
    font: 'IBM Plex Sans Arabic Bold',
    dpi: 620,
    rgba: true,
  },
})
  .png()
  .toBuffer()
  .then(b => sharp(b).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true }));

const posW = pos.info.width;
const posH = pos.info.height;

// Wordmark and POS are placed as ONE object, then that object is centred.
// The previous icon centred the wordmark alone and then lifted it 4.5%
// of the frame to compensate for the glow's weight — 46px, enough to
// read as "not centred" rather than as optical correction. The lockup
// carries its own lower half now, so the frame only needs the small lift
// that a bright lower-left corner actually justifies.
const gap = Math.round(S * 0.052);
const lockH = markH + gap + posH;
const lockTop = Math.round((S - lockH) / 2 - S * 0.012);

const base = await sharp(bg)
  .composite([
    { input: mark, top: lockTop, left: Math.round((S - markW) / 2) },
    { input: pos.data, top: lockTop + markH + gap, left: Math.round((S - posW) / 2) },
  ])
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
console.log('wordmark:', markW + '×' + markH, '| POS:', posW + '×' + posH);
console.log('lockup height:', lockH, 'top:', lockTop, '| bottom margin:', S - lockTop - lockH);
