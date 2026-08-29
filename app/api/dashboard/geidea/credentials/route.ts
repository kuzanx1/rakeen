import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { createGeideaSession, encryptSecret } from "@/lib/geidea";

// Connecting a Geidea merchant account hands Rakeen a real, recoverable
// payment secret — same bar as changing the manager PIN or linking
// WhatsApp, so owner/manager only. Copies authorizeOwnerOrManager() from
// app/api/dashboard/whatsapp-link/request-otp/route.ts, the only existing
// precedent for a server route writing a business's own secret.
async function authorizeOwnerOrManager(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) } as const;
  }
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) } as const;

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) return { error: NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 }) } as const;

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin.from("profiles").select("id, business_id, user_type").eq("id", caller.id).single();
  if (!profile || !["owner", "manager"].includes(profile.user_type)) {
    return { error: NextResponse.json({ error: "لأصحاب المطعم والمدراء فقط" }, { status: 403 }) } as const;
  }
  return { admin, businessId: profile.business_id } as const;
}

// Validates the entered credentials by attempting one real, nominal
// (1.00 SAR) Create-Session call before anything is persisted — Geidea
// doesn't expose a dedicated "verify credentials" endpoint, so a rejected
// session (bad key/password) is the signal that nothing should be saved.
export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerOrManager(request);
  if ("error" in auth) return auth.error;
  const { admin, businessId } = auth;

  if (!(await checkRateLimit(request, "RL_PAYMENT", String(businessId)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_PAYMENT", 10, 60, String(businessId)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const merchantPublicKey = typeof body?.merchant_public_key === "string" ? body.merchant_public_key.trim() : "";
  const apiPassword = typeof body?.api_password === "string" ? body.api_password.trim() : "";
  if (!merchantPublicKey || !apiPassword) {
    return NextResponse.json({ error: "أدخل مفتاح ركين ورقم الاشتراك السري" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const testResult = await createGeideaSession({
    merchantPublicKey,
    apiPassword,
    amount: 1.0,
    currency: "SAR",
    merchantReferenceId: `verify-${businessId}-${Date.now()}`,
    callbackUrl: `${origin}/api/webhooks/geidea`,
    returnUrl: `${origin}/`,
    language: "ar",
  });
  if (!testResult.ok) {
    console.error("geidea credentials: verification session rejected", { businessId, error: testResult.error });
    return NextResponse.json({ error: "تعذر التحقق من البيانات — تأكد من صحة المفتاح ورقم الاشتراك" }, { status: 400 });
  }

  const { ciphertext, iv } = await encryptSecret(apiPassword);
  const last4 = merchantPublicKey.slice(-4);

  const { error: upsertError } = await admin.from("business_payment_gateways").upsert(
    {
      business_id: businessId, provider: "geidea",
      merchant_public_key: merchantPublicKey,
      api_password_ciphertext: ciphertext, api_password_iv: iv,
      connected: true, updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,provider" }
  );
  if (upsertError) {
    console.error("geidea credentials: upsert failed", upsertError);
    return NextResponse.json({ error: "تعذر حفظ البيانات" }, { status: 500 });
  }

  await admin.from("businesses").update({ geidea_connected: true, geidea_public_key_last4: last4 }).eq("id", businessId);

  return NextResponse.json({ ok: true, last4 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeOwnerOrManager(request);
  if ("error" in auth) return auth.error;
  const { admin, businessId } = auth;

  await admin.from("business_payment_gateways").delete().eq("business_id", businessId).eq("provider", "geidea");
  await admin.from("businesses").update({ geidea_connected: false, geidea_public_key_last4: null }).eq("id", businessId);

  return NextResponse.json({ ok: true });
}
