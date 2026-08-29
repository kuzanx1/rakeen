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

// Deliberately narrow, typed allowlist (not a generic "patch any column"
// endpoint) so a future bug here can't turn into an arbitrary-column-write
// on a multi-tenant table. Each field's validator both checks its type and
// enforces the constraint that matters for that column (e.g. seat/branch
// counts can't go to zero or below — that would lock the owner out of their
// own team/branches with no self-serve way back in).
const FIELD_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  online_subscribed: (v) => typeof v === "boolean",
  online_ordering_enabled: (v) => typeof v === "boolean",
  is_active: (v) => typeof v === "boolean",
  admin_notes: (v) => v === null || typeof v === "string",
  subscription_expires_at: (v) => v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v))),
  online_order_free_limit: (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
  branch_limit: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1,
  included_seats: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1,
  // Deliberately not a self-service dashboard toggle (see
  // 20260810140000_kitchen_display_enabled_flag.sql) — only Rakeen turns
  // this on for a restaurant, hence it lives here and nowhere else.
  kitchen_display_enabled: (v) => typeof v === "boolean",
  // Same admin-only pattern (20260814060000) — the owner never sees a
  // self-serve toggle for this in Settings.
  inventory_enabled: (v) => typeof v === "boolean",
  // loyalty_enabled DOES also have a self-serve toggle in the owner's own
  // Settings screen — this just gives admin a shortcut to the same column,
  // e.g. to shut it off on a lower-tier package regardless of what the
  // owner has it set to.
  loyalty_enabled: (v) => typeof v === "boolean",
  // Self-serve signups (20260814030000) create a fully live business with
  // zero review — this is the only gate. New signups start 'pending'
  // (20260818160000); submit_online_order blocks real customer orders until
  // an admin flips this to 'verified'. Never self-serve.
  verification_status: (v) => typeof v === "string" && ["pending", "verified", "rejected"].includes(v),

  // Design fields — same columns the owner already edits from their own
  // Settings/loyalty screens (see rakeen-dashboard.js); admin gets a
  // parallel editor for the same data, e.g. to help set up a restaurant's
  // branding for them. Image URLs are set via the separate branding-upload
  // route below (POST), not this PATCH — here they're only ever nulled out
  // (a "remove image" action), never hand-typed.
  logo_url: (v) => v === null,
  online_banner_url: (v) => v === null,
  loyalty_logo_url: (v) => v === null,
  loyalty_banner_url: (v) => v === null,
  loyalty_custom_icon_url: (v) => v === null,
  online_theme_color: (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v),
  loyalty_accent_color: (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v),
  loyalty_theme: (v) => typeof v === "string" && ["classic", "minimal", "bold"].includes(v),
  loyalty_pattern_style: (v) =>
    typeof v === "string" && ["none", "dots", "diagonal", "waves", "grid", "chevron", "rings", "icons"].includes(v),
  loyalty_icon_style: (v) =>
    typeof v === "string" &&
    ["generic", "coffee", "burger", "pizza", "pastry", "dessert", "car", "pet", "salon", "gym", "retail", "padel", "sports", "spa", "clinic", "custom"].includes(
      v
    ),
};

function getAdminClients(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) } as const;
  }
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) } as const;
  }
  return { supabaseUrl, anonKey, serviceRoleKey, token } as const;
}

// Real usage signal for the admin detail drawer — total orders, when the
// business was last active, and actual branch/staff counts (vs. the limits
// set on the business row) — so admin can tell a genuinely active
// restaurant from an abandoned trial signup at a glance.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clients = getAdminClients(request);
  if ("error" in clients) return clients.error;
  const { supabaseUrl, anonKey, serviceRoleKey, token } = clients;

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

  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const [ordersCount, lastOrder, branchCount, staffCount, ownerProfile, designRow] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    admin.from("orders").select("created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("branches").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .in("user_type", ["manager", "employee"])
      .is("branch_id", null),
    admin.from("profiles").select("id").eq("business_id", businessId).eq("user_type", "owner").maybeSingle(),
    admin
      .from("businesses")
      .select(
        "logo_url, online_theme_color, online_banner_url, loyalty_logo_url, loyalty_banner_url, loyalty_accent_color, loyalty_pattern_style, loyalty_theme, loyalty_icon_style, loyalty_custom_icon_url"
      )
      .eq("id", businessId)
      .maybeSingle(),
  ]);

  let ownerEmail: string | null = null;
  const ownerId = ownerProfile.data?.id as string | undefined;
  if (ownerId) {
    const { data: ownerUser } = await admin.auth.admin.getUserById(ownerId);
    ownerEmail = ownerUser?.user?.email ?? null;
  }

  return NextResponse.json({
    orders_count: ordersCount.count ?? 0,
    last_order_at: lastOrder.data?.created_at ?? null,
    owner_id: ownerId ?? null,
    owner_email: ownerEmail,
    branch_count: branchCount.count ?? 0,
    staff_count: staffCount.count ?? 0,
    ...(designRow.data || {}),
  });
}

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
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    const validate = FIELD_VALIDATORS[key];
    if (validate && validate(body[key])) {
      updates[key] = body[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "لا يوجد تعديل صالح" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const { error } = await admin.from("businesses").update(updates).eq("id", businessId);
  if (error) {
    await logAdminAction(admin, caller.email || "unknown", "update_business", `business:${businessId}`, "failure", {
      fields: Object.keys(updates),
      reason: error.message,
    });
    return NextResponse.json({ error: "تعذر التحديث" }, { status: 500 });
  }

  await logAdminAction(admin, caller.email || "unknown", "update_business", `business:${businessId}`, "success", {
    fields: Object.keys(updates),
  });
  return NextResponse.json({ ok: true });
}

// Permanent deletion of a business and every row scoped to it (see
// supabase/migrations/20260814050000_delete_business_completely.sql for the
// full cascade). Irreversible, so this requires the caller to echo the
// business's exact current name back as `confirm_name` — a server-side
// backstop behind the UI's own type-to-confirm step, so a scripted or
// mistaken call can't nuke the wrong business by id alone.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clients = getAdminClients(request);
  if ("error" in clients) return clients.error;
  const { supabaseUrl, anonKey, serviceRoleKey, token } = clients;

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

  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const confirmName = typeof body.confirm_name === "string" ? body.confirm_name.trim() : "";

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: business, error: fetchError } = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle();
  if (fetchError || !business) {
    return NextResponse.json({ error: "المطعم غير موجود" }, { status: 404 });
  }
  if (confirmName !== business.name) {
    await logAdminAction(admin, caller.email || "unknown", "delete_business", `business:${businessId}`, "failure", {
      reason: "confirm_name mismatch",
    });
    return NextResponse.json({ error: "الاسم المكتوب لا يطابق اسم المطعم — الحذف ملغي" }, { status: 400 });
  }

  const { data: profiles } = await admin.from("profiles").select("id").eq("business_id", businessId);
  const profileIds = (profiles || []).map((p) => p.id as string);

  const { error: deleteError } = await admin.rpc("delete_business_completely", { p_business_id: businessId });
  if (deleteError) {
    await logAdminAction(admin, caller.email || "unknown", "delete_business", `business:${businessId}`, "failure", {
      reason: deleteError.message,
    });
    return NextResponse.json({ error: "تعذر الحذف" }, { status: 500 });
  }

  await Promise.all(profileIds.map((uid) => admin.auth.admin.deleteUser(uid).catch(() => {})));

  await logAdminAction(admin, caller.email || "unknown", "delete_business", `business:${businessId}`, "success", {
    deleted_name: business.name,
  });
  return NextResponse.json({ ok: true, deleted_name: business.name });
}
