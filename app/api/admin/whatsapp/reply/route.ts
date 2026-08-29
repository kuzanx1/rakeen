import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";
import { sendWhatsAppText } from "@/lib/whatsapp";

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  if (requiresStepUp(token)) {
    return NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 });
  }
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { conversationId, text } = await request.json().catch(() => ({} as { conversationId?: number; text?: string }));
  if (!conversationId || typeof text !== "string" || !text.trim() || text.length > 4096) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const { data: conversation } = await admin
    .from("rakeen_support_conversations").select("id, business_id, customer_phone").eq("id", conversationId).single();
  if (!conversation) return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });

  const result = await sendWhatsAppText(conversation.customer_phone, text.trim());
  if (!result.ok) return NextResponse.json({ error: result.error || "تعذر الإرسال" }, { status: 502 });

  await admin.from("rakeen_support_messages").insert({
    conversation_id: conversation.id, business_id: conversation.business_id,
    direction: "outbound", sender: "staff", message_type: "text", body: text.trim(), wa_message_id: result.messageId || null,
  });
  // A human reply always implies "a live agent is handling this" — the
  // automated menu never talks over a support agent mid-conversation.
  await admin.from("rakeen_support_conversations").update({
    mode: "human", last_message_at: new Date().toISOString(), last_message_preview: text.trim().slice(0, 120),
  }).eq("id", conversation.id);

  return NextResponse.json({ ok: true });
}
