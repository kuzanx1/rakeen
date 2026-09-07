import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import OrderMenuPage from "./OrderMenuPage";

async function getBusiness(slug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const sb = createClient(supabaseUrl, anonKey);
  const { data } = await sb
    .from("businesses")
    .select("name, logo_url, online_theme_color, verification_meta_name, verification_meta_content")
    .eq("online_menu_slug", slug)
    .eq("online_ordering_enabled", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusiness(slug);

  /**
   * وسم توثيق ملكية المتجر.
   *
   * وزارة التجارة تقرأ ترويسة الصفحة بحثاً عن وسمٍ بعينه قبل أن تمنح
   * شهادة التوثيق. فيُخرَج من إعدادات المطعم حين يوجد، ويختفي حين
   * يحذفه -- لا أثر له في الصفحة غير سطرٍ لا يراه زائر.
   *
   * ويمرّ عبر `other` لا عبر HTML مكتوب بيدنا: Next يُخرج الاسم
   * والقيمة سمتين مُهرَّبتين، فما لُصق يبقى قيمةً مهما كان فيه. ولو
   * كُتب الوسم نصّاً لصار حقلُ إعداداتٍ بابَ حقنٍ في صفحةٍ عامّة.
   */
  const other: Record<string, string> = {};
  if (business?.verification_meta_name && business?.verification_meta_content) {
    other[business.verification_meta_name] = business.verification_meta_content;
    /**
     * علامةٌ تدلّ الخادم على أيّ وسمٍ يرفعه إلى الترويسة.
     *
     * Next يبعث وسوم الميتاداتا بعد إقفال <head>، فتقع في <body>. وهذا
     * لا يضرّ متصفّحاً -- لكن زاحف وزارة التجارة يقرأ <head> وحده،
     * ودليلهم يقولها صراحةً. فيُرفَع الوسم هناك في worker-entrypoint.js
     * قبل أن تخرج الصفحة.
     *
     * والعلامة لا الاسم مباشرةً: الخادم لا يعرف أيّ وسمٍ من وسوم
     * الصفحة هو وسم التوثيق، ورفعُ كلّ وسمٍ يُصادفه عبثٌ بصفحةٍ لا شأن
     * له بها.
     */
    other["x-rakeen-verify"] = business.verification_meta_name;
  }

  return {
    title: business ? `${business.name} — اطلب مباشرة` : "المنيو غير متاح",
    description: business ? `منيو ${business.name} الإلكتروني — اطلب توصيل أو استلام مباشرة.` : undefined,
    other: Object.keys(other).length ? other : undefined,
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600;700;800&display=swap"
      />
      <OrderMenuPage slug={slug} />
    </>
  );
}
