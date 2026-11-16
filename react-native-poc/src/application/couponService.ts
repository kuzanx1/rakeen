import { supabase } from '../infrastructure/supabaseClient';

/**
 * كوبون يعطيه العميل للكاشير.
 *
 * check_coupon يتحقق (صالح، ما انتهى، ما خلص، الحد الأدنى) ويرجّع الخصم،
 * والكاشير يطبّقه خصماً عادياً سببه «كوبون CODE». العدّاد ينزل في القاعدة
 * لما يوصل الطلب (trigger zz_orders_record_coupon) -- حتى لو انباع بلا نت.
 * (supabase/migrations/20261115160000_discount_amount_and_coupons.sql)
 *
 * «منتج مجاني» (kind = 'item'، 20261116180000_coupon_free_item.sql): الكوبون
 * يرجّع المنتج وسعره، والكاشير يضيفه للسلة ويخصم سعره بسبب
 * «كوبون CODE · هدية: الاسم» -- فيطلع بالموازنة والتقارير إنه طلع مجاني.
 * الويب: rkCheckCoupon في public/pos/rakeen-pos.js.
 */
export interface CouponQuote {
  ok: boolean;
  /** سبب الرفض بكلام العميل («الكوبون انتهى»). */
  reason: string;
  code: string;
  kind: 'pct' | 'amount' | 'item';
  pct: number;
  /** منتج مجاني: سعره. */
  amount: number;
  discount: number;
  /** منتج مجاني: المنتج اللي ينضاف للسلة. */
  itemId: number | null;
  itemName: string;
}

export const COUPON_REASON_PREFIX = 'كوبون ';
/** «كوبون CODE · هدية: برجر» -- منه يعرف إن الخصم منتج مجاني. */
export const COUPON_GIFT_MARK = ' · هدية: ';

/** الكود من سبب الخصم («كوبون CODE …» ← CODE). */
export function couponCodeFromReason(reason: string): string {
  return reason.startsWith(COUPON_REASON_PREFIX) ? reason.slice(COUPON_REASON_PREFIX.length).split(' ')[0] : '';
}

export function normalizeCouponCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
}

export async function checkCoupon(code: string, subtotal: number): Promise<CouponQuote> {
  const clean = normalizeCouponCode(code);
  const base: CouponQuote = { ok: false, reason: '', code: clean, kind: 'pct', pct: 0, amount: 0, discount: 0, itemId: null, itemName: '' };
  if (clean.length < 3) return { ...base, reason: 'اكتب كود الكوبون' };
  try {
    // p_items_ok: هالجهاز يعرف يضيف المنتج المجاني. قاعدة قبل التحديث ما تعرفه.
    let { data, error } = await supabase.rpc('check_coupon', { p_code: clean, p_subtotal: subtotal, p_items_ok: true });
    if (error && /PGRST202|42883|could not find the function/i.test(`${error.code} ${error.message}`)) {
      ({ data, error } = await supabase.rpc('check_coupon', { p_code: clean, p_subtotal: subtotal }));
    }
    if (error) {
      return {
        ...base,
        reason: /PGRST202|42883|could not find the function/i.test(`${error.code} ${error.message}`)
          ? 'الكوبونات لسا ما تفعّلت عندكم'
          : 'تعذّر التحقق — تأكد من النت',
      };
    }
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!r) return { ...base, reason: 'الكوبون غير صحيح' };
    return {
      ok: r.r_ok === true,
      reason: String(r.r_reason ?? ''),
      code: String(r.r_code ?? clean),
      kind: r.r_kind === 'amount' ? 'amount' : r.r_kind === 'item' ? 'item' : 'pct',
      pct: Number(r.r_pct ?? 0),
      amount: Number(r.r_amount ?? 0),
      discount: Number(r.r_discount ?? 0),
      itemId: r.r_item_id != null ? Number(r.r_item_id) : null,
      itemName: String(r.r_item_name ?? ''),
    };
  } catch {
    return { ...base, reason: 'تعذّر التحقق — تأكد من النت' };
  }
}
