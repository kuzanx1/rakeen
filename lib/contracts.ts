// Subscription contracts — shared by the admin panel, the public signing
// page (/contract/[token]) and the API routes. Pure data + pure functions
// only (no server-only imports), so the exact same clause text renders on
// screen, goes into the PDF, and gets hashed at signing time.

export const RAKEEN_PARTY = {
  name: "ركين",
  nameEn: "Rakeen",
  ownerName: "عمار وزير الثقفي",
  registrationNumber: "188147911",
  website: "rakeenapp.com",
  whatsapp: "0557015282",
  instagram: "@rakeenapp",
} as const;

// Bump whenever any clause wording changes. The version and the full
// clause text are both snapshotted into the row at signing, so an old
// signed contract always re-renders with the exact words that were signed.
export const TERMS_VERSION = "2026.10-v1";

export type BillingPeriod = "monthly" | "annual";
export type VatMode = "exclusive" | "inclusive";

export type FeatureKey =
  | "pos"
  | "zatca_invoice"
  | "offline"
  | "shift_close"
  | "kds"
  | "inventory"
  | "purchases_scan"
  | "costing_profit"
  | "reports"
  | "online_store"
  | "loyalty"
  | "tables_reservations"
  | "booking_page"
  | "multi_branch"
  | "team_permissions"
  | "delivery_apps"
  | "ai_advisor";

// Everything here is a capability that exists in the product today (see
// docs/marketing/rakeen-social-workflow.md's feature bank, sourced from
// the codebase). Never add a feature here that isn't shipped.
export const FEATURE_CATALOG: { key: FeatureKey; label: string }[] = [
  { key: "pos", label: "نقطة البيع (الكاشير) وطرق الدفع وتقسيم الفاتورة" },
  { key: "zatca_invoice", label: "الفاتورة الضريبية ورمز QR الزكاة والضريبة" },
  { key: "offline", label: "العمل بدون إنترنت مع المزامنة التلقائية" },
  { key: "shift_close", label: "إغلاق الوردية والموازنة وتقرير الإغلاق" },
  { key: "kds", label: "شاشة المطبخ (KDS) وطباعة المطبخ" },
  { key: "inventory", label: "المخزون والوصفات والتنبيهات" },
  { key: "purchases_scan", label: "المشتريات وقراءة فواتير الموردين بالتصوير" },
  { key: "costing_profit", label: "تكلفة الأطباق وصافي الأرباح والمحاسبة" },
  { key: "reports", label: "التقارير والتقرير اليومي التلقائي وتصدير Excel" },
  { key: "online_store", label: "المتجر الإلكتروني للطلب المباشر وتتبع الطلب" },
  { key: "loyalty", label: "برنامج الولاء وبطاقة العضوية واسترجاع العملاء" },
  { key: "tables_reservations", label: "الطاولات والحجوزات وقائمة الانتظار" },
  { key: "booking_page", label: "صفحة حجز المواعيد" },
  { key: "multi_branch", label: "تعدد الفروع" },
  { key: "team_permissions", label: "الموظفين والصلاحيات وسجل العمليات" },
  { key: "delivery_apps", label: "إدارة تطبيقات التوصيل وعمولاتها" },
  { key: "ai_advisor", label: "مستشار ركين الذكي" },
];

const FEATURE_KEYS = new Set<string>(FEATURE_CATALOG.map((f) => f.key));

export function featureLabel(key: string): string {
  return FEATURE_CATALOG.find((f) => f.key === key)?.label || key;
}

export function isFeatureKey(key: string): key is FeatureKey {
  return FEATURE_KEYS.has(key);
}

export type ContractOffer = {
  contract_number: string;
  plan_name: string;
  billing_period: BillingPeriod;
  price: number;
  setup_fee: number;
  vat_mode: VatMode;
  start_date: string; // YYYY-MM-DD
  branches_count: number;
  features: string[];
  special_terms: string | null;
};

export type ContractParty = {
  business_name: string;
  business_activity: string;
  city: string;
  cr_number: string;
  vat_number: string;
  owner_name: string;
  owner_id_number: string;
  phone: string;
  email: string;
};

export type Clause = { title: string; body: string[] };

export function formatSar(n: number): string {
  return `${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export function periodLabel(p: BillingPeriod): string {
  return p === "annual" ? "سنوي" : "شهري";
}

// End date of the first term: start + 1 month / 12 months - 1 day.
export function firstTermEnd(startDate: string, period: BillingPeriod): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + (period === "annual" ? 12 : 1), d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// The binding clauses. Short and protective of Rakeen by design — but this
// is not a substitute for review by a Saudi-licensed lawyer before use.
export function buildClauses(offer: ContractOffer): Clause[] {
  const annual = offer.billing_period === "annual";
  const per = annual ? "سنة" : "شهر";
  const noticeDays = annual ? 30 : 7;
  const vatLine =
    offer.vat_mode === "inclusive"
      ? "المبالغ المذكورة شاملة ضريبة القيمة المضافة."
      : "المبالغ المذكورة غير شاملة ضريبة القيمة المضافة، وتُضاف إليها متى كانت مستحقة نظامًا.";

  const clauses: Clause[] = [
    {
      title: "موضوع العقد",
      body: [
        "يمنح الطرف الأول الطرف الثاني ترخيصًا غير حصري وغير قابل للتحويل لاستخدام منصة ركين السحابية وفق الباقة والمزايا المحددة في هذا العقد، طوال مدة سريانه.",
        "لا ينقل هذا العقد أي ملكية في المنصة أو برمجياتها أو علامتها التجارية.",
      ],
    },
    {
      title: "المدة والتجديد",
      body: [
        `مدة العقد ${per} واحد${annual ? "ة" : ""} تبدأ من تاريخ البدء المحدد أعلاه، ويتجدد تلقائيًا لمدد مماثلة.`,
        `يحق لأي طرف عدم التجديد بإشعار الطرف الآخر قبل نهاية المدة السارية بـ ${noticeDays} أيام على الأقل.`,
      ],
    },
    {
      title: "الرسوم والسداد",
      body: [
        `يلتزم الطرف الثاني بسداد رسوم الاشتراك المحددة أعلاه مقدمًا في بداية كل ${per}${offer.setup_fee > 0 ? "، ورسوم التأسيس مرة واحدة عند التوقيع" : ""}.`,
        vatLine,
        "الرسوم المدفوعة غير قابلة للاسترداد بعد بدء المدة، كليًا أو جزئيًا، بما في ذلك حال الإنهاء المبكر من الطرف الثاني.",
        "يحق للطرف الأول تعديل الأسعار عند التجديد بإشعار مسبق لا يقل عن 30 يومًا.",
      ],
    },
    {
      title: "التأخر في السداد",
      body: [
        "يحق للطرف الأول إيقاف الخدمة مؤقتًا إذا تأخر السداد أكثر من 7 أيام من تاريخ الاستحقاق، دون أن يُعد ذلك إخلالًا منه، وتبقى المبالغ المستحقة دينًا في ذمة الطرف الثاني.",
      ],
    },
    {
      title: "التزامات الطرف الثاني",
      body: [
        "صحة البيانات المقدمة في هذا العقد وتحديثها عند تغيرها.",
        "المحافظة على سرية بيانات الدخول، ويتحمل مسؤولية كل ما يتم عبر حساباته وحسابات موظفيه.",
        "صحة الأسعار والضرائب والبيانات التي يدخلها في المنصة، والالتزام بالأنظمة المعمول بها ومنها أنظمة الفوترة والضريبة.",
        "عدم نسخ المنصة أو إعادة بيعها أو تأجيرها أو محاولة الوصول إلى شفرتها المصدرية أو إساءة استخدامها.",
      ],
    },
    {
      title: "التزامات الطرف الأول",
      body: [
        "إتاحة الخدمة وصيانتها وتطويرها ببذل عناية معقولة.",
        "تقديم الدعم الفني عبر قنوات التواصل المعتمدة في أوقات العمل.",
        "حماية بيانات الطرف الثاني وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.",
      ],
    },
    {
      title: "البيانات",
      body: [
        "بيانات منشأة الطرف الثاني ملك له، ويحق له طلب نسخة منها خلال 30 يومًا من انتهاء العقد، ويحق للطرف الأول حذفها بعد ذلك.",
        "يحق للطرف الأول استخدام بيانات إحصائية مجمّعة لا تكشف هوية الطرف الثاني أو عملائه لتحسين الخدمة.",
      ],
    },
    {
      title: "حدود المسؤولية",
      body: [
        "تُقدَّم الخدمة بحالتها، ولا يضمن الطرف الأول خلوها التام من الأعطال أو الانقطاع.",
        "لا يتحمل الطرف الأول أي أضرار غير مباشرة أو تبعية أو فوات ربح أو فقد بيانات ناتج عن سوء الاستخدام، ولا مسؤولية عليه عن انقطاع الإنترنت أو الأجهزة أو خدمات الأطراف الثالثة كبوابات الدفع وتطبيقات التوصيل وخدمات المراسلة.",
        "في جميع الأحوال لا تتجاوز مسؤولية الطرف الأول إجمالي ما دفعه الطرف الثاني خلال الأشهر الثلاثة السابقة للمطالبة.",
      ],
    },
    {
      title: "الملكية الفكرية",
      body: [
        "المنصة وتصاميمها وشعارها وجميع حقوقها ملك للطرف الأول.",
        "يحق للطرف الأول ذكر اسم الطرف الثاني وشعاره ضمن عملائه ما لم يعترض الطرف الثاني كتابيًا.",
      ],
    },
    {
      title: "الإنهاء",
      body: [
        "يحق للطرف الأول إيقاف الخدمة أو إنهاء العقد فورًا عند إخلال الطرف الثاني بأي من التزاماته أو إساءة استخدام المنصة.",
        "لا يُعفي الإنهاء الطرف الثاني من سداد أي مبالغ مستحقة قبله.",
      ],
    },
    {
      title: "الإشعارات والتوقيع الإلكتروني",
      body: [
        "تُعد المراسلات عبر البريد الإلكتروني أو رقم الجوال المسجلين في هذا العقد إشعارًا منتجًا لآثاره.",
        "أُبرم هذا العقد ووُقّع إلكترونيًا، ويُعد التوقيع الإلكتروني ملزمًا للطرفين وفقًا لنظام التعاملات الإلكترونية في المملكة العربية السعودية، وتُعد سجلات المنصة (التاريخ والوقت وعنوان IP والجهاز وبصمة المستند) حجة في الإثبات.",
      ],
    },
    {
      title: "النظام الواجب التطبيق",
      body: [
        "يخضع هذا العقد لأنظمة المملكة العربية السعودية، ويُسعى لحل أي خلاف وديًا، فإن تعذر فتختص به المحاكم المختصة في المملكة العربية السعودية.",
        "يمثل هذا العقد كامل الاتفاق بين الطرفين، ولا يُعتد بأي تعديل عليه إلا إذا كان مكتوبًا وموافقًا عليه من الطرفين.",
      ],
    },
  ];

  if (offer.special_terms && offer.special_terms.trim()) {
    clauses.push({ title: "شروط خاصة", body: offer.special_terms.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean) });
  }
  return clauses;
}

// ---- validation (server-authoritative; the page reuses it for UX) ----

const SA_MOBILE = /^05\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[\s-]/g, "");
}

export function normalizePhone(raw: string): string {
  let p = normalizeDigits(raw);
  if (p.startsWith("+966")) p = "0" + p.slice(4);
  else if (p.startsWith("00966")) p = "0" + p.slice(5);
  else if (p.startsWith("966")) p = "0" + p.slice(3);
  return p;
}

export function validateParty(input: Partial<Record<keyof ContractParty, unknown>>): { party?: ContractParty; error?: string } {
  const s = (v: unknown, max = 160) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const party: ContractParty = {
    business_name: s(input.business_name),
    business_activity: s(input.business_activity, 80),
    city: s(input.city, 60),
    cr_number: normalizeDigits(s(input.cr_number, 20)),
    vat_number: normalizeDigits(s(input.vat_number, 20)),
    owner_name: s(input.owner_name),
    owner_id_number: normalizeDigits(s(input.owner_id_number, 20)),
    phone: normalizePhone(s(input.phone, 20)),
    email: s(input.email, 160).toLowerCase(),
  };
  if (party.business_name.length < 2) return { error: "اكتب اسم المنشأة" };
  if (party.business_activity.length < 2) return { error: "اختر نوع النشاط" };
  if (party.city.length < 2) return { error: "اكتب المدينة" };
  if (party.owner_name.split(/\s+/).filter(Boolean).length < 3) return { error: "اكتب الاسم الثلاثي على الأقل" };
  if (!/^[12]\d{9}$/.test(party.owner_id_number)) return { error: "رقم الهوية أو الإقامة لازم يكون ١٠ أرقام ويبدأ بـ ١ أو ٢" };
  if (!SA_MOBILE.test(party.phone)) return { error: "رقم الجوال لازم يكون بصيغة 05XXXXXXXX" };
  if (!EMAIL.test(party.email)) return { error: "البريد الإلكتروني غير صحيح" };
  if (party.cr_number && !/^\d{10}$/.test(party.cr_number)) return { error: "رقم السجل التجاري لازم يكون ١٠ أرقام" };
  if (party.vat_number && !/^3\d{13}3$/.test(party.vat_number)) return { error: "الرقم الضريبي لازم يكون ١٥ رقم ويبدأ وينتهي بـ ٣" };
  return { party };
}

// Canonical JSON (sorted keys) so the same document always hashes the same.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const BUSINESS_ACTIVITIES = ["مطعم", "مقهى", "مطبخ سحابي", "وجبات سريعة", "تجزئة", "صالون", "مغسلة سيارات", "خياطة", "فندق", "عيادة", "أخرى"];
