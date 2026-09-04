import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

const PERMISSION_KEYS = new Set([
  "screen:home", "screen:sales", "screen:orders", "screen:purchases", "screen:menu", "screen:inventory",
  "screen:customers", "screen:loyalty", "screen:accounting", "screen:hr",
  "screen:reports", "screen:settings", "view_profit", "view_salary",
]);

// Edit/delete a real team member (manager or employee) — same caller
// verification pattern as create-team-member. The owner account and
// branch-level POS PIN accounts can't be touched through this route: an
// owner is the one per business and isn't editable this way, and PIN
// accounts aren't "team members" in this UI's sense.
async function verifyAndLoadTarget(request: NextRequest, targetId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) };
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) {
    return { error: NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles").select("id, business_id, user_type").eq("id", caller.id).single();
  if (callerProfileError || !callerProfile || !["owner", "manager"].includes(callerProfile.user_type)) {
    return { error: NextResponse.json({ error: "لازم تكون مدير أو مالك" }, { status: 403 }) };
  }

  // Previously completely unprotected — covers both PATCH and DELETE since
  // both call through this shared helper.
  if (!(await checkDbRateLimit(admin, request, "RL_TEAM_MANAGE", 20, 300, String(callerProfile.business_id)))) {
    return { error: NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 }) };
  }

  const { data: target, error: targetError } = await admin
    .from("profiles").select("id, business_id, user_type, branch_id").eq("id", targetId).single();
  if (
    targetError || !target ||
    target.business_id !== callerProfile.business_id ||
    target.user_type === "owner" ||
    target.branch_id !== null
  ) {
    return { error: NextResponse.json({ error: "العضو غير موجود" }, { status: 404 }) };
  }

  return { admin, callerProfile, target };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await verifyAndLoadTarget(request, id);
  if ("error" in result) return result.error;
  const { admin, callerProfile, target } = result;

  const { fullName, email, password, permissions } = await request.json();

  if (password && password.length < 6) {
    return NextResponse.json({ error: "كلمة المرور لازم تكون ٦ أحرف أو أكثر" }, { status: 400 });
  }

  if (email || password) {
    const authUpdate: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) { authUpdate.email = email; authUpdate.email_confirm = true; }
    if (password) authUpdate.password = password;
    const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  }

  if (fullName) {
    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", id);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  if (Array.isArray(permissions) && target.user_type === "employee") {
    const grantedKeys: string[] = permissions.filter((p: unknown) => typeof p === "string" && PERMISSION_KEYS.has(p));
    const { error: deleteError } = await admin.from("user_permissions").delete().eq("user_id", id);
    if (deleteError) {
      console.error("team-member update: permission delete failed", deleteError);
      return NextResponse.json({ error: "تعذر تحديث الصلاحيات" }, { status: 500 });
    }
    if (grantedKeys.length > 0) {
      const { error: insertError } = await admin.from("user_permissions").insert(
        grantedKeys.map((key) => ({ user_id: id, permission_key: key, granted_by: callerProfile.id }))
      );
      if (insertError) {
        console.error("team-member update: permission insert failed", insertError);
        return NextResponse.json({ error: "تعذر تحديث الصلاحيات" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await verifyAndLoadTarget(request, id);
  if ("error" in result) return result.error;
  const { admin } = result;

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("team-member delete: auth deleteUser failed", error);
    return NextResponse.json({ error: "تعذر حذف الحساب" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
