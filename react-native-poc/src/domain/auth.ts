/**
 * Domain layer: plain types describing the auth/device concepts this app
 * works with — no React, no Supabase import, no fetch, no storage. Mirrors
 * the real shapes `rakeen-pos.js` already uses (DEVICE object, `profiles`
 * table row) rather than inventing a different model.
 */

export interface DeviceConfig {
  businessId: number | null;
  businessName: string | null;
  branchId: number | null;
  branchName: string | null;
}

export const EMPTY_DEVICE_CONFIG: DeviceConfig = {
  businessId: null,
  businessName: null,
  branchId: null,
  branchName: null,
};

/** Matches the `profiles` table's real columns
 *  (app/api/pos/login/route.ts, public/pos/rakeen-pos.js's
 *  loadCashierProfile) — not a redesigned shape. */
export interface CashierProfile {
  id: string;
  business_id: number;
  branch_id: number | null;
  full_name: string | null;
  user_type: string;
}

export interface BranchOption {
  id: number;
  name: string;
}
