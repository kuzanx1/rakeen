/**
 * يحوّل رسمةً إلى ما تطبعه الطابعةُ الحرارية، ويولّد معاينتَها.
 *
 * والطابعةُ لونان لا ثالث، ودقّتُها ٢٠٣ نقطة/إنش. فالرسمةُ تُصغَّر إلى
 * مقاسها على الورق ثمّ تُحوَّل إلى لونين **هنا، مرّةً واحدة** -- لا على
 * الجهاز وقتَ الطباعة. والفرقُ ليس في السرعة:
 *
 *   • لو حُمّلت صورةٌ رماديةٌ وحُوّلت على الجهاز، لاختلف ناتجُها بين
 *     كانفس المتصفّح وSkia التطبيق (تنعيمٌ مختلف)، فخرجت الورقتان
 *     مختلفتين -- وهو العطبُ الذي كُتبت له قاعدةُ «المصدر واحد».
 *   • ولوجب حملُ ملفِّ صورةٍ في حزمة التطبيق وفي الموقع، ويُنسى أحدُهما.
 *
 * فالمخرَجُ نصٌّ داخل المحرّك نفسِه (shared/receipt/art.ts): أطوالُ
 * مقاطعَ سوداءَ وبيضاء، تُرسم مستطيلاتٍ بلا صورةٍ تُحمَّل أصلاً. يقرؤه
 * العميلان من مصدرٍ واحد، ويخرج على الورقتين نقطةً نقطة.
 *
 * ويولّد معه صورةَ المعاينة للوحتين (public/dashboard/) من **نفس
 * البِتّات**، واسمُها يحمل بصمةَ الرسمة -- فلو تغيّرت الرسمةُ ولم
 * تُعَد المعاينةُ لم يتطابق الاسمان، وأوقف الحارسُ النشر.
 *
 *   node tools/receipt-art/build.mjs
 */

import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

/** عرضُ الرسمة على الورق بالنقاط، قبل قصِّ البياض حولها. */
const SCALE_WIDTH = 200;
/** إضاءةٌ دونها حبر. ١٧٠ قِيست على الناتج: تُبقي حدَّ الريشة ولا تُسمّنه. */
const THRESHOLD = 170;

/** تصغيرٌ بمتوسّطِ مساحةٍ -- أمينٌ للكتل، ولا يخترع حدّاً ليس في الأصل. */
function downscale(src, outW) {
  const scale = src.width / outW;
  const outH = Math.round(src.height / scale);
  const out = new Float64Array(outW * outH);
  const n = new Float64Array(outW * outH);
  for (let y = 0; y < src.height; y++) {
    const oy = Math.min(outH - 1, Math.floor(y / scale));
    for (let x = 0; x < src.width; x++) {
      const ox = Math.min(outW - 1, Math.floor(x / scale));
      out[oy * outW + ox] += src.data[(y * src.width + x) << 2];
      n[oy * outW + ox] += 1;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= (n[i] || 1);
  return { w: outW, h: outH, gray: out };
}

function binarize(img) {
  const bits = new Uint8Array(img.w * img.h);
  for (let i = 0; i < bits.length; i++) bits[i] = img.gray[i] < THRESHOLD ? 1 : 0;
  return bits;
}

/** يقصّ البياضَ حول الرسمة: ما حولها فراغٌ يُدار في التخطيط لا في الصورة. */
function trim(bits, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bits[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const out = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) out[y * tw + x] = bits[(y0 + y) * w + (x0 + x)];
  }
  return { bits: out, w: tw, h: th };
}

/**
 * ترميزُ المقاطع: لكلِّ صفٍّ أطوالٌ متناوبة تبدأ بالأبيض، بالأساس ٣٦،
 * تفصلها فواصل، والصفوفُ تفصلها فاصلةٌ منقوطة. وصفٌّ يساوي ما قبله
 * يُكتب `-` فلا يُعاد.
 */
function encode(bits, w, h) {
  const rows = [];
  let prev = null;
  for (let y = 0; y < h; y++) {
    const runs = [];
    let cur = 0, len = 0;
    for (let x = 0; x < w; x++) {
      const v = bits[y * w + x];
      if (v === cur) { len++; continue; }
      runs.push(len.toString(36));
      cur = v; len = 1;
    }
    if (len) runs.push(len.toString(36));
    const s = runs.join(',');
    rows.push(s === prev ? '-' : s);
    prev = s;
  }
  return rows.join(';');
}

function previewPng(bits, w, h, scale) {
  const out = new PNG({ width: w * scale, height: h * scale });
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const on = bits[((y / scale) | 0) * w + ((x / scale) | 0)];
      const d = (y * out.width + x) << 2;
      out.data[d] = out.data[d + 1] = out.data[d + 2] = on ? 0x12 : 0xff;
      out.data[d + 3] = on ? 255 : 0;
    }
  }
  return PNG.sync.write(out);
}

const src = PNG.sync.read(readFileSync(join(HERE, 'apache-source.png')));
const small = downscale(src, SCALE_WIDTH);
const t = trim(binarize(small), small.w, small.h);
const runs = encode(t.bits, t.w, t.h);
const hash = createHash('sha256').update(runs).digest('hex').slice(0, 8);

const ts = `/* مولَّد -- لا يُحرَّر. المصدر: tools/receipt-art/apache-source.png
   يُعاد بناؤه بـ: node tools/receipt-art/build.mjs */

/**
 * رسمةُ الشريط -- بِتَّاتٌ لا صورة.
 *
 * حُوّلت إلى لونين مرّةً في الأداة لا في الجهاز، فلا تختلف ورقةُ
 * التطبيق عن ورقة الويب بتنعيمٍ أو عتبة. وتُرسم مستطيلاتٍ بعملياتِ
 * الرسم نفسِها (rect)، فلا عمليةَ جديدةٌ يحتاجها منفّذ.
 */
export interface Art {
  /** بالنقاط، على ورقِ الطابعة مباشرةً. */
  readonly w: number;
  readonly h: number;
  /** أطوالٌ متناوبة تبدأ بالأبيض، بالأساس ٣٦؛ و\`-\` صفٌّ كالذي قبله. */
  readonly runs: string;
  /** بصمةُ المقاطع -- بها يُقابَل ملفُّ المعاينة في اللوحتين. */
  readonly hash: string;
}

export const APACHE: Art = {
  w: ${t.w},
  h: ${t.h},
  hash: '${hash}',
  runs:
    '${runs}',
};
`;
writeFileSync(join(ROOT, 'shared/receipt/art.ts'), ts);

const dashDir = join(ROOT, 'public/dashboard');
for (const f of readdirSync(dashDir)) {
  if (/^banner-art-[0-9a-f]{8}\.png$/.test(f)) unlinkSync(join(dashDir, f));
}
writeFileSync(join(dashDir, `banner-art-${hash}.png`), previewPng(t.bits, t.w, t.h, 2));

console.log(`الرسمة: ${t.w}×${t.h} نقطة (${(t.w / 8).toFixed(1)}×${(t.h / 8).toFixed(1)} مم)`);
console.log(`المقاطع: ${(runs.length / 1024).toFixed(1)} ك.ب   البصمة: ${hash}`);
console.log(`المعاينة: public/dashboard/banner-art-${hash}.png`);
