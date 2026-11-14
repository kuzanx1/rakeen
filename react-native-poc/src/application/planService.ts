import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';

/**
 * الباقة -- نفس allowed_features اللي يقرأها كاشير الويب (rakeen-pos.js
 * loadPlanFeatures) ولوحة التحكم، ويحسبها trigger القاعدة من الباقة
 * واستثناءات الأدمن (lib/plans.ts). null = مطعم بلا باقة = كل شي مسموح.
 *
 * الولاء والمطبخ والمتجر لها مفاتيح في المطعم تنطفي بسقف الباقة أصلاً. هذي
 * للي ما لها مفتاح: تطبيقات التوصيل، ونسخة المطبخ، والطاولات، والهدر، وشاشة
 * العميل. آخر قراءة تنحفظ في الجهاز عشان الكاشير بدون نت ما يفتح كل شي.
 */
let features: Set<string> | null = null;
let loadedFor: number | null = null;
let inflight: Promise<void> | null = null;

const cacheKey = (businessId: number) => `rk_plan_features_${businessId}`;

export async function loadPlanFeatures(businessId: number, force = false): Promise<void> {
  if (!force && loadedFor === businessId) return;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from('businesses').select('allowed_features').eq('id', businessId).maybeSingle();
      if (error) throw error;
      const list = data && Array.isArray(data.allowed_features) ? (data.allowed_features as string[]) : null;
      features = list ? new Set(list) : null;
      await setItem(cacheKey(businessId), JSON.stringify(list));
    } catch {
      try {
        const cached = JSON.parse((await getItem(cacheKey(businessId))) || 'null');
        features = Array.isArray(cached) ? new Set(cached as string[]) : null;
      } catch {
        features = null;
      }
    }
    loadedFor = businessId;
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * آخر باقة معروفة من القرص، قبل أن تردّ الشبكة.
 *
 * الشاشة صارت تظهر من المحفوظ فوراً، و`planHas` بلا باقة محمّلة يسمح بكل
 * شيء -- فتظهر لحظةً أزرارُ ميزاتٍ ليست في الباقة ثم تختفي. هذا يملأ
 * الباقة من آخر ما حُفظ، ولا يعلّمها "محمّلة": الجلب الحقيقي يمضي كما هو.
 */
export async function hydratePlanFeatures(businessId: number): Promise<void> {
  if (loadedFor === businessId || features) return;
  try {
    const cached = JSON.parse((await getItem(cacheKey(businessId))) || 'null');
    if (loadedFor !== businessId && !features && Array.isArray(cached)) features = new Set(cached as string[]);
  } catch {
    // لا محفوظ: يبقى الافتراض حتى تردّ الشبكة.
  }
}

export function planHas(feature: string): boolean {
  return !features || features.has(feature);
}
