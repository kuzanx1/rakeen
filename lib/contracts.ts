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
  // Where subscribers transfer their payments (contract + dashboard pay screen).
  bankName: "بنك D360",
  iban: "SA3636036036049631065967",
  accountHolder: "عمار وزير الثقفي",
};

// The bank part is editable from /admin (platform_settings key "bank");
// these values are only the fallback. lib/platformBank.ts reads it.
export type BankDetails = { bankName: string; iban: string; accountHolder: string };
export type RakeenParty = typeof RAKEEN_PARTY;

export function validateBank(input: Partial<Record<keyof BankDetails, unknown>>): { bank?: BankDetails; error?: string } {
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const bankName = s(input.bankName, 60);
  const iban = normalizeDigits(s(input.iban, 40)).toUpperCase();
  const accountHolder = s(input.accountHolder, 120);
  if (bankName.length < 2) return { error: "اكتب اسم البنك" };
  if (!/^SA\d{22}$/.test(iban)) return { error: "الآيبان لازم يبدأ بـ SA وبعده ٢٢ رقم" };
  if (accountHolder.split(" ").filter(Boolean).length < 2) return { error: "اكتب اسم صاحب الحساب كامل" };
  return { bank: { bankName, iban, accountHolder } };
}

// "SA36 3603 6036 0496 3106 5967"
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

// Bump whenever any clause wording changes. The version and the full
// clause text are both snapshotted into the row at signing, so an old
// signed contract always re-renders with the exact words that were signed.
export const TERMS_VERSION = "2026.10-v3";

export type BillingPeriod = "monthly" | "annual";
export type VatMode = "exclusive" | "inclusive";
// Where disputes go: Taif (Rakeen's home court) or the subscriber's own city.
export type Jurisdiction = "taif" | "business_city";

export function jurisdictionLabel(j: Jurisdiction): string {
  return j === "business_city" ? "محاكم مدينة المنشأة" : "محاكم مدينة الطائف";
}

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
  jurisdiction: Jurisdiction;
  // Added in v3 — absent in contracts signed before it, so always optional.
  business?: { id: number; name: string } | null;
  payments?: PaymentLine[];
  // Price before the discount (price is what's charged) and its reason.
  list_price?: number | null;
  discount_label?: string | null;
};

// The discount shown on the contract, or null when there is none.
export function discountOf(offer: Pick<ContractOffer, "price" | "list_price">): { amount: number; pct: number } | null {
  const list = Number(offer.list_price);
  if (!Number.isFinite(list) || list <= 0 || list <= offer.price) return null;
  const amount = Math.round((list - offer.price) * 100) / 100;
  return { amount, pct: Math.round((amount / list) * 1000) / 10 };
}

export type PaymentLine = { seq: number; amount: number; due_date: string };

// Calendar month step that never spills into the next month
// (31 Jan + 1 month = 28/29 Feb, not 2/3 Mar).
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

// Default schedule the admin starts from (every row stays editable).
// Monthly: `count` monthly payments of the monthly price. Annual: the
// yearly price split into `count` equal payments spread over the year.
// The setup fee rides on the first payment. Halalas are kept exact: the
// rounding remainder goes on the last payment so the rows sum to the total.
export function buildSchedule(period: BillingPeriod, price: number, setupFee: number, startDate: string, count: number): PaymentLine[] {
  const n = Math.max(1, Math.min(60, Math.trunc(count) || 1));
  const priceH = Math.round(price * 100);
  const setupH = Math.round(setupFee * 100);
  const each = period === "annual" ? Math.floor(priceH / n) : priceH;
  const stepMonths = period === "annual" ? 12 / n : 1;
  const lines: PaymentLine[] = [];
  for (let i = 0; i < n; i++) {
    let h = each;
    if (period === "annual" && i === n - 1) h = priceH - each * (n - 1);
    if (i === 0) h += setupH;
    lines.push({ seq: i + 1, amount: h / 100, due_date: addMonths(startDate, Math.round(i * stepMonths)) });
  }
  return lines;
}

// Server-side check of a schedule sent by the admin form.
export function validateSchedule(input: unknown): { lines?: PaymentLine[]; error?: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "أضف دفعة وحدة على الأقل" };
  if (input.length > 60) return { error: "أقصى عدد للدفعات ٦٠" };
  const lines: PaymentLine[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i] as Record<string, unknown>;
    const amount = typeof r?.amount === "number" ? r.amount : Number(r?.amount);
    const due = typeof r?.due_date === "string" ? r.due_date.trim() : "";
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { error: `مبلغ الدفعة ${i + 1} غير صحيح` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) return { error: `تاريخ الدفعة ${i + 1} غير صحيح` };
    if (i > 0 && due < lines[i - 1].due_date) return { error: `تاريخ الدفعة ${i + 1} قبل الدفعة اللي قبلها` };
    lines.push({ seq: i + 1, amount: Math.round(amount * 100) / 100, due_date: due });
  }
  return { lines };
}

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

// The binding clauses. Written to protect Rakeen while staying enforceable
// under Saudi law (no interest/penalty clauses, fair termination right,
// clear jurisdiction). Not a substitute for review by a Saudi-licensed
// lawyer before real use.
export function buildClauses(offer: ContractOffer, bank: BankDetails = RAKEEN_PARTY): Clause[] {
  const annual = offer.billing_period === "annual";
  const per = annual ? "سنة" : "شهر";
  const noticeDays = annual ? 30 : 7;
  const vatLine =
    offer.vat_mode === "inclusive"
      ? "المبالغ المذكورة شاملة ضريبة القيمة المضافة."
      : "المبالغ المذكورة غير شاملة ضريبة القيمة المضافة، وتُضاف إليها متى كانت مستحقة نظامًا.";
  const court =
    offer.jurisdiction === "business_city"
      ? "تختص المحاكم في مدينة المنشأة المذكورة في بيانات الطرف الثاني، دون غيرها، بنظر أي نزاع ينشأ عن هذا العقد أو يتعلق به."
      : "تختص المحاكم في مدينة الطائف، دون غيرها، بنظر أي نزاع ينشأ عن هذا العقد أو يتعلق به.";

  const clauses: Clause[] = [
    {
      title: "موضوع العقد",
      body: [
        "يمنح الطرف الأول الطرف الثاني ترخيصًا غير حصري وغير قابل للتحويل أو الترخيص من الباطن لاستخدام منصة ركين السحابية وفق الباقة والمزايا المحددة في هذا العقد، طوال مدة سريانه.",
        "لا ينقل هذا العقد أي ملكية في المنصة أو برمجياتها أو علامتها التجارية.",
        "يحق للطرف الأول تطوير المنصة وتعديل واجهاتها ومزاياها، بشرط ألا ينتقص ذلك جوهريًا من المزايا المفعّلة في هذا العقد.",
        "لا يشمل العقد الأجهزة أو الطابعات أو الإنترنت أو أي خدمة غير مذكورة فيه، ما لم يُنص عليها في الشروط الخاصة.",
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
        offer.payments && offer.payments.length > 0
          ? `يلتزم الطرف الثاني بسداد الرسوم وفق جدول الدفعات المذكور في هذا العقد، كل دفعة في تاريخ استحقاقها${offer.setup_fee > 0 ? "، وتُضاف رسوم التأسيس إلى الدفعة الأولى" : ""}. وبعد انتهاء الجدول تُسدد رسوم كل ${per} مقدمًا في بدايته ما دام العقد ساريًا.`
          : `يلتزم الطرف الثاني بسداد رسوم الاشتراك مقدمًا في بداية كل ${per}${offer.setup_fee > 0 ? "، ورسوم التأسيس مرة واحدة عند التوقيع" : ""}.`,
        `يكون السداد بالتحويل إلى حساب الطرف الأول: ${bank.bankName}، رقم الحساب الدولي (IBAN) ${bank.iban}، باسم ${bank.accountHolder}.`,
        "يرفع الطرف الثاني إيصال التحويل من لوحة التحكم الخاصة به في المنصة، ولا تُعد الدفعة مسددة إلا بعد تأكيد الطرف الأول استلامها.",
        vatLine,
        "الرسوم المدفوعة، بما فيها رسوم التأسيس، غير قابلة للاسترداد كليًا أو جزئيًا بعد بدء المدة، ولو أنهى الطرف الثاني العقد مبكرًا أو لم يستخدم الخدمة، عدا ما ورد في بند الإنهاء.",
        "يحق للطرف الأول تعديل الأسعار عند التجديد بإشعار مسبق لا يقل عن 30 يومًا، ويُعد التجديد بعد الإشعار قبولًا للسعر الجديد.",
        "يتحمل الطرف الثاني التكاليف المعقولة لمطالبة وتحصيل أي مبالغ مستحقة يتأخر في سدادها.",
      ],
    },
    {
      title: "التأخر في السداد",
      body: [
        "يحق للطرف الأول إيقاف الخدمة إذا تأخر السداد أكثر من 7 أيام من تاريخ الاستحقاق، دون أن يُعد ذلك إخلالًا منه، وتُعاد الخدمة بعد السداد الكامل.",
        "إذا استمر التأخر 30 يومًا من تاريخ الاستحقاق، يحق للطرف الأول إنهاء العقد، وتبقى المبالغ المستحقة دينًا في ذمة الطرف الثاني.",
      ],
    },
    {
      title: "التزامات الطرف الثاني",
      body: [
        "صحة البيانات المقدمة في هذا العقد وتحديثها عند تغيرها.",
        "المحافظة على سرية بيانات الدخول، ويتحمل مسؤولية كل ما يتم عبر حساباته وحسابات موظفيه.",
        "صحة الأسعار والضرائب والبيانات التي يدخلها في المنصة، والتزامه بالأنظمة المعمول بها، ومنها متطلبات الفوترة الإلكترونية والضريبة والربط مع الجهات الرسمية حسب ما ينطبق عليه.",
        "حصوله على موافقة عملائه أو المسوّغ النظامي قبل حفظ بياناتهم أو مراسلتهم عبر المنصة.",
        "توفير الأجهزة والإنترنت المناسبة، والاحتفاظ بنسخ من تقاريره وسجلاته المهمة عبر أدوات التصدير المتاحة.",
        "عدم نسخ المنصة أو إعادة بيعها أو تأجيرها أو محاولة الوصول إلى شفرتها المصدرية أو استخدامها في نشاط مخالف للأنظمة.",
      ],
    },
    {
      title: "التزامات الطرف الأول",
      body: [
        "إتاحة الخدمة وصيانتها وتطويرها ببذل عناية معقولة، مع الإشعار المسبق قدر الإمكان بأعمال الصيانة المجدولة.",
        "تقديم الدعم الفني عبر قنوات التواصل المعتمدة في أوقات العمل.",
        "حماية بيانات الطرف الثاني وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية، وعدم الإفصاح عنها إلا بطلب من جهة رسمية مختصة.",
      ],
    },
    {
      title: "البيانات والسرية",
      body: [
        "بيانات منشأة الطرف الثاني ملك له، ويحق له طلب نسخة منها خلال 30 يومًا من انتهاء العقد، ويحق للطرف الأول حذفها بعد ذلك.",
        "يحق للطرف الأول استخدام بيانات إحصائية مجمّعة لا تكشف هوية الطرف الثاني أو عملائه لتحسين الخدمة.",
        "يلتزم كل طرف بسرية ما يطّلع عليه من معلومات الطرف الآخر غير المعلنة، أثناء العقد وبعد انتهائه.",
      ],
    },
    {
      title: "حدود المسؤولية",
      body: [
        "تُقدَّم الخدمة بحالتها، ولا يضمن الطرف الأول خلوها التام من الأعطال أو الانقطاع.",
        "لا يتحمل الطرف الأول أي أضرار غير مباشرة أو تبعية أو فوات ربح أو فقد بيانات، ولا مسؤولية عليه عن انقطاع الإنترنت أو الأجهزة أو خدمات الأطراف الثالثة كبوابات الدفع وتطبيقات التوصيل وخدمات المراسلة والمنصات الحكومية.",
        "لا يضمن الطرف الأول قبول أي جهة رسمية لفواتير أو بيانات الطرف الثاني، ويبقى الطرف الثاني مسؤولًا عن التزامه النظامي.",
        "في جميع الأحوال لا تتجاوز مسؤولية الطرف الأول إجمالي ما دفعه الطرف الثاني خلال الأشهر الثلاثة السابقة للمطالبة.",
      ],
    },
    {
      title: "التعويض",
      body: [
        "يتحمل الطرف الثاني، ويعوّض الطرف الأول، عن أي مطالبة أو غرامة أو ضرر يلحق بالطرف الأول بسبب بيانات الطرف الثاني أو أسعاره أو تعامله مع عملائه أو إخلاله بهذا العقد أو بالأنظمة.",
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
        "يحق للطرف الأول إيقاف الخدمة أو إنهاء العقد فورًا عند إخلال الطرف الثاني بأي من التزاماته أو إساءة استخدام المنصة، دون استرداد لأي مبالغ.",
        "يحق للطرف الأول إنهاء العقد لأي سبب بإشعار مدته 30 يومًا، ويرد في هذه الحالة الجزء غير المستخدم من الرسوم المدفوعة مقدمًا.",
        "لا يُعفي الإنهاء الطرف الثاني من سداد أي مبالغ مستحقة قبله، وتبقى بنود السرية والمسؤولية والتعويض سارية بعده.",
      ],
    },
    {
      title: "القوة القاهرة",
      body: [
        "لا يُسأل أي طرف عن تأخر أو تعذر تنفيذ التزاماته بسبب ظروف خارجة عن إرادته، كالكوارث وانقطاع الخدمات العامة والأعطال الواسعة لمزودي البنية التحتية والقرارات الحكومية.",
      ],
    },
    {
      title: "التنازل",
      body: [
        "لا يحق للطرف الثاني التنازل عن هذا العقد أو نقله للغير إلا بموافقة كتابية من الطرف الأول.",
        "يحق للطرف الأول نقل هذا العقد إلى أي كيان يؤسسه أو يخلفه في تشغيل المنصة، بإشعار الطرف الثاني.",
      ],
    },
    {
      title: "الإشعارات والتوقيع الإلكتروني",
      body: [
        "تُعد المراسلات عبر البريد الإلكتروني أو رقم الجوال المسجلين في هذا العقد إشعارًا منتجًا لآثاره.",
        "أُبرم هذا العقد ووُقّع إلكترونيًا، ويُعد التوقيع الإلكتروني ملزمًا للطرفين وفقًا لنظام التعاملات الإلكترونية في المملكة العربية السعودية، وتُعد سجلات المنصة (التاريخ والوقت وعنوان IP والجهاز وبصمة المستند) حجة في الإثبات.",
        "يقر الموقّع بأنه مفوَّض بالتوقيع عن المنشأة، فإن لم يكن مفوَّضًا كان مسؤولًا شخصيًا عن جميع التزامات الطرف الثاني في هذا العقد.",
      ],
    },
    {
      title: "النظام الواجب التطبيق والاختصاص",
      body: [
        `يخضع هذا العقد لأنظمة المملكة العربية السعودية. ${court}`,
        "يمثل هذا العقد كامل الاتفاق بين الطرفين، ولا يُعتد بأي تعديل عليه إلا إذا كان مكتوبًا وموافقًا عليه من الطرفين، وبطلان أي بند لا يؤثر على بقية البنود.",
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
