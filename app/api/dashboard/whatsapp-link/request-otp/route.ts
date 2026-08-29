import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Linking a WhatsApp number grants read access to today's sales/orders/
// inventory over WhatsApp — the same bar as changing the manager PIN, so
// this is owner/manager only, no employee-permission override.
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

// Generates the code and stops — nothing gets sent from here. The owner
// sends THIS code TO Rakeen's WhatsApp number themselves (see Settings UI);
// the webhook (app/api/webhooks/whatsapp) matches it on the way in and
// completes the link there. That keeps this whole flow a reply, never a
// business-initiated message — free, and no phone number to type/validate
// up front (we learn it from whichever number actually sends the code).
export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerOrManager(request);
  if ("error" in auth) return auth.error;
  const { admin, businessId } = auth;

  if (!(await checkRateLimit(request, "RL_AUTH", String(businessId)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_AUTH", 5, 60, String(businessId)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  // crypto.getRandomValues, not Math.random() — this code is the sole
  // credential that authorizes taking over a business's WhatsApp-linked
  // control panel (see the webhook's OTP match), so it needs real entropy.
  const otpBytes = new Uint32Array(1);
  crypto.getRandomValues(otpBytes);
  const otp = String(100000 + (otpBytes[0] % 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await admin.from("businesses").update({
    whatsapp_link_verified: false,
    whatsapp_link_otp: otp,
    whatsapp_link_otp_expires_at: expiresAt,
  }).eq("id", businessId);

  return NextResponse.json({ ok: true, code: otp });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeOwnerOrManager(request);
  if ("error" in auth) return auth.error;
  const { admin, businessId } = auth;

  await admin.from("businesses").update({
    whatsapp_link_phone: null, whatsapp_link_verified: false, whatsapp_link_otp: null, whatsapp_link_otp_expires_at: null,
  }).eq("id", businessId);

  return NextResponse.json({ ok: true });
}
