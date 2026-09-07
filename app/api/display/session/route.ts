import { NextRequest, NextResponse } from "next/server";

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
  try {
    secret = String(((await request.json()) as { secret?: unknown }).secret || "");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // السرّ أربعةٌ وستون حرفاً ست عشرية -- وما خالف ذلك لا يُكتب.
  if (!/^[0-9a-f]{32,128}$/.test(secret)) return NextResponse.json({ ok: false }, { status: 400 });

  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(COOKIE, secret, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: YEAR,
  });
  return res;
}
