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

// What the customer reads in a quote. `feature` ties an item to a lockable
// key, so unticking that feature in the quote form drops the item; items
// without one (the menu, orders, settings...) come with every package.
// `short` is the item's name in the one-line summary of أساس that the
// higher packages show, so a صرح quote still fits one A4 page.
export type PlanItem = { text: string; short?: string; feature?: FeatureKey };

const ASAS_ITEMS: PlanItem[] = [
  { text: "نقطة البيع، وطرق الدفع (كاش، وشبكة، ودفع مقسّم)، وتقسيم الفاتورة", short: "الكاشير", feature: "pos" },
  { text: "الفاتورة الضريبية برمز QR", short: "الفاتورة الضريبية", feature: "zatca_invoice" },
  { text: "العمل بدون إنترنت والمزامنة لما يرجع", short: "العمل بدون إنترنت", feature: "offline" },
  { text: "إغلاق الوردية والموازنة وتقرير الإغلاق", short: "إغلاق الوردية", feature: "shift_close" },
  { text: "إدارة المنيو: المنتجات والأقسام والإضافات والأسعار", short: "المنيو" },
  { text: "سجل الطلبات والاسترجاع", short: "الطلبات والاسترجاع" },
  { text: "ملخّص مبيعات اليوم، والتقرير اليومي التلقائي", short: "التقرير اليومي" },
  { text: "الموظفين بالاسم والرقم السري", short: "الموظفين" },
  { text: "الإعدادات وبيانات الفاتورة", short: "الإعدادات" },
];
const EMAD_ITEMS: PlanItem[] = [
  { text: "شاشة المطبخ وطباعة المطبخ", feature: "kds" },
  // The cashiers lock it with loyalty (its barcode is the point of it).
  { text: "شاشة العميل: يشوف طلبه وباركود الولاء", feature: "loyalty" },
  { text: "المخزون والوصفات وتنبيهات النقص والاستهلاك التلقائي", feature: "inventory" },
  { text: "المشتريات، وقراءة فواتير الموردين بالتصوير", feature: "purchases_scan" },
  { text: "تكلفة كل منتج، وصافي الربح، والمصاريف والمحاسبة", feature: "costing_profit" },
  { text: "العملاء، وبرنامج الولاء، وبطاقة المحفظة", feature: "loyalty" },
  { text: "الطاولات والحجوزات وقائمة الانتظار", feature: "tables_reservations" },
  { text: "تطبيقات التوصيل وحساب عمولاتها", feature: "delivery_apps" },
  { text: "صلاحيات الموظفين وسجل العمليات", feature: "team_permissions" },
  { text: "التقارير الكاملة وتصدير Excel", feature: "reports" },
];
const SARH_ITEMS: PlanItem[] = [
  { text: "المتجر الإلكتروني: طلب مباشر وتتبّع ودفع بالبطاقة، بدون عمولة", feature: "online_store" },
  { text: "صفحة حجز المواعيد للعملاء", feature: "booking_page" },
  { text: "إدارة الفروع وتقارير لكل فرع", feature: "multi_branch" },
  { text: "دعم أولوية" },
];

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
  items: PlanItem[]; // only what this package adds over the one below it
};

const ASAS: FeatureKey[] = ["pos", "zatca_invoice", "offline", "shift_close"];
const EMAD: FeatureKey[] = [...ASAS, "kds", "inventory", "purchases_scan", "costing_profit", "reports", "loyalty", "tables_reservations", "team_permissions", "delivery_apps"];
const SARH: FeatureKey[] = [...EMAD, "online_store", "booking_page", "multi_branch"];

export const PLANS: Plan[] = [
  { key: "asas", name: "أساس", tagline: "تبيع، وتطبع، وتقفل يومك", monthly: 99, annual: 990, includedBranches: 1, extraBranchMonthly: 49, extraBranchAnnual: 490, features: ASAS, items: ASAS_ITEMS },
  { key: "emad", name: "عماد", tagline: "تعرف وش تكسب، والعميل يرجع لك", monthly: 179, annual: 1790, includedBranches: 1, extraBranchMonthly: 89, extraBranchAnnual: 890, features: EMAD, items: EMAD_ITEMS },
  { key: "sarh", name: "صرح", tagline: "يطلبون منك مباشرة، وتكبر لأكثر من فرع", monthly: 279, annual: 2790, includedBranches: 2, extraBranchMonthly: 139, extraBranchAnnual: 1390, features: SARH, items: SARH_ITEMS },
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

// The "included" section of a quote for a package. أساس lists its items in
// full; the higher packages put أساس into one summary line and list the rest,
// so even صرح stays on a single A4 page. `checked` is what's ticked in the
// quote form: an unticked feature drops its item, and a ticked feature the
// package doesn't include is added at the end.
export function quoteIncluded(plan: Plan, checked: Iterable<string>): { baseLine: string[] | null; bullets: string[] } {
  const on = new Set(checked);
  const keep = (i: PlanItem) => !i.feature || on.has(i.feature);
  const order = PLANS.slice(0, PLANS.indexOf(plan) + 1);
  const extras = SELLABLE_FEATURES.filter((f) => on.has(f.key) && !plan.features.includes(f.key)).map((f) => f.label);
  if (plan.key === "asas") return { baseLine: null, bullets: [...ASAS_ITEMS.filter(keep).map((i) => i.text), ...extras] };
  return {
    baseLine: ASAS_ITEMS.filter(keep).map((i) => i.short || i.text),
    bullets: [...order.slice(1).flatMap((p) => p.items.filter(keep).map((i) => i.text)), ...extras],
  };
}
