import type { Metadata, Viewport } from "next";
import DashboardPage from "./DashboardPage";

// This shell is 100% client-rendered ("use client" in DashboardPage) — auth
// and all data load in the browser via Supabase. Statically caching it was
// causing real users to keep loading an old page shell (old hashed CSS/JS
// asset references) for minutes after a deploy, well after the new assets
// were already live on the server. Force a fresh render per request so a
// deploy is visible immediately, not after the edge cache's stale window.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "لوحة تحكم ركين",
  description: "مركز عمليات المطعم — المبيعات والمخزون والمحاسبة والموظفين بمكان واحد.",
  manifest: "/dashboard-manifest.json",
  appleWebApp: {
    capable: true,
    title: "ركين",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/pos-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function Page() {
  return <DashboardPage />;
}
