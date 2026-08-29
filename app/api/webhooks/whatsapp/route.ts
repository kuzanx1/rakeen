import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText, sendWhatsAppList, WhatsAppListRow, WhatsAppSendResult } from "@/lib/whatsapp";
import { ensureVapidConfigured, sendPushToSubscription } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Meta signs every webhook delivery with HMAC-SHA256 of the raw body using
// the app secret (X-Hub-Signature-256: sha256=<hex>). Without this check,
// anyone on the internet can POST a forged payload shaped like a real
// WhatsApp message straight to this URL — including a fake OTP-linking
// message that would hijack a business's "ربط واتساب" flow without ever
// touching the real WhatsApp network (see the OTP match further below).
// Fails CLOSED: an unset secret or any mismatch rejects the request.
function isValidMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !signatureHeader) return false;
  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// Alerts the platform admin's own phone (via admin_push_subscriptions, set up
// from the "فعّل إشعارات الجوال" button in /admin) whenever a new inbound
// message lands — best-effort: failures here must never break the webhook
// reply flow, so every error is swallowed after logging.
async function notifyAdminsOfMessage(admin: SupabaseClient, label: string | null, fromName: string | null, fromPhone: string, preview: string | null) {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) return;
    const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
    if (!subs || subs.length === 0) return;
    ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
    // The phone number always shows, even when a name is known — a saved
    // label or WhatsApp profile name alone isn't enough to act on (call
    // back, save the contact, cross-check against a business's own records).
    const displayName = label || fromName;
    const payload = JSON.stringify({
      title: "رسالة واتساب جديدة",
      body: `${displayName ? displayName + " — " : ""}${fromPhone}: ${preview || "رسالة تفاعلية"}`.slice(0, 180),
      url: "/admin",
    });
    await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin, "admin_push_subscriptions")));
  } catch (err) {
    console.error("whatsapp webhook: admin push notify failed", err);
  }
}

// The Graph API call can fail (expired/misconfigured access token, bad
// payload, rate limit) without throwing — callWhatsAppApi returns
// { ok: false, error }. Silently moving on from that is exactly how this
// number went dark for a stretch with the DB still showing "sent" rows for
// every reply: nothing ever surfaced the failure. This is the one place
// that failure becomes visible — same admin push channel as new messages.
async function notifyAdminsOfSendFailure(admin: SupabaseClient, toPhone: string, error: string | undefined) {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) return;
    const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
    if (!subs || subs.length === 0) return;
    ensureVapidConfigured(vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({
      title: "⚠️ فشل إرسال واتساب",
      body: `تعذر الرد على ${toPhone}: ${error || "خطأ غير معروف"}`.slice(0, 180),
      url: "/admin",
    });
    await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload, admin, "admin_push_subscriptions")));
  } catch (err) {
    console.error("whatsapp webhook: send-failure push notify failed", err);
  }
}

// Rakeen's own single WhatsApp number — NOT a per-restaurant ordering bot,
// and NOT a loyalty channel (that lives on its own dedicated number once
// it exists — see businesses table for the eventual second phone_number_id).
// This number serves exactly two audiences: a registered owner who has
// linked+verified their number (businesses.whatsapp_link_phone/
// whatsapp_link_verified, see the Settings "ربط واتساب" flow) gets a
// deterministic, DB-backed WhatsApp control panel (today's sales/orders/
// inventory — no AI, straight queries); anyone else is someone genuinely
// interested in Rakeen — informational menu + a path to a live human. Meta
// calls this with no Supabase session, so every write here goes through the
// service-role client (same pattern as the win-back cron route).
function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

const CLIENT_MENU_ROWS: WhatsAppListRow[] = [
  { id: "menu_sales_today", title: "💰 مبيعاتكم اليوم", description: "إجمالي المبيعات لهذا اليوم" },
  { id: "menu_orders_count", title: "🧾 عدد الطلبات اليوم", description: "كم طلب سجّلتوا اليوم" },
  { id: "menu_orders_summary", title: "📊 ملخص الطلبات", description: "عدد الطلبات، المبيعات، ومتوسط الطلب" },
  { id: "menu_inventory", title: "📦 المخزون الحالي", description: "الأصناف اللي محتاجة تعبئة" },
  { id: "menu_support", title: "🎧 الدعم الفني", description: "تكلم أحد فريقنا مباشرة" },
];
const PROSPECT_MENU_ROWS: WhatsAppListRow[] = [
  { id: "prospect_about", title: "ℹ️ نبذة عن ركين", description: "وش يسوي لك نظام ركين" },
  { id: "prospect_pricing", title: "💳 الأسعار والباقات", description: "كم تكلفة الاشتراك" },
  { id: "prospect_signup", title: "📝 كيف أسجل مطعمي؟", description: "خطوات الانضمام تاخذ دقايق" },
  { id: "prospect_support", title: "🎧 تحدث مع فريق ركين", description: "محادثة مباشرة وياهم" },
];

// compact=true skips the greeting — used right after answering a menu item,
// so the clickable list comes back without reading like the conversation
// restarted from scratch every single time.
// fromPhoneNumberId: once Rakeen has more than one WhatsApp number (e.g. a
// dedicated loyalty number alongside this main Rakeen/support number),
// every reply here goes out from whichever number the customer actually
// messaged — undefined just falls back to this single number.
function sendClientMenu(businessName: string, toPhone: string, compact = false, fromPhoneNumberId?: string) {
  const body = compact ? "تحب تشوف شي ثاني؟ اختر من القائمة:" : `هلا والله فيك يا شريكنا ${businessName} 👋\nوش تحب تشوف اليوم؟`;
  return sendWhatsAppList(toPhone, body, "القائمة", CLIENT_MENU_ROWS, fromPhoneNumberId);
}
function sendProspectMenu(toPhone: string, compact = false, fromPhoneNumberId?: string) {
  const body = compact ? "ودك تعرف شي ثاني؟ اختر من القائمة:" : "هلا وسهلا فيك 👋\nهذا رقم ركين — نظام متكامل لإدارة المطاعم والمقاهي.\nوش يهمك تعرف؟";
  return sendWhatsAppList(toPhone, body, "القائمة", PROSPECT_MENU_ROWS, fromPhoneNumberId);
}

async function computeTodaySalesText(admin: SupabaseClient, businessId: number): Promise<string> {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const { data } = await admin.from("orders").select("total").eq("business_id", businessId).gte("created_at", startToday.toISOString()).eq("payment_status", "paid");
  const list = data || [];
  const netSales = list.reduce((s, o) => s + Number(o.total), 0);
  return `📊 مبيعاتكم اليوم: ${netSales.toFixed(2)} ر.س`;
}

async function computeOrdersCountText(admin: SupabaseClient, businessId: number): Promise<string> {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", startToday.toISOString()).eq("payment_status", "paid");
  return `🧾 عدد طلبات اليوم: ${count || 0} طلب`;
}

async function computeOrdersSummaryText(admin: SupabaseClient, businessId: number): Promise<string> {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const { data } = await admin.from("orders").select("total").eq("business_id", businessId).gte("created_at", startToday.toISOString()).eq("payment_status", "paid");
  const list = data || [];
  const netSales = list.reduce((s, o) => s + Number(o.total), 0);
  const avg = list.length > 0 ? netSales / list.length : 0;
  return `📋 ملخص طلبات اليوم:\nعدد الطلبات: ${list.length}\nإجمالي المبيعات: ${netSales.toFixed(2)} ر.س\nمتوسط الطلب: ${avg.toFixed(2)} ر.س`;
}

// Same 20% "critical" threshold the Inventory screen itself uses
// (computeStockTier in rakeen-dashboard.js) — one definition of "low stock",
// not a second one invented for WhatsApp specifically.
async function computeInventoryText(admin: SupabaseClient, businessId: number): Promise<string> {
  const { data } = await admin.from("stock_items").select("name, qty_on_hand, par_level").eq("business_id", businessId);
  const items = data || [];
  const low = items.filter((i) => i.par_level > 0 && (i.qty_on_hand / i.par_level) * 100 < 20);
  if (low.length === 0) return `📦 عندكم ${items.length} صنف بالمخزون — كل الأصناف بمستوى جيد 👍`;
  const names = low.slice(0, 8).map((i) => i.name).join("، ");
  return `📦 عندكم ${items.length} صنف بالمخزون\n⚠️ ${low.length} صنف يحتاج تعبئة عاجلة:\n${names}`;
}

const PROSPECT_STATIC_TEXT: Record<string, string> = {
  prospect_about: "ركين نظام متكامل لإدارة مطعمك أو مقهاك — كاشير، مخزون، تقارير، نادي ولاء، وطلب أونلاين، كل شي مجمّع بمكان واحد وسهل.",
  prospect_pricing: "الأسعار تختلف حسب حجم مطعمك واحتياجك. فريقنا يقدر يجهز لك عرض يناسبك — اختر (تحدث مع فريق ركين) من القائمة ونرد عليك بأقرب وقت.",
  prospect_signup: "التسجيل سهل وسريع، خطوتين وتصير جاهز! اختر (تحدث مع فريق ركين) من القائمة وبنجهز لك حسابك خلال دقايق.",
};

const RETURN_TO_MENU_COMMANDS = new Set(["القائمة", "قائمة", "رجوع", "menu"]);
function isReturnToMenuCommand(text: string | undefined): boolean {
  if (!text) return false;
  return RETURN_TO_MENU_COMMANDS.has(text.trim().toLowerCase());
}

async function logOutbound(admin: SupabaseClient, conversationId: number, businessId: number | null, body: string) {
  await admin.from("rakeen_support_messages").insert({
    conversation_id: conversationId, business_id: businessId,
    direction: "outbound", sender: "ai", message_type: "text", body,
  });
  // Keeps the admin conversation list's preview/ordering accurate for
  // Rakeen's own replies too, not just inbound customer messages.
  await admin.from("rakeen_support_conversations").update({
    last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120),
  }).eq("id", conversationId);
}

// Only logs "sent" when the Graph API call actually reported success —
// otherwise the DB is a lie about what the customer actually received.
// On failure: console.error for the Cloudflare log tail, plus a push alert
// to the admin so it's never silently broken again.
async function sendAndLog(
  admin: SupabaseClient,
  result: Promise<WhatsAppSendResult>,
  toPhone: string,
  conversationId: number,
  businessId: number | null,
  logBody: string
) {
  const r = await result;
  if (r.ok) {
    await logOutbound(admin, conversationId, businessId, logBody);
  } else {
    console.error("whatsapp webhook: send failed", { toPhone, error: r.error });
    await notifyAdminsOfSendFailure(admin, toPhone, r.error);
  }
}

// Same failure visibility as sendAndLog, for the sends that were never
// logged to rakeen_support_messages in the first place (the OTP-link
// confirmation, and the compact follow-up menu after answering a question —
// only the answer itself gets a log row, not every menu re-send).
async function sendOrAlert(admin: SupabaseClient, result: Promise<WhatsAppSendResult>, toPhone: string) {
  const r = await result;
  if (!r.ok) {
    console.error("whatsapp webhook: send failed", { toPhone, error: r.error });
    await notifyAdminsOfSendFailure(admin, toPhone, r.error);
  }
}

interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  context?: { id: string };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!isValidMetaSignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET)) {
    console.error("whatsapp webhook: rejected — missing/invalid X-Hub-Signature-256");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Defense in depth even after signature verification — caps an extreme
  // burst (a replayed/duplicated delivery storm) rather than trusting Meta's
  // own delivery behavior unconditionally.
  if (!(await checkRateLimit(request, "RL_WEBHOOK"))) {
    return NextResponse.json({ ok: true });
  }

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: true });
  if (!(await checkDbRateLimit(admin, request, "RL_WEBHOOK", 120, 60))) {
    return NextResponse.json({ ok: true });
  }

  const payload = JSON.parse(rawBody || "null");
  if (!payload?.entry) return NextResponse.json({ ok: true });

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const messages: WhatsAppMessage[] = value?.messages ?? [];
      if (messages.length === 0) continue;
      const contactName: string | undefined = value?.contacts?.[0]?.profile?.name;
      // Which of Rakeen's numbers actually received this — replies go out
      // from the same one.
      const receivingPhoneNumberId: string | undefined = value?.metadata?.phone_number_id;

      for (const msg of messages) {
        // Linking never sends anything unprompted — the owner sends US a
        // code (shown in their Settings) instead of us texting one out to
        // a number that's never messaged in before, which would be a
        // business-initiated message and need an approved Authentication
        // template. A reply to an inbound message is always free; this
        // check runs before any other routing since the sender isn't a
        // recognized owner yet — that's the whole point.
        if (msg.type === "text" && msg.text?.body) {
          const code = msg.text.body.trim();
          if (/^\d{6}$/.test(code)) {
            const { data: pendingBusiness } = await admin
              .from("businesses")
              .select("id, name")
              .eq("whatsapp_link_otp", code)
              .gt("whatsapp_link_otp_expires_at", new Date().toISOString())
              .maybeSingle();
            if (pendingBusiness) {
              await admin.from("businesses").update({
                whatsapp_link_phone: msg.from, whatsapp_link_verified: true,
                whatsapp_link_otp: null, whatsapp_link_otp_expires_at: null,
              }).eq("id", pendingBusiness.id);
              const text = `تم✅ ربطنا رقمك بحساب ${pendingBusiness.name}.\nاكتب أي شي وتفتح لك لوحة التحكم على طول.`;
              await sendOrAlert(admin, sendWhatsAppText(msg.from, text, receivingPhoneNumberId), msg.from);
              continue;
            }
          }
        }

        // Resolve (or re-resolve every message — an owner's link status can
        // change between messages) which of the two audiences this phone
        // is: a linked restaurant owner (control panel), or someone
        // genuinely interested in Rakeen (prospect/support).
        const { data: linkedBusiness } = await admin
          .from("businesses").select("id, name")
          .eq("whatsapp_link_phone", msg.from).eq("whatsapp_link_verified", true).maybeSingle();

        const kind: "owner" | "prospect" = linkedBusiness ? "owner" : "prospect";
        const businessId: number | null = linkedBusiness?.id ?? null;

        // message_type used to fall through to "text" for anything that
        // wasn't interactive — including images and documents, which then
        // stored no media_id and a null body, so the admin panel had
        // nothing to render for them at all. Every inbound shape gets its
        // real type here.
        const messageType: string =
          msg.type === "interactive" ? (msg.interactive?.type === "button_reply" ? "interactive_button" : "interactive_list") :
          msg.type === "image" ? "image" :
          msg.type === "document" ? "document" :
          "text";
        const mediaId: string | null = msg.type === "image" ? msg.image?.id ?? null : msg.type === "document" ? msg.document?.id ?? null : null;
        const replyText = msg.type === "text" ? msg.text?.body ?? null : null;
        const inboundBody = replyText ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? msg.image?.caption ?? msg.document?.caption ?? null;
        const previewText = inboundBody ?? (messageType === "image" ? "📷 صورة" : messageType === "document" ? "📄 مستند" : "[رسالة تفاعلية]");

        const { data: conversation, error: convError } = await admin
          .from("rakeen_support_conversations")
          .upsert(
            {
              customer_phone: msg.from, customer_name: contactName ?? null, business_id: businessId,
              last_message_at: new Date().toISOString(), last_message_preview: previewText.slice(0, 120),
            },
            { onConflict: "customer_phone", ignoreDuplicates: false }
          )
          .select("id, mode, admin_label")
          .single();
        if (convError || !conversation) {
          console.error("whatsapp webhook: upsert conversation failed", convError);
          continue;
        }

        await admin.from("rakeen_support_messages").insert({
          conversation_id: conversation.id, business_id: businessId,
          direction: "inbound", sender: "customer",
          message_type: messageType,
          body: inboundBody, media_id: mediaId,
          wa_message_id: msg.id, raw: msg,
        });
        await notifyAdminsOfMessage(admin, conversation.admin_label, contactName ?? null, msg.from, previewText);

        const sendMenu = (compact = false) => {
          if (kind === "owner" && linkedBusiness) return sendClientMenu(linkedBusiness.name, msg.from, compact, receivingPhoneNumberId);
          return sendProspectMenu(msg.from, compact, receivingPhoneNumberId);
        };

        // A client stuck waiting on a slow support reply shouldn't be stuck,
        // full stop — this one command works even in "human" mode, letting
        // them self-serve back to the automated menu without waiting on an
        // admin to flip it from the /admin panel.
        if (msg.type === "text" && isReturnToMenuCommand(msg.text?.body)) {
          await admin.from("rakeen_support_conversations").update({ mode: "ai", taken_over_by: null }).eq("id", conversation.id);
          await sendAndLog(admin, sendMenu(), msg.from, conversation.id, businessId, "[menu] رجوع للقائمة الآلية");
          continue;
        }

        // A live support agent already has this — the automated menu never
        // talks over a human mid-conversation.
        if (conversation.mode === "human") continue;

        const selectedId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;

        if (selectedId === "menu_support" || selectedId === "prospect_support") {
          await admin.from("rakeen_support_conversations").update({ mode: "human", taken_over_by: null }).eq("id", conversation.id);
          const text = "أبشر، حولناك لفريق الدعم 🙌 بيتواصلون وياك بأقرب وقت إن شاء الله.\nولو حبيت ترجع للقائمة أي وقت، بس اكتب كلمة (القائمة).";
          await sendAndLog(admin, sendWhatsAppText(msg.from, text, receivingPhoneNumberId), msg.from, conversation.id, businessId, text);
          continue;
        }

        if (selectedId && kind === "owner" && businessId) {
          let text: string | null = null;
          if (selectedId === "menu_sales_today") text = await computeTodaySalesText(admin, businessId);
          else if (selectedId === "menu_orders_count") text = await computeOrdersCountText(admin, businessId);
          else if (selectedId === "menu_orders_summary") text = await computeOrdersSummaryText(admin, businessId);
          else if (selectedId === "menu_inventory") text = await computeInventoryText(admin, businessId);
          if (text) {
            await sendAndLog(admin, sendWhatsAppText(msg.from, text, receivingPhoneNumberId), msg.from, conversation.id, businessId, text);
            // Compact = the clickable list again, no repeated greeting —
            // one tap to ask something else, not a full restart.
            await sendOrAlert(admin, sendMenu(true), msg.from);
            continue;
          }
        }

        if (selectedId && PROSPECT_STATIC_TEXT[selectedId]) {
          const text = PROSPECT_STATIC_TEXT[selectedId];
          await sendAndLog(admin, sendWhatsAppText(msg.from, text, receivingPhoneNumberId), msg.from, conversation.id, businessId, text);
          await sendOrAlert(admin, sendMenu(true), msg.from);
          continue;
        }

        // Any fresh message (or an unrecognized/stale button id) — show the
        // right welcome + menu from scratch.
        await sendAndLog(admin, sendMenu(), msg.from, conversation.id, businessId, "[menu] أهلاً");
      }
    }
  }

  return NextResponse.json({ ok: true });
}
