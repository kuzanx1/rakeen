import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';

/**
 * Feature Parity Pass -- Loyalty. Ported from the PWA's real
 * renderLoyaltyWaitStep() (public/pos/rakeen-pos.js, ~1693-1758): a
 * two-device OTP-style flow -- the cashier requests a redemption, the
 * CUSTOMER confirms it themselves on their own phone's loyalty-card page
 * (a real, separate device/session this app never touches), and the
 * cashier's screen polls loyalty_redemption_requests.status until it
 * changes. This deliberately calls the SAME real production API route
 * (app/api/pos/request-loyalty-redemption) the PWA already uses -- not a
 * reimplementation -- via the same RAKEEN_API_BASE_URL host
 * authService.ts's real login call already established as the precedent
 * for RN calling a web API route directly (this app has no server of its
 * own). Inherently online-only (it requires the customer's own phone to
 * reach the same backend) -- never claimed to work offline, matching the
 * PWA's own equivalent limitation.
 */

export type LoyaltyRedemptionStatus = 'pending' | 'confirmed' | 'rejected' | 'expired';

export interface RequestRedemptionResult {
  ok: boolean;
  requestId?: number;
  error?: string;
}

export async function requestLoyaltyRedemption(customerId: number): Promise<RequestRedemptionResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'جلسة غير صالحة' };
    const response = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/request-loyalty-redemption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ customerId }),
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, error: data.error || 'تعذر بدء عملية الاستبدال' };
    return { ok: true, requestId: data.requestId };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بالخادم' };
  }
}

/** Real-time status of one request -- 'pending' until the customer acts
 *  (or respond_loyalty_redemption_request's own expiry sweep marks it
 *  'expired'), matching the PWA's exact polling contract. */
export async function getLoyaltyRedemptionStatus(requestId: number): Promise<LoyaltyRedemptionStatus | null> {
  const { data, error } = await supabase.from('loyalty_redemption_requests').select('status').eq('id', requestId).single();
  if (error || !data) return null;
  return data.status as LoyaltyRedemptionStatus;
}
