import {
  loadCatalog,
  getBusinessType,
  getFinancialSettings,
  getHideProductImages,
  getHidePopularTab,
  getPosFeatureFlags,
  getServiceSettings,
  getDineInPayTiming,
  readCatalogCache,
} from './catalogService';
import * as kvStorage from '../infrastructure/mmkvStorage';
import { hydratePlanFeatures } from './planService';

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
 * ومفتاحها رقم النشاط: لا يرث نشاطٌ بيانات نشاط آخر.
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

/**
 * وعلى القرص كذلك -- لأوّل فتحٍ بعد تشغيل التطبيق.
 *
 * ذاكرة الجلسة تموت بموت التطبيق، فكان كل تشغيل جديد يقف على علامة
 * التحميل حتى تنتهي الشبكة من كل شيء: الكاشير يدخل رمزه ثم ينتظر، والشريط
 * العلوي ظاهر وعمود الطلب فارغ. الآن آخر ما عُرف يُعرض فوراً، والجلب
 * يحلّ محلّه حين يصل -- نفس ما تفعله الذاكرة داخل الجلسة.
 *
 * الإعدادات تُحفظ هنا، والمنيو محفوظ أصلاً في ذاكرة loadCatalog نفسها
 * (نسخة العمل بلا إنترنت) فلا يُكتب مرتين.
 */
const SETTINGS_KEY_PREFIX = 'rakeen_pos_bootstrap_v1:';

async function persistSettings(businessId: number, b: PosBootstrap): Promise<void> {
  try {
    const { catalog: _catalog, ...settings } = b;
    await kvStorage.setItem(SETTINGS_KEY_PREFIX + businessId, JSON.stringify(settings));
  } catch {
    // الذاكرة الحيّة تكفي هذي الجلسة.
  }
}

const hydrating = new Map<number, Promise<PosBootstrap | null>>();

/** يملأ ذاكرة الجلسة من القرص إن كانت فارغة. لا يلمس الشبكة ولا يرمي. */
export function hydratePosBootstrap(businessId: number): Promise<PosBootstrap | null> {
  const have = cache.get(businessId);
  if (have) return Promise.resolve(have);
  const running = hydrating.get(businessId);
  if (running) return running;
  const p = (async () => {
    try {
      const [raw, catalog] = await Promise.all([
        kvStorage.getItem(SETTINGS_KEY_PREFIX + businessId),
        readCatalogCache(businessId),
        hydratePlanFeatures(businessId),
      ]);
      if (!raw || !catalog || catalog.categories.length === 0) return null;
      const settings = JSON.parse(raw) as Omit<PosBootstrap, 'catalog'>;
      if (!settings || !settings.financial || !settings.flags || !settings.service) return null;
      const boot: PosBootstrap = { ...settings, catalog };
      // جلبٌ حقيقي سبق القرص؟ هو الأحدث، لا يُكتب فوقه.
      if (!cache.has(businessId)) cache.set(businessId, boot);
      return cache.get(businessId) ?? boot;
    } catch {
      return null;
    }
  })();
  hydrating.set(businessId, p);
  void p.finally(() => hydrating.delete(businessId));
  return p;
}

export function getCachedPosBootstrap(businessId: number): PosBootstrap | null {
  return cache.get(businessId) ?? null;
}

const loading = new Map<number, Promise<PosBootstrap>>();

/** جلبٌ واحد جارٍ يتقاسمه كل من طلبه -- الإقلاع يسبق الشاشة إليه. */
export function loadPosBootstrap(businessId: number): Promise<PosBootstrap> {
  const running = loading.get(businessId);
  if (running) return running;
  const p = fetchPosBootstrap(businessId);
  loading.set(businessId, p);
  void p.catch(() => {}).then(() => loading.delete(businessId));
  return p;
}

async function fetchPosBootstrap(businessId: number): Promise<PosBootstrap> {
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
  let bootstrap: PosBootstrap = {
    businessType,
    catalog,
    financial,
    hideImages,
    dineInPayTiming,
    hidePopularTab,
    flags,
    service,
  };
  /* بلا شبكة: المنيو رجع من نسخته المحلية، لكن قارئات الإعدادات لا ترمي --
     ترجع افتراضاتها (ضريبة ١٥٪، ولاء مفعّل، بلا بيجر...). وافتراضٌ ليس
     إعدادَ هذا المطعم. فتُؤخذ آخر إعدادات محفوظة بدل الافتراض. */
  if (catalog.usingOfflineSnapshot) {
    try {
      const raw = await kvStorage.getItem(SETTINGS_KEY_PREFIX + businessId);
      const saved = raw ? (JSON.parse(raw) as Omit<PosBootstrap, 'catalog'>) : null;
      if (saved && saved.financial && saved.flags && saved.service) bootstrap = { ...saved, catalog };
    } catch {
      // تبقى الافتراضات.
    }
  }
  cache.set(businessId, bootstrap);
  // منيو من النسخة المحلية (الشبكة سقطت) لا يُحفظ معه إعدادات: هي الأخرى
  // رجعت بقيمها الافتراضية، وحفظها يمحو الإعدادات الصحيحة المحفوظة.
  if (!catalog.usingOfflineSnapshot) void persistSettings(businessId, bootstrap);
  return bootstrap;
}

export function clearPosBootstrapCache(): void {
  cache.clear();
}
