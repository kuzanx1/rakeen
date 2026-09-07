import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/wallet-service";

/**
 * مرساةٌ ثانية لسرّ الشاشة.
 *
 * كان يسكن localStorage وحده -- وذاك يُمحى ولا يستأذن: سفاري تمسح كل
 * ما تكتبه النصوص بعد سبعة أيام بلا لمسٍ من مستخدم، وشاشةُ العميل لا
 * يلمسها أحد بطبيعتها. وكروم يُخلي تخزين الأصل عند ضيق القرص. ومتصفّحُ
 * كشكٍ يُنظَّف عند كل إغلاق. فيُفتح الصباحُ على شاشةٍ تطلب رمزاً.
 *
 * والكعكة تُكتب من الخادم لا من النصّ: ما يكتبه document.cookie تحكمه
 * سفاري بسبعة أيام كذلك، وما يأتي في ترويسة Set-Cookie يبقى. فإن مُحي
 * أحدهما أعاده الآخر، ولا يُطلب الرمز إلا إذا ضاعا معاً.
 */
const COOKIE = "rk_display_secret";
const YEAR = 60 * 60 * 24 * 400;

export async function GET(request: NextRequest) {
  const secret = request.cookies.get(COOKIE)?.value || null;
  return NextResponse.json({ secret }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let secret = "";
  let clientId = "";
  try {
    const body = (await request.json()) as { secret?: unknown; clientId?: unknown };
    secret = String(body.secret || "");
    clientId = String(body.clientId || "");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // السرّ أربعةٌ وستون حرفاً ست عشرية -- وما خالف ذلك لا يُكتب.
  if (!/^[0-9a-f]{32,128}$/.test(secret)) return NextResponse.json({ ok: false }, { status: 400 });

  /**
   * ويُسجَّل من فتح الرابط -- كما تعرض تيليقرام أجهزةَ الحساب.
   *
   * رمزُ الشاشة مفتاحٌ حامل: من قرأه من شريط العنوان أو ورثه من سجلّ
   * تصفّحٍ عنده ما عند الشاشة. والتخمينُ بعيد، لكنّ التسريب ليس
   * تخميناً -- وهو الطريق الحقيقيّ. ولا يُمنع ما لا يُرى.
   *
   * والعنوانُ يُقرأ هنا لا في المتصفّح: الصفحةُ لا تعرف عنوانَ نفسها،
   * ولو عرفته لما أُمِن عليه. وcf-connecting-ip هو الحقيقيّ خلف
   * كلاودفلير -- وx-forwarded-for قد يحمل سلسلةً، فيُؤخذ أوّلُها.
   */
  if (/^[a-z0-9]{8,64}$/i.test(clientId)) {
    const ip =
      request.headers.get("cf-connecting-ip") ||
      (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      null;
    const ua = request.headers.get("user-agent");
    try {
      const sb = serviceClient();
      // ولا يُنتظر: تسجيلُ الأثر لا يؤخّر فتحَ الشاشة أمام زبونٍ واقف.
      await sb?.rpc("record_display_session", {
        p_secret: secret,
        p_client_id: clientId,
        p_ip: ip,
        p_user_agent: ua,
      });
    } catch {
      // فشلُ التسجيل لا يمنع الاقتران: الأثرُ فائدةٌ، والاقترانُ وظيفة.
    }
  }

  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(COOKIE, secret, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: YEAR,
  });
  return res;
}
