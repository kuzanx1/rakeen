import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Metadata, Viewport } from "next";
import { normalizeConfig, fontsHref, type LinkBiz, type LinkPageConfig } from "@/lib/links/model";
import LinkPageView from "../LinkPageView";
import HitTracker from "../HitTracker";
import "../links.css";

/**
 * «روابطك» -- صفحة روابط المطعم: {slug}.rakeenapp.com/links (أو /l/{slug}).
 * تُرسم كاملةً في الخادم: الرابط ينفتح من بايو إنستقرام وتيك توك، ومتصفحاتها
 * الداخلية بطيئة -- فلا شيء ينتظر جافاسكربت.
 */
type Loaded = { cfg: LinkPageConfig; biz: LinkBiz } | null;

const load = cache(async (slug: string): Promise<Loaded> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !/^[a-z0-9-]{2,40}$/i.test(slug)) return null;
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc("get_link_page", { p_slug: slug.toLowerCase() });
    if (error || !data) return null;
    const d = data as { name: string; logo: string | null; slug: string; store: boolean; booking: boolean; page: unknown };
    return {
      cfg: normalizeConfig(d.page, d.name),
      biz: { name: d.name, logo: d.logo, slug: d.slug, store: d.store, booking: d.booking },
    };
  } catch {
    return null;
  }
});

function themeColor(cfg: LinkPageConfig): string {
  if (cfg.template === "cover") return cfg.opts.cover.panel;
  if (cfg.template === "bold") return cfg.opts.bold.hero;
  return cfg.opts.velvet.tint;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "الصفحة غير متاحة", robots: { index: false } };
  const title = p.cfg.name;
  const description = p.cfg.bio || `كل روابط ${p.cfg.name} في مكان واحد`;
  const img = p.cfg.avatar || p.biz.logo;
  return {
    title, description,
    openGraph: { title, description, siteName: p.cfg.name, locale: "ar_SA", type: "website", ...(img ? { images: [{ url: img, width: 500, height: 500, alt: title }] } : {}) },
    twitter: { card: "summary", title, description, ...(img ? { images: [img] } : {}) },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const { slug } = await params;
  const p = await load(slug);
  return { themeColor: p ? themeColor(p.cfg) : "#111111", width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function LinksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) {
    return (
      <main className="lk-missing" dir="rtl" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#111", color: "#eee", fontFamily: "system-ui", textAlign: "center", padding: 24 }}>
        <div><b style={{ fontSize: 20 }}>الصفحة غير متاحة</b><p style={{ opacity: .6, marginTop: 8 }}>تأكد من الرابط، أو تواصل مع المطعم.</p></div>
      </main>
    );
  }
  const o = p.cfg.opts;
  const font = p.cfg.template === "cover" ? o.cover.font : p.cfg.template === "bold" ? o.bold.font : o.velvet.font;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={fontsHref([font])} />
      <style>{`html,body{margin:0;background:${themeColor(p.cfg)}}`}</style>
      <LinkPageView cfg={p.cfg} biz={p.biz} />
      <HitTracker slug={p.biz.slug} />
    </>
  );
}
