// «روابطك» -- صفحة روابط المطعم. نموذج واحد يقرؤه ثلاثة: الصفحة العامة
// (app/l/[slug])، ومعاينة لوحة التحكم، ومحرّرها. والإعدادات كلها في
// businesses.link_page (jsonb) -- migration 20261112120000.

import { ICON_KEYS, type IconKey } from "./icon-keys";

export type LinkType =
  | "whatsapp" | "phone" | "email" | "order" | "booking" | "location"
  | "instagram" | "tiktok" | "snapchat" | "x" | "facebook" | "youtube"
  | "website" | "delivery" | "review" | "menu" | "custom" | "heading";

export type LinkItem = {
  id: string;
  type: LinkType;
  label: string;
  value: string;
  on: boolean;
  /** مميّز: يبرز عن غيره. */
  star?: boolean;
  /** سطر صغير تحت الاسم («جريء»). */
  note?: string;
  /** أيقونة من المكتبة بدل أيقونة النوع. */
  icon?: IconKey | "";
};

export type Stat = { value: string; label: string };

export type TemplateKey = "velvet" | "cover" | "bold";
export type Corner = "sharp" | "soft" | "pill";
export type FontKey = "ruqaa" | "amiri" | "messiri" | "kufi" | "alexandria" | "lalezar" | "naskh" | "tajawal";

export type VelvetOpts = {
  bg: string; bgColor: string; overlay: number; tint: string; blur: number;
  font: FontKey; avatar: "oval" | "circle" | "none"; btn: "outline" | "glass" | "solid";
  corner: Corner; ink: string; accent: string; socialsAt: "top" | "bottom"; grain: boolean;
};
export type CoverOpts = {
  cover: string; coverH: "s" | "m" | "l"; fade: boolean; panel: string; ink: string;
  accent: string; ring: string; avatar: "circle" | "rounded" | "square";
  btn: "outline" | "solid" | "soft"; corner: Corner; font: FontKey; rule: boolean;
};
export type BoldOpts = {
  hero: string; heroInk: string; panel: string; ink: string; accent: string; tile: string;
  tileInk: string; font: FontKey; photo: string; showStats: boolean; rows: "list" | "grid";
};
export type LinkPageConfig = {
  v: 1;
  enabled: boolean;
  template: TemplateKey;
  name: string;
  bio: string;
  avatar: string;
  badge: string;
  links: LinkItem[];
  socials: LinkItem[];
  stats: Stat[];
  cta: { on: boolean; label: string; type: LinkType; value: string };
  /** أيقونة جنب نص كل زر (في التصاميم اللي الأيقونة فيها اختيارية). */
  icons: boolean;
  /** زر مشاركة الصفحة أعلى الشاشة. */
  share: boolean;
  /** شريط إعلان أعلى الصفحة: عرض، افتتاح فرع، ساعات رمضان. link: "order" أو رابط. */
  announce: { on: boolean; text: string; link: string };
  opts: { velvet: VelvetOpts; cover: CoverOpts; bold: BoldOpts };
  /** ألوان الهوية (من الشعار ولون المتجر) ونغمة كل تصميم -- المحرّر يولّد منها الألوان. tone -1 = ألوان يدوية. */
  brand: { primary: string; second: string; tone: Record<TemplateKey, number> };
};

/** ما يعرفه الخادم عن المطعم (get_link_page). */
export type LinkBiz = { name: string; logo: string | null; slug: string; store: boolean; booking: boolean };

export const FONTS: Record<FontKey, { label: string; family: string; google: string }> = {
  ruqaa: { label: "رقعة", family: "'Aref Ruqaa', serif", google: "Aref+Ruqaa:wght@400;700" },
  amiri: { label: "نسخ", family: "'Amiri', serif", google: "Amiri:ital,wght@0,400;0,700;1,400" },
  naskh: { label: "نسخ ناعم", family: "'Noto Naskh Arabic', serif", google: "Noto+Naskh+Arabic:wght@500;700" },
  messiri: { label: "مسيري", family: "'El Messiri', serif", google: "El+Messiri:wght@500;700" },
  kufi: { label: "كوفي", family: "'Reem Kufi', sans-serif", google: "Reem+Kufi:wght@500;700" },
  alexandria: { label: "عصري", family: "'Alexandria', sans-serif", google: "Alexandria:wght@400;600;800;900" },
  tajawal: { label: "نظيف", family: "'Tajawal', sans-serif", google: "Tajawal:wght@500;700;800" },
  lalezar: { label: "عريض", family: "'Lalezar', sans-serif", google: "Lalezar" },
};

/** رابط خطوط قوقل لما تحتاجه الصفحة فقط (+ Alexandria للنصوص دائماً). */
export function fontsHref(keys: FontKey[]): string {
  const set = new Set<FontKey>(["alexandria", ...keys]);
  return "https://fonts.googleapis.com/css2?" + [...set].map((k) => "family=" + FONTS[k].google).join("&") + "&display=swap";
}

export const TEMPLATES: { key: TemplateKey; name: string; hint: string; tone: "dark" | "light" | "color" }[] = [
  { key: "velvet", name: "مخملي", hint: "صورة تملأ الصفحة، وخط فاخر، وأزرار بإطار رفيع", tone: "dark" },
  { key: "cover", name: "غلاف", hint: "صورة غلاف فوق، وشعارك في دائرة، ولون هويتك تحت", tone: "color" },
  { key: "bold", name: "جريء", hint: "اسمك بخط كبير، وأرقامك في بطاقات، وزر طلب عائم", tone: "color" },
];
export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);

/** كل نوع رابط: اسمه في المحرّر، وما يُطلب من صاحب المطعم، ونصّ الزر الافتراضي. */
export const LINK_TYPES: Record<LinkType, { name: string; ask: string; placeholder: string; label: string; social?: boolean; auto?: boolean }> = {
  order: { name: "المتجر الإلكتروني", ask: "", placeholder: "", label: "اطلب أونلاين", auto: true },
  menu: { name: "المنيو", ask: "رابط المنيو", placeholder: "https://... (فاضي = منيو متجرك في ركين)", label: "المنيو" },
  booking: { name: "صفحة الحجز", ask: "", placeholder: "", label: "احجز موعدك", auto: true },
  whatsapp: { name: "واتساب", ask: "رقم الجوال", placeholder: "05xxxxxxxx", label: "راسلنا واتساب", social: true },
  phone: { name: "اتصال", ask: "رقم الجوال", placeholder: "05xxxxxxxx", label: "اتصل بنا", social: true },
  location: { name: "الموقع", ask: "رابط قوقل ماب", placeholder: "https://maps.app.goo.gl/...", label: "موقعنا", social: true },
  instagram: { name: "إنستقرام", ask: "اسم الحساب أو الرابط", placeholder: "@username", label: "إنستقرام", social: true },
  tiktok: { name: "تيك توك", ask: "اسم الحساب أو الرابط", placeholder: "@username", label: "تيك توك", social: true },
  snapchat: { name: "سناب شات", ask: "اسم الحساب أو الرابط", placeholder: "username", label: "سناب شات", social: true },
  x: { name: "إكس", ask: "اسم الحساب أو الرابط", placeholder: "@username", label: "إكس", social: true },
  facebook: { name: "فيسبوك", ask: "رابط الصفحة", placeholder: "https://facebook.com/...", label: "فيسبوك", social: true },
  youtube: { name: "يوتيوب", ask: "رابط القناة", placeholder: "https://youtube.com/@...", label: "يوتيوب", social: true },
  email: { name: "إيميل", ask: "الإيميل", placeholder: "hello@example.com", label: "راسلنا بالإيميل", social: true },
  delivery: { name: "تطبيق توصيل", ask: "رابط المطعم في التطبيق", placeholder: "https://...", label: "اطلب من هنقرستيشن" },
  review: { name: "تقييم قوقل", ask: "رابط التقييم", placeholder: "https://g.page/r/...", label: "قيّمنا في قوقل" },
  website: { name: "موقع إلكتروني", ask: "الرابط", placeholder: "https://...", label: "موقعنا الإلكتروني", social: true },
  custom: { name: "رابط آخر", ask: "الرابط", placeholder: "https://...", label: "رابط" },
  heading: { name: "عنوان قسم", ask: "", placeholder: "", label: "تواصل معنا" },
};

const DEFAULT_VELVET: VelvetOpts = {
  bg: "", bgColor: "#3A0A10", overlay: 45, tint: "#1A0306", blur: 0, font: "ruqaa", avatar: "oval",
  btn: "outline", corner: "sharp", ink: "#FFF8F0", accent: "#FFF8F0", socialsAt: "bottom", grain: true,
};
const DEFAULT_COVER: CoverOpts = {
  cover: "", coverH: "m", fade: false, panel: "#6E0414", ink: "#FFF6EE", accent: "#FFF6EE", ring: "#FFFFFF",
  avatar: "circle", btn: "outline", corner: "sharp", font: "amiri", rule: true,
};
const DEFAULT_BOLD: BoldOpts = {
  hero: "#C9D9B4", heroInk: "#1F3A17", panel: "#26401E", ink: "#FFFFFF", accent: "#F2F05A", tile: "#FFFFFF",
  tileInk: "#141414", font: "lalezar", photo: "", showStats: true, rows: "list",
};
export function newId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function defaultConfig(name = ""): LinkPageConfig {
  return {
    v: 1, enabled: false, template: "velvet", name, bio: "", avatar: "", badge: "",
    links: [
      { id: newId(), type: "order", label: "اطلب أونلاين", value: "", on: true, star: true },
      { id: newId(), type: "menu", label: "المنيو", value: "", on: true },
      { id: newId(), type: "whatsapp", label: "راسلنا واتساب", value: "", on: true },
      { id: newId(), type: "location", label: "موقعنا", value: "", on: true },
    ],
    socials: [],
    stats: [{ value: "4.9", label: "تقييم" }, { value: "+12", label: "سنة خبرة" }, { value: "3", label: "فروع" }],
    cta: { on: true, label: "اطلب الآن", type: "order", value: "" },
    icons: true,
    share: true,
    announce: { on: false, text: "", link: "" },
    opts: {
      velvet: { ...DEFAULT_VELVET }, cover: { ...DEFAULT_COVER }, bold: { ...DEFAULT_BOLD },
    },
    brand: { primary: "", second: "", tone: { velvet: 0, cover: 0, bold: 0 } },
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
const img = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v.slice(0, 500) : "");
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const FONT_KEYS = Object.keys(FONTS) as FontKey[];
const TYPE_KEYS = Object.keys(LINK_TYPES) as LinkType[];
const CORNERS = ["sharp", "soft", "pill"] as const;

function cleanItem(raw: unknown): LinkItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = pick(r.type, TYPE_KEYS, "custom");
  const icon = typeof r.icon === "string" && (ICON_KEYS as readonly string[]).includes(r.icon) ? (r.icon as IconKey) : "";
  return {
    id: str(r.id, 20).replace(/[^A-Za-z0-9_-]/g, "") || newId(),
    type, label: str(r.label, 60), value: str(r.value, 400), on: r.on !== false, star: r.star === true, note: str(r.note, 60), icon,
  };
}

const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** ما يُخزَّن قد يكون من نسخة أقدم أو ناقصاً أو معبوثاً به: يُقرأ دائماً من هنا. */
export function normalizeConfig(raw: unknown, fallbackName = ""): LinkPageConfig {
  const d = defaultConfig(fallbackName);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const o = rec(r.opts);
  const v = rec(o.velvet), c = rec(o.cover), b = rec(o.bold), br = rec(r.brand), bt = rec(br.tone);
  const cta = rec(r.cta), an = rec(r.announce);
  return {
    v: 1,
    enabled: r.enabled === true,
    template: pick(r.template, TEMPLATE_KEYS, "velvet"),
    name: str(r.name, 60) || fallbackName,
    bio: str(r.bio, 140),
    avatar: img(r.avatar),
    badge: str(r.badge, 24),
    links: Array.isArray(r.links) ? (r.links.map(cleanItem).filter(Boolean) as LinkItem[]).slice(0, 24) : d.links,
    socials: Array.isArray(r.socials) ? (r.socials.map(cleanItem).filter(Boolean) as LinkItem[]).filter((s) => s.type !== "heading").slice(0, 10) : [],
    stats: Array.isArray(r.stats)
      ? r.stats.slice(0, 3).map((s) => ({ value: str((s as Stat)?.value, 8), label: str((s as Stat)?.label, 16) }))
      : d.stats,
    cta: { on: cta.on !== false, label: str(cta.label, 24) || d.cta.label, type: pick(cta.type, TYPE_KEYS.filter((t) => t !== "heading"), "order"), value: str(cta.value, 400) },
    icons: bool(r.icons, true),
    share: bool(r.share, true),
    announce: { on: an.on === true, text: str(an.text, 80), link: str(an.link, 400) },
    opts: {
      velvet: {
        bg: img(v.bg), bgColor: color(v.bgColor, DEFAULT_VELVET.bgColor), overlay: num(v.overlay, 0, 90, DEFAULT_VELVET.overlay),
        tint: color(v.tint, DEFAULT_VELVET.tint), blur: num(v.blur, 0, 12, 0), font: pick(v.font, FONT_KEYS, DEFAULT_VELVET.font),
        avatar: pick(v.avatar, ["oval", "circle", "none"] as const, "oval"), btn: pick(v.btn, ["outline", "glass", "solid"] as const, "outline"),
        corner: pick(v.corner, CORNERS, "sharp"), ink: color(v.ink, DEFAULT_VELVET.ink),
        accent: color(v.accent, DEFAULT_VELVET.accent), socialsAt: pick(v.socialsAt, ["top", "bottom"] as const, "bottom"),
        grain: bool(v.grain, true),
      },
      cover: {
        cover: img(c.cover), coverH: pick(c.coverH, ["s", "m", "l"] as const, "m"), fade: c.fade === true,
        panel: color(c.panel, DEFAULT_COVER.panel), ink: color(c.ink, DEFAULT_COVER.ink), accent: color(c.accent, DEFAULT_COVER.accent),
        ring: color(c.ring, DEFAULT_COVER.ring), avatar: pick(c.avatar, ["circle", "rounded", "square"] as const, "circle"),
        btn: pick(c.btn, ["outline", "solid", "soft"] as const, "outline"), corner: pick(c.corner, CORNERS, "sharp"),
        font: pick(c.font, FONT_KEYS, DEFAULT_COVER.font), rule: c.rule !== false,
      },
      bold: {
        hero: color(b.hero, DEFAULT_BOLD.hero), heroInk: color(b.heroInk, DEFAULT_BOLD.heroInk), panel: color(b.panel, DEFAULT_BOLD.panel),
        ink: color(b.ink, DEFAULT_BOLD.ink), accent: color(b.accent, DEFAULT_BOLD.accent), tile: color(b.tile, DEFAULT_BOLD.tile),
        tileInk: color(b.tileInk, DEFAULT_BOLD.tileInk), font: pick(b.font, FONT_KEYS, DEFAULT_BOLD.font), photo: img(b.photo),
        showStats: b.showStats !== false, rows: pick(b.rows, ["list", "grid"] as const, "list"),
      },
    },
    brand: {
      primary: color(br.primary, ""), second: color(br.second, ""),
      tone: { velvet: num(bt.velvet, -1, 9, 0), cover: num(bt.cover, -1, 9, 0), bold: num(bt.bold, -1, 9, 0) },
    },
  };
}

function handle(v: string): string {
  return v.trim().replace(/^@/, "").replace(/[^A-Za-z0-9._-]/g, "");
}
function saPhone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05")) d = "966" + d.slice(1);
  else if (d.startsWith("5") && d.length === 9) d = "966" + d;
  return d;
}
function web(v: string): string {
  const t = v.trim();
  if (!t) return "";
  const u = /^https?:\/\//i.test(t) ? t : "https://" + t;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : "";
  } catch {
    return "";
  }
}
function social(v: string, base: string): string {
  const t = v.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t) || /\.[a-z]{2,}\//i.test(t)) return web(t);
  const h = handle(t);
  return h ? base + h : "";
}

function storeUrl(biz: Pick<LinkBiz, "slug" | "store">): string {
  return biz.store && biz.slug ? `https://${biz.slug}.rakeenapp.com/` : "";
}

/** رابط الزر الفعلي، أو "" لو ما يكتمل (فالزر لا يظهر في الصفحة). */
export function resolveHref(item: Pick<LinkItem, "type" | "value">, biz: Pick<LinkBiz, "slug" | "store" | "booking">): string {
  const v = item.value || "";
  switch (item.type) {
    case "heading": return "";
    case "order": return storeUrl(biz);
    // رابط منيو خارجي (PDF، موقع)، وإلا منيو متجره في ركين.
    case "menu": return v.trim() ? web(v) : storeUrl(biz);
    case "booking": return biz.booking && biz.slug ? `https://rakeenapp.com/book/${biz.slug}` : "";
    case "whatsapp": { const n = saPhone(v); return n.length >= 8 ? `https://wa.me/${n}` : ""; }
    case "phone": { const n = v.replace(/[^\d+]/g, ""); return n.length >= 6 ? `tel:${n}` : ""; }
    case "email": return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(v.trim()) ? `mailto:${v.trim()}` : "";
    case "instagram": return social(v, "https://instagram.com/");
    case "tiktok": return social(v, "https://www.tiktok.com/@");
    case "snapchat": return social(v, "https://snapchat.com/add/");
    case "x": return social(v, "https://x.com/");
    case "facebook": return social(v, "https://facebook.com/");
    case "youtube": return social(v, "https://youtube.com/@");
    default: return web(v);
  }
}

/** رابط شريط الإعلان: "order" = المتجر، أو أي رابط. */
export function announceHref(link: string, biz: Pick<LinkBiz, "slug" | "store">): string {
  if (link === "order") return storeUrl(biz);
  return web(link);
}

/** نص صغير يوضّح الرابط (سطر تحت الاسم لما ما فيه ملاحظة). */
export function shortHref(href: string): string {
  if (href.startsWith("tel:")) return href.slice(4);
  if (href.startsWith("mailto:")) return href.slice(7);
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/\/$/, "");
    return (u.hostname.replace(/^www\./, "") + (path.length > 1 && path.length < 24 ? path : "")).slice(0, 34);
  } catch {
    return "";
  }
}

/** الرابط العام للصفحة. */
export function linkPageUrl(slug: string): string {
  return `https://${slug}.rakeenapp.com/links`;
}

/** الخط اللي يحتاجه التصميم المختار (للصفحة العامة). */
export function templateFont(cfg: LinkPageConfig): FontKey {
  return cfg.opts[cfg.template].font;
}

/** لون شريط المتصفح وخلفية ما وراء الصفحة. */
export function themeColor(cfg: LinkPageConfig): string {
  const o = cfg.opts;
  switch (cfg.template) {
    case "cover": return o.cover.panel;
    case "bold": return o.bold.hero;
    default: return o.velvet.tint;
  }
}

/** لون نص مقروء فوق لون. */
export function onColor(hex: string): string {
  if (!HEX.test(hex)) return "#111";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111111" : "#FFFFFF";
}

