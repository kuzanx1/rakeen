// «روابطك» -- ألوان كل تصميم تتولّد من هوية المطعم: لون أساسي (من الشعار
// أو لون المتجر) ولون ثاني اختياري. كل تصميم له «نغمات» (هويتك، داكن،
// أوف وايت، أبيض)، وكلها مبنية على نفس اللون فتبقى الصفحة بهوية المطعم
// مهما بدّل التصميم. التصاميم تختلف بطريقة العرض، لا بالألوان.

import type { BoldOpts, CoverOpts, TemplateKey, VelvetOpts } from "./model";

export type Brand = { primary: string; second: string };
type Opts = { velvet: VelvetOpts; cover: CoverOpts; bold: BoldOpts };
export type Tone<K extends TemplateKey = TemplateKey> = { name: string; light?: boolean; v: Partial<Opts[K]> };

/** حقول الألوان في كل تصميم: تعديل أي واحد منها يدوياً = «ألوان يدوية». */
export const COLOR_KEYS: Record<TemplateKey, string[]> = {
  velvet: ["tint", "bgColor", "ink", "accent"],
  cover: ["panel", "ink", "accent", "ring"],
  bold: ["hero", "heroInk", "panel", "ink", "accent", "tile", "tileInk"],
};

/** لو ما عرفنا هوية المطعم. */
export const FALLBACK_BRAND = "#7A1426";

type Hsl = [number, number, number];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function hsl(hex: string): Hsl {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function fromHsl([h, s, l]: Hsl): string {
  s = clamp(s); l = clamp(l);
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function lum(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** يغيّر الإضاءة (بنفس الدرجة) لين يكون مقروء فوق الخلفية. */
function readable(c: string, bg: string, min: number): string {
  if (contrast(c, bg) >= min) return c;
  const [h, s, l0] = hsl(c);
  const up = lum(bg) < 0.3;
  for (let i = 1; i <= 20; i++) {
    const out = fromHsl([h, s, up ? l0 + (1 - l0) * (i / 20) : l0 * (1 - i / 20)]);
    if (contrast(out, bg) >= min) return out;
  }
  return up ? "#FFFFFF" : "#111111";
}

export function isHex(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v);
}

/** هل اللونين متقاربين (نفس اللون تقريباً)؟ */
export function near(a: string, b: string): boolean {
  const [p, q] = [toRgb(a), toRgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 48;
}

/** نغمات التصميم، كلها من لون الهوية. الأولى = «هويتك» (الافتراضية). */
export function brandTones<K extends TemplateKey>(t: K, b: Brand): Tone<K>[] {
  const P = isHex(b.primary) ? b.primary : FALLBACK_BRAND;
  const [h, s0, l0] = hsl(P);
  const gray = s0 < 0.12;
  const s = gray ? 0 : s0;
  // درجات من نفس اللون
  const deep = fromHsl([h, Math.min(s, 0.6), 0.11]);
  const dark = fromHsl([h, Math.min(s, 0.62), 0.2]);
  const soft = fromHsl([h, Math.min(s, 0.42), 0.86]);
  const paper = fromHsl([h, Math.min(s, 0.3), 0.955]);
  const paper2 = fromHsl([h, Math.min(s, 0.2), 0.975]);
  const cream = fromHsl([h, Math.min(s, 0.5), 0.97]);
  const night = fromHsl([h, Math.min(s, 0.22), 0.07]);
  const night2 = fromHsl([h, Math.min(s, 0.18), 0.13]);
  // اللون الثاني (لو موجود) يصير لمسة؛ وإلا نسخة أفتح من الأساسي
  const S = isHex(b.second) && !near(b.second, P) ? b.second : "";
  const brightP = gray ? "#F2F2F2" : fromHsl([h, Math.max(s, 0.55), clamp(Math.max(l0, 0.62), 0.6, 0.72)]);
  const onDark = (bg: string) => readable(S || brightP, bg, 3.2);
  const onLight = (bg: string) => readable(S && lum(S) < 0.35 ? S : P, bg, 3.4);
  // لوحة «هويتك»: اللون نفسه لو يصلح خلفية، وإلا نسخة أغمق منه
  const panel = l0 > 0.12 && l0 < 0.55 ? P : fromHsl([h, s, l0 >= 0.55 ? 0.3 : 0.16]);
  const panelInk = lum(panel) > 0.4 ? deep : cream;

  const tones: Record<TemplateKey, Tone[]> = {
    velvet: [
      { name: "هويتك", v: { tint: deep, bgColor: dark, ink: cream, accent: onDark(deep) } },
      { name: "ليلي", v: { tint: night, bgColor: night2, ink: "#F3EFE6", accent: onDark(night) } },
      { name: "أوف وايت", light: true, v: { tint: paper, bgColor: soft, ink: deep, accent: onLight(paper) } },
      { name: "أبيض", light: true, v: { tint: "#FFFFFF", bgColor: "#F3F2EF", ink: "#1A1A1A", accent: onLight("#FFFFFF") } },
    ],
    cover: [
      { name: "هويتك", v: { panel, ink: panelInk, accent: lum(panel) > 0.4 ? onLight(panel) : onDark(panel), ring: panelInk } },
      { name: "داكن", v: { panel: deep, ink: cream, accent: onDark(deep), ring: onDark(deep) } },
      { name: "أوف وايت", light: true, v: { panel: paper, ink: deep, accent: onLight(paper), ring: "#FFFFFF" } },
      { name: "أبيض", light: true, v: { panel: "#FFFFFF", ink: "#141414", accent: onLight("#FFFFFF"), ring: onLight("#FFFFFF") } },
    ],
    bold: [
      { name: "هويتك", v: { hero: soft, heroInk: deep, panel: dark, ink: "#FFFFFF", accent: onDark(dark), tile: "#FFFFFF", tileInk: "#141414" } },
      { name: "داكن", v: { hero: fromHsl([h, Math.min(s, 0.12), 0.92]), heroInk: "#111111", panel: night, ink: "#FFFFFF", accent: onDark(night), tile: night2, tileInk: "#FFFFFF" } },
      { name: "أوف وايت", light: true, v: { hero: soft, heroInk: deep, panel: paper2, ink: deep, accent: onLight(paper2), tile: "#FFFFFF", tileInk: deep } },
      { name: "أبيض", light: true, v: { hero: "#FFFFFF", heroInk: "#141414", panel: "#F5F4F1", ink: "#141414", accent: onLight("#F5F4F1"), tile: "#FFFFFF", tileInk: "#141414" } },
    ],
  };
  return tones[t] as Tone<K>[];
}

/**
 * ألوان الشعار: مدرّج بكسلات مصغّر، يتجاهل الأبيض والأسود والرمادي،
 * ويرجع الأكثر حضوراً أول. (المتصفح فقط.)
 */
export function logoColors(src: string): Promise<string[]> {
  return new Promise((resolve) => {
    if (!src || typeof Image === "undefined") return resolve([]);
    const img = new Image();
    if (!/^(blob|data):/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const n = 56;
        const c = document.createElement("canvas");
        c.width = n; c.height = n;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, n, n);
        const d = g.getImageData(0, 0, n, n).data;
        const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 140) continue;
          const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
          const [, sat, l] = hsl(toHex(r, gg, b));
          if (l > 0.92 || l < 0.07 || sat < 0.18) continue;
          const k = [r, gg, b].map((v) => Math.round(v / 28)).join(",");
          const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++; e.r += r; e.g += gg; e.b += b;
          bins.set(k, e);
        }
        const out: string[] = [];
        [...bins.values()].sort((a, b) => b.n - a.n).forEach((e) => {
          const hex = toHex(e.r / e.n, e.g / e.n, e.b / e.n);
          if (e.n >= 6 && !out.some((o) => near(o, hex))) out.push(hex);
        });
        resolve(out.slice(0, 5));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}
