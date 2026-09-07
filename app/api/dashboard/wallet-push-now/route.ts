import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";
import { apnsEnv, pushToDevices } from "@/lib/wallet-push";

/**
 * دفعٌ فوريّ عند حفظ التصميم.
 *
 * كان الحفظ يوقظ الطابور ويترك المكنسة تمرّ عليه كل دقيقتين -- وذلك
 * صوابٌ في طريق الكاشير: إشعار آبل هناك يقع بين الزبون وإتمام طلبه،
 * فيبطئه أو يفشل في وجهه. أما صاحب المطعم وهو يبدّل تصميمه فينتظر
 * ليرى، ودقيقتان بين ضغطةٍ وأثرها تُقرآن عطلاً -- فيحفظ ثانيةً وثالثة.
 *
 * وبطاقةٌ واحدة عند صاحب المطعم نفسه لا تحتاج طابوراً أصلاً.
 *
 * ولا يُنتظر تمام الدفع للردّ بالنجاح: ما لم يصل الآن يبقى في الطابور
 * -- فالمكنسة احتياطٌ لا طريقٌ وحيد.
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "no env" }, { status: 503 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  // منشأتُه وحدها: المعرّف يُقرأ من جلسته لا من جسم الطلب، فلا يدفع
  // أحدٌ إلى بطاقات غيره.
  const asOwner = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: me } = await asOwner.from("profiles").select("business_id").limit(1).maybeSingle();
  const businessId = me?.business_id;
  if (!businessId) return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 503 });
  const env = await apnsEnv();
  if (!env) return NextResponse.json({ ok: true, sent: 0, skipped: "apns not configured" });

  const { data: pending, error } = await sb.rpc("wallet_push_pending_business", {
    p_business_id: businessId, p_limit: 200,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (pending || []) as { customer_id: number; push_token: string }[];
  if (!rows.length) return NextResponse.json({ ok: true, sent: 0, pending: 0 });

  const at = new Date().toISOString();
  const res = await pushToDevices(rows.map(r => r.push_token), env);
  console.log(`wallet-push: أرسلنا ${res.sent} وفشل ${res.failed} من ${rows.length}`);
  if (res.invalid.length) {
    await sb.from("wallet_pass_registrations").delete().in("push_token", res.invalid);
  }
  const okSet = new Set(res.ok);
  const ids = [...new Set(rows.filter(r => okSet.has(r.push_token)).map(r => r.customer_id))];
  if (ids.length) await sb.rpc("wallet_push_mark", { p_customer_ids: ids, p_at: at });
  return NextResponse.json({ ok: true, sent: res.sent, failed: res.failed, cleaned: res.invalid.length });
}
