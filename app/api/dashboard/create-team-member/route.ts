import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

const PERMISSION_KEYS = new Set([
  "screen:home", "screen:sales", "screen:orders", "screen:purchases", "screen:menu", "screen:inventory",
  "screen:staff", "screen:customers", "screen:loyalty", "screen:accounting",
  "screen:reports", "screen:settings", "view_profit",
]);

// Creates a real manager/employee login (auth.users + profiles + optional
// user_permissions rows). Needs the service role key (auth.admin.createUser)
// — never exposed to the browser, this route only runs server-side. The
// caller's own access token is verified first (must be owner/manager of the
// target business) before any admin action happens. Seat limit is also
// enforced by a DB trigger (enforce_seat_limit) so this route's own check
// isn't the only thing standing between a subscriber and unlimited seats.
export async function POST(request: NextRequest) {
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

  const { fullName, email, password, userType, permissions } = await request.json();
  if (!fullName || !email || !password || !["manager", "employee"].includes(userType)) {
    return NextResponse.json({ error: "بيانات ناقصة أو غير صالحة" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "كلمة المرور لازم تكون ٦ أحرف أو أكثر" }, { status: 400 });
  }
  const grantedKeys: string[] = Array.isArray(permissions)
    ? permissions.filter((p: unknown) => typeof p === "string" && PERMISSION_KEYS.has(p))
    : [];

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await asCaller.auth.getUser(token);
  if (callerError || !caller) {
    return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("id, business_id, user_type")
    .eq("id", caller.id)
    .single();
  if (callerProfileError || !callerProfile || !["owner", "manager"].includes(callerProfile.user_type)) {
    return NextResponse.json({ error: "لازم تكون مدير أو مالك" }, { status: 403 });
  }

  // Previously completely unprotected — a real account-creation endpoint
  // with no rate limit of any kind. 10 per 5 minutes covers real onboarding
  // (adding several staff in one sitting) without leaving it open to a
  // scripted seat-limit-exhaustion or account-spam loop.
  if (!(await checkDbRateLimit(admin, request, "RL_TEAM_MANAGE", 10, 300, String(callerProfile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      business_id: callerProfile.business_id,
      full_name: fullName,
      user_type: userType,
      created_by: callerProfile.id,
    },
  });
  if (createError || !created.user) {
    const msg = (createError?.message || "").includes("seat_limit_reached")
      ? "وصلت الحد الأقصى لعدد الموظفين المسموح باشتراكك الحالي."
      : createError?.message || "تعذر إنشاء الحساب";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (userType === "employee" && grantedKeys.length > 0) {
    const { error: permError } = await admin.from("user_permissions").insert(
      grantedKeys.map((key) => ({ user_id: created.user.id, permission_key: key, granted_by: callerProfile.id }))
    );
    if (permError) {
      console.error("create-team-member: permission insert failed", permError);
      return NextResponse.json({ error: "تعذر منح الصلاحيات" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}
