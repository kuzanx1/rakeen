import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";
import { apnsEnv, pushToDevices } from "@/lib/wallet-push";

/**
 * بثُّ رسالةٍ إلى بطاقات عملاء المنشأة.
 *
 * تُكتب في حقل الرسالة عند كل زبونٍ أضاف بطاقته، ثم يُدفع إليهم --
 * فيقرؤونها على شاشتهم المقفلة. ونصٌّ فارغ يمحوها: زرُّ الإنهاء هو
 * هذا الطلبُ نفسه بلا نصّ.
 *
 * ولا يُنتظر تمام الدفع: من لم يصله الآن يبقى في الطابور، والمكنسة
 * تمرّ عليه بعد دقيقتين.
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "no env" }, { status: 503 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let text = "";
  try {
    text = String(((await request.json()) as { text?: unknown }).text ?? "").trim();
  } catch { /* بلا جسم = محو */ }
  // الحدّ من آبل لا منّا: نصٌّ أطول يُقصّ على الشاشة المقفلة.
  if (text.length > 160) return NextResponse.json({ error: "النص أطول من ١٦٠ حرف" }, { status: 400 });

  const asOwner = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  // الصلاحية والمنشأة تُقرآن داخل الدالّة من جلسته، لا من جسم الطلب.
  const { data: written, error } = await asOwner.rpc("wallet_broadcast_message", { p_text: text || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!written) return NextResponse.json({ ok: true, written: 0, sent: 0 });

  const sb = serviceClient();
  const env = await apnsEnv();
  if (!sb || !env) return NextResponse.json({ ok: true, written, sent: 0, skipped: "apns" });

  const { data: me } = await asOwner.from("profiles").select("business_id").limit(1).maybeSingle();
  const { data: pending } = await sb.rpc("wallet_push_pending_business", {
    p_business_id: me?.business_id, p_limit: 500,
  });
  const rows = (pending || []) as { customer_id: number; push_token: string }[];
  if (!rows.length) return NextResponse.json({ ok: true, written, sent: 0 });

  const at = new Date().toISOString();
  const res = await pushToDevices(rows.map(r => r.push_token), env);
  console.log(`wallet-broadcast: كُتبت لـ${written}، أُرسلت ${res.sent}، فشل ${res.failed}`);
  if (res.invalid.length) {
    await sb.from("wallet_pass_registrations").delete().in("push_token", res.invalid);
  }
  const okSet = new Set(res.ok);
  const ids = [...new Set(rows.filter(r => okSet.has(r.push_token)).map(r => r.customer_id))];
  if (ids.length) await sb.rpc("wallet_push_mark", { p_customer_ids: ids, p_at: at });

  return NextResponse.json({ ok: true, written, sent: res.sent, failed: res.failed });
}
