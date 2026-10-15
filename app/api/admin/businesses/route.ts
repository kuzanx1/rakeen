import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp, logAdminAction } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { BUSINESS_TYPES, NO_DINING_ROOM_TYPES } from "@/lib/businessTypes";
import { planByKey } from "@/lib/plans";

// Platform-owner console — lists every restaurant on Rakeen, for the
// account(s) listed in PLATFORM_ADMIN_EMAILS. This is a different concept
// from a restaurant's own owner/manager/employee roles (profiles.user_type)
// — a platform admin isn't a member of any business at all, so this checks
// the caller's verified session email against a server-side allowlist
// instead of anything in the businesses/profiles tenancy tables.
function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

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
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: businesses, error } = await admin
    .from("businesses")
    .select(
      "id, name, plan, online_ordering_enabled, online_menu_slug, online_order_free_count, online_order_free_limit, online_subscribed, is_active, admin_notes, subscription_expires_at, branch_limit, included_seats, kitchen_display_enabled, inventory_enabled, loyalty_enabled, verification_status, business_type, created_at"
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("admin businesses list: query failed", error);
    return NextResponse.json({ error: "تعذر التحميل" }, { status: 500 });
  }

  const { data: owners } = await admin.from("profiles").select("id, business_id, full_name").eq("user_type", "owner");
  const ownerByBusiness: Record<number, { id: string; full_name: string }> = {};
  (owners || []).forEach((o) => {
    ownerByBusiness[o.business_id] = { id: o.id, full_name: o.full_name };
  });

  // Real order volume (all channels). online_order_free_count is only the
  // free-trial meter (cash online orders), not how many orders a business
  // actually has. Missing function (migration not applied) = no counts.
  const { data: counts, error: countsError } = await admin.rpc("admin_business_order_counts");
  if (countsError) console.error("admin businesses list: order counts failed", countsError);
  const countsByBusiness: Record<number, { total: number; online: number }> = {};
  ((counts as { business_id: number; total_orders: number; online_orders: number }[] | null) || []).forEach((c) => {
    countsByBusiness[Number(c.business_id)] = { total: Number(c.total_orders), online: Number(c.online_orders) };
  });

  const rows = (businesses || []).map((b) => ({
    ...b,
    owner_name: ownerByBusiness[b.id]?.full_name || null,
    owner_id: ownerByBusiness[b.id]?.id || null,
    total_orders: countsError ? null : countsByBusiness[b.id]?.total ?? 0,
    online_orders: countsError ? null : countsByBusiness[b.id]?.online ?? 0,
  }));

  return NextResponse.json({ businesses: rows });
}

// The admin adds a subscriber by hand: same account the self-serve signup
// creates (handle_new_auth_user builds the business, branch and owner
// profile), then the admin's choices on top:
// - trial: 350 orders (cashier + online together), then 24 hours, then
//   selling stops (20261016090000). subscribed: no limit at all.
// - access: the admin types the password, or gets a one-time link to send
//   on WhatsApp, where the owner sets his own (the dashboard's existing
//   "new password" screen, #type=recovery). The link's lifetime is the
//   Supabase project's email-link expiry; a new one comes from this same
//   route with { resendLinkFor: email }.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
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
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const email = str(body.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }
  const redirectTo = `${request.nextUrl.origin}/dashboard`;
  const accessLink = async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    return error ? null : data?.properties?.action_link || null;
  };

  // A fresh link for an account that already exists (the first one expired).
  if (body.resendLinkFor) {
    const link = await accessLink();
    if (!link) return NextResponse.json({ error: "تعذر إنشاء الرابط — تأكد من البريد" }, { status: 400 });
    await logAdminAction(admin, caller.email || "unknown", "business.access_link", email, "success", {});
    return NextResponse.json({ ok: true, link });
  }

  const businessName = str(body.businessName, 120);
  const fullName = str(body.fullName, 120);
  const phone = str(body.phone, 20);
  const types: readonly string[] = BUSINESS_TYPES;
  const businessType = types.includes(body.businessType) ? String(body.businessType) : "restaurant";
  const trial = body.mode !== "subscribed";
  const plan = body.plan ? planByKey(String(body.plan)) : null;
  if (body.plan && !plan) return NextResponse.json({ error: "باقة غير معروفة" }, { status: 400 });
  const byLink = body.access !== "password";
  const password = typeof body.password === "string" ? body.password : "";
  if (!businessName) return NextResponse.json({ error: "اكتب اسم المنشأة" }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "اكتب اسم صاحب المنشأة" }, { status: 400 });
  if (!byLink && password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور لازم تكون ٨ أحرف أو أكثر" }, { status: 400 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    ...(byLink ? {} : { password }),
    email_confirm: true,
    user_metadata: { business_name: businessName, full_name: fullName, phone: phone || null, business_type: businessType },
  });
  if (createError || !created.user) {
    const msg = (createError?.message || "").toLowerCase().includes("already")
      ? "فيه حساب مسجّل بهذا البريد من قبل"
      : createError?.message || "تعذر إنشاء الحساب";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: profile } = await admin.from("profiles").select("business_id").eq("id", created.user.id).single();
  const businessId = Number(profile?.business_id) || null;
  let setupError: string | null = null;
  if (businessId) {
    // The admin added them himself, so there's nothing to review: a
    // self-serve signup starts 'pending' (no online orders until verified),
    // this one starts verified.
    const updates: Record<string, unknown> = { online_subscribed: !trial, verification_status: "verified" };
    if (plan) {
      updates.plan_tier = plan.key;
      updates.branch_limit = plan.includedBranches;
    }
    if (NO_DINING_ROOM_TYPES.includes(businessType)) {
      updates.dine_in_enabled = false;
      updates.tables_reservations_enabled = false;
    }
    const { error } = await admin.from("businesses").update(updates).eq("id", businessId);
    if (error) setupError = error.message;
  } else {
    setupError = "business row not found after signup";
  }

  const link = byLink ? await accessLink() : null;
  await logAdminAction(admin, caller.email || "unknown", "business.create", `business:${businessId ?? "?"}`, setupError ? "failure" : "success", {
    email,
    trial,
    plan: plan?.key || null,
    access: byLink ? "link" : "password",
    ...(setupError ? { reason: setupError } : {}),
  });
  if (setupError) {
    // The account exists; only the trial/plan settings failed. Say so
    // instead of pretending, so the admin sets them from the business page.
    return NextResponse.json({ ok: true, businessId, link, warning: "انشأ الحساب، بس ما انضبطت الباقة/التجربة — اضبطها من صفحة المنشأة" });
  }
  if (byLink && !link) {
    return NextResponse.json({ ok: true, businessId, link: null, warning: "انشأ الحساب، بس تعذر إنشاء رابط التفعيل — اضغط «رابط جديد»" });
  }
  return NextResponse.json({ ok: true, businessId, link });
}
