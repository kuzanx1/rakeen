import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

// WhatsApp media isn't hot-linkable — Meta's media URLs are short-lived and
// require the same access token on every fetch, so there's nothing to store
// permanently here. This proxies on demand: look up the current download URL
// by media_id, then stream the bytes through with the right content-type.
// Bearer auth stays in a header (not a query string) so the admin's session
// token never ends up in browser history or server logs — the panel fetches
// this as a blob rather than using it directly as an <img src>.
export async function GET(request: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  if (requiresStepUp(token)) {
    return NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 });
  }
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const rlAdmin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(rlAdmin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "واتساب غير مهيأ" }, { status: 500 });

  const { mediaId } = await params;
  const infoRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) return NextResponse.json({ error: "تعذر جلب الوسائط" }, { status: 502 });
  const info = (await infoRes.json()) as { url?: string; mime_type?: string };
  if (!info.url) return NextResponse.json({ error: "الوسائط غير متوفرة" }, { status: 404 });

  const fileRes = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok || !fileRes.body) return NextResponse.json({ error: "تعذر تحميل الملف" }, { status: 502 });

  return new NextResponse(fileRes.body, {
    headers: {
      "Content-Type": info.mime_type || fileRes.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
