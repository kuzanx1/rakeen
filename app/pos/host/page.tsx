import type { Metadata, Viewport } from "next";
import POSPage from "../POSPage";

// Same POS app, same login (branch PIN + staff picker) and the exact same
// realtime restaurant_tables/table_reservations data — rakeen-pos.js
// detects this route by pathname and switches into "host mode" at boot:
// skips the shift-open step (a host stand doesn't run a cash drawer),
// lands on the Tables screen instead of Home, hides the other bottom-nav
// tabs, and drops the order-taking/payment buttons from the table sheets.
// A dedicated reservation host and the regular cashier can both use this
// link from a separate tablet at the entrance without it ever touching
// money or the register.
// See app/pos/page.tsx for why: this shell would otherwise be statically
// prerendered with a very long edge cache, and a device stuck on a stale
// copy can end up requesting JS/CSS chunk files a newer deploy removed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ركين | الحجوزات والطاولات",
  description: "شاشة إدارة الطاولات وقائمة الانتظار — ركين.",
  manifest: "/pos-manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function Page() {
  return (
    <>
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
