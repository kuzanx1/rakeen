"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  FONTS, LINK_TYPES, TEMPLATES, TEMPLATE_KEYS, defaultConfig, fontsHref, linkPageUrl, newId, normalizeConfig, resolveHref,
  type BoldOpts, type CoverOpts, type FontKey, type LinkBiz, type LinkItem, type LinkPageConfig, type LinkType,
  type TemplateKey, type VelvetOpts,
} from "@/lib/links/model";
import { COLOR_KEYS, FALLBACK_BRAND, brandTones, isHex, logoColors, near } from "@/lib/links/brand";
import { ICON_LIBRARY, ICON_NAMES, type IconKey } from "@/lib/links/icon-keys";
import LinkPageView from "../l/LinkPageView";
import { Icon, type IconName } from "../l/icons";
import "../l/links.css";
import "../l/links-v2.css";
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
  online_social_tiktok?: string | null; online_social_twitter?: string | null; online_theme_color?: string | null;
};

/** يلوّن كل التصاميم (اللي على نغمة، مو يدوية) من ألوان الهوية. */
function applyBrand(c: LinkPageConfig): LinkPageConfig {
  const opts = { ...c.opts };
  TEMPLATE_KEYS.forEach(<K extends TemplateKey>(t: K) => {
    const i = c.brand.tone[t];
    if (i < 0) return;
    const tone = brandTones(t, c.brand)[i] || brandTones(t, c.brand)[0];
    opts[t] = { ...opts[t], ...tone.v } as LinkPageConfig["opts"][K];
  });
  return { ...c, opts };
}

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
/** خانة كود اللون: تقبل #RRGGBB أو #RGB، بالـ# أو بدونها، وتعتمد أول ما يكتمل. */
function HexIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  const take = (raw: string) => {
    const v = "#" + raw.replace(/[^0-9a-f]/gi, "").slice(0, 6);
    setTxt(v);
    const full = /^#[0-9a-f]{3}$/i.test(v) ? "#" + v.slice(1).split("").map((c) => c + c).join("") : v;
    if (v.length === 7) onChange(full.toUpperCase());
  };
  const commit = () => {
    if (/^#[0-9a-f]{3}$/i.test(txt)) onChange(("#" + txt.slice(1).split("").map((c) => c + c).join("")).toUpperCase());
    else setTxt(value);
  };
  return (
    <input className="ls-hex" dir="ltr" value={txt} maxLength={7} spellCheck={false} aria-label="كود اللون" placeholder="#000000"
      onChange={(e) => take(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
function ColorIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ls-color">
      <input type="color" value={value} aria-label={label} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <span>{label}</span>
      <HexIn value={value} onChange={onChange} />
    </div>
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

/* ───────── مكتبة الأيقونات ───────── */
function IconPicker({ value, auto, onPick, onClose }: { value: IconKey | ""; auto: IconName; onPick: (k: IconKey | "") => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const term = q.trim();
  const cats = ICON_LIBRARY.filter((c) => !cat || c.cat === cat);
  return (
    <div className="ls-icp" role="dialog" aria-label="اختر أيقونة">
      <div className="ls-icp-top">
        <input value={q} autoFocus placeholder="ابحث: قهوة، توصيل، خصم..." onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="ls-ic-btn" onClick={onClose} aria-label="إغلاق">✕</button>
      </div>
      {!term && (
        <div className="ls-icp-cats">
          <button type="button" className={!cat ? "on" : ""} onClick={() => setCat("")}>الكل</button>
          {ICON_LIBRARY.map((c) => <button key={c.cat} type="button" className={cat === c.cat ? "on" : ""} onClick={() => setCat(c.cat)}>{c.cat}</button>)}
        </div>
      )}
      <div className="ls-icp-body">
        <button type="button" className={"ls-icp-i auto" + (!value ? " on" : "")} onClick={() => onPick("")} title="تلقائي">
          <Icon name={auto} size={22} /><small>تلقائي</small>
        </button>
        {cats.flatMap((c) => c.items.filter((it) => !term || it[1].includes(term) || it[0].includes(term.toLowerCase())).map((it) => (
          <button key={c.cat + it[0]} type="button" className={"ls-icp-i" + (value === it[0] ? " on" : "")} onClick={() => onPick(it[0])} title={it[1]}>
            <Icon name={it[0]} size={22} /><small>{it[1]}</small>
          </button>
        )))}
      </div>
    </div>
  );
}

/* ───────── محرّر قائمة روابط ───────── */
function LinkList({ items, onChange, biz, social, showNote }: {
  items: LinkItem[]; onChange: (v: LinkItem[]) => void; biz: LinkBiz; social?: boolean; showNote?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const types = (Object.keys(LINK_TYPES) as LinkType[]).filter((t) => t !== "heading" && (social ? LINK_TYPES[t].social : true));
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
  const max = social ? 10 : 24;
  return (
    <div className="ls-links">
      {items.length === 0 && <p className="ls-empty">{social ? "ما فيه حسابات. أضف إنستقرام وتيك توك وغيرها." : "ما فيه روابط بعد."}</p>}
      {items.map((it, i) => {
        const meta = LINK_TYPES[it.type];
        const controls = (
          <>
            <span className="ls-sp" />
            <button type="button" className="ls-ic-btn" title="لفوق" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
            <button type="button" className="ls-ic-btn" title="لتحت" onClick={() => move(i, 1)} disabled={i === items.length - 1}>▼</button>
            <button type="button" className={"ls-ic-btn" + (it.on ? "" : " dim")} title={it.on ? "إخفاء" : "إظهار"} onClick={() => set(i, { on: !it.on })}>{it.on ? "👁" : "🚫"}</button>
            <button type="button" className="ls-ic-btn danger" title="حذف" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </>
        );
        if (it.type === "heading") {
          return (
            <div key={it.id} data-ls-link={it.id} className={"ls-link ls-heading" + (it.on ? "" : " off")}>
              <div className="ls-link-head">
                <span className="ls-heading-tag">عنوان قسم</span>
                <input value={it.label} maxLength={40} placeholder="مثلاً: تواصل معنا" onChange={(e) => set(i, { label: e.target.value })} />
                {controls}
              </div>
            </div>
          );
        }
        const href = resolveHref(it, biz);
        const broken = it.on && !href;
        return (
          <div key={it.id} data-ls-link={it.id} className={"ls-link" + (it.on ? "" : " off") + (broken ? " bad" : "")}>
            <div className="ls-link-head">
              <button type="button" className={"ls-link-ic pick" + (it.icon ? " custom" : "")} title="غيّر الأيقونة" onClick={() => setPicking(picking === it.id ? null : it.id)}>
                <Icon name={(it.icon || it.type) as IconName} size={18} />
              </button>
              <b>{meta.name}</b>
              {!social && (
                <button type="button" className={"ls-star" + (it.star ? " on" : "")} title="مميّز" onClick={() => set(i, { star: !it.star })}>
                  <Icon name="star" size={14} /> {it.star ? "مميّز" : "ميّزه"}
                </button>
              )}
              {controls}
            </div>
            {picking === it.id && (
              <IconPicker value={it.icon || ""} auto={it.type as IconName} onClose={() => setPicking(null)}
                onPick={(icon) => { set(i, { icon }); setPicking(null); }} />
            )}
            <div className="ls-link-body">
              {!social && <input value={it.label} maxLength={60} placeholder="نص الزر" onChange={(e) => set(i, { label: e.target.value })} />}
              {meta.auto ? (
                <small className={href ? "ls-ok" : "ls-warn"}>
                  {href ? `يفتح: ${href}` : it.type === "order" ? "المتجر الإلكتروني غير مفعّل -- الزر ما يظهر" : "صفحة الحجز غير مفعّلة -- الزر ما يظهر"}
                </small>
              ) : (
                <input dir="ltr" value={it.value} maxLength={400} placeholder={meta.placeholder} aria-label={meta.ask} onChange={(e) => set(i, { value: e.target.value })} />
              )}
              {showNote && !social && <input value={it.note || ""} maxLength={60} placeholder="سطر صغير تحت الاسم (اختياري)" onChange={(e) => set(i, { note: e.target.value })} />}
              {broken && !meta.auto && <small className="ls-warn">اكتب {meta.ask} عشان يظهر الزر</small>}
              {it.icon && <small className="ls-ok-plain">الأيقونة: {ICON_NAMES[it.icon]}</small>}
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
        <div className="ls-add-row">
          <button type="button" className="ls-btn add" onClick={() => setAdding(true)} disabled={items.length >= max}>
            + {social ? "أضف حساب" : "أضف رابط"}
          </button>
          {!social && (
            <button type="button" className="ls-btn add ghost-add" disabled={items.length >= max}
              onClick={() => onChange([...items, { id: newId(), type: "heading", label: "", value: "", on: true }])}>
              + عنوان قسم
            </button>
          )}
        </div>
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
      <Toggle on={o.grain} onChange={(grain) => set({ grain })} label="ملمس فيلم ناعم فوق الصورة" />
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
            {(Object.keys(LINK_TYPES) as LinkType[]).filter((t) => t !== "heading").map((t) => <option key={t} value={t}>{LINK_TYPES[t].name}</option>)}
          </select>
          {!LINK_TYPES[cfg.cta.type].auto && (
            <input dir="ltr" value={cfg.cta.value} placeholder={LINK_TYPES[cfg.cta.type].placeholder} onChange={(e) => setCfg({ cta: { ...cfg.cta, value: e.target.value } })} />
          )}
        </div>
      )}
    </>
  );
}

/* ───────── ألوان الهوية ───────── */
function BrandPanel({ cfg, detected, onPrimary, onTone }: {
  cfg: LinkPageConfig; detected: string[]; onPrimary: (c: string) => void; onTone: (i: number) => void;
}) {
  const t = cfg.template;
  const tones = brandTones(t, cfg.brand);
  const cur = cfg.brand.tone[t];
  const primary = cfg.brand.primary || FALLBACK_BRAND;
  const chips = detected.some((c) => near(c, primary)) ? detected : [primary, ...detected];
  return (
    <>
      <Field label="لون هويتك" hint={detected.length ? "طلعناها من شعارك. اختر لونك، وكل التصاميم تتلوّن عليه." : "ارفع شعارك ونطلّع ألوانه، أو اختر لونك."}>
        <div className="ls-brand">
          {chips.map((c) => (
            <button key={c} type="button" className={"ls-sw" + (near(c, primary) ? " on" : "")} style={{ background: c }} aria-label={c} onClick={() => onPrimary(c)} />
          ))}
          <label className="ls-sw ls-sw-add" title="لون آخر">
            <input type="color" value={primary} onChange={(e) => onPrimary(e.target.value.toUpperCase())} />
            <Icon name="plus" size={16} />
          </label>
          <HexIn value={primary} onChange={onPrimary} />
        </div>
      </Field>
      <Field label={`ألوان «${TEMPLATES.find((x) => x.key === t)!.name}»`} hint={cur < 0 ? "ألوانك يدوية الحين -- اختر وحدة من فوق ترجع لهويتك" : undefined}>
        <div className="ls-pals">
          {tones.map((p, i) => (
            <button key={p.name} type="button" className={cur === i ? "on" : ""} onClick={() => onTone(i)}>
              <span>{Object.values(p.v).slice(0, 4).map((c, k) => <i key={k} style={{ background: c as string }} />)}</span>
              {p.name}{p.light && <em className="ls-tone">فاتح</em>}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

/* ───────── الإحصائيات ───────── */
type HitRow = { day: string; link_id: string; hits: number };
/** مجموع آخر ٣٠ يوم: زيارات الصفحة، وضغطات الروابط (بدون زر المشاركة). */
function hitTotals(rows: HitRow[]) {
  const views = rows.filter((r) => r.link_id === "").reduce((a, r) => a + r.hits, 0);
  const clicks = rows.filter((r) => r.link_id && r.link_id !== "share").reduce((a, r) => a + r.hits, 0);
  return { views, clicks };
}
function Stats({ rows, err, cfg, enabled }: { rows: HitRow[] | null; err: boolean; cfg: LinkPageConfig; enabled: boolean }) {
  if (err) return <p className="ls-empty">الإحصائيات تشتغل بعد تفعيل الميزة من ركين.</p>;
  if (!rows) return <p className="ls-empty">يحمّل...</p>;
  if (!rows.length) {
    return (
      <div className="hm-empty lsx-empty">
        <span className="hm-empty-ic"><Icon name="users" size={22} /></span>
        <b>{enabled ? "ما زارها أحد للحين" : "صفحتك مخفية -- محد يقدر يزورها"}</b>
        <span>{enabled ? "حط رابطها في بايو إنستقرام وتيك توك وسناب، وأول ما يدخلها أحد يطلع هنا." : "انشرها من فوق، وبعدها كل زيارة وضغطة تنحسب هنا."}</span>
      </div>
    );
  }
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000 + 3 * 3600000).toISOString().slice(0, 10));
  const views = days.map((d) => rows.filter((r) => r.day === d && r.link_id === "").reduce((a, r) => a + r.hits, 0));
  const totalViews = views.reduce((a, b) => a + b, 0);
  const clicks = new Map<string, number>();
  rows.filter((r) => r.link_id && r.link_id !== "share").forEach((r) => clicks.set(r.link_id, (clicks.get(r.link_id) || 0) + r.hits));
  const shares = rows.filter((r) => r.link_id === "share").reduce((a, r) => a + r.hits, 0);
  const totalClicks = [...clicks.values()].reduce((a, b) => a + b, 0);
  const all = [...cfg.links, ...cfg.socials];
  const nameOf = (id: string): { name: string; icon?: IconName } => {
    if (id === "cta") return { name: `الزر العائم: ${cfg.cta.label}`, icon: "order" };
    if (id === "ann") return { name: `الإعلان: ${cfg.announce.text || "—"}`, icon: "megaphone" };
    const it = all.find((x) => x.id === id);
    return it ? { name: it.label || LINK_TYPES[it.type].name, icon: (it.icon || it.type) as IconName } : { name: "رابط محذوف" };
  };
  const named = [...clicks.entries()].map(([id, n]) => ({ id, n, ...nameOf(id) })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...views);
  return (
    <div className="ls-stats-tab">
      <div className="ls-kpis">
        <div><b>{totalViews.toLocaleString("en")}</b><span>زيارة · آخر ٣٠ يوم</span></div>
        <div><b>{totalClicks.toLocaleString("en")}</b><span>ضغطة على الروابط</span></div>
        <div><b>{totalViews ? Math.round((totalClicks / totalViews) * 100) : 0}٪</b><span>نسبة الضغط</span></div>
      </div>
      {shares > 0 && <p className="ls-hint">وشاركها الزوار {shares.toLocaleString("en")} مرة من زر المشاركة.</p>}
      <div className="ls-bars" aria-label="الزيارات يومياً">
        {views.map((v, i) => <i key={i} title={`${days[i]}: ${v}`} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />)}
      </div>
      <h4>أكثر الروابط ضغطاً</h4>
      {named.length === 0 ? <p className="ls-empty">ما فيه ضغطات بعد. شارك رابط صفحتك في البايو.</p> : (
        <ul className="ls-top">
          {named.map((r) => (
            <li key={r.id}>
              {r.icon && <Icon name={r.icon} size={16} />}<span>{r.name}</span>
              <i style={{ width: `${(r.n / named[0].n) * 100}%` }} /><b>{r.n}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────── QR للطاولات والكاشير ───────── */
async function downloadQr(url: string, slug: string) {
  try {
    const QR = (await import("qrcode")).default;
    const data = await QR.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#FFFFFF" } });
    const a = document.createElement("a");
    a.href = data;
    a.download = `${slug}-links-qr.png`;
    a.click();
    toast("✓ نزل الباركود -- اطبعه على الطاولات أو الكاشير");
  } catch {
    toast("تعذر إنشاء الباركود");
  }
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
  const [detected, setDetected] = useState<string[]>([]);
  const [hits, setHits] = useState<HitRow[] | null>(null);
  const [hitsErr, setHitsErr] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const lastSrc = useRef<string | null>(null);
  const prevLeft = useRef<number | null>(null);

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
    const cols = "id, name, logo_url, online_menu_slug, online_ordering_enabled, online_booking_enabled, online_contact_whatsapp, online_social_instagram, online_social_tiktok, online_social_twitter, online_theme_color";
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

  // زيارات آخر ٣٠ يوم: مرّة وحدة مع التحميل، للبطاقة فوق وتبويب «مين زارها».
  const bizId = biz?.id;
  useEffect(() => {
    if (!sb || !bizId) return;
    const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    sb.from("link_page_hits").select("day, link_id, hits").eq("business_id", bizId).gte("day", since)
      .then(({ data, error }: { data: HitRow[] | null; error: unknown }) => { if (error) setHitsErr(true); else setHits(data || []); });
  }, [sb, bizId]);

  // الخطوط كلها مرّة وحدة للمعاينة ومنتقي الخط
  useEffect(() => {
    if (!active || document.getElementById("lsFonts")) return;
    const l = document.createElement("link");
    l.id = "lsFonts"; l.rel = "stylesheet"; l.href = fontsHref(Object.keys(FONTS) as FontKey[]);
    document.head.appendChild(l);
  }, [active]);

  const setCfg = useCallback((p: Partial<LinkPageConfig>) => setCfgState((c) => (c ? { ...c, ...p } : c)), []);
  // تعديل لون يدوياً يطلع التصميم من نغمة الهوية (ما نرجع نكتب فوقه).
  const setOpt = useCallback(<K extends TemplateKey>(k: K, p: Partial<LinkPageConfig["opts"][K]>) =>
    setCfgState((c) => {
      if (!c) return c;
      const manual = Object.keys(p).some((x) => COLOR_KEYS[k].includes(x));
      return {
        ...c, opts: { ...c.opts, [k]: { ...c.opts[k], ...p } },
        brand: manual ? { ...c.brand, tone: { ...c.brand.tone, [k]: -1 } } : c.brand,
      };
    }), []);

  const setPrimary = useCallback((primary: string, pool: string[]) =>
    setCfgState((c) => c && applyBrand({ ...c, brand: { ...c.brand, primary, second: pool.find((x) => !near(x, primary)) || "" } })), []);
  const setTone = useCallback((i: number) =>
    setCfgState((c) => c && applyBrand({ ...c, brand: { ...c.brand, tone: { ...c.brand.tone, [c.template]: i } } })), []);

  // ألوان الهوية من الشعار (+ لون المتجر). أول مرة (صفحة جديدة) أو لما يتغيّر
  // الشعار: كل التصاميم تتلوّن عليها تلقائياً.
  const brandSrc = cfg ? cfg.avatar || biz?.logo_url || "" : null;
  const hasPrimary = !!cfg?.brand.primary;
  useEffect(() => {
    if (brandSrc === null || !biz) return;
    let off = false;
    logoColors(brandSrc).then((cols) => {
      if (off) return;
      const sc = (biz.online_theme_color || "").toUpperCase();
      const store = isHex(sc) && sc !== "#C7FF4D" && !cols.some((c) => near(c, sc)) ? [sc] : [];
      const list = [...cols, ...store].slice(0, 6);
      setDetected(list);
      const first = lastSrc.current === null;
      const changed = !first && lastSrc.current !== brandSrc;
      lastSrc.current = brandSrc;
      if ((first && !hasPrimary) || changed) setPrimary(list[0] || FALLBACK_BRAND, list);
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandSrc, biz]);

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

  // «وش وضعي؟» -- أربع خطوات من نفس البيانات اللي يشوفها الزبون.
  const quest = useMemo(() => {
    if (!cfg || !linkBiz) return null;
    const real = cfg.links.filter((l) => l.type !== "heading" && l.on);
    const working = real.filter((l) => resolveHref(l, linkBiz));
    const broken = real.filter((l) => !resolveHref(l, linkBiz));
    const socials = cfg.socials.filter((s) => s.on && s.value.trim());
    let live = false;
    try { live = !!(saved && JSON.parse(saved).enabled); } catch { /* محفوظ تالف = مو منشور */ }
    const b = broken[0];
    const bMeta = b ? LINK_TYPES[b.type] : null;
    const steps = [
      { key: "slug", done: /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug), label: "اكتب اسم رابطك",
        desc: "بالإنجليزي وحروف صغيرة، مثل makboos -- ويصير رابطك makboos.rakeenapp.com/links" },
      { key: "links", done: working.length > 0 && !b, label: b ? `كمّل زر «${b.label || bMeta!.name}»` : "حط روابطك",
        desc: !b ? "الطلب، المنيو، واتساب، الموقع -- اللي يدوّره زبونك أول ما يدخل"
          : b.type === "order" ? "المتجر الإلكتروني مقفل، فزر الطلب ما يطلع -- فعّل المتجر أو أخفِ الزر"
          : b.type === "booking" ? "صفحة الحجز مقفلة، فالزر ما يطلع -- فعّلها أو أخفِ الزر"
          : `ناقص ${bMeta!.ask} -- بدونه الزر ما يطلع لزبونك` },
      { key: "socials", done: socials.length > 0, label: "أضف حساباتك", desc: "إنستقرام وتيك توك وسناب تطلع أيقونات في صفحتك" },
      { key: "publish", done: live && !dirty, label: live ? "احفظ تعديلاتك" : "انشر صفحتك",
        desc: live ? "زبونك يشوف النسخة القديمة لين تحفظ" : "بعدها حط الرابط في البايو، وزبونك يوصل لكل شي من مكان واحد" },
    ];
    return { steps, live, working: working.length, broken: broken.length };
  }, [cfg, linkBiz, slug, saved, dirty]);
  const left = quest ? quest.steps.filter((s) => !s.done).length : null;
  // احتفال صغير لما تخلص آخر خطوة فعلاً -- مو أول ما تنفتح الشاشة وهي جاهزة.
  useEffect(() => {
    if (left === null) return;
    const was = prevLeft.current;
    prevLeft.current = left;
    if (was === null || was === 0 || left !== 0) return;
    setCelebrate(true);
    toast("صفحتك شغّالة 🎉 حط رابطها في البايو");
    const t = window.setTimeout(() => setCelebrate(false), 1600);
    return () => window.clearTimeout(t);
  }, [left]);

  if (!host) return null;
  const url = linkBiz?.slug ? linkPageUrl(linkBiz.slug) : "";
  const tpl = cfg ? TEMPLATES.find((t) => t.key === cfg.template)! : TEMPLATES[0];
  const iconsMatter = cfg && (cfg.template === "velvet" || cfg.template === "cover");
  const totals = hits ? hitTotals(hits) : null;

  /** «ابدأ»: يفتح المكان نفسه ويوقف المؤشر فيه. */
  const focusLater = (sel: string, inputSel = "input") => window.setTimeout(() => {
    const el = host.querySelector<HTMLElement>(sel);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("lsx-flash"); void el.offsetWidth; el.classList.add("lsx-flash");
    (el.matches("input") ? el : el.querySelector<HTMLElement>(inputSel))?.focus({ preventScroll: true });
  }, 60);
  const goStep = (key: string) => {
    if (!cfg || !linkBiz) return;
    setMobilePreview(false);
    if (key === "publish") { save({ enabled: true }); return; }
    setTab("content");
    if (key === "slug") focusLater("#lsSlug");
    else if (key === "socials") focusLater("#lsSocials", "button.add");
    else {
      const b = cfg.links.find((l) => l.type !== "heading" && l.on && !resolveHref(l, linkBiz));
      focusLater(b ? `[data-ls-link="${b.id}"]` : "#lsLinks", b && !LINK_TYPES[b.type].auto ? "input[dir=ltr]" : "button.add");
    }
  };
  const plural = (n: number) => (n === 1 ? "خطوة وحدة" : n === 2 ? "خطوتين" : `${n} خطوات`);

  const hero = !quest || !cfg || !linkBiz ? null : (() => {
    const done = quest.steps.length - left!;
    const nextIdx = quest.steps.findIndex((s) => !s.done);
    const next = quest.steps[nextIdx];
    return (
      <section className={"rk2-card lsx-hero" + (left ? " hm-quest" : " lsx-done") + (celebrate ? " mn-celebrate" : "")}>
        <div className="lsx-top">
          {left ? (
            <div className="hm-ring" style={{ "--p": Math.round((done / quest.steps.length) * 100) } as CSSProperties}><b>{done}<small>/{quest.steps.length}</small></b></div>
          ) : <span className="mn-done-ic"><Icon name="check" size={20} /></span>}
          <div className="lsx-top-txt">
            <div className="hm-kicker"><Icon name="share" size={14} /> صفحة روابطك <span className={"lsx-state" + (quest.live ? " on" : "")}>{quest.live ? "منشورة" : "مخفية"}</span></div>
            <h3>{!left ? "صفحتك شغّالة" : done === 0 ? "أربع خطوات وتصير لمطعمك صفحة روابط" : `باقي ${plural(left)} و${quest.live ? "تكمل صفحتك" : "تنشرها"}`}</h3>
            <p>{!left ? "رابط واحد في البايو يوصل زبونك للطلب والمنيو وواتساب والموقع" : "صفحة وحدة فيها الطلب والمنيو وواتساب والموقع وحساباتك -- رابطها يروح في بايو إنستقرام وتيك توك وسناب"}</p>
          </div>
          <div className={"ls-live" + (cfg.enabled ? " on" : "")}>
            <Toggle on={cfg.enabled} onChange={(enabled) => save({ enabled })} label="ظاهرة للزباين" />
          </div>
        </div>
        {url ? (
          <div className="lsx-url">
            <code dir="ltr">{url.replace("https://", "")}</code>
            <button type="button" className="rk2-btn mn-ghost sm" onClick={() => { navigator.clipboard?.writeText(url); toast("✓ نسخت الرابط"); }}>انسخ الرابط</button>
            <button type="button" className="rk2-btn mn-ghost sm" title="باركود للطباعة" onClick={() => downloadQr(url, linkBiz.slug)}><Icon name="qr" size={15} /> باركود للطاولات</button>
            {quest.live && <a className="rk2-btn mn-ghost sm" href={url} target="_blank" rel="noopener">افتحها</a>}
          </div>
        ) : null}
        {next && (
          <>
            <button type="button" className="hm-quest-next" data-lsx-go={next.key} onClick={() => goStep(next.key)}>
              <span className="hm-quest-n">{nextIdx + 1}</span>
              <span className="hm-quest-txt"><b>{next.label}</b><small>{next.desc}</small></span>
              <span className="rk2-btn lime sm">{next.key === "publish" ? (quest.live ? "احفظ" : "انشرها") : "ابدأ"}<Icon name="arrow" size={15} /></span>
            </button>
            <div className="hm-quest-list">
              {quest.steps.map((s, i) => i === nextIdx ? null : (
                <button key={s.key} type="button" className={"hm-qstep" + (s.done ? " done" : "")} disabled={s.done} data-lsx-go={s.done ? undefined : s.key} onClick={() => goStep(s.key)}>
                  <span className="hm-qcheck">{s.done ? <Icon name="check" size={12} stroke={2.4} /> : i + 1}</span>{s.label}
                </button>
              ))}
            </div>
          </>
        )}
        {!left && (
          <div className="lsx-stats">
            <div className="iv-stat"><span>زيارات · آخر ٣٠ يوم</span><b className="hm-num">{totals ? totals.views.toLocaleString("en") : "—"}</b>{totals && !totals.views && <small>حط الرابط في البايو وتبدأ تنحسب</small>}</div>
            <div className="iv-stat"><span>ضغطات على الأزرار</span><b className="hm-num">{totals ? totals.clicks.toLocaleString("en") : "—"}</b></div>
            {totals && totals.views > 0 && <div className="iv-stat"><span>نسبة الضغط</span><b className="hm-num">{Math.round((totals.clicks / totals.views) * 100)}٪</b></div>}
            <button type="button" className="rk2-btn mn-ghost sm" data-lsx-go="stats" onClick={() => setTab("stats")}>التفاصيل</button>
          </div>
        )}
      </section>
    );
  })();

  const tiles: [typeof tab, IconName, string, string][] = !quest ? [] : [
    ["content", "website", "اكتب روابطك", `${quest.working} ${quest.working === 1 ? "زر شغّال" : "أزرار شغّالة"}` + (quest.broken ? ` · ${quest.broken} ناقص` : "")],
    ["design", "sparkle", "لوّنها", `تصميم «${tpl.name}» · ألوانك`],
    ["stats", "users", "مين زارها", hitsErr ? "تشتغل بعد التفعيل" : !totals ? "يحمّل..." : totals.views ? `${totals.views.toLocaleString("en")} زيارة · آخر ٣٠ يوم` : "ما فيه زيارات بعد"],
  ];

  const body = !cfg || !linkBiz ? (
    <div className="ls-loading">{state === "error" ? "تعذر التحميل. حدّث الصفحة." : "يحمّل..."}</div>
  ) : (
    <div className={"ls" + (mobilePreview ? " show-preview" : "")}>
      {state === "nocol" && <div className="ls-note">الميزة جاهزة، تحتاج تفعيل بسيط من فريق ركين قبل الحفظ. تقدر تجرّب التصاميم الحين.</div>}
      {hero}

      <div className="ls-grid">
        <div className="ls-side">
          <h3 className="lsx-sec">وش تبي تسوي؟</h3>
          <div className="rk2-tiles lsx-tiles" role="tablist">
            {tiles.map(([k, ic, title, sum]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} data-ls-tab={k} className={"rk2-tile" + (tab === k ? " active on" : "")} onClick={() => setTab(k)}>
                <span className="rk2-tile-ic"><Icon name={ic} size={19} /></span>
                <span className="rk2-tile-txt"><b>{title}</b><small>{sum}</small></span>
              </button>
            ))}
          </div>

          {tab === "design" && (
          <section className="ls-card">
            <h3>اختر شكل صفحتك</h3>
            <div className="ls-tpls">
              {TEMPLATES.map((t) => (
                // div لا button: المصغّرة فيها أزرار وروابط الصفحة نفسها (زر داخل زر ممنوع).
                <div key={t.key} role="button" tabIndex={0} aria-pressed={cfg.template === t.key} className={"ls-tpl" + (cfg.template === t.key ? " on" : "")}
                  onClick={() => setCfg({ template: t.key })}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCfg({ template: t.key }); } }}>
                  <div className="ls-tpl-mini" inert><div className="lk-frame ls-mini"><LinkPageView cfg={{ ...cfg, template: t.key }} biz={linkBiz} /></div></div>
                  <b>{t.name}{t.tone === "light" && <em className="ls-tone">فاتح</em>}</b><small>{t.hint}</small>
                </div>
              ))}
            </div>
          </section>
          )}

          {tab === "content" && (
            <>
              <section className="ls-card">
                <h3>الهوية</h3>
                <Field label="الاسم"><input value={cfg.name} maxLength={60} onChange={(e) => setCfg({ name: e.target.value })} /></Field>
                <Field label="وصف قصير" hint="سطر واحد: وش يميزكم؟"><input value={cfg.bio} maxLength={140} placeholder="مشويات على الفحم منذ ٢٠١٢" onChange={(e) => setCfg({ bio: e.target.value })} /></Field>
                <ImagePick label="الشعار" value={cfg.avatar} onChange={(avatar) => setCfg({ avatar })} hint={biz?.logo_url ? "فاضي = شعار مطعمك من الإعدادات" : undefined} />
                <ImagePick label="الاسم كشعار (اختياري)" value={cfg.wordmark} onChange={(wordmark) => setCfg({ wordmark })} keepAlpha
                  hint="صورة اسم مطعمك بخلفية شفافة (PNG) -- تطلع بدل الاسم المكتوب" />
                <Field label="اسم الرابط بالإنجليزي" hint={`نفس اسم متجرك -- الرابط: ${slug || "name"}.rakeenapp.com/links`}>
                  <input id="lsSlug" dir="ltr" value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                </Field>
              </section>

              <section className="ls-card">
                <h3>شريط إعلان</h3>
                <Toggle on={cfg.announce.on} onChange={(on) => setCfg({ announce: { ...cfg.announce, on } })} label="إعلان صغير أعلى الصفحة" />
                {cfg.announce.on && (
                  <>
                    <Field label="النص" hint="عرض، افتتاح فرع، دوام رمضان..."><input value={cfg.announce.text} maxLength={80} placeholder="خصم ٢٠٪ على الطلب الأول من المتجر" onChange={(e) => setCfg({ announce: { ...cfg.announce, text: e.target.value } })} /></Field>
                    <Field label="يفتح (اختياري)">
                      <div className="ls-ann-link">
                        <button type="button" className={"ls-btn" + (cfg.announce.link === "order" ? " sel" : "")} onClick={() => setCfg({ announce: { ...cfg.announce, link: cfg.announce.link === "order" ? "" : "order" } })}>
                          <Icon name="order" size={15} /> المتجر
                        </button>
                        <input dir="ltr" value={cfg.announce.link === "order" ? "" : cfg.announce.link} placeholder="أو رابط https://..." maxLength={400}
                          onChange={(e) => setCfg({ announce: { ...cfg.announce, link: e.target.value } })} />
                      </div>
                    </Field>
                  </>
                )}
              </section>

              <section className="ls-card" id="lsLinks">
                <h3>الأزرار</h3>
                <p className="ls-hint">اضغط الأيقونة جنب أي رابط واختر من المكتبة. و«عنوان قسم» يرتّب روابطك مجموعات: «اطلب»، «تواصل»، «فروعنا».</p>
                <LinkList items={cfg.links} onChange={(links) => setCfg({ links })} biz={linkBiz} showNote={cfg.template === "bold"} />
              </section>


              <section className="ls-card" id="lsSocials">
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
              <h3>خيارات «{tpl.name}»</h3>
              <BrandPanel cfg={cfg} detected={detected} onPrimary={(c) => setPrimary(c, detected)} onTone={setTone} />
              {cfg.template === "velvet" && <VelvetPanel o={cfg.opts.velvet} set={(p) => setOpt("velvet", p)} />}
              {cfg.template === "cover" && <CoverPanel o={cfg.opts.cover} set={(p) => setOpt("cover", p)} />}
              {cfg.template === "bold" && <BoldPanel o={cfg.opts.bold} set={(p) => setOpt("bold", p)} cfg={cfg} setCfg={setCfg} />}
              <div className="ls-divider" />
              <h3>للصفحة كلها</h3>
              {iconsMatter && <Toggle on={cfg.icons} onChange={(icons) => setCfg({ icons })} label="أيقونة جنب كل زر" />}
              <Toggle on={cfg.share} onChange={(share) => setCfg({ share })} label="زر «شارك الصفحة» أعلى الشاشة" />
            </section>
          )}

          {tab === "stats" && <section className="ls-card"><h3>مين زار صفحتك؟</h3><Stats rows={hits} err={hitsErr} cfg={cfg} enabled={!!quest?.live} /></section>}
        </div>

        <div className="ls-preview">
          <div className="ls-phone">
            <div className="ls-notch" />
            <div className="lk-frame ls-screen" onClickCapture={(e) => { if ((e.target as Element).closest("a, [data-share]")) e.preventDefault(); }}>
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
