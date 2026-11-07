/**
 * بيجر ركين -- ما يشترك فيه الخادمُ وصفحةُ الزبون.
 *
 * المفتاحُ هو client_order_uuid للطلب، يُكتب في الرابط بـbase64url (٢٢
 * حرفاً بدل ٣٦): رابطٌ أقصر يعني باركوداً أصغرَ وحدةً وأكبرَ مربّعات،
 * فيُقرأ من الورق الحراري بسهولة.
 */

export const PAGER_ORIGIN = "https://rakeenapp.com";

export function uuidToKey(uuid: string): string | null {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  let bin = "";
  for (let i = 0; i < 32; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function keyToUuid(key: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(key)) return null;
  let bin: string;
  try {
    bin = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "==");
  } catch {
    return null;
  }
  if (bin.length !== 16) return null;
  let hex = "";
  for (let i = 0; i < 16; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function pagerUrl(uuid: string): string | null {
  const key = uuidToKey(uuid);
  return key ? `${PAGER_ORIGIN}/p/${key}` : null;
}

/** قناةُ البثّ اللحظيّ لصفحة الزبون. سرّيتُها من سرّية المفتاح. */
export function pagerChannel(uuid: string): string {
  return `pager:${uuid}`;
}

/** خيارات البيجر بقيمها الافتراضية -- نفسُها في الكاشير واللوحة. */
export interface PagerSettings {
  channels: string[];
  prep_min: number;
  buffer_min: number;
  receipt: boolean;
  display: boolean;
  display_secs: number;
  remind_min: number;
  close_min: number;
  wifi: string;
  ready_msg: string;
  late_alert: boolean;
  tone: string;
}

export const PAGER_DEFAULTS: PagerSettings = {
  channels: ["dine_in", "pickup"],
  prep_min: 10,
  buffer_min: 5,
  receipt: true,
  display: true,
  display_secs: 60,
  remind_min: 3,
  close_min: 20,
  wifi: "",
  ready_msg: "",
  late_alert: true,
  tone: "chime",
};
