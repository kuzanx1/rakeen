import { supabase } from '../infrastructure/supabaseClient';
import { getDeviceConfig } from './authService';

/**
 * قواعد خصم الكاشير -- يفعّلها المالك من اللوحة («الخصومات والكوبونات ←
 * قواعد الكاشير»). نظيرها في الويب: loadPosDiscountRules() في
 * public/pos/rakeen-pos.js، بنفس المعنى حرفياً:
 *
 *  - تنطبق على الخصم اللي يكتبه الكاشير من عنده بس. الخصم الجاهز والكوبون
 *    حطّهم المالك بنفسه.
 *  - reasonRequired: السبب إجباري.
 *  - maxPct / maxAmount: أعلى خصم بدون موافقة (null = بدون حد). فوقه:
 *    رمز المدير، وينكتب «(بموافقة المدير)» مع السبب.
 *
 * تنجلب مع كل فتح لنافذة الخصم (مو بذاكرة طويلة)، فتغيير المالك يوصل
 * الكاشير بدون إعادة تشغيل. قبل ترحيل 20261115200000 الأعمدة ما توجد،
 * أو بدون نت: نرجع آخر قواعد عرفناها (أول مرة = بدون قيود، زي قبل).
 */
export interface DiscountRules {
  reasonRequired: boolean;
  maxPct: number | null;
  maxAmount: number | null;
}

export const NO_DISCOUNT_RULES: DiscountRules = { reasonRequired: false, maxPct: null, maxAmount: null };

let lastKnown: DiscountRules = NO_DISCOUNT_RULES;

export async function getDiscountRules(): Promise<DiscountRules> {
  try {
    const device = await getDeviceConfig();
    if (device.businessId == null) return lastKnown;
    const { data, error } = await supabase
      .from('businesses')
      .select('pos_discount_reason_required, pos_discount_max_pct, pos_discount_max_amount')
      .eq('id', device.businessId)
      .maybeSingle();
    if (error || !data) return lastKnown;
    lastKnown = {
      reasonRequired: data.pos_discount_reason_required === true,
      maxPct: data.pos_discount_max_pct != null ? Number(data.pos_discount_max_pct) : null,
      maxAmount: data.pos_discount_max_amount != null ? Number(data.pos_discount_max_amount) : null,
    };
    return lastKnown;
  } catch {
    return lastKnown;
  }
}

/** الحد اللي ينطبق على هالنوع من الخصم (null = بدون حد). */
export function discountCap(rules: DiscountRules, kind: 'pct' | 'amount'): number | null {
  return kind === 'amount' ? rules.maxAmount : rules.maxPct;
}

/** فوق الحد؟ يحتاج رمز المدير. */
export function isOverDiscountCap(rules: DiscountRules, kind: 'pct' | 'amount', value: number): boolean {
  const cap = discountCap(rules, kind);
  return cap != null && value > cap;
}

/** السبب اللي ينحفظ مع الطلب بعد موافقة المدير. */
export function approvedReason(reason: string): string {
  const r = reason.trim();
  return r ? `${r} (بموافقة المدير)` : 'بموافقة المدير';
}
