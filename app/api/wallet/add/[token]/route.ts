import { NextRequest, NextResponse } from "next/server";
import { loadWalletRow, renderPass, serviceClient } from "@/lib/wallet-service";

/**
 * الرابط الذي يحمله الباركود على شاشة العميل.
 *
 * وهو غير /api/wallet/pass/[token]: ذاك يأخذ الرمز الدائم فيصلح رابطاً
 * في صفحة البطاقة، وهذا يأخذ رمزاً يُصرف مرة فيصلح باركوداً على شاشة
 * يقف أمامها طابور.
 *
 * والفرق كله في الجملة الواحدة: أول مسح يستهلك الرمز ويأخذ البطاقة، وما
 * بعده لا يجد شيئاً -- سواءٌ كان الزبون التالي في الطابور، أو من صوّر
 * الشاشة بجواله. والاثنان يقعان، والأول أكثر وقوعاً.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "رمز غير صالح" }, { status: 400 });
  }

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  // الصرف أولاً: لا تُبنى بطاقةٌ لرمزٍ لن يُقبل.
  const { data: consumed, error } = await sb.rpc("consume_wallet_add_token", { p_token: token });
  const publicToken = (consumed as { publicToken?: string } | null)?.publicToken;
  const displayDeviceId = (consumed as { displayDeviceId?: number } | null)?.displayDeviceId;
  if (error || !publicToken) {
    // رسالةٌ تقول ما جرى لا "خطأ": من مسحه ثانيةً يستحق أن يعرف أنه
    // استُعمل، لا أن يظن العطل في جواله.
    return NextResponse.json(
      { error: "انتهت صلاحية هذا الرمز أو استُخدم من قبل. اطلب من الكاشير عرضه مرة ثانية." },
      { status: 410 },
    );
  }

  /**
   * الشاشة تُخبَر في اللحظة، لا بعد دقيقتين.
   *
   * الباركود أُخذ، فلا معنى لبقائه على وجه شاشةٍ يقف أمامها الزبون
   * التالي ينظر إلى المنيو. والمهلة تبقى لمن لم يمسح أصلاً -- احتياطاً
   * لا آليةً أساسية.
   *
   * والبثّ قبل بناء البطاقة: توقيعها يأخذ وقتاً، والشاشة لا تنتظره.
   * وفشله لا يُسقط الإضافة -- الرمز صُرف فعلاً، وأسوأ ما يقع أن يبقى
   * الباركود معروضاً حتى تنتهي مهلته.
   */
  if (displayDeviceId) {
    try {
      const ch = sb.channel(`display:${displayDeviceId}`);
      await ch.send({ type: "broadcast", event: "hide_barcode", payload: { at: Date.now() } });
      await sb.removeChannel(ch);
    } catch { /* الشاشة تعود إلى المنيو بانتهاء المهلة على كل حال */ }
  }

  const row = await loadWalletRow(sb, publicToken as string);
  if (!row) return NextResponse.json({ error: "البطاقة غير موجودة" }, { status: 404 });
  if (!row.enabled) return NextResponse.json({ error: "برنامج الولاء غير مفعّل" }, { status: 403 });

  const pkpass = await renderPass(row, publicToken);
  if (!pkpass) return NextResponse.json({ error: "لم تُضبط شهادة المحفظة بعد" }, { status: 503 });

  return new NextResponse(pkpass as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${row.businessName.replace(/[^\w؀-ۿ-]+/g, "-")}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
