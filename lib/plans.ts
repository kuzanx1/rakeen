import { FEATURE_CATALOG, FeatureKey } from "./contracts";

// Rakeen's three packages. One source for the quote form, the admin panel and
// the contract feature lists.
//
// The DB has its own copy of the feature matrix: rk_plan_features() in
// supabase/migrations/20261015120000_business_plans.sql, which the businesses
// trigger uses to compute allowed_features and enforce the ceiling. Change
// both together; tools/accounting-checks/plans-matrix-sync.cjs fails when they
// drift.

export type PlanKey = "asas" | "emad" | "sarh";

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  monthly: number;
  annual: number; // two months free
  includedBranches: number;
  // Each branch beyond the included ones costs half the plan's price.
  extraBranchMonthly: number;
  extraBranchAnnual: number;
  features: FeatureKey[];
};

const ASAS: FeatureKey[] = ["pos", "zatca_invoice", "offline", "shift_close"];
const EMAD: FeatureKey[] = [...ASAS, "kds", "inventory", "purchases_scan", "costing_profit", "reports", "loyalty", "tables_reservations", "team_permissions", "delivery_apps"];
const SARH: FeatureKey[] = [...EMAD, "online_store", "booking_page", "multi_branch"];

export const PLANS: Plan[] = [
  { key: "asas", name: "أساس", tagline: "تبيع، وتطبع، وتقفل يومك", monthly: 99, annual: 990, includedBranches: 1, extraBranchMonthly: 49, extraBranchAnnual: 490, features: ASAS },
  { key: "emad", name: "عماد", tagline: "تعرف وش تكسب، والعميل يرجع لك", monthly: 179, annual: 1790, includedBranches: 1, extraBranchMonthly: 89, extraBranchAnnual: 890, features: EMAD },
  { key: "sarh", name: "صرح", tagline: "يطلبون منك مباشرة، وتكبر لأكثر من فرع", monthly: 279, annual: 2790, includedBranches: 2, extraBranchMonthly: 139, extraBranchAnnual: 1390, features: SARH },
];

export function planByKey(key: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.key === key) || null;
}

// "مستشار ركين الذكي" has no screen yet; offering it would sell something the
// customer can't use. The key stays in FeatureKey so old signed contracts
// that list it still render.
export const SELLABLE_FEATURES = FEATURE_CATALOG.filter((f) => f.key !== "ai_advisor");

// The admin's per-business overrides on top of the plan: true unlocks a
// feature the plan doesn't include, false locks one it does.
export type FeatureOverrides = Partial<Record<FeatureKey, boolean>>;

// null plan = a business from before packages existed: everything allowed, so
// nobody loses a feature the day this ships.
export function allowedFeatures(planKey: string | null | undefined, overrides: FeatureOverrides | null | undefined): Set<FeatureKey> {
  const plan = planByKey(planKey);
  if (!plan) return new Set(SELLABLE_FEATURES.map((f) => f.key));
  const set = new Set<FeatureKey>(plan.features);
  for (const [k, v] of Object.entries(overrides || {}) as [FeatureKey, boolean][]) {
    if (v === true) set.add(k);
    else if (v === false) set.delete(k);
  }
  return set;
}

export function planPrice(plan: Plan, period: "monthly" | "annual", extraBranches: number) {
  const n = Math.max(0, Math.trunc(extraBranches) || 0);
  const base = period === "annual" ? plan.annual : plan.monthly;
  const perBranch = period === "annual" ? plan.extraBranchAnnual : plan.extraBranchMonthly;
  return { base, perBranch, branches: n * perBranch, total: base + n * perBranch };
}
