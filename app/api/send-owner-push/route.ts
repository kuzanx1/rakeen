import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Sends real, free Web Push alerts to the restaurant owner/manager's own
// installed dashboard (new order, refund/cancel, low stock, sales target) —
// separate from the customer loyalty push (send-push) and the broadcast
// (send-loyalty-broadcast) routes, which target customers, not staff.
// Whether it actually fires is decided server-side from the business's own
// saved preference, not trusted from the caller — a POS device firing this
// after every checkout shouldn't spam once the owner disables the toggle.
const NOTIFY_FLAG_COLUMN: Record<string, string> = {
  new_order: "notify_new_order",
  refund_cancel: "notify_refund_cancel",
  low_stock: "notify_low_stock",
  sales_target: "notify_sales_target",
};

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

  const { type, title, body } = await request.json();
  const flagColumn = NOTIFY_FLAG_COLUMN[type];
  if (!flagColumn || !title || typeof title !== "string" || title.length > 60 || (body && (typeof body !== "string" || body.length > 150))) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
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

  const { data: business } = await admin.from("businesses").select(flagColumn).eq("id", callerProfile.business_id).single();
  if (!business || !(business as unknown as Record<string, unknown>)[flagColumn]) {
    return NextResponse.json({ ok: true, sent: 0, skipped: true });
  }

  const { data: subscriptions } = await admin
    .from("owner_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("business_id", callerProfile.business_id);

  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({ title, body: body || "", url: "/dashboard" });
  const results = await Promise.all(
    (subscriptions || []).map((sub) => sendPushToSubscription(sub, payload, admin, "owner_push_subscriptions"))
  );

  return NextResponse.json({ ok: true, sent: results.filter(Boolean).length, total: results.length });
}
