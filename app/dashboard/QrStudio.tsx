"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { linkPageUrl } from "@/lib/links/model";
import { isHex, logoColors, near } from "@/lib/links/brand";
import { FORMATS, drawPoster, loadFonts, loadImage, type PosterOpts, type QrFormat, type QrStyle } from "@/lib/qr/poster";
import { Icon } from "../l/icons";
import "./qr-studio.css";

/**
 * «باركودك» -- باركود المتجر/صفحة الروابط بهوية المطعم: ستاند طاولة، لوحة
 * كاشير، بوستر واجهة، ملصق. يُرسم داخل #screen-qr عبر portal (مثل «روابطك»)،
 * والقفل بالباقة على زر القائمة نفسه (PLAN_SCREEN_FEATURE.qr = link_page).
 * ما يحفظ شي بقاعدة البيانات: اختيارات التصميم تنحفظ بالمتصفح للراحة فقط.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;
const W = () => window as unknown as { supabaseClient?: Sb; showToast?: (m: string) => void };
const toast = (m: string) => (W().showToast ? W().showToast!(m) : console.log(m));

type Dest = "store" | "links" | "custom";
type BizRow = {
  id: number; name: string; logo_url: string | null; online_menu_slug: string | null;
  online_ordering_enabled: boolean | null; online_theme_color: string | null; link_page?: { enabled?: boolean } | null;
};
type Saved = { dest: Dest; custom: string; format: QrFormat; style: QrStyle; color: string; headline: string; sub: string; name: string; showUrl: boolean; logo: boolean };

const COPY: Record<Dest, { headline: string; sub: string }> = {
  store: { headline: "امسح واطلب", sub: "المنيو كامل بالصور والأسعار" },
  links: { headline: "امسح وتابعنا", sub: "المنيو والطلب وحساباتنا في مكان واحد" },
  custom: { headline: "امسح الباركود", sub: "" },
};
const MAX_TABLES = 60;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="ls-field">
      <span className="ls-field-l">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string, boolean?][]; onChange: (v: T) => void }) {
  return (
    <div className="ls-seg" role="radiogroup">
      {options.map(([k, l, off]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} disabled={!!off} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

function storeUrl(slug: string) {
  return `https://${slug}.rakeenapp.com/`;
}
function cleanUrl(v: string): string {
  const t = v.trim();
  if (!t) return "";
  const u = /^https?:\/\//i.test(t) ? t : "https://" + t;
  try { return new URL(u).href; } catch { return ""; }
}
function toBlobUrl(c: HTMLCanvasElement): Promise<string> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error("blob"))), "image/png"));
}

export default function QrStudio() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [biz, setBiz] = useState<BizRow | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [s, setS] = useState<Saved | null>(null);
  const [detected, setDetected] = useState<string[]>([]);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [tablesOn, setTablesOn] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [copies, setCopies] = useState(4);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const pendingDest = useRef<Dest | null>(null);

  useEffect(() => {
    let obs: MutationObserver | null = null;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById("qrStudioRoot");
      const screen = document.getElementById("screen-qr");
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

  // فتح الشاشة من «روابطك» أو «المتجر الإلكتروني» على وجهة محددة.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ dest?: Dest }>).detail?.dest;
      if (!d) return;
      pendingDest.current = d;
      setS((x) => (x ? { ...x, dest: d, ...COPY[d] } : x));
    };
    window.addEventListener("rk-qr-open", on);
    return () => window.removeEventListener("rk-qr-open", on);
  }, []);

  const load = useCallback(async () => {
    const client = W().supabaseClient;
    if (!client) return;
    setState("loading");
    const { data: ss } = await client.auth.getSession();
    const uid = ss?.session?.user?.id;
    if (!uid) return setState("error");
    const { data: prof } = await client.from("profiles").select("business_id").eq("id", uid).single();
    if (!prof) return setState("error");
    const cols = "id, name, logo_url, online_menu_slug, online_ordering_enabled, online_theme_color";
    let { data, error } = await client.from("businesses").select(cols + ", link_page").eq("id", prof.business_id).single();
    if (error) {
      const r = await client.from("businesses").select(cols).eq("id", prof.business_id).single();
      if (r.error || !r.data) return setState("error");
      data = { ...r.data, link_page: null };
    }
    const row = data as BizRow;
    setBiz(row);
    setState("idle");
    const hasStore = !!(row.online_ordering_enabled && row.online_menu_slug);
    const hasLinks = !!(row.link_page?.enabled && row.online_menu_slug);
    let saved: Partial<Saved> = {};
    try { saved = JSON.parse(localStorage.getItem("rk_qr_" + row.id) || "{}"); } catch { /* المتصفح يمنع التخزين */ }
    const want = pendingDest.current || saved.dest;
    const dest: Dest = want === "store" && hasStore ? "store" : want === "links" && hasLinks ? "links" : want === "custom" ? "custom" : hasStore ? "store" : hasLinks ? "links" : "custom";
    const copy = pendingDest.current || dest !== saved.dest ? COPY[dest] : { headline: saved.headline ?? COPY[dest].headline, sub: saved.sub ?? COPY[dest].sub };
    pendingDest.current = null;
    setS({
      dest, custom: saved.custom || "", format: saved.format && FORMATS[saved.format] ? saved.format : "stand",
      style: saved.style || "brand", color: saved.color && isHex(saved.color) ? saved.color : "",
      name: saved.name || row.name, showUrl: saved.showUrl ?? false, logo: saved.logo ?? true, ...copy,
    });
  }, []);

  useEffect(() => { if (active && !biz && state !== "loading") load(); }, [active, biz, state, load]);

  // الخط + الشعار + ألوان الشعار.
  useEffect(() => {
    if (!active) return;
    loadFonts().then(() => setFontsReady(true));
  }, [active]);
  const logoSrc = biz?.logo_url || "";
  useEffect(() => {
    if (!biz) return;
    let off = false;
    loadImage(logoSrc).then((img) => { if (!off) setLogoImg(img); });
    logoColors(logoSrc).then((cols) => {
      if (off) return;
      const sc = (biz.online_theme_color || "").toUpperCase();
      const store = isHex(sc) && sc !== "#C7FF4D" && !cols.some((c) => near(c, sc)) ? [sc] : [];
      const list = [...cols, ...store].slice(0, 6);
      setDetected(list);
      setS((x) => (x && !x.color ? { ...x, color: list[0] || "#7A1426" } : x));
    });
    return () => { off = true; };
  }, [biz, logoSrc]);

  // يحفظ الاختيارات بالمتصفح (راحة فقط).
  useEffect(() => {
    if (!biz || !s) return;
    try { localStorage.setItem("rk_qr_" + biz.id, JSON.stringify(s)); } catch { /* عادي */ }
  }, [biz, s]);

  const set = useCallback((p: Partial<Saved>) => setS((x) => (x ? { ...x, ...p } : x)), []);

  const slug = biz?.online_menu_slug || "";
  const hasStore = !!(biz?.online_ordering_enabled && slug);
  const hasLinks = !!(biz?.link_page?.enabled && slug);
  const url = !s ? "" : s.dest === "store" ? (hasStore ? storeUrl(slug) : "") : s.dest === "links" ? (hasLinks ? linkPageUrl(slug) : "") : cleanUrl(s.custom);

  const opts = useCallback((table: string): PosterOpts | null => s && url ? ({
    url, format: s.format, style: s.style, color: s.color || "#7A1426", name: s.name.trim(), headline: s.headline.trim(), sub: s.sub.trim(),
    table, showUrl: s.showUrl,
  }) : null, [s, url]);

  const tableList = useMemo(() => {
    if (!tablesOn) return [] as string[];
    const a = Math.max(1, Math.min(from, to)), b = Math.min(Math.max(from, to), a + MAX_TABLES - 1);
    return Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
  }, [tablesOn, from, to]);

  useEffect(() => {
    const o = opts(tablesOn ? tableList[0] || "" : "");
    if (!o || !preview.current) return;
    drawPoster(preview.current, o, s?.logo ? logoImg : null);
  }, [opts, tablesOn, tableList, logoImg, fontsReady, s?.logo, active]);

  const render = async (table: string) => {
    const c = document.createElement("canvas");
    drawPoster(c, opts(table)!, s?.logo ? logoImg : null);
    return c;
  };

  const download = async () => {
    if (!s || !url) return;
    setBusy(true);
    try {
      const c = await render(tablesOn ? tableList[0] || "" : "");
      const href = await toBlobUrl(c);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${slug || "rakeen"}-qr-${s.format}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 4000);
      toast("✓ نزلت الصورة -- تقدر ترسلها للمطبعة");
    } catch {
      toast("تعذر تجهيز الصورة -- جرّب مرة ثانية");
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    if (!s || !url) return;
    setBusy(true);
    const urls: string[] = [];
    try {
      const f = FORMATS[s.format];
      const items = tablesOn ? tableList : Array.from({ length: Math.max(1, Math.min(copies, 40)) }, () => "");
      // نفس الصورة ما نرسمها أكثر من مرة.
      const cache = new Map<string, string>();
      for (const t of items) {
        if (!cache.has(t)) cache.set(t, await toBlobUrl(await render(t)));
        urls.push(cache.get(t)!);
      }
      const per = f.sheet.cols * f.sheet.rows;
      const pages: string[][] = [];
      for (let i = 0; i < urls.length; i += per) pages.push(urls.slice(i, i + per));
      const pw = f.sheet.landscape ? 297 : 210, ph = f.sheet.landscape ? 210 : 297;
      const cw = pw / f.sheet.cols, ch = ph / f.sheet.rows;
      const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${(s.name || "باركود").replace(/[<>&]/g, "")}</title><style>
@page{size:A4 ${f.sheet.landscape ? "landscape" : "portrait"};margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:${pw}mm;height:${ph}mm;display:grid;grid-template-columns:repeat(${f.sheet.cols},${cw}mm);grid-template-rows:repeat(${f.sheet.rows},${ch}mm);page-break-after:always;break-after:page}
.pg:last-child{page-break-after:auto;break-after:auto}
.c{display:flex;align-items:center;justify-content:center;outline:0.2mm dashed #c8c8c8;outline-offset:-0.1mm}
.c img{width:${f.sheet.mmW}mm;height:${f.sheet.mmH}mm;display:block}
</style></head><body>${pages.map((p) => `<div class="pg">${p.map((u) => `<div class="c"><img src="${u}"></div>`).join("")}</div>`).join("")}</body></html>`;
      const fr = document.createElement("iframe");
      fr.style.cssText = "position:fixed;right:-10000px;bottom:0;width:10px;height:10px;border:0";
      document.body.appendChild(fr);
      const d = fr.contentDocument!;
      d.open(); d.write(html); d.close();
      const imgs = Array.from(d.images);
      await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; }))));
      fr.contentWindow!.focus();
      fr.contentWindow!.print();
      window.setTimeout(() => { fr.remove(); new Set(urls).forEach((u) => URL.revokeObjectURL(u)); }, 60000);
      toast(pages.length > 1 ? `جاهز للطباعة -- ${pages.length} ورقات A4` : "جاهز للطباعة -- اختر «حفظ PDF» لو تبيه ملف");
    } catch {
      new Set(urls).forEach((u) => URL.revokeObjectURL(u));
      toast("تعذر تجهيز الطباعة -- جرّب مرة ثانية");
    } finally {
      setBusy(false);
    }
  };

  if (!host) return null;

  const goScreen = (screen: string) => document.querySelector<HTMLButtonElement>(`.nav-item[data-screen="${screen}"]`)?.click();
  const f = s ? FORMATS[s.format] : FORMATS.stand;
  const per = f.sheet.cols * f.sheet.rows;
  const sheets = tablesOn ? Math.ceil(tableList.length / per) : Math.ceil(Math.max(1, copies) / per);
  const destMissing = s && !url ? (
    s.dest === "store" ? <p className="ls-warn qs-miss">متجرك الإلكتروني مقفل -- فعّله أول عشان يشتغل الباركود. <button type="button" className="ls-btn ghost" onClick={() => goScreen("onlineMenu")}>افتح المتجر</button></p>
    : s.dest === "links" ? <p className="ls-warn qs-miss">صفحة روابطك مو منشورة -- انشرها أول. <button type="button" className="ls-btn ghost" onClick={() => goScreen("links")}>افتح روابطك</button></p>
    : <p className="ls-warn qs-miss">اكتب الرابط اللي يفتحه الباركود.</p>
  ) : null;

  const body = !biz || !s ? (
    <div className="ls-loading">{state === "error" ? "تعذر التحميل. حدّث الصفحة." : "يحمّل..."}</div>
  ) : (
    <div className="ls qs">
      <section className="rk2-card qs-hero">
        <span className="qs-hero-ic"><Icon name="qr" size={22} /></span>
        <div>
          <h3>باركود بهويتك، جاهز للطباعة</h3>
          <p>اختر وين يودّي الزبون، وشكل الطباعة: على الطاولة، عند الكاشير، أو على الواجهة. شعارك وألوانك تطلع فيه تلقائياً.</p>
        </div>
      </section>

      <div className="ls-grid qs-grid">
        <div className="ls-side">
          <section className="ls-card">
            <h3>١. وين يودّي الباركود؟</h3>
            <Seg<Dest> value={s.dest} onChange={(dest) => set({ dest, ...COPY[dest] })}
              options={[["store", "المنيو والطلب"], ["links", "صفحة روابطك"], ["custom", "رابط ثاني"]]} />
            {s.dest === "custom" && (
              <Field label="الرابط"><input dir="ltr" value={s.custom} maxLength={300} placeholder="https://..." onChange={(e) => set({ custom: e.target.value })} /></Field>
            )}
            {url ? <small className="ls-ok">يفتح: {url}</small> : destMissing}
          </section>

          <section className="ls-card">
            <h3>٢. وين بتحطه؟</h3>
            <div className="qs-formats">
              {(Object.keys(FORMATS) as QrFormat[]).map((k) => (
                <button key={k} type="button" className={"qs-format" + (s.format === k ? " on" : "")} aria-pressed={s.format === k} onClick={() => { set({ format: k }); setCopies(FORMATS[k].sheet.cols * FORMATS[k].sheet.rows); }}>
                  <span className={"qs-shape qs-shape-" + k} />
                  <b>{FORMATS[k].name}</b><small>{FORMATS[k].hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="ls-card">
            <h3>٣. الشكل</h3>
            <Field label="النمط">
              <Seg<QrStyle> value={s.style} onChange={(style) => set({ style })} options={[["brand", "بلون هويتك"], ["light", "فاتح"], ["dark", "داكن"]]} />
            </Field>
            <Field label="لون الهوية" hint={detected.length ? "طلعناها من شعارك" : undefined}>
              <div className="ls-brand">
                {(detected.some((c) => near(c, s.color)) || !s.color ? detected : [s.color, ...detected]).map((c) => (
                  <button key={c} type="button" className={"ls-sw" + (near(c, s.color) ? " on" : "")} style={{ background: c }} aria-label={c} onClick={() => set({ color: c })} />
                ))}
                <label className="ls-sw ls-sw-add" title="لون آخر">
                  <input type="color" value={s.color || "#7A1426"} onChange={(e) => set({ color: e.target.value.toUpperCase() })} />
                  <Icon name="plus" size={16} />
                </label>
              </div>
            </Field>
            {biz.logo_url && (
              <label className="qs-check"><input type="checkbox" checked={s.logo} onChange={(e) => set({ logo: e.target.checked })} /> شعارك في التصميم ووسط الباركود</label>
            )}
            {!biz.logo_url && <small className="ls-hint">ارفع شعار مطعمك من الإعدادات ويطلع في التصميم ووسط الباركود.</small>}
          </section>

          <section className="ls-card">
            <h3>٤. الكلام</h3>
            <Field label="الجملة الكبيرة"><input value={s.headline} maxLength={28} placeholder={COPY[s.dest].headline} onChange={(e) => set({ headline: e.target.value })} /></Field>
            {s.format !== "sticker" && (
              <Field label="سطر تحتها (اختياري)"><input value={s.sub} maxLength={60} placeholder="مثلاً: اطلب من طاولتك بدون انتظار" onChange={(e) => set({ sub: e.target.value })} /></Field>
            )}
            <Field label="اسم المطعم"><input value={s.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} /></Field>
            {s.format !== "sticker" && (
              <label className="qs-check"><input type="checkbox" checked={s.showUrl} onChange={(e) => set({ showUrl: e.target.checked })} /> اكتب الرابط تحت الباركود</label>
            )}
          </section>

          <section className="ls-card">
            <h3>٥. الطباعة</h3>
            <label className="qs-check"><input type="checkbox" checked={tablesOn} onChange={(e) => setTablesOn(e.target.checked)} /> رقّم الطاولات (كل نسخة عليها رقم طاولة)</label>
            {tablesOn ? (
              <div className="qs-row">
                <Field label="من طاولة"><input type="number" inputMode="numeric" min={1} max={999} value={from} onChange={(e) => setFrom(Math.max(1, Number(e.target.value) || 1))} /></Field>
                <Field label="إلى طاولة"><input type="number" inputMode="numeric" min={1} max={999} value={to} onChange={(e) => setTo(Math.max(1, Number(e.target.value) || 1))} /></Field>
              </div>
            ) : (
              <Field label="عدد النسخ"><input type="number" inputMode="numeric" min={1} max={40} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} /></Field>
            )}
            {tablesOn && <small className="ls-hint">الرقم للترتيب داخل المطعم -- الباركود نفسه يفتح نفس الرابط لكل الطاولات.</small>}
            {tablesOn && Math.abs(to - from) + 1 > MAX_TABLES && <small className="ls-warn">بنطبع أول {MAX_TABLES} طاولة بس في المرة الوحدة.</small>}
            <div className="qs-actions">
              <button type="button" className="ls-btn primary" disabled={!url || busy} onClick={print}>
                <Icon name="download" size={16} /> {busy ? "يجهّز..." : `اطبع · ${sheets} ${sheets === 1 ? "ورقة" : sheets === 2 ? "ورقتين" : "ورقات"} A4`}
              </button>
              <button type="button" className="ls-btn" disabled={!url || busy} onClick={download}>نزّل صورة PNG</button>
            </div>
            <small className="ls-hint">بالطباعة اختر «حفظ PDF» لو تبي ترسله لمطبعة. الخط المتقطع للقص.</small>
          </section>
        </div>

        <div className="ls-preview qs-preview">
          <div className={"qs-frame qs-frame-" + s.format}>
            {url ? <canvas ref={preview} aria-label="معاينة الباركود" /> : <div className="qs-empty"><Icon name="qr" size={34} /><span>اختر وين يودّي الباركود</span></div>}
          </div>
          <p className="ls-preview-cap">{url ? "معاينة -- جرّب امسحها بجوالك" : ""}</p>
        </div>
      </div>
    </div>
  );

  return createPortal(body, host);
}
