import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildBarePassJson, buildPassJson, buildPkPass, PassData, PassEnv, WalletLabels } from "@/lib/wallet-pass";
import { buildStripPng } from "@/lib/wallet-strip";

/**
 * الخدمة التي تقف خلف بطاقة المحفظة.
 *
 * وتُصادَق بـauthenticationToken الذي كُتب داخل البطاقة نفسها، لا بجلسة
 * مستخدم: الجهاز يسأل نيابةً عن صاحبه وقد يسأل والهاتف مقفل، فليس ثمّ
 * جلسة تُقرأ. والرمز مشتقٌّ من public_token بسرٍّ لا يغادر الخادم --
 * فلا يصلح رمز بطاقةٍ لقراءة بطاقةٍ أخرى، ومن عرف الرمز العام وحده لم
 * يعرف شيئاً.
 */

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function passEnv(): PassEnv | null {
  const { PASS_KEY_PEM, PASS_CERT_PEM, PASS_TYPE_ID, PASS_TEAM_ID } = process.env;
  if (!PASS_KEY_PEM || !PASS_CERT_PEM || !PASS_TYPE_ID || !PASS_TEAM_ID) return null;
  return { PASS_KEY_PEM, PASS_CERT_PEM, PASS_TYPE_ID, PASS_TEAM_ID };
}

/** HMAC على الرمز العام. سرٌّ واحد للمنشأة كلها، ومخرجٌ لكل زبون. */
export async function passAuthToken(publicToken: string): Promise<string> {
  const secret = process.env.PASS_AUTH_SECRET || process.env.CRON_SECRET || "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(publicToken));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** مقارنة ثابتة الزمن: المقارنة العادية تسرّب الرمز حرفاً حرفاً. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authorizePass(
  authHeader: string | null,
  serial: string,
): Promise<boolean> {
  if (!authHeader) return false;
  const m = /^ApplePass\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return false;
  return timingSafeEqual(m[1], await passAuthToken(serial));
}

const WEB_SERVICE_URL = "https://rakeenapp.com/api/wallet";

/**
 * تاريخ آخر تغيير في شكل البطاقة نفسها.
 *
 * الخادم يقرّر "هل تغيّرت؟" من wallet_pass_updated_at -- وهو يتحرّك مع
 * رصيد الزبون وحده. فتغييرٌ في القالب -- حقلٌ نُقل، أو نصٌّ صيغ من
 * جديد -- لا يحرّكه، فيردّ الخادم 304 والبطاقة تبقى على شكلها القديم
 * في كل جهاز، ولا شيء يقول لماذا.
 *
 * فيُقارَن بالأحدث منهما: من كان تحديثه أقدم من القالب فبطاقته قديمة،
 * ولو لم يتغيّر رصيده منذ شهر. ويُرفع هذا التاريخ مع كل تغييرٍ يمسّ
 * شكل البطاقة.
 */
/**
 * ووقتُ القالب ماضٍ دائماً، لا رقمُ إصدارٍ يُزاد.
 *
 * يُقارَن بـwallet_pass_pushed_at الحقيقي: من دُفع إليه قبله يعود إلى
 * الطابور. فإن كُتب في المستقبل عاد **كلُّ** من دُفع إليه -- في كل
 * دورة، إلى الأبد: يُدفع، ويُعلَّم بالآن، والآنُ قبل التاريخ الموعود،
 * فيعود. حلقةٌ توقظ جوّال الزبون كل دقيقتين ولا تنتهي.
 *
 * فيُكتب وقتُ النشر نفسه -- ماضياً بدقائق، لا ساعاتٍ إلى قدّام.
 */
export const PASS_TEMPLATE_VERSION = new Date("2026-09-06T16:40:00Z");

/**
 * الأحدث بين تحديث الزبون وتغيير القالب -- ولا يتجاوز الآن.
 *
 * يخرج في ترويسة Last-Modified، والجهاز يحفظه ويعيده في
 * If-Modified-Since عند كل طلبٍ بعده. فختمٌ من المستقبل يُسمَّم به
 * الجهاز تسميماً دائماً: تُقارَن به البطاقة الحقيقية فتكون أقدم منه
 * دائماً، ويُردّ 304 عند كل تحديث حتى يمرّ ذلك الوقت فعلاً.
 *
 * وأخبثُ ما فيه أن الإضافة الجديدة تنجح -- لا ختم عندها -- فيبدو أن
 * البناء سليم والإيصال معطّل، وهما سليمان معاً.
 */
export function passLastModified(row: WalletRow): Date {
  const own = new Date(row.updatedAt);
  const newest = own.getTime() > PASS_TEMPLATE_VERSION.getTime() ? own : PASS_TEMPLATE_VERSION;
  const now = Date.now();
  return newest.getTime() > now ? new Date(now) : newest;
}

/** أيقونة رمادية بسيطة -- تُستبدل بشعار المنشأة حين يوجد. */
const FALLBACK_PNG = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
), c => c.charCodeAt(0));

/**
 * صور البطاقة.
 *
 * icon إلزامية: بلاها ترفض آبل البندل ولا تقول لماذا. وlogo هو ما يُرى
 * في أعلى البطاقة. وتُجلب من رابط المنشأة حين يوجد، ويُسكت عن فشلها --
 * بطاقةٌ بشعارٍ افتراضي خيرٌ من بطاقةٍ لا تُبنى.
 */
async function fetchImage(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    // حدٌّ أعلى: بندل البطاقة يُوقَّع ويُنقل، وصورةٌ بميغابايتين تُبطئ
    // كل فتحةٍ لها بلا أن تُرى أوضح.
    return buf.length > 0 && buf.length < 900_000 ? buf : null;
  } catch {
    return null;
  }
}

export interface PassAssets {
  iconUrl?: string | null;
  logoUrl?: string | null;
  stripUrl?: string | null;
}

/**
 * صور البطاقة: ما رفعه صاحب المطعم أولاً، ورسمُنا حيث لم يرفع.
 *
 * icon إلزامية -- بلاها ترفض آبل البندل ولا تقول لماذا. وlogo ما يُرى
 * في الأعلى. وstrip أكبر مساحة بصرية في البطاقة: من رفع صورته أخذها،
 * ومن لم يرفع أخذ شريط الأختام المرسوم بلون علامته.
 *
 * وترتيب البدائل مقصود: أصلُ المحفظة، ثم شعار الولاء، ثم شعار المنشأة،
 * ثم مربّعٌ رمادي -- فبطاقةٌ بشعارٍ عامّ خيرٌ من بطاقةٍ لا تُبنى.
 */
export async function passImages(
  fallbackLogoUrl: string,
  assets: PassAssets = {},
  strip?: Uint8Array | null,
  strip3x?: Uint8Array | null,
): Promise<{ name: string; data: Uint8Array }[]> {
  const [icon, logo, stripUpload] = await Promise.all([
    fetchImage(assets.iconUrl),
    fetchImage(assets.logoUrl),
    fetchImage(assets.stripUrl),
  ]);
  const generic = (await fetchImage(fallbackLogoUrl)) ?? FALLBACK_PNG;
  const iconFinal = icon ?? logo ?? generic;
  const logoFinal = logo ?? icon ?? generic;
  const stripFinal = stripUpload ?? strip ?? null;

  const files = [
    { name: "icon.png", data: iconFinal },
    { name: "icon@2x.png", data: iconFinal },
    { name: "logo.png", data: logoFinal },
    { name: "logo@2x.png", data: logoFinal },
  ];
  if (stripFinal) {
    // بكثافتين لا بثلاث: @2x لأكثر الأجهزة، و@3x لشاشات Pro وPro Max.
    // والاسمُ العادي يُترك -- لا جهاز يعمل عليه اليوم iOS يقبل بطاقاتنا.
    files.push({ name: "strip@2x.png", data: stripFinal });
    if (strip3x) files.push({ name: "strip@3x.png", data: strip3x });
  }
  return files;
}

export interface WalletBranchLocation {
  latitude: number;
  longitude: number;
}

export interface WalletRow {
  customerId: number;
  businessId: number;
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
  walletMessage?: string | null;
  logoUrl: string;
  updatedAt: string;
  enabled: boolean;
  iconUrl?: string | null;
  walletLogoUrl?: string | null;
  stripUrl?: string | null;
  bgColor?: string | null;
  nearbyText?: string | null;
  iconStyle?: string | null;
  customStampUrl?: string | null;
  emptyStampUrl?: string | null;
  tier?: string | null;
  customerSince?: string | null;
  totalSaved?: number | null;
  storeSlug?: string | null;
  whatsapp?: string | null;
  labels?: WalletLabels | null;
  stripMode?: "behind" | "replace";
  stripBgMode?: "auto" | "solid" | "gradient" | "image";
  stripBg1?: string | null;
  stripBg2?: string | null;
  stampLayout?: "grid" | "stagger" | "arch" | "wave";
  stripScrim?: number | null;
  stampSize?: number | null;
  locations?: WalletBranchLocation[] | null;
}

export async function loadWalletRow(
  sb: SupabaseClient,
  publicToken: string,
): Promise<WalletRow | null> {
  const { data, error } = await sb.rpc("get_wallet_pass_data", { p_token: publicToken });
  if (error || !data) return null;
  return data as WalletRow;
}

/** يبني البطاقة كاملةً موقّعةً، جاهزةً للإرسال. */
/**
 * بطاقةٌ مبسّطة: بلا ترجمة، بلا روابط، بلا حقولٍ إضافية، بكثافةٍ واحدة.
 *
 * حين ترفض المحفظة بندلاً صحيح التوقيع سليم البنية، لا يبقى إلا محتوى
 * pass.json -- وهو عشرون حقلاً لا يُعرف أيّها. فتُبنى نسختان: كاملةٌ
 * ومبسّطة، وتُجرَّبان على الجهاز نفسه. وما نجح منهما يقسم الاحتمالات
 * نصفين في مسحةٍ واحدة، بدل أن تُجرَّب عشرون.
 */
export async function renderPass(
  row: WalletRow, publicToken: string, mode: "full" | "minimal" | "bare" = "full",
  add: Set<string> = new Set(),
  drop: Set<string> = new Set(),
): Promise<Uint8Array | null> {
  const minimal = mode !== "full";
  const env = passEnv();
  if (!env) return null;
  const data: PassData = {
    customerId: row.customerId,
    publicToken,
    customerName: row.customerName,
    businessName: row.businessName,
    systemType: row.systemType,
    points: row.points,
    visits: row.visits,
    units: row.units,
    freeRewards: row.freeRewards,
    visitsThreshold: row.visitsThreshold,
    unitsThreshold: row.unitsThreshold,
    rewardLabel: row.rewardLabel,
    accentColor: row.bgColor || row.accentColor,
    tagline: row.tagline,
    walletMessage: row.walletMessage,
    authToken: await passAuthToken(publicToken),
    webServiceURL: WEB_SERVICE_URL,
    tier: row.tier,
    customerSince: row.customerSince,
    totalSaved: row.totalSaved,
    storeSlug: row.storeSlug,
    whatsapp: row.whatsapp,
    labels: row.labels,
    locations: (row.locations || []).map(l => ({
      latitude: l.latitude,
      longitude: l.longitude,
      relevantText: row.nearbyText || undefined,
    })),
  };
  const stripInput = {
    systemType: row.systemType,
    progress: row.systemType === "visits" ? row.visits : row.units,
    threshold: row.systemType === "visits" ? row.visitsThreshold : row.unitsThreshold,
    points: row.points,
    accentColor: row.accentColor,
    bgColor: row.bgColor || row.accentColor,
    iconStyle: row.iconStyle,
    stampPng: await fetchImage(row.customStampUrl),
    stampEmptyPng: await fetchImage(row.emptyStampUrl),
    // الصورة المرفوعة تدخل التوليد لا تحلّ محلّه: الشريط يُبنى طبقةً
    // فوق طبقة، وبها وحدها يصير للخلفية معنى تحت الأختام.
    bgPng: await fetchImage(row.stripUrl),
    stripMode: (row.stripMode === "replace" ? "replace" : "behind") as "replace" | "behind",
    stripBgMode: row.stripBgMode,
    stripBg1: row.stripBg1,
    stripBg2: row.stripBg2,
    stampLayout: row.stampLayout,
    stripScrim: row.stripScrim,
    stampSize: row.stampSize,
  };
  const [strip2x, strip3x] = await Promise.all([
    buildStripPng(stripInput, 2).catch(() => null),
    minimal ? Promise.resolve(null) : buildStripPng(stripInput, 3).catch(() => null),
  ]);

  const images = await passImages(
    row.logoUrl,
    { iconUrl: row.iconUrl, logoUrl: row.walletLogoUrl },
    strip2x,
    strip3x,
  );
  if (mode === "bare") {
    // الشعار والأيقونة فقط -- بلا شريط، وبلا ترجمة.
    // الشريط يُضاف بطلبه وحده: هو أثقل ما في البندل، وأول ما يُتّهم.
    const bareImages = add.has("strip")
      ? images.filter(f => f.name !== "strip@3x.png")
      : images.filter(f => !f.name.startsWith("strip"));
    return buildPkPass(buildBarePassJson(data, env, add), bareImages, env, true);
  }
  /**
   * واسم المكافأة يُحقن في اللغتين قبل بناء ملفّيهما.
   *
   * فمن كتب الإنجليزي أخذه، ومن لم يكتبه أخذ عربيَّه -- لا "Free
   * reward" العامّة: اسمُ مكافأته أصدق من اسمٍ عامّ بلغةٍ صحيحة.
   */
  const L = data.labels || {};
  const rewardCount = data.freeRewards > 1 ? ` ×${data.freeRewards}` : "";
  const labels = {
    ...L,
    // ومكافأتان جاهزتان تُقالان: البطاقة تقول "مكافأتك جاهزة: كوب
    // مجاني" سواء كان له واحدٌ أو ثلاثة -- فيصرف واحداً ويظنّ أنه
    // استوفى. والعدد يُلحَق بالاسم لأن الحقول أربعةٌ لا خامسَ لها.
    rewardValue: (L.rewardValue?.trim() || data.rewardLabel) + rewardCount,
    rewardValueEn: (L.rewardValueEn?.trim() || L.rewardValue?.trim() || data.rewardLabel) + rewardCount,
  };
  return buildPkPass(buildPassJson(data, env, minimal, drop), images, env, minimal, labels);
}
