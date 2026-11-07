import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { getDeviceConfig } from './authService';
import { pagerOnCustomerDisplay, hidePagerOnCustomerDisplay } from '../platform/customerDisplay';
import { watchPagerOnDisplay } from './pagerService';
import {
  codeOnCustomerDisplay,
  hideCodeOnCustomerDisplay,
  showOnCustomerDisplay,
  totalOnCustomerDisplay,
} from '../platform/customerDisplay';
import type { PrinterProfile } from '../platform/printer';

/**
 * وش يطلع على شاشة العميل (الشاشة الصغيرة اللي قدام الزبون في سنمي).
 *
 * - mirror: نفس شاشة الكاشير (اللي يسويه أندرويد لحاله).
 * - brand: هوية المطعم -- اسم المطعم (كتابة أو صورة الاسم) في النص على لونه.
 *   وقت الدفع يطلع المبلغ المطلوب، ولما الكاشير يضغط «اعرض الباركود» يطلع
 *   باركود بطاقة الولاء (أو باركود المنيو) دقيقة ويرجع.
 * - banner: صورة المتجر الإلكتروني (البانر) تملأ الشاشة.
 * - url: صورة من رابط يحطه صاحب المطعم.
 *
 * الباركود: الخادم نفسه اللي يبثه لشاشات العملاء في ركين (قناة
 * display-secret:<سر الشاشة>). هالجهاز ينضم لها كشاشة عميل مربوطة برمز
 * من 8 حروف من لوحة ركين (المتجر الإلكتروني ← إعدادات المتجر ← شاشة
 * العميل ← «أضف شاشة»)، فما تغيّر شي في الخادم.
 */
export type CustomerDisplayMode = 'mirror' | 'brand' | 'banner' | 'url';

/** ألوان جاهزة للخلفية. 'store' = لون المتجر في لوحة ركين. */
export const DISPLAY_COLORS: { key: string; label: string; hex: string }[] = [
  { key: '#5C1408', label: 'عنابي', hex: '#5C1408' },
  { key: '#A82610', label: 'أحمر', hex: '#A82610' },
  { key: '#151515', label: 'أسود', hex: '#151515' },
  { key: '#14213D', label: 'كحلي', hex: '#14213D' },
  { key: '#0F3D2E', label: 'أخضر', hex: '#0F3D2E' },
  { key: 'store', label: 'لون المتجر', hex: '' },
];

const BARCODE_SECONDS = 60;

function modeOf(p: PrinterProfile | null | undefined): CustomerDisplayMode {
  const m = p?.customerDisplay as string | undefined;
  if (m === 'logo' || m === 'menu') return 'brand'; // أسماء قديمة ليوم واحد
  return m === 'brand' || m === 'banner' || m === 'url' ? m : 'mirror';
}

/** لون واضح فوق الخلفية: كريمي على الغامق، وغامق على الفاتح. */
function inkOn(hex: string): { ink: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { ink: '#FBEABE' };
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? { ink: '#2A0D06' } : { ink: '#FBEABE' };
}

export interface BrandInfo {
  name: string;
  /** صورة اسم المطعم (https) -- تطلع بدل الكتابة. فاضي = الاسم كتابة. */
  logo: string;
  color: string;
  /** رابط المنيو الأونلاين: باركوده ثابت على شاشة الترحيب. فاضي = بدون. */
  menu?: string;
}

/** إعداد واجهة الهوية للشاشة (RakeenCustomerDisplayModule.kt). */
export function brandConfig(b: BrandInfo): string {
  const hex = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : DISPLAY_COLORS[0].hex;
  const { ink } = inkOn(hex);
  // نفس لون الكتابة بشفافية، بصيغة أندرويد #AARRGGBB.
  const softHex = '#B8' + ink.slice(1);
  return JSON.stringify({
    name: b.name,
    logo: /^https:\/\//i.test(b.logo) ? b.logo : '',
    bg: hex,
    ink,
    soft: softHex,
    // النص نفسه، والجهاز يرسم الباركود.
    menuQr: b.menu && /^https:\/\//i.test(b.menu) ? b.menu : '',
  });
}

/** المبلغ نصاً للشاشة: 84.00 */
export function totalText(amount: number | null | undefined): string {
  return amount != null && Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '';
}

/** رابط صورة الباركود: نفس نقطة الخادم اللي ترسمه لشاشات ركين. */
export function qrImageUrl(data: string): string {
  return `${RAKEEN_API_BASE_URL}/api/qr?data=${encodeURIComponent(data)}`;
}

async function business(): Promise<{ name: string; logo: string; banner: string; theme: string }> {
  const device = await getDeviceConfig();
  if (device.businessId == null) return { name: device.businessName ?? '', logo: '', banner: '', theme: '' };
  const { data } = await supabase
    .from('businesses')
    .select('name, logo_url, online_banner_url, online_theme_color')
    .eq('id', device.businessId)
    .maybeSingle();
  return {
    name: (data?.name as string) || device.businessName || '',
    logo: (data?.logo_url as string) || '',
    banner: (data?.online_banner_url as string) || '',
    theme: (data?.online_theme_color as string) || '',
  };
}

/** رمز الشاشة (8 حروف) → سرها. ينحفظ عشان ما ينسأل الخادم كل تشغيل. */
async function secretFor(code: string): Promise<string> {
  // يقبل الكود وحده أو رابط الشاشة كامل (…/menu#XXXXXXXX): الكود بعد #.
  const c = (code.split('#').pop() || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(c)) return '';
  const key = 'rk_cd_secret:' + c;
  try {
    const cached = await getItem(key);
    if (cached) return cached;
  } catch {
    // يكمل للخادم.
  }
  const { data } = await supabase.rpc('resolve_display_link_token', { p_token: c, p_user_agent: 'Rakeen POS (Sunmi customer screen)' });
  const d = data as { ok?: boolean; secret?: string } | null;
  if (!d?.ok || !d.secret) return '';
  await setItem(key, d.secret).catch(() => {});
  return d.secret;
}

let stopCurrent: (() => void) | null = null;
// هوية المطعم معروضة؟ (المبلغ وباركود المنيو يطلعون عليها بس)
let brandOn = false;
let lastCodeOk = false;

/** هل الرمز انقبل وصارت الشاشة تستقبل الباركود؟ (للإعدادات) */
export function customerDisplayLinked(): boolean {
  return lastCodeOk;
}

/**
 * يطبّق إعداد الجهاز ويبدأ يسمع للباركود لو مطلوب. ينادى مع دخول الكاشير
 * ومع حفظ الإعدادات. يرجّع false لو المطلوب ما ينعرض (فترجع الشاشة نفس الكاشير).
 */
export async function startCustomerDisplay(profile?: PrinterProfile | null): Promise<boolean> {
  stopCurrent?.();
  stopCurrent = null;
  lastCodeOk = false;
  brandOn = false;
  const p = profile === undefined ? await getPrinterProfile() : profile;
  const mode = modeOf(p);
  if (mode === 'mirror') {
    await showOnCustomerDisplay('mirror');
    return true;
  }
  if (mode === 'url') {
    const url = (p?.customerDisplayUrl || '').trim();
    if (!/^https:\/\//i.test(url)) {
      await showOnCustomerDisplay('mirror');
      return false;
    }
    return showOnCustomerDisplay('image', JSON.stringify({ url, fill: true }));
  }

  const biz = await business().catch(() => ({ name: '', logo: '', banner: '', theme: '' }));
  if (mode === 'banner') {
    const url = biz.banner || biz.logo;
    if (!/^https:\/\//i.test(url)) {
      await showOnCustomerDisplay('mirror');
      return false;
    }
    return showOnCustomerDisplay('image', JSON.stringify({ url, fill: !!biz.banner }));
  }

  // brand
  const pick = p?.customerDisplayColor || DISPLAY_COLORS[0].key;
  const color = pick === 'store' ? (/^#[0-9a-f]{6}$/i.test(biz.theme) ? biz.theme : DISPLAY_COLORS[0].hex) : pick;
  const shown = await showOnCustomerDisplay(
    'brand',
    brandConfig({ name: biz.name, logo: (p?.customerDisplayLogoUrl || '').trim(), color, menu: (p?.customerDisplayMenuUrl || '').trim() }),
  );
  brandOn = shown;

  const secret = await secretFor(p?.customerDisplayCode || '').catch(() => '');
  if (!secret) return shown;
  lastCodeOk = true;

  const channel = supabase
    .channel('display-secret:' + secret)
    .on('broadcast', { event: 'show_barcode' }, m => {
      const pl = ((m as { payload?: { url?: string; message?: string } }).payload) || {};
      if (!pl.url) return;
      codeOnCustomerDisplay(pl.url, 'امسح الباركود', pl.message || 'بجوالك، وتنضاف بطاقة الولاء حقتنا ويتجمّع لك', BARCODE_SECONDS);
    })
    .on('broadcast', { event: 'hide_barcode' }, () => hideCodeOnCustomerDisplay())
    // بيجر ركين من الخادم (نفس قناة الويب). نفس الجهاز يرسمه محلّياً قبلها
    // -- والتكرار يعيد رسم نفس الباركود فلا يضرّ.
    .on('broadcast', { event: 'show_pager' }, m => {
      const pl = ((m as { payload?: { url?: string; number?: number | null; secs?: number } }).payload) || {};
      if (!pl.url || !/^https:\/\/[a-z0-9.-]+\/p\/[A-Za-z0-9_-]{22}$/.test(pl.url)) return;
      pagerOnCustomerDisplay(pl.url, pl.number != null ? String(pl.number) : '', Number(pl.secs) || 0);
      watchPagerOnDisplay(pl.url, Number(pl.secs) || 0);
    })
    .on('broadcast', { event: 'hide_pager' }, () => hidePagerOnCustomerDisplay())
    .subscribe();
  // نبضة كل خمس دقائق: لوحة ركين تعرف إن الشاشة حيّة.
  const beat = () => {
    supabase.rpc('touch_display_device', { p_secret: secret }).then(() => {}, () => {});
  };
  beat();
  const beatTimer = setInterval(beat, 5 * 60 * 1000);
  stopCurrent = () => {
    clearInterval(beatTimer);
    try {
      supabase.removeChannel(channel);
    } catch {
      // انقفلت.
    }
  };
  return shown;
}

export function stopCustomerDisplay(): void {
  stopCurrent?.();
  stopCurrent = null;
}

/** المبلغ المطلوب على شاشة العميل وقت الدفع؛ null يرجّع الترحيب. */
export function showTotalOnCustomerDisplay(amount: number | null): void {
  if (brandOn) totalOnCustomerDisplay(totalText(amount));
}
