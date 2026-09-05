// Renders an ESC/POS byte stream the way the NT310 at Hbiah actually
// behaves, so a receipt can be checked without the printer in the room.
//
// This exists because the alternative is a build-print-photograph loop
// that costs the owner a person standing at a till, and we burned an
// evening on exactly that. Every behaviour modelled here was OBSERVED on
// that printer, not assumed:
//
//   * Arabic glyphs exist and words are shaped correctly.
//   * WORD ORDER is not reordered: "مرحبا بك" printed as "بك مرحبا".
//     The printer lays runs down in the order received, left to right.
//   * Latin text and Latin digits print correctly ("Latte 15.00").
//
// So the simulator lays words left-to-right in received order, with each
// word shaped normally — and a receipt that reads correctly HERE is one
// that will read correctly THERE.
//
// It is a checking tool, never shipped in the app.
import sharp from 'sharp';
import path from 'node:path';

const FONT_R = path.resolve('react-native-poc/ios/RakeenPOC/Fonts/IBMPlexSansArabic-Regular.ttf');
const FONT_B = path.resolve('react-native-poc/ios/RakeenPOC/Fonts/IBMPlexSansArabic-Bold.ttf');

const ESC = 0x1b, GS = 0x1d;

/** Decodes the byte stream into drawing instructions. */
export function parse(bytes) {
  const ops = [];
  let i = 0;
  let align = 'left', bold = false, wide = false, tall = false;
  let line = [];

  let pendingX = null;
  const flush = () => {
    if (pendingX !== null) {
      if (line.length) ops.push({ type: 'run', text: Buffer.from(line).toString('utf8'), x: pendingX, align, bold, wide, tall });
      ops.push({ type: 'break' });
      pendingX = null;
    } else {
      ops.push({ type: 'line', text: Buffer.from(line).toString('utf8'), align, bold, wide, tall });
    }
    line = [];
  };

  while (i < bytes.length) {
    const b = bytes[i];
    if (b === ESC && bytes[i + 1] === 0x40) { i += 2; continue; }            // init
    if (b === ESC && bytes[i + 1] === 0x61) { align = ['left','center','right'][bytes[i+2]] ?? 'left'; i += 3; continue; }
    if (b === ESC && bytes[i + 1] === 0x45) { bold = bytes[i + 2] === 1; i += 3; continue; }
    if (b === GS && bytes[i + 1] === 0x21) { const n = bytes[i+2]; wide = (n >> 4) > 0; tall = (n & 0x0f) > 0; i += 3; continue; }
    if (b === GS && bytes[i + 1] === 0x56) { ops.push({ type: 'cut' }); i += 3; continue; }
    // GS h / GS w / GS H — ارتفاع وعرض الباركود ووضع نصّه
    if (b === GS && (bytes[i + 1] === 0x68 || bytes[i + 1] === 0x77 || bytes[i + 1] === 0x48)) { i += 3; continue; }
    // GS k — الباركود نفسه: m=73 يعني الطول في البايت التالي
    if (b === GS && bytes[i + 1] === 0x6b) {
      const m = bytes[i + 2];
      if (m >= 65) { const n = bytes[i + 3]; ops.push({ type: 'barcode' }); i += 4 + n; }
      else { let j = i + 3; while (j < bytes.length && bytes[j] !== 0) j++; ops.push({ type: 'barcode' }); i = j + 1; }
      continue;
    }
    // GS ( k — QR
    if (b === GS && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b) {
      const len = bytes[i + 3] | (bytes[i + 4] << 8);
      const fn = bytes[i + 6];
      if (fn === 0x51) ops.push({ type: 'qr', align });
      i += 5 + len;
      continue;
    }
    // GS 8 L — store graphics
    if (b === GS && bytes[i + 1] === 0x38 && bytes[i + 2] === 0x4c) {
      const p = bytes[i+3] | (bytes[i+4] << 8) | (bytes[i+5] << 16) | (bytes[i+6] << 24);
      const w = bytes[i + 13] | (bytes[i + 14] << 8);
      const h = bytes[i + 15] | (bytes[i + 16] << 8);
      ops.push({ type: 'image', w, h, data: bytes.slice(i + 17, i + 7 + p) });
      i += 7 + p;
      continue;
    }
    if (b === GS && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x4c) { i += 7; continue; } // print stored
    // ESC $ — موضع أفقي مطلق بالنقاط. هذا ما تُبنى به الأعمدة الآن،
    // فالمحاكي يسجّله مع النص ليعرض الترصيف الحقيقي لا تقريبه.
    if (b === ESC && bytes[i + 1] === 0x24) {
      if (line.length) { ops.push({ type: 'run', text: Buffer.from(line).toString('utf8'), x: pendingX, align, bold, wide, tall }); line = []; }
      pendingX = bytes[i + 2] | (bytes[i + 3] << 8);
      i += 4;
      continue;
    }
    if (b === 0x0a) { flush(); i += 1; continue; }
    line.push(b);
    i += 1;
  }
  if (line.length) flush();
  return ops;
}

const W = 576;
/** الطابعة تتقدّم ٢٤ نقطة للسطر العادي و٤٨ للمضاعف — لا بارتفاع الخط
 *  المُصيَّر، الذي يبالغ ويجعل طول الورق (= زمن الطباعة) خاطئاً. */
const LINE_DOTS = 24;
const LINE_DOTS_TALL = 48;
const layers = [];
let y = 8;

async function renderWord(word, bold, size, wide) {
  const img = sharp({
    text: {
      text: word.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
      fontfile: bold ? FONT_B : FONT_R,
      font: bold ? 'IBM Plex Sans Arabic Bold' : 'IBM Plex Sans Arabic',
      dpi: Math.round(size * 4.4) * (wide ? 2 : 1),
      rgba: true,
    },
  });
  return img.png().toBuffer({ resolveWithObject: true });
}

async function drawText(op) {
  const { text, align, bold, wide, tall } = op;
  if (!text.trim()) { y += LINE_DOTS; return; }
  const size = tall ? 34 : 24;

  // كل كلمة تُرسَم وحدها ثم تُوضع من اليسار — هذا هو سلوك الطابعة
  // المرصود: تشكيل صحيح داخل الكلمة، ووضع بترتيب الوصول لا بترتيب
  // العربية. رسم السطر دفعة واحدة يجعل Pango يرتّبه صحيحاً، فيحاكي
  // طابعة مثالية لا هذي.
  const spaceW = Math.round(size * 0.5);
  const parts = [];
  let total = 0;
  for (const word of text.split(' ')) {
    if (word === '') { parts.push(null); total += spaceW; continue; }
    const b = await renderWord(word, bold, size, wide);
    parts.push(b);
    total += b.info.width + spaceW;
  }
  total -= spaceW;

  let x = 8;
  if (align === 'center') x = Math.round((W - total) / 2);
  else if (align === 'right') x = W - 8 - total;
  x = Math.max(0, x);

  let maxH = size + 4;
  for (const p of parts) {
    if (p === null) { x += spaceW; continue; }
    layers.push({ input: p.data, top: Math.round(y), left: Math.round(x) });
    x += p.info.width + spaceW;
    maxH = Math.max(maxH, p.info.height);
  }
  y += tall ? LINE_DOTS_TALL : LINE_DOTS;
}

function drawImage(op) {
  const bytesPerRow = Math.ceil(op.w / 8);
  const png = Buffer.alloc(op.w * op.h * 3, 255);
  for (let row = 0; row < op.h; row++) {
    for (let col = 0; col < op.w; col++) {
      const byte = op.data[row * bytesPerRow + (col >> 3)];
      if (byte !== undefined && (byte & (1 << (7 - (col & 7))))) {
        const o = (row * op.w + col) * 3;
        png[o] = png[o + 1] = png[o + 2] = 0;
      }
    }
  }
  layers.push({
    input: png,
    raw: { width: op.w, height: op.h, channels: 3 },
    top: Math.round(y), left: Math.round((W - op.w) / 2),
  });
  y += op.h + 6;
}

function drawQr(op) {
  const s = 150;
  layers.push({
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
      <rect width="${s}" height="${s}" fill="#fff" stroke="#000" stroke-dasharray="4"/>
      <text x="${s/2}" y="${s/2}" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#666">QR</text>
      <text x="${s/2}" y="${s/2+16}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#999">native command</text>
    </svg>`),
    top: Math.round(y), left: Math.round((W - s) / 2),
  });
  y += s + 8;
}

export async function render(bytes, outPath) {
  layers.length = 0;
  y = 8;
  let runH = 0;
  for (const op of parse(bytes)) {
    if (op.type === 'run') {
      // الموضع بالنقاط كما أمر ESC $، والكلمات تُوضع من اليسار كما تفعل
      // الطابعة. رسمها ككتلة واحدة يجعل Pango يرتّبها فيُخفي الخطأ الذي
      // بُني هذا الملف لكشفه.
      const size = op.tall ? 34 : 24;
      const spaceW = Math.round(size * 0.5);
      let x = op.x;
      for (const w of op.text.split(' ')) {
        if (w === '') { x += spaceW; continue; }
        const b = await renderWord(w, op.bold, size, op.wide);
        layers.push({ input: b.data, top: Math.round(y), left: Math.round(x) });
        x += b.info.width + spaceW;
      }
      runH = Math.max(runH, op.tall ? LINE_DOTS_TALL : LINE_DOTS);
      continue;
    }
    if (op.type === 'break') { y += runH || LINE_DOTS; runH = 0; continue; }
    if (op.type === 'line') await drawText(op);
    else if (op.type === 'image') drawImage(op);
    else if (op.type === 'qr') drawQr(op);
  }
  const height = Math.ceil(y) + 16;
  await sharp({ create: { width: W, height, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .png()
    .toFile(outPath);
  return { height, paperMm: (height / 8).toFixed(0) };
}
