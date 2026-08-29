import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

// Read-only view of admin_audit_log — the audit trail itself is only ever
// written by lib/adminAuth.ts's logAdminAction() via service role, never
// through a client-writable path, so there's no mutation endpoint here at
// all (matches the directive: audit logs must be protected from
// unauthorized modification — the simplest way is to never expose a write).
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

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

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const { data, error } = await admin
    .from("admin_audit_log")
    .select("id, actor_email, action, target, result, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: "تعذر تحميل سجل التدقيق" }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}
