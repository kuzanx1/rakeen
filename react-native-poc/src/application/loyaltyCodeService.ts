import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';

/**
 * رمز تأكيد المكافأة.
 *
 * الكاشير يطلبه، فيصل بطاقةَ العميل على جواله إشعاراً، فيقرؤه العميل
 * ويقوله. والرمز لا يمرّ بالكاشير ولا بالشاشة أبداً -- ولهذا يُثبت:
 * من أعطى رقم جوال غيره لا يصله شيء.
 *
 * ونداءُ الخادم هو نفسه الذي يناديه الويب، لا نسخةٌ منه.
 */
export interface RequestCodeResult {
  ok: boolean;
  requestId?: number;
  /** هل وصل جهازه فعلاً؟ بطاقةٌ لم تُضف = لا سبيل إلى إيصاله. */
  delivered?: boolean;
  error?: string;
}

/**
 * `send` يفصل إنشاء الطلب عن دفع الرمز.
 *
 * أبواب التأكيد ثلاثة، واثنان منها لا يحتاجان دفعةً: المسح ورقم
 * البطاقة. فتُطلب الدفعة حين تُختار وحدها -- وإلا أُوقظ جهاز الزبون
 * بلا سبب، واقتربت بطاقته من خنق iOS بلا مقابل.
 */
export async function requestLoyaltyCode(customerId: number, send = false): Promise<RequestCodeResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'جلسة غير صالحة' };
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/request-loyalty-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ customerId, send }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'تعذر إنشاء الرمز' };
    return { ok: true, requestId: data.requestId, delivered: !!data.delivered };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بالخادم' };
  }
}

export interface VerifyCodeResult {
  ok: boolean;
  /** كم محاولة بقيت -- يُعرض حين يخطئ، فيعرف أنه يقترب من الإغلاق. */
  triesLeft?: number;
  error?: string;
}

export async function verifyLoyaltyCode(requestId: number, code: string): Promise<VerifyCodeResult> {
  const { data, error } = await supabase.rpc('verify_loyalty_redemption_code', {
    p_request_id: requestId,
    p_code: code,
  });
  if (error) return { ok: false, error: 'تعذر التحقق' };
  const out = data as { ok?: boolean; error?: string; triesLeft?: number } | null;
  if (out?.ok) return { ok: true };
  const says: Record<string, string> = {
    expired_or_locked: 'انتهت المهلة أو كثرت المحاولات — اطلب رمزاً جديداً',
    wrong_code: 'الرمز غير صحيح',
    forbidden: 'ما عندك صلاحية',
  };
  return {
    ok: false,
    triesLeft: out?.triesLeft,
    error: says[out?.error || ''] || 'الرمز غير صحيح',
  };
}

/** التأكيد برقم البطاقة المطبوع تحت باركودها -- ثمانية أحرف. */
export async function confirmByCardNumber(requestId: number, number: string): Promise<VerifyCodeResult> {
  const { data, error } = await supabase.rpc('confirm_loyalty_request_by_number', {
    p_request_id: requestId,
    p_number: number,
  });
  if (error) return { ok: false, error: 'تعذر التحقق' };
  const out = data as { ok?: boolean; error?: string } | null;
  if (out?.ok) return { ok: true };
  const says: Record<string, string> = {
    number_mismatch: 'الرقم مو مطابق لبطاقته — أو انتهت المهلة',
    bad_number: 'الرقم ثمانية أحرف',
    forbidden: 'ما عندك صلاحية',
  };
  return { ok: false, error: says[out?.error || ''] || 'الرقم غير صحيح' };
}

/** التأكيد بمسح باركود البطاقة -- إثباتُ حيازةٍ بلا شبكةٍ عند العميل. */
export async function confirmByCard(requestId: number, token: string): Promise<VerifyCodeResult> {
  const { data, error } = await supabase.rpc('confirm_loyalty_request_by_card', {
    p_request_id: requestId,
    p_token: token,
  });
  if (error) return { ok: false, error: 'تعذر التحقق' };
  const out = data as { ok?: boolean; error?: string } | null;
  if (out?.ok) return { ok: true };
  return {
    ok: false,
    error: out?.error === 'card_mismatch'
      ? 'هذي مو بطاقة نفس العميل — أو انتهت المهلة'
      : 'تعذر التأكيد بالبطاقة',
  };
}
