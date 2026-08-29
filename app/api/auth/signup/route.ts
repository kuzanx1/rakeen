import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Self-serve restaurant signup — the only account-creation route in the app
// with no caller auth at all (mirrors create-team-member's admin.createUser
// pattern, minus the "verify caller is owner/manager" step, since there's
// no existing account yet). Deliberately sends NO business_id in
// user_metadata — handle_new_auth_user() then takes the "new business"
// branch: creates the business, a default branch, an owner profile, and
// (as of 20260814030000) auto-enables online ordering with a starter slug,
// so the new owner can open their storefront immediately with zero Rakeen
// involvement. The first 350 online orders are free (online_order_free_count
// on businesses); after that submit_online_order rejects new orders until
// online_subscribed is flipped — there's no live payment gateway yet, so
// that's a manual step today, not automated here.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const { businessName, fullName, email, phone, password, businessType } = await request.json();
  const emailKey = typeof email === "string" ? email.toLowerCase() : undefined;

  // Cloudflare edge layer (per-location, best-effort — kept as defense in
  // depth) plus the DB layer (single global counter, the layer that
  // actually enforces regardless of which Cloudflare location the request
  // lands on). Same dual IP+identity keying as before.
  if (!(await checkRateLimit(request, "RL_AUTH", emailKey))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_AUTH", 5, 60, emailKey))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  if (!businessName || typeof businessName !== "string" || !businessName.trim()) {
    return NextResponse.json({ error: "اكتب اسم المنشأة" }, { status: 400 });
  }
  const allowedTypes = [
    "restaurant", "quick_service", "cafe", "cloud_kitchen",
    "salon", "ladies_salon", "car_wash", "mobile_car_wash",
    "clinic", "tailoring", "hotel", "retail", "other",
  ];
  const safeBusinessType = typeof businessType === "string" && allowedTypes.includes(businessType) ? businessType : "restaurant";
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    return NextResponse.json({ error: "اكتب اسمك" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "كلمة المرور لازم تكون ٦ أحرف أو أكثر" }, { status: 400 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      business_name: businessName.trim(),
      full_name: fullName.trim(),
      phone: typeof phone === "string" ? phone.trim() : null,
      business_type: safeBusinessType,
    },
  });
  if (createError || !created.user) {
    const msg = (createError?.message || "").toLowerCase().includes("already")
      ? "فيه حساب مسجّل بهذا البريد من قبل"
      : createError?.message || "تعذر إنشاء الحساب";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // quick_service/cafe/cloud_kitchen are business_type='restaurant' under
  // the hood at the code level (no POS/dashboard branches on these three at
  // all) — the only thing that actually differs is these two settings,
  // defaulted off here so the new owner's POS doesn't show a dining-room
  // workflow they don't have. handle_new_auth_user() already ran
  // synchronously as part of createUser() above, so the business row exists.
  if (["quick_service", "cafe", "cloud_kitchen"].includes(safeBusinessType)) {
    const { data: profile } = await admin.from("profiles").select("business_id").eq("id", created.user.id).single();
    if (profile?.business_id) {
      await admin
        .from("businesses")
        .update({ dine_in_enabled: false, tables_reservations_enabled: false })
        .eq("id", profile.business_id);
    }
  }

  return NextResponse.json({ ok: true });
}
