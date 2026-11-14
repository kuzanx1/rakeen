import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as kvStorage from '../infrastructure/mmkvStorage';
import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { Platform } from 'react-native';
import { explainNetworkError } from '../domain/clockSanity';
import {
  DeviceConfig,
  EMPTY_DEVICE_CONFIG,
  CashierProfile,
  BranchOption,
} from '../domain/auth';

/**
 * Application layer: orchestrates Supabase + the real `/api/pos/login`
 * route + MMKV (Checkpoint 8 -- was AsyncStorage; see
 * infrastructure/mmkvStorage.ts's own doc comment for why). Ported logic
 * from public/pos/rakeen-pos.js
 * (device provisioning around its "provSubmitBtn" handler,
 * `attemptCashierLogin`/`loadCashierProfile`) — same backend contract,
 * same business rules, decoupled from every `document.*` call the
 * original has it tangled with. No backend change: still the same
 * Supabase Auth + the same rate-limited PIN-login proxy route, per
 * docs/react-native-migration/00-protection-and-rollback.md's explicit
 * "don't rebuild the backend" rule.
 */

const DEVICE_CONFIG_KEY = 'rakeen_pos_device'; // same key name as the web app's localStorage, different storage engine
const CASHIER_PROFILE_CACHE_PREFIX = 'rakeen_pos_profile_cache:';

export async function getDeviceConfig(): Promise<DeviceConfig> {
  try {
    const raw = await kvStorage.getItem(DEVICE_CONFIG_KEY);
    if (!raw) return EMPTY_DEVICE_CONFIG;
    return { ...EMPTY_DEVICE_CONFIG, ...JSON.parse(raw) };
  } catch {
    return EMPTY_DEVICE_CONFIG;
  }
}

async function saveDeviceConfig(config: DeviceConfig): Promise<void> {
  await kvStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(config));
}

export async function clearDeviceConfig(): Promise<void> {
  await kvStorage.removeItem(DEVICE_CONFIG_KEY);
}

export type ProvisionResult =
  | { status: 'error'; message: string }
  | { status: 'branch-selected'; device: DeviceConfig }
  | { status: 'choose-branch'; businessId: number; businessName: string; branches: BranchOption[] }
  /** The branch has no POS code yet; the owner is still signed in to set it. */
  | { status: 'needs-pin'; businessId: number; businessName: string; branch: BranchOption };

/**
 * رمز الفرع وقت التجهيز -- نفس كاشير الويب (rakeen-pos.js provFinishBranch).
 *
 * كان التجهيز يربط الجهاز بالفرع ويطلع، والرمز ينسوّى من لوحة التحكم بس.
 * فرع بلا رمز = شاشة رمز ما أحد يقدر يعدّيها. فلو الفرع ما له حساب كاشير
 * (نفس فحص اللوحة POS_READINESS) يرجع needs-pin والمالك لسا مسجّل دخول.
 */
async function finishBranch(businessId: number, businessName: string, branch: BranchOption): Promise<ProvisionResult> {
  const { data: till, error: tillError } = await supabase
    .from('profiles')
    .select('id')
    .eq('branch_id', branch.id)
    .eq('user_type', 'employee')
    .limit(1);
  // Only when the check itself succeeded: a failed check read as "no code"
  // would reset the branch's code on every one of its devices.
  if (!tillError && Array.isArray(till) && till.length === 0) {
    return { status: 'needs-pin', businessId, businessName, branch };
  }
  const device: DeviceConfig = { businessId, businessName, branchId: branch.id, branchName: branch.name };
  await saveDeviceConfig(device);
  await supabase.auth.signOut();
  return { status: 'branch-selected', device };
}

/** Creates the branch's POS code with the owner's session (the same
 *  /api/pos/provision-branch the dashboard calls), then binds the device. */
export async function setBranchPin(
  businessId: number,
  businessName: string,
  branch: BranchOption,
  pin: string,
): Promise<{ status: 'error'; message: string } | { status: 'branch-selected'; device: DeviceConfig }> {
  if (!/^\d{4}$/.test(pin)) return { status: 'error', message: 'الرمز لازم يكون ٤ أرقام.' };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { status: 'error', message: 'انتهت الجلسة — سجّل دخول مرة ثانية.' };
  try {
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/provision-branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ branchId: branch.id, pin }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'error', message: out.error || 'تعذر حفظ الرمز.' };
  } catch {
    return { status: 'error', message: explainNetworkError(undefined, 'تعذر الاتصال — جرّب مرة ثانية.') };
  }
  const device: DeviceConfig = { businessId, businessName, branchId: branch.id, branchName: branch.name };
  await saveDeviceConfig(device);
  await supabase.auth.signOut();
  return { status: 'branch-selected', device };
}

/**
 * Owner/manager signs in once to provision this device with a
 * business+branch, then is signed out immediately -- the branch PIN
 * (loginCashierWithPin below) is the real day-to-day credential, exactly
 * as the current web app already works (see rakeen-pos.js's own comment:
 * "الفرع أدناه هو الحساب الحقيقي").
 */
/** نفس نص lib/accountSuspended.ts. آيفون بلا ذكر الدفع (App Store 3.1.1). */
export function accountSuspendedMessage(): string {
  return Platform.OS === 'ios'
    ? 'هذا الحساب موقوف مؤقتاً. راجع صاحب المحل.'
    : 'حسابك موقوف مؤقتاً: توقف الكاشير بسبب اشتراك غير مسدد. تواصل مع دعم ركين عشان يرجع.';
}

/** الموقوف تخفي القاعدة ملفه عنه، والخادم وحده يفرّقه عن فشل التحميل. */
async function fetchAccountSuspended(accessToken: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/account-status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const out = await res.json();
    return out.suspended === true;
  } catch {
    return null;
  }
}

/** null = ما عرفنا (بلا نت مثلاً): تبقى الشاشة على حالها ولا ينقفل أحد بالغلط. */
export async function checkAccountSuspended(): Promise<boolean | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? fetchAccountSuspended(session.access_token) : null;
}

/** ينادي onChange لحظة يوقف الأدمن المطعم أو يفعّله (lib/accountSuspended.ts). */
export function subscribeToAccountStatus(businessId: number, onChange: () => void): () => void {
  try {
    const channel = supabase.channel(`account-status:${businessId}`);
    channel.on('broadcast', { event: 'changed' }, () => onChange()).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  } catch {
    // إعادة دخول سريعة على قناة لسا تنغلق: يكفي فحص الرجوع للتطبيق وعودة النت.
    return () => {};
  }
}

export async function provisionDevice(email: string, password: string): Promise<ProvisionResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // الإيميل أو كلمة السر الغلط ليست خطأ شبكة: تُقال كما هي. أما فشل
    // الاتصال فقد يكون تاريخ الجهاز (السنمي بعد انطفاء).
    // ومهلة الطلب تصل بنصّ المحرّك الإنجليزي "Aborted"، فلا يُعرض كما هو.
    const netFail = !error || /network request failed|fetch|abort/i.test(error.message || '');
    return { status: 'error', message: netFail ? explainNetworkError(undefined, 'تعذر الاتصال بالخادم — تحقق من الإنترنت وحاول مرة ثانية.') : error.message };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('business_id, user_type')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) {
    const suspended = !!data.session && (await fetchAccountSuspended(data.session.access_token)) === true;
    await supabase.auth.signOut();
    return { status: 'error', message: suspended ? accountSuspendedMessage() : 'تعذر تحميل الحساب' };
  }
  if (profile.user_type === 'employee') {
    await supabase.auth.signOut();
    return { status: 'error', message: 'لازم تسجّل دخول كمدير أو مالك عشان تجهّز الجهاز.' };
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', profile.business_id)
    .single();
  const businessName = business?.name || '';

  const branchesRes = await supabase
    .from('branches')
    .select('id, name')
    .eq('business_id', profile.business_id);
  let branches: BranchOption[] | null = branchesRes.data;

  if (branchesRes.error) {
    await supabase.auth.signOut();
    return { status: 'error', message: 'تعذر تحميل الفروع.' };
  }
  if (!branches || branches.length === 0) {
    // كل تسجيل ينشئ «الفرع الرئيسي»؛ لو انحذف أو ما انشأ، ننشئه بدل ما يعلق
    const { data: created, error: createError } = await supabase
      .from('branches')
      .insert({ business_id: profile.business_id, name: 'الفرع الرئيسي' })
      .select('id, name')
      .single();
    if (createError || !created) {
      await supabase.auth.signOut();
      return { status: 'error', message: 'ما فيه فرع لهذا المطعم، وتعذر إنشاؤه — أضف فرع من لوحة التحكم ← الإعدادات ← الفروع.' };
    }
    branches = [created];
  }

  if (branches.length === 1) {
    return finishBranch(profile.business_id, businessName, branches[0]);
  }

  return {
    status: 'choose-branch',
    businessId: profile.business_id,
    businessName,
    branches,
  };
}

export async function selectBranch(
  businessId: number,
  businessName: string,
  branch: BranchOption,
): Promise<ProvisionResult> {
  return finishBranch(businessId, businessName, branch);
}

export type CashierLoginResult =
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: CashierProfile };

/**
 * Deliberately calls the SAME rate-limited `/api/pos/login` proxy the web
 * app uses -- never supabase.auth.signInWithPassword() directly. That
 * route's own comment explains why: a direct call never touches Rakeen's
 * backend at all, so a 4-digit PIN (10,000 combinations) would have
 * nothing but Supabase's own account-wide throttling standing between an
 * attacker and unlimited guesses. Reusing the existing endpoint, not
 * reimplementing its lockout logic here.
 */
export async function loginCashierWithPin(branchId: number, pin: string): Promise<CashierLoginResult> {
  let json: { session?: { access_token: string; refresh_token: string }; userId?: string; error?: string; code?: string };
  try {
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, pin }),
    });
    json = await res.json();
    if (json.code === 'account_suspended') return { status: 'error', message: accountSuspendedMessage() };
    if (!res.ok || !json.session || !json.userId) {
      return { status: 'error', message: json.error || 'رمز الفرع غلط.' };
    }
  } catch {
    return { status: 'error', message: explainNetworkError(undefined, 'تعذر الاتصال بالخادم — تحقق من الإنترنت.') };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: json.session.access_token,
    refresh_token: json.session.refresh_token,
  });
  if (sessionError) {
    return { status: 'error', message: sessionError.message };
  }

  const profile = await loadCashierProfile(json.userId);
  if (!profile) {
    return { status: 'error', message: 'تعذر تحميل بيانات الجهاز' };
  }
  return { status: 'ok', profile };
}

/** مفتاحُ supabase-js لجلسته في AsyncStorage: sb-<project ref>-auth-token. */
const SUPABASE_SESSION_KEY = 'sb-jgrlefclttoazamzvwca-auth-token';

/**
 * يرجّع الكاشير المحفوظ عند فتح التطبيق -- بلا رمز وبلا نت.
 *
 * كان التطبيق يبدأ كل مرة من شاشة الرمز، والرمز يُتحقق منه عند الخادم
 * (/api/pos/login). فسنمي فُصل عنه النت ثم أُعيد تشغيله لا يدخل أبداً:
 * «تعذر الاتصال بالخادم» -- والكاشير نفسه يبيع ويطبع بلا نت ما دام مفتوحاً.
 * وكاشير الويب يرجع جلسته المحفوظة من أول يوم (initAuth)، فصار مثله.
 *
 * بلا نت لا يُسأل الخادم أصلاً: getSession بتوكن منتهٍ يحاول تجديده ويعيد
 * المحاولة نصف دقيقة، فتُقرأ الجلسة المحفوظة كما هي، والملف من آخر نسخة
 * محفوظة. وsupabase-js لا يمسح جلسته عند فشل الشبكة -- يمسحها فقط حين
 * يرفضها الخادم -- فالجلسة الموجودة هنا جلسةٌ صالحة، وتتجدد وحدها لما يرجع النت.
 */
export async function restoreCashierSession(branchId: number): Promise<CashierProfile | null> {
  /*
   * المحفوظ أولاً، حتى والنت شغّال.
   *
   * كان التشغيل -- مع وجود جلسة صالحة -- ينتظر رحلتين قبل أن يظهر أي شيء:
   * تجديد التوكن ثم قراءة الملف. فكل فتحٍ للتطبيق دوّارة تحميل طولها طول
   * الشبكة. والملف المحفوظ هو نفسه الذي يُدخَل به بلا نت؛ فيُدخَل به فوراً،
   * والتجديد والقراءة يمضيان في الخلفية.
   *
   * وإن رفض الخادم الجلسة (أُلغيت أو انتهت نهائياً) تمسحها supabase-js
   * وتُطلق SIGNED_OUT، فيرجع التطبيق لشاشة الرمز (onCashierSignedOut).
   */
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY);
    const storedUserId: string | null = raw ? (JSON.parse(raw)?.user?.id ?? null) : null;
    if (storedUserId) {
      const cached = await cachedCashierProfile(storedUserId);
      if (cached && cached.user_type === 'employee' && cached.branch_id === branchId) {
        void supabase.auth
          .getSession()
          .then(({ data }) => (data.session ? loadCashierProfile(storedUserId) : null))
          .catch(() => null);
        return cached;
      }
    }
  } catch {
    // لا محفوظ صالح: المسار العادي تحته.
  }
  const net = await NetInfo.fetch().catch(() => null);
  const offline = net?.isConnected === false;
  let userId: string | null = null;
  if (!offline) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    } catch {
      userId = null;
    }
  }
  if (!userId) {
    try {
      const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY);
      userId = raw ? (JSON.parse(raw)?.user?.id ?? null) : null;
    } catch {
      userId = null;
    }
  }
  if (!userId) return null;
  const profile = offline ? await cachedCashierProfile(userId) : await loadCashierProfile(userId);
  // جلسةُ مالكٍ أو جهازٌ أُعيد ربطه بفرع آخر: شاشةُ الرمز كما كانت.
  if (!profile || profile.user_type !== 'employee' || profile.branch_id !== branchId) return null;
  return profile;
}

async function cachedCashierProfile(userId: string): Promise<CashierProfile | null> {
  try {
    const cached = await kvStorage.getItem(CASHIER_PROFILE_CACHE_PREFIX + userId);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

/**
 * Same offline-boot fallback pattern as the web app's loadCashierProfile:
 * a cold boot with no network can't run this query at all, so fall back
 * to the last successfully loaded profile for this exact account instead
 * of forcing a re-login that also can't succeed offline.
 */
async function loadCashierProfile(userId: string): Promise<CashierProfile | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, business_id, branch_id, full_name, user_type')
    .eq('id', userId)
    .single();

  if (error || !profile) return cachedCashierProfile(userId);

  try {
    await kvStorage.setItem(CASHIER_PROFILE_CACHE_PREFIX + userId, JSON.stringify(profile));
  } catch {
    // Cache write failure is never fatal -- next offline boot just won't have this fallback.
  }
  return profile;
}

/** يُنادى حين تُسقِط supabase-js الجلسة (رفضها الخادم، أو خروجٌ صريح). */
export function onCashierSignedOut(listener: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') listener();
  });
  return () => data.subscription.unsubscribe();
}

export async function logout(): Promise<void> {
  // بلا نت يرجع signOut بخطأ ويترك الجلسة محفوظة -- وrestoreCashierSession
  // يرجّعها عند التشغيل التالي. فالخروج يمسحها من الجهاز في كل حال.
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}
