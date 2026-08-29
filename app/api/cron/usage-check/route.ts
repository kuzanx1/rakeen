import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { computeUsageReport } from "@/lib/usage";

// Fired weekly by the Worker's Cron Trigger (worker-entrypoint.js's
// scheduled() handler) — same shared-secret auth as the win-back cron.
// Exists because the account already blew through Supabase's free Cached
// Egress quota once (fixed by moving images to R2) without anyone noticing
// until the grace-period email arrived. This checks the metrics that are
// still real risks going forward and pushes the admin a warning at 70% of
// each free-tier limit — before it becomes a bill, not after.
//
// Metric math lives in lib/usage.ts, shared with the live admin panel view
// (app/api/admin/usage) so the two never drift.
//
// Supabase Cached Egress itself isn't included: Supabase doesn't expose it
// through the client API or a public REST endpoint, only through the
// dashboard or a Management API personal access token this project doesn't
// have. It's a much smaller risk now that Storage serves no real traffic,
// but if that access token ever gets added, this is where that check
// belongs.

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

  const { metrics, warnings } = await computeUsageReport(admin);
  const report = Object.fromEntries(metrics.map((m) => [m.key, m.used]));

  if (warnings.length === 0) {
    return NextResponse.json({ ok: true, warnings: 0, report });
  }

  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
  const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
  if (subs && subs.length > 0) {
    const payload = JSON.stringify({
      title: "⚠️ تنبيه استهلاك البنية التحتية",
      body: warnings.join(" | ").slice(0, 180),
      url: "/admin",
    });
    await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin, "admin_push_subscriptions")));
  }

  return NextResponse.json({ ok: true, warnings: warnings.length, details: warnings, report });
}
