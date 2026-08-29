import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { requiresStepUp } from "@/lib/adminAuth";

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

async function authorizeAdmin(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) } as const;
  }
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) } as const;

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller || !isAdminEmail(caller.email)) {
    return { error: NextResponse.json({ error: "غير مصرّح" }, { status: 403 }) } as const;
  }
  if (requiresStepUp(token)) {
    return { error: NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 }) } as const;
  }
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return { error: NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 }) } as const;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return { error: NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 }) } as const;
  }
  return { admin, email: caller.email as string } as const;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if ("error" in auth) return auth.error;
  const { admin, email } = auth;

  const { endpoint, p256dh, auth: authKey } = await request.json().catch(() => ({} as { endpoint?: string; p256dh?: string; auth?: string }));
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "بيانات اشتراك غير صالحة" }, { status: 400 });
  }

  const { error } = await admin.from("admin_push_subscriptions").upsert(
    { endpoint, p256dh, auth: authKey, admin_email: email },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("admin push-subscribe: upsert failed", error);
    return NextResponse.json({ error: "تعذر التفعيل" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { endpoint } = await request.json().catch(() => ({} as { endpoint?: string }));
  if (!endpoint) return NextResponse.json({ error: "endpoint مطلوب" }, { status: 400 });

  await admin.from("admin_push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
