import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ركين | الوضوح اللي كنت تحتاجه",
  description: "نظام تشغيل كامل لمطعمك — ركين يجمع الكاشير والمخزون والتقارير وقنوات البيع بمكان واحد.",
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
