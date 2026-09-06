import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildPassJson, buildPkPass, PassData, PassEnv } from "@/lib/wallet-pass";
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
    // مرةً واحدة باسم @2x: الشريط مُولَّد بضعف الكثافة أصلاً، وتكراره
    // بالاسم العادي يضاعف حجم البندل بلا أن يُرى أوضح.
    files.push({ name: "strip@2x.png", data: stripFinal });
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
  logoUrl: string;
  updatedAt: string;
  enabled: boolean;
  iconUrl?: string | null;
  walletLogoUrl?: string | null;
  stripUrl?: string | null;
  bgColor?: string | null;
  nearbyText?: string | null;
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
export async function renderPass(row: WalletRow, publicToken: string): Promise<Uint8Array | null> {
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
    authToken: await passAuthToken(publicToken),
    webServiceURL: WEB_SERVICE_URL,
    locations: (row.locations || []).map(l => ({
      latitude: l.latitude,
      longitude: l.longitude,
      relevantText: row.nearbyText || undefined,
    })),
  };
  const strip = await buildStripPng({
    systemType: row.systemType,
    progress: row.systemType === "visits" ? row.visits : row.units,
    threshold: row.systemType === "visits" ? row.visitsThreshold : row.unitsThreshold,
    points: row.points,
    accentColor: row.bgColor || row.accentColor,
  }).catch(() => null);

  const images = await passImages(
    row.logoUrl,
    { iconUrl: row.iconUrl, logoUrl: row.walletLogoUrl, stripUrl: row.stripUrl },
    strip,
  );
  return buildPkPass(buildPassJson(data, env), images, env);
}
