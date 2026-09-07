import { NextRequest, NextResponse } from "next/server";
import { PASS_TEMPLATE_VERSION, serviceClient } from "@/lib/wallet-service";
import { apnsEnv, pushToDevices } from "@/lib/wallet-push";

/**
 * مكنسة إشعارات البطاقات: كل دقيقتين.
 *
 * تجد البطاقات التي تغيّرت ولم يُشعَر أصحابها، وتوقظ أجهزتهم. والجهاز
 * حين يستيقظ يسأل الخادم عن بطاقته فيبنيها له محدَّثة -- فالإشعار
 * ليس رسالةً تُقرأ، إنما نقرةٌ تقول "اسأل".
 *
 * ولا تُربط بالشراء: إشعارُ آبل في طريق الكاشير يبطئ إتمام الطلب، وقد
 * يفشل فيُرى فشله في وجهه وهو لا حيلة له فيه. ودقيقتان تصلان قبل أن
 * يخرج الزبون من الباب.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = serviceClient();
  const env = await apnsEnv();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 503 });
  // بلا ربط APNs لا شيء يُدفع -- ولا تُعلَّم البطاقات مدفوعةً، فتنتظر
  // حتى يُربط. وتعليمُها الآن يعني أنها لن تُدفع أبداً بعد الربط.
  if (!env) return NextResponse.json({ ok: true, skipped: "apns not configured" });

  /**
   * ومن بطاقته أقدم من القالب يُدفع إليه كذلك.
   *
   * الطابور يعرف من تغيّر رصيده، ولا يعرف من تغيّر شكل بطاقته. فبعد
   * كل تعديلٍ في القالب تبقى البطاقات القديمة على شكلها إلى أن يشتري
   * أصحابها -- وقد لا يشترون.
   */
  // ولا يُكنس بتاريخٍ في المستقبل.
  //
  // الكنس يُلغي علامة الدفع لمن دُفع إليه قبل التاريخ. وتاريخٌ لم يأتِ
  // بعدُ يشمل الجميع دائماً -- فيُدفع ويُعلَّم ثم يُلغى تعليمُه في
  // الدورة التالية، بلا نهاية. والحارس هنا لا في القاعدة: التاريخ خطأ
  // برمجيّ، والقاعدة تنفّذ ما يُطلب منها.
  if (PASS_TEMPLATE_VERSION.getTime() <= Date.now()) {
    await sb.rpc("wallet_push_stale_template", { p_since: PASS_TEMPLATE_VERSION.toISOString() })
      .then(() => {}, () => {});
  }

  /**
   * وقبل الدفع: من يستحقّ رسالةً تُكتب له الآن.
   *
   * سؤالُ الجودة وترجيعُ غير النشط لا يحتاجان مؤقّتاً خاصاً بهما --
   * كلاهما شرطٌ زمنيّ يُفحص، وهذه المكنسة تمرّ كل دقيقتين أصلاً.
   * وكتابةُ الرسالة تحرّك ختمَ التحديث، فتدخل الطابور من نفسها
   * وتُدفع في السطر التالي بلا شيفرةٍ ثانية.
   *
   * (والحدّ المجاني خمسةُ مؤقّتات للحساب كلّه، فمؤقّتٌ لكل نوعٍ ترفٌ
   * لا نملكه.)
   */
  for (const [targets, mark] of [
    ["wallet_quality_targets", "wallet_quality_mark"],
    ["wallet_winback_targets", "wallet_winback_mark"],
  ] as const) {
    const { data: due } = await sb.rpc(targets);
    const list = (due || []) as { customer_id: number; msg: string }[];
    if (!list.length) continue;
    // نصُّ كل منشأةٍ يخصّها، فتُكتب المجموعات نصّاً نصّاً.
    const byText = new Map<string, number[]>();
    for (const t of list) {
      if (!t.msg) continue;
      (byText.get(t.msg) ?? byText.set(t.msg, []).get(t.msg)!).push(t.customer_id);
    }
    for (const [msg, ids] of byText) {
      await sb.rpc("set_wallet_message", { p_customer_ids: ids, p_text: msg });
    }
    await sb.rpc(mark, { p_customer_ids: list.map(t => t.customer_id) });
    console.log(`${targets}: كُتبت لـ${list.length}`);
  }

  const { data: pending, error } = await sb.rpc("wallet_push_pending", { p_limit: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (pending || []) as { customer_id: number; push_token: string; updated_at: string }[];
  if (!rows.length) return NextResponse.json({ ok: true, sent: 0 });

  const at = new Date().toISOString();
  const res = await pushToDevices(rows.map(r => r.push_token), env);
  console.log(`wallet-push: أرسلنا ${res.sent} وفشل ${res.failed} من ${rows.length}`);

  /**
   * وتُنظَّف الرموز الميتة.
   *
   * 410 من آبل تعني أن البطاقة حُذفت من ذلك الجهاز. وإبقاء تسجيلها
   * يعني محاولةً فاشلة كل دقيقتين إلى الأبد -- وهي محاولةٌ تُحسب
   * علينا عند آبل.
   */
  if (res.invalid.length) {
    await sb.from("wallet_pass_registrations").delete().in("push_token", res.invalid);
  }

  // ما دُفع يُعلَّم بالوقت الذي قُرئ به، لا بالآن: تغيّرٌ وقع أثناء
  // الدفع يبقى منتظراً بدل أن يُطمس ويضيع.
  // ولا يُعلَّم إلا من سلّمه APNs: تعليمُ من فشل يعني أنه لن يُحاوَل
  // ثانيةً أبداً -- ويبقى صاحبه ببطاقةٍ قديمة بلا أن يعرف أحد.
  const okSet = new Set(res.ok);
  const ids = [...new Set(rows.filter(r => okSet.has(r.push_token)).map(r => r.customer_id))];
  if (!ids.length) return NextResponse.json({ ok: true, sent: 0, failed: res.failed });
  await sb.rpc("wallet_push_mark", { p_customer_ids: ids, p_at: at });

  return NextResponse.json({ ok: true, sent: res.sent, failed: res.failed, cleaned: res.invalid.length });
}
