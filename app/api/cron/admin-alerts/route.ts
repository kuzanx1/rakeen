import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { Alert, collectAdminAlerts, GROUP_TITLE, riyadhToday } from "@/lib/adminAlerts";

// تنبيهات جوال الإدارة. يشتغل كل يوم ٨ الصبح بتوقيت الرياض (worker-entrypoint.js،
// "0 5 * * *" مع compliance-check). يرسل لكل أجهزة admin_push_subscriptions:
//
//   ١. اشتراك مطعم باقي له ٥ أيام أو أقل (businesses.subscription_expires_at)، ولما يخلص.
//   ٢. دفعة عقد مستحقة خلال ٥ أيام، ولما تتأخر (contract_payments: due/rejected).
//   ٣. استهلاك التجربة: مطعم غير مشترك وصل ٨٠٪ من الطلبات المجانية، ولما يخلّصها.
//   ٤. استهلاك البنية التحتية (lib/usage.ts): ٧٠٪ ثم ٩٠٪ ثم ١٠٠٪ من أي حد.
//
// كل تنبيه يطلع مرة وحدة: المفاتيح المرسلة محفوظة في platform_settings
// (key "admin_alerts_sent") مع تاريخ الإرسال، وتنحذف بعد ١٢٠ يوم. لو تغيّر
// تاريخ الانتهاء أو الحد، المفتاح يتغيّر فيرجع التنبيه للدورة الجديدة.
// يحلّ محل usage-check الأسبوعي اللي كان يعيد نفس التحذير كل اثنين.

const KEEP_DAYS = 120;
const SENT_KEY = "admin_alerts_sent";

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
  const today = riyadhToday();
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const { data: sentRow } = await admin.from("platform_settings").select("value").eq("key", SENT_KEY).maybeSingle();
  const sent: Record<string, string> = { ...((sentRow?.value as Record<string, string> | null) || {}) };

  const all = await collectAdminAlerts(admin, today);
  // خطوة استهلاك أعلى تغني عن الأقل: لو وصل ٩٠٪ وما أرسلنا ٧٠٪، يكفي ٩٠٪.
  const fresh = all.filter((a) => !sent[a.key]);
  if (dry) return NextResponse.json({ ok: true, today, total: all.length, fresh });
  if (fresh.length === 0) return NextResponse.json({ ok: true, pushed: 0, total: all.length });

  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
  const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs || subs.length === 0) {
    // ما فيه جهاز مفعّل: لا نعلّمها مرسلة، عشان تطلع أول ما يفعّل الإشعارات.
    return NextResponse.json({ ok: true, pushed: 0, pending: fresh.length, note: "no admin devices" });
  }

  // إشعار واحد لكل نوع (مو إشعار لكل مطعم)، والتفاصيل سطور.
  const groups = new Map<Alert["group"], Alert[]>();
  for (const a of fresh) groups.set(a.group, [...(groups.get(a.group) || []), a]);
  let pushed = 0;
  for (const [group, list] of groups) {
    const title = list.length === 1 ? `⚠️ ${list[0].title}` : `⚠️ ${GROUP_TITLE[group]} (${list.length})`;
    const body = list.map((a) => a.line).join("\n").slice(0, 400);
    const payload = JSON.stringify({ title, body, url: "/admin" });
    const results = await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin, "admin_push_subscriptions")));
    if (results.some(Boolean)) {
      pushed += 1;
      for (const a of list) sent[a.key] = today;
    }
  }

  const cutoff = new Date(Date.parse(today + "T00:00:00Z") - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  for (const [k, d] of Object.entries(sent)) if (d < cutoff) delete sent[k];
  await admin.from("platform_settings").upsert({ key: SENT_KEY, value: sent, updated_at: new Date().toISOString(), updated_by: "cron" });

  return NextResponse.json({ ok: true, pushed, alerts: fresh.length });
}
