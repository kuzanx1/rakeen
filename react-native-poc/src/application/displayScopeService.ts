import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';

/**
 * أيُّ شاشةِ عميلٍ تخصّ نقطةَ البيع هذي.
 *
 * فرعٌ بثلاث نقاطِ بيعٍ وثلاثِ شاشات -- كلُّ كاشيرٍ وشاشتُه أمام زبونه --
 * كان يبثّ الباركود إلى الثلاث معاً: يرى ثلاثةُ زبائن باركوداً واحداً
 * ولا يعرف أيُّهم صاحبُه. ومن مسحه أخذ بطاقةَ غيره، فالرمزُ يُصرف مرّةً
 * واحدة ويضيع على صاحبه.
 *
 * والاختيارُ من جهاز الكاشير لا من لوحة المالك: المالك لا يعرف أيُّ
 * شاشةٍ تقف أمام أيِّ نقطةِ بيع -- وهو غالباً ليس في المحلّ.
 *
 * (نظيرها في الويب: ensurePosDeviceId وopenMyDisplayModal.)
 */

const POS_DEVICE_KEY = 'rakeen_pos_device_id';

let cachedId: string | null = null;

/**
 * معرّفٌ ثابتٌ لهذي النقطة -- يولَّد مرّةً ويبقى.
 *
 * ويُحفظ في تخزين الجهاز: من أعاد تثبيت التطبيق صار نقطةً جديدة، وهو
 * الصواب -- الربطُ لجهازٍ لا لحساب.
 */
export async function getPosDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  try {
    const stored = await getItem(POS_DEVICE_KEY);
    if (stored) {
      cachedId = stored;
      return stored;
    }
  } catch {
    // بلا تخزين يبقى البثّ على مستوى الفرع -- وهو سلوكُ ما قبل اليوم.
  }
  const bytes = new Uint8Array(8);
  // getRandomValues موجودة في هيرمس عبر polyfill الذي يحمّله supabase-js.
  // ولو غابت فالوقتُ والعشوائيةُ يكفيان لتمييز جهازٍ عن جهاز -- وهو كلُّ
  // المطلوب هنا: لا سرَّ يُحرس، إنما اسمٌ يُفرَّق به.
  try {
    // globalThis لا crypto المجرّدة: أنواعُ RN لا تعرّفها، وهي موجودةٌ
    // في وقت التشغيل عبر polyfill الذي يحمّله supabase-js.
    const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => void } };
    if (g.crypto?.getRandomValues) g.crypto.getRandomValues(bytes);
    else throw new Error('no csprng');
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const id = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  cachedId = id;
  try {
    await setItem(POS_DEVICE_KEY, id);
  } catch {
    // يبقى في الذاكرة لهذي الجلسة على الأقلّ.
  }
  return id;
}

export interface BranchDisplay {
  id: number;
  label: string | null;
  posDeviceId: string | null;
  lastSeenAt: string | null;
}

/** شاشاتُ هذا الفرع -- بلا سرٍّ ولا رمز: الكاشير يختار، لا يفتح. */
export async function listBranchDisplays(branchId: number | null): Promise<BranchDisplay[]> {
  try {
    const { data, error } = await supabase.rpc('list_branch_displays', { p_branch_id: branchId });
    if (error || !Array.isArray(data)) return [];
    return data as BranchDisplay[];
  } catch {
    return [];
  }
}

/**
 * يربط الشاشة بهذي النقطة -- أو يفكّ الربط حين يُمرَّر null.
 *
 * والربطُ حصريّ في القاعدة: نقطةُ البيع تُفرَّغ من شاشاتها السابقة أولاً،
 * فلا يبقى كاشيرٌ بدّل شاشتَه يبثّ إلى القديمة كذلك.
 */
export async function claimDisplay(deviceId: number | null): Promise<boolean> {
  try {
    const posDeviceId = await getPosDeviceId();
    const { data, error } = await supabase.rpc('claim_display_device', {
      p_device_id: deviceId,
      p_pos_device_id: posDeviceId,
    });
    return !error && !!(data as { ok?: boolean } | null)?.ok;
  } catch {
    return false;
  }
}
