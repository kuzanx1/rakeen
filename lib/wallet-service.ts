import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildPassJson, buildPkPass, PassData, PassEnv } from "@/lib/wallet-pass";

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
export async function passImages(logoUrl: string): Promise<{ name: string; data: Uint8Array }[]> {
  let logo = FALLBACK_PNG;
  if (logoUrl) {
    try {
      const r = await fetch(logoUrl);
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.length > 0 && buf.length < 400_000) logo = buf;
      }
    } catch { /* يبقى الافتراضي */ }
  }
  return [
    { name: "icon.png", data: logo },
    { name: "icon@2x.png", data: logo },
    { name: "logo.png", data: logo },
    { name: "logo@2x.png", data: logo },
  ];
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
    accentColor: row.accentColor,
    tagline: row.tagline,
    authToken: await passAuthToken(publicToken),
    webServiceURL: WEB_SERVICE_URL,
  };
  return buildPkPass(buildPassJson(data, env), await passImages(row.logoUrl), env);
}
