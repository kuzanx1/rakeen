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
  'ابدأ أرباحك': 'Start earning',
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
  'حركة نقدية': 'Cash movement',
  'قائمة الطباعة': 'Print queue',
  'الحلويات': 'Desserts',
  'المشروبات': 'Drinks',
  'مشروبات باردة': 'Cold drinks',
  'مشروبات ساخنة': 'Hot drinks',
  'الشوكليت': 'Chocolate',
  'الماتشا': 'Matcha',
  'الموهيتو': 'Mojito',
  'القهوة المقطرة': 'Filter coffee',
  'مشروبات أخرى': 'Other drinks',
  'مشروبات الإسبريسو الحارة': 'Hot espresso drinks',
  'مشروبات الإسبريسو الباردة': 'Iced espresso drinks',
  'وجبات': 'Meals',
  'سندويتشات': 'Sandwiches',
  'سلطات': 'Salads',
  'مقبلات': 'Starters',
  'عصائر': 'Juices',
  'سفري': 'Takeaway',
  'محلي': 'Dine-in',
  '📦 سفري': '📦 Takeaway',
  '🍽️ محلي': '🍽️ Dine-in',
  '🛵 تطبيقات التوصيل': '🛵 Delivery apps',
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

  // ---- Beyond the home screen -------------------------------------

  // Shift and cash drawer
  'إغلاق الوردية': 'Close shift',
  'ملخص الوردية': 'Shift summary',
  'إغلاق الوردية — عدّ الكاش': 'Close shift — count the cash',
  'إغلاق الوردية — المطابقة': 'Close shift — reconcile',
  'تعذر إغلاق الوردية.': 'Could not close the shift.',
  'تعذر إغلاق الوردية — تحقق من الاتصال وجرّب مرة ثانية': 'Could not close the shift — check your connection and try again',
  'تعذر بدء الوردية — تحقق من الاتصال وجرّب مرة ثانية': 'Could not start the shift — check your connection and try again',
  'تعذر بدء الوردية.': 'Could not start the shift.',
  'اكتب رصيد افتتاحي صحيح.': 'Enter a valid opening amount.',
  'ما فيه وردية مفتوحة': 'No open shift',
  'افتح وردية أولًا عشان يتسجل المبلغ فيها.': 'Open a shift first so the amount is recorded in it.',
  'أُغلقت الوردية، لكن ما انحفظ تقرير الموازنة — سجّل الدخول وأعد الطباعة': 'The shift closed, but the close report was not saved — sign in and reprint',
  'طباعة آخر موازنة': 'Reprint last close',
  'تم إرسال آخر موازنة للطابعة': 'Last close report sent to the printer',
  'جاري البحث عن آخر موازنة...': 'Looking for the last close report...',
  'ما فيه موازنة سابقة مسجلة لهذا الفرع': 'No previous close report saved for this branch',
  'مطابق تمامًا': 'Exact match',
  'فتح الدرج': 'Open drawer',
  'تم فتح الدرج': 'Drawer opened',
  'جارٍ الفتح...': 'Opening...',
  'درج النقدية': 'Cash drawer',
  'درج الكاش': 'Cash drawer',
  'إيداع بالدرج': 'Cash in',
  'سحب من الدرج': 'Cash out',
  'تم تسجيل إيداع بالدرج': 'Cash in recorded',
  'تم تسجيل سحب من الدرج': 'Cash out recorded',
  'تعذر تسجيل الحركة.': 'Could not record the movement.',
  'تعذر تسجيل الحركة — تحقق من الاتصال وجرّب مرة ثانية': 'Could not record the movement — check your connection and try again',
  'مثال: دفعة لمورّد الخضار': 'e.g. paid the vegetable supplier',
  'مثال: فكّة من الخزنة': 'e.g. change from the safe',
  'ما فيه درج مربوط — اضبطه من إعدادات الطباعة': 'No drawer connected — set it up in Printing settings',
  'إعدادات الدرج ناقصة — راجعها من إعدادات الطباعة': 'Cash drawer setup is incomplete — check it in Printing settings',
  'تعذّر فتح الدرج — تأكد أن الطابعة موصولة وشغّالة': 'Could not open the drawer — make sure the printer is connected and on',
  'تعذّر فتح الدرج — جرّب مرة ثانية': 'Could not open the drawer — try again',
  'هذا الجهاز ما يدعم فتح الدرج': 'This device cannot open a cash drawer',
  'بدون اسم': 'No name',

  // Manager approval
  'موافقة مدير': 'Manager approval',
  'تمت موافقة المدير': 'Manager approved',
  'رمز خاطئ': 'Wrong code',
  'تعذر التحقق من الرمز — تحقق من الاتصال': 'Could not check the code — check your connection',
  'ما تم تعيين كلمة سر مدير بعد — من لوحة التحكم: الإعدادات ← نقطة البيع': 'No manager code set yet — in the dashboard: Settings -> Point of sale',

  // Printing settings
  'إعدادات الطباعة': 'Printing settings',
  'الوضع الحالي': 'Current status',
  'شكل الفاتورة': 'Receipt style',
  'كلاسيكي': 'Classic',
  'أنيق': 'Elegant',
  'مضغوط — يوفّر ورق': 'Compact — saves paper',
  'طريقة التوصيل': 'How it connects',
  'الشبكة': 'Network',
  'شبكة الواي فاي': 'Wi-Fi network',
  'البلوتوث': 'Bluetooth',
  'بلوتوث': 'Bluetooth',
  'جهاز البلوتوث': 'Bluetooth device',
  'السلك': 'Cable',
  'سلك USB': 'USB cable',
  'جهاز USB': 'USB device',
  'الورق': 'Paper',
  'خيارات الطباعة': 'Printing options',
  'طباعة إيصال العميل': 'Print the customer receipt',
  'طباعة تذكرة المطبخ': 'Print the kitchen ticket',
  'طباعة شعار المنشأة على الإيصال': 'Print the business logo on the receipt',
  'تدعم قص الورق تلقائيًا': 'Cuts the paper automatically',
  'هذه الطابعة موصولة بدرج كاش': 'This printer is connected to a cash drawer',
  'البحث عن الأجهزة': 'Search for devices',
  'اختبار': 'Test',
  'اختبار الاتصال': 'Test connection',
  'جارٍ الاختبار...': 'Testing...',
  'تفاصيل للدعم الفني': 'Details for support',
  'إخفاء تفاصيل الدعم الفني': 'Hide support details',
  'من ورقة إعدادات طابعتك': 'From your printer settings sheet',
  'اتركه فارغ — النظام يستخدم الأمر المعتاد': 'Leave it empty — the usual command is used',
  'مثال: Epson, Xprinter, Sunmi...': 'e.g. Epson, Xprinter, Sunmi...',
  'مثال: TM-T88VI': 'e.g. TM-T88VI',
  'ما فيه طابعة محفوظة': 'No printer saved',
  'لا توجد طابعة محفوظة': 'No printer saved',
  'لا يوجد طابعة مُعدّة': 'No printer set up',
  'بدون طابعة شبكة': 'No network printer',
  'الطباعة غير متاحة على هذا الجهاز': 'Printing is not available on this device',
  'احفظ الإعدادات أولًا — الطباعة تستخدم الإعداد المحفوظ.': 'Save the settings first — printing uses the saved setup.',
  'الفاتورة بالانتظار — بتنطبع أول ما توصل الطابعة.': 'The receipt is waiting — it prints as soon as the printer connects.',
  'فيه تعديلات ما انحفظت، وما فيه طابعة محفوظة — أي طلب ما راح تطلع فاتورته. اضغط «حفظ الإعدادات».': 'There are unsaved changes and no saved printer, so no order will print a receipt. Tap "Save settings".',

  // Print queue
  'إيصال': 'Receipt',
  'تذكرة مطبخ': 'Kitchen ticket',
  'بانتظار الطباعة': 'Waiting to print',
  'جارٍ الطباعة': 'Printing',
  'جارٍ الطباعة...': 'Printing...',
  'تمت الطباعة': 'Printed',
  'تعذرت الطباعة': 'Could not print',
  'إعادة محاولة قريبًا': 'Retrying shortly',
  'تمت إعادة الطباعة': 'Reprinted',
  'قيد الطباعة أو الانتظار': 'Printing or waiting',
  'فواتير ما طبعت': 'Receipts that did not print',

  // System check
  'تشخيص النظام': 'System check',
  'الاتصال': 'Connection',
  'الإنترنت': 'Internet',
  'الاتصال بحساب المطعم': 'Connection to the restaurant account',
  'إعداد الطابعة': 'Printer setup',
  'آخر تحديث ناجح': 'Last successful update',
  'الطلبات المحفوظة على الجهاز': 'Orders saved on this device',
  'طلبات بانتظار المزامنة': 'Orders waiting to sync',
  'طلبات متعلّقة تحتاج مراجعة': 'Stuck orders needing review',
  'المشكلة: الجهاز مو متصل بالإنترنت إطلاقًا.': 'The problem: this device has no internet at all.',
  'المشكلة: الإنترنت شغال لكن ما نقدر نوصل لحساب المطعم — جرّب بعد شوي.': 'The problem: the internet works but the restaurant account cannot be reached — try again shortly.',
  'المشكلة: الطابعة — تأكد إنها مشغّلة، وفيها ورق، وعلى نفس شبكة الواي فاي.': 'The problem: the printer — check it is on, has paper, and is on the same Wi-Fi.',
  'لا توجد مشكلة ظاهرة الآن.': 'Nothing looks wrong right now.',
  'ملاحظة: الطباعة غير متاحة على هذا الجهاز.': 'Note: printing is not available on this device.',

  // Orders
  'طلب إلكتروني': 'Online order',
  'نوع الطلب': 'Order type',
  'بانتظار القبول': 'Waiting to be accepted',
  'قيد التجهيز': 'Being prepared',
  'جاهز — بانتظار العميل': 'Ready — waiting for the customer',
  'جاهز — بانتظار المندوب': 'Ready — waiting for the driver',
  'مع المندوب': 'With the driver',
  'استلمه العميل': 'Customer collected it',
  'استلمه العميل ودفع': 'Customer collected and paid',
  'تم التسليم': 'Delivered',
  'تم التسليم واستلمت المبلغ': 'Delivered and paid',
  'سُلّم واستلمت المبلغ': 'Delivered and paid',
  'تأخر': 'Late',
  'باقي': 'left',
  'مكتمل': 'Completed',
  'ملغى': 'Cancelled',
  'مرفوض': 'Rejected',
  'مسترجع': 'Refunded',
  'مسترجعة': 'Refunded',
  'جهاز النداء': 'Pager',
  'انحفظ الطلب، بس ما انسجّل رقم الجهاز': 'The order was saved, but the pager number was not',
  'جارٍ الاسترجاع...': 'Refunding...',
  'تعذر تحميل الطلبات — جرّب مرة ثانية': 'Could not load orders — try again',
  'تعذر تحميل الطلبات الجارية — تحقق من الاتصال.': 'Could not load open orders — check your connection.',
  'تعذر تحديث الطلب': 'Could not update the order',
  'تعذر تسجيل استلام الطلب': 'Could not record the pickup',
  'تعذر تسجيل استلام المبلغ': 'Could not record the payment',
  'تعذر تسجيل الطلب جاهز': 'Could not mark the order ready',
  'تعذر تسجيل تسليم الطلب': 'Could not record the delivery',
  'تعذر تسجيل خروج الطلب': 'Could not record the order leaving',

  // Incoming online orders
  'تعذر قبول الطلب': 'Could not accept the order',
  'تعذر رفض الطلب': 'Could not reject the order',
  'تعذر قبول الطلب — تحقق من الاتصال وجرّب مرة ثانية': 'Could not accept the order — check your connection and try again',
  'تعذر رفض الطلب — تحقق من الاتصال وجرّب مرة ثانية': 'Could not reject the order — check your connection and try again',
  'الفرع مغلق الآن': 'The branch is closed right now',
  'المطعم مشغول': 'The kitchen is busy',
  'خارج نطاق التوصيل': 'Outside the delivery area',
  'عدم توفر الصنف': 'Item not available',
  'صنف': 'item',
  'متجر المطعم': 'Restaurant store',
  'توصيل': 'Delivery',
  'تطبيقات التوصيل': 'Delivery apps',
  'كاش': 'Cash',
  'بطاقة': 'Card',
  'تقسيم دفع': 'Split payment',
  'مدفوع عبر التطبيق': 'Paid in the app',
  '— يُدفع عند الاستلام': '— paid on collection',

  // Payment and customers
  'الولاء': 'Loyalty',
  'العميل': 'Customer',
  'عميل جديد': 'New customer',
  'ابحث بالاسم أو رقم الجوال': 'Search by name or mobile number',
  'الاسم مطلوب': 'Name is required',
  'رقم الجوال لازم يبدأ بـ 05 ويكون 10 أرقام': 'The mobile number must start with 05 and be 10 digits',
  'رقم الجوال مطلوب لإنشاء عميل حقيقي قابل للبحث لاحقًا': 'A mobile number is required so the customer can be found later',
  'العميل رفض عملية الاستبدال': 'The customer declined the redemption',
  'انتهت مهلة التأكيد — حاول مرة ثانية': 'Confirmation timed out — try again',
  'تعذر بدء عملية الاستبدال': 'Could not start the redemption',
  'مثال: 20': 'e.g. 20',
  'تم الإرسال': 'Sent',
  'تمت العملية': 'Done',
  'جارٍ الإرسال...': 'Sending...',
  'جارٍ إتمام العملية...': 'Completing...',
  'تعذّر إتمام الدفع': 'Could not complete the payment',
  'تم الدفع — بانتظار المزامنة': 'Paid — waiting to sync',
  'تم تسجيل الطلب': 'Order registered',
  'تم إفراغ الطلب': 'Order cleared',
  'السلة فارغة': 'The cart is empty',
  'أُضيف': 'Added',
  'محفوظ على الجهاز، وبيُرسل تلقائيًا أول ما يرجع الاتصال': 'Saved on this device and sent automatically once the connection is back',

  // Products and modifiers
  'مطلوب': 'Required',
  'اختياري': 'Optional',
  'ما فيه أصناف متاحة': 'No items available',
  'التكلفة والمخزون': 'Cost and stock',
  'ما فيه منتج بهذا الباركود': 'No product with that barcode',
  'تعذر تحميل المنتجات — تحقق من الاتصال.': 'Could not load products — check your connection.',

  // Tables
  'محجوزة': 'Reserved',
  'إغلاق': 'Close',
  'تراجع': 'Undo',
  'إلغاء الطلب — إفراغ الطاولة': 'Cancel the order — free the table',
  'إلغاء الطلب — الطاولة لا تزال مشغولة': 'Cancel the order — the table stays occupied',
  'تعذر الإلغاء — جرّب مرة ثانية': 'Could not cancel — try again',
  'تعذر النقل — جرّب مرة ثانية': 'Could not move it — try again',
  'تعذر تحميل الطاولات — تحقق من الاتصال.': 'Could not load tables — check your connection.',
  'حالة الطاولة تغيّرت للتو': 'The table status just changed',
  'حالة قديمة — لا يوجد إجراء': 'Out of date — nothing to do',
  'طاولة انشغلت للتو': 'A table just became occupied',
  'خطأ — جرّب مرة ثانية': 'Something went wrong — try again',
  'صار خطأ غير متوقع — جرّب مرة ثانية': 'Something went wrong — try again',

  // Sign-in and device setup
  'تأكيد الفرع': 'Confirm branch',
  'رمز الفرع غلط.': 'Wrong branch code.',
  'تعذر تسجيل الدخول.': 'Could not sign in.',
  'تعذر تحميل الحساب': 'Could not load the account',
  'تعذر تحميل بيانات الجهاز': 'Could not load this device',
  'تعذر الاتصال بالخادم': 'Could not reach the service',
  'تعذر الاتصال بالخادم — تحقق من الإنترنت.': 'Could not reach the service — check your internet.',
  'جلسة غير صالحة': 'Session expired',
  'انتهت الجلسة — سجّل الدخول مرة ثانية': 'Session expired — sign in again',
  'لازم تسجّل دخول كمدير أو مالك عشان تجهّز الجهاز.': 'Sign in as a manager or owner to set this device up.',
  'ما فيه فروع مسجّلة لهذا المشروع.': 'No branches registered for this business.',
  'ما فيه فرع مرتبط بهذا الجهاز — أعد تجهيز الجهاز': 'No branch linked to this device — set the device up again',

  // Common category words. Whole-value only, so these rename a category
  // called exactly "قهوة" and never touch "قهوة تركية".
  'قهوة': 'Coffee',
  'برجر': 'Burgers',
  'بيتزا': 'Pizza',
  'حلا': 'Sweets',
  'كيك': 'Cake',
  'ماء': 'Water',
  'مياه': 'Water',
  'مخبوز': 'Baked',
  'رئيسي': 'Mains',

  // Status lines that carry their own dot.
  '✅ تم الحفظ على هذا الجهاز': '✅ Saved on this device',
  '✅ تم استرجاع مبلغ الطلب': '✅ Order amount refunded',
  '🟢 متصل': '🟢 Online',
  '🟢 متاح': '🟢 Available',
  '🟢 تعمل': '🟢 Working',
  '🔴 غير متصل': '🔴 Offline',
  '🔴 تعذر الوصول': '🔴 Unreachable',
  '🔴 غير متاح على هذا الجهاز': '🔴 Not available on this device',
  '⚪ غير متاح على هذا الجهاز': '⚪ Not available on this device',
  '⚪ غير معدّة (راجع إعدادات الطابعة)': '⚪ Not set up (see Printing settings)',
  '⚪ غير معروف بعد': '⚪ Not known yet',
  '⚪ لم تُختبر بعد': '⚪ Not tested yet',
  '⚪ طباعة إيصال العميل معطّلة من الإعدادات': '⚪ Customer receipt printing is turned off in settings',
  '🟢 أُضيفت الطباعة إلى قائمة الانتظار': '🟢 Added to the print queue',
  '🟢 طلعت فاتورة الاختبار — الطابعة جاهزة.': '🟢 The test receipt printed — the printer is ready.',
  '🔴 تعذر الحفظ — جرّب مرة ثانية': '🔴 Could not save — try again',
  '🔴 تعذر الاسترجاع — جرّب مرة ثانية': '🔴 Could not refund — try again',
  '🔴 تعذرت الطباعة — جرّب مرة ثانية': '🔴 Could not print — try again',
  '🔴 تعذرت الطباعة — جرّب مرة ثانية.': '🔴 Could not print — try again.',
  '🔴 أكمل إعدادات الطابعة فوق أولًا': '🔴 Complete the printer settings above first',
  '🔴 الطباعة غير متاحة على هذا الجهاز': '🔴 Printing is not available on this device',
  '🔴 خطأ غير متوقع — جرّب مرة ثانية': '🔴 Something went wrong — try again',
  '🔴 ما طلعت الفاتورة — تأكد إن الطابعة شغالة وفيها ورق وعلى نفس الشبكة.': '🔴 The receipt did not print — check the printer is on, has paper, and is on the same network.',
  '🔴 ما فيه طابعة محفوظة — أكمل الإعدادات فوق واحفظها.': '🔴 No printer saved — complete the settings above and save them.',

  // Screen titles, buttons and empty states written as bare JSX text.
  'حالة الجهاز': 'Device status',
  'تحديث': 'Refresh',
  'حركة نقدية بالدرج': 'Cash movement',
  'المبلغ': 'Amount',
  'السبب': 'Reason',
  'تسجيل الحركة': 'Record it',
  'ما فيه وردية مفتوحة.': 'No open shift.',
  'اختر عميلًا': 'Choose a customer',
  'صار خطأ غير متوقع': 'Something went wrong',
  'استبدال منتج بالنقاط': 'Redeem points for an item',
  'موافقة المدير مطلوبة': 'Manager approval needed',
  'إضافة': 'Add',
  'الرصيد الافتتاحي': 'Opening float',
  'لا يوجد طلبات.': 'No orders.',
  'رقم جهاز النداء': 'Pager number',
  'ما فيه فواتير بانتظار الطباعة.': 'No receipts waiting to print.',
  'حفظ الإعدادات': 'Save settings',
  'العلامة التجارية (اختياري)': 'Brand (optional)',
  'الطراز (اختياري)': 'Model (optional)',
  'عنوان الطابعة في الشبكة': 'Printer address on the network',
  'عنوان طابعة المطبخ (اتركه فارغ لو نفس طابعة الكاشير تطبع للمطبخ)': 'Kitchen printer address (leave empty if the till printer prints for the kitchen)',
  'منفذ طابعة المطبخ': 'Kitchen printer port',
  'أمر فتح الدرج الخاص بطابعتك': 'Your printer drawer-open command',
  'لم يتم العثور على أجهزة.': 'No devices found.',
  'لم يُحدد جهاز بعد': 'No device chosen yet',
  'لا يوجد اتصال — يعمل بمنيو محفوظ محليًا': 'No connection — using the menu saved on this device',
  'لا يوجد منتجات لهذا المشروع.': 'No products for this business.',
  'خرج مع المندوب': 'Out with the driver',
  'انقفلت الوردية': 'Shift closed',
  'الكاش المتوقع': 'Expected cash',
  'طباعة الموازنة مرة ثانية': 'Print the close report again',
  'جاري طباعة الموازنة...': 'Printing the close report...',
  '✓ تمت طباعة الموازنة': '✓ Close report printed',
  'تسجيل الخروج': 'Sign out',
  'فيه وردية ما انقفلت': 'A shift was left open',
  'إغلاق الوردية السابقة': 'Close the previous shift',
  'لا يوجد طاولات لهذا الفرع.': 'No tables for this branch.',
  'لا يوجد طاولات متاحة للنقل إليها.': 'No tables available to move to.',
  'لا يمكن التراجع عن هذا. يتطلب موافقة المدير.': 'This cannot be undone. It needs manager approval.',
};

/**
 * Fold the spelling differences that carry no meaning: the four written
 * forms of alef, final ya vs alef maqsura, ta marbuta vs ha, tatweel,
 * short vowels, and runs of whitespace.
 */
function normalizeArabic(v: string): string {
  return v
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Built once: the same table keyed on the normalised spelling. Later
 *  entries lose to earlier ones, so the table's own order decides. */
const I18N_EN_NORM: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const key of Object.keys(I18N_EN)) {
    const n = normalizeArabic(key);
    if (!(n in out)) out[n] = I18N_EN[key];
  }
  return out;
})();

export function lookupEn(ar: string): string | undefined {
  return I18N_EN[ar] ?? I18N_EN_NORM[normalizeArabic(ar)];
}

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
    () => ({ lang, t: (ar: string) => (lang === 'en' ? lookupEn(ar) || ar : ar), toggle }),
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
  if (lang !== 'en') return row.name;
  // The source's own order: the row's English name first, then the UI
  // dictionary, then the Arabic. The middle step was missing here, which
  // is why a category called "الحلويات" stayed Arabic in English mode even
  // though the word is in the table — a business only fills name_en for
  // products, almost never for categories.
  return row.nameEn || lookupEn(row.name) || row.name;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
