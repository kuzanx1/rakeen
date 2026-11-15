import { supabase } from '../infrastructure/supabaseClient';

/**
 * كوبون يعطيه العميل للكاشير.
 *
 * check_coupon يتحقق (صالح، ما انتهى، ما خلص، الحد الأدنى) ويرجّع الخصم،
 * والكاشير يطبّقه خصماً عادياً سببه «كوبون CODE». العدّاد ينزل في القاعدة
 * لما يوصل الطلب (trigger zz_orders_record_coupon) -- حتى لو انباع بلا نت.
 * (supabase/migrations/20261115160000_discount_amount_and_coupons.sql)
 * الويب: rkCheckCoupon في public/pos/rakeen-pos.js.
 */
export interface CouponQuote {
  ok: boolean;
  /** سبب الرفض بكلام العميل («الكوبون انتهى»). */
  reason: string;
  code: string;
  kind: 'pct' | 'amount';
  pct: number;
  amount: number;
  discount: number;
}

export const COUPON_REASON_PREFIX = 'كوبون ';

export function normalizeCouponCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
}

export async function checkCoupon(code: string, subtotal: number): Promise<CouponQuote> {
  const clean = normalizeCouponCode(code);
  const base: CouponQuote = { ok: false, reason: '', code: clean, kind: 'pct', pct: 0, amount: 0, discount: 0 };
  if (clean.length < 3) return { ...base, reason: 'اكتب كود الكوبون' };
  try {
    const { data, error } = await supabase.rpc('check_coupon', { p_code: clean, p_subtotal: subtotal });
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
      kind: r.r_kind === 'amount' ? 'amount' : 'pct',
      pct: Number(r.r_pct ?? 0),
      amount: Number(r.r_amount ?? 0),
      discount: Number(r.r_discount ?? 0),
    };
  } catch {
    return { ...base, reason: 'تعذّر التحقق — تأكد من النت' };
  }
}
