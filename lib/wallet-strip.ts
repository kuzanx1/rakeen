/**
 * الصورة الشريطية للبطاقة: الأختام مرسومةً لا مكتوبة.
 *
 * "٣ من ٦" رقمٌ يُقرأ. وستة أكواب، ثلاثةٌ منها ممتلئة، شيءٌ يُدرَك في
 * لمحة وهو في الجيب -- وهو ما يجعل بطاقة الولاء تُفتح لا تُنسى. وكل
 * البطاقات المحترفة تفعل هذا في strip.png، لا في حقل نصّي.
 *
 * وتُولَّد لكل زبون على حدة لأن عدّاده يخصّه، وتُبنى في الخادم بلا
 * canvas ولا مكتبة رسم: Workers لا تحمل أياً منهما. فالبكسلات تُرسم
 * بالحساب، وتُلفّ في PNG بضغط CompressionStream -- وهو موجودٌ هناك.
 */

const STRIP_W = 750;   // 375pt @2x -- عرض الشريط الذي تعتمده آبل
const STRIP_H = 246;   // 123pt @2x

interface Rgb { r: number; g: number; b: number }

function parseHex(hex: string, fallback: Rgb): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** أبيض أو أسود -- أيّهما يُقرأ فوق هذا اللون. */
function contrastOn({ r, g, b }: Rgb): Rgb {
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? { r: 24, g: 23, b: 15 } : { r: 255, g: 255, b: 255 };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/** لوحُ بكسلات RGBA بسيط، يُرسم عليه بالحساب. */
class Canvas {
  w: number; h: number; px: Uint8Array;
  constructor(w: number, h: number, bg: Rgb) {
    this.w = w; this.h = h;
    this.px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg.r; this.px[i * 4 + 1] = bg.g; this.px[i * 4 + 2] = bg.b; this.px[i * 4 + 3] = 255;
    }
  }
  /** مزجٌ بشفافية -- به تُنعَّم الحواف فلا تخرج مسنّنة. */
  blend(x: number, y: number, c: Rgb, a: number) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const k = Math.min(1, a);
    this.px[i] = Math.round(this.px[i] * (1 - k) + c.r * k);
    this.px[i + 1] = Math.round(this.px[i + 1] * (1 - k) + c.g * k);
    this.px[i + 2] = Math.round(this.px[i + 2] * (1 - k) + c.b * k);
  }
  /**
   * قرصٌ أو حلقة، بحوافّ ناعمة.
   *
   * والنعومة ليست زينة: دائرةٌ بحوافّ حادّة على شاشة ريتينا تبدو
   * مصنوعةً بعجلة، والبطاقة تُقارَن بما حولها في المحفظة.
   */
  disc(cx: number, cy: number, r: number, c: Rgb, ring = 0) {
    const r0 = ring > 0 ? r - ring : 0;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        let a = 0;
        if (ring > 0) {
          if (d <= r && d >= r0) a = Math.min(1, r - d + 1) * Math.min(1, d - r0 + 1);
        } else {
          a = Math.min(1, r - d + 0.5);
        }
        if (a > 0) this.blend(x, y, c, a);
      }
    }
  }
  /** مستطيلٌ بزوايا مستديرة -- جسم الكوب وما يشبهه. */
  roundRect(x0: number, y0: number, w: number, h: number, rad: number, c: Rgb) {
    for (let y = Math.floor(y0); y < y0 + h; y++) {
      for (let x = Math.floor(x0); x < x0 + w; x++) {
        const dx = Math.max(x0 + rad - x, 0, x - (x0 + w - rad - 1));
        const dy = Math.max(y0 + rad - y, 0, y - (y0 + h - rad - 1));
        const d = Math.hypot(dx, dy);
        const a = d <= rad ? Math.min(1, rad - d + 0.5) : 0;
        if (a > 0) this.blend(x, y, c, a);
      }
    }
  }
}

/**
 * كوبٌ مبسّط: جسمٌ مخروطي وغطاء.
 *
 * لا صورةَ فوتوغرافية ولا أيقونةَ مستوردة: شكلٌ يُرسم بالحساب يبقى
 * حاداً على أي كثافة شاشة، ولا يضيف ملفاً إلى بندلٍ يُوقَّع.
 */
function cup(cv: Canvas, cx: number, cy: number, size: number, c: Rgb, filled: boolean) {
  const w = size * 0.62, h = size;
  const topY = cy - h / 2, botY = cy + h / 2;
  const topW = w, botW = w * 0.72;
  for (let y = Math.floor(topY); y <= botY; y++) {
    const t = (y - topY) / h;
    const halfW = (topW + (botW - topW) * t) / 2;
    for (let x = Math.floor(cx - halfW - 1); x <= cx + halfW + 1; x++) {
      const dist = Math.abs(x + 0.5 - cx);
      const edge = Math.min(1, halfW - dist + 0.5);
      if (edge <= 0) continue;
      // الفارغ حدٌّ وحده، والممتلئ جسمٌ كامل.
      const a = filled ? edge : Math.min(edge, Math.max(0, dist - (halfW - size * 0.075)) * 2);
      if (a > 0) cv.blend(x, y, c, a);
    }
  }
  // الغطاء: شريطٌ أعرض قليلاً يميّز الشكل عن مجرّد مثلث.
  cv.roundRect(cx - topW / 2 - size * 0.06, topY - size * 0.10, topW + size * 0.12, size * 0.12, size * 0.05, c);
  // وقاعدةٌ تُغلق الفارغ: بلاها يبدو كوباً مقصوصاً لا كوباً فارغاً --
  // والممتلئ لا يحتاجها، جسمه يبلغ القاع.
  if (!filled) {
    cv.roundRect(cx - botW / 2, botY - size * 0.075, botW, size * 0.075, size * 0.03, c);
  }
}

/** ================= ترميز PNG ================= */

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const forCrc = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(forCrc), false);
  return out;
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  // 'deflate' في CompressionStream يُخرج تدفّق zlib -- وهو بالضبط ما
  // يشترطه PNG في IDAT، فلا رأسٌ يُضاف ولا يُنزع.
  const cs = new CompressionStream("deflate");
  const stream = new Blob([raw as unknown as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePng(cv: Canvas): Promise<Uint8Array> {
  // كل سطر يسبقه بايت المرشّح (0 = بلا مرشّح).
  const raw = new Uint8Array(cv.h * (1 + cv.w * 4));
  for (let y = 0; y < cv.h; y++) {
    raw[y * (1 + cv.w * 4)] = 0;
    raw.set(cv.px.subarray(y * cv.w * 4, (y + 1) * cv.w * 4), y * (1 + cv.w * 4) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, cv.w, false);
  dv.setUint32(4, cv.h, false);
  ihdr[8] = 8;    // عمق البت
  ihdr[9] = 6;    // RGBA
  const idat = await deflate(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** ================= الشريط ================= */

export interface StripInput {
  systemType: "points" | "visits" | "products";
  progress: number;
  threshold: number;
  points: number;
  accentColor: string;
}

/**
 * شريط الأختام: صفٌّ واحد إن قلّت، وصفّان إن كثرت.
 *
 * وأكثر من عشرة في صفٍّ واحد تصير نقاطاً لا أختاماً، فتُقسَم. وفوق
 * الأربعة عشر تُترك الأرقام تقولها -- الشريط يُدرَك في لمحة، وما لا
 * يُعدّ في لمحة لا يُرسم.
 */
export async function buildStripPng(input: StripInput): Promise<Uint8Array> {
  const raw = parseHex(input.accentColor, { r: 196, g: 255, b: 43 });
  const bg = mix(raw, { r: 0, g: 0, b: 0 }, 0.80);   // خلفية داكنة من لون العلامة

  /**
   * لونُ الختم يُضمَن أن يُرى.
   *
   * لون علامةٍ داكن -- أخضر غامق مثلاً -- يذوب في خلفيةٍ مشتقّة منه،
   * فتخرج الأختام الممتلئة غير مرئية والبطاقة بلا معنى. فيُفتَّح حتى
   * يبلغ فرقاً كافياً، ولا يُترك للحظّ.
   */
  const lum = (c: Rgb) => (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
  let accent = raw;
  for (let i = 0; i < 12 && Math.abs(lum(accent) - lum(bg)) < 90; i++) {
    accent = mix(accent, { r: 255, g: 255, b: 255 }, 0.18);
  }
  const on = contrastOn(bg);
  const cv = new Canvas(STRIP_W, STRIP_H, bg);

  if (input.systemType === "points") {
    /**
     * النقاط لا أختام لها: رصيدٌ يتصاعد بلا سقف. فموجةٌ هادئة بدل صفٍّ
     * كاذب -- والرقم في ترويسة البطاقة يقوله.
     */
    for (let x = 0; x < STRIP_W; x++) {
      const t = x / STRIP_W;
      const y = STRIP_H * (0.62 + Math.sin(t * Math.PI * 2.2) * 0.14 + Math.sin(t * Math.PI * 5.1) * 0.05);
      for (let k = 0; k < 3; k++) {
        cv.blend(x, Math.round(y) + k, accent, 0.55 - k * 0.15);
      }
      for (let yy = Math.round(y) + 3; yy < STRIP_H; yy++) {
        cv.blend(x, yy, accent, 0.055);
      }
    }
    return encodePng(cv);
  }

  const total = Math.max(1, Math.min(14, input.threshold));
  const done = Math.max(0, Math.min(total, input.progress));
  const rows = total > 7 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  // الحجم يتبع الصفّ الأعرض، والمسافة الرأسية تتبع الحجم لا رقماً
  // ثابتاً: كانت 0.82 من الحجم -- أي أقلّ من الكوب نفسه -- فتراكب
  // الصفّان وصارا شكلاً لا يُقرأ.
  const size = rows === 1
    ? Math.min(112, ((STRIP_W - 120) / perRow) * 0.78)
    : Math.min(84, ((STRIP_W - 100) / perRow) * 0.78, (STRIP_H - 44) / 2);
  const gapY = rows === 1 ? 0 : size * 1.22;

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const inThis = Math.min(perRow, total - r * perRow);
    const step = STRIP_W / (inThis + 1);
    const cy = STRIP_H / 2 + (r - (rows - 1) / 2) * gapY;
    for (let i = 0; i < inThis; i++, idx++) {
      const cx = step * (i + 1);
      const filled = idx < done;
      // الفارغ يُرسم بلونٍ أبهت ابتداءً، لا يُعتَّم بعد رسمه.
      //
      // كان يُرسم كاملاً ثم يُمرَّر عليه مربعٌ يخفّفه -- والمربع يطال ما
      // حوله، فيقع على الكوب الذي فوقه في الصفّ الثاني ويترك عليه
      // شريطاً داكناً. واللونُ الصحيح من أول رسمة لا يحتاج تصحيحاً
      // بعده.
      cup(cv, cx, cy, size, filled ? accent : mix(on, bg, 0.42), filled);
    }
  }
  return encodePng(cv);
}
