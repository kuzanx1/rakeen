import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

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

  const rows = (businesses || []).map((b) => ({
    ...b,
    owner_name: ownerByBusiness[b.id]?.full_name || null,
    owner_id: ownerByBusiness[b.id]?.id || null,
  }));

  return NextResponse.json({ businesses: rows });
}
