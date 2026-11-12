"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  FONTS, LINK_TYPES, TEMPLATES, defaultConfig, fontsHref, linkPageUrl, newId, normalizeConfig, resolveHref,
  type BoldOpts, type CoverOpts, type FontKey, type LinkBiz, type LinkItem, type LinkPageConfig, type LinkType,
  type TemplateKey, type VelvetOpts,
} from "@/lib/links/model";
import LinkPageView from "../l/LinkPageView";
import { Icon } from "../l/icons";
import "../l/links.css";
import "./links-studio.css";

/**
 * «روابطك» في لوحة التحكم -- محرّر صفحة الروابط مع معاينة حيّة بنفس كود
 * الصفحة العامة (LinkPageView). يُرسم داخل #screen-links عبر portal، ويقرأ
 * ويحفظ businesses.link_page بجلسة اللوحة نفسها (window.supabaseClient).
 * القفل بالباقة على زر القائمة نفسه (PLAN_SCREEN_FEATURE.links).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;
const W = () => window as unknown as {
  supabaseClient?: Sb;
  uploadMediaFile?: (f: File | Blob, folder: string, prefix: string) => Promise<string>;
  compressImageFile?: (f: File, max?: number, q?: number) => Promise<File | Blob>;
  showToast?: (m: string) => void;
};
const toast = (m: string) => (W().showToast ? W().showToast!(m) : console.log(m));

type BizRow = {
  id: number; name: string; logo_url: string | null; online_menu_slug: string | null;
  online_ordering_enabled: boolean | null; online_booking_enabled: boolean | null; link_page: unknown;
  online_contact_whatsapp?: string | null; online_social_instagram?: string | null;
  online_social_tiktok?: string | null; online_social_twitter?: string | null;
};

const PALETTES: Record<TemplateKey, { name: string; v: Record<string, string> }[]> = {
  velvet: [
    { name: "عنابي", v: { tint: "#1A0306", bgColor: "#3A0A10", ink: "#FFF8F0", accent: "#FFF8F0" } },
    { name: "ليلي ذهبي", v: { tint: "#05070F", bgColor: "#0E1424", ink: "#F3EFE6", accent: "#D8B46A" } },
    { name: "زيتي", v: { tint: "#0B1407", bgColor: "#1E2B16", ink: "#F4F1E6", accent: "#C9D3A6" } },
    { name: "رملي", v: { tint: "#2A1E12", bgColor: "#7A5C3E", ink: "#FFF7EA", accent: "#F1D9B5" } },
  ],
  cover: [
    { name: "عنابي", v: { panel: "#6E0414", ink: "#FFF6EE", accent: "#FFF6EE", ring: "#FFFFFF" } },
    { name: "كحلي ذهبي", v: { panel: "#0F1E3A", ink: "#F1F4FA", accent: "#E7C77D", ring: "#E7C77D" } },
    { name: "أخضر", v: { panel: "#326927", ink: "#FAF8EB", accent: "#7ADC69", ring: "#FAF8EB" } },
    { name: "عاجي", v: { panel: "#F4EEE3", ink: "#3A2A1E", accent: "#3A2A1E", ring: "#FFFFFF" } },
  ],
  bold: [
    { name: "ليموني", v: { hero: "#C9D9B4", heroInk: "#1F3A17", panel: "#26401E", ink: "#FFFFFF", accent: "#F2F05A", tile: "#FFFFFF", tileInk: "#141414" } },
    { name: "برتقالي", v: { hero: "#FFD9B8", heroInk: "#4A1E05", panel: "#2B1408", ink: "#FFFFFF", accent: "#FF7A2F", tile: "#FFF4EA", tileInk: "#2B1408" } },
    { name: "بنفسجي", v: { hero: "#DCD6FF", heroInk: "#251A5C", panel: "#1C1640", ink: "#FFFFFF", accent: "#B4F25A", tile: "#FFFFFF", tileInk: "#1C1640" } },
    { name: "فحمي", v: { hero: "#EDEDE8", heroInk: "#111111", panel: "#111111", ink: "#FFFFFF", accent: "#C4FF2B", tile: "#1E1E1E", tileInk: "#FFFFFF" } },
  ],
};

/* ───────── عناصر تحكّم صغيرة ───────── */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="ls-field">
      <span className="ls-field-l">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="ls-seg" role="radiogroup">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className={"ls-toggle" + (on ? " on" : "")} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <i /> <span>{label}</span>
    </button>
  );
}
function ColorIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ls-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <span>{label}</span>
      <code>{value}</code>
    </label>
  );
}
function Range({ label, value, min, max, onChange, unit = "" }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <Field label={`${label} — ${value}${unit}`}>
      <input className="ls-range" type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}
function FontPick({ value, onChange }: { value: FontKey; onChange: (v: FontKey) => void }) {
  return (
    <div className="ls-fonts">
      {(Object.keys(FONTS) as FontKey[]).map((k) => (
        <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)} style={{ fontFamily: FONTS[k].family }}>
          <b>مطعمنا</b><small>{FONTS[k].label}</small>
        </button>
      ))}
    </div>
  );
}
function ImagePick({ label, value, onChange, keepAlpha, hint }: { label: string; value: string; onChange: (v: string) => void; keepAlpha?: boolean; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const w = W();
    if (!w.uploadMediaFile) return toast("تعذر رفع الصورة");
    setBusy(true);
    try {
      const file = !keepAlpha && w.compressImageFile ? await w.compressImageFile(f, 1600, 0.84) : f;
      onChange(await w.uploadMediaFile(file, "menu-item-images", "links"));
    } catch (e) {
      toast((e as Error).message || "تعذر رفع الصورة");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="ls-img">
      <span className="ls-field-l">{label}</span>
      <div className="ls-img-row">
        <div className="ls-img-thumb" style={value ? { backgroundImage: `url("${value}")` } : undefined}>{!value && "—"}</div>
        <button type="button" className="ls-btn" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "يرفع..." : value ? "غيّر الصورة" : "ارفع صورة"}</button>
        {value && <button type="button" className="ls-btn ghost" onClick={() => onChange("")}>شيلها</button>}
      </div>
      {hint && <small>{hint}</small>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/* ───────── محرّر قائمة روابط ───────── */
function LinkList({ items, onChange, biz, social, showNote }: {
  items: LinkItem[]; onChange: (v: LinkItem[]) => void; biz: LinkBiz; social?: boolean; showNote?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const types = (Object.keys(LINK_TYPES) as LinkType[]).filter((t) => (social ? LINK_TYPES[t].social : true));
  const set = (i: number, patch: Partial<LinkItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  const add = (t: LinkType) => {
    onChange([...items, { id: newId(), type: t, label: LINK_TYPES[t].label, value: "", on: true }]);
    setAdding(false);
  };
  return (
    <div className="ls-links">
      {items.length === 0 && <p className="ls-empty">{social ? "ما فيه حسابات. أضف إنستقرام وتيك توك وغيرها." : "ما فيه روابط بعد."}</p>}
      {items.map((it, i) => {
        const meta = LINK_TYPES[it.type];
        const href = resolveHref(it, biz);
        const broken = it.on && !href;
        return (
          <div key={it.id} className={"ls-link" + (it.on ? "" : " off") + (broken ? " bad" : "")}>
            <div className="ls-link-head">
              <span className="ls-link-ic"><Icon name={it.type} size={18} /></span>
              <b>{meta.name}</b>
              {!social && (
                <button type="button" className={"ls-star" + (it.star ? " on" : "")} title="مميّز" onClick={() => set(i, { star: !it.star })}>
                  <Icon name="star" size={16} /> {it.star ? "مميّز" : "ميّزه"}
                </button>
              )}
              <span className="ls-sp" />
              <button type="button" className="ls-ic-btn" title="لفوق" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
              <button type="button" className="ls-ic-btn" title="لتحت" onClick={() => move(i, 1)} disabled={i === items.length - 1}>▼</button>
              <button type="button" className={"ls-ic-btn" + (it.on ? "" : " dim")} title={it.on ? "إخفاء" : "إظهار"} onClick={() => set(i, { on: !it.on })}>{it.on ? "👁" : "🚫"}</button>
              <button type="button" className="ls-ic-btn danger" title="حذف" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div className="ls-link-body">
              {!social && <input value={it.label} maxLength={60} placeholder="نص الزر" onChange={(e) => set(i, { label: e.target.value })} />}
              {meta.auto ? (
                <small className={href ? "ls-ok" : "ls-warn"}>
                  {href ? `يفتح: ${href}` : it.type === "order" ? "المتجر الإلكتروني غير مفعّل -- الزر ما يظهر" : "صفحة الحجز غير مفعّلة -- الزر ما يظهر"}
                </small>
              ) : (
                <input dir="ltr" value={it.value} maxLength={400} placeholder={meta.placeholder} aria-label={meta.ask} onChange={(e) => set(i, { value: e.target.value })} />
              )}
              {showNote && !social && <input value={it.note || ""} maxLength={60} placeholder="سطر صغير تحت الاسم (اختياري، يظهر في «جريء»)" onChange={(e) => set(i, { note: e.target.value })} />}
              {broken && !meta.auto && <small className="ls-warn">اكتب {meta.ask} عشان يظهر الزر</small>}
            </div>
          </div>
        );
      })}
      {adding ? (
        <div className="ls-add-grid">
          {types.map((t) => (
            <button key={t} type="button" onClick={() => add(t)}><Icon name={t} size={18} /><span>{LINK_TYPES[t].name}</span></button>
          ))}
          <button type="button" className="ls-add-cancel" onClick={() => setAdding(false)}>إلغاء</button>
        </div>
      ) : (
        <button type="button" className="ls-btn add" onClick={() => setAdding(true)} disabled={items.length >= (social ? 10 : 20)}>
          + {social ? "أضف حساب" : "أضف رابط"}
        </button>
      )}
    </div>
  );
}

/* ───────── خيارات كل تصميم ───────── */
function VelvetPanel({ o, set }: { o: VelvetOpts; set: (p: Partial<VelvetOpts>) => void }) {
  return (
    <>
      <ImagePick label="صورة الخلفية" value={o.bg} onChange={(bg) => set({ bg })} hint="صورة عمودية لمطعمك أو أشهر طبق -- تملأ الصفحة كاملة" />
      <Range label="تعتيم الصورة" value={o.overlay} min={0} max={90} unit="٪" onChange={(overlay) => set({ overlay })} />
      <Range label="ضبابية الصورة" value={o.blur} min={0} max={12} onChange={(blur) => set({ blur })} />
      <div className="ls-colors">
        <ColorIn label="لون التعتيم" value={o.tint} onChange={(tint) => set({ tint })} />
        <ColorIn label="الخلفية بدون صورة" value={o.bgColor} onChange={(bgColor) => set({ bgColor })} />
        <ColorIn label="لون النص" value={o.ink} onChange={(ink) => set({ ink })} />
        <ColorIn label="لون الأزرار" value={o.accent} onChange={(accent) => set({ accent })} />
      </div>
      <Field label="خط الاسم"><FontPick value={o.font} onChange={(font) => set({ font })} /></Field>
      <Field label="الشعار"><Seg value={o.avatar} options={[["oval", "بيضاوي"], ["circle", "دائري"], ["none", "بدون"]]} onChange={(avatar) => set({ avatar })} /></Field>
      <Field label="شكل الأزرار"><Seg value={o.btn} options={[["outline", "إطار"], ["glass", "زجاجي"], ["solid", "معبّأ"]]} onChange={(btn) => set({ btn })} /></Field>
      <Field label="زوايا الأزرار"><Seg value={o.corner} options={[["sharp", "حادّة"], ["soft", "ناعمة"], ["pill", "دائرية"]]} onChange={(corner) => set({ corner })} /></Field>
      <Field label="أيقونات الحسابات"><Seg value={o.socialsAt} options={[["bottom", "تحت الأزرار"], ["top", "فوق الشعار"]]} onChange={(socialsAt) => set({ socialsAt })} /></Field>
    </>
  );
}
function CoverPanel({ o, set }: { o: CoverOpts; set: (p: Partial<CoverOpts>) => void }) {
  return (
    <>
      <ImagePick label="صورة الغلاف" value={o.cover} onChange={(cover) => set({ cover })} hint="صورة عرضية: واجهة المطعم أو الصالة أو طبق" />
      <Field label="ارتفاع الغلاف"><Seg value={o.coverH} options={[["s", "قصير"], ["m", "وسط"], ["l", "طويل"]]} onChange={(coverH) => set({ coverH })} /></Field>
      <Toggle on={o.fade} onChange={(fade) => set({ fade })} label="الغلاف يذوب في اللون تحته" />
      <div className="ls-colors">
        <ColorIn label="لون الصفحة" value={o.panel} onChange={(panel) => set({ panel })} />
        <ColorIn label="لون النص" value={o.ink} onChange={(ink) => set({ ink })} />
        <ColorIn label="لون الأزرار" value={o.accent} onChange={(accent) => set({ accent })} />
        <ColorIn label="إطار الشعار" value={o.ring} onChange={(ring) => set({ ring })} />
      </div>
      <Field label="خط الاسم"><FontPick value={o.font} onChange={(font) => set({ font })} /></Field>
      <Field label="شكل الشعار"><Seg value={o.avatar} options={[["circle", "دائري"], ["rounded", "مربع ناعم"], ["square", "مربع"]]} onChange={(avatar) => set({ avatar })} /></Field>
      <Field label="شكل الأزرار"><Seg value={o.btn} options={[["outline", "إطار"], ["soft", "شفّاف"], ["solid", "معبّأ"]]} onChange={(btn) => set({ btn })} /></Field>
      <Field label="زوايا الأزرار"><Seg value={o.corner} options={[["sharp", "حادّة"], ["soft", "ناعمة"], ["pill", "دائرية"]]} onChange={(corner) => set({ corner })} /></Field>
      <Toggle on={o.rule} onChange={(rule) => set({ rule })} label="خط فاصل تحت الوصف" />
    </>
  );
}
function BoldPanel({ o, set, cfg, setCfg }: { o: BoldOpts; set: (p: Partial<BoldOpts>) => void; cfg: LinkPageConfig; setCfg: (p: Partial<LinkPageConfig>) => void }) {
  return (
    <>
      <ImagePick label="صورة جانبية (مفرّغة)" value={o.photo} onChange={(photo) => set({ photo })} keepAlpha
        hint="صورة PNG بخلفية شفافة: الشيف، أو طبقكم المشهور -- تطلع جنب الاسم" />
      <div className="ls-colors">
        <ColorIn label="لون الأعلى" value={o.hero} onChange={(hero) => set({ hero })} />
        <ColorIn label="نص الأعلى" value={o.heroInk} onChange={(heroInk) => set({ heroInk })} />
        <ColorIn label="لون اللوحة" value={o.panel} onChange={(panel) => set({ panel })} />
        <ColorIn label="نص اللوحة" value={o.ink} onChange={(ink) => set({ ink })} />
        <ColorIn label="اللون البارز" value={o.accent} onChange={(accent) => set({ accent })} />
        <ColorIn label="لون البطاقات" value={o.tile} onChange={(tile) => set({ tile })} />
        <ColorIn label="نص البطاقات" value={o.tileInk} onChange={(tileInk) => set({ tileInk })} />
      </div>
      <Field label="خط الاسم الكبير"><FontPick value={o.font} onChange={(font) => set({ font })} /></Field>
      <Field label="عرض الروابط"><Seg value={o.rows} options={[["list", "قائمة"], ["grid", "مربعات"]]} onChange={(rows) => set({ rows })} /></Field>
      <Field label="شارة صغيرة" hint="مثل: مفتوح الآن، توصيل مجاني، جديدنا"><input value={cfg.badge} maxLength={24} onChange={(e) => setCfg({ badge: e.target.value })} /></Field>
      <Toggle on={o.showStats} onChange={(showStats) => set({ showStats })} label="بطاقات «أرقامنا»" />
      {o.showStats && (
        <div className="ls-stats">
          {[0, 1, 2].map((i) => {
            const s = cfg.stats[i] || { value: "", label: "" };
            const put = (p: Partial<typeof s>) => {
              const n = [0, 1, 2].map((j) => cfg.stats[j] || { value: "", label: "" });
              n[i] = { ...s, ...p };
              setCfg({ stats: n });
            };
            return (
              <div key={i} className="ls-stat">
                <input value={s.value} maxLength={8} placeholder="4.9" onChange={(e) => put({ value: e.target.value })} />
                <input value={s.label} maxLength={16} placeholder="تقييم" onChange={(e) => put({ label: e.target.value })} />
              </div>
            );
          })}
        </div>
      )}
      <Toggle on={cfg.cta.on} onChange={(on) => setCfg({ cta: { ...cfg.cta, on } })} label="زر عائم أسفل الشاشة" />
      {cfg.cta.on && (
        <div className="ls-cta">
          <input value={cfg.cta.label} maxLength={24} placeholder="اطلب الآن" onChange={(e) => setCfg({ cta: { ...cfg.cta, label: e.target.value } })} />
          <select value={cfg.cta.type} onChange={(e) => setCfg({ cta: { ...cfg.cta, type: e.target.value as LinkType } })}>
            {(Object.keys(LINK_TYPES) as LinkType[]).map((t) => <option key={t} value={t}>{LINK_TYPES[t].name}</option>)}
          </select>
          {!LINK_TYPES[cfg.cta.type].auto && (
            <input dir="ltr" value={cfg.cta.value} placeholder={LINK_TYPES[cfg.cta.type].placeholder} onChange={(e) => setCfg({ cta: { ...cfg.cta, value: e.target.value } })} />
          )}
        </div>
      )}
    </>
  );
}

/* ───────── الإحصائيات ───────── */
function Stats({ sb, bizId, cfg }: { sb: Sb; bizId: number; cfg: LinkPageConfig }) {
  const [rows, setRows] = useState<{ day: string; link_id: string; hits: number }[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    sb.from("link_page_hits").select("day, link_id, hits").eq("business_id", bizId).gte("day", since)
      .then(({ data, error }: { data: typeof rows; error: unknown }) => { if (error) setErr(true); else setRows(data || []); });
  }, [sb, bizId]);
  if (err) return <p className="ls-empty">الإحصائيات تشتغل بعد تفعيل الميزة من ركين.</p>;
  if (!rows) return <p className="ls-empty">يحمّل...</p>;
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000 + 3 * 3600000).toISOString().slice(0, 10));
  const views = days.map((d) => rows.filter((r) => r.day === d && r.link_id === "").reduce((a, r) => a + r.hits, 0));
  const totalViews = views.reduce((a, b) => a + b, 0);
  const clicks = new Map<string, number>();
  rows.filter((r) => r.link_id).forEach((r) => clicks.set(r.link_id, (clicks.get(r.link_id) || 0) + r.hits));
  const totalClicks = [...clicks.values()].reduce((a, b) => a + b, 0);
  const all = [...cfg.links, ...cfg.socials];
  const named = [...clicks.entries()].map(([id, n]) => {
    const it = all.find((x) => x.id === id);
    return { id, n, name: id === "cta" ? `الزر العائم: ${cfg.cta.label}` : it ? it.label || LINK_TYPES[it.type].name : "رابط محذوف", type: it?.type };
  }).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...views);
  return (
    <div className="ls-stats-tab">
      <div className="ls-kpis">
        <div><b>{totalViews.toLocaleString("en")}</b><span>زيارة · آخر ٣٠ يوم</span></div>
        <div><b>{totalClicks.toLocaleString("en")}</b><span>ضغطة على الروابط</span></div>
        <div><b>{totalViews ? Math.round((totalClicks / totalViews) * 100) : 0}٪</b><span>نسبة الضغط</span></div>
      </div>
      <div className="ls-bars" aria-label="الزيارات يومياً">
        {views.map((v, i) => <i key={i} title={`${days[i]}: ${v}`} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />)}
      </div>
      <h4>أكثر الروابط ضغطاً</h4>
      {named.length === 0 ? <p className="ls-empty">ما فيه ضغطات بعد. شارك رابط صفحتك في البايو.</p> : (
        <ul className="ls-top">
          {named.map((r) => (
            <li key={r.id}>
              {r.type && <Icon name={r.type} size={16} />}<span>{r.name}</span>
              <i style={{ width: `${(r.n / named[0].n) * 100}%` }} /><b>{r.n}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────── الشاشة ───────── */
export default function LinksStudio() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [sb, setSb] = useState<Sb>(null);
  const [biz, setBiz] = useState<BizRow | null>(null);
  const [cfg, setCfgState] = useState<LinkPageConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error" | "nocol">("idle");
  const [tab, setTab] = useState<"content" | "design" | "stats">("content");
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);

  // الشاشة نفسها من ترميز اللوحة: ننتظرها، ونحمّل أول ما تنفتح.
  useEffect(() => {
    let obs: MutationObserver | null = null;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById("linksStudioRoot");
      const screen = document.getElementById("screen-links");
      if ((!el || !screen) && ++tries < 100) return;
      window.clearInterval(t);
      if (!el || !screen) return;
      setHost(el);
      const sync = () => setActive(screen.classList.contains("active"));
      sync();
      obs = new MutationObserver(sync);
      obs.observe(screen, { attributes: true, attributeFilter: ["class"] });
    }, 300);
    return () => { window.clearInterval(t); obs?.disconnect(); };
  }, []);

  const load = useCallback(async () => {
    const client = W().supabaseClient;
    if (!client) return;
    setSb(client);
    setState("loading");
    const { data: s } = await client.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return setState("error");
    const { data: prof } = await client.from("profiles").select("business_id").eq("id", uid).single();
    if (!prof) return setState("error");
    const cols = "id, name, logo_url, online_menu_slug, online_ordering_enabled, online_booking_enabled, online_contact_whatsapp, online_social_instagram, online_social_tiktok, online_social_twitter";
    let { data, error } = await client.from("businesses").select(cols + ", link_page").eq("id", prof.business_id).single();
    if (error) {
      // العمود ما انضاف بعد (migration 20261112120000)
      const r = await client.from("businesses").select(cols).eq("id", prof.business_id).single();
      if (r.error || !r.data) return setState("error");
      data = { ...r.data, link_page: null };
      setState("nocol");
    } else setState("idle");
    const row = data as BizRow;
    const c = row.link_page ? normalizeConfig(row.link_page, row.name) : starter(row);
    setBiz(row);
    setSlug(row.online_menu_slug || "");
    setCfgState(c);
    setSaved(row.link_page ? JSON.stringify(c) : "");
  }, []);

  useEffect(() => { if (active && !biz && state !== "loading") load(); }, [active, biz, state, load]);

  // الخطوط كلها مرّة وحدة للمعاينة ومنتقي الخط
  useEffect(() => {
    if (!active || document.getElementById("lsFonts")) return;
    const l = document.createElement("link");
    l.id = "lsFonts"; l.rel = "stylesheet"; l.href = fontsHref(Object.keys(FONTS) as FontKey[]);
    document.head.appendChild(l);
  }, [active]);

  const setCfg = useCallback((p: Partial<LinkPageConfig>) => setCfgState((c) => (c ? { ...c, ...p } : c)), []);
  const setOpt = useCallback(<K extends TemplateKey>(k: K, p: Partial<LinkPageConfig["opts"][K]>) =>
    setCfgState((c) => (c ? { ...c, opts: { ...c.opts, [k]: { ...c.opts[k], ...p } } } : c)), []);

  const linkBiz: LinkBiz | null = useMemo(() => biz && {
    name: biz.name, logo: biz.logo_url, slug: slug || biz.online_menu_slug || "",
    store: !!biz.online_ordering_enabled, booking: !!biz.online_booking_enabled,
  }, [biz, slug]);

  const dirty = !!cfg && JSON.stringify(cfg) !== saved;

  const save = async (next?: Partial<LinkPageConfig>) => {
    if (!sb || !biz || !cfg) return;
    const body = { ...cfg, ...next };
    const cleanSlug = slug.trim().toLowerCase();
    if (body.enabled && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(cleanSlug)) {
      toast("اكتب اسم الرابط بالإنجليزي أول (حروف صغيرة وأرقام)");
      return;
    }
    setBusy(true);
    try {
      const upd: Record<string, unknown> = { link_page: body };
      if (cleanSlug && cleanSlug !== biz.online_menu_slug) upd.online_menu_slug = cleanSlug;
      const { data, error } = await sb.from("businesses").update(upd).eq("id", biz.id).select("id").maybeSingle();
      if (error) {
        if (/link_page/.test(error.message || "")) throw new Error("الميزة تحتاج تفعيل من ركين أول (قاعدة البيانات)");
        if (error.code === "23505") throw new Error("اسم الرابط مستخدم لمطعم ثاني، اختر اسم ثاني");
        throw error;
      }
      if (!data) throw new Error("تعذر الحفظ -- يتطلب حساب المالك");
      setCfgState(body);
      setSaved(JSON.stringify(body));
      if (upd.online_menu_slug) setBiz({ ...biz, online_menu_slug: cleanSlug });
      toast(body.enabled ? "✓ انحفظت -- صفحتك منشورة" : "✓ انحفظت");
    } catch (e) {
      toast((e as Error).message || "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const importFromStore = () => {
    if (!biz || !cfg) return;
    const have = new Set(cfg.socials.map((s) => s.type));
    const add: LinkItem[] = [];
    const put = (type: LinkType, value?: string | null) => {
      if (value && !have.has(type)) add.push({ id: newId(), type, label: LINK_TYPES[type].label, value, on: true });
    };
    put("instagram", biz.online_social_instagram);
    put("tiktok", biz.online_social_tiktok);
    put("x", biz.online_social_twitter);
    put("whatsapp", biz.online_contact_whatsapp);
    if (!add.length) return toast("ما لقينا حسابات جديدة في إعدادات متجرك");
    setCfg({ socials: [...cfg.socials, ...add] });
    toast(`انضاف ${add.length} من إعدادات متجرك`);
  };

  if (!host) return null;
  const url = linkBiz?.slug ? linkPageUrl(linkBiz.slug) : "";

  const body = !cfg || !linkBiz ? (
    <div className="ls-loading">{state === "error" ? "تعذر التحميل. حدّث الصفحة." : "يحمّل..."}</div>
  ) : (
    <div className={"ls" + (mobilePreview ? " show-preview" : "")}>
      <div className="ls-head">
        <div className="ls-head-txt">
          <h2>روابطك</h2>
          <p>صفحة وحدة فيها كل روابط مطعمك: الطلب، واتساب، الموقع، حساباتك. حط رابطها في بايو إنستقرام وتيك توك وسناب.</p>
        </div>
        <div className={"ls-live" + (cfg.enabled ? " on" : "")}>
          <Toggle on={cfg.enabled} onChange={(enabled) => save({ enabled })} label={cfg.enabled ? "الصفحة منشورة" : "الصفحة مخفية"} />
          {url && (
            <div className="ls-url">
              <code dir="ltr">{url.replace("https://", "")}</code>
              <button type="button" className="ls-btn" onClick={() => { navigator.clipboard?.writeText(url); toast("✓ نسخت الرابط"); }}>نسخ</button>
              {cfg.enabled && !dirty && <a className="ls-btn" href={url} target="_blank" rel="noopener">افتح</a>}
            </div>
          )}
        </div>
      </div>
      {state === "nocol" && <div className="ls-note">الميزة جاهزة، تحتاج تفعيل بسيط من فريق ركين قبل الحفظ. تقدر تجرّب التصاميم الحين.</div>}

      <div className="ls-grid">
        <div className="ls-side">
          <section className="ls-card">
            <h3>التصميم</h3>
            <div className="ls-tpls">
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" className={"ls-tpl" + (cfg.template === t.key ? " on" : "")} onClick={() => setCfg({ template: t.key })}>
                  <div className="ls-tpl-mini"><div className="lk-frame ls-mini"><LinkPageView cfg={{ ...cfg, template: t.key }} biz={linkBiz} /></div></div>
                  <b>{t.name}</b><small>{t.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <div className="ls-tabs">
            {([["content", "المحتوى"], ["design", "الألوان والخيارات"], ["stats", "الإحصائيات"]] as const).map(([k, l]) => (
              <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === "content" && (
            <>
              <section className="ls-card">
                <h3>الهوية</h3>
                <Field label="الاسم"><input value={cfg.name} maxLength={60} onChange={(e) => setCfg({ name: e.target.value })} /></Field>
                <Field label="وصف قصير" hint="سطر واحد: وش يميزكم؟"><input value={cfg.bio} maxLength={140} placeholder="مشويات على الفحم منذ ٢٠١٢" onChange={(e) => setCfg({ bio: e.target.value })} /></Field>
                <ImagePick label="الشعار" value={cfg.avatar} onChange={(avatar) => setCfg({ avatar })} hint={biz?.logo_url ? "فاضي = شعار مطعمك من الإعدادات" : undefined} />
                <Field label="اسم الرابط بالإنجليزي" hint={`نفس اسم متجرك -- الرابط: ${slug || "name"}.rakeenapp.com/links`}>
                  <input dir="ltr" value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                </Field>
              </section>
              <section className="ls-card">
                <h3>الأزرار</h3>
                <LinkList items={cfg.links} onChange={(links) => setCfg({ links })} biz={linkBiz} showNote={cfg.template === "bold"} />
              </section>
              <section className="ls-card">
                <div className="ls-card-head">
                  <h3>أيقونات الحسابات</h3>
                  <button type="button" className="ls-btn ghost" onClick={importFromStore}>استورد من متجرك</button>
                </div>
                <LinkList items={cfg.socials} onChange={(socials) => setCfg({ socials })} biz={linkBiz} social />
              </section>
            </>
          )}

          {tab === "design" && (
            <section className="ls-card">
              <h3>خيارات «{TEMPLATES.find((t) => t.key === cfg.template)!.name}»</h3>
              <Field label="ألوان جاهزة">
                <div className="ls-pals">
                  {PALETTES[cfg.template].map((p) => (
                    <button key={p.name} type="button" onClick={() => setOpt(cfg.template, p.v as never)}>
                      <span>{Object.values(p.v).slice(0, 4).map((c, i) => <i key={i} style={{ background: c }} />)}</span>{p.name}
                    </button>
                  ))}
                </div>
              </Field>
              {cfg.template === "velvet" && <VelvetPanel o={cfg.opts.velvet} set={(p) => setOpt("velvet", p)} />}
              {cfg.template === "cover" && <CoverPanel o={cfg.opts.cover} set={(p) => setOpt("cover", p)} />}
              {cfg.template === "bold" && <BoldPanel o={cfg.opts.bold} set={(p) => setOpt("bold", p)} cfg={cfg} setCfg={setCfg} />}
            </section>
          )}

          {tab === "stats" && sb && biz && <section className="ls-card"><h3>الإحصائيات</h3><Stats sb={sb} bizId={biz.id} cfg={cfg} /></section>}
        </div>

        <div className="ls-preview">
          <div className="ls-phone">
            <div className="ls-notch" />
            <div className="lk-frame ls-screen" onClickCapture={(e) => { if ((e.target as Element).closest("a")) e.preventDefault(); }}>
              <LinkPageView cfg={cfg} biz={linkBiz} />
            </div>
          </div>
          <p className="ls-preview-cap">معاينة حيّة -- كذا يشوفها زبونك</p>
        </div>
      </div>

      <div className={"ls-savebar" + (dirty ? " dirty" : "")}>
        <span>{dirty ? "عندك تعديلات ما انحفظت" : "كل شي محفوظ"}</span>
        <button type="button" className="ls-btn ghost ls-only-mobile" onClick={() => setMobilePreview((v) => !v)}>{mobilePreview ? "رجوع للتعديل" : "معاينة"}</button>
        <button type="button" className="ls-btn primary" disabled={!dirty || busy || state === "nocol"} onClick={() => save()}>{busy ? "يحفظ..." : "احفظ"}</button>
      </div>
    </div>
  );

  return createPortal(body, host);
}

/** أول مرة: نبدأ من بيانات المطعم الموجودة بدل صفحة فاضية. */
function starter(row: BizRow): LinkPageConfig {
  const c = defaultConfig(row.name);
  c.links = c.links.map((l) => (l.type === "whatsapp" && row.online_contact_whatsapp ? { ...l, value: row.online_contact_whatsapp } : l));
  const soc: LinkItem[] = [];
  if (row.online_social_instagram) soc.push({ id: newId(), type: "instagram", label: "إنستقرام", value: row.online_social_instagram, on: true });
  if (row.online_social_tiktok) soc.push({ id: newId(), type: "tiktok", label: "تيك توك", value: row.online_social_tiktok, on: true });
  if (row.online_social_twitter) soc.push({ id: newId(), type: "x", label: "إكس", value: row.online_social_twitter, on: true });
  c.socials = soc;
  return c;
}
