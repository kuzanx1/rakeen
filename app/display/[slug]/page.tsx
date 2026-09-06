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
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DisplayPage slug={slug} />;
}
