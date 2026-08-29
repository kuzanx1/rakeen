import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

// Same bucket/path convention the owner's own Settings screen already uses
// (rakeen-dashboard.js) — `{business_id}/{purpose}-{timestamp}.{ext}` — so a
// design admin uploads here reads back correctly everywhere the storefront
// and loyalty card already expect these URLs to look like.
const FIELD_TO_UPLOAD: Record<string, { bucket: string; prefix: string }> = {
  logo_url: { bucket: "business-branding", prefix: "logo" },
  online_banner_url: { bucket: "business-branding", prefix: "online-banner" },
  loyalty_logo_url: { bucket: "loyalty-branding", prefix: "logo" },
  loyalty_banner_url: { bucket: "loyalty-branding", prefix: "banner" },
  loyalty_custom_icon_url: { bucket: "loyalty-branding", prefix: "custom-icon" },
};

// Uploads a new logo/banner/icon image for a business's storefront or
// loyalty card, directly from the admin console — lets Rakeen set up or fix
// a restaurant's branding without needing the owner to do it themselves.
// One request does both the Storage upload and the businesses column write
// so the UI only needs a single "pick file" action per image.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const formData = await request.formData().catch(() => null);
  const field = formData?.get("field");
  const file = formData?.get("file");
  if (typeof field !== "string" || !FIELD_TO_UPLOAD[field]) {
    return NextResponse.json({ error: "حقل غير صالح" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "لم يتم اختيار ملف" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "لازم يكون الملف صورة" }, { status: 400 });
  }

  const { bucket, prefix } = FIELD_TO_UPLOAD[field];
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${businessId}/${prefix}-${Date.now()}.${ext}`;

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { error: uploadError } = await admin.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
  const { error: updateError } = await admin
    .from("businesses")
    .update({ [field]: pub.publicUrl })
    .eq("id", businessId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
