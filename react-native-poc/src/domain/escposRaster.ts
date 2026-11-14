/**
 * A rendered RGBA pixel buffer as an ESC/POS raster image.
 *
 * Uses `GS 8 L` function 112 (store graphics) followed by `GS ( L`
 * function 50 (print), which is the CURRENT graphics command. `GS v 0`,
 * which this replaces, is marked obsolete in Epson's own ESC/POS
 * reference with `GS ( L` named as its replacement.
 *
 * NOT THE DEFAULT, and no longer believed to be faster. Read this before
 * switching anything back to it.
 *
 * This encoder was written on the theory that `GS v 0` was what made a
 * 694-row receipt take 45 seconds on the SUNMI NT310 at Hbiah. That
 * theory was wrong, and it was disproved by the two commits that came
 * after it: the 45 seconds was a print queue nothing woke for up to 20
 * seconds, plus a receipt the printer kept refusing because it was still
 * busy with the kitchen ticket ahead of it. Both were fixed where they
 * actually lived, in application/printService.ts. Neither was here.
 *
 * The 45 seconds was wall clock from checkout to paper, not bytes to
 * paper — the trace always showed 20ms from connect to the printer
 * closing the stream itself. The command was never in that measurement.
 *
 * What the command change DID do was put an unreadable receipt in a
 * customer's hand at Hbiah: the printer does not implement fn112/fn50,
 * and a printer that does not know a command does not ignore it — it
 * prints the payload as characters. A page of `<<<<` and `aaaa`.
 *
 * ONE PIECE, deliberately. An earlier attempt split the image into 128-row
 * bands on the theory that a huge single command was choking the firmware.
 * It did not help, and the reasoning was backwards: fragmenting a raster
 * into many separately-printed parts is a documented CAUSE of slow image
 * printing, not a cure. The band loop is gone.
 */

export interface RgbaBuffer {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * أيُّ بكسلٍ يستحقّ حرارة -- بعد مزجه على ورقٍ أبيض.
 *
 * كانت الشفافيةُ بوّابةً حادّة: a < 128 يعني ورقاً مهما كان لونُه.
 * وسطحُ Skia يبدأ شفافاً تماماً، والنصُّ يُرسم عليه أسودَ مُنعَّمَ
 * الحواف -- فحوافُّ الحروف تنزل بتغطيةٍ جزئية: لونُها أسودُ وألفاها
 * دون المئتين.
 *
 * والحرفُ الرفيع -- وأكثرُ العربية رفيع: الهمزةُ والنقاطُ ووصلاتُ
 * الحروف وأطرافُ الألف -- قد لا يبلغ أيُّ بكسلٍ فيه تغطيةَ ١٢٨. فيسقط
 * كلُّه، ويخرج الحرفُ مقطوعاً أو خفيفاً بينما جارُه السميك أسودُ تامّ.
 * وهو ما يُرى: بعضُ الحروف لا كلُّها.
 *
 * فيُمزج على أبيض كما يفعل الورق نفسه: بكسلٌ أسودُ بتغطية ١١٠ يصير
 * سطوعُه ١٤٥ -- حبراً، وقد كان ورقاً. وما تغطيتُه أقلُّ من ذلك يبقى
 * ورقاً، وهو الصواب: تلك حافّةٌ باهتة لا حرف.
 *
 * (نظيرها في الويب لا تسقط في هذا: لوحتُها معتمة، فالألفا ٢٥٥ دائماً.)
 */
function lumOnWhite(r: number, g: number, b: number, a: number): number {
  const cover = a / 255;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum * cover + 255 * (1 - cover);
}

/**
 * وضوح الطباعة.
 *
 * قِيس على خط الفاتورة نفسه (Tajawal Regular، ٢٠٣ نقطة/إنش): ٦٦٪ من
 * خطوط سطر التاريخ والرقم الضريبي (١٥px) عرضُها نقطةٌ واحدة، و٤١٪ في
 * اسم الصنف (٢١px). ورأسُ السنمي الداخلي يطبع خطَّ النقطة الواحدة
 * أسود، والطابعةُ العادية تطبعه باهتاً أو مقطّعاً -- وهو الفرق الذي
 * يُرى بين الطابعتين على الورقة نفسها.
 *
 *   normal  حدّ ١٦٠، بلا تسميك (السلوك الأصلي -- لطابعة السنمي).
 *   dark    حدّ ٢٠٠ + نقطةٌ أفقية: أقلُّ خطٍّ عمودي نقطتان.
 *   darker  حدّ ٢٠٠ + نقطةٌ أفقية ورأسية: كل خطٍّ نقطتان على الأقل.
 *
 * و«المحمية» (رمز الزكاة، الشعار، الأشرطة السوداء بنصّها الأبيض) تبقى
 * على حدّ ١٦٠ بلا تسميك: رمزٌ تتضخّم وحداته قد لا يُقرأ، ونصٌّ أبيض
 * على أسود يرقّ بتسميك الأسود حوله.
 */
export type PrintDarkness = 'normal' | 'dark' | 'darker';

export interface RasterRect { x: number; y: number; w: number; h: number }

export interface RasterOptions {
  darkness?: PrintDarkness;
  protect?: readonly RasterRect[];
}

const BASE_THRESHOLD = 160;
const DARK_THRESHOLD = 200;

/** 1 = حبر، لكل بكسل. */
export function inkMask(buffer: RgbaBuffer, opts?: RasterOptions): Uint8Array {
  const { width, height, data } = buffer;
  const darkness = opts?.darkness ?? 'normal';
  const n = width * height;

  let guard: Uint8Array | null = null;
  if (darkness !== 'normal' && opts?.protect && opts.protect.length) {
    guard = new Uint8Array(n);
    for (const r of opts.protect) {
      const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(width, Math.ceil(r.x + r.w));
      const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(height, Math.ceil(r.y + r.h));
      for (let y = y0; y < y1; y++) guard.fill(1, y * width + x0, y * width + x1);
    }
  }

  const m = new Uint8Array(n);
  const th = darkness === 'normal' ? BASE_THRESHOLD : DARK_THRESHOLD;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const lum = lumOnWhite(data[p], data[p + 1], data[p + 2], data[p + 3]);
    m[i] = lum < (guard && guard[i] ? BASE_THRESHOLD : th) ? 1 : 0;
  }
  if (darkness === 'normal') return m;

  const vertical = darkness === 'darker';
  const out = m.slice();
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const k = row + x;
      if (m[k] || (guard && guard[k])) continue;
      const src = (j: number) => m[j] === 1 && !(guard && guard[j]);
      if ((x > 0 && src(k - 1)) || (vertical && y > 0 && (src(k - width) || (x > 0 && src(k - width - 1))))) {
        out[k] = 1;
      }
    }
  }
  return out;
}

/**
 * المسار السريع: من البكسل إلى البت في مرّة واحدة.
 *
 * المسار العام يمرّ على الصورة ثلاث مرات (قناع، تسميك، حزم) ويستدعي
 * دالّة لكل بكسل بحساب عشري -- وفاتورة ٥٧٦×١٨٠٠ فيها مليون بكسل. على
 * معالج سنمي تحت Hermes هذا يُحَسّ: الكاشير يدفع ثم ينتظر والطابعة
 * ساكتة، ثم تطبع بسرعة. وهو بالضبط ما اشتكى منه صاحب المحل.
 *
 * والتغميق مطفأ اليوم لكل الطابعات (resolvePrintDarkness)، فالمسار العام
 * لا يفعل شيئاً زائداً إلا الوقت. هنا حسابٌ صحيح بلا دوال ولا مصفوفة
 * وسيطة، والناتج مطابق بالبايت (يحرسه escposRasterFast.test.ts).
 */
function packBitmapFast(buffer: RgbaBuffer): { bitmap: Uint8Array; bytesPerRow: number } {
  const { width, height, data } = buffer;
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  // lum < 160  <=>  r*299 + g*587 + b*114 < 160000 حين الألفا ٢٥٥ (وهي
  // كذلك دائماً: السطح يُملأ أبيض قبل الرسم).
  const LIMIT = BASE_THRESHOLD * 1000;
  let p = 0;
  for (let y = 0; y < height; y++) {
    const rowStart = y * bytesPerRow;
    for (let x = 0; x < width; x++, p += 4) {
      const a = data[p + 3];
      let dark: boolean;
      if (a === 255) {
        dark = data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114 < LIMIT;
      } else {
        dark = lumOnWhite(data[p], data[p + 1], data[p + 2], a) < BASE_THRESHOLD;
      }
      if (dark) bitmap[rowStart + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bitmap, bytesPerRow };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_CODES = (() => { const t = new Uint8Array(64); for (let i = 0; i < 64; i++) t[i] = B64.charCodeAt(i); return t; })();

/**
 * base64 لمصفوفة بايتات، سريعاً.
 *
 * النسخة القديمة تلصق حرفاً حرفاً: سبعمئة ألف لصقة لفاتورة واحدة. هذه
 * تكتب رموز الحروف في مصفوفة ثم تحوّلها نصاً على دفعات.
 */
export function bytesToBase64Fast(bytes: Uint8Array): string {
  const n = bytes.length;
  const out = new Uint8Array(Math.ceil(n / 3) * 4);
  let o = 0;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out[o++] = B64_CODES[b0 >> 2];
    out[o++] = B64_CODES[((b0 & 3) << 4) | (b1 >> 4)];
    out[o++] = B64_CODES[((b1 & 15) << 2) | (b2 >> 6)];
    out[o++] = B64_CODES[b2 & 63];
  }
  if (i < n) {
    const b0 = bytes[i], b1 = i + 1 < n ? bytes[i + 1] : 0;
    out[o++] = B64_CODES[b0 >> 2];
    out[o++] = B64_CODES[((b0 & 3) << 4) | (b1 >> 4)];
    out[o++] = i + 1 < n ? B64_CODES[(b1 & 15) << 2] : 61;
    out[o++] = 61;
  }
  let s = '';
  const CHUNK = 8192;
  for (let k = 0; k < out.length; k += CHUNK) {
    s += String.fromCharCode.apply(null, out.subarray(k, Math.min(out.length, k + CHUNK)) as unknown as number[]);
  }
  return s;
}

/**
 * مهمّة الطباعة كاملة (تهيئة + صورة + تغذية + قصّ) base64 جاهزاً للإرسال.
 *
 * مصفوفة بايتات واحدة من أولها لآخرها: لا number[] بمئة وثلاثين ألف
 * عنصر، ولا نسخها مرتين بالـ spread.
 */
export function rasterJobBase64(buffer: RgbaBuffer, command: 'modern' | 'legacy' | undefined, opts?: RasterOptions): string {
  const darkness = opts?.darkness ?? 'normal';
  const { bitmap, bytesPerRow } = darkness === 'normal' ? packBitmapFast(buffer) : packBitmap(buffer, opts);
  const { width, height } = buffer;
  let head: number[];
  let tail: number[];
  if (command === 'modern') {
    const p = 10 + bitmap.length;
    head = [
      0x1b, 0x40,
      0x1d, 0x38, 0x4c,
      p & 0xff, (p >> 8) & 0xff, (p >> 16) & 0xff, (p >> 24) & 0xff,
      0x30, 0x70, 0x30,
      0x01, 0x01, 0x31,
      width & 0xff, (width >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
    ];
    tail = [0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
  } else {
    head = [
      0x1b, 0x40,
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
    ];
    tail = [0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00];
  }
  const job = new Uint8Array(head.length + bitmap.length + tail.length);
  job.set(head, 0);
  job.set(bitmap, head.length);
  job.set(tail, head.length + bitmap.length);
  return bytesToBase64Fast(job);
}

function packBitmap(buffer: RgbaBuffer, opts?: RasterOptions): { bitmap: Uint8Array; bytesPerRow: number } {
  const { width, height } = buffer;
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  const mask = inkMask(buffer, opts);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        bitmap[y * bytesPerRow + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }
  return { bitmap, bytesPerRow };
}

/**
 * `GS 8 L` fn112 + `GS ( L` fn50 — store the graphics, then print them.
 *
 * Layout of the store command, in order:
 *   1D 38 4C  p1 p2 p3 p4  30 70 30  bx by c  xL xH  yL yH  <data>
 *
 *   p1..p4  little-endian 32-bit byte count of everything after it,
 *           i.e. 10 header bytes + the bitmap.
 *   30 70 30  m = 48, fn = 112 ('p'), a = 48.
 *   bx by   horizontal and vertical zoom, 1 each — the image is already
 *           rendered at the printer's own resolution, so scaling here
 *           would only blur it.
 *   c       49, single-colour.
 *   xL xH   width in DOTS (not bytes), little-endian.
 *   yL yH   height in dots, little-endian.
 *
 * `GS 8 L` rather than `GS ( L` for the store: its length field is 32-bit,
 * so a full-length receipt cannot overflow it. The print that follows is
 * the short `GS ( L` form, which takes no data.
 */
export function rgbaToEscPosRaster(buffer: RgbaBuffer, opts?: RasterOptions): number[] {
  const { width, height } = buffer;
  const { bitmap, bytesPerRow } = packBitmap(buffer, opts);

  const p = 10 + bitmap.length;
  const out: number[] = [
    0x1d, 0x38, 0x4c,
    p & 0xff, (p >> 8) & 0xff, (p >> 16) & 0xff, (p >> 24) & 0xff,
    0x30, 0x70, 0x30,
    0x01, 0x01, 0x31,
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ];
  for (let i = 0; i < bitmap.length; i++) out.push(bitmap[i]);

  // fn50: print what was just stored.
  out.push(0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32);

  void bytesPerRow;
  return out;
}

/**
 * THE DEFAULT. `GS v 0` — obsolete in Epson's reference, and the only
 * raster command every ESC/POS printer in the field actually implements.
 *
 * It is what Rakeen's browser POS has sent since day one
 * (public/pos/rakeen-pos.js, canvasToEscPosRaster) on this same hardware,
 * with no complaint, and it is what the printer at Hbiah understands.
 * "Obsolete in the spec" and "unsupported by the printer on the counter"
 * point in opposite directions; the paper decides, not the spec.
 *
 * Choosing correct-everywhere over modern costs nothing measurable here:
 * the printers are on the network, and the send was never the slow part.
 */
export function rgbaToEscPosRasterLegacy(buffer: RgbaBuffer, opts?: RasterOptions): number[] {
  const { height } = buffer;
  const { bitmap, bytesPerRow } = packBitmap(buffer, opts);
  return [
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    ...Array.from(bitmap),
  ];
}
