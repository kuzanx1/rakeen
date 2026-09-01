import { supabase } from '../infrastructure/supabaseClient';

/**
 * Feature Parity Pass -- Refunds/Void/Cancellation. Ported from the PWA's
 * real openPinModal()/verify_pos_manager_pin() flow (public/pos/rakeen-pos.js,
 * ~line 5458): the RPC returns `true` (correct PIN), `false` (wrong PIN), or
 * `null` (this business has never set a manager PIN at all -- businesses.
 * pos_manager_pin_hash is null). All three are real, distinct outcomes the
 * caller must show differently -- collapsing null into false would tell an
 * owner who's simply never configured a PIN yet the same "wrong PIN" message
 * as an actual failed attempt.
 */
export type ManagerPinResult = 'approved' | 'incorrect' | 'not_configured' | 'error';

export async function verifyManagerPin(pin: string): Promise<ManagerPinResult> {
  try {
    const { data, error } = await supabase.rpc('verify_pos_manager_pin', { p_pin: pin });
    if (error) return 'error';
    if (data === true) return 'approved';
    if (data === false) return 'incorrect';
    return 'not_configured';
  } catch {
    return 'error';
  }
}
