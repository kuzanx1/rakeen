import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// H5 (security hardening) — 4 digits is a small space (10,000) on its own;
// this is the one layer we CAN add cheaply against it without breaking the
// PIN's whole point (fast, memorable, no typing on a shared tablet). Built
// from the well-documented "most common 4-digit PINs" analyses (repeated
// digits, ascending/descending runs, year-like and date-like patterns,
// keypad shapes) — not exhaustive, but it stops the PINs an attacker tries
// first. Real per-branch PINs already in place before this list existed
// were deliberately NOT audited retroactively: doing that would mean
// either reading password hashes (Supabase's Admin API never exposes them,
// by design) or live-guessing against real branches, which risks locking
// out an actual cashier mid-shift — this blocks weak PINs going forward
// instead, at creation and every reset.
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123", "9876", "8765", "7654", "6543", "5432", "4321", "3210",
  "1212", "2121", "1122", "2211", "1313", "1004", "2000", "2001", "2580", "1010", "1122", "6969", "1230", "0987",
]);

// Creates (or resets the PIN for) the ONE shared Supabase Auth account a
// branch's POS device authenticates as. Needs the service role key
// (auth.admin.*) — never exposed to the browser, this route only runs
// server-side. The caller's own access token is used first to verify
// they're actually an owner/manager of the branch's business before any
// admin action happens.
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

  const { branchId, pin } = await request.json();
  if (!branchId || !/^\d{4}$/.test(String(pin || ""))) {
    return NextResponse.json({ error: "رمز غير صالح — لازم يكون ٤ أرقام" }, { status: 400 });
  }
  if (WEAK_PINS.has(String(pin))) {
    return NextResponse.json({ error: "هذا الرمز سهل التخمين — اختر رمز ثاني (تجنّب 1234، 0000، أرقام متكررة أو متسلسلة)" }, { status: 400 });
  }

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

  if (!(await checkRateLimit(request, "RL_ADMIN_SENSITIVE", String(callerProfile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_SENSITIVE", 10, 60, String(callerProfile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .select("id, business_id, name")
    .eq("id", branchId)
    .single();
  if (branchError || !branch || branch.business_id !== callerProfile.business_id) {
    return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 });
  }

  const email = `pos+${branchId}@rakeen.internal`;
  const password = `${pin}-pos`;

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("branch_id", branchId)
    .eq("user_type", "employee")
    .maybeSingle();

  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (updateError) {
      console.error("provision-branch: PIN reset failed", updateError);
      return NextResponse.json({ error: "تعذر تحديث الرمز" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, reset: true });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      business_id: callerProfile.business_id,
      branch_id: branchId,
      user_type: "employee",
      full_name: `نقطة بيع — ${branch.name}`,
      created_by: callerProfile.id,
    },
  });
  if (createError || !created.user) {
    console.error("provision-branch: account creation failed", createError);
    return NextResponse.json({ error: "تعذر إنشاء الحساب" }, { status: 500 });
  }

  const { error: permError } = await admin
    .from("user_permissions")
    .insert({ user_id: created.user.id, permission_key: "pos:register", granted_by: callerProfile.id });
  if (permError) {
    console.error("provision-branch: permission grant failed", permError);
    return NextResponse.json({ error: "تعذر منح الصلاحيات" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reset: false });
}
