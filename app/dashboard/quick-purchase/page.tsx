import type { Metadata, Viewport } from "next";
import DashboardPage from "../DashboardPage";

// Same reasoning as app/dashboard/page.tsx: fully client-rendered, must
// never be served as a stale cached shell.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "مشتريات ركين — إضافة سريعة",
  description: "سجّل فاتورة مشتريات بسرعة، من غير ما تدخل لوحة التحكم كاملة.",
  manifest: "/quick-purchase-manifest.json",
  appleWebApp: {
    capable: true,
    title: "مشتريات ركين",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/quick-purchase-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

// Same shell as /dashboard — rakeen-dashboard.js recognizes this exact path
// (see the deep-link block) and, once logged in, jumps straight to the
// Purchases screen with the "سجّل فاتورة مشتريات" flow already open, and
// hides the rest of the app's navigation chrome. That's what makes this
// feel like its own small app when added to a phone's home screen, without
// duplicating any of the real invoice/OCR/stock logic.
export default function QuickPurchasePage() {
  return <DashboardPage />;
}
