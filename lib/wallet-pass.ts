import forge from "node-forge";

/**
 * بناء ملف .pkpass وتوقيعه.
 *
 * بطاقة Apple Wallet ملفٌ مضغوط فيه: وصفٌ بصيغة JSON، وصور، وبصمةٌ لكل
 * ملف (manifest.json)، وتوقيعٌ منفصل على تلك البصمات بشهادة Pass Type
 * ID. وآبل ترفض البندل كله إن اختلّت واحدة منها.
 *
 * والتوقيع PKCS#7 منفصل -- وهو ما لا تفعله WebCrypto، ولهذا node-forge:
 * جافاسكربت خالص يعمل على Workers مع nodejs_compat. وقد أُثبت عملياً
 * قبل كتابة هذا الملف: وُقّع manifest بشهادة هبية الحقيقية وتحقّق منه
 * openssl عبر سلسلة آبل كاملة (الشهادة ← WWDR G4 ← Apple Root CA).
 *
 * ولا مكتبة zip: صيغة ZIP المخزّنة (بلا ضغط) عشرات الأسطر، وإضافة
 * اعتمادية كاملة لأجلها في حزمة Worker تُحسب بالكيلوبايت ليست مقايضة
 * رابحة.
 */

/** الوسيطة عامة -- تُنزَّل من آبل علناً، فمكانها المستودع لا الأسرار. */
export const APPLE_WWDR_G4_PEM = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
BQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsT
HUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBS
b290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UE
Aww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNh
dGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMu
MQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAf
eKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjo
v9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41t
QSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB
5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVl
PNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64D
YyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8G
A1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0
BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJv
b3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290
LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQD
AgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbD
eeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPef
x4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJ
EtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQ
A1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgp
pU8RBWk6z/Kf
-----END CERTIFICATE-----`;

export interface PassEnv {
  PASS_KEY_PEM: string;
  PASS_CERT_PEM: string;
  PASS_TYPE_ID: string;
  PASS_TEAM_ID: string;
}

export interface PassLocation {
  latitude: number;
  longitude: number;
  relevantText?: string;
}

export interface PassData {
  customerId: number;
  publicToken: string;
  customerName: string;
  businessName: string;
  systemType: "points" | "visits" | "products";
  points: number;
  visits: number;
  units: number;
  freeRewards: number;
  visitsThreshold: number;
  unitsThreshold: number;
  rewardLabel: string;
  accentColor: string;
  tagline: string;
  /** رسالةٌ حيّة تُعرض على البطاقة وتُشعر صاحبها -- أو لا شيء. */
  walletMessage?: string | null;
  authToken: string;
  webServiceURL: string;
  /** مواقع الفروع -- يُنبَّه من اقترب من أحدها. */
  locations?: PassLocation[];
  /** Bronze/Silver/Gold/Platinum -- بعتبات بطاقة الويب نفسها. */
  tier?: string | null;
  /** متى انضمّ -- ISO 8601، وتنسيقه تتولّاه المحفظة بلغة الجهاز. */
  customerSince?: string | null;
  /** ما وفّره باستبدال نقاطه -- رقمٌ خام، والعملة تُنسَّق في الجهاز. */
  totalSaved?: number | null;
  storeSlug?: string | null;
  whatsapp?: string | null;
  /** تسميات كتبها صاحب المطعم، ورايات إخفاء الحقول الاختيارية. */
  labels?: WalletLabels | null;
}

export interface WalletLabels {
  progress?: string; left?: string; ready?: string;
  customer?: string; reward?: string; tier?: string;
  saved?: string; since?: string; how?: string; howText?: string;
  rewardValue?: string;
  rewardValueEn?: string;
  hideLogoText?: boolean;
  hideTier?: boolean; hideSaved?: boolean; hideSince?: boolean;
  hideCustomer?: boolean; hideReward?: boolean; hideLinks?: boolean;
  tierBronze?: string; tierSilver?: string; tierGold?: string; tierPlatinum?: string;
}

/** "#C4FF2B" -> "rgb(196, 255, 43)". آبل لا تقبل الست عشري. */
function toRgb(hex: string, fallback = "rgb(20, 20, 20)"): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/**
 * التقدّم كما يُقرأ لا كما يُخزَّن.
 *
 * "٤ من ٦" لا "٤". والرقم وحده لا يقول شيئاً لمن ينظر إلى بطاقته في
 * الطابور -- وهذا هو الغرض كله من وضعها في المحفظة.
 */
/** ================= لغتا البطاقة ================= */

/**
 * البطاقة تتكلّم لغة صاحب الجوال.
 *
 * لا تُسأل ولا تُختار: iOS يقرأ لغة الجهاز ويأخذ المجلّد الذي يوافقها،
 * فيرى العربيُّ عربيةً والإنجليزيُّ إنجليزية -- من البطاقة نفسها،
 * بندلاً واحداً، وبلا نسخةٍ ثانية تُبنى وتُزامَن.
 *
 * وآليّتها أن تُكتب المفاتيح في pass.json بدل النصوص، وتُترجَم في
 * <lang>.lproj/pass.strings. فما في pass.json مفتاحٌ لا كلام.
 *
 * والقيم تبقى محايدة حيث أمكن -- "٣ / ٦" يقرؤه الاثنان -- لأن .strings
 * تترجم النصوص الثابتة ولا تركّب جملةً من رقمٍ متغيّر. فالرقم قيمة،
 * والكلامُ الذي حوله تسمية، وهذا أنظف من الجملتين على كل حال.
 *
 * وما كتبه صاحب المطعم -- اسم المكافأة، وعبارته -- لا يُترجم: هو
 * صوته، ولغتُه اختيارُه. ونحن نترجم صياغتنا نحن.
 */

const PASS_STRINGS: Record<string, [string, string]> = {
  //  المفتاح                عربي                        إنجليزي
  RK_DESC:        ["بطاقة ولاء",                "Loyalty card"],
  RK_POINTS:      ["نقاطك",                     "Points"],
  RK_VISITS:      ["زياراتك",                   "Visits"],
  // "رصيدك"/"Balance" توحي بمالٍ أو نقاط -- والشريط يرسم أختاماً.
  RK_UNITS:       ["ختومك",                     "Stamps"],
  // وتسمياتُ الحقول تُكبَّر وتُقصّ: طويلةٌ فوق رقمٍ مجرّد تخرج "LEFT TO YOUR REWA…".
  RK_READY:       ["مكافأتك جاهزة",              "Reward ready"],
  RK_LEFT:        ["باقي",                      "Left"],
  RK_CUSTOMER:    ["اسمك",                      "Name"],
  RK_REWARD:      ["مكافأتك",                   "Your reward"],
  RK_READY_COUNT: ["مكافآت جاهزة",              "Rewards ready"],
  RK_HOW:         ["كيف تستخدمها",              "How to use it"],
  RK_HOW_TXT:     [
    "اعرض هذه البطاقة عند الكاشير. وحين تجهز مكافأتك اطلبها منه، ويصلك تنبيه على جوالك للتأكيد قبل صرفها.",
    "Show this card at the register. When your reward is ready, ask for it — you'll get a confirmation prompt on your phone before it's redeemed.",
  ],
  RK_MEMBER_ID:   ["رقم عضويتك",                "Membership number"],
  RK_TIER:        ["مستواك",                    "Tier"],
  RK_SAVED:       ["وفّرت معنا",                 "You saved"],
  RK_SINCE:       ["عميلنا منذ",                 "Member since"],
  RK_STORE:       ["اطلب أونلاين",               "Order online"],
  RK_STORE_LINK:  ["افتح متجرنا",                "Open our store"],
  RK_WHATS:       ["واتساب",                    "WhatsApp"],
  RK_WHATS_LINK:  ["راسلنا",                    "Message us"],
  RK_THANKS:      ["شكراً لولائك",               "Thank you for your loyalty"],
  /**
   * واسمُ المكافأة قيمةٌ لا تسمية -- ومع ذلك يُترجَم.
   *
   * آبل تستبدل مفاتيح الترجمة في القيم كما في التسميات. وهو النصّ
   * الوحيد الذي يكتبه صاحب المطعم ويظهر قيمةً على وجه البطاقة، فبقاؤه
   * حرفياً يعني "كوب مجاني" في جوّالٍ إنجليزي كلُّ ما حوله إنجليزي.
   *
   * وقيمتاه هنا آخرُ ملجأ: الفعليّتان تُحقنان من إعداد المكافأة.
   */
  RK_REWARD_NAME: ["مكافأة مجانية",             "Free reward"],
  RK_MSG:         ["جديد لك",                   "For you"],
  /**
   * ونصُّ الإشعار جملةٌ لا رقم.
   *
   * changeMessage كان "%@" مجرّدة، فتخرج على الشاشة المقفلة "3" -- رقمٌ
   * بلا سياق يُقرأ خطأً أو لا يُقرأ. و%@ تُستبدل بقيمة الحقل داخل أي
   * جملة، فتُكتب الجملة هنا وتُترجَم كبقيّة النصوص.
   */
  RK_CHG_LEFT:    ["باقي لك %@ على مكافأتك 🎁",   "%@ to go until your reward 🎁"],
  RK_CHG_READY:   ["مكافأتك جاهزة: %@ 🎉",        "Your reward is ready: %@ 🎉"],
  RK_CHG_PROG:    ["عدّادك صار %@ ☕",            "You're now at %@ ☕"],
};

/**
 * ملفّ الترجمة بصيغة .strings.
 *
 * والاقتباسات تُهرَّب: اسمُ مكافأةٍ فيه علامةُ اقتباس يقطع السطر، فتُقرأ
 * البقيّة مفاتيحَ لا قيماً -- وتخرج بطاقةٌ نصفها فارغ بلا خطأٍ يُرفع.
 */
/**
 * تسميةُ صاحب المطعم تُكتب في ملفّ لغتها، لا في pass.json.
 *
 * كانت تُكتب نصّاً في البطاقة نفسها -- فتخرج كما كُتبت لكل جهاز، ومن
 * كتب "كوباتك" رآها في جوّالٍ إنجليزي "كوباتك". وسببُ ذلك أن النصّ في
 * pass.json لا يُترجَم؛ المفتاح وحده يُترجَم.
 *
 * فالمفتاح يبقى في البطاقة دائماً، وما كتبه يحلّ محلّ قيمته في ملفّ
 * لغته وحده: عربيُّه في ar.lproj وإنجليزيُّه في en.lproj. فيكتب
 * الاثنين، أو أحدهما فيبقى الآخر بترجمتنا.
 *
 * و"progress" يغطّي ثلاثة مفاتيح: النظام واحدٌ لكل مطعم، فالكتابة في
 * ثلاثتها تصيب المستعمَل ولا تضرّ الآخرَين.
 */
const LABEL_KEYS: Record<string, string[]> = {
  progress: ["RK_VISITS", "RK_UNITS", "RK_POINTS"],
  left:     ["RK_LEFT"],
  ready:    ["RK_READY"],
  customer: ["RK_CUSTOMER"],
  reward:   ["RK_REWARD"],
  tier:     ["RK_TIER"],
  saved:    ["RK_SAVED"],
  since:    ["RK_SINCE"],
  how:      ["RK_HOW"],
  howText:  ["RK_HOW_TXT"],
  rewardValue: ["RK_REWARD_NAME"],
  /**
   * ونصوصُ الإشعارات نفسها تُكتب بيده.
   *
   * هي ما يقرؤه الزبون على شاشته المقفلة -- أظهرُ من تسمية حقلٍ لا
   * يُفتح إلا بفتح البطاقة. وكانت وحدها غير قابلة للتعديل، فيغيّر
   * صاحب المطعم كل شيء ويبقى "Your reward is ready" بلغتنا لا بلغته.
   *
   * و%@ يُستبدل بقيمة الحقل -- فمن حذفها خرج نصُّه بلا رقم، ومن حذفها
   * كلَّها لم يُعرض إشعارٌ أصلاً. فتُضاف إن نسيها.
   */
  chgProgress: ["RK_CHG_PROG"],
  chgLeft:     ["RK_CHG_LEFT"],
  chgReady:    ["RK_CHG_READY"],
};

function passStringsFile(lang: 0 | 1, labels?: WalletLabels): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  // ولا تسرّبَ بين اللغتين: من كتب العربي وحده يبقى إنجليزيُّه بترجمتنا
  // -- لا عربياً في جهازٍ إنجليزي، وهي العلّة نفسها التي نصلحها.
  const over: Record<string, string> = {};
  if (labels) {
    for (const [field, keys] of Object.entries(LABEL_KEYS)) {
      const own = (labels as Record<string, unknown>)[lang === 0 ? field : field + "En"];
      if (typeof own === "string" && own.trim()) for (const k of keys) over[k] = own.trim();
    }
  }

  const body = Object.entries(PASS_STRINGS)
    .map(([k, v]) => `"${k}" = "${esc(over[k] ?? v[lang])}";`)
    .join("\n") + "\n";

  /**
   * UTF-16 لا UTF-8 -- ونصُّ آبل صريح:
   *
   *   "Save strings files that contain non-ASCII characters using the
   *    UTF-16 encoding."
   *
   * وملفّنا العربي غير ASCII كلُّه. وكُتب أولاً بـUTF-8 -- فرفضت
   * المحفظة البندل بصمت: شاشةٌ سوداء تُغلق بلا رسالة، ولا شيء يقول إن
   * السبب ترميزُ ملفٍ من عشرة. وكانت البطاقة تُضاف قبل إضافة اللغتين
   * وتوقّفت بعدها -- وهو الدليل الذي دلّ عليها.
   *
   * وcharCodeAt يُخرج وحدات UTF-16 كما هي، فالرموز التعبيرية تخرج
   * بزوجَي بدائلها صحيحةً بلا معالجةٍ خاصة.
   */
  const out = new Uint8Array(2 + body.length * 2);
  out[0] = 0xff; out[1] = 0xfe;                 // BOM: little-endian
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

export function passLocalizations(labels?: WalletLabels): { name: string; data: Uint8Array }[] {
  return [
    { name: "ar.lproj/pass.strings", data: passStringsFile(0, labels) },
    { name: "en.lproj/pass.strings", data: passStringsFile(1, labels) },
  ];
}

function progressFields(d: PassData) {
  // "٣ / ٦" لا "٣ من ٦": الشرطة تُقرأ في اللغتين، و"من" لا تُقرأ إلا
  // في واحدة -- والقيمة لا تُترجَم، إنما تُترجَم تسميتها.
  if (d.systemType === "visits") {
    return { label: "RK_VISITS", value: `${d.visits} / ${d.visitsThreshold}` };
  }
  if (d.systemType === "products") {
    return { label: "RK_UNITS", value: `${d.units} / ${d.unitsThreshold}` };
  }
  return { label: "RK_POINTS", value: String(d.points) };
}

/**
 * كم بقي -- رقماً.
 *
 * كان جملةً عربية ("باقي لك كوبان") تُفهم في لمحة، وهي أجمل. لكن
 * pass.strings تترجم نصّاً ثابتاً ولا تركّب جملةً حول رقمٍ متغيّر --
 * فإمّا جملةٌ عربيةٌ في جوالٍ إنجليزي، وإمّا رقمٌ تحت تسميةٍ مترجمة.
 * والثاني أقلّ جمالاً وأكثر صدقاً.
 */
function remainingText(d: PassData): number | null {
  if (d.systemType === "points") return null;
  const have = d.systemType === "visits" ? d.visits : d.units;
  const need = d.systemType === "visits" ? d.visitsThreshold : d.unitsThreshold;
  return Math.max(0, need - have);
}

/**
 * أعرى ما تكون البطاقة: شعارٌ واسمٌ وباركود، ولا شيء بعد.
 *
 * وهذه هي الصورة التي عملت أول مرّة -- قبل الشريط والمواقع وخدمة
 * التحديث والترجمة. فحين يُرفض كلُّ ما بعدها، تُبنى هي بعينها: إن
 * قُبلت عُرف أن العلّة فيما أُضيف، وإن رُفضت عُرف أن العلّة في
 * الحساب أو الشهادة -- ولا ثالث لهما.
 */
export function buildBarePassJson(
  d: PassData, env: PassEnv, add: Set<string> = new Set(),
): Record<string, unknown> {
  /**
   * وتُضاف إليها قطعةٌ واحدة عند الطلب.
   *
   * العارية تُقبل، والكاملة تُرفض -- وبينهما ستُّ إضافات. وتجريبُها
   * مجتمعةً لا يقول شيئاً، وتجريبُها واحدةً واحدةً يقول كلَّ شيء في
   * ثلاث مسحات. فالقسمة هنا أداة، لا احتياط.
   */
  return {
    formatVersion: 1,
    passTypeIdentifier: env.PASS_TYPE_ID,
    teamIdentifier: env.PASS_TEAM_ID,
    serialNumber: d.publicToken,
    organizationName: d.businessName,
    description: `بطاقة ولاء ${d.businessName}`,
    logoText: d.businessName,
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: toRgb(d.accentColor, "rgb(20, 20, 20)"),
    labelColor: "rgb(255, 255, 255)",
    barcodes: [{
      format: "PKBarcodeFormatQR",
      message: d.publicToken,
      messageEncoding: "iso-8859-1",
      // النصّ البديل تحت الباركود -- اسم الزبون، وقد يكون عربياً.
      ...(add.has("alt") ? { altText: d.customerName || undefined } : {}),
    }],
    ...(add.has("web") ? { webServiceURL: d.webServiceURL, authenticationToken: d.authToken } : {}),
    ...(add.has("loc") && d.locations && d.locations.length
      ? { locations: d.locations.slice(0, 10), maxDistance: 150 } : {}),
    storeCard: {
      ...(add.has("fields") ? {
        headerFields: [{ key: "progress", label: "زياراتك",
          value: `${d.visits} / ${d.visitsThreshold}`, textAlignment: "PKTextAlignmentRight" }],
        secondaryFields: [{ key: "name", label: "العميل", value: d.customerName || "—" }],
        backFields: [{ key: "id", label: "رقم عضويتك", value: d.publicToken.slice(0, 8).toUpperCase() }],
      } : {}),
      primaryFields: [{
        key: "left", label: "تقدّمك", value: d.rewardLabel,
        // رسالةُ التغيير: بها وحدها يُشعَر صاحب البطاقة حين يتغيّر
        // رصيده. وهي من القطع القليلة التي لم تُجرَّب وحدها بعد.
        ...(add.has("chg") ? { changeMessage: "%@" } : {}),
      }],
    },
  };
}

/**
 * وتُحذف منها قطعةٌ عند الطلب.
 *
 * القسمة صعوداً من العاري انتهت: كلُّ ما أُضيف إليه نجح، والكاملة
 * ترفض. فالعلّة في تفصيلٍ لا يُبلَغ بالإضافة -- عددُ حقولٍ في صفّ،
 * أو مصفوفةٌ فارغة، أو تسميةٌ بعينها. فتُقلَب القسمة: يُبدأ من
 * الراسبة ويُحذف منها واحدةٌ واحدة، وأولُ حذفٍ تنجح بعده هو الجاني.
 */
export function buildPassJson(
  d: PassData, env: PassEnv, minimal = false, drop: Set<string> = new Set(),
): Record<string, unknown> {
  const progress = progressFields(d);
  const ready = d.freeRewards > 0;
  const remaining = remainingText(d);
  /**
   * بطاقةُ الأختام أربعةُ أشياء لا خامسَ لها.
   *
   * عددُ الأكواب، وكم بقي، والاسم، والكود تحت الباركود. والمستوى
   * و"وفّرت معنا" و"عميلنا منذ" و"كيف تستخدمها" حُذفت -- لا لأنها
   * لا تعمل، بل لأن البطاقة تُقرأ في لمحةٍ واحدة وهي مطويّة في
   * الرصّة، وكلُّ سطرٍ زائدٍ يأخذ من نصيب الأربعة.
   *
   * وثابتةٌ لا تُضبط: صاحب المطعم يختار ما تُسمّى، لا ما يظهر.
   */
  const stamps = d.systemType !== "points";

  /**
   * تسميةٌ كتبها صاحب المطعم تُقدَّم على المفتاح المترجَم.
   *
   * المفتاح يُترجَم بلغة الجهاز، والمكتوبةُ لا تُترجَم -- تخرج كما
   * كُتبت لكل من يفتح البطاقة. وهذا ما أراده من كتبها: كتب "كوباتك"
   * لأنه يعرف بأي لغةٍ يخاطب زبائنه، ولا يريد "Cups" لأحد.
   *
   * والفراغ ليس اختياراً: من ترك الحقل خالياً لم يختر شيئاً، فيبقى
   * المترجَم.
   */
  // المبسّطة: نصوصٌ عربية مباشرة بلا مفاتيح ترجمة، ولا حقول اختيارية.
  const M = minimal;
  // اسم المكافأة: مفتاحٌ يُترجَم، إلا في المبسّطة فلا ملفّات لها.
  const rewardVal = M ? d.rewardLabel : "RK_REWARD_NAME";
  const L: WalletLabels = d.labels || {};
  const AR: Record<string,string> = { RK_VISITS:'زياراتك', RK_UNITS:'ختومك', RK_POINTS:'نقاطك',
    RK_READY:'مكافأتك جاهزة', RK_LEFT:'باقي', RK_CUSTOMER:'اسمك',
    RK_REWARD:'مكافأتك', RK_TIER:'مستواك', RK_READY_COUNT:'مكافآت جاهزة',
    RK_HOW:'كيف تستخدمها', RK_HOW_TXT:'اعرض هذه البطاقة عند الكاشير.',
    RK_MEMBER_ID:'رقم عضويتك', RK_THANKS:'شكراً لولائك' };
  const lbl = (key: string, own?: string) => {
    // المبسّطة بلا ملفّات ترجمة، فنصُّها يُكتب في البطاقة مباشرة.
    if (M) return (own && own.trim()) || AR[key] || key;
    // وإلا فالمفتاح دائماً -- وتسميتُه تُكتب في ملفّ لغته.
    return key;
  };

  // اسم المستوى كما سمّاه صاحب المطعم -- والعتبات تبقى كما هي.
  const tierName = ({
    Bronze: L.tierBronze, Silver: L.tierSilver,
    Gold: L.tierGold, Platinum: L.tierPlatinum,
  } as Record<string, string | undefined>)[d.tier || ""] || d.tier;
  return {
    formatVersion: 1,
    passTypeIdentifier: env.PASS_TYPE_ID,
    teamIdentifier: env.PASS_TEAM_ID,
    // الرقم التسلسلي هو الرمز العام للزبون: موجودٌ أصلاً، وفريد، ولا
    // يكشف شيئاً عنه. ولا يُخترع له معرّفٌ ثانٍ يُحفظ ويُزامن.
    serialNumber: d.publicToken,
    organizationName: d.businessName,
    description: M ? `بطاقة ولاء ${d.businessName}` : "RK_DESC",
    /**
     * واسمُ المقهى فوق البطاقة اختيار.
     *
     * آبل تكتبه إلى جانب الشعار -- ومن شعارُه اسمُه مكتوباً (وأكثرها
     * كذلك) يخرج له الاسم مرّتين متلاصقتين، ويأكل عرضاً هو أضيق ما
     * في البطاقة. فمن أراده أخذه، ومن شعارُه يكفي أطفأه.
     */
    ...(drop.has("logotext") || d.labels?.hideLogoText ? {} : { logoText: d.businessName }),
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: toRgb(d.accentColor, "rgb(20, 20, 20)"),
    labelColor: "rgb(255, 255, 255)",
    /**
     * لا لمعةَ فوق الشريط.
     *
     * آبل تضع انعكاساً لامعاً افتراضياً على strip.png -- أثرٌ من عهدٍ
     * كانت الواجهات فيه تُصقل. وهو يمرّ فوق أي تصميمٍ يُرسم هناك
     * فيغسل ألوانه ويقطعه بقوسٍ لم يرسمه أحد. وشريطُنا مصمّم، لا
     * صورةٌ عابرة تحتمل صقلاً.
     */
    ...(M ? {} : { suppressStripShine: true }),
    webServiceURL: d.webServiceURL,
    authenticationToken: d.authToken,
    // الباركود هو الرمز نفسه: الكاشير يمسحه فيجد الزبون بلا أن يسأله
    // رقم جواله ولا أن يكتبه.
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: d.publicToken,
        messageEncoding: "iso-8859-1",
        altText: d.publicToken.slice(0, 8).toUpperCase(),
      },
    ],
    // يُنبَّه من اقترب من فرع. عشرة على الأكثر -- حدُّ آبل، لا حدُّنا.
    ...(d.locations && d.locations.length ? { locations: d.locations.slice(0, 10), maxDistance: 150 } : {}),
    storeCard: {
      /**
       * ثلاثة في الترويسة -- وهي التي تُرى والبطاقة مطويّة في الرصّة.
       *
       * وكان فيها واحد: التقدّم. فمن نظر إلى رصّة بطاقاته لم يرَ من
       * بطاقتنا إلا رقماً. والمستوى يقول له أين هو، والجاهزُ يناديه.
       */
      headerFields: drop.has("hdr") ? [] : [
        /**
         * ومفتاحُ هذا الحقل "readyCount" لا "ready".
         *
         * كان "ready" -- وهو مفتاح الحقل الأساسي نفسه حين تجهز
         * المكافأة. وآبل تشترط أن يكون المفتاح فريداً في البطاقة
         * كلّها لا في صفّه: مفتاحان متشابهان يعنيان بطاقةً تُرفض
         * بصمت، ولا شيء يقول أين التكرار.
         */
        ...(ready && !stamps && !drop.has("hdrready")
          ? [{
              key: "readyCount",
              label: lbl("RK_READY", L.ready),
              value: String(d.freeRewards),
              textAlignment: "PKTextAlignmentRight",
              // والإشعار يخرج من هنا بدل الحقل الأساسي المحذوف.
              changeMessage: "%@",
            }]
          : []),
        ...(!stamps && d.tier && !L.hideTier && !drop.has("hdrtier")
          ? [{ key: "tier", label: lbl("RK_TIER", L.tier), value: tierName, textAlignment: "PKTextAlignmentRight" }] : []),
        /**
         * والعدّاد يُشعِر بنفسه.
         *
         * كان بلا changeMessage اتّكالاً على حقل "كم باقي" -- وذاك
         * يتجمّد على اسم المكافأة ما دامت عند الزبون مكافأةٌ لم
         * يصرفها. فمن جمع مكافأةً ثم اشترى لم يصله شيء: العدّاد وحده
         * تغيّر، وهو صامت. وأكثرُ الزبائن ولاءً أوّلُ من يقع فيها.
         */
        {
          key: "progress",
          label: lbl(progress.label, L.progress),
          value: progress.value,
          textAlignment: "PKTextAlignmentRight",
          changeMessage: M ? "%@" : "RK_CHG_PROG",
        },
      ],
      /**
       * الحقل الأول أكبر ما في البطاقة، فيحمل أهمّ ما فيها:
       * مكافأةٌ جاهزة إن كانت، وإلا فكم بقي.
       *
       * وchangeMessage ليس زينة: به وحده تُظهر المحفظة إشعاراً حين
       * يتغيّر الحقل. وبدونه يتحدّث الرصيد في صمت، ولا يعرف صاحبه.
       */
      /**
       * لا حقل أساسي حين تُرسم الأختام.
       *
       * آبل ترسم الحقل الأساسي **فوق** الشريط لا تحته -- هذا قالبها،
       * لا خيارٌ فيه. فنصٌّ كبير هناك يطمس الأختام التي بُني الشريط
       * كلّه لأجلها، ويخرج وجهُ البطاقة مزدحماً بشيئين يتنازعان مكاناً
       * واحداً.
       *
       * والأختام تقول ما كان يقوله النصّ: ثلاثةٌ ممتلئة من ستّة تُقرأ
       * في لمحة، و"باقي ٣" تحتها تكرارٌ يحجبها. والبطاقات التي يُحتذى
       * بها لا تكتب فوق أختامها شيئاً.
       *
       * والنقاط تُستثنى: لا أختام لها -- موجةٌ هادئة -- فالنصّ فوقها
       * هو ما يقول الرصيد.
       */
      ...(d.systemType === "points" ? {
      primaryFields: [
        ready
          ? { key: "ready", label: lbl("RK_READY", L.ready), value: rewardVal, changeMessage: M ? "%@" : "RK_CHG_READY" }
          : {
              // رقمٌ وحده تحت تسميةٍ مترجمة: الجملة العربية كانت أجمل،
              // لكنها لا تُترجَم -- و"باقي ٢" بالعربي و"2 left" بالإنجليزي
              // خيرٌ من جملةٍ عربيةٍ في جوالٍ إنجليزي.
              key: "left",
              label: lbl("RK_LEFT", L.left),
              value: remaining === null ? rewardVal : String(remaining),
              changeMessage: M ? "%@" : "RK_CHG_LEFT",
            },
      ],
      } : {}),
      secondaryFields: drop.has("sec") ? [] : [
        { key: "name", label: lbl("RK_CUSTOMER", L.customer), value: d.customerName || "—" },
        /**
         * وحقلُ "كم بقي" هو نفسه حقلُ "جاهزة".
         *
         * لو أُفرد للجاهزة حقلٌ خامس لخالف الأربعة. ولو حُذفت لخرجت
         * بطاقةُ من له مكافأةٌ تنتظره تقول "باقي ٦" ولا تقول إن له
         * شيئاً -- فيمرّ على الكاشير ولا يطلبه.
         *
         * فالحقل واحدٌ ووجهاه اثنان: رقمٌ ما لم تجهز، واسمُ المكافأة
         * حين تجهز. وchangeMessage يجعل الانقلاب بينهما إشعاراً على
         * شاشته المقفلة.
         */
        ...(stamps
          ? [{
              key: "left",
              label: ready ? lbl("RK_READY", L.ready) : lbl("RK_LEFT", L.left),
              value: ready ? rewardVal : String(remaining ?? 0),
              textAlignment: "PKTextAlignmentRight",
              changeMessage: M ? "%@" : (ready ? "RK_CHG_READY" : "RK_CHG_LEFT"),
            }]
          : L.hideReward ? [] : [{ key: "reward", label: lbl("RK_REWARD", L.reward), value: rewardVal, textAlignment: "PKTextAlignmentRight" }]),
      ],
      /**
       * صفٌّ ثالث: ما وفّره ومتى انضمّ.
       *
       * والرقمان يُرسلان خامّين -- عدداً وتاريخاً بصيغة ISO -- وتتولّى
       * المحفظة تنسيقهما بلغة الجهاز وعملة بلده. فيرى العربيُّ "٤٥٠ ر.س"
       * والإنجليزيُّ "SAR 450"، من قيمةٍ واحدة أرسلناها. ولو نسّقناها
       * نحن لخرجت بلغتنا في كل جهاز.
       *
       * والحدّ أربعةٌ لهذين الصفّين معاً حين يكون الباركود مربّعاً --
       * وباركودنا مربّع. فاثنان هنا واثنان فوق، لا أكثر.
       */
      /**
       * حقلُ الرسالة: يظهر حين تُكتب، ويختفي حين تُمحى.
       *
       * وهو الباب الوحيد الذي تعطيه آبل لرسالةٍ تصل شاشة العميل
       * المقفلة: لا إشعارَ حرّاً يُرسل إلى بطاقة، إنما قيمةُ حقلٍ
       * تتغيّر فتُعرض بـchangeMessage. فعرضُ اليوم الوطني وسؤالُ
       * الجودة وترجيعُ غير النشط -- كلُّها تُكتب هنا.
       *
       * وواحدٌ يكفي: رسالتان في وقتٍ واحد تتزاحمان على شاشةٍ لا تُقرأ
       * إلا بلمحة، والأحدث يُلغي ما قبله.
       */
      ...(d.walletMessage && !drop.has("msg")
        ? { auxiliaryFields: [{
            key: "msg",
            label: lbl("RK_MSG"),
            value: d.walletMessage,
            changeMessage: "%@",
          }] }
        : drop.has("aux") ? {} : { auxiliaryFields: (M || stamps) ? [] : [
        ...(d.totalSaved && d.totalSaved > 0 && !L.hideSaved
          ? [{
              key: "saved", label: lbl("RK_SAVED", L.saved),
              value: Math.round(d.totalSaved),
              currencyCode: "SAR",
            }]
          : []),
        ...(d.customerSince && !L.hideSince
          ? [{
              key: "since", label: lbl("RK_SINCE", L.since),
              value: d.customerSince,
              dateStyle: "PKDateStyleMedium",
              timeStyle: "PKDateStyleNone",
              textAlignment: "PKTextAlignmentRight",
            }]
          : []),
      ] }),
      /**
       * وظهرُ بطاقة الأختام فارغ.
       *
       * لا شرحَ ولا روابطَ ولا عبارة: من يقلب بطاقةَ ولاءٍ ليقرأ عبارةً
       * قليل، وأربعةُ حقولٍ في وجهها تقول كل ما يحتاجه.
       */
      backFields: drop.has("back") ? [] : stamps ? [] : [
        // اسمُ المطعم وعبارتُه لا يُترجمان: هما صوته، ولغتُهما اختياره.
        { key: "tagline", label: d.businessName, value: d.tagline || "RK_THANKS" },
        { key: "how", label: lbl("RK_HOW", L.how), value: lbl("RK_HOW_TXT", L.howText) },
        { key: "id", label: "RK_MEMBER_ID", value: d.publicToken.slice(0, 8).toUpperCase() },
        /**
         * روابطٌ تُضغط في ظهر البطاقة.
         *
         * attributedValue يقبل وسم <a> -- وهو الموضع الوحيد في البطاقة
         * كلها الذي يقبل ضغطة تفتح شيئاً. فيصير ظهرُها بابَ متجره
         * وواتسابه، لا صفحةَ نصٍّ تُقرأ مرة.
         *
         * وvalue يبقى نصّاً عادياً إلى جانبه: من لم يُعرض له المنسَّق
         * -- جهازٌ قديم أو قارئُ شاشة -- قرأ الرابط مكتوباً.
         */
        ...(!M && d.storeSlug && !L.hideLinks
          ? [{
              key: "store", label: "RK_STORE",
              value: `https://${d.storeSlug}.rakeenapp.com`,
              attributedValue: `<a href='https://${d.storeSlug}.rakeenapp.com'>${d.storeSlug}.rakeenapp.com</a>`,
            }]
          : []),
        ...(!M && d.whatsapp && !L.hideLinks
          ? [{
              key: "whats", label: "RK_WHATS",
              value: d.whatsapp,
              attributedValue: `<a href='https://wa.me/${d.whatsapp.replace(/[^0-9]/g, "")}'>${d.whatsapp}</a>`,
            }]
          : []),
      ],
    },
  };
}

/** SHA-1 لكل ملف -- هي ما تشترطه آبل في manifest.json، لا SHA-256. */
async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * التوقيع: PKCS#7 منفصل على بايتات manifest.json.
 *
 * والوسيطة تُضاف إلى البندل ولا تُوقِّع: بدونها لا يستطيع الجهاز ربط
 * شهادتنا بجذر آبل، فيرفض البطاقة وهي موقّعة صحيحاً.
 */
export function signManifest(manifestBytes: Uint8Array, env: PassEnv): Uint8Array {
  const cert = forge.pki.certificateFromPem(env.PASS_CERT_PEM);
  const key = forge.pki.privateKeyFromPem(env.PASS_KEY_PEM);
  const wwdr = forge.pki.certificateFromPem(APPLE_WWDR_G4_PEM);

  const p7 = forge.pkcs7.createSignedData();
  // بايتاتٌ خام لا نصّ: createBuffer بلا ترميز تعامل السلسلة على أنها
  // وحدات bytes كما هي، وهو المطلوب -- وتمرير "binary" ترفضه أنواعها.
  // والبناء بالتقطيع لا بـspread واحد: مصفوفةٌ بطول manifest تُمرَّر
  // معاملاتٍ تتجاوز حدّ المكدّس على المدخلات الكبيرة.
  let manifestBinary = "";
  for (let i = 0; i < manifestBytes.length; i += 4096) {
    manifestBinary += String.fromCharCode(...manifestBytes.subarray(i, i + 4096));
  }
  p7.content = forge.util.createBuffer(manifestBinary);
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i) & 0xff;
  return out;
}

/* ============ ZIP مخزّن، بلا اعتمادية ============
   .pkpass ملف ZIP عادي. والبنية المخزّنة (طريقة 0، بلا ضغط) بضعة
   حقول ثابتة -- وإضافة مكتبة ضغط كاملة إلى حزمة Worker لأجلها ليست
   مقايضة رابحة. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);           // النسخة المطلوبة
    lv.setUint16(8, 0, true);            // طريقة 0 = مخزّن
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    locals.push(local, f.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + f.data.length;
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const chunk of [...locals, ...centrals, end]) { out.set(chunk, p); p += chunk.length; }
  return out;
}

/**
 * البندل كاملاً: الوصف، والصور، والبصمات، والتوقيع.
 *
 * والصور إلزامية: بطاقة بلا icon.png ترفضها آبل بلا رسالة تقول لماذا.
 */
export async function buildPkPass(
  passJson: Record<string, unknown>,
  images: { name: string; data: Uint8Array }[],
  env: PassEnv,
  minimal = false,
  labels?: WalletLabels,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [
    { name: "pass.json", data: enc.encode(JSON.stringify(passJson)) },
    ...images,
    // مجلّدا اللغة: iOS يأخذ الموافق للغة الجهاز ويتجاهل الآخر. وبصمتاهما
    // تدخلان manifest كبقيّة الملفات -- وبندلٌ فيه ملفٌّ خارج البصمات
    // ترفضه آبل بلا رسالة.
    ...(minimal ? [] : passLocalizations(labels)),
  ];

  const manifest: Record<string, string> = {};
  for (const f of files) manifest[f.name] = await sha1Hex(f.data);
  const manifestBytes = enc.encode(JSON.stringify(manifest));

  files.push({ name: "manifest.json", data: manifestBytes });
  files.push({ name: "signature", data: signManifest(manifestBytes, env) });
  return buildZip(files);
}
