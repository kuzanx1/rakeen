import { supabase } from '../infrastructure/supabaseClient';

/**
 * المكافأة المجانية: ما الذي يُعطى، ومن يقرره.
 *
 *   open     -- الكاشير يقرر أي صنف في السلة يصير مجاناً.
 *   products -- من قائمة بعينها وحدها. يضغط ولا يختار.
 *
 * والقائمة تُقرأ هنا لتُعرض، ويُعاد التحقق منها في الخادم عند الصرف
 * (redeem_free_reward): الشاشة تُعدَّل والخادم لا يُعدَّل، فما تمنعه
 * الشاشة يمنعه الخادم مرة أخرى.
 */
export type RewardMode = 'open' | 'products';

export interface RewardProduct {
  id: number;
  name: string;
  nameEn: string | null;
}

export interface FreeRewardConfig {
  mode: RewardMode;
  /** الأصناف التي تُعطى، حين يكون الوضع مقيّداً. */
  products: RewardProduct[];
  /** كيف يسمّيها صاحب المطعم -- businesses.loyalty_reward_label. */
  label: string;
}

const EMPTY: FreeRewardConfig = { mode: 'open', products: [], label: 'مكافأة مجانية' };

export async function getFreeRewardConfig(businessId: number): Promise<FreeRewardConfig> {
  try {
    const [bizRes, itemsRes] = await Promise.all([
      supabase.from('businesses').select('loyalty_reward_mode, loyalty_reward_label').eq('id', businessId).single(),
      supabase.from('loyalty_program_items').select('menu_item_id').eq('business_id', businessId).eq('role', 'reward'),
    ]);
    const mode: RewardMode = bizRes.data?.loyalty_reward_mode === 'products' ? 'products' : 'open';
    const label = (bizRes.data?.loyalty_reward_label as string) || EMPTY.label;
    const ids = (itemsRes.data || []).map((r: { menu_item_id: number }) => r.menu_item_id).filter(Boolean);
    if (ids.length === 0) return { mode, products: [], label };

    const { data } = await supabase.from('menu_items').select('id, name, name_en').in('id', ids);
    return {
      mode,
      label,
      products: (data || []).map((m: { id: number; name: string; name_en: string | null }) => ({
        id: m.id, name: m.name, nameEn: m.name_en,
      })),
    };
  } catch {
    // إعداداتٌ لم تُقرأ تعني وضعاً مفتوحاً، لا شاشةً معطّلة: الكاشير
    // يبقى قادراً على إعطاء المكافأة، وأسوأ ما يقع أنه يختار بنفسه.
    return EMPTY;
  }
}

export interface RedeemResult {
  ok: boolean;
  remaining?: number;
  error?: string;
}

/**
 * الصرف. كل تحقّق يقع في الخادم داخل معاملة واحدة -- الرصيد، وأن الطلب
 * مؤكَّد ولم يُستهلك، وأن الصنف مما يُعطى.
 */
export async function redeemFreeReward(
  customerId: number,
  requestId: number,
  menuItemId: number | null,
): Promise<RedeemResult> {
  try {
    const { data, error } = await supabase.rpc('redeem_free_reward', {
      p_customer_id: customerId,
      p_request_id: requestId,
      p_menu_item_id: menuItemId,
    });
    if (error) return { ok: false, error: error.message };
    const r = (data ?? {}) as { ok?: boolean; remaining?: number; error?: string };
    return { ok: !!r.ok, remaining: r.remaining, error: r.error };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

/** رسائل الخادم بالعربية، فما يقرؤه الكاشير يقول له ماذا يفعل. */
export function redeemErrorText(code?: string): string {
  switch (code) {
    case 'request_not_confirmed': return 'ما وصل تأكيد العميل — جرّب مرة ثانية';
    case 'no_rewards_left': return 'ما عنده مكافآت جاهزة';
    case 'item_not_a_reward': return 'هذا الصنف مو ضمن المكافآت';
    case 'item_required': return 'اختر الصنف المجاني أولاً';
    case 'forbidden': return 'ما عندك صلاحية';
    default: return 'تعذر استخدام المكافأة — جرّب مرة ثانية';
  }
}
