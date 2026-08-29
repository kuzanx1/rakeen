import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";

// Fired by the Worker's Cron Trigger (worker-entrypoint.js's scheduled()
// handler), never by a real user — so auth here is a shared secret header,
// not a Supabase session. "خلي بدون أي متابعة يدوية" (no manual follow-up)
// is the whole point: an owner just flips notify_win_back on once in
// Settings and this runs itself from then on.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);

  const { data: targets, error } = await admin.rpc("get_win_back_targets");
  if (error) {
    console.error("win-back: get_win_back_targets failed", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ ok: true, customers: 0, sent: 0 });
  }

  let sentCount = 0;
  for (const target of targets as { customer_id: number; business_name: string; win_back_message: string }[]) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("customer_id", target.customer_id);
    if (!subs || subs.length === 0) continue;

    const payload = JSON.stringify({ title: target.business_name, body: target.win_back_message, url: "/" });
    const results = await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin)));
    if (results.some(Boolean)) {
      sentCount++;
      await admin.from("customers").update({ last_win_back_sent_at: new Date().toISOString() }).eq("id", target.customer_id);
    }
  }

  return NextResponse.json({ ok: true, customers: targets.length, sent: sentCount });
}
