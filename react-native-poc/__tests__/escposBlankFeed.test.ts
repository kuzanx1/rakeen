import { bandRaster, rasterChunks, BAND_ROWS, MIN_FEED_ROWS } from '../../shared/receipt';

/**
 * البياضُ يُدفع ولا يُرسَل -- والورقةُ هي هي.
 *
 * نصفُ الفاتورة تقريباً أسطرٌ بيضاءُ تماماً، وكنّا نرسلها أصفاراً.
 * صارت تُدفع بـ`ESC J n`. والمكسبُ بايتات، والشرطُ ألّا تتحرّك نقطةٌ
 * واحدةٌ على الورق.
 *
 * ولا يكفي أن يُقال ذلك في مراجعة: هذا الاختبار **يفكّ الناتج** كما
 * تفكّه الطابعة -- شريحةُ `GS v 0` تطبع أسطرَها وتدفع الورقَ بمقدارها،
 * و`ESC J n` يدفعه n نقطة -- ثمّ يعيد بناء الصفحة ويقابلها بالأصل
 * بايتاً بايت. فإن زاغ سطرٌ واحدٌ عن موضعه سقط.
 */

interface Page {
  readonly bitmap: Uint8Array;
  /** مجموعُ ما دُفع من ورق -- يجب أن يساوي ارتفاعَ الأصل. */
  readonly rows: number;
}

/** يفكّ بايتاتِ الصورة كما تفعل الطابعة، ويعيد بناء الصفحة. */
function decode(bytes: Uint8Array, bytesPerRow: number, height: number): Page {
  const page = new Uint8Array(bytesPerRow * height);
  let at = 0;
  let y = 0;
  while (at < bytes.length) {
    if (bytes[at] === 0x1b && bytes[at + 1] === 0x4a) {
      y += bytes[at + 2];
      at += 3;
      continue;
    }
    if (bytes[at] === 0x1d && bytes[at + 1] === 0x76 && bytes[at + 2] === 0x30 && bytes[at + 3] === 0x00) {
      const bpr = bytes[at + 4] | (bytes[at + 5] << 8);
      const rows = bytes[at + 6] | (bytes[at + 7] << 8);
      expect(bpr).toBe(bytesPerRow);
      at += 8;
      for (let r = 0; r < rows; r += 1) {
        page.set(bytes.subarray(at, at + bpr), (y + r) * bytesPerRow);
        at += bpr;
      }
      y += rows;
      continue;
    }
    throw new Error('بايتٌ لا يعرفه فكُّ الترميز عند ' + at + ': 0x' + bytes[at].toString(16));
  }
  return { bitmap: page, rows: y };
}

/** صفحةٌ بأسطرِ حبرٍ في المواضع المذكورة وما عداها بياض. */
function pageWith(height: number, bytesPerRow: number, inkRows: number[]): Uint8Array {
  const bitmap = new Uint8Array(bytesPerRow * height);
  for (const y of inkRows) {
    for (let i = 0; i < bytesPerRow; i += 1) bitmap[y * bytesPerRow + i] = (i % 7) + 1;
  }
  return bitmap;
}

const BPR = 72;

describe('دفعُ البياض بدل إرساله', () => {
  it('يعيد بناءَ الصفحة كما هي، بايتاً بايت', () => {
    const height = 600;
    const ink: number[] = [];
    // ترويسةٌ، ثمّ سطورٌ متباعدة، ثمّ ذيل -- كما تبدو فاتورةٌ حقيقية.
    for (let y = 40; y < 90; y += 1) ink.push(y);
    for (let y = 140; y < 520; y += 24) for (let k = 0; k < 9; k += 1) ink.push(y + k);
    for (let y = 560; y < 575; y += 1) ink.push(y);
    const bitmap = pageWith(height, BPR, ink);

    const out = bandRaster(bitmap, BPR, height);
    const back = decode(out, BPR, height);

    expect(back.rows).toBe(height);
    expect(Array.from(back.bitmap)).toEqual(Array.from(bitmap));
    // والمكسبُ حقيقيّ لا رمزيّ.
    expect(out.length).toBeLessThan(bitmap.length * 0.8);
  });

  it('يصمد على صفحاتٍ عشوائية -- لا على واحدةٍ مُنتقاة', () => {
    let seed = 20261125;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let t = 0; t < 40; t += 1) {
      const height = 1 + Math.floor(rnd() * 900);
      const bpr = [48, 72][Math.floor(rnd() * 2)];
      const bitmap = new Uint8Array(bpr * height);
      for (let y = 0; y < height; y += 1) {
        if (rnd() < 0.45) continue; // سطرٌ أبيض
        for (let i = 0; i < bpr; i += 1) if (rnd() < 0.3) bitmap[y * bpr + i] = Math.floor(rnd() * 255) + 1;
      }
      const back = decode(bandRaster(bitmap, bpr, height), bpr, height);
      expect(back.rows).toBe(height);
      expect(Array.from(back.bitmap)).toEqual(Array.from(bitmap));
    }
  });

  it('صفحةٌ بيضاءُ كلُّها تصير دفعاً، وسوداءُ كلُّها تبقى شرائح', () => {
    const white = new Uint8Array(BPR * 300);
    const outWhite = bandRaster(white, BPR, 300);
    expect(outWhite.every((_, i) => i % 3 !== 0 || outWhite[i] === 0x1b)).toBe(true);
    expect(outWhite.length).toBeLessThan(20);
    expect(decode(outWhite, BPR, 300).rows).toBe(300);

    const black = new Uint8Array(BPR * 300).fill(0xff);
    const outBlack = bandRaster(black, BPR, 300);
    expect(decode(outBlack, BPR, 300).rows).toBe(300);
    expect(Array.from(decode(outBlack, BPR, 300).bitmap)).toEqual(Array.from(black));
    // بلا بياضٍ فلا مكسب، ولا خسارةَ غيرُ رؤوس الشرائح.
    expect(outBlack.length).toBe(black.length + Math.ceil(300 / BAND_ROWS) * 8);
  });

  it('لا تُقطَّع الصورةُ لأجل فجوةٍ أقصرَ من الحدّ', () => {
    const height = 100;
    const ink: number[] = [];
    for (let y = 0; y < height; y += 1) if (y % 5 !== 0) ink.push(y); // فجواتٌ بسطرٍ واحد
    const bitmap = pageWith(height, BPR, ink);
    const chunks = rasterChunks(bitmap, BPR, height);
    expect(chunks.every(c => c.ink)).toBe(true);
    expect(MIN_FEED_ROWS).toBeGreaterThan(1);
    expect(Array.from(decode(bandRaster(bitmap, BPR, height), BPR, height).bitmap)).toEqual(Array.from(bitmap));
  });

  it('لا شريحةَ أطولُ من حدِّ الشرائح -- حمايةُ الانقطاع باقية', () => {
    const height = 1000;
    const bitmap = new Uint8Array(BPR * height).fill(0x0f);
    for (const c of rasterChunks(bitmap, BPR, height)) {
      if (c.ink) expect(c.rows).toBeLessThanOrEqual(BAND_ROWS);
      else expect(c.rows).toBeLessThanOrEqual(255);
    }
  });

  it('مقطعُ بياضٍ أطولُ من ٢٥٥ يُقسَّم ولا يلتفّ', () => {
    const height = 900;
    const bitmap = pageWith(height, BPR, [0, 1, 2, 3, 4, 895, 896, 897, 898, 899]);
    const back = decode(bandRaster(bitmap, BPR, height), BPR, height);
    expect(back.rows).toBe(height);
    expect(Array.from(back.bitmap)).toEqual(Array.from(bitmap));
  });
});
