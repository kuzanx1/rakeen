import { NextRequest, NextResponse } from "next/server";
import { loadWalletRow, renderPass, serviceClient } from "@/lib/wallet-service";

/**
 * صفحةٌ تُقرأ، لا JSON يُعرض.
 *
 * هذا المسار يُفتح بكاميرا جوّال، فما يخرج منه يقع في عين زبونٍ واقفٍ
 * عند الكاشير -- لا في سجلّ مطوّر. و{"error":"..."} في وجهه يقول إن
 * شيئاً تعطّل، ولا يقول ماذا يفعل الآن.
 */
function page(title: string, body: string, status: number) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{color-scheme:light}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#F7F4EF;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;padding:24px}
.c{max-width:340px;text-align:center}
.i{width:56px;height:56px;border-radius:50%;background:#EFEAE1;display:grid;place-items:center;margin:0 auto 18px}
h1{font-size:19px;font-weight:800;color:#171717;margin:0 0 10px}
p{font-size:14px;line-height:1.85;color:#5a5a5a;margin:0;font-weight:600}
</style></head><body><div class="c">
<div class="i"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8477"
 stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg></div>
<h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

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
    return page("رابط غير صالح", "تأكد إنك مسحت الباركود من شاشة المطعم مباشرة.", 400);
  }

  const sb = serviceClient();
  if (!sb) return page("الخدمة غير متاحة", "جرّب بعد قليل، أو اطلب من الكاشير يعرض الباركود من جديد.", 503);

  // الصرف أولاً: لا تُبنى بطاقةٌ لرمزٍ لن يُقبل.
  const { data: consumed, error } = await sb.rpc("consume_wallet_add_token", { p_token: token });
  const publicToken = (consumed as { publicToken?: string } | null)?.publicToken;
  const displayDeviceId = (consumed as { displayDeviceId?: number } | null)?.displayDeviceId;
  const posSession = (consumed as { posSession?: string } | null)?.posSession;
  if (error || !publicToken) {
    // رسالةٌ تقول ما جرى لا "خطأ": من مسحه ثانيةً يستحق أن يعرف أنه
    // استُعمل، لا أن يظن العطل في جواله.
    return page(
      "الباركود انتهت صلاحيته",
      "كل باركود يُمسح مرة واحدة وصلاحيته خمس دقائق — عشان ما يستخدمه غيرك. اطلب من الكاشير يعرضه لك من جديد.",
      410,
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
      // القناة باسم السرّ لا بالرقم: الشاشة لا تعرف رقمها -- هي تحفظ
      // سرّها وتستمع إليه. ورقمٌ متسلسل قناةٌ يخمّنها من أراد.
      const { data: dev } = await sb
        .from("display_devices")
        .select("device_secret")
        .eq("id", displayDeviceId)
        .maybeSingle();
      if (dev?.device_secret) {
        const ch = sb.channel(`display-secret:${dev.device_secret}`);
        await ch.send({ type: "broadcast", event: "hide_barcode", payload: { at: Date.now() } });
        await sb.removeChannel(ch);
      }
    } catch { /* الشاشة تعود إلى المنيو بانتهاء المهلة على كل حال */ }
  }

  /**
   * والكاشير يُخبَر أيضاً: الطلب انتهى كله -- الفاتورة طُبعت والبطاقة
   * أُضيفت -- فلا معنى لنافذةٍ تنتظر ضغطةً ليس بعدها شيء.
   */
  if (posSession) {
    try {
      const ch = sb.channel(`pos-session:${posSession}`);
      await ch.send({ type: "broadcast", event: "card_added", payload: { at: Date.now() } });
      await sb.removeChannel(ch);
    } catch { /* الكاشير يغلقها بيده، كما كان */ }
  }

  const row = await loadWalletRow(sb, publicToken as string);
  if (!row) return page("ما لقينا بطاقتك", "اطلب من الكاشير يسجّلك من جديد.", 404);
  if (!row.enabled) return page("برنامج الولاء موقوف", "المطعم أوقف برنامج الولاء مؤقتاً.", 403);

  const pkpass = await renderPass(row, publicToken);
  if (!pkpass) return page("البطاقة مو جاهزة بعد", "المطعم ما أكمل إعداد بطاقة المحفظة. أبلغ الكاشير.", 503);

  return new NextResponse(pkpass as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      /**
       * لا Content-Disposition.
       *
       * كان `attachment; filename="..."` -- وفيه عطلان:
       *
       * الأول أن iOS مع attachment يُنزّل الملف إلى "الملفات" بدل أن
       * يفتح ورقة "إضافة إلى Apple Wallet". فيرى الزبون صفحةً أو
       * تنزيلاً، ولا تُضاف بطاقته. وآبل تنصّ على تقديمها inline بنوعها
       * وحده.
       *
       * والثاني أن اسم المطعم عربي، وترويسات HTTP لا تحمل إلا ASCII.
       * فترويسةٌ فيها "هَبيّة" ترويسةٌ غير صالحة -- قد تُرمى، وقد يُرمى
       * الردّ كلّه معها.
       *
       * والنوع وحده يكفي: كل نظام يعرف application/vnd.apple.pkpass.
       */
      "Cache-Control": "no-store",
    },
  });
}
