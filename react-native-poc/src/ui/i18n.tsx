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
  'عنوان الطابعة في الشبكة (نفس شبكة الواي فاي)': 'Printer address on the network (same Wi-Fi)',
  'المنفذ': 'Port number',
  'عنوان الطابعة — مثال: 192.168.1.51': 'Printer address — e.g. 192.168.1.51',
  'مثال: 192.168.1.50': 'e.g. 192.168.1.50',
  '٠٠٠٠': '0000',
  'الحالة': 'Status',
  'الوقت': 'Time',
  'الطاولة': 'Table',
  'الفرع': 'Branch',
  'الاسم': 'Name',
  'الموقع': 'Location',
  'النشاط': 'Business',
  'إجمالي الطلب': 'Order total',
  'إجمالي الطلب حتى الآن': 'Order total so far',
  'إجمالي المبيعات': 'Total sales',
  'عدد الطلبات': 'Orders',
  'جاهز': 'Ready',
  'جاهز للاستلام': 'Ready for pickup',
  'متأخر': 'Late',
  'مشغولة': 'Occupied',
  'صيانة': 'Maintenance',
  'خرج للتوصيل': 'Out for delivery',
  'تسليم للعميل': 'Hand to customer',
  'تم التسليم ✅': 'Delivered ✅',
  'تم توصيله ✅': 'Delivered ✅',
  'قبول ✅': 'Accept ✅',
  'رفض ❌': 'Reject ❌',
  'اختر سبب الرفض': 'Choose a rejection reason',
  'تأكيد الرفض': 'Confirm rejection',
  'سبب آخر': 'Another reason',
  'اكتب السبب...': 'Type the reason...',
  'إلغاء الطلب': 'Cancel order',
  'استرجاع': 'Refund',
  'استرجاع مبلغ': 'Refund an amount',
  'طلب جديد الآن': 'New order now',
  'وقت لاحق': 'Later',
  'يكمل الطلب:': 'Completed by:',
  'يبدأ طلب جديد تلقائيًا خلال': 'A new order starts automatically in',
  '🌐 طلب إلكتروني — من متجر المطعم': '🌐 Online order — from the restaurant\'s store',
  '⏰ العميل اختار وقت استلام لاحق —': '⏰ The customer chose a later pickup time —',
  'تعذر تحميل الطلب.': 'Could not load the order.',
  'ما فيه طلبات جارية حاليًا': 'No orders in progress right now',
  'ما فيه طلبات هنا حاليًا': 'Nothing here right now',
  'طريقة الدفع': 'Payment method',
  'تأكيد الدفع': 'Confirm payment',
  'تأكيد الطلب': 'Confirm order',
  'متابعة الدفع': 'Continue to payment',
  'المبلغ المطلوب': 'Amount due',
  'المدفوع': 'Paid',
  'الباقي': 'Change',
  'الخصم': 'Discount',
  'الضريبة': 'VAT',
  'المبلغ كاش': 'Cash amount',
  'المبلغ عبر الشبكة (بطاقة)': 'Card amount',
  'تأكيد الدفع المقسّم': 'Confirm split payment',
  '÷ قسّم بين الأصحاب': '÷ Split between friends',
  'كل واحد يدفع': 'Each person pays',
  'تقسيم': 'Split',
  'بطاقة / Apple Pay': 'Card / Apple Pay',
  'مرّر أو قرّب البطاقة على الجهاز': 'Swipe or tap the card on the terminal',
  'منصة التوصيل': 'Delivery app',
  'رسوم التوصيل': 'Delivery fee',
  'توصيل — مدفوع عبر التطبيق': 'Delivery — paid through the app',
  'إجمالي الطلب — مدفوع مسبقًا عبر التطبيق': 'Order total — prepaid through the app',
  'آخر ٤ أرقام الفاتورة': 'Last 4 digits of the invoice',
  'آخر ٤ أرقام من فاتورة تطبيق التوصيل': 'Last 4 digits from the delivery app invoice',
  'تمت العملية بنجاح': 'Done',
  'تخطي': 'Skip',
  'التالي': 'Next',
  'متابعة': 'Continue',
  'تغيير': 'Change',
  'الآن': 'Now',
  'اسم العميل': 'Customer name',
  'جوال العميل': 'Customer mobile',
  'رقم الجوال': 'Mobile number',
  'رقم الجوال (اختياري)': 'Mobile number (optional)',
  'الجوال:': 'Mobile:',
  'إضافة عميل جديد': 'Add a new customer',
  'اكتب اسم أو جوال...': 'Type a name or mobile...',
  'جارٍ البحث...': 'Searching...',
  'متابعة بدون اسم': 'Continue without a name',
  'مسح بطاقة العميل': 'Scan the customer\'s card',
  'قرّب باركود البطاقة من الكاميرا': 'Hold the card barcode up to the camera',
  'اطلب منه يفتح بطاقة الولاء ويضغط تأكيد': 'Ask them to open their loyalty card and tap confirm',
  'امسح لإضافة بطاقة الولاء لجوالك': 'Scan to add the loyalty card to your phone',
  'ما فيه منتجات قابلة للاستبدال بالنقاط حاليًا.': 'Nothing can be redeemed with points right now.',
  'اختر الطاولة': 'Choose a table',
  'تغيير الطاولة': 'Change table',
  'متابعة بدون طاولة': 'Continue without a table',
  'إفراغ الطاولة': 'Clear table',
  'جلّسه': 'Seat them',
  'لم يحضر': 'No-show',
  'عدد الأشخاص': 'Party size',
  'يفضّل قسم (اختياري)': 'Preferred section (optional)',
  'بدون تفضيل': 'No preference',
  'إضافة للقائمة': 'Add to the list',
  'رقم الجوال (اختياري — للتواصل عند توفر طاولة)': 'Mobile number (optional — to call when a table frees up)',
  'حجز مسبق': 'Advance booking',
  'تأكيد الحجز': 'Confirm booking',
  'إلغاء الحجز': 'Cancel booking',
  'حجز طاولة محددة؟': 'Book a specific table?',
  'نعم — طاولة معينة': 'Yes — a specific table',
  'لا — قائمة انتظار عادية': 'No — the normal waitlist',
  'حجز فوري أو لوقت لاحق؟': 'Right now or for later?',
  'تم التذكير ✓': 'Reminded ✓',
  'ما فيه أحد بقائمة الانتظار الآن.': 'Nobody is on the waitlist right now.',
  'ما فيه أحد يحتاج تذكير الآن.': 'Nobody needs a reminder right now.',
  'ما فيه حجوزات حالياً.': 'No bookings right now.',
  'ما فيه طاولات متاحة الحين.': 'No tables are free right now.',
  'ما فيه طاولات مسجّلة لهذا الفرع.': 'No tables are set up for this branch.',
  'هذي الطاولة محجوزة يدويًا (حالة قديمة).': 'This table was reserved by hand (an old state).',
  '🧹 هذي الطاولة تحتاج تنظيف': '🧹 This table needs cleaning',
  'عدّ الكاش الموجود بالدرج': 'Count the cash in the drawer',
  'اكتب المبلغ اللي عدّيته — الفرق يظهر بالخطوة الجاية': 'Enter what you counted — the difference is shown on the next step',
  'المعدود فعليًا': 'Actually counted',
  'المتوقع': 'Expected',
  'الفرق': 'Difference',
  'كاش (شامل الرصيد الافتتاحي)': 'Cash (including the opening float)',
  'تأكيد إغلاق الوردية': 'Confirm closing the shift',
  'اسم النزيل': 'Guest name',
  'نوع الغرفة': 'Room type',
  'تاريخ الوصول': 'Check-in date',
  'تاريخ المغادرة': 'Check-out date',
  'تسجيل الوصول': 'Check in',
  'تسجيل المغادرة': 'Check out',
  'تحقق من التوفر': 'Check availability',
  'بدء الجلسة': 'Start session',
  'بدء الجلسة الآن': 'Start the session now',
  'ما فيه غرف متاحة من هذا النوع الحين.': 'No rooms of this type are free right now.',
  'ما فيه غرف مسجّلة لهذا الفرع — أضفها من لوحة التحكم.': 'No rooms are set up for this branch — add them from the dashboard.',
  'ما فيه أنواع غرف مضافة بعد — أضفها من "الخدمات" باللوحة أولاً.': 'No room types yet — add them under "Services" in the dashboard first.',
  'الطابعة': 'Printer',
  'طابعة الفواتير': 'Receipt printer',
  'حالة الاتصال': 'Connection',
  'الموظف الحالي': 'Current staff member',
  'طباعة': 'Print',
  'طباعة اختبار': 'Test print',
  'جاري الطباعة...': 'Printing...',
  'تعذرت الطباعة —': 'Printing failed —',
  'حفظ إعدادات الطابعة': 'Save printer settings',
  'تحديث واختبار الاتصال': 'Refresh and test the connection',
  'عرض الورق': 'Paper width',
  '80مم (الأشيع)': '80mm (most common)',
  '58مم': '58mm',
  'شكل الفاتورة عند الدفع': 'What to print on payment',
  'طابعة مطبخ منفصلة (اختياري)': 'Separate kitchen printer (optional)',
  'إعادة تجهيز هذا الجهاز': 'Re-provision this device',
  'طباعات قيد الانتظار/الإعادة': 'Prints waiting or retrying',
  'آخر خطأ طباعة': 'Last printing error',
  'آخر خطأ مزامنة': 'Last sync error',
  'آخر مزامنة ناجحة': 'Last successful sync',
  'إعادة المحاولة': 'Retry',
  'اتصال': 'Connection',
  '+ إضافة أصناف': '+ Add items',
  'وقت الاستلام': 'Pickup time',
  'وقت التجهيز': 'Prep time',
  'عنوان التوصيل': 'Delivery address',
  'فتح بخرائط جوجل': 'Open in Google Maps',
  '📍 فتح الموقع على الخريطة': '📍 Open the location on the map',
  '📍 موقع العميل — للمندوب': '📍 Customer location — for the driver',
  '📱 إرسال تحديث عبر واتساب': '📱 Send an update on WhatsApp',
  'واتساب': 'WhatsApp',
  'جاري التحميل...': 'Loading...',
  'جارٍ التحميل...': 'Loading...',
  'جارٍ تجهيز الكاشير...': 'Getting the till ready...',
  'بدون بصل، إضافي صوص...': 'No onion, extra sauce...',
  'ما فيه خيارات مضافة لهذه المجموعة بعد — أضفها من لوحة التحكم.': 'This group has no options yet — add them from the dashboard.',
  'ما فيه موظفين مضافين لهذا الفرع بعد — أضفهم من الإعدادات بالداشبورد.': 'No staff added for this branch yet — add them from the dashboard settings.',
  'هذا البوكس ما له أصناف محددة بعد — لازم تحدد الأصناف اللي يقدر العميل يختار منها الأول.': 'This box has no items chosen yet — pick what the customer may choose from first.',
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
