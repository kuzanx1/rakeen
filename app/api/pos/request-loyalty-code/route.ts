import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";
import { apnsEnv, pushToDevices } from "@/lib/wallet-push";

/**
 * رمز تأكيد المكافأة -- إلى بطاقة العميل، لا إلى شاشة الكاشير.
 *
 * كان الصرف يمرّ بلا تأكيدٍ عملياً: البوابة تشترط طلباً مؤكَّداً،
 * والتأكيد في صفحة بطاقة ويبٍ لا يفتحها أحد. فمن عرف رقم جوال غيره
 * أخذ مكافأته.
 *
 * والرمز يُولَّد في القاعدة ويُكتب في البطاقة ويُدفع -- ولا يعود في
 * ردّ هذا المسار. فالكاشير يطلبه ولا يراه، والعميل وحده يقرؤه على
 * جواله ويقوله. وهذا هو الإثبات: لا رقمَ الجوال، بل ما وصل الجهاز
 * الذي في يده.
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let customerId = 0;
  /**
   * والدفعُ يُطلب صراحةً، لا يقع من نفسه.
   *
   * الطلب يُنشأ لكل أبواب التأكيد الثلاثة -- المسحُ ورقمُ البطاقة
   * لا يحتاجان دفعةً أصلاً. فدفعُها في كل مرّة يوقظ جهاز الزبون بلا
   * سبب، ويقرّب البطاقة من خنق iOS بلا مقابل.
   */
  let send = false;
  try {
    const body = (await request.json()) as { customerId?: unknown; send?: unknown };
    customerId = Number(body.customerId);
    send = body.send === true;
  } catch { /* جسمٌ ناقص */ }
  if (!customerId) return NextResponse.json({ error: "ما فيه عميل" }, { status: 400 });

  // الصلاحية والمنشأة تُقرآن من جلسة الكاشير داخل الدالّة نفسها.
  const asCashier = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  /**
   * خطوتان لا واحدة.
   *
   * التحقق يجري بجلسة الكاشير -- فـRLS على customers لا تُريه إلا
   * عملاء منشأته، ووجودُ العميل عنده هو إثباتُ الاثنين معاً: أنه
   * كاشيرُ تلك المنشأة، وأن العميل عميلُها.
   *
   * ثم يُولَّد الرمز بمفتاح الخدمة وحده. ولو وُلّد بجلسته لقدر أن
   * ينادي الدالّة من متصفّحه ويقرأ الرمز بنفسه -- فيؤكّد عن العميل،
   * وهو ما بُني هذا كلُّه لمنعه.
   */
  const { data: cust } = await asCashier
    .from("customers").select("business_id").eq("id", customerId).maybeSingle();
  if (!cust?.business_id) {
    return NextResponse.json({ error: "هذا العميل مو مسجّل عندك." }, { status: 403 });
  }

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 503 });
  const { data: made, error } = await svc.rpc("create_loyalty_redemption_code", {
    p_customer_id: customerId,
    p_business_id: cust.business_id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out = made as { ok?: boolean; error?: string; requestId?: number; code?: string; reused?: boolean } | null;
  if (!out?.ok || !out.code) {
    const says: Record<string, string> = {
      forbidden: "هذا الحساب ما عنده صلاحية الكاشير.",
      customer_not_found: "هذا العميل مو مسجّل عندك.",
    };
    return NextResponse.json(
      { error: (out?.error && says[out.error]) || "تعذر إنشاء الرمز" },
      { status: 403 },
    );
  }

  const sb = svc;

  // بلا طلبِ دفعٍ: الطلب أُنشئ، ويتأكّد بالمسح أو برقم البطاقة.
  if (!send) {
    return NextResponse.json({ ok: true, requestId: out.requestId, delivered: false, sent: false });
  }

  /**
   * والرمزُ المُعاد يُدفع كذلك -- ولا يُفترض أنه وصل.
   *
   * كان يُردّ هنا بـ delivered:true بلا كتابةٍ ولا دفع، ظنّاً أنه على
   * بطاقته من الدفعة الأولى. وذلك خطأٌ قاتل بعد أن صار المسار خطوتين:
   * فتحُ النافذة يُنشئ الطلب بلا دفع، ثم يضغط الكاشير "رمز مؤقّت"
   * فيجد الطلبَ حيّاً -- فيُقال "مُعاد" ويُردّ "تم الإرسال"، والرمز لم
   * يُكتب ولم يُدفع قطّ.
   *
   * فالإعادةُ تخصّ توليد الرمز وحده: لا يُولَّد جديدٌ ما دام الأول
   * حيّاً (وإلا تجمّدت البطاقة على رمزٍ مُبطَل). أمّا الإيصال فيقع
   * كلّما طُلب صراحةً -- والكاشير لا يضغط الزرّ إلا وهو يريده.
   */
  /**
   * ويُكتب في البطاقة ويُدفع في نفس النداء.
   *
   * والكاشير ينتظره: دقيقتان صلاحيةً لا تحتمل مكنسةً تمرّ كل دقيقتين،
   * والزبون واقفٌ أمامه.
   */
  await sb.rpc("set_wallet_message", {
    p_customer_ids: [customerId],
    p_text: `رمز تأكيد مكافأتك: ${out.code}`,
  });

  const env = await apnsEnv();
  if (!env) {
    return NextResponse.json({ ok: true, requestId: out.requestId, delivered: false });
  }
  const { data: regs } = await sb
    .from("wallet_pass_registrations")
    .select("push_token")
    .eq("customer_id", customerId);
  const tokens = (regs || []).map(r => r.push_token as string);
  if (!tokens.length) {
    // بطاقةٌ لم تُضف = لا سبيل إلى إيصال الرمز. ويُقال صراحةً بدل أن
    // ينتظر الكاشير رمزاً لن يصل أبداً.
    return NextResponse.json({ ok: true, requestId: out.requestId, delivered: false });
  }
  const res = await pushToDevices(tokens, env);
  console.log(`loyalty-code: أرسلنا ${res.sent} وفشل ${res.failed} للعميل ${customerId}`);
  if (res.invalid.length) {
    await sb.from("wallet_pass_registrations").delete().in("push_token", res.invalid);
  }
  const at = new Date().toISOString();
  if (res.sent > 0) {
    await sb.rpc("wallet_push_mark", { p_customer_ids: [customerId], p_at: at });
  }

  // الرمز نفسه لا يخرج من هنا -- وهذا كلُّ الأمان.
  return NextResponse.json({ ok: true, requestId: out.requestId, delivered: res.sent > 0 });
}
