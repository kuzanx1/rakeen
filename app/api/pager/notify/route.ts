import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { pagerChannel, uuidToKey } from "@/lib/pager";

/**
 * بيجر ركين -- أزرار الكاشير كلُّها من هنا.
 *
 *   ready      «جاهز»: يُسجَّل الطلب جاهزاً، ويرن جوال الزبون.
 *   ring       «رنّ مرة ثانية»: لجاهزٍ لم يُستلم.
 *   delay      «+٥ دقايق»: يمدّ الوعد ويقول للزبون إننا تأخرنا.
 *   collected  «تم الاستلام»: ينتهي البيجر، والصفحة تقول «بالعافية».
 *
 * مسارٌ واحد يناديه كاشيرُ الويب والتطبيقُ وشاشةُ المطبخ -- لا نسخةٌ
 * لكلٍّ منهم: الكتابةُ بجلسة الكاشير نفسها (الصلاحيةُ والمنشأةُ في
 * الدوال)، والبثُّ والإشعارُ بمفتاح الخدمة.
 *
 * والبثُّ لحظيٌّ لصفحةٍ مفتوحة، والإشعارُ لجوالٍ مقفول. يُرسَلان معاً:
 * لا يُعرف أيُّهما سيصل.
 */
type Action = "ready" | "ring" | "delay" | "collected";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let orderId = 0;
  let action: Action = "ready";
  let minutes = 5;
  try {
    const body = (await request.json()) as { orderId?: number; action?: string; minutes?: number };
    orderId = Number(body?.orderId) || 0;
    if (body?.action === "ring" || body?.action === "delay" || body?.action === "collected") action = body.action;
    minutes = Math.max(1, Math.min(30, Math.round(Number(body?.minutes) || 5)));
  } catch { /* جسمٌ ناقص */ }
  if (!orderId) return NextResponse.json({ error: "لا يوجد طلب" }, { status: 400 });

  const asCashier = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

  if (action === "ready" || action === "collected") {
    // مكرّرةٌ بلا ضرر: الدالّة لا تمسّ طلباً جاهزاً.
    const { error } = await asCashier.rpc("mark_order_ready", { p_order_id: orderId });
    if (error) return fail(error.message.includes("authorized") ? "هذا الحساب ما عنده صلاحية الكاشير" : "تعذر تسجيل الطلب جاهز", 403);
  }
  if (action === "collected") {
    const { error } = await asCashier.rpc("mark_order_delivered", { p_order_id: orderId });
    if (error) return fail("تعذر تسجيل الاستلام");
  }
  if (action === "ring") {
    const { error } = await asCashier.rpc("pager_ring", { p_order_id: orderId });
    if (error) return fail(error.message || "تعذر الرنين");
  }
  if (action === "delay") {
    const { error } = await asCashier.rpc("pager_bump_eta", { p_order_id: orderId, p_minutes: minutes });
    if (error) return fail(error.message || "تعذر التأجيل");
  }

  const { data: order } = await asCashier
    .from("orders")
    .select("id, client_order_uuid, ready_at, delivered_at, pager_eta_at, pager_delayed_at, pager_ring_count, pager_seen_at")
    .eq("id", orderId)
    .maybeSingle();
  // طلبٌ بلا بيجر (المطبخ ينادي هذا المسار لكل «جاهز»): سُجّل، ولا أحد ينتظر بثّاً.
  if (!order?.client_order_uuid || !order.pager_eta_at) return NextResponse.json({ ok: true, order: null, pushed: 0 });

  const uuid = String(order.client_order_uuid);
  const admin = serviceClient();
  let pushed = 0;
  let subscribed = 0;
  if (admin) {
    const payload = {
      action,
      ready_at: order.ready_at,
      delivered_at: order.delivered_at,
      eta_at: order.pager_eta_at,
      delayed_at: order.pager_delayed_at,
      ring_count: order.pager_ring_count,
    };
    const broadcast = admin.channel(pagerChannel(uuid))
      .send({ type: "broadcast", event: "pager", payload })
      .catch(err => console.error("pager broadcast failed", err));

    const { data: subs } = await admin
      .from("pager_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("order_key", uuid);
    subscribed = subs?.length || 0;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (subscribed && vapidPublicKey && vapidPrivateKey && (action === "ready" || action === "ring" || action === "delay")) {
      const { data: biz } = await asCashier.from("businesses").select("name, logo_url").limit(1).maybeSingle();
      const key = uuidToKey(uuid);
      const title = biz?.name || "ركين";
      const body = action === "delay"
        ? `تأخرنا عليك شوي في طلب #${order.id} — نجهزه لك الحين`
        : action === "ring"
          ? `طلبك #${order.id} ينتظرك! تفضّل استلمه`
          : `طلبك #${order.id} جاهز! تفضّل استلمه`;
      ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
      const msg = JSON.stringify({
        title, body,
        url: key ? `/p/${key}` : "/",
        icon: biz?.logo_url || undefined,
        tag: `pager-${order.id}`,
        // الجاهزُ والرنينُ يرنّان ويبقيان حتى يُلمسا؛ التأخيرُ خبرٌ هادئ.
        urgent: action !== "delay",
      });
      const results = await Promise.all((subs || []).map(s =>
        sendPushToSubscription(s, msg, admin, "pager_push_subscriptions", { urgency: "high", TTL: 1800 }).catch(() => false)));
      pushed = results.filter(Boolean).length;
    }
    await broadcast;
  }

  return NextResponse.json({
    ok: true,
    pushed,
    subscribed,
    order: {
      id: order.id,
      ready_at: order.ready_at,
      delivered_at: order.delivered_at,
      eta_at: order.pager_eta_at,
      delayed_at: order.pager_delayed_at,
      ring_count: order.pager_ring_count,
      seen_at: order.pager_seen_at,
    },
  });
}
