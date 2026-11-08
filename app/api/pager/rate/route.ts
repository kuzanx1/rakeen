import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

/**
 * بيجر ركين -- «قيّم طلبك» من صفحة الزبون (بلا حساب: المفتاح هو الباركود).
 *
 *   ٤-٥ نجوم: يُحفظ التقييم، والصفحة نفسها تفتح رابط قوقل.
 *   ١-٣:      يُحفظ مع الملاحظة ورقم الواتساب (اختياري)، ويوصل صاحب
 *             المحل إشعارٌ فوري.
 *
 * تقييمٌ واحد لكل طلب (order_id فريد)، وبعد ما يجهز فقط، ولو المحل مفعّل
 * التقييم والبيجر -- والبيجر نفسه مقفول على عماد وصرح في القاعدة.
 * مسارٌ واحد: الصفحة واحدة لزبائن كاشير التطبيق والويب.
 */
const TAGS = new Set(["تأخّر الطلب", "الطعم", "الطلب ناقص أو غلط", "التعامل", "النظافة", "السعر"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** رقم واتساب: 05XXXXXXXX أو 9665XXXXXXXX أو دولي -> أرقام فقط بمفتاح الدولة. */
function waNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (/^05\d{8}$/.test(d)) return "966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "966" + d;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^00\d{9,14}$/.test(d)) return d.slice(2);
  if (/^[1-9]\d{9,14}$/.test(d)) return d;
  return null;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  let body: { key?: string; stars?: number; tags?: unknown; text?: unknown; phone?: unknown } = {};
  try { body = await request.json(); } catch { /* */ }
  const key = String(body.key || "");
  const stars = Math.round(Number(body.stars));
  if (!UUID.test(key) || !(stars >= 1 && stars <= 5)) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const low = stars <= 3;
  const tags = low && Array.isArray(body.tags) ? [...new Set(body.tags.filter((t): t is string => typeof t === "string" && TAGS.has(t)))] : [];
  const note = low && typeof body.text === "string" ? body.text.trim().slice(0, 500) || null : null;
  const whatsapp = low ? waNumber(body.phone) : null;
  if (low && typeof body.phone === "string" && body.phone.trim() && !whatsapp) {
    return NextResponse.json({ error: "رقم الواتساب غير صحيح" }, { status: 400 });
  }

  if (!(await checkRateLimit(request, "RL_PUSH", "pager-rate:" + key))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  // الـ IP واسع: زبائن المحل كلهم على واي فاي واحد. الحدّ الفعلي هو تقييمٌ واحد لكل طلب.
  if (!(await checkDbRateLimit(admin, request, "RL_PAGER_RATE", 60, 60, key))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: o } = await admin
    .from("orders")
    .select("id, business_id, status, ready_at, businesses!inner(pager_enabled, pager_settings)")
    .eq("client_order_uuid", key)
    .maybeSingle();
  const biz = (o as unknown as { businesses?: { pager_enabled?: boolean; pager_settings?: { rate?: boolean } | null } } | null)?.businesses;
  if (!o || !biz?.pager_enabled || biz.pager_settings?.rate !== true) {
    return NextResponse.json({ error: "التقييم غير متاح" }, { status: 404 });
  }
  if (!o.ready_at || ["cancelled", "refunded", "rejected"].includes(String(o.status))) {
    return NextResponse.json({ error: "التقييم بعد ما يجهز طلبك" }, { status: 409 });
  }

  const { error } = await admin.from("pager_ratings").insert({
    business_id: o.business_id, order_id: o.id, stars, tags, note, whatsapp,
  });
  if (error) {
    // 23505 = قيّم هذا الطلب من قبل: مو خطأ عند الزبون.
    if (error.code === "23505") return NextResponse.json({ ok: true, already: true });
    console.error("pager rate: insert failed", error);
    return NextResponse.json({ error: "تعذر الحفظ" }, { status: 500 });
  }

  // الزعلان: إشعارٌ فوري لصاحب المحل -- عشان يتصرف قبل ما يكتب الزبون في مكانٍ ثاني.
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (low && vapidPublicKey && vapidPrivateKey) {
    try {
      const { data: subs } = await admin
        .from("owner_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("business_id", o.business_id);
      if (subs && subs.length) {
        ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
        const why = [tags.join("، "), note].filter(Boolean).join(" — ").slice(0, 120);
        const payload = JSON.stringify({
          title: `تقييم ${stars} من ٥ — طلب #${o.id}`,
          body: (why || "زبون ما كان راضي عن طلبه") + (whatsapp ? " · ترك رقم واتساب" : ""),
          url: "/dashboard",
        });
        await Promise.all(subs.map((s) => sendPushToSubscription(s, payload, admin, "owner_push_subscriptions")));
      }
    } catch (e) {
      console.error("pager rate: owner push failed", e);
    }
  }
  return NextResponse.json({ ok: true });
}
