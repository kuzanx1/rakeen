import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Sends the same push notification to every customer of the caller's business
// who has opted into loyalty-card notifications (i.e. has a row in
// push_subscriptions) — used for owner-driven broadcasts like "20% off
// today". GET returns just the subscriber count so the dashboard can show it
// before the owner commits to sending. Gated to owner/manager or an employee
// explicitly granted screen:loyalty — same bar as the branding upload.
async function authorizeCaller(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) } as const;
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) } as const;
  }

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) {
    return { error: NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 }) } as const;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin.from("profiles").select("id, business_id, user_type").eq("id", caller.id).single();
  if (!profile) {
    return { error: NextResponse.json({ error: "الحساب غير موجود" }, { status: 403 }) } as const;
  }

  if (!["owner", "manager"].includes(profile.user_type)) {
    const { data: perm } = await admin
      .from("user_permissions").select("permission_key").eq("user_id", profile.id).eq("permission_key", "screen:loyalty").maybeSingle();
    if (!perm) {
      return { error: NextResponse.json({ error: "ما عندك صلاحية على شاشة الولاء" }, { status: 403 }) } as const;
    }
  }

  return { admin, businessId: profile.business_id } as const;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeCaller(request);
  if ("error" in auth) return auth.error;
  const { admin, businessId } = auth;

  const { count } = await admin
    .from("push_subscriptions")
    .select("id, customers!inner(business_id)", { count: "exact", head: true })
    .eq("customers.business_id", businessId);

  return NextResponse.json({ count: count || 0 });
}

export async function POST(request: NextRequest) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const auth = await authorizeCaller(request);
  if ("error" in auth) return auth.error;
  const { admin, businessId } = auth;

  // Previously completely unprotected — this mass-messages every real,
  // opted-in customer of the business in one call, the highest real-world
  // abuse potential (spam) of anything that had no limit at all. 3/hour is
  // generous for a genuine "today's offer" broadcast pattern and a hard
  // stop against a compromised/malicious staff session blasting messages.
  if (!(await checkDbRateLimit(admin, request, "RL_BROADCAST", 3, 3600, String(businessId)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { title, body } = await request.json();
  if (!title || typeof title !== "string" || title.length > 60 || (body && (typeof body !== "string" || body.length > 150))) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, customers!inner(business_id)")
    .eq("customers.business_id", businessId);

  ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({ title, body: body || "", url: "/" });
  const results = await Promise.all(
    (subscriptions || []).map((sub) => sendPushToSubscription(sub, payload, admin))
  );

  return NextResponse.json({ ok: true, sent: results.filter(Boolean).length, total: results.length });
}
