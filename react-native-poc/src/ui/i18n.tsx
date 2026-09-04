import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getItem, setItem } from '../infrastructure/mmkvStorage';

/**
 * The language toggle, ported from rakeen-pos.js:32-58.
 *
 * Two decisions from the source that this keeps:
 *
 *  1. Arabic is the KEY. There is no parallel key scheme -- t() looks the
 *     Arabic original up in a table and falls through to it when there is
 *     no entry. So every string stays readable in the code, and adding a
 *     translation never means touching the call site.
 *
 *  2. LAYOUT DIRECTION DOES NOT CHANGE. The source is explicit about why:
 *     "a cashier's muscle memory for where every button sits matters more
 *     than a 'correctly' mirrored English layout, and every real bilingual
 *     POS in this market works the same way." Only the text switches. That
 *     also happens to be the only workable answer in React Native, where
 *     flipping I18nManager needs a full app restart.
 *
 * Scope is the source's Phase 1: the Home screen -- topbar chrome, the
 * category rail, the product grid and the order panel. Other screens stay
 * Arabic-only, exactly as the source leaves them, rather than half-
 * translating them.
 */

const I18N_EN: Record<string, string> = {
  // Mirrors the table in public/pos/rakeen-pos.js. Keep them in step:
  // the same business runs both, and a label that reads one way on the
  // tablet and another on the phone is exactly the drift this migration
  // exists to remove.
  'الرئيسية': 'Home',
  'الطلبات': 'Orders',
  'الطاولات': 'Tables',
  'المزيد': 'More',
  'متصل بالإنترنت': 'Online',
  'غير متصل — يحفظ محليًا': 'Offline — saving locally',
  'الطابعة جاهزة': 'Printer ready',
  'تنبيهات التوصيل': 'Delivery alerts',
  'تبديل المظهر': 'Toggle theme',
  'ابحث أو امسح باركود...': 'Search or scan barcode...',
  'المفضّلة': 'Favorites',
  'الأكثر طلبًا': 'Popular',
  'الكل': 'All',
  'ما فيه نتائج مطابقة': 'No matching results',
  'الطلب الحالي': 'Current order',
  'علّق': 'Hold',
  'اضغط منتج عشان يضاف': 'Tap a product to add it',
  'عدد الأصناف': 'Items',
  'المجموع الفرعي': 'Subtotal',
  'ضريبة القيمة المضافة': 'VAT',
  '(شاملة ضمن الإجمالي)': '(included in total)',
  'الإجمالي': 'Total',
  'ادفع': 'Pay',
  'إفراغ الطلب': 'Clear order',
  '+ خصم': '+ Discount',
  'إضافة للطلب': 'Add to order',
  'تسجيل الطلب': 'Register order',
  'اضغط مرة ثانية للتأكيد': 'Tap again to confirm',
  'حبة': 'item',
  'نقاط': 'Points',
  'آخر عملية': 'Last transaction',
  'إعادة طباعة': 'Reprint',
  '+ ملاحظة': '+ Note',
  'أضف': 'Add',
  'فيه خيارات — اضغط مطولًا للتخصيص': 'Has options — hold to customize',
  'تجهيز هذا الجهاز': 'Set up this device',
  'ربط الجهاز': 'Link device',
  'رمز الفرع': 'Branch code',
  'أدخل رمز نقطة البيع لهذا الفرع': 'Enter this branch\u2019s POS code',
  'سجّل دخولك كمدير أو مالك مرة وحدة بس، عشان نربط هذا التابلت بفرعك.': 'Sign in as a manager or owner once, to link this tablet to your branch.',
  'جارٍ التحقق من الرمز...': 'Checking the code...',
  'جارٍ التحقق...': 'Checking...',
  'إعادة تجهيز الجهاز': 'Re-provision device',
  'البريد الإلكتروني': 'Email',
  'كلمة المرور': 'Password',
  'مين اللي مداوم؟': 'Who is on shift?',
  'اختر اسمك عشان تتسجل الطلبات باسمك': 'Pick your name so orders are recorded under it',
  'كاشير': 'Cashier',
  'تبديل الموظف': 'Switch staff member',
  'تسجيل خروج': 'Sign out',
  'الوردية': 'Shift',
  'بدء الوردية': 'Start shift',
  'الرصيد الافتتاحي (ر.س)': 'Opening float (SAR)',
  'أدخل المبلغ النقدي الموجود بالدرج عشان تبدأ الوردية': 'Enter the cash in the drawer to start the shift',
  'موافقة المدير': 'Manager approval',
  'جارية': 'In progress',
  'مكتملة': 'Completed',
  'ملغاة': 'Cancelled',
  'بانتظار الدفع': 'Awaiting payment',
  'بانتظار الطلب': 'Awaiting order',
  'قيد التقديم': 'Being served',
  'طلب إلكتروني جديد 🌐': 'New online order 🌐',
  'متاحة': 'Available',
  'تنظيف': 'Cleaning',
  'قائمة الانتظار': 'Waitlist',
  '+ إضافة لقائمة الانتظار': '+ Add to waitlist',
  'تذكيرات': 'Reminders',
  'إجراءات سريعة — وقت الخدمة': 'Quick actions \u2014 service time',
  'إلغاء طلب الطاولة': 'Cancel table order',
  'الدفع': 'Payment',
  'تخصيص المنتج': 'Customize item',
  'إلغاء': 'Cancel',
  'متصل': 'Online',
  '؟': '?',
  'دوّر بالاسم أو الجوال...': 'Search by name or mobile...',
  'رجوع': 'Back',
  '٥٪': '5%',
  '١٠٪': '10%',
  '١٥٪': '15%',
};

export type Lang = 'ar' | 'en';

/** The source's own storage key, so a device that has used the PWA keeps
 *  whichever language it was already set to. */
const LANG_KEY = 'rakeen_pos_lang';

interface I18n {
  lang: Lang;
  /** `t(ar)` -- returns the English entry, or the Arabic itself. */
  t: (ar: string) => string;
  toggle: () => void;
}

const I18nContext = createContext<I18n>({ lang: 'ar', t: (ar: string) => ar, toggle: () => {} });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar');

  useEffect(() => {
    (async () => {
      try {
        const stored = await getItem(LANG_KEY);
        if (stored === 'en' || stored === 'ar') setLang(stored);
      } catch {
        // Arabic is the default either way.
      }
    })();
  }, []);

  const toggle = useCallback(() => {
    setLang(prev => {
      const next: Lang = prev === 'ar' ? 'en' : 'ar';
      setItem(LANG_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, t: (ar: string) => (lang === 'en' ? I18N_EN[ar] || ar : ar), toggle }),
    [lang, toggle],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The display name for a catalogue row that carries its own English name.
 *
 * Separate from t(): t() substitutes UI chrome from a fixed dictionary,
 * while this reads a per-row column the business filled in. Falls back to
 * the Arabic name whenever the English one is missing, so a half-translated
 * menu shows real names rather than blanks.
 *
 * Deliberately NOT used when building a receipt or kitchen ticket. Those
 * always print the primary Arabic name regardless of the cashier's UI
 * language -- a previous audit found this exact bug going the other way,
 * with English names printing on receipts because the builder preferred
 * nameEn. The paper is not the UI.
 */
export function displayName(
  row: { name: string; nameEn?: string | null },
  lang: Lang,
): string {
  return lang === 'en' ? row.nameEn || row.name : row.name;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
