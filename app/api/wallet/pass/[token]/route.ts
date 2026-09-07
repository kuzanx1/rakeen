import { NextRequest, NextResponse } from "next/server";
import { loadWalletRow, renderPass, serviceClient } from "@/lib/wallet-service";

/**
 * "أضف إلى Apple Wallet".
 *
 * هذا ما يفتحه العميل: رابطٌ يردّ ملف .pkpass، فيعرض iOS البطاقة ويسأل
 * "إضافة؟". ولا شيء بعده -- لا تطبيق يُنزَّل ولا حساب يُنشأ.
 *
 * ويصلح باركوداً كما يصلح زراً: شاشة الكاشير تعرض هذا الرابط رمزاً،
 * فيصوّره العميل بكاميرته وتُضاف بطاقته. وهو الفرق بين ولاءٍ يُشرح
 * وولاءٍ يُلتقط.
 *
 * والرمز العام وحده هو المفتاح -- وهو ما تعمل به صفحة البطاقة أصلاً.
 * ومن عرف رمز غيره رأى بطاقته، وهي معلومةٌ لا تُشترى بها قهوة: الصرف
 * يحتاج تأكيد صاحبها من جواله.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "رمز غير صالح" }, { status: 400 });
  }

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  const row = await loadWalletRow(sb, token);
  if (!row) return NextResponse.json({ error: "البطاقة غير موجودة" }, { status: 404 });
  if (!row.enabled) {
    return NextResponse.json({ error: "برنامج الولاء غير مفعّل" }, { status: 403 });
  }

  // ?minimal=1 -- نسخةٌ مبسّطة للتشخيص: بلا ترجمة ولا روابط ولا حقولٍ
  // إضافية. تُفتح على الجهاز نفسه فتقسم الاحتمالات نصفين.
  const q = new URL(request.url).searchParams;
  const add = new Set((q.get("add") || "").split(",").filter(Boolean));
  const mode = (q.get("bare") === "1" || add.size) ? "bare" : q.get("minimal") === "1" ? "minimal" : "full";
  const drop = new Set((q.get("drop") || "").split(",").filter(Boolean));
  const pkpass = await renderPass(row, token, drop.size ? "minimal" : mode, add, drop);
  if (!pkpass) {
    // شهادةٌ ناقصة في البيئة، لا خطأ من العميل. ويُقال ذلك صراحةً بدل
    // 500 صامتة تُبحث في السجلات.
    return NextResponse.json({ error: "لم تُضبط شهادة المحفظة بعد" }, { status: 503 });
  }

  return new NextResponse(pkpass as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      /**
       * لا Content-Disposition.
       *
       * كان `attachment; filename="..."` -- وفيه عطلان:
       *
       * الأول أن iOS مع attachment يُنزّل الملف إلى "الملفات" بدل أن
       * يفتح ورقة "إضافة إلى Apple Wallet". فيرى الزبون صفحةً أو
       * تنزيلاً، ولا تُضاف بطاقته. وآبل تنصّ على تقديمها inline بنوعها
       * وحده.
       *
       * والثاني أن اسم المطعم عربي، وترويسات HTTP لا تحمل إلا ASCII.
       * فترويسةٌ فيها "هَبيّة" ترويسةٌ غير صالحة -- قد تُرمى، وقد يُرمى
       * الردّ كلّه معها.
       *
       * والنوع وحده يكفي: كل نظام يعرف application/vnd.apple.pkpass.
       */
      // البطاقة تُبنى بالرصيد الحالي، فنسخةٌ مخزّنة تعطي رصيداً قديماً.
      "Cache-Control": "no-store",
    },
  });
}
