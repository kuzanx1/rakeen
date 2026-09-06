import type { Metadata } from "next";
import DisplayPage from "./DisplayPage";

/**
 * رابط شاشة العميل، مستقلاً عن المتجر.
 *
 * ولا فهرسة له: صفحةٌ تُفتح على جهازٍ في المحل، ولا معنى لظهورها في
 * نتيجة بحث -- ولا لأن يجدها من يبحث عن المطعم فيقع على شاشة كاشيره.
 */
export const metadata: Metadata = {
  title: "شاشة العميل",
  robots: { index: false, follow: false },
  manifest: "/display-manifest.json",
  // ملء الشاشة على iOS: الجهاز يقف أمام زبون، وشريط المتصفح فوقه
  // يقول إنه صفحة لا شاشة.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "شاشة العميل" },
};

export const viewport = {
  themeColor: "#F7F5EF",
  // لا تكبير بالإصبع: الشاشة تُلمس بالخطأ، وتكبيرٌ عارض يُفسد عرضها
  // ولا أحد يعرف كيف يعيده.
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DisplayPage slug={slug} />;
}
