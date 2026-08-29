import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Creates a pending loyalty-redemption request the customer confirms
// themselves on their own loyalty-card page (see get_pending_loyalty_request/
// respond_loyalty_redemption_request) — the cashier never sees or re-enters
// a code. Push is fired best-effort purely as a "check your card" nudge; a
// missing/failed subscription is never an error here, unlike the old
// send-loyalty-code route this replaces. Auth pattern matches app/api/send-push.
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

  const { customerId } = await request.json();
  if (!customerId) {
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

  const { data: customer } = await admin.from("customers").select("id, business_id").eq("id", customerId).single();
  if (!customer || customer.business_id !== callerProfile.business_id) {
    return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
  }

  // Previously completely unprotected. 20/60s covers a genuinely busy
  // register (many customers redeeming back to back) while stopping a
  // script from spamming push nudges to one customer or flooding
  // loyalty_redemption_requests.
  if (!(await checkDbRateLimit(admin, request, "RL_LOYALTY_REDEEM", 20, 60, String(callerProfile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  // no stacking — a fresh request supersedes whatever the cashier may have
  // started (and abandoned) a moment ago
  await admin.from("loyalty_redemption_requests")
    .update({ status: "expired" })
    .eq("customer_id", customerId)
    .eq("status", "pending");

  const { data: created, error: insertError } = await admin.from("loyalty_redemption_requests").insert({
    customer_id: customerId,
    business_id: customer.business_id,
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  }).select("id").single();
  if (insertError || !created) {
    return NextResponse.json({ error: "تعذر إنشاء طلب الاستبدال" }, { status: 500 });
  }

  // best-effort push nudge — never blocks or fails the request itself
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublicKey && vapidPrivateKey) {
    try {
      const { data: subscriptions } = await admin
        .from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("customer_id", customerId);
      if (subscriptions && subscriptions.length > 0) {
        ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
        const payload = JSON.stringify({
          title: "طلب دفع بنقاط الولاء",
          body: "افتح بطاقة الولاء عشان تأكد العملية",
          url: "/",
        });
        await Promise.all(subscriptions.map((sub) => sendPushToSubscription(sub, payload, admin)));
      }
    } catch {
      // swallow — the customer's own card page polling is the real mechanism
    }
  }

  return NextResponse.json({ ok: true, requestId: created.id });
}
