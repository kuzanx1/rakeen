import type { Metadata, Viewport } from "next";
import POSPage from "./POSPage";

// Force dynamic rendering — this shell has no per-request data of its own,
// but Next/OpenNext otherwise prerenders it statically with an aggressive
// edge cache (s-maxage=1 year). That's fine for the hashed rakeen-pos.js/css
// chunk *files* (a new deploy gets new filenames), but the HTML *itself*
// references those filenames — a cashier's device stuck on an old cached
// copy of this page can end up requesting chunk files a newer deploy no
// longer has, which silently fails and leaves the app half-styled or stuck.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ركين | الكاشير",
  description: "نقطة بيع ركين — للتابلت وكل الأجهزة.",
  manifest: "/pos-manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function Page() {
  return (
    <>
      {/* loaded as parallel <link> tags instead of the CSS @import that used
          to live in rakeen-pos.css — an @import blocks CSSOM construction
          (and therefore first paint) until the font stylesheet finishes
          fetching; on weak/slow hardware (old Android POS terminals) that
          delay was very noticeable. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600;700;800&display=swap"
      />
      <POSPage />
    </>
  );
}
