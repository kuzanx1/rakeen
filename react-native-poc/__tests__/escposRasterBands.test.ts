import { bandRaster, rasterChunks, BAND_ROWS } from '../../shared/receipt';

/**
 * الصورةُ تُرسَل صورةً -- لا أمرَ تغذيةٍ داخلها.
 *
 * كان البياضُ يُستبدل بـ`ESC J n` توفيراً للبايتات (١٫٧٩)، وكان
 * الاختبارُ القديمُ هنا «يُثبت» أنّ الورقةَ لا تتغيّر -- بأن يفكّ
 * الناتجَ على نفس الافتراض الذي بُني عليه: أنّ `ESC J n` يدفع n
 * نقطة. فلمّا وصلت الفاتورةُ طابعةَ EZPOS عند «كباب طارق» سقط الدفعُ
 * ولم تسقط الاختبارات: خرجت الورقةُ مضغوطةً والكلامُ ملتصق.
 *
 * فالمحروسُ الآن ما لا رأيَ للطابعة فيه: بياناتُ الصورة. ويُفكّ
 * الناتجُ ويُقابل بالأصل بايتاً بايت، **ويُشترط ألّا يكون فيه أمرٌ
 * غيرُ `GS v 0`** -- فلا يعود أحدٌ يستبدل بياضاً بأمرٍ لم يُجرَّب على
 * ورق.
 */

const BPR = 72;

/** يفكّ بايتاتِ الصورة كما تفعل الطابعة، ويعيد بناء الصفحة. */
function decode(bytes: Uint8Array, bytesPerRow: number, height: number) {
  const page = new Uint8Array(bytesPerRow * height);
  let at = 0;
  let y = 0;
  while (at < bytes.length) {
    if (!(bytes[at] === 0x1d && bytes[at + 1] === 0x76 && bytes[at + 2] === 0x30 && bytes[at + 3] === 0x00)) {
      throw new Error('أمرٌ غيرُ GS v 0 عند ' + at + ': 0x' + bytes[at].toString(16));
    }
    const bpr = bytes[at + 4] | (bytes[at + 5] << 8);
    const rows = bytes[at + 6] | (bytes[at + 7] << 8);
    expect(bpr).toBe(bytesPerRow);
    at += 8;
    page.set(bytes.subarray(at, at + bpr * rows), y * bytesPerRow);
    at += bpr * rows;
    y += rows;
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

describe('شرائحُ الصورة', () => {
  it('يعيد بناءَ الصفحة كما هي، بايتاً بايت', () => {
    const height = 600;
    const ink: number[] = [];
    // ترويسةٌ، ثمّ سطورٌ متباعدة، ثمّ ذيل -- كما تبدو فاتورةٌ حقيقية.
    for (let y = 40; y < 90; y += 1) ink.push(y);
    for (let y = 140; y < 520; y += 24) for (let k = 0; k < 9; k += 1) ink.push(y + k);
    for (let y = 560; y < 575; y += 1) ink.push(y);
    const bitmap = pageWith(height, BPR, ink);

    const back = decode(bandRaster(bitmap, BPR, height), BPR, height);

    expect(back.rows).toBe(height);
    expect(Array.from(back.bitmap)).toEqual(Array.from(bitmap));
  });

  it('لا أمرَ تغذيةٍ داخل الصورة -- ولا بايتَ ESC أصلاً إلّا في رأسِ شريحة', () => {
    const height = 700;
    // صفحةٌ أكثرُها بياض: هي الحالةُ التي كان يُستبدل فيها البياضُ بالدفع.
    const bitmap = pageWith(height, BPR, [10, 11, 12, 300, 301, 690, 691]);
    const out = bandRaster(bitmap, BPR, height);

    // كلُّ شريحةٍ تبدأ بـGS v 0 وتنتهي ببياناتها: فكُّ الترميز يرمي
    // إن وجد أمراً غيرَه، وهذا هو الحارسُ الحقيقيّ.
    expect(() => decode(out, BPR, height)).not.toThrow();

    // والحجمُ يقول الشيءَ نفسَه: الصورةُ كاملةً + رأسٌ لكلِّ شريحة.
    expect(out.length).toBe(bitmap.length + Math.ceil(height / BAND_ROWS) * 8);
  });

  it('صفحةٌ بيضاءُ كلُّها تُرسَل بياضاً -- الورقُ يمشي كما يمشي', () => {
    const white = new Uint8Array(BPR * 300);
    const back = decode(bandRaster(white, BPR, 300), BPR, 300);
    expect(back.rows).toBe(300);
    expect(Array.from(back.bitmap)).toEqual(Array.from(white));
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
      const out = bandRaster(bitmap, bpr, height);
      let at = 0;
      let rows = 0;
      while (at < out.length) {
        expect(out[at]).toBe(0x1d);
        const h = out[at + 6] | (out[at + 7] << 8);
        const span = bpr * h;
        expect(Array.from(out.subarray(at + 8, at + 8 + span)))
          .toEqual(Array.from(bitmap.subarray(rows * bpr, rows * bpr + span)));
        rows += h;
        at += 8 + span;
      }
      expect(rows).toBe(height);
    }
  });

  it('لا شريحةَ أطولُ من حدِّ الشرائح -- حمايةُ الانقطاع باقية', () => {
    const height = 1000;
    const bitmap = new Uint8Array(BPR * height).fill(0x0f);
    const chunks = rasterChunks(bitmap, BPR, height);
    for (const c of chunks) expect(c.rows).toBeLessThanOrEqual(BAND_ROWS);
    expect(chunks.reduce((s, c) => s + c.rows, 0)).toBe(height);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
