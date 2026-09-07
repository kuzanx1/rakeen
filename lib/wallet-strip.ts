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

/**
 * مقاس الشريط: 375×123 نقطة، وهي مقاس آبل لبطاقة المتجر.
 *
 * ويُولَّد بكثافتين. شاشات iPhone Pro وPro Max ثلاثية الكثافة، فصورةٌ
 * بضعف الكثافة تُكبَّر فيها فتلين حوافُّ الأختام -- وهي أوضح ما في
 * البطاقة وأولى ما يُنظر إليه. والفرق في الحجم بضعة كيلوبايت في بندلٍ
 * حدُّه ميغابايت ونصف.
 */
const STRIP_PT_W = 375;
const STRIP_PT_H = 123;

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

/** ================= أشكال الأختام ================= */

/**
 * الختم يُشبه ما يُباع.
 *
 * كوبٌ في بطاقة مغسلة سيارات ليس تفصيلاً صغيراً: هو أول ما يقوله
 * التصميم عن صاحبه، ويقوله خطأً. والمطاعم عندنا بأنواعها -- برجر
 * وحلا وصالون ونادٍ -- ولها منتقي أيقوناتٍ في لوحة التحكم من قبل،
 * كان يرسم بطاقة الويب وحدها. فيُقرأ هنا كذلك، ويصير للاختيار أثرٌ
 * في الجيب لا في المعاينة فقط.
 *
 * وتُرسم بالحساب لا تُستورَد صوراً: شكلٌ محسوب يبقى حاداً على أي
 * كثافة شاشة، ولا يضيف ملفاً إلى بندلٍ يُوقَّع ويُنقل في كل تحديث.
 */

type Pt = [number, number];

/** مسارٌ مغلق في مربّعٍ من -0.5 إلى 0.5، مركزه الصفر. */
interface Shape {
  paths: Pt[][];
  /**
   * مساراتٌ تُملأ دائماً، ولو كان الشكل مفرَّغاً -- حلقتا المقصّ.
   *
   * لأن الحلقة إطارٌ أصلاً: لو حُدَّت كبقيّة المسارات لالتقى حدُّ
   * دائرتيها -- المسافة بينهما أضيق من عرض الحدّ -- فامتلأت وصارت
   * قرصاً فيه نقطة.
   */
  always?: Pt[][];
  /**
   * أقراصٌ من جسم الشكل -- أصابعُ كفٍّ وعجلاتُ سيارة. تتبع حالته:
   * ممتلئةً معه، حلقاتٍ حين يُفرَّغ.
   */
  dots?: [number, number, number][];
  /**
   * ثقوبٌ فيه -- حبّاتُ البيتزا. بلون الخلفية حين يمتلئ، وإلا ضاعت في
   * جسمه؛ وحلقاتٌ حين يُفرَّغ، لأن الفارغ لا جسم فيه يُثقب.
   */
  holes?: [number, number, number][];
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 18, ry = r): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return out;
}

const circle = (cx: number, cy: number, r: number, steps = 20): Pt[] =>
  arc(cx, cy, r, 0, Math.PI * 2, steps);

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const PI = Math.PI;

function star(points: number, outer: number, inner: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -PI / 2 + (i * PI) / points;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** قلبٌ بمعادلته المعروفة، مُصغَّرٌ إلى المربّع نفسه. */
function heart(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push([(x / 34) * 1.02, (y / 34) * 1.02]);
  }
  return out;
}

const SHAPES: Record<string, Shape> = {
  generic: { paths: [star(5, 0.5, 0.21)] },

  burger: {
    paths: [
      // القبّة والقاعدة يُغلقان بخطٍّ مستقيم، وبينهما شريحة.
      [...arc(0, -0.02, 0.46, PI, PI * 2, 20, 0.34), [0.46, -0.02], [-0.46, -0.02]],
      rect(-0.46, 0.06, 0.46, 0.18),
      [[-0.46, 0.24], ...arc(0, 0.24, 0.46, 0, PI, 20, 0.24), [0.46, 0.24]],
    ],
  },

  coffee: {
    // كوبٌ بمقبض: نفس شكل cup() القديم، مصوغاً مساراتٍ ليتّحد المنطق.
    paths: [
      [[-0.30, -0.30], [0.30, -0.30], [0.22, 0.36], [-0.22, 0.36]],
      rect(-0.36, -0.42, 0.36, -0.30),
      [...arc(0.30, -0.06, 0.20, -PI / 2, PI / 2, 12), ...arc(0.30, -0.06, 0.10, PI / 2, -PI / 2, 12)],
    ],
  },

  pizza: {
    // القشرة قوسٌ مركزه الرأس -- لأنها في البيتزا الحقيقية حافّةُ دائرة
    // مركزها وسطها، والشريحة قطاعٌ منها. وقوسٌ بمركزٍ آخر يخرج مموّجاً.
    paths: [[[0, -0.48], ...arc(0, -0.48, 0.92, 1.121, 2.021, 16)]],
    holes: [[-0.13, 0.10, 0.075], [0.14, 0.05, 0.07], [0, 0.28, 0.065]],
  },

  pastry: {
    // هلالٌ: قوسٌ خارجي وآخر داخلي يعود -- كرواسان مبسّط.
    paths: [[...arc(0.04, 0, 0.47, PI * 0.60, PI * 1.40, 22), ...arc(0.30, 0, 0.40, PI * 1.36, PI * 0.64, 22)]],
  },

  dessert: {
    // كبكيك: قمّةٌ مدوّرة فوق قاعدةٍ ضيّقة.
    paths: [
      [...arc(0, -0.02, 0.36, PI, PI * 2, 18, 0.40), [0.36, -0.02], [-0.36, -0.02]],
      [[-0.34, 0.04], [0.34, 0.04], [0.22, 0.44], [-0.22, 0.44]],
    ],
  },

  car: {
    paths: [
      rect(-0.48, 0.02, 0.48, 0.24),
      [[-0.30, 0.02], [-0.20, -0.24], [0.20, -0.24], [0.30, 0.02]],
    ],
    dots: [[-0.26, 0.30, 0.12], [0.26, 0.30, 0.12]],
  },

  pet: {
    paths: [[...arc(0, 0.20, 0.30, PI, PI * 2, 16, 0.24), ...arc(0, 0.20, 0.30, 0, PI, 16, 0.28)]],
    dots: [[-0.30, -0.10, 0.115], [-0.11, -0.28, 0.115], [0.11, -0.28, 0.115], [0.30, -0.10, 0.115]],
  },

  salon: {
    // شفرتان تتقاطعان في الثلث الأسفل: الرأسان متباعدان فوق، والحلقتان
    // متباعدتان تحت. وشفرتان تلتقيان عند القمة تُخرجان حرف Λ لا مقصّاً --
    // فالتقاطعُ هو الذي يقول إنه مقص.
    paths: [
      [[-0.32, -0.46], [-0.20, -0.44], [0.24, 0.24], [0.14, 0.30]],
      [[0.32, -0.46], [0.20, -0.44], [-0.24, 0.24], [-0.14, 0.30]],
      // الحلقتان مسارٌ مثقوب لا قرص: يُرسم القرصان -- خارجيٌّ وداخلي --
      // في مصفوفةٍ واحدة، فيُلغي التداخلُ ما بينهما ويبقى الإطار.
    ],
    always: [
      // الحلقتان مسارٌ مثقوب لا قرص: يُرسم القرصان -- خارجيٌّ وداخلي --
      // في مصفوفةٍ واحدة، فيُلغي التداخلُ ما بينهما ويبقى الإطار.
      [...circle(-0.27, 0.35, 0.155, 16), ...circle(-0.27, 0.35, 0.075, 14)],
      [...circle(0.27, 0.35, 0.155, 16), ...circle(0.27, 0.35, 0.075, 14)],
    ],
  },

  gym: {
    paths: [rect(-0.30, -0.085, 0.30, 0.085), rect(-0.44, -0.27, -0.26, 0.27), rect(0.26, -0.27, 0.44, 0.27)],
  },

  retail: {
    paths: [
      rect(-0.40, -0.10, 0.40, 0.46),
      [...arc(0, -0.10, 0.22, PI, PI * 2, 14), ...arc(0, -0.10, 0.13, PI * 2, PI, 14)],
    ],
  },

  padel: {
    // مضربٌ: بيضةٌ فوق يدٍ قصيرة.
    paths: [circle(0, -0.16, 0.32, 22), rect(-0.075, 0.10, 0.075, 0.50)],
  },

  sports: { paths: [circle(0, 0, 0.46, 26), circle(0, 0, 0.30, 22)] },

  spa: {
    // قطرة: رأسٌ مدبّب وقاعٌ دائري.
    paths: [[[0, -0.48], ...arc(0, 0.12, 0.34, -PI * 0.34, PI * 1.34, 22)]],
  },

  clinic: {
    paths: [[
      [-0.14, -0.46], [0.14, -0.46], [0.14, -0.16], [0.44, -0.16], [0.44, 0.14],
      [0.14, 0.14], [0.14, 0.44], [-0.14, 0.44], [-0.14, 0.14], [-0.44, 0.14],
      [-0.44, -0.16], [-0.14, -0.16],
    ]],
  },
};

/** ما لا شكل له يأخذ النجمة -- وهي الحياد، لا كوبُ مقهى. */
function shapeFor(iconStyle: string | null | undefined): Shape {
  return SHAPES[iconStyle || "generic"] || SHAPES.generic;
}

/** أدنى مسافةٍ من نقطةٍ إلى ضلع -- بها تُرسم الحدود. */
function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / len;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

function inPoly(px: number, py: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * يرسم الشكل ممتلئاً أو مفرَّغاً.
 *
 * والممتلئ يُملأ بعيّناتٍ فرعية لا بفحصٍ واحدٍ لكل بكسل: حافّةٌ محسوبة
 * بنعم/لا تخرج مسنّنة، والبطاقة تُقارَن في المحفظة ببطاقاتٍ صنعتها
 * شركاتٌ لا تُخرج حوافَّ مسنّنة.
 *
 * والمفرَّغ حدٌّ لا جسم -- فيُقاس البعد إلى الأضلاع، ويُلوَّن ما قرب.
 * وبه يُقرأ الفرق بين ما نالَه الزبون وما بقي له.
 */
function drawShape(
  cv: Canvas, cx: number, cy: number, size: number, c: Rgb, filled: boolean, shape: Shape, hole: Rgb,
) {
  const s = size, x0 = cx - s / 2, y0 = cy - s / 2;
  const stroke = Math.max(1.6, s * 0.085);
  const toPx = (ps: Pt[][]) => ps.map(p => p.map(([x, y]) => [x0 + (x + 0.5) * s, y0 + (y + 0.5) * s] as Pt));
  const paths = toPx(shape.paths);
  const always = toPx(shape.always || []);

  const pad = stroke + 2;
  for (let y = Math.floor(cy - s / 2 - pad); y <= cy + s / 2 + pad; y++) {
    for (let x = Math.floor(cx - s / 2 - pad); x <= cx + s / 2 + pad; x++) {
      let a = 0;
      // المملوءُ دائماً يُحسب في الحالين، ويُجمع مع ما تحته لا يُطمَس.
      let solid = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
          if (always.some(p => inPoly(px, py, p))) solid++;
        }
      }
      if (filled) {
        let hit = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
            if (paths.some(p => inPoly(px, py, p))) hit++;
          }
        }
        a = hit / 9;
      } else {
        let d = Infinity;
        for (const p of paths) {
          for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
            const dd = distToSeg(x + 0.5, y + 0.5, p[j], p[i]);
            if (dd < d) d = dd;
          }
        }
        a = Math.min(1, stroke / 2 - d + 0.5);
      }
      a = Math.max(a, solid / 9);
      if (a > 0) cv.blend(x, y, c, a);
    }
  }

  /**
   * الأقراص تتبع الشكل، والثقوب تعاكسه.
   *
   * وثقبٌ بلون الجسم فوق الجسم لا يُرى -- فتضيع حبّات البيتزا في
   * الشريحة الممتلئة وحدها، وهي الشريحة التي يُنظر إليها. فيُرسم
   * بلون الخلفية: يصير فراغاً يُقرأ، كما يُقرأ في أي أيقونة.
   */
  for (const [dx, dy, r] of shape.dots || []) {
    const px = x0 + (dx + 0.5) * s, py = y0 + (dy + 0.5) * s;
    cv.disc(px, py, r * s, c, filled ? 0 : Math.max(1, r * s * 0.5));
  }
  for (const [dx, dy, r] of shape.holes || []) {
    const px = x0 + (dx + 0.5) * s, py = y0 + (dy + 0.5) * s;
    // وفي الفارغ قرصٌ صغير لا حلقة: حلقةٌ بهذا القطر تخرج زخرفةً
    // تُشوّش، والمقصود أثرٌ خفيف يقول إن هنا حبّة.
    cv.disc(px, py, r * s * (filled ? 1 : 0.62), filled ? hole : c);
  }
}

/** ================= فكّ ترميز PNG ================= */

/**
 * ختمُ صاحب المطعم صورةً يرفعها.
 *
 * الأشكال المرسومة تغطّي المألوف -- كوبٌ وبرجرٌ وكفٌّ -- ولا تغطّي
 * علامةً بعينها. ومن أراد ختمه هو، أراد شكله هو.
 *
 * وللرسم بها في الشريط لا بدّ من فكّ ترميزها، وWorkers لا تحمل مفكّ
 * صور. فيُكتب هنا -- ويُكتب ضيّقاً: الصورة تُقيَّس في المتصفّح قبل
 * رفعها إلى PNG بثمانية بتات لكل قناة، غير متشابك، فلا يُحتاج إلى
 * مفكٍّ عامٍّ يحمل كل ما تحتمله الصيغة. والضيّقُ المقروء أوثق من
 * العامّ الذي لا يُختبر إلا سُدسه.
 *
 * وDecompressionStream موجودٌ هناك كما وُجد CompressionStream، فالضغط
 * ليس المشكلة -- المشكلة كانت التصفية، وهي خمسة أسطر لكل صف.
 */

interface DecodedPng {
  w: number; h: number; px: Uint8Array;   // RGBA
  /** حدود ما فيه رسمٌ فعلاً -- بلا الهوامش الشفافة حوله. */
  x0: number; y0: number; x1: number; y1: number;
}

/**
 * حدود الرسم داخل الصورة.
 *
 * صورتان بنفس المقاس قد تُخرجان ختمين بحجمين: إحداهما رسمُها ملزوقٌ
 * بالحواف والأخرى حولها فراغٌ شفّاف. والاحتواء يحسب المربّع لا ما
 * فيه، فيخرج ختمٌ أكبر وختمٌ أصغر -- وهما حالتا شيءٍ واحد يقفان
 * متجاورين، فيُقرأ الفرق خللاً لا تصميماً.
 *
 * فتُقاس حدود ما رُسم، ويُحتوى ذلك لا المربّع. وصورةٌ ملزوقةٌ أصلاً
 * لا يتغيّر لها شيء -- القصّ لا يُنقص، إنما يُسوّي.
 */
function inkBounds(w: number, h: number, px: Uint8Array) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // أي شفافيةٍ غير معدومة رسمٌ.
      //
      // كانت العتبة 12 -- رقمٌ يتجاهل "ضجيج" الحواف. وكوبٌ بلاستيكيٌّ
      // شفّاف شفافيةُ زجاجه دون ذلك، فكانت تُقصّ حافّته العليا ويخرج
      // الكوب مقطوعاً. والقصّ يُراد به تسويةُ الهوامش الفارغة لا حذفُ
      // شيءٍ يُرى -- فما رُسم منه شيء، ولو خفيفاً، يبقى.
      if (px[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  // صورةٌ شفّافةٌ كلّها: تُترك كما هي بدل أن تُقصّ إلى لا شيء.
  return x1 < 0 ? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } : { x0, y0, x1, y1 };
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

function be32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

/** ترشيح الصف: خمس طرائق تصفها المواصفة، وأي واحدةٍ منها واردة. */
function unfilter(type: number, line: Uint8Array, prev: Uint8Array, bpp: number) {
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    let v = line[i];
    if (type === 1) v += a;
    else if (type === 2) v += b;
    else if (type === 3) v += (a + b) >> 1;
    else if (type === 4) {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    line[i] = v & 255;
  }
}

export async function decodePng(bytes: Uint8Array): Promise<DecodedPng | null> {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  let i = 8, w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;

  while (i + 8 <= bytes.length) {
    const len = be32(bytes, i);
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const body = bytes.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      w = be32(body, 0); h = be32(body, 4);
      depth = body[8]; color = body[9]; interlace = body[12];
    } else if (type === "PLTE") palette = body.slice();
    else if (type === "tRNS") trns = body.slice();
    else if (type === "IDAT") idat.push(body.slice());
    else if (type === "IEND") break;
    i += 12 + len;
  }

  // ثمانية بتاتٍ وغير متشابك: هو ما يُخرجه المتصفّح، وما نقيّس إليه
  // قبل الرفع. وغيرُه يُردّ بلا محاولة -- ومفكٌّ يدّعي ما لا يفكّ
  // يُخرج صورةً مشوّهة بدل أن يقول لا.
  if (!w || !h || depth !== 8 || interlace !== 0 || !idat.length) return null;
  if (w * h > 1_200_000) return null;

  const merged = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of idat) { merged.set(c, off); off += c.length; }

  let raw: Uint8Array;
  try { raw = await inflate(merged); } catch { return null; }

  const channels = color === 6 ? 4 : color === 2 ? 3 : color === 4 ? 2 : 1;
  const bpp = channels;
  const stride = w * bpp;
  if (raw.length < (stride + 1) * h) return null;

  const px = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);

  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    line.set(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    unfilter(raw[rowStart], line, prev, bpp);
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      if (color === 6) { px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2]; px[d + 3] = line[s + 3]; }
      else if (color === 2) { px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2]; px[d + 3] = 255; }
      else if (color === 4) { px[d] = px[d + 1] = px[d + 2] = line[s]; px[d + 3] = line[s + 1]; }
      else if (color === 0) { px[d] = px[d + 1] = px[d + 2] = line[s]; px[d + 3] = 255; }
      else if (color === 3 && palette) {
        const p = line[s] * 3;
        px[d] = palette[p]; px[d + 1] = palette[p + 1]; px[d + 2] = palette[p + 2];
        px[d + 3] = trns && line[s] < trns.length ? trns[line[s]] : 255;
      }
    }
    prev = line.slice();
  }
  return { w, h, px, ...inkBounds(w, h, px) };
}

/**
 * يرسم صورة الختم في خليّتها.
 *
 * الممتلئ بألوانه كما رُفع، والفارغ باهتٌ مُطفأ اللون -- لا محذوفاً
 * ولا مرسوماً بحدّ. لأن الحدّ يُستخرج من شكلٍ نعرف مساراته، وهذه صورةٌ
 * لا نعرف منها إلا بكسلاتها. والباهتُ يقول "لم يُنَل بعد" بوضوحٍ يكفي،
 * وهو ما تفعله البطاقات التي يُحتذى بها.
 *
 * والتصغير بعيّناتٍ ثنائية الخطّية: صورةٌ 300 بكسل تُصغَّر إلى 80، وأخذُ
 * أقرب بكسلٍ يترك حوافّها مهترئة.
 */
function drawImageStamp(
  cv: Canvas, img: DecodedPng, cx: number, cy: number, size: number, filled: boolean, bg: Rgb,
) {
  // تُحتوى بنسبتها لا ممدودة، وبحدود رسمها لا بحدود ملفها: هامشٌ
  // شفّافٌ في إحدى الصورتين دون الأخرى يُخرج ختمين بحجمين.
  const iw = img.x1 - img.x0 + 1, ih = img.y1 - img.y0 + 1;
  const scale = Math.min(size / iw, size / ih);
  const dw = iw * scale, dh = ih * scale;
  const x0 = cx - dw / 2, y0 = cy - dh / 2;

  for (let y = Math.floor(y0); y < y0 + dh; y++) {
    for (let x = Math.floor(x0); x < x0 + dw; x++) {
      const sx = img.x0 + ((x + 0.5 - x0) / scale) - 0.5;
      const sy = img.y0 + ((y + 0.5 - y0) / scale) - 0.5;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      const fx = sx - ix, fy = sy - iy;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < 4; k++) {
        const px = Math.min(img.w - 1, Math.max(0, ix + (k & 1)));
        const py = Math.min(img.h - 1, Math.max(0, iy + (k >> 1)));
        const wgt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy);
        const o = (py * img.w + px) * 4;
        r += img.px[o] * wgt; g += img.px[o + 1] * wgt; b += img.px[o + 2] * wgt; a += img.px[o + 3] * wgt;
      }
      let c: Rgb = { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
      let alpha = a / 255;
      if (!filled) {
        const lum = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
        c = mix({ r: lum, g: lum, b: lum }, bg, 0.45);
        alpha *= 0.42;
      }
      if (alpha > 0.004) cv.blend(x, y, c, alpha);
    }
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
  /** لون الأختام والتفاصيل. */
  accentColor: string;
  /** لون البطاقة -- تُشتقّ منه خلفية الشريط. */
  bgColor?: string | null;
  iconStyle?: string | null;
  /** ختمُ صاحب المطعم صورةً -- يُقدَّم على كل شكلٍ مرسوم. */
  stampPng?: Uint8Array | null;
  /** ختمُ ما قبل الزيارة صورةً -- حين يُترك، يُشتقّ من الممتلئ. */
  stampEmptyPng?: Uint8Array | null;
  /** خلفيةُ الشريط صورةً يرفعها. */
  bgPng?: Uint8Array | null;
  /** behind: الأختام فوقها. replace: هي وحدها. */
  stripMode?: "behind" | "replace";
  /** خلفية الشريط: مشتقّةً، أو لوناً، أو تدرّجاً بين لونين. */
  stripBgMode?: "auto" | "solid" | "gradient" | "image";
  stripBg1?: string | null;
  stripBg2?: string | null;
  /** ترتيب الأختام في الشريط. */
  stampLayout?: "grid" | "stagger" | "arch" | "wave";
  /** شدّة الحجاب فوق صورة الخلفية: 0-75 بالمئة. */
  stripScrim?: number | null;
  /** مقاس الختم نسبةً إلى المحسوب: 50-200 بالمئة. */
  stampSize?: number | null;
}

/**
 * شريط الأختام: صفٌّ واحد إن قلّت، وصفّان إن كثرت.
 *
 * وأكثر من عشرة في صفٍّ واحد تصير نقاطاً لا أختاماً، فتُقسَم. وفوق
 * الأربعة عشر تُترك الأرقام تقولها -- الشريط يُدرَك في لمحة، وما لا
 * يُعدّ في لمحة لا يُرسم.
 */
export async function buildStripPng(input: StripInput, density = 2): Promise<Uint8Array> {
  const STRIP_W = STRIP_PT_W * density;
  const STRIP_H = STRIP_PT_H * density;
  /**
   * لونان لا لون: لون البطاقة، ولون الأختام فيها.
   *
   * كانا واحداً، فكانت الأختام لوناً مفتّحاً من خلفيتها -- أي أن من
   * اختار بيج فاتحاً للبطاقة حصل على أختامٍ بيجية على شريطٍ بيجي،
   * وبطاقةٍ لا يُقرأ فيها كم ختمٍ نال. وهما قراران مختلفان في ذهن صاحب
   * المطعم أصلاً: لون علامته، ولون ما يلمع فيها.
   */
  const base = parseHex(input.bgColor || input.accentColor, { r: 196, g: 255, b: 43 });
  const raw = parseHex(input.accentColor, { r: 196, g: 255, b: 43 });
  const bg = mix(base, { r: 0, g: 0, b: 0 }, 0.80);   // خلفية الشريط: قاتمٌ من لون البطاقة

  /**
   * لونُ الختم يُضمَن أن يُرى.
   *
   * لون علامةٍ داكن -- أخضر غامق مثلاً -- يذوب في خلفيةٍ مشتقّة منه،
   * فتخرج الأختام الممتلئة غير مرئية والبطاقة بلا معنى. فيُفتَّح حتى
   * يبلغ فرقاً كافياً، ولا يُترك للحظّ.
   */
  const lum = (c: Rgb) => (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
  const on = contrastOn(bg);
  const cv = new Canvas(STRIP_W, STRIP_H, bg);

  /**
   * خلفية الشريط: لونٌ أو تدرّجٌ أو مشتقّة.
   *
   * كانت تُشتقّ دائماً من لون البطاقة -- قاتمٌ منه بنسبةٍ ثابتة. وهذا
   * يعطي بطاقةً متّسقة بلا أن يُطلب من صاحبها قرار، وهو الافتراضي
   * الصحيح. لكنه ليس القرار الوحيد: من عنده هويةٌ فيها لونان أراد
   * الاثنين، ومن أراد أسود صافياً خلف أختامه الذهبية أراده هو.
   *
   * والتدرّج قُطريّ: أفقيٌّ محضٌ يُقرأ شريطاً مطبوعاً، وقُطريٌّ يُقرأ
   * ضوءاً يمرّ. والفرق بينهما هو الفرق بين خلفيةٍ وتصميم.
   */
  const bgMode = input.stripBgMode || "auto";
  if (bgMode !== "auto") {
    const c1 = parseHex(input.stripBg1 || "", bg);
    const c2 = bgMode === "gradient" ? parseHex(input.stripBg2 || "", c1) : c1;
    for (let y = 0; y < STRIP_H; y++) {
      for (let x = 0; x < STRIP_W; x++) {
        const t = bgMode === "gradient"
          ? Math.min(1, Math.max(0, (x / STRIP_W) * 0.78 + (y / STRIP_H) * 0.22))
          : 0;
        cv.blend(x, y, mix(c1, c2, t), 1);
      }
    }
  }

  /**
   * خلفية الشريط صورةً.
   *
   * وهذه هي كل الحرّية التي تعطيها آبل في البطاقة: شريطٌ واحد، صورةٌ
   * واحدة، نولّدها نحن. فما يُرى في البطاقات المحترفة -- خلفيةٌ ثم
   * رسمٌ ثم أختامٌ فوقها -- ليس طبقاتٍ يقدّمها القالب، إنما طبقاتٌ
   * تُدمج قبل أن تصير صورة. ومن ملك التوليد ملكها كلها.
   *
   * وتُغطّي بنسبتها لا ممدودة: صورةٌ بنسبةٍ أخرى تُمدّ فتُشوّه وجوهاً
   * وحروفاً، والقصّ أرحم من المطّ.
   */
  let bgImg: DecodedPng | null = null;
  // ولا تُرسم إلا حين تُختار: من رفع صورةً ثم عاد إلى لونٍ أراد اللون،
  // والصورةُ تبقى محفوظةً له إن رجع -- لا تُرسم من تحته.
  if (input.bgPng && (input.stripBgMode || "auto") === "image") {
    bgImg = await decodePng(input.bgPng).catch(() => null);
    if (bgImg) {
      const sc = Math.max(STRIP_W / bgImg.w, STRIP_H / bgImg.h);
      const dw = bgImg.w * sc, dh = bgImg.h * sc;
      const ox = (STRIP_W - dw) / 2, oy = (STRIP_H - dh) / 2;
      for (let y = 0; y < STRIP_H; y++) {
        for (let x = 0; x < STRIP_W; x++) {
          const sx = Math.min(bgImg.w - 1, Math.max(0, Math.floor((x - ox) / sc)));
          const sy = Math.min(bgImg.h - 1, Math.max(0, Math.floor((y - oy) / sc)));
          const o = (sy * bgImg.w + sx) * 4;
          cv.blend(x, y, { r: bgImg.px[o], g: bgImg.px[o + 1], b: bgImg.px[o + 2] }, bgImg.px[o + 3] / 255);
        }
      }
    }
  }
  const imageOnly = !!bgImg && input.stripMode === "replace";

  /**
   * حجابٌ خفيف تحت الأختام.
   *
   * صورةٌ فيها بياضٌ وسوادٌ معاً تبتلع أي لونٍ يُرسم فوقها: يختفي الختم
   * في نصف الشريط ويظهر في نصفه. والحجاب يُقارب الخلفية إلى مستوى
   * واحد، فيصير للختم أرضٌ واحدة يُقاس عليها.
   *
   * ولا يُوضع إلا حين تُرسم أختام: صورةٌ وحدها لا يُعتَّم عليها بلا سبب.
   */
  const scrim = Math.min(75, Math.max(0, input.stripScrim ?? 34)) / 100;
  if (bgImg && !imageOnly && scrim > 0) {
    for (let y = 0; y < STRIP_H; y++) {
      for (let x = 0; x < STRIP_W; x++) cv.blend(x, y, { r: 8, g: 8, b: 10 }, scrim);
    }
  }

  /**
   * متوسّط ضوء ما رُسم -- به يُقاس الختم، لا بلونٍ افتراضي.
   *
   * ويُقاس بعد الرسم لا قبله: الخلفية قد تكون صورةً لا نعرف ضوءها إلا
   * بعد أن تُرسم. وحسابُ لون الختم قبل ذلك حسابٌ على أرضٍ غير التي
   * سيقف عليها.
   */
  const fieldLum = (() => {
    if (!bgImg) return lum(bg);
    let sum = 0, n = 0;
    for (let i = 0; i < cv.px.length; i += 4 * 37) {   // عيّنةٌ متفرّقة تكفي
      sum += (cv.px[i] * 299 + cv.px[i + 1] * 587 + cv.px[i + 2] * 114) / 1000;
      n++;
    }
    return n ? sum / n : lum(bg);
  })();

  /**
   * لونُ الختم يُضمَن أن يُرى.
   *
   * لون علامةٍ داكن يذوب في أرضٍ داكنة، وفاتحٌ يذوب في فاتحة. فيُدفع
   * بعيداً عنها -- إلى البياض أو السواد، أيّهما أبعد -- حتى يبلغ فرقاً
   * كافياً. ولا يُترك للحظّ.
   */
  let accent = raw;
  const toward = fieldLum > 140 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  for (let i = 0; i < 12 && Math.abs(lum(accent) - fieldLum) < 90; i++) {
    accent = mix(accent, toward, 0.18);
  }

  if (imageOnly) return encodePng(cv);

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

  const shape = shapeFor(input.iconStyle);
  // صورةٌ فشل فكّها لا تُسقط البطاقة: تُترك ويُرسم الشكل المختار.
  const stampImg = input.stampPng ? await decodePng(input.stampPng).catch(() => null) : null;
  // ختمُ الحالة الفارغة صورةً مستقلّة: رسمةٌ أخرى لا شفافيةٌ أقلّ.
  const stampEmptyImg = input.stampEmptyPng ? await decodePng(input.stampEmptyPng).catch(() => null) : null;
  const total = Math.max(1, Math.min(14, input.threshold));
  const done = Math.max(0, Math.min(total, input.progress));
  const rows = total > 7 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  // الحجم يتبع الصفّ الأعرض، والمسافة الرأسية تتبع الحجم لا رقماً
  // ثابتاً: كانت 0.82 من الحجم -- أي أقلّ من الكوب نفسه -- فتراكب
  // الصفّان وصارا شكلاً لا يُقرأ.
  const layout = input.stampLayout || "grid";
  // نسبةُ المقاس تُضرب في المحسوب بعد حسابه، ثم يُقيَّد بما لا يتجاوز
  // ارتفاع الشريط: نسبةٌ كبيرة مع أربعة عشر ختماً تُخرجها متراكبة،
  // والقيدُ يمنع أن يصير الاختيار سبباً في بطاقةٍ لا تُقرأ.
  const sizeScale = Math.min(200, Math.max(50, input.stampSize ?? 100)) / 100;
  const size = rows === 1
    // الثوابت بالنقاط لا بالبكسلات: مضروبةً في الكثافة تبقى الأختام
    // بالحجم نفسه على الكثافتين. ولو تُركت بكسلاتٍ لخرجت في @3x أصغر
    // بثلثها -- صورةٌ أحدّ وأختامٌ أضأل، وهو عكس المقصود.
    ? Math.min(56 * density, ((STRIP_W - 60 * density) / perRow) * 0.78)
    : Math.min(42 * density, ((STRIP_W - 50 * density) / perRow) * 0.78, (STRIP_H - 22 * density) / 2);
  /**
   * الحدّ الرأسي يحسب الميل، لا الحجم وحده.
   *
   * الترتيب يزحزح الختم عن وسط صفّه -- الموجةُ ثلاثين بالمئة من حجمه،
   * والقوسُ ستّةً وثلاثين. فختمٌ يبلغ 0.82 من ارتفاع الشريط ثم يُزاح
   * 0.30 من حجمه يخرج عن حدّ الشريط، فيُقصّ رأسُه أو قاعدتُه -- والصورة
   * كاملةٌ سليمة، إنما اللوحُ أضيق مما وُضع عليه.
   *
   * فيُحلّ للحجم: نصفُه زائداً إزاحتَه لا يتجاوزان نصف الارتفاع. وبها
   * لا يُقصّ ختمٌ مهما رُفع مقاسه ومهما اختير ترتيبه -- والاختيار لا
   * ينبغي أن يكون سبباً في بطاقةٍ مقطوعة.
   */
  const riseFactor =
    layout === "arch" ? 0.26 :
    layout === "wave" ? 0.22 :
    layout === "stagger" ? 0.20 : 0;
  /**
   * والحدّ الرأسي يحسب المسافة بين الصفّين كذلك.
   *
   * كان يقسم الارتفاع على عدد الصفوف ويكتفي -- وذلك يفترض أن الصفّين
   * متلاصقان، وبينهما مسافةٌ قدرُها 1.22 من حجم الختم. فامتدادُهما
   * الحقيقي أكبر من نصفَي الشريط، فيخرج أعلى الصفّ الأول عن حدّه وأسفلُ
   * الثاني عن حدّه، ويُقصّان معاً.
   *
   * ولا يظهر إلا عند عشرة أختامٍ فأكثر (وهي التي تُقسَم صفّين) وبمقاسٍ
   * مرفوع -- فيبدو عيباً في الصورة المرفوعة لا في الحساب، ويُعاد
   * قصُّها وتصديرها بلا فائدة.
   *
   * فيُحلّ للحجم مرّةً واحدة: نصفُ الختم، زائداً نصيبَه من المسافات بين
   * الصفوف، زائداً إزاحةَ الترتيب -- لا يتجاوز نصف الشريط.
   */
  const GAP_Y_RATIO = 1.22;
  const riseAt = riseFactor * (rows === 1 ? 1 : 0.62);
  const verticalCap =
    (STRIP_H * 0.94 / 2) / (((rows - 1) * GAP_Y_RATIO) / 2 + 0.5 + riseAt);

  const stampSize = Math.min(
    size * sizeScale,
    (STRIP_W / perRow) * 0.94,
    verticalCap,
  );
  const gapY = rows === 1 ? 0 : stampSize * GAP_Y_RATIO;

  /**
   * ترتيب الأختام.
   *
   * الصفُّ المستقيم أوضح ما يُعدّ، وليس أجمل ما يُرى. والبطاقات التي
   * تُحتذى لا تصفّ أختامها صفّاً واحداً مستوياً -- فيها ما يعلو وما
   * ينزل، وفيها ما ينحني كقوس. والعين تقرأ الميل قبل أن تعدّ.
   *
   * وكلّها تحفظ الترتيب من اليمين والمسافات المتساوية: الزخرفة في
   * الارتفاع لا في العدّ، فلا يضيع كم ختماً نال.
   */
  const rise = (i: number, n: number): number => {
    // الموضع بالترتيب لا بالنسبة: التعرّج يتبع فرديّة الرقم، ونسبةٌ
    // كسريّة لا فرديّة لها. (كان يُحسب من النسبة فخرج الصفّ مستقيماً
    // وكأن الاختيار لا أثر له.)
    const t = n <= 1 ? 0.5 : i / (n - 1);
    switch (layout) {
      // واحدٌ يعلو وواحدٌ ينزل -- أبسط ما يكسر استقامة الصفّ.
      case "stagger": return (i % 2 === 0 ? -1 : 1) * stampSize * 0.20;
      // قوسٌ: أطرافه أدنى ووسطه أعلى.
      case "arch":    return -Math.sin(t * Math.PI) * stampSize * 0.26;
      case "wave":    return Math.sin(t * Math.PI * 2) * stampSize * 0.22;
      default:        return 0;
    }
  };

  /**
   * المسافة تتبع الحجم، والصفُّ يُوسَّط.
   *
   * كانت المواضع تُوزَّع على عرض الشريط كلّه مهما صغُر الختم: ستّة
   * أختامٍ بنصف الحجم تبقى متباعدةً كما كانت بحجمها كامل، فتضيع في
   * فراغٍ حولها ويبدو الشريط مضروباً. والعين تقرأ المجموعة بالمسافة
   * بينها كما تقرؤها بحجمها.
   *
   * فتُحسب المسافة نسبةً من الحجم، ويُوسَّط ما يخرج. وإن ضاق العرض عن
   * ذلك عاد التوزيع إلى ما كان -- لأن التراكب أسوأ من التباعد.
   */
  const GAP_RATIO = 0.46;

  /**
   * هامشٌ عن الحافّتين، دائماً.
   *
   * كان الصفُّ يُوزَّع على العرض كلّه حين يضيق، فيلتصق أوّلُ ختمٍ
   * وآخرُه بحافّة الشريط -- والبطاقة لها زوايا مستديرة، فيبدو الختم
   * مقصوصاً وإن لم يُقصّ. والهامشُ ليس زينة: هو ما يجعل الصفَّ يُقرأ
   * مجموعةً واحدة لا شيئاً انسكب.
   */
  const MARGIN = STRIP_W * 0.07;
  const USABLE = STRIP_W - MARGIN * 2;

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const inThis = Math.min(perRow, total - r * perRow);
    const gapX = stampSize * GAP_RATIO;
    const rowW = inThis * stampSize + (inThis - 1) * gapX;
    const tight = rowW <= USABLE;
    // الضيّق يُوسَّط بمسافته، والواسع يُوزَّع داخل المساحة المتاحة --
    // لا على الشريط كلّه.
    const step = tight ? stampSize + gapX : USABLE / inThis;
    const first = tight
      ? STRIP_W - (STRIP_W - rowW) / 2 - stampSize / 2
      : STRIP_W - MARGIN - step / 2;
    const cyRow = STRIP_H / 2 + (r - (rows - 1) / 2) * gapY;
    for (let i = 0; i < inThis; i++, idx++) {
      // تُملأ من اليمين: البطاقة عربية، والعين تبدأ من هناك. وصورةُ
      // الشريط لا تعرف اتجاهاً -- فالاتجاه يُصنع هنا، لا يُترك للقالب.
      // ولو مُلئت من اليسار لخالفت المعاينة التي تتبع اتجاه الصفحة،
      // وصار ما يُضبط غير ما يُطبع.
      const cx = first - i * step;
      const cy = cyRow + rise(i, inThis) * (rows === 1 ? 1 : 0.62);
      const filled = idx < done;
      // الفارغ يُرسم بلونٍ أبهت ابتداءً، لا يُعتَّم بعد رسمه.
      //
      // كان يُرسم كاملاً ثم يُمرَّر عليه مربعٌ يخفّفه -- والمربع يطال ما
      // حوله، فيقع على الكوب الذي فوقه في الصفّ الثاني ويترك عليه
      // شريطاً داكناً. واللونُ الصحيح من أول رسمة لا يحتاج تصحيحاً
      // بعده.
      if (stampImg && !filled && stampEmptyImg) {
        // له صورةٌ للفارغ: تُرسم كما هي، بألوانها -- فهي الحالة نفسها
        // لا حالةٌ منقوصة منها.
        drawImageStamp(cv, stampEmptyImg, cx, cy, stampSize, true, bg);
      } else if (stampImg) drawImageStamp(cv, stampImg, cx, cy, stampSize, filled, bg);
      else drawShape(cv, cx, cy, stampSize, filled ? accent : mix(on, bg, 0.42), filled, shape, bg);
    }
  }
  return encodePng(cv);
}
