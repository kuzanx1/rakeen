import {
  loadCatalog,
  getBusinessType,
  getFinancialSettings,
  getHideProductImages,
  getHidePopularTab,
  getPosFeatureFlags,
  getServiceSettings,
  getDineInPayTiming,
} from './catalogService';

/**
 * كل ما تحتاجه شاشة المنتجات لتفتح، في نداء واحد وبذاكرة.
 *
 * التنقّل في هذا التطبيق يهدم الشاشة ويبنيها: الضغط على "الطلبات" ثم
 * "الرئيسية" يعيد تركيب ProductsScreen من الصفر. وكانت تلك العودة تكلّف
 * أربعة عشر ذهاباً وإياباً إلى الخادم -- سبعة استعلامات في loadCatalog
 * وحدها، وستة إعدادات، وواحداً لنوع النشاط قبلها كلها -- قبل أن يظهر
 * منتج واحد على الشاشة.
 *
 * فعلى شبكة مقهى، كل ضغطة على "الرئيسية" شاشةُ انتظار. وهذا هو البطء
 * الذي يُحسّ في الانتقالات؛ لا الرسم.
 *
 * والذاكرة هنا تُعطي ما لديها فوراً ثم تُحدِّث في الخلفية: الشاشة تظهر
 * كاملة في الحال، والجديد يحلّ محلّ القديم حين يصل. فلا انتظار، ولا
 * قائمةٌ قديمة تبقى قديمة.
 *
 * والذاكرة لا تُلغي طزاجةً كانت موجودة: كل عودة تُطلق جلباً جديداً كما
 * كانت تفعل تماماً، وتعديلات المالك من لوحة التحكم تصل كما كانت عبر
 * subscribeToBusinessSettings -- تغيّر settingsVersion فيُعاد الجلب.
 * المتغيّر الوحيد أن الكاشير لم يعد ينتظر ذلك الجلب واقفاً.
 *
 * وهي في الذاكرة لا على القرص، ومفتاحها رقم النشاط: تموت بموت التطبيق،
 * ولا يرث نشاطٌ بيانات نشاط آخر.
 */
export interface PosBootstrap {
  businessType: Awaited<ReturnType<typeof getBusinessType>>;
  catalog: Awaited<ReturnType<typeof loadCatalog>>;
  financial: Awaited<ReturnType<typeof getFinancialSettings>>;
  hideImages: Awaited<ReturnType<typeof getHideProductImages>>;
  dineInPayTiming: Awaited<ReturnType<typeof getDineInPayTiming>>;
  hidePopularTab: Awaited<ReturnType<typeof getHidePopularTab>>;
  flags: Awaited<ReturnType<typeof getPosFeatureFlags>>;
  service: Awaited<ReturnType<typeof getServiceSettings>>;
}

const cache = new Map<number, PosBootstrap>();

/** ما في الذاكرة الآن، أو null. لا شبكة ولا انتظار. */
export function getCachedPosBootstrap(businessId: number): PosBootstrap | null {
  return cache.get(businessId) ?? null;
}

/**
 * الجلب الحقيقي. نفس الاستعلامات ونفس ترتيبها ونفس تزامنها -- نوع
 * النشاط أولاً لأن loadCatalog تحتاجه، ثم البقية معاً.
 */
export async function loadPosBootstrap(businessId: number): Promise<PosBootstrap> {
  const businessType = await getBusinessType(businessId);
  const [catalog, financial, hideImages, dineInPayTiming, hidePopularTab, flags, service] = await Promise.all([
    loadCatalog(businessId, businessType),
    getFinancialSettings(businessId),
    getHideProductImages(businessId),
    getDineInPayTiming(businessId),
    getHidePopularTab(businessId),
    getPosFeatureFlags(businessId),
    getServiceSettings(businessId),
  ]);
  const bootstrap: PosBootstrap = {
    businessType,
    catalog,
    financial,
    hideImages,
    dineInPayTiming,
    hidePopularTab,
    flags,
    service,
  };
  cache.set(businessId, bootstrap);
  return bootstrap;
}

/** لتسجيل الخروج، ولاختبارٍ لا يريد أن يرث حالة اختبارٍ قبله. */
export function clearPosBootstrapCache(): void {
  cache.clear();
}
