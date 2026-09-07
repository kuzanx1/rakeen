import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * ملف التحقق في جذر متجر المطعم.
 *
 * منصّة التوثيق تفتح https://hbiah.rakeenapp.com/<اسم-الملف>.txt وتتوقّع
 * نصّاً بعينه. ولا ملفَّ هناك أصلاً -- الموقع تطبيق، لا مجلّد على خادم.
 * فيُصنَع الردّ من العمود الذي حفظه صاحب المطعم، ويُقدَّم كما لو كان
 * ملفاً مرفوعاً. والفرق لا يُرى من الخارج، وهو المطلوب.
 *
 * ويُطابَق الاسم مطابقةً تامّة: من طلب ملفاً بغير الاسم المحفوظ لم يجد
 * شيئاً. لأن ردَّ المحتوى نفسه لأي اسم يعني أن رمز مطعمٍ يُقرأ من مسار
 * مطعمٍ آخر، والرمز هو كلُّ ما يثبت الملكية.
 */
export async function GET(request: NextRequest) {
  const slug = (request.nextUrl.searchParams.get("slug") || "").toLowerCase();
  const file = request.nextUrl.searchParams.get("file") || "";
  if (!slug || !file) return new NextResponse("Not found", { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return new NextResponse("Not found", { status: 404 });

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data } = await sb
    .from("businesses")
    .select("verification_file_name, verification_file_content")
    .eq("online_menu_slug", slug)
    .maybeSingle();

  if (!data?.verification_file_name || data.verification_file_name !== file) {
    return new NextResponse("Not found", { status: 404 });
  }

  // نصٌّ صريح بلا تخمين ترميز، وبلا تخزينٍ طويل: صاحب المطعم يحذف
  // الملف بعد التوثيق، فينبغي أن يختفي حين يحذفه لا بعد ساعة.
  return new NextResponse(data.verification_file_content || "", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=30",
      "X-Robots-Tag": "noindex",
    },
  });
}
