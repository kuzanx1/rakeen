import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Sends a real Web Push notification (free — VAPID, no paid service) to a
// customer's saved loyalty-card subscriptions. Called from the POS right
// after a checkout that earned/spent points. Caller must be a real signed-in
// profile (the branch POS account or a dashboard user) whose business owns
// the target customer — this isn't public, unlike get_loyalty_card.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const { customerId, title, body } = await request.json();
  if (!customerId || !title || typeof title !== "string" || title.length > 60 || (body && (typeof body !== "string" || body.length > 150))) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) {
    return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile } = await admin.from("profiles").select("business_id").eq("id", caller.id).single();
  if (!callerProfile) {
    return NextResponse.json({ error: "الحساب غير موجود" }, { status: 403 });
  }

  if (!(await checkRateLimit(request, "RL_PUSH", String(callerProfile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_PUSH", 20, 60, String(callerProfile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: customer } = await admin.from("customers").select("id, business_id").eq("id", customerId).single();
  if (!customer || customer.business_id !== callerProfile.business_id) {
    return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
  }

  const { data: subscriptions } = await admin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("customer_id", customerId);

  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);

  const payload = JSON.stringify({ title, body, url: "/" });
  const results = await Promise.all(
    (subscriptions || []).map((sub) => sendPushToSubscription(sub, payload, admin))
  );

  return NextResponse.json({ ok: true, sent: results.filter(Boolean).length, total: results.length });
}
