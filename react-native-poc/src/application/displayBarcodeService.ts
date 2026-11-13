import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { getPosDeviceId } from './displayScopeService';
import { builtInDisplayShowsCodes, showBarcodeOnBuiltInDisplay } from './customerDisplayService';
import { hideCodeOnCustomerDisplay } from '../platform/customerDisplay';

/**
 * "اعرض باركود الولاء على شاشة العميل" -- التطبيق يلحق الويب.
 *
 * كانت الميزة في كاشير الويب وحده (`rakeen-pos.js:4603`)، فمطعمٌ ينتقل
 * إلى التطبيق يفقدها بلا أن يُقال له: الزرّ ليس موجوداً، فلا شيء يبدو
 * معطّلاً -- إنما ناقصاً، وهو أخفى.
 *
 * والمسار هو نفسه لا نسخةٌ منه: الخادم يبني رمز الإضافة، ويبثّه إلى كل
 * شاشات الفرع، ويردّ معرّف جلسةٍ يُسمع بها متى مسحه الزبون. فأي إصلاحٍ
 * هناك يصل العميلين معاً، ولا يفترقان مرّةً أخرى.
 */
export interface ShowBarcodeResult {
  ok: boolean;
  /** قناةٌ عابرة يُسمع بها "أُضيفت البطاقة" -- لا سرّ الشاشة. */
  posSession?: string;
  error?: string;
}

export async function showLoyaltyBarcodeOnDisplay(
  customerId: number,
  branchId: number | null,
): Promise<ShowBarcodeResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'جلسة غير صالحة' };
    const response = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/show-loyalty-barcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      /**
       * وهويّةُ نقطة البيع معه.
       *
       * بدونها يبثّ الخادم إلى شاشات الفرع غير المربوطة كلِّها: فرعٌ
       * بثلاث نقاطٍ وثلاثِ شاشات يعرض باركوداً واحداً على الثلاث، ومن
       * مسحه من غير أصحابه أخذ بطاقتَه -- والرمزُ يُصرف مرّةً واحدة.
       */
      body: JSON.stringify({
        customerId, branchId, posDeviceId: await getPosDeviceId(),
        // شاشةُ الجهاز المدمجة (سنمي) تُرسم من هنا، فلا يُشترط اقترانُ شاشةٍ
        // والخادمُ يردّ الرابط. كانت لا تستقبل إلا بثَّ شاشةٍ مقترنة برمز،
        // فيظهر عليها البيجر (المرسوم محلّياً) ولا يظهر الباركود.
        localDisplay: builtInDisplayShowsCodes(),
      }),
    });
    const data = await response.json();
    // ورسالةُ الخادم تُعرض كما هي: هو وحده يعرف أيّ الأسباب الثلاثة وقع
    // -- جهازٌ غير مقترن، أو حسابٌ بلا صلاحية كاشير، أو عميلٌ غير مسجّل.
    if (!response.ok) return { ok: false, error: data.error || 'تعذر العرض' };
    if (typeof data.url === 'string') showBarcodeOnBuiltInDisplay(data.url, data.message);
    return { ok: true, posSession: data.posSession };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بالخادم' };
  }
}

/**
 * ويُسمع متى أضافها الزبون.
 *
 * الطلب ينتهي عند ذلك كلّه، فالكاشير لا ينتظر ضغطةً ليس بعدها شيء
 * والزبون التالي واقف. ويردّ دالّةَ فكٍّ تُنادى عند الإغلاق.
 */
export function onCardAdded(posSession: string, done: () => void): () => void {
  const channel = supabase.channel(`pos-session:${posSession}`);
  channel.on('broadcast', { event: 'card_added' }, () => {
    // ويُرفع عن الشاشة المدمجة: الخادمُ يُخفيه عن المقترنة ببثّ، وهذي
    // قد لا تكون مقترنة.
    hideCodeOnCustomerDisplay();
    done();
  }).subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* القناة أُغلقت أصلاً -- والفكُّ لا يُخفق */
    }
  };
}
