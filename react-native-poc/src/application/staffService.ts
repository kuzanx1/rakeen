import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem, removeItem } from '../infrastructure/mmkvStorage';

/**
 * Who is on duty. showStaffPick() / applyStaffMember() (rakeen-pos.js:6193).
 *
 * This is not cosmetic. The branch PIN is a SHARED account -- every cashier
 * on the till signs in as the same auth identity -- so `staff_member_id` is
 * the only thing on an order that says which human rang it up. Without it
 * the dashboard cannot attribute a single sale, a shift report cannot name
 * who closed it, and a discrepancy has nobody attached to it.
 */

export interface StaffMember {
  id: number;
  name: string;
}

/** The source's own key, so a device that has used the PWA keeps its pick. */
const STAFF_KEY = 'rakeen_pos_staff';

export async function listBranchStaff(branchId: number): Promise<StaffMember[]> {
  const { data } = await supabase
    .from('staff_members')
    .select('id, name')
    .eq('branch_id', branchId)
    .eq('active', true)
    .order('name');
  return (data || []).map(s => ({ id: Number(s.id), name: String(s.name) }));
}

/**
 * Persisted, not session-scoped, and the source explains why: a genuine
 * device restart clears session storage, which "used to force a re-pick of
 * who's on duty even though nothing about that actually requires a fresh
 * choice."
 */
export async function loadRememberedStaff(): Promise<StaffMember | null> {
  try {
    const raw = await getItem(STAFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.id === 'number' ? (parsed as StaffMember) : null;
  } catch {
    return null;
  }
}

export async function rememberStaff(member: StaffMember | null): Promise<void> {
  try {
    if (member) await setItem(STAFF_KEY, JSON.stringify(member));
    else await removeItem(STAFF_KEY);
  } catch {
    // Losing the remembered pick costs one extra tap next boot.
  }
}
