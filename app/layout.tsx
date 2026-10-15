import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://rakeenapp.com"),
  title: "ركين | الوضوح اللي كنت تحتاجه",
  description: "نظام تشغيل كامل لمطعمك — ركين يجمع الكاشير والمخزون والتقارير وقنوات البيع بمكان واحد.",
  // Link previews (WhatsApp, iMessage...) show og:image; without one they
  // fell back to app/favicon.ico, which was still Next.js's default triangle.
  // Pages that set their own title/description keep these images.
  openGraph: {
    siteName: "ركين",
    locale: "ar_SA",
    type: "website",
    images: [{ url: "/pos-icon-512.png", width: 512, height: 512, alt: "ركين" }],
  },
  twitter: { card: "summary", images: ["/pos-icon-512.png"] },
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
