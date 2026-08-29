import type { Metadata, Viewport } from "next";
import KitchenPage from "./KitchenPage";

export const metadata: Metadata = {
  title: "ركين | شاشة المطبخ",
  description: "شاشة عرض المطبخ لركين — لأي جهاز/تابلت رخيص.",
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
      <KitchenPage />
    </>
  );
}
