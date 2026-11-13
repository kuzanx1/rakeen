/**
 * «باركودك» -- يرسم ستاند/لوحة/بوستر/ملصق الباركود على canvas بهوية المطعم.
 * نفس الدالة للمعاينة وللتنزيل وللطباعة، فاللي يشوفه المالك هو اللي ينطبع.
 */
import QRCode from "qrcode";

export type QrFormat = "stand" | "counter" | "poster" | "sticker";
export type QrStyle = "brand" | "light" | "dark";

/** المقاس بالبكسل على ٣٠٠ نقطة/إنش، وكيف ينرصّ على ورقة A4 للطباعة. */
export const FORMATS: Record<QrFormat, {
  name: string; hint: string; w: number; h: number;
  sheet: { landscape: boolean; cols: number; rows: number; mmW: number; mmH: number };
}> = {
  stand: { name: "ستاند طاولة", hint: "A6 · ٤ في ورقة A4", w: 1240, h: 1748, sheet: { landscape: false, cols: 2, rows: 2, mmW: 105, mmH: 148 } },
  counter: { name: "لوحة الكاشير", hint: "A5 · ٢ في ورقة A4", w: 1748, h: 2480, sheet: { landscape: true, cols: 2, rows: 1, mmW: 148, mmH: 210 } },
  poster: { name: "بوستر الواجهة", hint: "A4 كاملة", w: 2480, h: 3508, sheet: { landscape: false, cols: 1, rows: 1, mmW: 210, mmH: 297 } },
  sticker: { name: "ملصق مربّع", hint: "٩ سم · ٤ في ورقة A4", w: 1063, h: 1063, sheet: { landscape: false, cols: 2, rows: 2, mmW: 90, mmH: 90 } },
};

export type PosterOpts = {
  url: string;
  format: QrFormat;
  style: QrStyle;
  color: string;
  name: string;
  headline: string;
  sub: string;
  table: string; // "" = بدون رقم طاولة
  showUrl: boolean;
};

export const FONT = "'Thmanyah Sans', 'Tajawal', sans-serif";

/* ───────── ألوان ───────── */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** ألوان التصميم من لون الهوية والنمط. */
export function palette(style: QrStyle, color: string) {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#7A1426";
  if (style === "brand") {
    const ink = contrast(c, "#FFFFFF") >= contrast(c, "#141414") ? "#FFFFFF" : "#141414";
    return { bg: c, ink, accent: ink, card: "#FFFFFF", dots: contrast(c, "#FFFFFF") >= 4.5 ? c : "#141414" };
  }
  if (style === "dark") {
    const accent = contrast(c, "#141414") >= 3 ? c : "#FFFFFF";
    return { bg: "#141414", ink: "#FFFFFF", accent, card: "#FFFFFF", dots: "#141414" };
  }
  const accent = contrast(c, "#FBF8F3") >= 3 ? c : "#141414";
  return { bg: "#FBF8F3", ink: "#141414", accent, card: "#FFFFFF", dots: contrast(c, "#FFFFFF") >= 4.5 ? c : "#141414" };
}

/* ───────── رسم ───────── */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** يصغّر الخط لين يدخل النص في العرض المتاح. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight: number, color: string) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 8 && ctx.measureText(text).width > maxW) {
    s -= Math.max(1, s * 0.04);
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  return s;
}

/** مصفوفة الباركود (H: يتحمّل الشعار في النص). */
export function qrModules(url: string) {
  const q = QRCode.create(url || "https://rakeenapp.com", { errorCorrectionLevel: "H" });
  const n = q.modules.size;
  const get = (r: number, c: number) => !!q.modules.data[r * n + c];
  return { n, get };
}

function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number, dots: string, logo: HTMLImageElement | null) {
  const { n, get } = qrModules(url);
  const m = size / n;
  const inFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // مساحة الشعار في الوسط: نفرّغ الوحدات تحته (مستوى H يتحمّل ~٣٠٪).
  const hole = logo ? Math.ceil(n * 0.24) | 1 : 0;
  const h0 = Math.floor((n - hole) / 2);
  const inHole = (r: number, c: number) => hole > 0 && r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole;
  ctx.fillStyle = dots;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!get(r, c) || inFinder(r, c) || inHole(r, c)) continue;
      rr(ctx, x + c * m - 0.25, y + r * m - 0.25, m + 0.5, m + 0.5, m * 0.18);
      ctx.fill();
    }
  }
  // عيون الباركود بزوايا ناعمة.
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = x + fc * m, fy = y + fr * m;
    ctx.fillStyle = dots;
    rr(ctx, fx, fy, 7 * m, 7 * m, 2 * m); ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    rr(ctx, fx + m, fy + m, 5 * m, 5 * m, 1.4 * m); ctx.fill();
    ctx.fillStyle = dots;
    rr(ctx, fx + 2 * m, fy + 2 * m, 3 * m, 3 * m, m); ctx.fill();
  }
  if (logo) {
    const s = hole * m, lx = x + h0 * m, ly = y + h0 * m;
    ctx.fillStyle = "#FFFFFF";
    rr(ctx, lx, ly, s, s, s * 0.22); ctx.fill();
    const pad = s * 0.1, inner = s - pad * 2;
    ctx.save();
    rr(ctx, lx + pad, ly + pad, inner, inner, inner * 0.18); ctx.clip();
    const k = Math.max(inner / logo.width, inner / logo.height);
    const w = logo.width * k, h = logo.height * k;
    ctx.drawImage(logo, lx + pad + (inner - w) / 2, ly + pad + (inner - h) / 2, w, h);
    ctx.restore();
  }
}

function drawLogoBadge(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, cx: number, cy: number, d: number, ring: string) {
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
  const inner = d * 0.9;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, inner / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(cx - inner / 2, cy - inner / 2, inner, inner);
  const k = Math.max(inner / logo.width, inner / logo.height);
  const w = logo.width * k, h = logo.height * k;
  ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

/** يرسم التصميم كامل على canvas بمقاس الطباعة. */
export function drawPoster(canvas: HTMLCanvasElement, o: PosterOpts, logo: HTMLImageElement | null) {
  const f = FORMATS[o.format];
  canvas.width = f.w;
  canvas.height = f.h;
  const ctx = canvas.getContext("2d")!;
  const W = f.w, H = f.h, u = W / 100;
  const p = palette(o.style, o.color);
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);
  // دائرتان خفيفتان تعطي عمق بدون ما تزحم.
  ctx.fillStyle = alpha(p.ink, 0.05);
  ctx.beginPath(); ctx.arc(W * 0.92, H * 0.06, W * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.04, H * 0.97, W * 0.3, 0, Math.PI * 2); ctx.fill();
  // إطار داخلي رفيع (يبان خط القص لو انقص بدون دقّة).
  const inset = (o.format === "sticker" ? 3 : 4) * u;
  ctx.strokeStyle = alpha(p.ink, 0.28);
  ctx.lineWidth = 0.3 * u;
  rr(ctx, inset, inset, W - inset * 2, H - inset * 2, 4 * u); ctx.stroke();

  const cx = W / 2;
  const textW = W - inset * 2 - 8 * u;

  if (o.format === "sticker") {
    fitText(ctx, o.headline || "امسح الباركود", cx, 11.5 * u, textW, 7.5 * u, 700, p.ink);
    const size = 58 * u, top = 22 * u;
    ctx.fillStyle = p.card;
    rr(ctx, cx - size / 2 - 3 * u, top - 3 * u, size + 6 * u, size + 6 * u, 4 * u); ctx.fill();
    drawQr(ctx, o.url, cx - size / 2, top, size, p.dots, logo);
    const tail = o.table ? `${o.name} · طاولة ${o.table}` : o.name;
    fitText(ctx, tail, cx, 90.5 * u, textW, 5.6 * u, 700, p.ink);
    return;
  }

  // ستاند / كاشير / بوستر (نسبة A الطولية ≈ 141u)
  let y = 9 * u;
  if (logo) {
    drawLogoBadge(ctx, logo, cx, y + 10 * u, 20 * u, p.card);
    y += 24.5 * u;
  } else y += 4 * u;
  fitText(ctx, o.name, cx, y + 3.5 * u, textW, (logo ? 6 : 8) * u, 700, alpha(p.ink, 0.92));
  y += 13 * u;
  fitText(ctx, o.headline || "امسح الباركود", cx, y + 6 * u, textW, 12 * u, 700, p.accent);
  y += 14.5 * u;
  if (o.sub) {
    fitText(ctx, o.sub, cx, y + 2.5 * u, textW, 4.6 * u, 500, alpha(p.ink, 0.78));
    y += 8 * u;
  } else y += 3 * u;

  // رقم الطاولة داخل البطاقة البيضاء تحت الباركود: ما يصغّر الباركود.
  const tableH = o.table ? 9 * u : 0;
  const bottomRoom = (o.showUrl ? 7 : 0) + 6.5;
  const pad = 3.4 * u;
  const size = Math.min(58 * u, H - y - bottomRoom * u - pad * 2 - tableH);
  ctx.fillStyle = p.card;
  rr(ctx, cx - size / 2 - pad, y, size + pad * 2, size + pad * 2 + tableH, 4.5 * u); ctx.fill();
  drawQr(ctx, o.url, cx - size / 2, y + pad, size, p.dots, logo);
  if (o.table) {
    const ty = y + pad + size + 1.2 * u;
    ctx.fillStyle = alpha(p.dots, 0.14);
    ctx.fillRect(cx - size / 2, ty, size, 0.25 * u);
    ctx.font = `700 ${5.4 * u}px ${FONT}`;
    ctx.fillStyle = p.dots;
    ctx.fillText(`طاولة ${o.table}`, cx, ty + 4.6 * u);
  }
  y += size + pad * 2 + tableH + 4.5 * u;

  if (o.showUrl) {
    ctx.direction = "ltr";
    fitText(ctx, o.url.replace(/^https?:\/\//, "").replace(/\/$/, ""), cx, Math.min(y + 2 * u, H - inset - 4 * u), textW, 3.4 * u, 500, alpha(p.ink, 0.66));
    ctx.direction = "rtl";
  }
}

/** يحمّل الشعار بإذن CORS (عشان canvas يقدر يتصدّر). */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    if (!/^(blob|data):/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** ينتظر خط ثمانية بالحروف العربية نفسها (بدونها يحمّل نطاق لاتيني بس). */
export async function loadFonts() {
  if (!document.fonts) return;
  const t = "امسح واطلب طاولة مطعم";
  await Promise.all([500, 700].map((w) => document.fonts.load(`${w} 40px 'Thmanyah Sans'`, t).catch(() => null)));
}
