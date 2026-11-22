/**
 * «جوال»: الطلبُ الذي جاء بالهاتف.
 *
 * يقف في صفِّ تطبيقات التوصيل لأن سؤال الكاشير واحد -- «من وين جا هذا
 * الطلب؟» -- ويدُه تذهب إلى ذلك الصفّ أصلاً. ولا يشبهها في المال: طلبُ
 * كيتا مدفوعٌ في تطبيقها قبل أن يصل، وطلبُ الجوال يُدفع هنا كاشاً أو
 * شبكة. فهو خيارٌ في الصفّ، لا منصّةً في قاعدة البيانات.
 *
 * ولهذا لا صفَّ له في `delivery_platforms`: لو أُضيف لاحتاج صفّاً في كل
 * منشأة، ولاحتاج عموداً يقول إنه غير مدفوعٍ مسبقاً، ولظهر في تقرير
 * «المبيعات حسب التطبيق» تطبيقاً. فيُحفظ بما هو موجود:
 *
 *     channel = delivery  +  delivery_platform_id = NULL  +  آخر أربعة
 *
 * والأربعةُ هنا آخرُ أرقام جوال الزبون بدل آخر أرقام فاتورة التطبيق --
 * نفسُ العمود ونفسُ قيده (أربعة أرقام أو لا شيء)، ونفسُ الغرض: ما
 * يُنادى به الطلب. وهذا الاجتماع لم يقع قطّ في البيانات قبل اليوم
 * (فُحص: صفرُ طلبات)، فلا يلتبس بطلبٍ قديم.
 */

/** معرّفٌ موجبُه مستحيل: معرّفات المنصّات كلها موجبة. للواجهة وحدها. */
export const PHONE_PLATFORM_ID = -1;

export const PHONE_PLATFORM_LABEL = 'جوال';

export function isPhonePlatform(id: number | null | undefined): boolean {
  return id === PHONE_PLATFORM_ID;
}

/** ما يُرسل للخادم: «جوال» ليس منصّةً، فلا معرّف له. */
export function platformIdForServer(id: number | null | undefined): number | null {
  return id == null || isPhonePlatform(id) ? null : id;
}

/**
 * المصدرُ المختارُ ابتداءً لطلب التوصيل -- أوّلُ ما في الصفّ.
 *
 * كان الصفُّ يُفتح على أوّل تطبيقٍ حين توجد تطبيقات، ويُفتح على لا شيء
 * حين لا توجد -- فمطعمٌ بلا تطبيقاتٍ يضغط «توصيل» ويدفع، فيُحفظ الطلبُ
 * بلا مصدرٍ البتّة: لا منصّةً ولا «جوال» ولا آخرَ أربعة. ثم يُقرأ في
 * اللوحة «توصيل» عارياً، وصاحبُ المطعم يسأل: أين «جوال»؟ (أبلغه
 * ٢٠٢٦/١١/٢٠، الطلب ٥٧.)
 *
 * والقاعدةُ الآن واحدةٌ في العميلين: ما يراه الكاشيرُ أوّلَ الصفِّ هو
 * المختار. فإن لم تكن ثمّة تطبيقات كان «جوال» أوّلَه -- وهو الصحيح،
 * إذ لا مصدرَ غيرُه ممكن. ولا يُعاد الاختيارُ إن كان قائماً.
 */
export function defaultDeliverySourceId(
  platformIds: number[],
  phoneOrdersEnabled: boolean,
  current: number | null = null,
): number | null {
  if (current != null) return current;
  if (platformIds.length > 0) return platformIds[0];
  return phoneOrdersEnabled ? PHONE_PLATFORM_ID : null;
}

/**
 * هل هذا الطلبُ المحفوظ طلبُ جوال؟
 *
 * كان الجوابُ يُؤخذ من آخرِ أربعة: توصيلٌ بلا منصّةٍ ومعه أربعة = جوال.
 * وهي علامةٌ ناقصة -- طلبٌ لم تُكتب فيه الأربعةُ يُقرأ «توصيل» عارياً،
 * وهو ما شكا منه صاحبُ المطعم (الطلب ٥٧، ٢٠٢٦/١١/٢٠: توصيل، كاش، بلا
 * منصّةٍ وبلا أربعة).
 *
 * والعلامةُ الصحيحةُ في المال لا في الأربعة، وهي قاعدةٌ يفرضها
 * العميلان نفساهما منذ أوّل يوم:
 *
 *   • طلبُ منصّةٍ (كيتا، جاهز) مدفوعٌ في تطبيقها قبل أن يصل، فيُحفظ
 *     payment_method = 'delivery_platform' دائماً -- وكان ذلك قبل
 *     «جوال» أيضاً، لكلِّ طلب توصيل بلا استثناء.
 *   • طلبُ الجوال يُدفع هنا: كاش أو شبكة أو مقسوم.
 *   • وطلبُ المتجر الإلكتروني يُعرف بـ source = 'online'.
 *
 * فتوصيلٌ من الكاشير، بلا منصّة، ومدفوعٌ عندنا = جوال، قطعاً. ولا
 * تلتبس بطلبٍ قديم: القديمُ كلُّه 'delivery_platform'.
 *
 * وتبقى الأربعةُ علامةً مساعدة لمن لا يقرأ طريقةَ الدفع أصلاً.
 */
export function isPhoneOrderRow(o: {
  channel?: string | null;
  platformName?: string | null;
  deliveryPlatformId?: number | null;
  paymentMethod?: string | null;
  source?: string | null;
  platformInvoiceLast4?: string | null;
}): boolean {
  if (o.channel !== 'delivery') return false;
  if (o.platformName || o.deliveryPlatformId != null) return false;
  if (o.source === 'online') return false;
  if (o.paymentMethod && o.paymentMethod !== 'delivery_platform') return true;
  return !!o.platformInvoiceLast4;
}

/**
 * اسمُ المصدر كما يُطبع ويُعرض -- من طلبٍ محفوظ أو من طلبٍ في اليد.
 * فاضي لما ما يكون للطلب مصدرٌ خارجي أصلاً.
 */
export function platformLabelOf(o: {
  channel?: string | null;
  platformName?: string | null;
  deliveryPlatformId?: number | null;
  paymentMethod?: string | null;
  source?: string | null;
  platformInvoiceLast4?: string | null;
}): string {
  if (o.platformName) return o.platformName;
  return isPhoneOrderRow(o) ? PHONE_PLATFORM_LABEL : '';
}
