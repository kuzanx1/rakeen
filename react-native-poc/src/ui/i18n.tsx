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

export function useI18n(): I18n {
  return useContext(I18nContext);
}
