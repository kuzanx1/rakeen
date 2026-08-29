import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp, logAdminAction } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lets Rakeen admin reset a restaurant owner's login email/password directly
// — the real-world need is a locked-out owner (forgot password, lost access
// to their signup email) with no self-serve recovery flow today. Only ever
// touches the owner profile (never manager/employee accounts) so this can't
// be used to take over a staff member's login.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await asCaller.auth.getUser(token);
  if (callerError || !caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  if (requiresStepUp(token)) {
    return NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 });
  }

  if (!(await checkRateLimit(request, "RL_ADMIN_SENSITIVE", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_SENSITIVE", 10, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!email && !password) {
    return NextResponse.json({ error: "لا يوجد تعديل — اكتب بريد أو كلمة مرور جديدة" }, { status: 400 });
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "كلمة المرور لازم تكون ٦ أحرف على الأقل" }, { status: 400 });
  }

  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_type", "owner")
    .maybeSingle();
  if (ownerError || !owner) {
    return NextResponse.json({ error: "تعذر إيجاد مالك هذا المطعم" }, { status: 404 });
  }

  const updates: { email?: string; password?: string } = {};
  if (email) updates.email = email;
  if (password) updates.password = password;

  const { error: updateError } = await admin.auth.admin.updateUserById(owner.id, updates);
  if (updateError) {
    const msg = updateError.message.toLowerCase().includes("already")
      ? "فيه حساب مسجّل بهذا البريد من قبل"
      : updateError.message;
    await logAdminAction(admin, caller.email || "unknown", "reset_owner_credentials", `business:${businessId}`, "failure", {
      fields: Object.keys(updates),
      reason: msg,
    });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logAdminAction(admin, caller.email || "unknown", "reset_owner_credentials", `business:${businessId}`, "success", {
    fields: Object.keys(updates),
  });
  return NextResponse.json({ ok: true });
}
