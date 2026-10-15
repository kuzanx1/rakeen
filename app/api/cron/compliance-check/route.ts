import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";

// Fired daily by the Worker's Cron Trigger (worker-entrypoint.js's scheduled()
// handler, "0 5 * * *" = 08:00 Asia/Riyadh). Two jobs:
//
//  1. Recompute every compliance_items.status from expiry_date /
//     reminder_days_before, via the check_compliance_expiries() Postgres
//     function, so the HR screen's badges stay accurate day to day.
//  2. Push a free Web Push alert to the owner's installed dashboard for any
//     document that has just crossed into "قارب على الانتهاء" or "منتهي" —
//     gated by the business's notify_document_expiry flag and each document's
//     own reminder_enabled toggle. reminder_sent_status makes it fire once per
//     transition, never daily.
//
// Auth is the same shared-secret header as /api/cron/daily-report; never
// called by a real user session. Purely internal — expiry dates are typed by
// the merchant, never a live GOSI/Muqeem lookup (see
// supabase/migrations/20260903040000_hr_employees_departments_compliance.sql).

const TYPE_LABELS: Record<string, string> = {
  iqama: "إقامة",
  contract: "عقد عمل",
  health_cert: "شهادة صحية",
  insurance: "تأمين طبي",
  other: "وثيقة",
};

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await admin.rpc("check_compliance_expiries");
  if (error) {
    console.error("compliance-check: check_compliance_expiries failed", error);
    return NextResponse.json({ error: "check failed", details: error.message }, { status: 500 });
  }

  // --- expiry reminders -------------------------------------------------
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) {
    // status recompute still succeeded — just can't push without VAPID keys
    return NextResponse.json({ ok: true, pushed: 0, note: "vapid not configured" });
  }

  // Documents that just crossed a threshold and haven't been notified for this
  // status yet. reminder_sent_status is cleared by the SQL function when a doc
  // is renewed, so this naturally re-fires on the next expiry cycle.
  const { data: due, error: dueErr } = await admin
    .from("compliance_items")
    .select("id, business_id, employee_id, document_type, expiry_date, status, reminder_sent_status, reminder_enabled, employees(full_name)")
    .in("status", ["expiring_soon", "expired"])
    .eq("reminder_enabled", true);
  if (dueErr) {
    console.error("compliance-check: due query failed", dueErr);
    return NextResponse.json({ ok: true, statusRecomputed: true, pushed: 0, note: "due query failed" });
  }

  const pending = (due || []).filter((it) => it.reminder_sent_status !== it.status);
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, statusRecomputed: true, pushed: 0 });
  }

  // Only businesses that haven't switched the master toggle off.
  const businessIds = [...new Set(pending.map((it) => it.business_id))];
  const { data: optedIn } = await admin
    .from("businesses")
    .select("id")
    .in("id", businessIds)
    .eq("notify_document_expiry", true);
  const optedInIds = new Set((optedIn || []).map((b) => b.id));

  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
  let pushed = 0;
  const notifiedItemIds: number[] = [];

  for (const bizId of businessIds) {
    if (!optedInIds.has(bizId)) continue;
    const items = pending.filter((it) => it.business_id === bizId);

    const { data: subs } = await admin
      .from("owner_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("business_id", bizId);
    if (!subs || subs.length === 0) continue; // no device to notify — leave unmarked, retry tomorrow

    let title: string;
    let body: string;
    if (items.length === 1) {
      const it = items[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (it.employees as any)?.full_name || "موظف";
      const label = TYPE_LABELS[it.document_type] || "وثيقة";
      title = it.status === "expired" ? "⚠️ وثيقة منتهية" : "⏳ وثيقة قاربت على الانتهاء";
      body = `${label} ${name} — ${it.status === "expired" ? "انتهت" : "تنتهي"} بتاريخ ${it.expiry_date}`;
    } else {
      const expiredCount = items.filter((it) => it.status === "expired").length;
      const soonCount = items.length - expiredCount;
      title = "تنبيه وثائق الموظفين";
      body = [
        expiredCount ? `${expiredCount} منتهية` : "",
        soonCount ? `${soonCount} قاربت على الانتهاء` : "",
      ].filter(Boolean).join(" و") + " — افتح شاشة الموارد البشرية";
    }

    const payload = JSON.stringify({ title, body: body.slice(0, 180), url: "/dashboard" });
    const results = await Promise.all(
      subs.map((sub) => sendPushToSubscription(sub, payload, admin, "owner_push_subscriptions"))
    );
    if (results.some(Boolean)) {
      pushed += results.filter(Boolean).length;
      notifiedItemIds.push(...items.map((it) => it.id));
    }
  }

  if (notifiedItemIds.length > 0) {
    // Mark per current status so a later valid -> expiring_soon -> expired
    // progression still produces a second push.
    for (const status of ["expiring_soon", "expired"]) {
      const ids = pending
        .filter((it) => it.status === status && notifiedItemIds.includes(it.id))
        .map((it) => it.id);
      if (ids.length === 0) continue;
      await admin.from("compliance_items").update({ reminder_sent_status: status }).in("id", ids);
    }
  }

  return NextResponse.json({ ok: true, statusRecomputed: true, pushed, documents: notifiedItemIds.length });
}
