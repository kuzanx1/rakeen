/**
 * الصورةُ إلى بايتاتِ ESC/POS -- شرائحُ حبرٍ ودفعاتُ بياض.
 *
 * ── لماذا شرائح ──
 * أمرٌ واحدٌ لمئةِ كيلوبايت يعني أنّ الطابعةَ تنتظر مئةَ كيلوبايتٍ
 * بالضبط: إن انقطع الإرسالُ في منتصفها بقيت تبتلع كلَّ ما يأتي بعده
 * كأنّه بقيّةُ الصورة -- فتخرج فاتورةٌ «محيوسة» ثمّ مترُ ورقٍ رموزاً.
 * وقع هذا عند مطعمٍ حقيقيٍّ على طابعة TA POS، ورآه المالكُ بعينه.
 * وبالشرائح يبقى الضررُ محصوراً في شريحةٍ بطول سنتيمترٍ ونصف.
 *
 * ── ولماذا لا تُرسَل الأسطرُ البيضاء ──
 * نصفُ الفاتورة تقريباً أسطرٌ بيضاءُ تماماً: الهوامشُ، والفراغُ بين
 * السطور، وما حول الشعار. وكنّا نرسلها أصفاراً -- اثنين وسبعين بايتاً
 * لكلِّ سطرٍ لا حبرَ فيه. قياسُ الصور المرجعية: ٣٥٪ إلى ٥١٪ من كلِّ
 * ورقة.
 *
 * فصارت تُدفع بـ`ESC J n` (اطبع وادفع n نقطة) بثلاثة بايتات بدل
 * اثنين وسبعين في السطر. **والورقةُ هي هي، نقطةً نقطة**: `GS v 0`
 * يدفع الورقَ بمقدار ارتفاعه، و`ESC J n` يدفعه n نقطة -- فالمسافاتُ
 * والمواضعُ لا تتغيّر، إنّما يُحذف إرسالُ أصفارٍ لا تُحبِّر شيئاً.
 * يحرسه اختبارٌ يفكّ الناتجَ ويعيد بناءَ الصفحة ويقابلها بالأصل
 * (__tests__/escposRaster.test.ts).
 *
 * وما يُربح: بايتاتٌ أقلُّ على الوصل، فزمنُ إرسالٍ أقصر، ونافذةُ
 * انقطاعٍ أضيق -- وهي النافذةُ التي يقع فيها كلُّ ما سبق. وحين تكون
 * الطابعةُ مهدّأةً (٢٧ ك.ب/ث بعد انقطاع) فالزمنُ دالّةُ البايتات
 * وحدَها، فينتصف الزمنُ بانتصافها.
 *
 * ولا شيءَ من هذا يمسّ التصميمَ ولا الجودة: ما يُرسل أقلُّ، وما يُطبع
 * هو هو.
 */

/**
 * ارتفاعُ الشريحة الواحدة بالأسطر.
 *
 * على ورق ٨٠مم (٧٢ بايتاً للسطر) = ٩٢١٦ بايتاً للشريحة -- أقلُّ من
 * قطعةِ الإرسال على USB (١٦ ك.ب)، فتمرّ كلُّ شريحةٍ في دفعةٍ واحدة.
 */
export const BAND_ROWS = 128;

/**
 * أقصرُ مقطعِ بياضٍ يستحقُّ أمرَ دفعٍ خاصّاً به.
 *
 * ثلاثةُ بايتاتٍ للأمر مقابل اثنين وسبعين للسطر، فحتّى سطرٌ واحدٌ
 * يربح. لكنّ تقطيعَ الصورة إلى عشراتِ الشرائح لأجل سطرٍ هنا وسطرٍ
 * هناك يُثقل البنيةَ بلا طائل: متوسّطُ المقطع في الفواتير الحقيقية
 * خمسةَ عشرَ سطراً، فأربعةٌ حدٌّ يُبقي الربحَ كلَّه تقريباً ويمنع
 * التفتّت.
 */
export const MIN_FEED_ROWS = 4;

/** أكبرُ ما يحمله `ESC J n` في دفعةٍ واحدة. */
const MAX_FEED = 255;

function rowIsBlank(bitmap: Uint8Array, bytesPerRow: number, y: number): boolean {
  const at = y * bytesPerRow;
  for (let i = 0; i < bytesPerRow; i += 1) {
    if (bitmap[at + i] !== 0) return false;
  }
  return true;
}

interface Chunk {
  /** `true` شريحةُ حبرٍ تُرسَل، و`false` بياضٌ يُدفع. */
  readonly ink: boolean;
  readonly y: number;
  readonly rows: number;
}

/**
 * يقسم الصفحةَ إلى شرائحِ حبرٍ ودفعاتِ بياض، بالترتيب.
 *
 * ويُصدَّر للاختبار وللحارس: التقسيمُ هو الذي يجب أن يتطابق بين
 * العميلين، لا الناتجُ وحده.
 */
export function rasterChunks(bitmap: Uint8Array, bytesPerRow: number, height: number): Chunk[] {
  const out: Chunk[] = [];
  let y = 0;
  while (y < height) {
    if (rowIsBlank(bitmap, bytesPerRow, y)) {
      let run = 1;
      while (y + run < height && rowIsBlank(bitmap, bytesPerRow, y + run)) run += 1;
      if (run >= MIN_FEED_ROWS) {
        let left = run;
        while (left > 0) {
          const take = Math.min(left, MAX_FEED);
          out.push({ ink: false, y: y + (run - left), rows: take });
          left -= take;
        }
        y += run;
        continue;
      }
      /* مقطعٌ قصيرٌ يبقى حبراً: أرخصُ أن يُرسل من أن يُقطَع له أمر. */
    }
    /* مقطعُ حبرٍ حتى أوّلِ بياضٍ يستحقّ الدفع، مقسوماً على الشرائح. */
    let run = 0;
    while (y + run < height) {
      if (rowIsBlank(bitmap, bytesPerRow, y + run)) {
        let blank = 1;
        while (y + run + blank < height && rowIsBlank(bitmap, bytesPerRow, y + run + blank)) blank += 1;
        if (blank >= MIN_FEED_ROWS) break;
        run += blank;
        continue;
      }
      run += 1;
    }
    let left = run;
    while (left > 0) {
      const take = Math.min(left, BAND_ROWS);
      out.push({ ink: true, y: y + (run - left), rows: take });
      left -= take;
    }
    y += run;
  }
  return out;
}

/**
 * الصورةُ بايتاتٍ جاهزةً: `GS v 0` لكلِّ شريحةِ حبر، و`ESC J n` لكلِّ
 * دفعةِ بياض.
 *
 * ولا رأسَ ولا ذيلَ هنا (التهيئةُ والقصّ عند المنادي): هذي الصورةُ
 * وحدَها، ليستعملها العميلان كما هي.
 */
export function bandRaster(bitmap: Uint8Array, bytesPerRow: number, height: number): Uint8Array {
  const chunks = rasterChunks(bitmap, bytesPerRow, height);
  let size = 0;
  for (const c of chunks) size += c.ink ? 8 + c.rows * bytesPerRow : 3;
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    if (c.ink) {
      out[at] = 0x1d; out[at + 1] = 0x76; out[at + 2] = 0x30; out[at + 3] = 0x00;
      out[at + 4] = bytesPerRow & 0xff;
      out[at + 5] = (bytesPerRow >> 8) & 0xff;
      out[at + 6] = c.rows & 0xff;
      out[at + 7] = (c.rows >> 8) & 0xff;
      at += 8;
      out.set(bitmap.subarray(c.y * bytesPerRow, (c.y + c.rows) * bytesPerRow), at);
      at += c.rows * bytesPerRow;
    } else {
      out[at] = 0x1b; out[at + 1] = 0x4a; out[at + 2] = c.rows & 0xff;
      at += 3;
    }
  }
  return out;
}
