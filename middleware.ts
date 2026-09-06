import { NextRequest, NextResponse } from "next/server";

// Lets a business's online menu load at {slug}.rakeenapp.com/ instead of only
// rakeenapp.com/order/{slug} — the hostname is rewritten (not redirected) so
// the subdomain stays in the visitor's address bar while Next.js actually
// serves app/order/[slug]/page.tsx underneath.
//
// This stays a `middleware.ts` file (the pre-16 convention) rather than the
// new `proxy.ts`: proxy.ts is Node.js-runtime-only in Next 16 and cannot be
// configured otherwise, but OpenNext's Cloudflare adapter only supports Edge
// middleware — middleware.ts is still the only way to get that runtime here.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();

  if (hostname === "rakeenapp.com" || hostname === "www.rakeenapp.com" || hostname === "localhost") {
    return NextResponse.next();
  }

  const suffix = ".rakeenapp.com";
  if (!hostname.endsWith(suffix)) {
    return NextResponse.next();
  }
  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/order/${slug}`;
    return NextResponse.rewrite(url);
  }

  /**
   * hbiah.rakeenapp.com/menu -- شاشة العميل، بهوية المتجر نفسه.
   *
   * وكان رابطها rakeenapp.com/display/{slug}: يعمل، لكنه لا يشبه شيئاً
   * يملكه صاحب المطعم. والشاشة تُفتح مرة ويُكتب رابطها بيد -- فليكن
   * مما يُملى في الهاتف: "اسم متجرك، ثم شرطة، ثم منيو".
   *
   * و"menu" لا "display": الكلمة يقرؤها من يمرّ بالجهاز، ويكتبها من
   * يُعدّه. وdisplay اسمُنا الداخلي للوضع، لا اسمُه عندهم.
   */
  if (request.nextUrl.pathname === "/menu" || request.nextUrl.pathname === "/menu/") {
    const url = request.nextUrl.clone();
    url.pathname = `/display/${slug}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
