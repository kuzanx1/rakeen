import { NativeModules, Platform } from 'react-native';
import { RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';

/**
 * «فيه تحديث جديد» -- لنسخة الرابط المباشر بس (rakeenapp.com/android).
 *
 * قوقل بلاي وأبل يحدّثون التطبيق لحالهم، أما الملف المباشر (السنمي وأغلب
 * أجهزة الكاشير) فما يتحدّث أبداً، والكاشير ما يدري إن فيه نسخة جديدة
 * إلا لو أحد قال له. فالتطبيق يسأل /api/app-version عند الفتح والرجوع له
 * (بلا مؤقّت)، ولو نسخته أقدم يطلع شريط بزر يفتح الرابط.
 *
 * نسخة قوقل بلاي ما تسأل: الملف المباشر موقّع بمفتاح ثاني فما ينركّب فوقها.
 */
const PLAY_INSTALLER = 'com.android.vending';
const DISMISS_KEY = 'rk_update_dismissed_code';

interface AppInfo {
  versionCode: number;
  versionName: string;
  installer: string | null;
}

export function appInfo(): AppInfo | null {
  const m = NativeModules.RakeenAppInfoModule;
  if (!m) return null;
  const c = typeof m.getConstants === 'function' ? m.getConstants() : m;
  const versionCode = Number(c?.versionCode) || 0;
  if (!(versionCode > 0)) return null;
  return {
    versionCode,
    versionName: String(c?.versionName || ''),
    installer: typeof c?.installer === 'string' ? c.installer : null,
  };
}

/** نزل من قوقل بلاي (فيه تقييم داخل التطبيق، وبلاي يحدّثه). */
export function installedFromPlay(): boolean {
  return Platform.OS === 'android' && appInfo()?.installer === PLAY_INSTALLER;
}

export interface AvailableUpdate {
  versionName: string;
  versionCode: number;
  url: string;
}

/** null = ما فيه تحديث، أو مو نسخة الرابط المباشر، أو الكاشير قال «لاحقاً» لنفس النسخة. */
export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null;
  const me = appInfo();
  if (!me || me.installer === PLAY_INSTALLER) return null;
  try {
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/app-version`);
    if (!res.ok) return null;
    const body = (await res.json()) as { android?: { versionName?: string; versionCode?: number; url?: string } };
    const a = body?.android;
    const code = Number(a?.versionCode) || 0;
    if (!a || !(code > me.versionCode) || !a.url) return null;
    const dismissed = Number(await getItem(DISMISS_KEY).catch(() => null)) || 0;
    if (dismissed >= code) return null;
    return { versionName: String(a.versionName || ''), versionCode: code, url: String(a.url) };
  } catch {
    return null; // بلا نت: المرة الجاية
  }
}

/** «لاحقاً»: ما يرجع يطلع لنفس النسخة، ويطلع للي بعدها. */
export async function dismissAppUpdate(versionCode: number): Promise<void> {
  try {
    await setItem(DISMISS_KEY, String(versionCode));
  } catch {
    // يرجع يطلع بالفتح الجاي، ما فيه ضرر.
  }
}
