(function(){
  if (window.__rakeenPosBooted) return;
  window.__rakeenPosBooted = true;

// A dedicated reservation-host stand at the entrance (or the cashier
// stepping over to it) — same login and the exact same live
// restaurant_tables/table_reservations data as the real POS, just scoped
// down to seating/waitlist management with no cash drawer, no cart, no
// payment. Detected purely by route (/pos/host) so it's one codebase, not
// a parallel app to keep in sync.
const HOST_MODE = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/pos/host';

// Every innerHTML template in this file that interpolates customer/guest-
// supplied text (online order names/addresses, public reservation names,
// hotel guest names, WhatsApp-derived text) MUST run it through this first —
// none of that data is trusted, and it renders inside an authenticated
// cashier/owner session. Covers the 5 HTML metacharacters; safe to apply
// even to values that also get used inside an attribute (href="...") since
// it escapes quotes too.
function escapeHtml(value){
  if(value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============ Language toggle (Arabic/English) — per-device, like the
   theme toggle. Phase 1: the Home screen (topbar chrome, category sidebar,
   product grid, order panel/checkout) plus every product/category name.
   Other screens (Orders, Tables, settings, reports, loyalty, kitchen
   alerts) stay Arabic-only for now — a genuinely complete translation is a
   much bigger pass across the rest of this file, coming incrementally.
   Arabic stays the single source of truth for every UI string (matching
   how this whole file is authored) — t() just substitutes from a lookup
   table keyed by the Arabic original, so nothing needs a parallel "key"
   naming scheme; only DYNAMIC-content strings (real order numbers, staff
   names, toasts) are left untranslated in this phase. */
let LANG = 'ar';
try { LANG = localStorage.getItem('rakeen_pos_lang') || 'ar'; } catch {}
const I18N_EN = {
  'الرئيسية': 'Home', 'الطلبات': 'Orders', 'الطاولات': 'Tables', 'المزيد': 'More',
  'متصل بالإنترنت': 'Online', 'غير متصل — يحفظ محليًا': 'Offline — saving locally',
  'الطابعة جاهزة': 'Printer ready', 'تنبيهات التوصيل': 'Delivery alerts', 'تبديل المظهر': 'Toggle theme',
  'ابحث أو امسح باركود...': 'Search or scan barcode...', 'المفضّلة': 'Favorites',
  'الأكثر طلبًا': 'Popular', 'الكل': 'All', 'ما فيه نتائج مطابقة': 'No matching results',
  'الطلب الحالي': 'Current order', 'اضغط منتج عشان يضاف': 'Tap a product to add it',
  'عدد الأصناف': 'Items', 'المجموع الفرعي': 'Subtotal', 'ضريبة القيمة المضافة': 'VAT',
  '(شاملة ضمن الإجمالي)': '(included in total)', 'الإجمالي': 'Total', 'ادفع': 'Pay',
  'إفراغ الطلب': 'Clear order', '+ خصم': '+ Discount', 'إضافة للطلب': 'Add to order',
  'تسجيل الطلب': 'Register order', 'اضغط مرة ثانية للتأكيد': 'Tap again to confirm',
  'حبة': 'item', 'نقاط': 'Points', 'آخر عملية': 'Last transaction', 'إعادة طباعة': 'Reprint',
  '+ ملاحظة': '+ Note', 'أضف': 'Add',
  'فيه خيارات — اضغط مطولًا للتخصيص': 'Has options — hold to customize',

  // Provisioning and sign-in.
  'تجهيز هذا الجهاز': 'Set up this device', 'ربط الجهاز': 'Link device',
  'رمز الفرع': 'Branch code', 'أدخل رمز نقطة البيع لهذا الفرع': 'Enter this branch\u2019s POS code',
  'سجّل دخولك كمدير أو مالك مرة وحدة بس، عشان نربط هذا التابلت بفرعك.':
    'Sign in as a manager or owner once, to link this tablet to your branch.',
  'جارٍ التحقق من الرمز...': 'Checking the code...', 'جارٍ التحقق...': 'Checking...',
  'إعادة تجهيز الجهاز': 'Re-provision device', 'البريد الإلكتروني': 'Email',
  'كلمة المرور': 'Password',

  // Staff picker.
  'مين اللي مداوم؟': 'Who is on shift?',
  'اختر اسمك عشان تتسجل الطلبات باسمك': 'Pick your name so orders are recorded under it',
  'كاشير': 'Cashier', 'تبديل الموظف': 'Switch staff member', 'تسجيل خروج': 'Sign out',

  // Shift.
  'الوردية': 'Shift', 'بدء الوردية': 'Start shift',
  'الرصيد الافتتاحي (ر.س)': 'Opening float (SAR)',
  'أدخل المبلغ النقدي الموجود بالدرج عشان تبدأ الوردية':
    'Enter the cash in the drawer to start the shift',
  'موافقة المدير': 'Manager approval',

  // Orders screen tabs and states.
  'جارية': 'In progress', 'مكتملة': 'Completed', 'ملغاة': 'Cancelled',
  'بانتظار الدفع': 'Awaiting payment', 'بانتظار الطلب': 'Awaiting order',
  'قيد التقديم': 'Being served', 'طلب إلكتروني جديد 🌐': 'New online order 🌐',

  // Tables screen.
  'متاحة': 'Available', 'تنظيف': 'Cleaning',
  'قائمة الانتظار': 'Waitlist', '+ إضافة لقائمة الانتظار': '+ Add to waitlist',
  'تذكيرات': 'Reminders', 'إجراءات سريعة — وقت الخدمة': 'Quick actions \u2014 service time',
  'إلغاء طلب الطاولة': 'Cancel table order',

  // Payment.
  'الدفع': 'Payment', 'تخصيص المنتج': 'Customize item', 'إلغاء': 'Cancel',
  'متصل': 'Online', '؟': '?',

  // Attribute-only strings.
  'دوّر بالاسم أو الجوال...': 'Search by name or mobile...', 'رجوع': 'Back',

  // The discount buttons carry Arabic-indic numerals, which stay unreadable
  // to an English reader even though every letter around them changed.
  '٥٪': '5%', '١٠٪': '10%', '١٥٪': '15%',

  // More-screen tiles, and the section names a café actually uses —
  // displayName falls through here when a category has no name_en, which
  // is almost always, since businesses fill that for products only.
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
  // Renamed channels: pickup IS takeaway, and the cashier's delivery is a
  // delivery-app order.
  'سفري': 'Takeaway', 'محلي': 'Dine-in', '📦 سفري': '📦 Takeaway',
  '🍽️ محلي': '🍽️ Dine-in', '🛵 تطبيقات التوصيل': '🛵 Delivery apps',
  'عنوان الطابعة في الشبكة (نفس شبكة الواي فاي)': 'Printer address on the network (same Wi-Fi)',
  'المنفذ': 'Port number',
  'عنوان الطابعة — مثال: 192.168.1.51': 'Printer address — e.g. 192.168.1.51',
  'مثال: 192.168.1.50': 'e.g. 192.168.1.50',
  '٠٠٠٠': '0000',
  // The rest of the cashier: orders, payment, customers, tables,
  // shift close, hotel and printer settings.

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
  // Ported from the app, which had to cover every screen once its
  // <Text> started translating itself. Same table, same business.
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
  'موافقة مدير': 'Manager approval',
  'تمت موافقة المدير': 'Manager approved',
  'رمز خاطئ': 'Wrong code',
  'تعذر التحقق من الرمز — تحقق من الاتصال': 'Could not check the code — check your connection',
  'ما تم تعيين كلمة سر مدير بعد — من لوحة التحكم: الإعدادات ← نقطة البيع': 'No manager code set yet — in the dashboard: Settings -> Point of sale',
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
  'مطلوب': 'Required',
  'اختياري': 'Optional',
  'ما فيه أصناف متاحة': 'No items available',
  'التكلفة والمخزون': 'Cost and stock',
  'ما فيه منتج بهذا الباركود': 'No product with that barcode',
  'تعذر تحميل المنتجات — تحقق من الاتصال.': 'Could not load products — check your connection.',
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
  'قهوة': 'Coffee',
  'برجر': 'Burgers',
  'بيتزا': 'Pizza',
  'حلا': 'Sweets',
  'كيك': 'Cake',
  'ماء': 'Water',
  'مياه': 'Water',
  'مخبوز': 'Baked',
  'رئيسي': 'Mains',
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

/* ============ Generic translation pass ============
   applyLang() used to carry one hand-written setText() line per element,
   which is why coverage stalled at the Home screen: every new string meant
   another line, and anything anyone forgot silently stayed Arabic.

   This walks the static markup instead and substitutes any text node or
   attribute whose FULL trimmed value is a dictionary key. Adding an entry
   above now translates every place that string appears, with no wiring.

   Two rules keep it safe:

   1. Exact whole-value matches only. A product called "برجر" is never
      touched because no partial substitution ever happens.
   2. Renderer-owned containers are skipped entirely. Those hold product
      and customer names, order numbers and toasts — dynamic text that its
      own renderer already translates (and which knows about name_en,
      something a UI dictionary cannot). Translating them here would fight
      that renderer and could rewrite a real product's name.

   The Arabic original is stashed on the node the first time it is touched,
   so switching back is a restore rather than a reverse lookup — which
   would be ambiguous the moment two Arabic strings share one English
   translation. */
// Only the containers that paint CATALOGUE names are skipped. Those three
// render product and category names through the name_en path, which a fixed
// table cannot know about and must not fight.
//
// The orders and tables lists are deliberately NOT skipped: their dynamic
// parts are customer names, table numbers and order ids, none of which can
// collide with a dictionary key, because a key only ever matches a text
// node's WHOLE trimmed value. Skipping them would have meant hand-wrapping
// every label they render — the exact cost this pass exists to remove.
const I18N_SKIP = '#productGrid, #catRail, #orderSummary, .toast, [data-no-i18n]';

/* Newly rendered content translates itself.
   Screens here are built by assigning innerHTML, so a language applied once
   at boot would be undone by the next render. Watching for added nodes
   keeps a renderer from having to know that translation exists at all.
   The guard flag matters: translateTree edits text nodes, which would
   otherwise re-enter this observer through its own mutations. */
let i18nApplying = false;
const i18nObserver = new MutationObserver(records => {
  if(LANG !== 'en' || i18nApplying) return;
  i18nApplying = true;
  try {
    for(const rec of records){
      for(const node of rec.addedNodes){
        if(node.nodeType === 1) translateTree(node);
      }
    }
  } catch {} finally { i18nApplying = false; }
});
try { i18nObserver.observe(document.body, { childList: true, subtree: true }); } catch {}

function translateTree(root){
  if(!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const el = node.parentElement;
      if(!el || el.closest(I18N_SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  for(const node of nodes){
    if(node.__rkAr === undefined) node.__rkAr = node.nodeValue;
    const original = node.__rkAr;
    const key = original.trim();
    const en = lookupEn(key);
    // Replacing only the trimmed part preserves the surrounding whitespace
    // the markup's own indentation put there, which some buttons rely on
    // to keep a gap between an icon and its label.
    node.nodeValue = (LANG === 'en' && en) ? original.replace(key, en) : original;
  }
  for(const el of root.querySelectorAll('[placeholder], [title], [aria-label]')){
    if(el.closest(I18N_SKIP)) continue;
    for(const attr of ['placeholder', 'title', 'aria-label']){
      if(!el.hasAttribute(attr)) continue;
      const stash = 'rkAr' + attr.replace('-', '');
      if(el.dataset[stash] === undefined) el.dataset[stash] = el.getAttribute(attr);
      const original = el.dataset[stash];
      const en = lookupEn(original.trim());
      el.setAttribute(attr, (LANG === 'en' && en) ? en : original);
    }
  }
}
// Fold the spelling differences that carry no meaning: the written forms
// of alef, final ya vs alef maqsura, ta marbuta vs ha, tatweel, short
// vowels, whitespace runs. Menu text is typed by hand, so a category
// written "الاسبريسو" has to find an entry spelled "الإسبريسو".
function normalizeArabic(v){
  return v.replace(/[أإآٱ]/g, 'ا')
          .replace(/ى/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/[ً-ْـ]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
}
const I18N_EN_NORM = (() => {
  const out = {};
  for(const k of Object.keys(I18N_EN)){
    const n = normalizeArabic(k);
    if(!(n in out)) out[n] = I18N_EN[k];
  }
  return out;
})();
function lookupEn(ar){ return I18N_EN[ar] !== undefined ? I18N_EN[ar] : I18N_EN_NORM[normalizeArabic(ar)]; }
function t(ar){ return LANG === 'en' ? (lookupEn(ar) || ar) : ar; }

// Real reported bug: every phone field's digit-strip used /\D/g, which in
// JS only matches ASCII 0-9 — a customer typing on an Arabic keyboard
// (Arabic-Indic ٠-٩, common default in this market) got every character of
// their number silently wiped instead of converted, since \D treats them
// as "non-digit" too. Convert both Arabic-Indic and Eastern Arabic-Indic
// (Persian) digits to Western digits FIRST, before any \D stripping.
function toWesternDigits(str){
  return String(str).replace(/[٠-٩۰-۹]/g, ch=>{
    const code = ch.charCodeAt(0);
    return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
  });
}

// The Diagnostics screen used to show native/network error strings verbatim
// (job.last_error / caught exception messages) — real reported leak of
// internal jargon (driver/library names, raw HTTP/socket errors) straight to
// a cashier's screen, which means nothing to them and looks broken. Maps the
// common real cases to plain Arabic; anything unrecognized gets a short
// generic line instead of the raw string, never the raw string itself.
// Matches the dashboard's rkCheck() — see .pos-check in rakeen-pos-additions.css.
function posCheck(inputAttrs, label){
  return `<label class="pos-check"><input type="checkbox" ${inputAttrs}><span class="pos-check-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span class="pos-check-label">${label}</span></label>`;
}
function friendlyErrorText(raw){
  const s = String(raw || '').toLowerCase();
  if(!s) return 'خطأ غير معروف';
  if(s.includes('timeout') || s.includes('timed out')) return 'انتهت مهلة الاتصال بالطابعة';
  if(s.includes('econnrefused') || s.includes('connection refused') || s.includes('unreachable')) return 'تعذر الوصول للطابعة — تأكد إنها شغّالة ومتصلة بنفس شبكة الواي فاي';
  if(s.includes('network') || s.includes('fetch failed') || s.includes('offline')) return 'مشكلة اتصال بالإنترنت';
  if(s.includes('unauthorized') || s.includes('401') || s.includes('forbidden') || s.includes('403')) return 'صلاحية الوصول مرفوضة';
  if(s.includes('not found') || s.includes('404')) return 'الخدمة غير متاحة حاليًا';
  return 'صار خطأ تقني — جرّب مرة ثانية أو تواصل مع الدعم';
}

// Shared money display, mirroring the dashboard's rkMoney() — halalas render
// smaller than the whole riyals (matches printed receipts), and the real
// Saudi Riyal sign replaces every "ر.س"/"SAR" text label. Currency-agnostic
// on purpose: the real sign doesn't need a LANG branch the way "ر.س"/"SAR"
// text did.
const RK_RIYAL_CHAR = '⃁';

// العملة على الورق: الكلمة لا الرمز.
//
// رمز الريال الجديد ليس في أي خط تحمله الطابعة ولا في IBM Plex الذي
// نرسم به الفاتورة -- والتعليق أعلى .rk-riyal في CSS يقول ذلك صراحةً:
// أي نص يعرض هذا المحرف خارج تلك الفئة يخرج مربعاً فارغاً. وهو فوق ذلك
// مرسوم معكوساً في خطه ويحتاج scaleX(-1) ليستقيم.
//
// ومربع فارغ جنب كل سعر أسوأ من غياب العملة، فالكلمة تُقرأ في كل مكان.
const RIYAL = 'ريال';

// نوع الطلب بالعربية والإنجليزية.
//
// الورقة تُقرأ في مطبخ فيه من لا يقرأ العربية، وفي صالة فيها من لا يقرأ
// الإنجليزية، والكلمة الواحدة هنا تقرر أين يذهب الطلب.
const ORDER_KIND_BILINGUAL = {
  'محلي': 'محلي · Dine-in',
  'بالمطعم': 'محلي · Dine-in',
  'سفري': 'سفري · Takeaway',
  'توصيل': 'توصيل · Delivery',
  'استلام': 'استلام · Pickup',
  'طلب إلكتروني': 'طلب إلكتروني · Online Order'
};
function bilingualOrderKind(metaLabel){
  if(!metaLabel) return '';
  // "محلي — طاولة 7" يحمل النوع وما بعده، فيُترجم النوع ويبقى الباقي.
  for(const ar of Object.keys(ORDER_KIND_BILINGUAL)){
    if(metaLabel.indexOf(ar) === 0) return ORDER_KIND_BILINGUAL[ar] + metaLabel.slice(ar.length);
  }
  return metaLabel;
}
function rkMoney(amount){
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');
  return `<span class="rk-money mono">${sign}${whole}<span class="rk-money-frac">.${frac}</span> <span class="rk-riyal">${RK_RIYAL_CHAR}</span></span>`;
}
function applyLang(){
  // Layout direction stays RTL regardless of language — a cashier's muscle
  // memory for where every button sits matters more than a "correctly"
  // mirrored English layout, and every real bilingual POS in this market
  // works the same way. Only the text itself switches.
  document.documentElement.lang = LANG;
  const langBtn = document.getElementById('langToggle');
  if(langBtn) langBtn.textContent = LANG === 'en' ? 'ع' : 'EN';

  // The generic pass first; the hand-written lines below stay because a few
  // of them carry real logic (the discount button's active state, the hold
  // button's whitespace-sharing text node) that a blind substitution must
  // not clobber.
  i18nApplying = true;
  try { translateTree(document.body); } catch {} finally { i18nApplying = false; }

  const setText = (sel, ar) => { const el = document.querySelector(sel); if(el) el.textContent = t(ar); };
  setText('.nav-tab[data-screen="home"] span', 'الرئيسية');
  setText('.nav-tab[data-screen="orders"] span', 'الطلبات');
  setText('.nav-tab[data-screen="tables"] span', 'الطاولات');
  setText('.nav-tab[data-screen="more"] span', 'المزيد');

  const searchInput = document.getElementById('searchInput');
  if(searchInput) searchInput.placeholder = t('ابحث أو امسح باركود...');
  const favToggle = document.getElementById('favToggle');
  if(favToggle) favToggle.title = t('المفضّلة');
  const notifBell = document.getElementById('notifBellBtn');
  if(notifBell){ notifBell.setAttribute('aria-label', t('تنبيهات التوصيل')); notifBell.title = t('تنبيهات التوصيل'); }
  const themeToggle = document.getElementById('themeToggle');
  if(themeToggle) themeToggle.setAttribute('aria-label', t('تبديل المظهر'));
  const opTitle = document.querySelector('.op-title');
  if(opTitle) opTitle.textContent = t('الطلب الحالي');
  // Only reset the discount button's label when it's showing its default
  // "+ خصم" state — once a discount is active it reads "خصم ١٠٪ مفعّل" (see
  // the discountPanel click handler below), which this must not clobber.
  // Wrapped: applyLang() also runs once at the very top of this file, before
  // `state` (declared further down) is initialized — reading it that early
  // would throw and silently abort everything below this line.
  try {
    const discountToggle = document.getElementById('discountToggle');
    if(discountToggle && state.discountPct === 0) discountToggle.textContent = LANG === 'en' ? '+ Discount' : '+ خصم';
  } catch {}
  const clearBtn = document.getElementById('clearOrderBtn');
  if(clearBtn && !clearBtn.classList.contains('armed')) clearBtn.textContent = t('إفراغ الطلب');

  updateConnStatus();
  // Re-run the Home screen's own render functions so their JS-generated
  // strings (category sidebar, product grid, order panel/checkout totals)
  // pick up the new language too — all guarded since applyLang() also runs
  // once at boot, before PRODUCTS/CATEGORIES exist yet.
  // Wrapped in try/catch, not just existence checks: #orderSummary (unlike
  // #catRail/#productGrid) exists empty in the static markup from page
  // load, so its own presence doesn't actually tell us `state` (declared
  // further down this file) has been initialized yet — calling renderOrder()
  // that early threw and got reported as an unhandled rejection way down at
  // this file's closing line, from wherever the async boot chain landed.
  try {
    if(document.getElementById('catRail') && document.getElementById('catRail').children.length) renderCatRail();
    if(document.getElementById('productGrid') && document.getElementById('productGrid').children.length) renderProductGrid();
    if(typeof renderOrder === 'function' && document.getElementById('orderSummary')) renderOrder();
  } catch {}
}
document.getElementById('langToggle').addEventListener('click', ()=>{
  LANG = LANG === 'en' ? 'ar' : 'en';
  try { localStorage.setItem('rakeen_pos_lang', LANG); } catch {}
  applyLang();
});
applyLang(); // apply the stored preference immediately — even pre-login, the topbar/nav chrome should already match

// The tablet+ topbar (.app.home-active > .topbar, rakeen-pos.css) wraps onto
// however many lines its content needs once .order-panel's reserved width
// leaves too little room for one line — a real, continuously variable
// height depending on viewport width, not one of a few fixed breakpoint
// values. Every layout piece that needs to start below it (.screen-head,
// .cat-sidebar, .products-toolbar, .bottom-nav's top) reads --topbar-h
// instead of a hardcoded guess, so this stays correct at every width
// instead of drifting out of sync the moment the real height doesn't match
// whatever number was hand-picked for one specific screen size.
(function syncTopbarHeightVar(){
  const topbar = document.querySelector('.topbar');
  if(!topbar || typeof ResizeObserver === 'undefined') return;
  const apply = ()=> document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
  apply();
  new ResizeObserver(apply).observe(topbar);
})();

/* ============ DATA — seed literals below are the pre-Supabase demo values;
   loadPosData() (near the auth section) replaces CATEGORIES/PRODUCTS/
   MODIFIER_PRODUCTS with real fetched data after a cashier logs in. Kept as
   `let` (not `const`) for that reassignment; nothing reads them before
   bootPos() runs. ============ */
let CATEGORIES = [
  {id:'hot', name:'ساخنة', icon:'☕'}, {id:'cold', name:'باردة', icon:'🧊'},
  {id:'bakery', name:'مخبوزات', icon:'🥐'}, {id:'mains', name:'رئيسية', icon:'🍔'}, {id:'desserts', name:'حلا', icon:'🍰'}
];
let PRODUCTS = [
  {id:1, cat:'hot', name:'قهوة عربي', price:12, icon:'cupHot', fav:true, pop:98},
  {id:2, cat:'hot', name:'لاتيه', price:18, icon:'cupHot', fav:true, pop:95},
  {id:3, cat:'hot', name:'كابتشينو', price:18, icon:'cupHot', fav:false, pop:70},
  {id:4, cat:'hot', name:'إسبريسو', price:14, icon:'cupHot', fav:false, pop:55},
  {id:5, cat:'hot', name:'شاي كرك', price:10, icon:'cupHot', fav:false, pop:60},
  {id:6, cat:'hot', name:'موكا', price:20, icon:'cupHot', fav:false, pop:40},
  {id:7, cat:'cold', name:'لاتيه مثلج', price:20, icon:'cupCold', fav:true, pop:90},
  {id:8, cat:'cold', name:'آيس كوفي', price:18, icon:'cupCold', fav:false, pop:65},
  {id:9, cat:'cold', name:'عصير برتقال', price:15, icon:'cupCold', fav:false, pop:45},
  {id:10, cat:'cold', name:'ليموناضة نعناع', price:16, icon:'cupCold', fav:false, pop:50},
  {id:11, cat:'cold', name:'مياه معدنية', price:5, icon:'water', fav:false, pop:75},
  {id:12, cat:'bakery', name:'كرواسون', price:12, icon:'pastry', fav:false, pop:58},
  {id:13, cat:'bakery', name:'مافن شوكولاتة', price:14, icon:'pastry', fav:false, pop:42},
  {id:14, cat:'bakery', name:'كوكيز', price:9, icon:'pastry', fav:false, pop:38},
  {id:15, cat:'mains', name:'برجر لحم', price:32, icon:'burger', fav:true, pop:88},
  {id:16, cat:'mains', name:'ساندويش دجاج', price:28, icon:'burger', fav:false, pop:62},
  {id:17, cat:'mains', name:'بيتزا مارجريتا', price:38, icon:'pizza', fav:false, pop:48},
  {id:18, cat:'mains', name:'سلطة سيزر', price:24, icon:'bowl', fav:false, pop:35},
  {id:19, cat:'desserts', name:'تشيز كيك', price:22, icon:'cake', fav:false, pop:52},
  {id:20, cat:'desserts', name:'كنافة', price:20, icon:'cake', fav:false, pop:44},
  {id:21, cat:'mains', name:'بوكس دجاج ١٢ قطعة', price:65, icon:'burger', fav:false, pop:32},
  {id:22, cat:'mains', name:'وجبة برجر', price:42, icon:'burger', fav:true, pop:80}
];

/* ============ MODIFIER SYSTEM ============
   Products not listed here are simple — always fast-path, one tap, instant add.
   Products listed here fast-path using their defaults UNLESS alwaysCustomize is set
   (box/meal builders can't have a sensible default). Long-press always opens customization. */
let MODIFIER_PRODUCTS = {
  15: { // برجر لحم
    groups: [
      {id:'bread', name:'نوع الخبز', type:'single', required:true, options:[
        {id:'classic', name:'كلاسيك', price:0, default:true},
        {id:'sesame', name:'سمسم', price:0},
        {id:'brioche', name:'بريوش', price:3}
      ]},
      {id:'doneness', name:'درجة النضج', type:'single', required:true, options:[
        {id:'medium', name:'متوسط', price:0, default:true},
        {id:'welldone', name:'ويل دن', price:0, critical:true}
      ]},
      {id:'extras', name:'إضافات', type:'multiple', required:false, max:4, options:[
        {id:'cheese', name:'جبن إضافي', price:5},
        {id:'bacon', name:'بيكون تركي', price:8},
        {id:'egg', name:'بيضة', price:4},
        {id:'jalapeno', name:'هالبينو', price:3}
      ]},
      {id:'remove', name:'إزالة مكونات', type:'multiple', required:false, max:4, options:[
        {id:'onion', name:'بدون بصل', price:0, critical:true},
        {id:'pickle', name:'بدون مخلل', price:0, critical:true},
        {id:'sauce', name:'بدون صوص', price:0, critical:true},
        {id:'tomato', name:'بدون طماطم', price:0, critical:true}
      ]}
    ]
  },
  16: { // ساندويش دجاج
    groups: [
      {id:'sauce', name:'نوع الصوص', type:'single', required:true, options:[
        {id:'garlic', name:'ثوم', price:0, default:true},
        {id:'bbq', name:'باربكيو', price:0},
        {id:'spicy', name:'حار', price:0, critical:true}
      ]},
      {id:'remove', name:'إزالة مكونات', type:'multiple', required:false, max:3, options:[
        {id:'onion', name:'بدون بصل', price:0, critical:true},
        {id:'pickle', name:'بدون مخلل', price:0, critical:true}
      ]}
    ]
  },
  17: { // بيتزا مارجريتا
    groups: [
      {id:'size', name:'الحجم', type:'single', required:true, options:[
        {id:'small', name:'صغير', price:-8},
        {id:'medium', name:'وسط', price:0, default:true},
        {id:'large', name:'كبير', price:10}
      ]},
      {id:'crust', name:'نوع العجين', type:'single', required:true, options:[
        {id:'thin', name:'رفيع', price:0, default:true},
        {id:'thick', name:'سميك', price:0},
        {id:'cheesecrust', name:'حواف جبن', price:6}
      ]},
      {id:'toppings', name:'إضافات', type:'multiple', required:false, max:5, options:[
        {id:'mushroom', name:'مشروم', price:4},
        {id:'olives', name:'زيتون', price:3},
        {id:'extracheese', name:'جبن إضافي', price:5}
      ]}
    ]
  },
  2: { // لاتيه
    groups: [
      {id:'size', name:'الحجم', type:'single', required:true, options:[
        {id:'small', name:'صغير', price:-3},
        {id:'medium', name:'وسط', price:0, default:true},
        {id:'large', name:'كبير', price:4}
      ]},
      {id:'milk', name:'نوع الحليب', type:'single', required:false, options:[
        {id:'regular', name:'حليب عادي', price:0, default:true},
        {id:'oat', name:'حليب شوفان', price:4},
        {id:'almond', name:'حليب لوز', price:4}
      ]},
      {id:'sugar', name:'مستوى السكر', type:'single', required:false, options:[
        {id:'normal', name:'عادي', price:0, default:true},
        {id:'less', name:'سكر أقل', price:0},
        {id:'none', name:'بدون سكر', price:0}
      ]}
    ]
  },
  22: { // وجبة برجر — meal builder: flat price, no per-option deltas
    isMeal: true, alwaysCustomize: true,
    groups: [
      {id:'burger', name:'اختر البرجر', type:'single', required:true, options:[
        {id:'classic', name:'برجر كلاسيك', price:0},
        {id:'cheese', name:'برجر تشيز', price:0},
        {id:'spicy', name:'برجر حار', price:0, critical:true}
      ]},
      {id:'side', name:'اختر الجانب', type:'single', required:true, options:[
        {id:'fries', name:'بطاطس', price:0, default:true},
        {id:'salad', name:'سلطة', price:0},
        {id:'onionrings', name:'حلقات بصل', price:0}
      ]},
      {id:'drink', name:'اختر المشروب', type:'single', required:true, options:[
        {id:'pepsi', name:'بيبسي', price:0, default:true},
        {id:'sevenup', name:'سفن أب', price:0},
        {id:'water', name:'مياه', price:0}
      ]}
    ]
  },
  21: { // بوكس دجاج ١٢ قطعة — box builder: flat price, fill exactly N slots
    isBox: true, alwaysCustomize: true, slots: 12,
    items: [
      {id:'wing', name:'ونش'}, {id:'tender', name:'تندر'}, {id:'nugget', name:'ناجت'}, {id:'strips', name:'ستريبس'}
    ]
  }
};

/* Smart upselling — configured per trigger product, max 2 suggestions, never blocking */
const UPSELL_RULES = {
  15: [ {productId:11, label:'مياه'}, {productId:9, label:'عصير برتقال'} ], // burger -> water/juice
  22: [ {productId:19, label:'تشيز كيك'} ], // meal -> dessert
  17: [ {productId:11, label:'مياه'}, {productId:18, label:'سلطة سيزر'} ] // pizza -> water/salad
};

const ICONS = {
  cupHot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2"/></svg>',
  cupCold:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/><path d="M4 8h16l-1.5-4h-13z"/><line x1="14" y1="3" x2="10" y2="10"/></svg>',
  pastry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c2-6 6-10 9-10s3 2 1 3c3 0 5 2 5 4 0 4-6 9-11 9-2 0-4-2-4-6z"/></svg>',
  burger:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 4 0 0 1 16 0z"/><line x1="3" y1="13" x2="21" y2="13"/><path d="M4 16h16"/><path d="M5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/></svg>',
  pizza:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 18-18 0z"/><circle cx="12" cy="12" r="1"/><circle cx="10" cy="16" r="1"/><circle cx="14" cy="16" r="1"/></svg>',
  bowl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18a9 6 0 0 1-18 0z"/><line x1="12" y1="12" x2="12" y2="4"/></svg>',
  cake:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V11l8-7 8 7v9z"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="12" y1="4" x2="12" y2="11"/></svg>',
  water:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6v3l2 2v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7l2-2z"/><line x1="7" y1="11" x2="17" y2="11"/></svg>'
};
const DELIVERY_PLATFORMS = ['هنقرستيشن','جاهز','ذا شفز','ToYou','مرسول','كيتا'];

/* ============ STATE ============ */
let state = {
  activeCat: 'popular', searchQuery: '', showFavOnly:false,
  cart: [], customer: null, discountPct: 0,
  activePaymentMethod: 'cash', cashAmount: 0,
  friendsSplitOpen: false, friendsSplitCount: null,
  pinEntry: '', pinTargetLength: 4,
  orderChannel: 'dine_in', deliveryPlatformId: null, selectedTableId: null, selectedOrderId: null, resumingOrder: null, platformInvoiceLast4: ''
};

/* ============ Alert sounds ============
   All three (new order / 5-min warning / prep time expired) play the real
   recorded sounds the owner provided (self-hosted under public/pos/sounds/,
   same-origin — no external asset fetch). Any kind not in this map falls
   back to a synthesized tone in playAlertSound(). */
const ALERT_SOUND_FILES = {
  new_order: '/pos/sounds/notify-general.mp3',
  warning: '/pos/sounds/notify-prep-warning.mp3',
  alarm: '/pos/sounds/notify-prep-expired.mp3',
  order_ready: '/pos/sounds/notify-general.mp3', // no dedicated "kitchen marked ready" asset yet — reuses the same general chime
  incoming_order: '/pos/sounds/notify-general.mp3' // no dedicated asset yet either — repeated on a timer by startIncomingOrderSound() instead, since this one demands an action, not just an FYI
};
const alertAudioCache = {};
function playAlertSound(kind){
  try {
    const src = ALERT_SOUND_FILES[kind];
    if(src){
      let audio = alertAudioCache[kind];
      if(!audio){ audio = new Audio(src); alertAudioCache[kind] = audio; }
      audio.currentTime = 0;
      audio.play().catch(()=>{}); // autoplay can be blocked before any user gesture — never throw over a sound
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    if(ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = [880, 660, 880, 660];
    const noteDur = 0.12;
    notes.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = now + i * noteDur;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start + noteDur);
    });
    setTimeout(()=> ctx.close(), (notes.length * noteDur + 0.3) * 1000);
  } catch (e) { /* audio is a nice-to-have — never throw over a beep */ }
}

/* ============ UI tap sound ============
   A soft, very short "tick" on every button press across the whole app —
   pure feedback that the tap registered, not an alert. One shared
   AudioContext reused for every tap (never a new one per press, unlike the
   alarm fallback above) — this fires constantly during normal cashiering
   (every product-card tap), and the Sunmi hardware from earlier this build
   is weak enough that per-tap AudioContext churn would be real overhead. */
let tapAudioCtx = null;
function playTapSound(){
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    if(!tapAudioCtx) tapAudioCtx = new Ctx();
    if(tapAudioCtx.state === 'suspended') tapAudioCtx.resume();
    const now = tapAudioCtx.currentTime;
    const osc = tapAudioCtx.createOscillator();
    const gain = tapAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    osc.connect(gain); gain.connect(tapAudioCtx.destination);
    osc.start(now); osc.stop(now + 0.035);
  } catch (e) { /* tap feedback is a nice-to-have — never throw over it */ }
}
// Capture phase (not bubble) so this always fires even when the target's own
// handler calls stopPropagation() (e.g. .dorder-ready-btn does, to stop its
// click from also opening the order-detail modal) — capture runs top-down
// before the target is reached, so a later stopPropagation() during bubble
// can't suppress it. Selector also covers clickable divs that aren't real
// <button> elements (.dorder-card, completed/cancelled .order-row).
document.addEventListener('click', (e)=>{
  const el = e.target.closest('button, .dorder-card, .order-row[data-order]');
  if(el && !el.disabled) playTapSound();
}, true);

/* ============ Toast (replaces alert()) ============ */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toastText').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}

/* ============ Clock ============ */
function updateClock(){
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
}
updateClock(); setInterval(updateClock, 30000);

/* ============ Real connection status — orders queue locally and sync when back online ============ */
/* ============ Theme toggle (independent light/dark modes) ============ */
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
});

/* ============ Network State Model ============
   A single navigator.onLine boolean can't represent this POS's actual
   operating reality: "internet is down but a LAN printer on the same
   Wi-Fi still prints fine" and "internet is up but this specific cloud
   call just failed" are both ROUTINE states here, not edge cases — see
   section 32 of the offline-architecture spec this is built against.
   NETWORK_STATE tracks each dimension independently; Diagnostics (below)
   and the topbar pill both read it instead of re-deriving their own
   partial view of "is everything fine" from scratch. */
let NETWORK_STATE = {
  internet: navigator.onLine,      // browser-level connectivity
  cloud: null,                      // null = no real call made yet this session; true/false = the last one's outcome
  lastCloudCheckAt: null,
  lastCloudError: null,
};
function updateNetworkState(patch){
  Object.assign(NETWORK_STATE, patch);
  refreshDiagnosticsIfOpen();
}
// Piggybacks on syncQueue's own real round-trips (every 30s, plus every
// 'online' event) rather than a separate polling ping — the sync attempt
// already tells us definitively whether the cloud is actually reachable
// right now, not just whether the OS thinks the network interface is up.
function reportCloudResult(ok, error){
  updateNetworkState({ cloud: ok, lastCloudCheckAt: Date.now(), lastCloudError: ok ? null : ((error && error.message) || String(error || 'unknown_error')) });
}

function updateConnStatus(){
  const pill = document.getElementById('connStatus');
  const isOnline = navigator.onLine;
  pill.classList.toggle('online', isOnline);
  pill.classList.toggle('offline', !isOnline);
  pill.innerHTML = '<span class="status-dot"></span>' + t(isOnline ? 'متصل بالإنترنت' : 'غير متصل — يحفظ محليًا');
}
updateConnStatus();
window.addEventListener('online', ()=>{ updateNetworkState({internet:true}); updateConnStatus(); showToast('رجع الاتصال — تتم مزامنة الطلبات'); });
window.addEventListener('offline', ()=>{ updateNetworkState({internet:false}); updateConnStatus(); showToast('انقطع الاتصال — الطلبات تُحفظ وتتزامن تلقائيًا'); });

/* ============ Bottom nav / screen switching ============ */
function switchBottomNavScreen(screenKey){
  const btn = document.querySelector('.nav-tab[data-screen="'+screenKey+'"]');
  if(!btn) return;
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+screenKey).classList.add('active');
  // Only Home has an order panel reserving space on the left — the topbar's
  // narrower, order-panel-aware width (see .app.home-active > .topbar) only
  // makes sense there; every other screen keeps the full-width bar.
  document.getElementById('posApp').classList.toggle('home-active', screenKey === 'home');
  // refresh live data whenever a screen is (re)entered — never show stale state
  if(screenKey === 'orders') renderOrdersList();
  if(screenKey === 'tables'){ if(isHotelBusiness()) renderHotelActiveTab(); else renderTables(); }
  // "Scan-first" mode (roadmap item 2): a retail cashier's default action is
  // scanning, not browsing — keep the barcode/search field focused so a
  // hardware scanner's keystrokes land there immediately, no tap needed.
  if(screenKey === 'home' && isRetailBusiness()) document.getElementById('searchInput').focus();
  // Same reasoning as the orders-tab switch above: mobile scrolls the real
  // page, so landing on a new screen already scrolled down (from whatever
  // the previous screen's scroll position was) hides its own header behind
  // the fixed topbar until manually scrolled back up.
  window.scrollTo(0, 0);
}
document.getElementById('bottomNav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.nav-tab');
  if(!btn) return;
  switchBottomNavScreen(btn.dataset.screen);
});

/* ============ Order channel + delivery platform — changes the base price
   used everywhere (productBasePrice()) since each platform can have its own
   price list, configured on the dashboard. ============ */
// Channel/platform selection UI now lives inside the payment popup's first
// step (renderChannelStep(), below the order-panel section) — this only
// keeps state.deliveryPlatformId defaulted from loaded data, and (re)fills
// the branded button row when that step's markup actually exists in the DOM.
// Each button shows the platform's uploaded logo (Settings → منصات التوصيل)
// or, until one's uploaded, a colored-initial badge using its brand color —
// looks intentional either way, becomes the real logo the moment it's set.
function renderPlatformButtons(){
  if(!state.deliveryPlatformId && DELIVERY_PLATFORMS_LIST.length) state.deliveryPlatformId = DELIVERY_PLATFORMS_LIST[0].id;
  const row = document.getElementById('channelPlatformRow');
  if(!row) return;
  row.innerHTML = DELIVERY_PLATFORMS_LIST.map(p=>{
    const active = p.id === state.deliveryPlatformId;
    const badge = p.logo_url
      ? `<img src="${p.logo_url}" alt="">`
      : `<span class="platform-btn-initial" style="background:${p.brand_color || 'var(--surf2)'}">${(p.name||'؟').charAt(0)}</span>`;
    return `<button type="button" class="platform-btn ${active?'active':''}" data-platform="${p.id}" style="${p.brand_color ? `--platform-color:${p.brand_color};` : ''}">${badge}<span>${p.name}</span></button>`;
  }).join('');
  row.querySelectorAll('.platform-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.deliveryPlatformId = parseInt(btn.dataset.platform, 10);
      // Picking the app is the delivery order's real choice, so it is what
      // moves the step on. Guarded: this same row is re-rendered on the
      // payment step too, where advancing would throw the cashier back.
      if(typeof advanceFromChannelStep === 'function' && document.getElementById('pmChannelRow')){
        setTimeout(advanceFromChannelStep, 0);
      }
      renderPlatformButtons();
      renderProductGrid();
      renderOrder();
    });
  });
}

/* ============ Categories ============ */
function renderCatRail(){
  const el = document.getElementById('catRail');
  const cats = [...(POS_HIDE_POPULAR_TAB ? [] : [{id:'popular', name:'الأكثر طلبًا', icon:'★'}]), {id:'all', name:'الكل', icon:'▦'}, ...CATEGORIES];
  el.innerHTML = cats.map(c=>
    `<button class="cat-btn ${state.activeCat===c.id?'active':''}" data-cat="${c.id}"><span class="ci">${ICONS[c.icon] || c.icon}</span>${LANG === 'en' ? (c.nameEn || t(c.name)) : c.name}</button>`
  ).join('');
  el.querySelectorAll('.cat-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ state.activeCat = btn.dataset.cat; renderCatRail(); renderProductGrid(); });
  });
}

/* ============ Product grid ============ */
function renderProductGrid(){
  const el = document.getElementById('productGrid');
  let items = PRODUCTS;
  if(state.activeCat === 'popular') items = [...items].sort((a,b)=> b.pop - a.pop).slice(0,8);
  else if(state.activeCat !== 'all') items = items.filter(p=>p.cat===state.activeCat);
  if(state.showFavOnly) items = items.filter(p=>p.fav);
  if(state.searchQuery.trim()){
    const q = state.searchQuery.trim().toLowerCase();
    items = items.filter(p=> p.name.toLowerCase().includes(q) || (p.nameEn && p.nameEn.toLowerCase().includes(q)));
  }

  if(items.length === 0){ el.innerHTML = `<div class="grid-empty">${t('ما فيه نتائج مطابقة')}</div>`; return; }

  el.innerHTML = items.map(p=>{
    const hasMods = !!MODIFIER_PRODUCTS[p.id];
    const cat = CATEGORIES.find(c=>c.id===p.cat);
    const displayName = LANG === 'en' ? (p.nameEn || p.name) : p.name;
    const catName = cat ? (LANG === 'en' ? (cat.nameEn || t(cat.name)) : cat.name) : '';
    return `<button class="product-card" data-id="${p.id}">
      <span class="fav-star ${p.fav?'on':''}" data-fav="${p.id}" aria-label="${t('المفضّلة')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
      ${hasMods ? `<span class="customize-dot" title="${t('فيه خيارات — اضغط مطولًا للتخصيص')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>` : ''}
      <div class="product-icon">${(p.image && !POS_HIDE_PRODUCT_IMAGES) ? `<img src="${p.imageThumb || p.image}" alt="" decoding="async">` : ICONS[p.icon]}<span class="product-price">${rkMoney(productBasePrice(p.id))}</span></div>
      <div class="product-name">${displayName}</div>
      ${p.isService ? `<div class="product-cat">${p.durationMinutes} د${catName ? ' · ' + catName : ''}</div>` : (catName ? `<div class="product-cat">${catName}</div>` : '')}
    </button>`;
  }).join('');

  el.querySelectorAll('.product-card').forEach(card=>{
    const productId = parseInt(card.dataset.id);
    let pressTimer = null, longPressFired = false;

    const startPress = (e)=>{
      if(e.target.closest('.fav-star')) return;
      longPressFired = false;
      pressTimer = setTimeout(()=>{
        longPressFired = true;
        openProductFlow(productId, true);
      }, 480);
    };
    const cancelPress = ()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };

    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress, {passive:true});
    card.addEventListener('mouseup', cancelPress);
    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('touchend', cancelPress);
    card.addEventListener('touchmove', cancelPress);

    card.addEventListener('click', (e)=>{
      if(e.target.closest('.fav-star')){
        const id = parseInt(e.target.closest('.fav-star').dataset.fav);
        const p = PRODUCTS.find(x=>x.id===id);
        p.fav = !p.fav;
        renderProductGrid();
        return;
      }
      if(longPressFired){ longPressFired = false; return; } // long-press already handled this interaction
      openProductFlow(productId, false);
      card.classList.add('flash');
      setTimeout(()=> card.classList.remove('flash'), 200);
    });
  });
}
document.getElementById('favToggle').addEventListener('click', function(){
  state.showFavOnly = !state.showFavOnly;
  this.classList.toggle('active', state.showFavOnly);
  renderProductGrid();
});
let searchDebounceTimer;
document.getElementById('searchInput').addEventListener('input', (e)=>{
  state.searchQuery = e.target.value;
  clearTimeout(searchDebounceTimer);
  // full grid re-render is real work on weak hardware (every card repaints
  // its shadow/gradient) — debounce so it happens once per typing pause
  // instead of once per keystroke
  searchDebounceTimer = setTimeout(renderProductGrid, 200);
});
// Roadmap item 2: a USB/Bluetooth barcode scanner acts as a keyboard —
// types the code into whatever field is focused, then sends Enter. The
// search box already promises "ابحث أو امسح باركود..." in its placeholder;
// this is what actually backs that promise. Falls through to the normal
// text-search behavior (already live via the 'input' listener above) when
// the typed text isn't a known barcode.
document.getElementById('searchInput').addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter') return;
  const raw = e.target.value.trim();
  if(!raw) return;
  const productId = BARCODE_TO_PRODUCT_ID[raw];
  if(productId){
    e.preventDefault();
    openProductFlow(productId, false);
    e.target.value = '';
    state.searchQuery = '';
    renderProductGrid();
    const product = PRODUCTS.find(p=>p.id===productId);
    showToast('أُضيف: ' + (product ? product.name : ''));
  } else if(isRetailBusiness()){
    showToast('ما فيه منتج بهذا الباركود');
  }
});

/* ============ Cart logic (config-aware) ============ */
let lineIdCounter = 1;
function configsEqual(a, b){ return JSON.stringify(a||null) === JSON.stringify(b||null); }

function buildDefaultConfig(modDef){
  if(!modDef || modDef.isBox) return null;
  const config = {};
  modDef.groups.forEach(g=>{
    if(g.type === 'single'){
      // A required group can legitimately have zero options for a moment —
      // a manager adds the group to a menu item before adding any options to
      // it. Without this guard, the very next tap on that product threw here
      // (reading .id off undefined) and the product became unusable until
      // reload. null just means "nothing selected yet"; every consumer of
      // config (lineUnitPrice/computeConfigPrice/formatConfigLabels) already
      // treats an unmatched option id as a no-op price/label contribution.
      const def = g.options.find(o=>o.default) || g.options[0];
      config[g.id] = def ? def.id : null;
    } else {
      config[g.id] = g.options.filter(o=>o.default).map(o=>o.id);
    }
  });
  return config;
}

/* delivery-channel base price override — each platform can have its own
   price list per item (menu_item_platform_prices), configured on the
   dashboard; falls back to the normal price when no override exists or
   the order isn't tagged to a platform. */
function productBasePrice(productId){
  if(state.orderChannel === 'delivery' && state.deliveryPlatformId){
    const override = (PLATFORM_PRICES[state.deliveryPlatformId]||{})[productId];
    if(override != null) return override;
  }
  const p = PRODUCTS.find(x=>x.id===productId);
  return p ? p.price : 0;
}

function lineUnitPrice(item){
  if(item.isPointsRedemption) return 0;
  const modDef = MODIFIER_PRODUCTS[item.productId];
  if(!modDef || modDef.isBox || modDef.isMeal || !item.config) return productBasePrice(item.productId);
  let price = productBasePrice(item.productId);
  modDef.groups.forEach(g=>{
    const sel = item.config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId=>{
      const opt = g.options.find(o=>o.id===optId);
      if(opt) price += (opt.price||0);
    });
  });
  return price;
}

/* simple products (no modifier definition) always fast-add instantly */
function addToCart(productId){
  const product = PRODUCTS.find(p=>p.id===productId);
  addToCartWithConfig(product, null, 1);
}

function addToCartWithConfig(product, config, qty){
  const existing = state.cart.find(i=> i.productId===product.id && configsEqual(i.config, config));
  if(existing){ existing.qty += qty; }
  else { state.cart.push({lineId: lineIdCounter++, productId: product.id, qty, note:'', config}); }
  renderOrder();
}

function changeQty(lineId, delta){
  const item = state.cart.find(i=>i.lineId===lineId);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) state.cart = state.cart.filter(i=>i.lineId!==lineId);
  renderOrder();
}
function removeFromCart(lineId){ state.cart = state.cart.filter(i=>i.lineId!==lineId); renderOrder(); }
function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }
// Saudi Ministry of Commerce requires displayed menu prices to be VAT-
// inclusive — the tax is already baked into menu_items.price, not added on
// top at checkout. PRICES_INCLUDE_VAT (loaded from businesses.
// prices_include_vat, default true) branches this: inclusive mode derives
// the VAT portion FROM the discounted sticker amount instead of adding VAT
// on top of it, matching submit_online_order's server-side math exactly.
function cartTotals(){
  // Closing out an already-registered dine-in tab (state.resumingOrder) has
  // no cart at all — the real totals were already computed and stored on
  // the order row back when it was registered; this just surfaces them.
  if(state.resumingOrder){
    const r = state.resumingOrder;
    return {subtotal: Number(r.subtotal), discount: Number(r.discount_amount), vat: Number(r.vat_amount), total: Number(r.total)};
  }
  const subtotal = state.cart.reduce((s,i)=> s + lineUnitPrice(i)*i.qty, 0);
  const discount = subtotal * (state.discountPct/100);
  const afterDiscount = subtotal - discount;
  const rate = VAT_REGISTERED ? BUSINESS_VAT_RATE : 0;
  let vat, total;
  if(PRICES_INCLUDE_VAT){
    vat = round2(afterDiscount * rate / (1 + rate));
    total = afterDiscount;
  } else {
    vat = round2(afterDiscount * rate);
    total = afterDiscount + vat;
  }
  return {subtotal, discount, vat, total};
}

/* ============ Product flow router: fast path vs custom path ============ */
function openProductFlow(productId, forceCustomize){
  const product = PRODUCTS.find(p=>p.id===productId);
  const modDef = MODIFIER_PRODUCTS[productId];
  if(!modDef){
    addToCartWithConfig(product, null, 1); // simple product — always instant
    return;
  }
  if(modDef.alwaysCustomize || forceCustomize){
    openModifierModal(product, modDef);
  } else {
    const defaultConfig = buildDefaultConfig(modDef);
    addToCartWithConfig(product, defaultConfig, 1);
    maybeShowUpsell(productId);
  }
}

function computeConfigPrice(product, config){
  const modDef = MODIFIER_PRODUCTS[product.id];
  if(!modDef || modDef.isBox || modDef.isMeal || !config) return productBasePrice(product.id);
  let price = productBasePrice(product.id);
  modDef.groups.forEach(g=>{
    const sel = config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId=>{
      const opt = g.options.find(o=>o.id===optId);
      if(opt) price += (opt.price||0);
    });
  });
  return price;
}

/* ============ Modifier modal ============ */
let modifierState = {product:null, modDef:null, config:null, qty:1};
const modifierModal = document.getElementById('modifierModal');

function openModifierModal(product, modDef){
  modifierState = {
    product, modDef,
    config: modDef.isBox ? {selections:{}} : buildDefaultConfig(modDef),
    qty: 1
  };
  document.getElementById('modifierProductName').textContent = product.name;
  if(modDef.isBox) renderBoxBuilder();
  else renderGroupModifiers();
  modifierModal.classList.add('show');
}
document.getElementById('closeModifierModal').addEventListener('click', ()=> modifierModal.classList.remove('show'));
modifierModal.addEventListener('click', (e)=>{ if(e.target===modifierModal) modifierModal.classList.remove('show'); });

function renderGroupModifiers(){
  const {modDef, config, product, qty} = modifierState;
  let html = '';
  modDef.groups.forEach(g=>{
    const selected = config[g.id];
    const selectedArr = Array.isArray(selected) ? selected : [selected];
    const badge = g.required ? 'مطلوب' : (g.type==='multiple' ? 'اختياري · حتى ' + g.max : 'اختياري');
    html += `<div class="mod-group">
      <div class="mod-group-head"><span class="mod-group-name">${g.name}</span><span class="mod-group-badge ${g.required?'required':'optional'}">${badge}</span></div>
      <div class="mod-options">`;
    if(g.options.length === 0){
      // Mirrors the box builder's own empty-state message below — a group
      // with no options yet shouldn't crash the modal, just say so.
      html += `<p class="mod-group-empty-hint">ما فيه خيارات مضافة لهذه المجموعة بعد — أضفها من لوحة التحكم.</p>`;
    }
    g.options.forEach(o=>{
      const isSel = selectedArr.includes(o.id);
      html += `<button class="mod-chip ${isSel?'selected':''} ${o.critical?'critical':''}" data-group="${g.id}" data-opt="${o.id}" data-type="${g.type}">
        ${o.name}${o.price?`<span class="mod-chip-price">${o.price>0?'+':''}${o.price}</span>`:''}
      </button>`;
    });
    html += `</div></div>`;
  });
  const unitPrice = computeConfigPrice(product, config);
  html += `<div class="modifier-footer">
    <div class="modifier-qty"><button class="mqty-btn" data-qdelta="-1">−</button><span class="mono" id="modifierQtyVal">${qty}</span><button class="mqty-btn" data-qdelta="1">+</button></div>
    <button class="modifier-add-btn" id="modifierAddBtn">${t('أضف')} — ${rkMoney(unitPrice*qty)}</button>
  </div>`;
  document.getElementById('modifierBody').innerHTML = html;
  wireGroupModifierEvents();
}

function wireGroupModifierEvents(){
  document.querySelectorAll('.mod-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const groupId = chip.dataset.group, optId = chip.dataset.opt, type = chip.dataset.type;
      const group = modifierState.modDef.groups.find(g=>g.id===groupId);
      if(type === 'single'){
        modifierState.config[groupId] = optId;
      } else {
        let arr = modifierState.config[groupId] || [];
        if(arr.includes(optId)) arr = arr.filter(x=>x!==optId);
        else {
          if(arr.length >= (group.max||99)){ showToast('وصلت للحد الأقصى: ' + group.max); return; }
          arr = [...arr, optId];
        }
        modifierState.config[groupId] = arr;
      }
      renderGroupModifiers();
    });
  });
  document.querySelectorAll('.mqty-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modifierState.qty = Math.max(1, modifierState.qty + parseInt(btn.dataset.qdelta));
      renderGroupModifiers();
    });
  });
  document.getElementById('modifierAddBtn').addEventListener('click', ()=>{
    addToCartWithConfig(modifierState.product, modifierState.config, modifierState.qty);
    modifierModal.classList.remove('show');
    maybeShowUpsell(modifierState.product.id);
  });
}

function renderBoxBuilder(){
  const {modDef, config, product} = modifierState;
  if(modDef.items.length === 0){
    document.getElementById('modifierBody').innerHTML = `
      <div class="box-empty-state">
        <p>هذا البوكس ما له أصناف محددة بعد — لازم تحدد الأصناف اللي يقدر العميل يختار منها الأول.</p>
        <p class="box-empty-hint">من لوحة التحكم: القائمة ← عدّل هذا المنتج ← تبويب "التكلفة والمخزون" ← حدد الأصناف المؤهلة (يحتاج أصناف مخزون مضافة الأول).</p>
      </div>`;
    return;
  }
  modDef.items.forEach(it=>{ if(!(it.id in config.selections)) config.selections[it.id] = 0; });
  const total = Object.values(config.selections).reduce((a,b)=>a+b,0);
  const pct = Math.min(100, Math.round(total/modDef.slots*100));
  let html = `<div class="box-progress-label">${total} / ${modDef.slots} اختيار</div>
    <div class="box-progress"><div class="box-progress-bar" style="width:${pct}%"></div></div>
    <div class="box-items-grid">`;
  modDef.items.forEach(it=>{
    const qty = config.selections[it.id];
    html += `<div class="box-item">
      <span class="box-item-name">${it.name}</span>
      <div class="box-item-qty">
        <button class="qty-btn" data-boxdec="${it.id}">−</button>
        <span class="qty-val mono">${qty}</span>
        <button class="qty-btn" data-boxinc="${it.id}">+</button>
      </div>
    </div>`;
  });
  html += `</div>`;
  const canAdd = total === modDef.slots;
  html += canAdd
    ? `<button class="modifier-add-btn" id="modifierAddBtn">${t('أضف')} — ${rkMoney(productBasePrice(product.id))}</button>`
    : `<button class="modifier-add-btn" id="modifierAddBtn" disabled>اكمل باقي الاختيارات (${modDef.slots-total} متبقي)</button>`;
  document.getElementById('modifierBody').innerHTML = html;

  document.querySelectorAll('[data-boxinc]').forEach(btn=>btn.addEventListener('click', ()=>{
    if(total >= modDef.slots){ showToast('البوكس مكتمل — ' + modDef.slots + ' اختيار'); return; }
    config.selections[btn.dataset.boxinc]++;
    renderBoxBuilder();
  }));
  document.querySelectorAll('[data-boxdec]').forEach(btn=>btn.addEventListener('click', ()=>{
    if(config.selections[btn.dataset.boxdec] > 0){ config.selections[btn.dataset.boxdec]--; renderBoxBuilder(); }
  }));
  if(canAdd){
    document.getElementById('modifierAddBtn').addEventListener('click', ()=>{
      addToCartWithConfig(product, config, 1);
      modifierModal.classList.remove('show');
    });
  }
}

/* ============ Kitchen-aware config labels for the order panel ============ */
function formatConfigLabels(productId, config){
  const modDef = MODIFIER_PRODUCTS[productId];
  if(!modDef || !config) return [];
  if(modDef.isBox){
    return Object.entries(config.selections||{})
      .filter(([k,v])=>v>0)
      .map(([k,v])=>{ const item = modDef.items.find(i=>i.id===k); return {text: item.name + ' ×' + v, critical:false}; });
  }
  const labels = [];
  modDef.groups.forEach(g=>{
    const sel = config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId=>{
      if(!optId) return;
      const opt = g.options.find(o=>o.id===optId);
      if(!opt) return;
      labels.push({text: opt.name, critical: !!opt.critical});
    });
  });
  return labels;
}

/* ============ Smart upselling — configurable, max 2, one-tap, never blocking ============ */
function maybeShowUpsell(productId){
  const rules = UPSELL_RULES[productId];
  if(!rules || rules.length === 0) return;
  const strip = document.getElementById('upsellStrip');
  strip.innerHTML = `<span class="upsell-label">يكمل الطلب:</span>` +
    rules.slice(0,2).map(r=>`<button class="upsell-chip" data-upsell="${r.productId}">+ ${r.label}</button>`).join('') +
    `<button class="upsell-dismiss" id="upsellDismiss">✕</button>`;
  strip.classList.add('show');
  strip.querySelectorAll('[data-upsell]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      addToCart(parseInt(btn.dataset.upsell));
      strip.classList.remove('show');
    });
  });
  document.getElementById('upsellDismiss').addEventListener('click', ()=> strip.classList.remove('show'));
  clearTimeout(state.upsellTimer);
  state.upsellTimer = setTimeout(()=> strip.classList.remove('show'), 6000);
}

/* ============ Render order panel ============ */
// Keeps the order panel itself honest about which table (if any) it's being
// built for — without this, a cashier who claimed table 5 from the Tables
// screen has zero visual confirmation on the Home screen that they're not
// accidentally building a walk-in order instead.
function updateTableBadge(){
  const badge = document.getElementById('opTableBadge');
  const cancelBtn = document.getElementById('opCancelTableBtn');
  if(!badge) return;
  const attached = state.orderChannel === 'dine_in' && state.selectedTableId;
  if(attached){
    const t = (TABLES_CACHE || []).find(x => x.id === state.selectedTableId);
    badge.textContent = 'طاولة ' + (t ? t.number : '');
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
  if(cancelBtn) cancelBtn.style.display = attached ? '' : 'none';
}

// Reachable straight from Home, not just the Tables screen's sheets — a
// cashier mid-order who decides to abandon a table shouldn't have to
// navigate away to do it. Mirrors the exact same two rules used everywhere
// else in this file: nothing registered yet = a plain local release, a
// real order already exists = manager-PIN-gated cancel_dine_in_order.
document.getElementById('opCancelTableBtn').addEventListener('click', async ()=>{
  const table = (TABLES_CACHE || []).find(x => x.id === state.selectedTableId);
  const tableLabel = table ? ('طاولة ' + table.number) : 'الطاولة';
  if(state.selectedOrderId){
    if(!window.confirm('تأكيد إلغاء طلب ' + tableLabel + '؟')) return;
    // Cancelling a just-registered order doesn't always mean the guests
    // left — often it just means "hold off a bit", and the table should
    // stay put waiting for a real order, not get marked for cleaning.
    const stillOccupied = window.confirm('هل الزبائن لسا قاعدين على ' + tableLabel + ' ويحتاجون وقت أطول؟\nموافق = نعم لسا قاعدين — إلغاء = لا، غادروا');
    const orderIdToCancel = state.selectedOrderId;
    openPinModal(async () => {
      const { error } = await window.supabaseClient.rpc('cancel_dine_in_order', { p_order_id: orderIdToCancel, p_still_occupied: stillOccupied });
      if(error){ showToast('تعذر الإلغاء'); return; }
      state.cart = []; state.selectedTableId = null; state.selectedOrderId = null;
      renderOrder();
      showToast(stillOccupied ? ('تراجعنا عن طلب ' + tableLabel + ' — بانتظار الطلب') : ('تم إلغاء طلب ' + tableLabel + ' — بحاجة تنظيف'));
    });
  } else {
    if(!window.confirm('تأكيد التراجع عن ' + tableLabel + '؟')) return;
    const stillOccupied = window.confirm('هل الزبائن لسا قاعدين على ' + tableLabel + '؟\nموافق = نعم لسا قاعدين — إلغاء = لا، غادروا');
    const tableIdToRelease = state.selectedTableId;
    if(tableIdToRelease && !stillOccupied){
      await window.supabaseClient.from('restaurant_tables').update({status:'cleaning'}).eq('id', tableIdToRelease).eq('status','awaiting_order');
    }
    state.cart = []; state.selectedTableId = null; state.selectedOrderId = null;
    renderOrder();
    showToast(stillOccupied ? ('تراجعنا — ' + tableLabel + ' بانتظار الطلب') : ('تم إفراغ ' + tableLabel));
  }
});
function renderOrder(){
  updateTableBadge();
  const itemsEl = document.getElementById('orderItems');
  const payBtn = document.getElementById('payBtn');

  if(state.cart.length === 0){
    const lastTxHtml = state.lastTransaction
      ? `<div class="last-tx-card">
          <div class="last-tx-info"><span>${t('آخر عملية')}</span><span>${rkMoney(state.lastTransaction.total)} — ${state.lastTransaction.time}</span></div>
          <button class="last-tx-reprint" id="lastTxReprint">${t('إعادة طباعة')}</button>
        </div>`
      : '';
    itemsEl.innerHTML = `<div class="order-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <p>${t('اضغط منتج عشان يضاف')}</p>${lastTxHtml}</div>`;
    const reprintBtn = document.getElementById('lastTxReprint');
    if(reprintBtn) reprintBtn.addEventListener('click', ()=> showToast('تمت إعادة الطباعة'));
  } else {
    itemsEl.innerHTML = state.cart.map(i=>{
      const p = PRODUCTS.find(x=>x.id===i.productId);
      const unitPrice = lineUnitPrice(i);
      const configLabels = formatConfigLabels(i.productId, i.config);
      const configHtml = configLabels.length
        ? `<div class="oi-config">${configLabels.map(l=>`<span class="oi-config-tag ${l.critical?'critical':''}">${l.text}</span>`).join('')}</div>`
        : '';
      return `<div class="order-item">
        <div class="oi-row">
          <div class="oi-qty">
            <button class="qty-btn" data-action="dec" data-line="${i.lineId}">−</button>
            <span class="qty-val">${i.qty}</span>
            <button class="qty-btn" data-action="inc" data-line="${i.lineId}">+</button>
          </div>
          <div class="oi-info">
            <div class="oi-name">${escapeHtml(LANG === 'en' ? (p.nameEn || p.name) : p.name)}${i.isPointsRedemption?' 🎁':''}</div>
            ${i.qty > 1 && !i.isPointsRedemption ? `<div class="oi-unit">${rkMoney(unitPrice)} / ${t('حبة')}</div>` : ''}
          </div>
          <div class="oi-total">${i.isPointsRedemption ? t('نقاط') : rkMoney(unitPrice*i.qty)}</div>
          <button class="oi-remove" data-action="remove" data-line="${i.lineId}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        ${configHtml}
        ${i.note
          ? `<div class="oi-note-text">📝 ${escapeHtml(i.note)}</div>`
          : `<button class="oi-note-link" data-action="note-open" data-line="${i.lineId}">${t('+ ملاحظة')}</button>`}
        <input type="text" class="oi-note-input" data-line="${i.lineId}" placeholder="بدون بصل، إضافي صوص..." value="${escapeHtml(i.note||'')}">
      </div>`;
    }).join('');

    itemsEl.querySelectorAll('[data-action]').forEach(btn=>{
      const lineId = parseInt(btn.dataset.line);
      const action = btn.dataset.action;
      btn.addEventListener('click', ()=>{
        if(action==='inc') changeQty(lineId, 1);
        if(action==='dec') changeQty(lineId, -1);
        if(action==='remove') removeFromCart(lineId);
        if(action==='note-open'){
          const input = itemsEl.querySelector(`.oi-note-input[data-line="${lineId}"]`);
          input.classList.add('open');
          input.focus();
        }
      });
    });
    itemsEl.querySelectorAll('.oi-note-input').forEach(input=>{
      input.addEventListener('blur', ()=>{
        const lineId = parseInt(input.dataset.line);
        const item = state.cart.find(i=>i.lineId===lineId);
        if(item){ item.note = input.value.trim(); renderOrder(); }
      });
    });
  }

  const {subtotal, discount, vat, total} = cartTotals();
  let summaryHtml = `<div class="sum-row"><span>${t('عدد الأصناف')}</span><span class="mono">${state.cart.reduce((s,i)=>s+i.qty,0)}</span></div>
    <div class="sum-row"><span>${t('المجموع الفرعي')}</span>${rkMoney(subtotal)}</div>`;
  if(discount > 0) summaryHtml += `<div class="sum-row discount"><span>${LANG==='en' ? `Discount (${state.discountPct}%)` : `خصم (${state.discountPct}٪)`}</span>${rkMoney(-discount)}</div>`;
  summaryHtml += `<div class="sum-row"><span>${t('ضريبة القيمة المضافة')}${PRICES_INCLUDE_VAT ? ' ' + t('(شاملة ضمن الإجمالي)') : ''}</span>${rkMoney(vat)}</div>
    <div class="sum-row total"><span>${t('الإجمالي')}</span>${rkMoney(total)}</div>`;
  document.getElementById('orderSummary').innerHTML = summaryHtml;
  document.getElementById('payBtnAmount').innerHTML = rkMoney(total);
  const registerMode = state.selectedTableId && state.orderChannel === 'dine_in' && DINE_IN_PAY_TIMING === 'after';
  document.getElementById('payBtnLabel').textContent = registerMode ? (state.selectedOrderId ? t('إضافة للطلب') : t('تسجيل الطلب')) : t('ادفع');
  payBtn.disabled = state.cart.length === 0;
}

/* ============ Discount panel ============ */
document.getElementById('discountToggle').addEventListener('click', ()=>{
  document.getElementById('discountPanel').classList.toggle('open');
});
document.getElementById('discountPanel').addEventListener('click', (e)=>{
  const btn = e.target.closest('.disc-btn');
  if(!btn) return;
  state.discountPct = parseInt(btn.dataset.pct);
  document.querySelectorAll('.disc-btn').forEach(b=>b.classList.remove('active'));
  if(state.discountPct > 0) btn.classList.add('active');
  renderOrder();
  document.getElementById('discountPanel').classList.remove('open');
  document.getElementById('discountToggle').textContent = state.discountPct > 0
    ? (LANG === 'en' ? `Discount ${state.discountPct}% active` : `خصم ${state.discountPct}٪ مفعّل`)
    : (LANG === 'en' ? '+ Discount' : '+ خصم');
});

/* ============ Customer — step 2 of the payment popup (between channel and
   payment method), not the order panel. Order panel stays pure "build the
   cart"; attaching a customer only ever exists to enable loyalty here, so
   it lives entirely inside the checkout flow now. Search/suggestion logic
   itself (debounced ilike on customers, rich avatar/points rows, "+ إضافة
   عميل جديد" fallback) is unchanged from the original order-panel version —
   just relocated and auto-advancing on selection. */
function setCustomer(customer){
  state.customer = customer;
  updatePointsRedeemStrip();
}

/* Registering a brand-new customer needs BOTH name and phone — complete_pos_order()
   only creates a real customers row when a phone is present (find-or-create by
   phone), and without one this "customer" would just be free text on the order,
   never actually become a loyalty member, and never be found again on a repeat
   visit. Whichever field the cashier already typed in the search box is
   pre-filled here; the other is required before continuing. */
function renderNewCustomerStep(prefill){
  document.getElementById('paymentModalTitle').textContent = 'عميل جديد';
  paymentModalBody.innerHTML = `
    <div class="pos-auth-field">
      <label>الاسم</label>
      <input type="text" id="newCustNameInput" placeholder="اسم العميل" value="${prefill.name || ''}">
    </div>
    <div class="pos-auth-field">
      <label>رقم الجوال</label>
      <input type="tel" id="newCustPhoneInput" placeholder="05xxxxxxxx" inputmode="tel" maxlength="10" value="${prefill.phone || ''}">
    </div>
    <button class="confirm-pay-btn" id="newCustSaveBtn" disabled>متابعة</button>
  `;
  const nameInput = document.getElementById('newCustNameInput');
  const phoneInput = document.getElementById('newCustPhoneInput');
  const saveBtn = document.getElementById('newCustSaveBtn');
  // Real reported bug: this field had no length cap or format check at all
  // (only "non-empty") — a customer got saved with an 11-digit number.
  // Same maxlength+strip+regex pattern already used by the online-order
  // checkout's #omPhone field, applied here too.
  const validate = ()=>{ saveBtn.disabled = !(nameInput.value.trim() && /^05\d{8}$/.test(phoneInput.value.trim())); };
  nameInput.addEventListener('input', validate);
  phoneInput.addEventListener('input', ()=>{
    phoneInput.value = toWesternDigits(phoneInput.value).replace(/\D/g, '').slice(0, 10);
    validate();
  });
  validate();
  (prefill.phone ? nameInput : phoneInput).focus();
  saveBtn.addEventListener('click', ()=>{
    setCustomer({name: nameInput.value.trim(), phone: phoneInput.value.trim()});
    proceedFromCustomerStep();
  });
}

function renderCustomerStep(){
  if(!LOYALTY_ENABLED){ proceedFromCustomerStep(); return; }
  document.getElementById('paymentModalTitle').textContent = 'العميل';
  const c = state.customer;
  paymentModalBody.innerHTML = c ? `
    <div class="customer-suggest" style="pointer-events:none;">
      <span class="customer-suggest-avatar">${(c.name||c.phone||'؟').charAt(0)}</span>
      <span class="customer-suggest-info"><span class="customer-suggest-name">${c.name||c.phone}</span>${c.phone && c.name ? `<span class="customer-suggest-phone mono">${c.phone}</span>` : ''}</span>
    </div>
    <button type="button" class="loyalty-otp-back" id="pmCustomerClearBtn" style="margin-top:8px;">تغيير</button>
    <button class="confirm-pay-btn" id="pmCustomerNextBtn" style="margin-top:16px;">متابعة</button>
  ` : `
    <div style="display:flex; gap:8px;">
      <input type="text" id="pmCustomerInput" placeholder="اكتب اسم أو جوال..." style="flex:1;">
      <button class="customer-suggest" id="pmScanCustomerCardBtn" title="مسح بطاقة العميل" type="button" style="flex:0 0 auto; width:44px; justify-content:center;">📷</button>
    </div>
    <div class="customer-panel-row" id="pmCustomerSuggestions"></div>
    <button class="confirm-pay-btn" id="pmCustomerNextBtn" style="margin-top:16px;">تخطي</button>
  `;

  const clearBtn = document.getElementById('pmCustomerClearBtn');
  if(clearBtn) clearBtn.addEventListener('click', ()=>{ setCustomer(null); renderCustomerStep(); });

  const input = document.getElementById('pmCustomerInput');
  if(input){
    input.focus();
    let pmCustomerSearchTimer;
    const suggestEl = document.getElementById('pmCustomerSuggestions');
    input.addEventListener('input', (e)=>{
      clearTimeout(pmCustomerSearchTimer);
      const q = e.target.value.trim();
      if(q.length < 2){ suggestEl.innerHTML = ''; return; }
      suggestEl.innerHTML = `<div class="customer-suggest-loading">جارٍ البحث...</div>`;
      pmCustomerSearchTimer = setTimeout(async ()=>{
        const { data } = await window.supabaseClient.from('customers')
          .select('id, name, phone, loyalty_points').eq('business_id', DEVICE.businessId)
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(6);
        const rows = (data||[]).map(cust=>{
          const initial = (cust.name || cust.phone || '؟').charAt(0);
          const pointsBadge = cust.loyalty_points > 0 ? `<span class="customer-suggest-points">${cust.loyalty_points} نقطة</span>` : '';
          return `<button class="customer-suggest" data-id="${cust.id}" data-name="${escapeHtml(cust.name)}" data-phone="${escapeHtml(cust.phone||'')}" data-points="${cust.loyalty_points}">
            <span class="customer-suggest-avatar">${escapeHtml(initial)}</span>
            <span class="customer-suggest-info"><span class="customer-suggest-name">${escapeHtml(cust.name)}</span>${cust.phone ? `<span class="customer-suggest-phone mono">${escapeHtml(cust.phone)}</span>` : ''}</span>
            ${pointsBadge}
          </button>`;
        }).join('');
        // no exact match found — surface adding this typed text as a new
        // customer as a real, visible row instead of a hidden Enter-key shortcut
        const isPhone = /^[0-9+\s-]{6,}$/.test(q);
        const newRow = `<button class="customer-suggest customer-suggest-new" id="pmAddNewCustomerRow">
          <span class="customer-suggest-avatar customer-suggest-avatar-new">+</span>
          <span class="customer-suggest-info"><span class="customer-suggest-name">إضافة عميل جديد</span><span class="customer-suggest-phone">${isPhone ? q : 'باسم "' + q + '"'}</span></span>
        </button>`;
        suggestEl.innerHTML = rows + newRow;
        const addBtn = document.getElementById('pmAddNewCustomerRow');
        if(addBtn) addBtn.addEventListener('click', ()=>{
          openModalStep(()=> renderNewCustomerStep(isPhone ? {name: null, phone: q} : {name: q, phone: null}));
        });
      }, 250);
    });
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && e.target.value.trim()){
        const val = e.target.value.trim();
        const isPhone = /^[0-9+\s-]{6,}$/.test(val);
        openModalStep(()=> renderNewCustomerStep(isPhone ? {name: null, phone: val} : {name: val, phone: null}));
      }
    });
    suggestEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('.customer-suggest:not(.customer-suggest-new)');
      if(!btn) return;
      setCustomer({id: parseInt(btn.dataset.id,10), name: btn.dataset.name, phone: btn.dataset.phone || null, points: Number(btn.dataset.points)});
      proceedFromCustomerStep();
    });
    document.getElementById('pmScanCustomerCardBtn').addEventListener('click', async ()=>{
      const decoded = await scanCustomerCard();
      // false means the cashier cancelled (× / back) — the modal is already
      // closed in that case, so re-showing it here would undo their tap.
      if(decoded){
        paymentModal.classList.add('show');
        renderCustomerStep();
      }
    });
  }

  document.getElementById('pmCustomerNextBtn').addEventListener('click', proceedFromCustomerStep);
}

function proceedFromCustomerStep(){
  const {total} = cartTotals();
  document.getElementById('paymentModalTitle').textContent = 'الدفع';
  state.friendsSplitOpen = false; state.friendsSplitCount = null;
  if(state.orderChannel === 'delivery'){
    state.activePaymentMethod = 'delivery_platform';
  } else {
    state.activePaymentMethod = 'cash'; state.cashAmount = total;
  }
  openModalStep(renderPaymentStep);
}

/* ============ Loyalty points redemption — only possible for an existing
   customer selected from real suggestions (state.customer.id is set), since
   a brand-new customer typed at checkout has no real balance to redeem yet. ============ */
// Redemption now only starts from the OTP-gated "🎁 الولاء" payment pill
// inside the payment modal (renderLoyaltyRedeemStep) — this strip used to
// let a cashier open the redeem picker with one tap and no real cardholder
// consent. Kept as a no-op (not deleted) since setCustomer() still calls it.
function updatePointsRedeemStrip(){
  document.getElementById('pointsRedeemStrip').style.display = 'none';
}
function openPointsRedeemModal(){
  const redeemable = Object.entries(MENU_ITEM_META).filter(([,meta])=> meta.pointsRedeemPrice != null);
  document.getElementById('paymentModalTitle').textContent = 'استبدال منتج بالنقاط';
  paymentModalBody.innerHTML = redeemable.length === 0
    ? '<p class="pos-auth-sub">ما فيه منتجات قابلة للاستبدال بالنقاط حاليًا.</p>'
    : `<div class="pos-staff-list">` + redeemable.map(([id, meta])=>{
        const product = PRODUCTS.find(p=>p.id===Number(id));
        if(!product) return '';
        const affordable = state.customer.points >= meta.pointsRedeemPrice;
        return `<button class="pos-staff-btn" data-id="${id}" ${affordable?'':'disabled'} style="${affordable?'':'opacity:.4;'}">${product.name} — ${meta.pointsRedeemPrice} نقطة</button>`;
      }).join('') + `</div>`;
  document.getElementById('paymentModal').classList.add('show');
  paymentModalBody.querySelectorAll('.pos-staff-btn[data-id]:not([disabled])').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      addPointsRedemptionToCart(Number(btn.dataset.id));
      closePaymentModalNow();
    });
  });
}
function addPointsRedemptionToCart(productId){
  state.cart.push({lineId: lineIdCounter++, productId, qty:1, note:'', config:null, isPointsRedemption:true});
  renderOrder();
  showToast('تمت إضافة المنتج مقابل نقاط الولاء');
}

/* ============ Loyalty card barcode scan — reads the real QR code already
   printed on the digital loyalty card (see /loyalty-card/[token]) via the
   browser's native BarcodeDetector (Chrome/Edge/Android — no external
   scanning library). Decoded value is the card's full URL; the customer's
   public_token is the last path segment, looked up directly against the
   real customers table.

   Returns a real Promise that resolves only once scanning actually
   concludes — true if a code was decoded and processed, false if the
   cashier cancelled (× / back). This used to resolve as soon as the camera
   started (the async function body just kicked off a fire-and-forget
   requestAnimationFrame loop and returned), so callers' `await` woke up
   instantly instead of waiting for a real result — the scanner UI would
   render for a single frame and then immediately get overwritten by
   whatever the caller did next, making the camera view functionally
   unusable even though detection kept running invisibly underneath. */
async function openBarcodeScanner(onDecode){
  if(!('BarcodeDetector' in window)){
    showToast('جهازك ما يدعم قراءة الباركود من الكاميرا (متاحة على Chrome/Edge بأجهزة أندرويد بس حاليًا) — استخدم البحث بالاسم أو الجوال بدالها.');
    return false;
  }
  document.getElementById('paymentModalTitle').textContent = 'مسح بطاقة العميل';
  paymentModalBody.innerHTML = `
    <video id="scannerVideo" autoplay playsinline muted style="width:100%; border-radius:12px; background:#000;"></video>
    <p class="pos-auth-sub" style="text-align:center; margin-top:10px;">قرّب باركود البطاقة من الكاميرا</p>
  `;
  document.getElementById('paymentModal').classList.add('show');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    showToast('تعذر الوصول للكاميرا.');
    document.getElementById('paymentModal').classList.remove('show');
    return false;
  }
  const video = document.getElementById('scannerVideo');
  video.srcObject = stream;

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  let stopped = false;
  const stopScanning = ()=>{
    if(stopped) return;
    stopped = true;
    stream.getTracks().forEach(t=>t.stop());
  };

  return new Promise((resolve)=>{
    const cancel = ()=>{ stopScanning(); resolve(false); };
    document.getElementById('closePaymentModal').addEventListener('click', cancel, { once:true });
    document.getElementById('paymentModalBackBtn').addEventListener('click', cancel, { once:true });

    const tick = async ()=>{
      if(stopped) return;
      try {
        const codes = await detector.detect(video);
        if(codes.length > 0){
          stopScanning();
          await onDecode(codes[0].rawValue);
          resolve(true);
          return;
        }
      } catch (e) { /* a failed detection on a single frame is normal — keep scanning */ }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function scanCustomerCard(){
  return await openBarcodeScanner(async (decoded)=>{
    // the QR encodes the full card URL (…/loyalty-card/<token>), not the bare token
    const token = decoded.split('/').filter(Boolean).pop();
    const { data } = await window.supabaseClient.from('customers')
      .select('id, name, phone, loyalty_points').eq('business_id', DEVICE.businessId).eq('public_token', token).maybeSingle();
    if(!data){ showToast('ما فيه عميل مربوط بهذا الباركود.'); return; }
    setCustomer({id:data.id, name:data.name, phone:data.phone, points:Number(data.loyalty_points)});
    showToast('تم التعرف على ' + data.name);
  });
}

/* ============ Clear order — two-tap arm/confirm, no blocking dialog ============ */
let clearArmed = false, clearArmTimer;
document.getElementById('clearOrderBtn').addEventListener('click', function(){
  if(state.cart.length === 0) return;
  if(!clearArmed){
    clearArmed = true;
    this.classList.add('armed');
    this.textContent = t('اضغط مرة ثانية للتأكيد');
    clearArmTimer = setTimeout(()=>{ clearArmed=false; this.classList.remove('armed'); this.textContent=t('إفراغ الطلب'); }, 3000);
  } else {
    clearTimeout(clearArmTimer);
    clearArmed = false;
    this.classList.remove('armed');
    this.textContent = t('إفراغ الطلب');
    state.cart = []; state.discountPct = 0;
    renderOrder();
    showToast('تم إفراغ الطلب');
  }
});

/* ============ Hold order ============ */

/* ============ Payment modal ============ */
const paymentModal = document.getElementById('paymentModal');
const paymentModalBody = document.getElementById('paymentModalBody');

/* ============ Modal step stack — powers the back button ============
   paymentModal is one generic shell reused for many different flows
   (channel -> customer -> payment during checkout, barcode scanner, points
   redeem, order detail, settings, shift summary/closing...). Genuine
   forward-navigation calls go through openModalStep()/resetModalStack() so
   the back button can pop to whatever rendered before; in-place refreshes
   within a single step (tab switches, input changes) keep calling their
   render function directly and never touch this stack. For a single-view
   modal (nothing pushed before it) the back button just closes, same as ×. */
let modalStepStack = [];
function resetModalStack(fn){ modalStepStack = [fn]; fn(); }
function openModalStep(fn){ modalStepStack.push(fn); fn(); }
function closePaymentModalNow(){
  paymentModal.classList.remove('show');
  modalStepStack = [];
  diagnosticsModalOpen = false;
  if(activeAutoResetTimer) clearInterval(activeAutoResetTimer);
  if(loyaltyPollTimer) clearInterval(loyaltyPollTimer);
  // Re-drive any incoming online order(s) that arrived while this modal had
  // the screen — see the guard in showNextIncomingOrder for why it backed off.
  if(incomingOrderQueue.length && !incomingOrderModalBusy) showNextIncomingOrder();
}
function modalGoBack(){
  if(modalStepStack.length > 1){
    modalStepStack.pop();
    modalStepStack[modalStepStack.length - 1]();
  } else {
    closePaymentModalNow();
  }
}
document.getElementById('paymentModalBackBtn').addEventListener('click', modalGoBack);

document.getElementById('payBtn').addEventListener('click', ()=>{
  if(state.cart.length === 0) return;
  // Pay-after-eating dine-in: this cart is a real kitchen order the moment
  // it's confirmed, but the bill isn't being closed out right now — register
  // it and stay on Home, don't open the payment popup at all.
  if(state.selectedTableId && state.orderChannel === 'dine_in' && DINE_IN_PAY_TIMING === 'after'){
    submitTableOrderRegistration();
    return;
  }
  // A buzzer belongs to one sale. Cleared as the flow opens so the next
  // customer cannot inherit the previous one is number.
  state.pagerNumber = '';
  resetModalStack(renderChannelStep);
  paymentModal.classList.add('show');
});

async function submitTableOrderRegistration(){
  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;
  const table = TABLES_CACHE.find(t => t.id === state.selectedTableId);
  const isAppend = !!state.selectedOrderId;
  // registerTableOrder() always queues first and never throws — a null
  // orderId here means it's safely in IndexedDB and will sync on its own
  // (see syncQueue), not that anything failed. Proceed the same way the
  // cashier already expects from a normal sale offline: the round is saved,
  // don't block them waiting on network. The table's status flip to
  // "serving" happens server-side inside the RPC, so it'll lag until sync
  // completes for a queued round — the cart/UI reset below doesn't wait on it.
  const orderId = await registerTableOrder();
  if(DEVICE.printKitchenTicket === true){
    enqueuePrintJob('kitchen', buildKitchenReceiptData({channel:'dine_in', orderId, tableNumber: table ? table.number : null}));
  }
  const savedLabel = isAppend ? 'تمت إضافة الأصناف للطلب' : 'تم تسجيل الطلب';
  showToast(savedLabel + (table ? ' — طاولة ' + table.number : '') + (orderId ? '' : ' (بدون اتصال — راح تتزامن تلقائيًا)'));
  state.cart = []; state.customer = null; state.discountPct = 0;
  document.getElementById('discountToggle').textContent = '+ خصم';
  state.selectedTableId = null;
  state.selectedOrderId = null;
  updatePointsRedeemStrip();
  renderOrder();
  document.querySelector('.nav-tab[data-screen="tables"]').click();
}
document.getElementById('closePaymentModal').addEventListener('click', closePaymentModalNow);
paymentModal.addEventListener('click', (e)=>{ if(e.target===paymentModal) closePaymentModalNow(); });

/* ============ Step 1: order type — moved out of the order panel entirely,
   now the first thing the cashier sees after tapping "دفع" rather than a
   toggle sitting quietly at the top of the cart the whole time it's built.
   Channel/platform selection logic itself (state.orderChannel/deliveryPlatformId,
   live price recompute via renderProductGrid/renderOrder) is unchanged —
   only when and where the choice is made moved. ============ */
function renderChannelStep(){
  document.getElementById('paymentModalTitle').textContent = 'نوع الطلب';
  const channels = [
    {id:'dine_in', label:'🍽️ محلي'},
    {id:'pickup', label:'📦 سفري'},
    {id:'delivery', label:'🛵 تطبيقات التوصيل'}
  ].filter(c => {
    if(c.id === 'dine_in') return DINE_IN_ENABLED;
    // "توصيل" here means a delivery-APP order (Jahez, HungerStation...),
    // which is why it records a platform and an app invoice number. With
    // no platform registered there is nothing for it to record against,
    // and picking it forced payment_method='delivery_platform' — booking
    // the sale to a platform that does not exist and keeping the cash out
    // of the drawer total. A restaurant delivering with its own driver
    // takes that order through the online store, not this button.
    // Still shown for an order already saved as delivery, so reopening
    // one cannot strand it on a channel it can no longer display.
    if(c.id === 'delivery') return DELIVERY_PLATFORMS_LIST.length > 0 || state.orderChannel === 'delivery';
    return true;
  });
  let html = `<div class="channel-row" id="pmChannelRow">` + channels.map(c=>
    `<button class="channel-btn ${state.orderChannel===c.id?'active':''}" data-channel="${c.id}">${c.label}</button>`
  ).join('') + `</div>`;
  html += `<div class="platform-btn-row ${state.orderChannel==='delivery' && DELIVERY_PLATFORMS_LIST.length ? '' : 'hidden'}" id="channelPlatformRow"></div>`;
  paymentModalBody.innerHTML = html;
  renderPlatformButtons();

  document.getElementById('pmChannelRow').addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#pmChannelRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.orderChannel = btn.dataset.channel;
    const platformRow = document.getElementById('channelPlatformRow');
    if(state.orderChannel === 'delivery'){
      if(DELIVERY_PLATFORMS_LIST.length){
        platformRow.classList.remove('hidden');
        if(!state.deliveryPlatformId) state.deliveryPlatformId = DELIVERY_PLATFORMS_LIST[0].id;
        renderPlatformButtons();
      }
    } else {
      platformRow.classList.add('hidden');
      state.platformInvoiceLast4 = '';
    }
    renderProductGrid();
    renderOrder();
    // The tap IS the choice — there is no "التالي" any more. A single row
    // of options does not need a confirm step, and having one meant the
    // step could be completed without choosing: state.orderChannel carries
    // a default, so Next with nothing selected filed the order as dine-in
    // and jumped to a table picker nobody asked for.
    //
    // Delivery is the exception: it asks a SECOND question on this same
    // step — which app the order came from — and that platform is what the
    // sale gets booked against. Advancing on the channel tap would answer
    // it silently with whichever platform sorts first, so delivery waits
    // and the platform tap is what moves on.
    if(state.orderChannel !== 'delivery') advanceFromChannelStep();
  });
}

function advanceFromChannelStep(){
  // Most dine-in orders already carry a table by this point (started by
  // tapping a table on the Tables screen). This asks only for the
  // remaining case: the cart was built from Home and "محلي" was picked
  // here for the first time — and only under full table service, since
  // simple dine-in has no table to pick at all.
  const needsTable = state.orderChannel === 'dine_in'
    && DINE_IN_MODE === 'tables'
    && !state.selectedTableId;
  if(needsTable) openModalStep(renderTablePickerStep);
  else openModalStep(renderCustomerStep);
}

function renderTablePickerStep(){
  document.getElementById('paymentModalTitle').textContent = 'اختر الطاولة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('restaurant_tables').select('*')
    .eq('branch_id', DEVICE.branchId).eq('status', 'available').order('number')
    .then(({data}) => {
      const tables = data || [];
      TABLES_CACHE = tables.length ? tables : TABLES_CACHE;
      if(!tables.length){
        paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه طاولات متاحة الحين.</p>
          <button class="confirm-pay-btn" id="tablePickerSkipBtn">متابعة بدون طاولة</button>`;
        document.getElementById('tablePickerSkipBtn').addEventListener('click', ()=> openModalStep(renderCustomerStep));
        return;
      }
      const groups = groupTablesForDisplay(tables);
      let html = `<div class="table-picker-grid" id="tablePickerGrid">`;
      groups.forEach(g => {
        if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}</span></div>`;
        html += g.tables.map(t => `<button type="button" class="table-picker-btn" data-id="${t.id}" data-number="${t.number}">${t.number}</button>`).join('');
      });
      html += `</div><button class="loyalty-otp-back" id="tablePickerSkipBtn">متابعة بدون طاولة</button>`;
      paymentModalBody.innerHTML = html;
      document.getElementById('tablePickerSkipBtn').addEventListener('click', ()=> openModalStep(renderCustomerStep));
      document.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async ()=>{
          const tableId = Number(btn.dataset.id);
          const { data: claimed, error } = await window.supabaseClient.from('restaurant_tables')
            .update({status: 'awaiting_order'}).eq('id', tableId).eq('status', 'available').select('id');
          if(error || !claimed || !claimed.length){ showToast('طاولة ' + btn.dataset.number + ' انشغلت للتو'); renderTablePickerStep(); return; }
          state.selectedTableId = tableId;
          updateTableBadge();
          openModalStep(renderCustomerStep);
        });
      });
    });
}

function renderPaymentStep(){
  const {total} = cartTotals();

  // delivery orders are already paid by the customer inside the platform's
  // own app — no cash/card tabs, just a confirmation before we log the order
  if(state.orderChannel === 'delivery'){
    const last4Valid = /^\d{4}$/.test(state.platformInvoiceLast4);
    let html = `<div class="due-display"><div class="due-label">إجمالي الطلب — مدفوع مسبقًا عبر التطبيق</div><div class="due-amount">${rkMoney(total)}</div></div>`;
    html += `<div class="pos-auth-field" style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">آخر ٤ أرقام من فاتورة تطبيق التوصيل</label>
      <input type="text" id="deliveryInvoiceLast4Input" maxlength="4" inputmode="numeric" placeholder="٠٠٠٠" value="${state.platformInvoiceLast4}" style="width:100%; text-align:center; font-family:'IBM Plex Mono',monospace; font-weight:800; font-size:16px;">
    </div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn" ${last4Valid?'':'disabled'}>تأكيد الطلب</button>`;
    paymentModalBody.innerHTML = html;
    document.getElementById('confirmPayBtn').addEventListener('click', completePayment);
    document.getElementById('deliveryInvoiceLast4Input').addEventListener('input', (e)=>{
      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = digits;
      state.platformInvoiceLast4 = digits;
      document.getElementById('confirmPayBtn').disabled = !/^\d{4}$/.test(digits);
    });
    return;
  }

  const methods = [
    {id:'cash', label:'كاش', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>'},
    {id:'card', label:'بطاقة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'},
    {id:'split', label:'تقسيم', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'}
  ];
  // only surfaced once a real, existing customer with a redeemable balance is
  // attached — same gate updatePointsRedeemStrip() used to check
  if(state.customer && state.customer.id && state.customer.points > 0){
    methods.push({id:'loyalty', label:'الولاء', icon:'🎁'});
  }
  let html = `<div class="pm-tabs">` + methods.map(m=>`<button class="pm-tab ${state.activePaymentMethod===m.id?'active':''}" data-method="${m.id}">${m.icon}<span>${m.label}</span></button>`).join('') + `</div>`;
  html += `<div class="due-display"><div class="due-label">المبلغ المطلوب</div><div class="due-amount">${rkMoney(total)}</div></div>`;
  // Purely informational per-person calculator — doesn't touch payment_method
  // or any order data, just tells the cashier how much to collect from each
  // friend. Collapsed by default so it never gets in the way of a normal
  // single-payer checkout; only shows once tapped.
  if(state.activePaymentMethod !== 'loyalty'){
    html += `<div class="friends-split">
      <button type="button" class="friends-split-toggle" id="friendsSplitToggle">÷ قسّم بين الأصحاب</button>
      ${state.friendsSplitOpen ? `<div class="friends-split-body">
        <div class="friends-split-counts">
          ${[2,3,4,5,6].map(n=>`<button type="button" class="fsc-btn ${state.friendsSplitCount===n?'active':''}" data-n="${n}">${n}</button>`).join('')}
        </div>
        ${state.friendsSplitCount ? `<div class="friends-split-result"><span>كل واحد يدفع</span>${rkMoney(total/state.friendsSplitCount)}</div>` : ''}
      </div>` : ''}
    </div>`;
  }

  // The buzzer, asked for only where the customer walks away and comes
  // back: takeaway, and simple dine-in. A table-service order already has
  // a table number doing this job, and a delivery order has nobody
  // standing here to hand one to.
  const wantsPager = POS_PAGER_ENABLED
    && (state.orderChannel === 'pickup'
        || (state.orderChannel === 'dine_in' && DINE_IN_MODE === 'simple'));
  if(wantsPager){
    html += `<div class="pager-field">
      <label>رقم جهاز النداء</label>
      <input type="number" id="pagerInput" inputmode="numeric" maxlength="3" placeholder="مثال: 20" value="${state.pagerNumber || ''}">
      <p class="stock-qty-helper">اتركه فاضي لو ما أعطيته جهاز.</p>
      <p class="pos-auth-error" id="pagerError" style="display:none;"></p>
    </div>`;
  }

  if(state.activePaymentMethod === 'cash'){
    const opts = [...new Set([total, Math.ceil(total/10)*10, Math.ceil(total/50)*50, Math.ceil(total/100)*100].map(n=>n.toFixed(2)))].slice(0,4);
    html += `<div class="quick-amounts">` + opts.map(v=>`<button class="qa-btn" data-amount="${v}">${v}</button>`).join('') + `</div>`;
    html += `<div class="cash-input-row"><input type="number" id="cashInput" placeholder="0.00" value="${state.cashAmount||''}"></div>`;
    const change = Math.max(0, (state.cashAmount||0)-total);
    html += `<div class="change-row"><span>الباقي</span><span id="cashChangeAmount">${rkMoney(change)}</span></div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn" ${(state.cashAmount||0)>=total?'':'disabled'}>تأكيد الدفع</button>`;
  } else if(state.activePaymentMethod === 'split'){
    // Two linked inputs, either direction — the cashier types whichever
    // amount they were actually handed first (cash or network), and the
    // other side auto-fills the remainder. state.splitCardAmount stays the
    // single source of truth; the cash field is always just total-card.
    const cardAmt = Math.min(total, state.splitCardAmount || 0);
    const cashAmt = Math.max(0, Number((total - cardAmt).toFixed(2)));
    const validSplit = cardAmt > 0 && cashAmt > 0;
    html += `<div class="split-inputs">
      <label>المبلغ كاش</label>
      <input type="number" id="splitCashInput" placeholder="0.00" value="${cashAmt||''}">
      <label>المبلغ عبر الشبكة (بطاقة)</label>
      <input type="number" id="splitCardInput" placeholder="0.00" value="${cardAmt||''}">
    </div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn" ${validSplit?'':'disabled'}>تأكيد الدفع المقسّم</button>`;
  } else if(state.activePaymentMethod === 'loyalty'){
    renderLoyaltyWaitStep();
    return;
  } else {
    html += `<div class="card-tap-state">
      <div class="card-tap-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>
      <p>مرّر أو قرّب البطاقة على الجهاز</p>
    </div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn">تأكيد الدفع</button>`;
  }
  paymentModalBody.innerHTML = html;
  paymentModalBody.querySelectorAll('.pm-tab').forEach(tab=>tab.addEventListener('click', ()=>{
    state.activePaymentMethod = tab.dataset.method; state.cashAmount=0; state.splitCardAmount=0; renderPaymentStep();
  }));
  paymentModalBody.querySelectorAll('.qa-btn[data-amount]').forEach(btn=>btn.addEventListener('click', ()=>{ state.cashAmount = parseFloat(btn.dataset.amount); renderPaymentStep(); }));
  // Cash/split inputs update state + the small bits of surrounding UI (change
  // amount, sibling input, confirm-button enabled state) DIRECTLY rather than
  // re-rendering the whole step on every keystroke — a full innerHTML rebuild
  // mid-edit destroys and recreates the input, which made it effectively
  // impossible to backspace a typed value down to empty (focus/cursor state
  // is lost every keystroke).
  const cashInput = document.getElementById('cashInput');
  if(cashInput) cashInput.addEventListener('input', (e)=>{
    state.cashAmount = parseFloat(e.target.value)||0;
    const changeEl = document.getElementById('cashChangeAmount');
    if(changeEl) changeEl.innerHTML = rkMoney(Math.max(0, state.cashAmount - total));
    const btn = document.getElementById('confirmPayBtn');
    if(btn) btn.disabled = !(state.cashAmount >= total);
  });
  const splitCardInput = document.getElementById('splitCardInput');
  const splitCashInput = document.getElementById('splitCashInput');
  function syncSplitConfirmBtn(cardAmt, cashAmt){
    const btn = document.getElementById('confirmPayBtn');
    if(btn) btn.disabled = !(cardAmt > 0 && cashAmt > 0);
  }
  if(splitCardInput) splitCardInput.addEventListener('input', (e)=>{
    const v = Math.max(0, Math.min(total, parseFloat(e.target.value)||0));
    state.splitCardAmount = v;
    const cashAmt = Math.max(0, Number((total - v).toFixed(2)));
    if(splitCashInput) splitCashInput.value = cashAmt || '';
    syncSplitConfirmBtn(v, cashAmt);
  });
  if(splitCashInput) splitCashInput.addEventListener('input', (e)=>{
    const v = Math.max(0, Math.min(total, parseFloat(e.target.value)||0));
    const cardAmt = Math.max(0, Number((total - v).toFixed(2)));
    state.splitCardAmount = cardAmt;
    if(splitCardInput) splitCardInput.value = cardAmt || '';
    syncSplitConfirmBtn(cardAmt, v);
  });
  const confirmBtn = document.getElementById('confirmPayBtn');
  if(confirmBtn) confirmBtn.addEventListener('click', completePayment);
  const pagerInputEl = document.getElementById('pagerInput');
  if(pagerInputEl) pagerInputEl.addEventListener('input', ()=>{
    state.pagerNumber = pagerInputEl.value.replace(/[^0-9]/g, '').slice(0, 3);
    const err = document.getElementById('pagerError');
    if(err) err.style.display = 'none';
  });
  const friendsSplitToggle = document.getElementById('friendsSplitToggle');
  if(friendsSplitToggle) friendsSplitToggle.addEventListener('click', ()=>{
    state.friendsSplitOpen = !state.friendsSplitOpen;
    renderPaymentStep();
  });
  paymentModalBody.querySelectorAll('.fsc-btn[data-n]').forEach(btn=>btn.addEventListener('click', ()=>{
    const n = parseInt(btn.dataset.n, 10);
    state.friendsSplitCount = state.friendsSplitCount === n ? null : n;
    renderPaymentStep();
  }));
}

/* ============ Loyalty redemption gate — tapping "🎁 الولاء" creates a pending
   request the customer confirms THEMSELVES on their own loyalty-card page
   (real-time poll there — app/loyalty-card/[token]/CardActions.tsx). No code
   to read aloud, no push dependency (push is just a best-effort nudge sent
   server-side). The security boundary is device possession: only whoever has
   that card page open can act on the request at all. */
function resetToCashFallback(){
  state.activePaymentMethod = 'cash';
  state.cashAmount = cartTotals().total;
  renderPaymentStep();
}
async function renderLoyaltyWaitStep(){
  document.getElementById('paymentModalTitle').textContent = 'الدفع بنقاط الولاء';
  paymentModalBody.innerHTML = `
    <div class="loyalty-wait-step">
      <div class="loyalty-wait-spinner"></div>
      <div class="loyalty-wait-text">بانتظار تأكيد ${state.customer.name || 'العميل'}...</div>
      <div class="loyalty-wait-sub">اطلب منه يفتح بطاقة الولاء ويضغط تأكيد</div>
      <div class="loyalty-wait-timer" id="loyaltyWaitTimer"></div>
      <button type="button" class="loyalty-otp-back" id="loyaltyCancelBtn">إلغاء</button>
    </div>`;
  document.getElementById('loyaltyCancelBtn').addEventListener('click', ()=>{
    if(loyaltyPollTimer) clearInterval(loyaltyPollTimer);
    resetToCashFallback();
  });

  let requestId;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const resp = await fetch('/api/pos/request-loyalty-redemption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ customerId: state.customer.id })
    });
    const data = await resp.json();
    if(!resp.ok){
      showToast(data.error || 'تعذر بدء عملية الاستبدال');
      resetToCashFallback();
      return;
    }
    requestId = data.requestId;
  } catch (e) {
    showToast('تعذر الاتصال بالخادم');
    resetToCashFallback();
    return;
  }

  const expiresAt = Date.now() + 2 * 60 * 1000;
  const updateTimer = ()=>{
    const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const el = document.getElementById('loyaltyWaitTimer');
    if(el) el.textContent = left + ' ثانية متبقية';
    return left;
  };
  updateTimer();
  const displayTimer = setInterval(()=>{ if(updateTimer() <= 0) clearInterval(displayTimer); }, 1000);

  if(loyaltyPollTimer) clearInterval(loyaltyPollTimer);
  loyaltyPollTimer = setInterval(async ()=>{
    if(Date.now() > expiresAt){
      clearInterval(loyaltyPollTimer); clearInterval(displayTimer);
      showToast('انتهت مهلة التأكيد — حاول مرة ثانية');
      resetToCashFallback();
      return;
    }
    const { data } = await window.supabaseClient
      .from('loyalty_redemption_requests').select('status').eq('id', requestId).single();
    if(!data || data.status === 'pending') return;
    clearInterval(loyaltyPollTimer); clearInterval(displayTimer);
    if(data.status === 'confirmed'){
      openModalStep(openPointsRedeemModal);
    } else {
      showToast('العميل رفض عملية الاستبدال');
      resetToCashFallback();
    }
  }, 2000);
}

/* ============ IndexedDB offline order queue ============
   completePayment() always writes here first, then tries an immediate
   server call if online. client_order_uuid is the idempotency key: replaying
   an order that already made it to the server (e.g. the sync response was
   lost but the insert succeeded) is a safe no-op — complete_pos_order()
   just returns the existing order id instead of inserting a duplicate. */
// KV_STORE backs the offline-boot snapshot layer (cashier profile, last
// known open shift, and loadPosData's full menu/settings payload — see
// their respective cache*/restore* functions below): a cold boot with no
// network can't run a single Supabase query, not even to check who's
// logged in or whether a shift is open, so each of those steps needs its
// own "last known good" fallback instead of just the product catalog.
const POS_DB_NAME = 'rakeen_pos', POS_DB_VERSION = 3, POS_STORE = 'pending_orders', KV_STORE = 'kv_cache';
function openPosDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(POS_DB_NAME, POS_DB_VERSION);
    req.onupgradeneeded = ()=>{
      if(!req.result.objectStoreNames.contains(POS_STORE)) req.result.createObjectStore(POS_STORE, {keyPath:'client_order_uuid'});
      if(!req.result.objectStoreNames.contains(KV_STORE)) req.result.createObjectStore(KV_STORE, {keyPath:'key'});
      if(!req.result.objectStoreNames.contains('print_jobs')) req.result.createObjectStore('print_jobs', {keyPath:'id'});
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function setCacheValue(key, value){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put({ key, value, cached_at: Date.now() });
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}
// Returns {value, cached_at} or null — callers that show the cashier how
// stale a fallback is (see the offline-boot banner) need cached_at, not
// just the bare value.
async function getCacheValue(key){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(KV_STORE, 'readonly');
    const req = tx.objectStore(KV_STORE).get(key);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error);
  });
}
async function queueOrder(payload){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(POS_STORE, 'readwrite');
    tx.objectStore(POS_STORE).put(payload);
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}
async function removeQueuedOrder(uuid){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(POS_STORE, 'readwrite');
    tx.objectStore(POS_STORE).delete(uuid);
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}
async function getQueuedOrders(){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(POS_STORE, 'readonly');
    const req = tx.objectStore(POS_STORE).getAll();
    req.onsuccess = ()=> resolve(req.result||[]);
    req.onerror = ()=> reject(req.error);
  });
}
async function sendOrderToServer(payload){
  const { data, error } = await window.supabaseClient.rpc('complete_pos_order', {
    p_client_order_uuid: payload.client_order_uuid, p_branch_id: payload.branch_id, p_shift_id: payload.shift_id,
    p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone,
    p_subtotal: payload.subtotal, p_discount_pct: payload.discount_pct, p_discount_amount: payload.discount_amount,
    p_vat_amount: payload.vat_amount, p_total: payload.total,
    p_payment_method: payload.payment_method, p_cash_amount: payload.cash_amount, p_items: payload.items,
    p_channel: payload.channel, p_delivery_platform_id: payload.delivery_platform_id,
    p_table_id: payload.table_id, p_staff_member_id: payload.staff_member_id,
    p_platform_invoice_last4: payload.platform_invoice_last4,
    p_customer_id: payload.customer_id
  });
  if(error) throw error;
  return data;
}

/* ============ Dine-in offline queue dispatch ============
   register_dine_in_order/pay_dine_in_order used to be online-only (see the
   old comments on submitTableOrderRegistration/submitOrder's dine-in
   branches) specifically because register_dine_in_order's "append a round"
   path had no idempotency protection — a retried append would double the
   subtotal and order_items. supabase/migrations/20260831170000 closed that
   gap (dine_in_round_log, keyed by the same client_order_uuid already
   generated per attempt), so these can now go through the exact same
   queue/retry contract as a normal sale. */
async function sendDineInRegisterToServer(payload){
  const { data, error } = await window.supabaseClient.rpc('register_dine_in_order', {
    p_client_order_uuid: payload.client_order_uuid, p_branch_id: payload.branch_id, p_shift_id: payload.shift_id,
    p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone,
    p_subtotal: payload.subtotal, p_discount_pct: payload.discount_pct, p_items: payload.items,
    p_table_id: payload.table_id, p_staff_member_id: payload.staff_member_id,
    p_existing_order_id: payload.existing_order_id, p_customer_id: payload.customer_id
  });
  if(error) throw error;
  return data;
}
// pay_dine_in_order has no idempotency key of its own — it doesn't need one.
// Its own WHERE clause (payment_status = 'unpaid') already makes a second
// call against an order this exact call already paid a clean no-op at the
// DB level; it just surfaces as the "already paid" exception instead of
// silently succeeding twice. A queued retry treats that specific message as
// success (already applied) rather than a real failure — anything else
// (a genuinely different error) still fails normally and stays queued.
async function sendDineInPayToServer(payload){
  const { error } = await window.supabaseClient.rpc('pay_dine_in_order', {
    p_order_id: payload.order_id, p_payment_method: payload.payment_method, p_cash_amount: payload.cash_amount,
    p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone, p_customer_id: payload.customer_id
  });
  if(error && !/already paid/i.test(error.message || '')) throw error;
  return payload.order_id;
}
async function sendDineInRegisterAndPayToServer(payload){
  const orderId = await sendDineInRegisterToServer(payload);
  await sendDineInPayToServer({ ...payload, order_id: orderId });
  return orderId;
}
function dispatchQueuedPayload(payload){
  switch(payload.type){
    case 'dine_in_register': return sendDineInRegisterToServer(payload);
    case 'dine_in_pay': return sendDineInPayToServer(payload);
    case 'dine_in_register_and_pay': return sendDineInRegisterAndPayToServer(payload);
    default: return sendOrderToServer(payload); // 'simple' (or unset, for anything already queued before this field existed)
  }
}

let syncing = false;
// A permanently-invalid queued item (references a since-deleted table, a
// loyalty redemption that no longer affordable, etc.) used to `break` the
// whole pass on its first failure — every OTHER, perfectly sendable order
// queued behind it silently never got its turn again until that one finally
// cleared. Retrying every item every pass, with its own backoff so a stuck
// one doesn't get hammered every 30s forever, fixes both at once.
const SYNC_MAX_BACKOFF_MS = 5 * 60 * 1000;
// Orders are financial data — "give up and delete" is never acceptable
// (see the print queue's PRINT_MAX_RETRIES for the contrast: printing is
// allowed to have a permanent, dismissable "failed" state; an order is not).
// Past this many attempts, stop the automatic 30s hammering (next_retry_at
// pinned to Infinity — the skip-check below always leaves it alone), flag
// it loudly ONCE, and require a human to explicitly retry it from
// Diagnostics — but the order itself stays in the queue forever until it
// actually succeeds or a human resolves the underlying problem.
const SYNC_MAX_AUTO_RETRIES = 10;
async function syncQueue(){
  if(!navigator.onLine || syncing) return;
  syncing = true;
  let anySucceeded = false, anyFailed = false, lastFailure = null;
  try {
    const queued = await getQueuedOrders();
    const now = Date.now();
    for(const payload of queued){
      if(payload.next_retry_at && payload.next_retry_at > now) continue; // still backing off (or permanently stuck, Infinity > now always) — leave it for a later pass / a manual retry
      try {
        const orderId = await dispatchQueuedPayload(payload);
        await removeQueuedOrder(payload.client_order_uuid);
        if(payload.channel === 'delivery' && orderId) registerActiveDeliveryOrder(orderId, payload);
        anySucceeded = true;
      } catch (e) {
        anyFailed = true; lastFailure = e;
        const retryCount = (payload.retry_count || 0) + 1;
        const nowStuck = retryCount >= SYNC_MAX_AUTO_RETRIES;
        const backoff = Math.min(1000 * Math.pow(2, retryCount), SYNC_MAX_BACKOFF_MS);
        try {
          await queueOrder({
            ...payload, retry_count: retryCount, last_error: (e && e.message) || String(e),
            next_retry_at: nowStuck ? Infinity : Date.now() + backoff, stuck: nowStuck
          });
        } catch (e2) { /* IndexedDB write failed — this item just gets retried sooner than its backoff intended, harmless */ }
        // Fire only on the exact transition into "stuck" — not every pass
        // afterward, which would spam the same toast every 30s forever.
        if(nowStuck && !payload.stuck) showToast('⚠ تعذّرت مزامنة طلب بعد عدة محاولات — راجع "تشخيص النظام"');
      }
    }
  } catch (e) { /* IndexedDB unavailable — nothing to sync */ }
  if(anySucceeded) LAST_SUCCESSFUL_SYNC_AT = Date.now();
  // Deliberately NOT pinging the server here when the queue is empty (tried,
  // then reverted — see the "تحديث واختبار الاتصال" button below instead).
  // An empty queue means nothing is actually waiting on cloud connectivity
  // right now, so there's no real risk to a cashier's workflow to detect —
  // only a rarely-opened diagnostics screen that would rather show green.
  // This function runs every 30s on every open POS terminal all day; paying
  // a real request each time just for that, on every idle device, isn't
  // worth it. The manual button covers the actual "I want to check right
  // now" moment for free.
  // A pass with at least one real success proves the cloud is reachable
  // even if another item in the same pass failed for its own reason (a
  // stale price, a validation error) — only report "cloud down" when
  // NOTHING got through, the actual signal Diagnostics cares about.
  if(anySucceeded) reportCloudResult(true);
  else if(anyFailed) reportCloudResult(false, lastFailure);
  syncing = false;
  refreshDiagnosticsIfOpen();
}
let LAST_SUCCESSFUL_SYNC_AT = null;
window.addEventListener('online', syncQueue);
setInterval(syncQueue, 30000);

/* Recipe-line and box-pick stock decrements are resolved SERVER-SIDE now
   (resolve_menu_item_recipe_decrements / resolve_box_selection_decrements in
   complete_pos_order/register_dine_in_order) from the menu item's own stored
   recipe — the cashier session never needs to read ingredient names,
   quantities, or unit costs to ring up a sale. This function now only
   computes stock-linked MODIFIER extras (e.g. "extra cheese") — a smaller,
   already customer-facing surface left client-side for now. See the
   server-side migration's header comment for the full reasoning. */
function computeLineStockDecrements(item){
  const meta = MENU_ITEM_META[item.productId];
  const decrements = [];
  if(!meta || meta.componentSlot || !item.config) return decrements;
  const modDef = MODIFIER_PRODUCTS[item.productId];
  if(modDef && modDef.groups){
    modDef.groups.forEach(g=>{
      const sel = item.config[g.id];
      const arr = Array.isArray(sel) ? sel : [sel];
      arr.forEach(optId=>{
        const link = MODIFIER_OPTION_STOCK[g.id+'_'+optId];
        if(link){
          const qtyInStockUnit = convertToUnit(link.qty, link.unit, STOCK_UNIT_BY_ID[link.stockItemId] || link.unit);
          decrements.push({stock_item_id: link.stockItemId, qty: qtyInStockUnit * item.qty});
        }
      });
    });
  }
  return decrements;
}

// The customer's actual box picks this order — just which eligible-item ROW
// the customer chose and how many pieces (both already shown to the
// customer at checkout, not secret). The server looks up what each pick
// actually decrements from its own recipe data; this never sends a
// stock_item_id, unit cost, or ingredient name.
function computeLineBoxSelections(item){
  const meta = MENU_ITEM_META[item.productId];
  if(!meta || !meta.componentSlot || !item.config || !item.config.selections) return [];
  return Object.entries(item.config.selections)
    .filter(([,pieceQty])=>pieceQty > 0)
    .map(([eligibleId, pieceQty])=>({eligible_item_id: parseInt(eligibleId,10), qty: pieceQty}));
}

function buildOrderPayload(totals){
  const clientOrderUuid = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2)));
  const items = state.cart.map(item=>({
    // Roadmap item 4: per-line, not per-cart — a mixed cart (service +
    // retail product) is now possible, so this can't just check the whole
    // business's type anymore. A service's virtual PRODUCTS id is always
    // negative (see loadPosData); real menu_items ids are always positive.
    menu_item_id: item.productId < 0 ? null : item.productId,
    service_id: item.productId < 0 ? -item.productId : null,
    qty: item.qty,
    unit_price: lineUnitPrice(item),
    modifiers_total: 0,
    line_total: lineUnitPrice(item) * item.qty,
    note: item.note || null,
    selected_modifiers: formatConfigLabels(item.productId, item.config).map(l=>({text:l.text})),
    stock_decrements: computeLineStockDecrements(item),
    box_selections: computeLineBoxSelections(item),
    is_points_redemption: !!item.isPointsRedemption,
    points_cost: item.isPointsRedemption ? (MENU_ITEM_META[item.productId].pointsRedeemPrice || 0) : 0
  }));
  return {
    client_order_uuid: clientOrderUuid,
    branch_id: DEVICE.branchId,
    shift_id: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    staff_member_id: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.id : null,
    customer_name: state.customer ? state.customer.name : null,
    customer_phone: state.customer ? state.customer.phone : null,
    customer_id: state.customer ? (state.customer.id || null) : null,
    subtotal: totals.subtotal, discount_pct: state.discountPct, discount_amount: totals.discount,
    vat_amount: totals.vat, total: totals.total,
    payment_method: state.activePaymentMethod,
    // split's cash half is whatever's left after the cashier-entered card
    // amount — persisting it here is what lets the shift close/cash
    // breakdown correctly count it as real cash in the drawer, instead of
    // the whole split total silently going uncounted as cash.
    cash_amount: state.activePaymentMethod === 'cash' ? (state.cashAmount||0)
      : state.activePaymentMethod === 'split' ? Math.max(0, Number((totals.total - (state.splitCardAmount||0)).toFixed(2)))
      : null,
    channel: state.orderChannel || 'dine_in',
    delivery_platform_id: state.orderChannel === 'delivery' ? (state.deliveryPlatformId || null) : null,
    platform_invoice_last4: state.orderChannel === 'delivery' ? (state.platformInvoiceLast4 || null) : null,
    table_id: state.orderChannel === 'dine_in' ? (state.selectedTableId || null) : null,
    items
  };
}

// Builds the items[] + subtotal from state.cart and either creates a new
// dine-in order for state.selectedTableId, or — when state.selectedOrderId
// is set (the table already has a still-open, unpaid order, e.g. a "إضافة
// أصناف" round) — appends to it instead. Used by both the pay-after
// register-only CTA and the pay-before register-then-pay flow below, so a
// table's order math is computed in exactly one place regardless of timing.
function buildDineInRegisterPayload(){
  const items = state.cart.map(item=>({
    // Roadmap item 4: per-line, not per-cart — a mixed cart (service +
    // retail product) is now possible, so this can't just check the whole
    // business's type anymore. A service's virtual PRODUCTS id is always
    // negative (see loadPosData); real menu_items ids are always positive.
    menu_item_id: item.productId < 0 ? null : item.productId,
    service_id: item.productId < 0 ? -item.productId : null,
    qty: item.qty, unit_price: lineUnitPrice(item),
    modifiers_total: 0, line_total: lineUnitPrice(item) * item.qty, note: item.note || null,
    selected_modifiers: formatConfigLabels(item.productId, item.config).map(l=>({text:l.text})),
    stock_decrements: computeLineStockDecrements(item),
    box_selections: computeLineBoxSelections(item),
    // Was missing entirely on this path — a points-redeemed item added to a
    // dine-in table order (unlike pickup/delivery, which go through
    // buildOrderPayload/sendOrderToServer instead) silently lost both flags
    // here, so register_dine_in_order had nothing to charge the redemption
    // against no matter what the RPC itself did with them.
    is_points_redemption: !!item.isPointsRedemption,
    points_cost: item.isPointsRedemption ? (MENU_ITEM_META[item.productId].pointsRedeemPrice || 0) : 0
  }));
  const {subtotal} = cartTotals();
  return {
    type: 'dine_in_register',
    client_order_uuid: (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2))),
    branch_id: DEVICE.branchId,
    shift_id: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    customer_name: state.customer ? state.customer.name : null,
    customer_phone: state.customer ? state.customer.phone : null,
    customer_id: state.customer ? (state.customer.id || null) : null,
    subtotal, discount_pct: state.discountPct, items,
    table_id: state.selectedTableId,
    staff_member_id: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.id : null,
    existing_order_id: state.selectedOrderId || null
  };
}
// Queue-first, same contract as a normal sale (buildOrderPayload/
// sendOrderToServer below): the round is safely in IndexedDB, keyed by its
// own client_order_uuid, before any network attempt — a network drop here
// no longer loses the round or blocks the cashier, it just syncs on its own
// once connectivity (or migrations/20260831170000's append idempotency)
// lets syncQueue() get it through. Returns the real order id when the
// immediate send succeeds, or null when it's still queued (caller treats
// that as "saved, will sync" rather than a failure — see
// submitTableOrderRegistration/submitOrder's Flow A).
async function registerTableOrder(){
  const payload = buildDineInRegisterPayload();
  try { await queueOrder(payload); } catch (e) { /* IndexedDB unavailable — still attempt a direct send below */ }
  if(!navigator.onLine) return null;
  try {
    const orderId = await sendDineInRegisterToServer(payload);
    await removeQueuedOrder(payload.client_order_uuid);
    return orderId;
  } catch (e) {
    return null; // stays queued — syncQueue() retries it
  }
}

async function submitOrder(totals){
  if(state.resumingOrder){
    // Flow D: closing out an already-registered, already-kitchen-printed
    // tab — no items to send, just the payment method against the order's
    // stored total. order_id is real already (this order was registered
    // earlier, online), so this is a plain queued dine_in_pay op — same
    // queue-first/sync-later contract as everything else now.
    const payload = {
      channel: 'dine_in', table_id: state.resumingOrder.table_id,
      payment_method: state.activePaymentMethod,
      cash_amount: state.activePaymentMethod === 'cash' ? (state.cashAmount||0)
        : state.activePaymentMethod === 'split' ? Math.max(0, Number((totals.total - (state.splitCardAmount||0)).toFixed(2)))
        : null,
      customer_name: state.customer ? state.customer.name : null,
      customer_phone: state.customer ? state.customer.phone : null,
      customer_id: state.customer ? (state.customer.id || null) : null,
      orderId: null
    };
    const payQueueEntry = {
      type: 'dine_in_pay',
      client_order_uuid: (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2))),
      order_id: state.resumingOrder.id, payment_method: payload.payment_method, cash_amount: payload.cash_amount,
      customer_name: payload.customer_name, customer_phone: payload.customer_phone, customer_id: payload.customer_id
    };
    try { await queueOrder(payQueueEntry); } catch (e) { /* IndexedDB unavailable — still attempt a direct send below */ }
    if(navigator.onLine){
      try {
        await sendDineInPayToServer(payQueueEntry);
        await removeQueuedOrder(payQueueEntry.client_order_uuid);
        payload.orderId = state.resumingOrder.id;
      } catch(e){ /* stays queued — syncQueue() retries it */ }
    }
    return payload;
  }

  const payload = buildOrderPayload(totals);

  if(payload.channel === 'dine_in' && payload.table_id){
    // Flow A: pay-before-eating with a table — register the order (kitchen
    // gets it, stock decrements) and immediately pay it in the same tap, so
    // the table's status ladder (serving -> awaiting_payment -> cleaning)
    // stays accurate even though the business collects payment right away.
    // One combined queue entry covers both calls: on retry, register
    // re-derives the same order id via its own idempotency (unique
    // client_order_uuid for a new order, dine_in_round_log for an append —
    // see migrations/20260831170000) before pay is attempted again, so a
    // network drop between the two calls can't double-register or
    // double-charge either half.
    const combinedPayload = { ...buildDineInRegisterPayload(), type: 'dine_in_register_and_pay', payment_method: payload.payment_method, cash_amount: payload.cash_amount };
    try { await queueOrder(combinedPayload); } catch (e) { /* IndexedDB unavailable — still attempt a direct send below */ }
    if(navigator.onLine){
      try {
        const orderId = await sendDineInRegisterAndPayToServer(combinedPayload);
        await removeQueuedOrder(combinedPayload.client_order_uuid);
        payload.orderId = orderId;
      } catch(e){ /* stays queued — syncQueue() retries it */ }
    }
    return payload;
  }

  try { await queueOrder(payload); } catch (e) { /* IndexedDB unavailable — still attempt a direct send below */ }
  let orderId = null;
  if(navigator.onLine){
    try {
      orderId = await sendOrderToServer(payload);
      await removeQueuedOrder(payload.client_order_uuid);
    } catch (e) {
      // insert failed (network blip, RLS, etc) — stays queued, syncQueue() retries it
    }
  }
  payload.orderId = orderId;
  return payload;
}

/* ============ Owner notifications — real, free Web Push to whoever (owner/
   manager) enabled it on their own device from Settings → الإشعارات. Whether
   each type actually fires is the server's call (/api/send-owner-push checks
   the business's saved preference); this file only decides WHEN to ask —
   after a new order, after a refund, and after checking whether this order's
   stock/sales-total crossed a configured threshold. */
const UNIT_LABELS_POS = {kg:'كجم', g:'غرام', liter:'لتر', piece:'حبة'};

async function sendOwnerPush(type, title, body){
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if(!session) return;
    await fetch('/api/send-owner-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ type, title, body })
    });
  } catch (e) { /* owner alert is a nice-to-have — never block the real action */ }
}

// fires only the instant a decremented item crosses BELOW the configured
// threshold this order — not on every later order while it stays low,
// which would just spam the owner with the same fact repeatedly.
//
// Known narrowed scope since recipe/box decrements moved server-side (see
// the migration adding resolve_menu_item_recipe_decrements): this only sees
// stock touched via payload.items[].stock_decrements, which is now just
// stock-linked MODIFIER extras — a plain recipe or box-pick sale no longer
// tells the client which stock_item_ids it affected, on purpose (the whole
// point was the cashier session no longer reading recipe data at all). A
// recipe/box item running low won't push-alert until something else (a
// modifier sale, or the Inventory screen itself) surfaces it. Fully closing
// that gap means having the checkout RPC report back which stock rows it
// touched — a reasonable follow-up, not folded into this change.
async function checkLowStockAfterOrder(payload, thresholdPct){
  const decrementByItem = {};
  payload.items.forEach(it=>{
    (it.stock_decrements||[]).forEach(d=>{
      decrementByItem[d.stock_item_id] = (decrementByItem[d.stock_item_id]||0) + d.qty;
    });
  });
  const stockItemIds = Object.keys(decrementByItem).map(Number);
  if(stockItemIds.length === 0) return;
  const { data: stockRows } = await window.supabaseClient.from('stock_items')
    .select('id, name, qty_on_hand, par_level, unit').in('id', stockItemIds);
  (stockRows||[]).forEach(row=>{
    if(!(row.par_level > 0)) return;
    const decremented = decrementByItem[row.id] || 0;
    const after = Number(row.qty_on_hand);
    const before = after + decremented;
    const afterPct = (after / row.par_level) * 100;
    const beforePct = (before / row.par_level) * 100;
    if(afterPct <= thresholdPct && beforePct > thresholdPct){
      sendOwnerPush('low_stock', 'مخزون منخفض',
        `مخزون ${row.name} نزل عن ${thresholdPct}٪ — باقي ${Math.max(0,after)} ${UNIT_LABELS_POS[row.unit]||row.unit}.`);
    }
  });
}

// once-per-day (per device) so hitting the target doesn't re-notify on every
// order for the rest of the day
async function checkSalesTargetAfterOrder(targetAmount){
  const todayKey = 'rakeen_sales_target_notified_' + new Date().toISOString().slice(0,10);
  if(localStorage.getItem(todayKey) === '1') return;
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const { data: orders } = await window.supabaseClient.from('orders').select('total')
    .eq('business_id', DEVICE.businessId).gte('created_at', startToday.toISOString());
  const total = (orders||[]).reduce((s,o)=>s+Number(o.total),0);
  if(total >= targetAmount){
    localStorage.setItem(todayKey, '1');
    sendOwnerPush('sales_target', 'وصلت هدف المبيعات! 🎉', `مبيعات اليوم وصلت ${total.toFixed(2)} ر.س.`);
  }
}

async function runOwnerNotificationChecks(payload){
  try {
    const { data: business } = await window.supabaseClient.from('businesses')
      .select('notify_new_order, notify_low_stock, notify_low_stock_pct, notify_sales_target, notify_sales_target_amount')
      .eq('id', DEVICE.businessId).single();
    if(!business) return;
    if(business.notify_new_order){
      sendOwnerPush('new_order', 'طلب جديد', `طلب جديد بقيمة ${Number(payload.total).toFixed(2)} ر.س.`);
    }
    if(business.notify_low_stock){
      checkLowStockAfterOrder(payload, Number(business.notify_low_stock_pct) || 20);
    }
    if(business.notify_sales_target && Number(business.notify_sales_target_amount) > 0){
      checkSalesTargetAfterOrder(Number(business.notify_sales_target_amount));
    }
  } catch(err){ console.error('owner notification checks failed', err); }
}

/* ============ Receipt printing — real ESC/POS via the Android wrapper app's
   PrintBridge (window.AndroidPrint), reachable only when this page runs
   inside that thin native shell (not a plain browser tab — browsers can't
   open a raw socket to a LAN printer, and our Cloudflare-hosted backend has
   no route to the restaurant's local network either). The receipt renders
   as a rasterized image rather than raw ESC/POS text bytes — this sidesteps
   Arabic code-page/shaping support, which varies wildly between cheap
   thermal printers; the browser's own text engine already shapes Arabic
   correctly, so only pixels get sent, and it works regardless of printer
   brand. When no bridge/printer is configured (plain browser, e.g. testing
   on a desktop or an unwrapped phone), falls back to the original simulated
   "تمت الطباعة" flow — unchanged from before this feature existed. */
function printerBridgeAvailable(){
  return !!(window.AndroidPrint && typeof window.AndroidPrint.isAvailable === 'function' && window.AndroidPrint.isAvailable());
}

// this pill used to be static markup that always claimed "الطابعة جاهزة"
// regardless of whether a printer bridge or IP was actually configured —
// now reflects the real state.
function updatePrinterStatusPill(){
  const pill = document.getElementById('printerStatus');
  if(!pill) return;
  const icon = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  const ready = printerBridgeAvailable() && !!DEVICE.printerIp;
  pill.classList.toggle('online', ready);
  pill.innerHTML = icon + (ready ? 'الطابعة جاهزة' : printerBridgeAvailable() ? 'الطابعة غير معدّة' : 'بدون طابعة شبكة');
}

// Receipt themes. A thermal printer gives one ink colour, one paper width
// and a roll that costs money, so a "theme" here is a set of decisions
// about density and hierarchy — not a palette.
//
// Kept numerically identical to the app's src/domain/receiptTheme.ts: the
// same business prints from both, and a receipt that changed shape
// depending on which till rang it up would be worse than having no themes.
//
// Every theme prints the full ZATCA Phase 1 simplified tax invoice — the
// heading, the seller's VAT number, the timestamp, the total, the VAT
// amount and the TLV QR. A theme may change spacing and type; it may never
// change what a tax invoice must contain.
// أربع ورقات مختلفة، لا ورقة واحدة بأربع مسافات.
//
// مساحة التصميم على طابعة حرارية ضيّقة -- لا ألوان ولا خطوط متعددة ولا
// تدرّج -- فالتمييز يأتي مما تقدر عليه فعلاً: القلب (أبيض على أسود)،
// والنقاط الموصِلة، والأشرطة السوداء، والفراغ وحده بلا خطوط، ومباعدة
// الحروف. وكلٌّ من هذي يعطي ورقة تُعرف من بعيد.
//
//   rule       شكل الفاصل: خط صلب / لا شيء / منقّط / شريط أسود
//   orderStyle رقم الطلب: صندوق / سطر عادي / حروف متباعدة / مقلوب
//   totalStyle الإجمالي: عريض / عادي / صندوق / مقلوب
//   itemStyle  الأصناف: أعمدة بعنوان / سطر بنقاط موصِلة
//   sectionLabels عناوين أقسام صغيرة متباعدة الحروف
const RECEIPT_THEMES = {
  // التقليدي: أعمدة وخطوط صلبة، كما تُطبع الفواتير منذ عرفت الطابعات.
  classic:   { density:1,    typeScale:1,    showLogo:true,  logoWidth:0.30,
               rule:'solid',  orderStyle:'box',    totalStyle:'bold',  itemStyle:'columns', sectionLabels:false,
               headerBand:false, boxedTotal:false, qrMaxSize:220 },
  // المضغوط: أقصر ورقة ممكنة. بلا شعار ولا خطوط ولا عناوين -- الفراغ
  // وحده يفصل، والصنف وسعره على سطر واحد تصلهما نقاط.
  compact:   { density:0.68, typeScale:0.88, showLogo:false, logoWidth:0.24,
               rule:'none',   orderStyle:'plain',  totalStyle:'plain', itemStyle:'leaders', sectionLabels:false,
               headerBand:false, boxedTotal:false, qrMaxSize:170 },
  // الأنيق: هادئ ومتّسع. خطوط منقّطة رفيعة، وعناوين أقسام بحروف متباعدة،
  // ونقاط موصِلة -- مظهر المطاعم الراقية: لا شيء صارخ، وكل شيء مرتّب.
  elegant:   { density:1.15, typeScale:1.04, showLogo:true,  logoWidth:0.34,
               rule:'dotted', orderStyle:'spaced', totalStyle:'box',   itemStyle:'leaders', sectionLabels:true,
               headerBand:true,  boxedTotal:true,  qrMaxSize:220 },
  // الفخم: بيان. شعار كبير، ورقم الطلب والإجمالي أبيض على أسود، وأشرطة
  // سوداء تفصل الأقسام. تُعرف الورقة من آخر الصالة.
  signature: { density:1.12, typeScale:1.02, showLogo:true,  logoWidth:0.52,
               rule:'bar',    orderStyle:'invert', totalStyle:'invert', itemStyle:'columns', sectionLabels:true,
               headerBand:false, boxedTotal:true,  qrMaxSize:220 }
};
let RECEIPT_THEME = 'classic';
// businesses.pos_require_manager_pin_for_close. Governs the shift-close
// gate ONLY — cancelling an order and refunding keep their own PIN, which
// this setting was never about.
let REQUIRE_MANAGER_PIN_FOR_CLOSE = true;
// businesses.dine_in_mode — 'simple' means order at the till and sit
// anywhere, with no table to pick and none to close later. The kitchen
// still gets "محلي" so it plates rather than bags.
let DINE_IN_MODE = 'simple';
// businesses.pos_pager_enabled — the buzzer base station is standalone;
// this only records which number went out with which order.
let POS_PAGER_ENABLED = false;
// businesses.kitchen_ticket_mode — 'copy' prints a second customer
// receipt instead of a kitchen-shaped ticket.
let KITCHEN_TICKET_MODE = 'brief';
function receiptTheme(id){ return RECEIPT_THEMES[id] || RECEIPT_THEMES.classic; }

// A bilingual label — the receipt is read by customers and by auditors.
function bi(ar, en){ return ar + ' · ' + en; }

function renderReceiptCanvas(receipt, qrImage, logoImage){
  const width = DEVICE.printerPaperWidth || 576; // 80mm≈576px, 58mm≈384px at ~203dpi
  const pad = 16, lineH = 32;
  const th = receiptTheme(RECEIPT_THEME);
  // Spacing and type come from the theme; the ZATCA fields never do.
  const gap = n => lineH * n * th.density;
  const sz = n => Math.round(n * th.typeScale);
  const qrSize = Math.min(220, th.qrMaxSize, width - pad * 2);
  // الشعار بنسبة أبعاده الأصلية.
  //
  // كان يُرسم في مربع مهما كانت أبعاده، فشعار عريض ٣:٢ -- وهو الشائع --
  // يُضغط أفقياً أو يُمطّ رأسياً. العرض وحده هو المضبوط الآن، والارتفاع
  // يتبعه، فلا يتشوّه شكل صاحب المطعم على ورقته.
  //
  // وسقفٌ للارتفاع مع ذلك: شعار طويل جداً كان سيبتلع نصف الورقة، فإن
  // تجاوز ثلثَ عرض الورق قُيّد بارتفاعه وعاد العرض يتبعه.
  const logoW0 = (logoImage && th.showLogo) ? Math.round(width * (th.logoWidth || 0.30)) : 0;
  const logoRatio = logoImage ? (logoImage.naturalHeight || logoImage.height) / (logoImage.naturalWidth || logoImage.width) : 1;
  const logoCapH = Math.round(width * 0.34);
  const logoW = (logoW0 * logoRatio > logoCapH) ? Math.round(logoCapH / logoRatio) : logoW0;
  const logoH = Math.round(logoW * logoRatio);
  const maxHeight = 2400 + receipt.items.length * 200 + (qrImage ? qrSize + 120 : 0) + (logoImage ? logoH + 40 : 0);
  const scratch = document.createElement('canvas');
  scratch.width = width; scratch.height = maxHeight;
  const ctx = scratch.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, maxHeight);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let y = pad + lineH / 2;

  const contentWidth = width - pad * 2;
  const wrapLine = (text, font)=>{
    ctx.font = font;
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w=>{
      const test = cur ? cur + ' ' + w : w;
      if(ctx.measureText(test).width > contentWidth && cur){ lines.push(cur); cur = w; }
      else cur = test;
    });
    if(cur) lines.push(cur);
    return lines;
  };
  const centerText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    y += gap(size > 22 ? 1.3 : 1);
  };
  const rowText = (leftMono, rightArabic, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(rightArabic, width - pad, y);
    ctx.font = '500 ' + size + 'px "IBM Plex Mono", monospace';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillText(leftMono, pad, y);
    y += gap(1);
  };
  // الفاصل بحسب القالب. أربع لغات بصرية مختلفة لنفس الوظيفة.
  const divider = ()=>{
    const mode = th.rule || 'solid';
    if(mode === 'none'){ y += gap(0.55); return; }
    if(mode === 'bar'){
      // شريط أسود سميك: يُرى من بعيد، ويجعل الأقسام كتلاً لا سطوراً.
      ctx.fillStyle = '#000';
      ctx.fillRect(pad, y - 3, width - pad * 2, 6);
      y += gap(0.75);
      return;
    }
    if(mode === 'dotted'){
      const row = Math.round(y) + 0.5;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(pad, row); ctx.lineTo(width - pad, row); ctx.stroke();
      ctx.setLineDash([]);
      y += gap(0.6);
      return;
    }
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    y += gap(0.6);
  };

  /** شريط أسود بكتابة بيضاء. أقوى تمييز تقدر عليه طابعة بلون واحد. */
  const invertBar = (text, size)=>{
    const h = Math.round(size * 1.9);
    ctx.fillStyle = '#000';
    ctx.fillRect(pad * 0.5, y - h / 2, width - pad, h);
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    ctx.fillStyle = '#000';
    y += h / 2 + gap(0.5);
  };

  /** حروف متباعدة، وسطية. مظهر المطاعم الراقية بلا زخرفة. */
  const spacedText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    const prev = ctx.letterSpacing;
    // العربية تتصل حروفها فالمباعدة تفكّها؛ تُطبّق على اللاتيني والأرقام.
    if(!/[؀-ۿ]/.test(text)) ctx.letterSpacing = Math.round(size * 0.18) + 'px';
    ctx.fillText(text, width / 2, y);
    ctx.letterSpacing = prev || '0px';
    y += gap(size > 22 ? 1.3 : 1);
  };

  /** سطر صنف بنقاط موصِلة بين اسمه وسعره -- مظهر التذاكر القديمة. */
  const leaderRow = (name, price, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(name, width - pad, y);
    const nameW = ctx.measureText(name).width;
    ctx.font = '600 ' + size + 'px "IBM Plex Mono", monospace';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillText(price, pad, y);
    const priceW = ctx.measureText(price).width;
    // النقاط تملأ ما بينهما بالضبط، فلا تلامس أياً منهما.
    const from = pad + priceW + 8, to = width - pad - nameW - 8;
    if(to > from){
      ctx.fillStyle = '#000';
      for(let x = from; x < to; x += 6) ctx.fillRect(x, y - 1, 2, 2);
    }
    y += gap(1);
  };

  // A hairline, lighter than a section divider: it groups items into a
  // table without competing with the rules that separate the sections.
  //
  // Dotted rather than grey, and snapped to the middle of one pixel row.
  // The canvas is thresholded to 1-bit before it reaches the printer
  // (luminance < 160), and the previous 0.5px #888 line antialiased to
  // about 195 — so it drew in the preview and printed nothing at all.
  // Colour cannot carry weight through a 1-bit conversion; dash spacing
  // can, which is also how the text path separates its items.
  const hairline = ()=>{
    const row = Math.round(y) + 0.5;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(pad, row); ctx.lineTo(width - pad, row); ctx.stroke();
    ctx.setLineDash([]);
    y += gap(0.35);
  };

  if(logoImage && th.showLogo && logoW > 0){
    ctx.drawImage(logoImage, (width - logoW) / 2, y, logoW, logoH);
    y += logoH + lineH * 0.45;
  }
  // The elegant theme frames the name between two rules; the others just
  // print it.
  if(th.headerBand){ divider(); }
  // الاسم تحت الشعار اختياري: أغلب الشعارات تحمل الاسم داخلها، فكتابته
  // تحتها تكرار. لكن غياب الشعار يجعل الاسم هو الترويسة كلها، فلا يُخفى
  // حينها مهما كان الإعداد -- ورقة بلا اسم ولا شعار ليست فاتورة.
  const nameShown = receipt.showBusinessName !== false || !(logoImage && th.showLogo && logoW > 0);
  if(nameShown) centerText(receipt.businessName || 'ركين', sz(30), true);
  if(th.headerBand){ divider(); }
  // السلوقن ثم مكان الفرع، بنفس ترتيب مسار النص حتى لا تختلف ورقتان
  // لمطعم واحد باختلاف الطابعة التي طبعتهما.
  if(receipt.tagline) centerText(receipt.tagline, sz(17), false);
  // اسم الفرع يسبق الحي والمدينة، ولا يُطبع إلا حين مرّرته الجهة
  // المُرسِلة -- وهي لا تمرّره إلا لمنشأة لها أكثر من فرع.
  const whereLine = [receipt.branchLabel, receipt.locationLine].filter(Boolean).join(' — ');
  if(whereLine) centerText(whereLine, sz(16), false);
  else if(receipt.branchName) centerText(receipt.branchName, sz(19), false);

  // ZATCA Phase 1: the heading and the seller's VAT number are mandatory
  // on a simplified tax invoice, in every theme. وموضعهما مع بيانات
  // المنشأة، فهما تعريف بالبائع لا ببيانات هذا الطلب.
  if(receipt.vatNumber){
    y += gap(0.2);
    centerText(bi('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice'), sz(16), true);
    centerText(bi('الرقم الضريبي', 'VAT No') + ': ' + receipt.vatNumber, sz(14), false);
  }

  // رقم الطلب في صندوق: أول ما تبحث عنه العين، فيستحق حدّاً يخصّه.
  // أربعة أشرطة ممتلئة لا حدّ مرسوم -- الرأس الحراري يطبع الحدّ الرفيع
  // متفاوتاً، والشريط الممتلئ يخرج نظيفاً.
  //
  // والرقم سطر قائم بذاته دائماً، لا مطويّاً في metaLabel كما كان: كان
  // يختفي كلما طُبعت الفاتورة قبل أن يعطي الخادم رقماً، فيخرج الزبون
  // بورقة لا يستطيع أن يسأل بها عن طلبه.
  y += gap(0.7);
  const oStyle = th.orderStyle || 'box';
  if(oStyle === 'invert'){
    invertBar(bi('رقم الطلب', 'Order No') + '   ' + receipt.orderNumber, sz(24));
  } else if(oStyle === 'plain'){
    centerText(bi('رقم الطلب', 'Order') + ': ' + receipt.orderNumber, sz(17), true);
  } else if(oStyle === 'spaced'){
    spacedText(bi('رقم الطلب', 'Order No'), sz(12), false);
    y -= gap(0.15);
    spacedText(receipt.orderNumber, sz(28), true);
  } else {
    const boxTop = y - lineH * 0.35;
    centerText(bi('رقم الطلب', 'Order No'), sz(14), false);
    centerText(receipt.orderNumber, sz(30), true);
    const boxH = (y - lineH * 0.2) - boxTop;
    const boxX = pad + (width - pad * 2) * 0.2, boxW = (width - pad * 2) * 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(boxX, boxTop, boxW, 1.5);
    ctx.fillRect(boxX, boxTop + boxH - 1.5, boxW, 1.5);
    ctx.fillRect(boxX, boxTop, 1.5, boxH);
    ctx.fillRect(boxX + boxW - 1.5, boxTop, 1.5, boxH);
  }
  y += gap(0.55);

  // التاريخ تحت الرقم: تتمّة كتلته، لا سطر في ترويسة المنشأة.
  centerText(receipt.dateLabel, sz(15), false);
  y += gap(0.25);
  divider();
  // عناوين أقسام صغيرة بحروف متباعدة: تقسّم الورقة بلا خطوط إضافية،
  // وهي ما يعطي القالبَين الأنيق والفخم بنيتهما.
  if(th.sectionLabels) spacedText(bi('الطلب', 'ORDER'), sz(11), false);
  if(receipt.cashierName) rowText('', bi('تمت بواسطة', 'Served by') + ': ' + receipt.cashierName, sz(15), false);
  if(receipt.metaLabel) rowText('', bi('نوع الطلب', 'Type') + ': ' + receipt.metaLabel, sz(15), false);
  // صاحب الطلب. لا يظهر إلا حين يوجد -- وهو يوجد في الطلب الإلكتروني
  // والتوصيل، حيث الورقة هي ما يربط الكيس بصاحبه.
  if(receipt.customerName) rowText('', bi('العميل', 'Customer') + ': ' + receipt.customerName, sz(15), false);
  if(receipt.customerPhone) rowText('', bi('الجوال', 'Phone') + ': ' + receipt.customerPhone, sz(15), false);
  divider();

  receipt.items.forEach((it, idx)=>{
    const nameFont = '700 ' + sz(21) + 'px "IBM Plex Sans Arabic", sans-serif';
    // العربي والإنجليزي سطراً واحداً: الكانفس يرسم بترتيب ثنائي الاتجاه
    // صحيح، فالشَرطة بينهما تستقر في موضعها -- وهو ما تعذّر في وضع النص.
    // الكمية ملتصقة بالاسم: "2x سبانيش لاتيه". عمودٌ مستقل كان يفصل
    // الرقم عن الصنف الذي يعدّه بعرض الورقة، فتقفز العين بينهما.
    const shownName = it.qty + 'x ' + (it.nameEn ? (it.name + ' | ' + it.nameEn) : it.name);
    // النقاط الموصِلة: الاسم وسعره على سطر واحد تصلهما نقاط. يوفّر سطراً
    // لكل صنف، ويعطي مظهر التذاكر القديمة.
    if(th.itemStyle === 'leaders'){
      leaderRow(shownName, it.lineTotal.toFixed(2) + ' ' + RIYAL, sz(17), true);
      (it.mods || []).forEach(m=> rowText('', '— ' + m, sz(14), false));
      if(it.note) rowText('', 'ملاحظات: ' + it.note, sz(14), false);
      if(idx < receipt.items.length - 1) hairline();
      return;
    }
    wrapLine(shownName, nameFont).forEach(line=>{
      ctx.font = nameFont;
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillText(line, width - pad, y);
      y += gap(0.85);
    });
    const modFont = '500 ' + sz(15) + 'px "IBM Plex Sans Arabic", sans-serif';
    (it.mods || []).forEach(modText=>{
      wrapLine(modText, modFont).forEach(line=>{
        ctx.fillStyle = '#333';
        ctx.font = modFont;
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad, y);
        ctx.fillStyle = '#000';
        y += gap(0.7);
      });
    });
    // الملاحظة تُطبع للزبون أيضاً الآن، بطلب صاحب المطعم -- كانت للمطبخ
    // وحده، فكان الزبون لا يرى ما طلبه بنفسه.
    if(it.note){
      const noteFont = '500 ' + sz(15) + 'px "IBM Plex Sans Arabic", sans-serif';
      wrapLine('ملاحظات: ' + it.note, noteFont).forEach(line=>{
        ctx.fillStyle = '#333'; ctx.font = noteFont;
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad, y);
        ctx.fillStyle = '#000';
        y += gap(0.7);
      });
    }
    // سعر الوحدة سطر مستقل فقط حين تتعدد الكمية.
    //
    // عند الكمية واحد كان يطبع "1 × 12.00" بجانب "12.00" -- الرقم نفسه
    // مرتين في سطرين، وهو ما يجعل القارئ يتوقف ليتأكد أنه لم يُحاسَب
    // مرتين. الضرب لا يقول شيئاً حين يكون في واحد.
    if(it.qty > 1) rowText('', it.qty + ' × ' + it.unitPrice.toFixed(2) + ' ' + RIYAL, sz(15), false);
    rowText(it.lineTotal.toFixed(2) + ' ' + RIYAL, '', sz(18), false);
    // Skipped after the last item — the section rule below already closes
    // the list, and two lines together would read as a mistake.
    //
    // Not a theme option any more. Once an item can carry modifiers, a
    // line like "بدون سكر" is indistinguishable from a product priced at
    // nothing, so where one item ends is a guess — and a guess is not
    // something a theme gets to switch off.
    if(idx < receipt.items.length - 1) hairline();
  });
  // ملاحظة الزبون على الطلب كله: أسفل الأصناف وقبل الأرقام. ليست ملاحظة
  // صنف فتُكتب تحته، ولا سطر حساب فتُكتب بين المبالغ.
  if(receipt.orderNote){
    y += gap(0.25);
    wrapLine('ملاحظات الطلب: ' + receipt.orderNote, '600 ' + sz(15) + 'px "IBM Plex Sans Arabic", sans-serif')
      .forEach(line=> rowText('', line, sz(15), false));
    y += gap(0.1);
  }
  divider();
  if(th.sectionLabels) spacedText(bi('الحساب', 'PAYMENT'), sz(11), false);
  rowText(receipt.subtotal.toFixed(2) + ' ' + RIYAL, bi('المجموع الفرعي', 'Subtotal'), sz(18), false);
  if(receipt.discount > 0) rowText('-' + receipt.discount.toFixed(2) + ' ' + RIYAL, bi('الخصم', 'Discount'), sz(18), false);
  // ZATCA: the VAT amount is a mandatory line, in every theme.
  rowText(receipt.vat.toFixed(2) + ' ' + RIYAL, bi('ضريبة القيمة المضافة', 'VAT'), sz(18), false);
  const totalTop = y - lineH * 0.55;
  // بالحروف لا برمز الريال: الرمز الجديد ليس في خط الطابعة، فيخرج
  // فراغاً أو مربعاً، ومبلغ بلا عملة أوضح من مبلغ بعملة مشوّهة.
  const tStyle = th.totalStyle || 'bold';
  if(tStyle === 'invert'){
    invertBar(bi('الإجمالي', 'Total') + '   ' + receipt.total.toFixed(2) + ' ' + RIYAL, sz(21));
  } else if(tStyle === 'box'){
    const tTop = y - lineH * 0.55;
    rowText(receipt.total.toFixed(2) + ' ' + RIYAL, bi('الإجمالي', 'Total'), sz(22), true);
    const tH = (y - lineH * 0.2) - tTop;
    ctx.fillStyle = '#000';
    ctx.fillRect(pad * 0.6, tTop, width - pad * 1.2, 1.5);
    ctx.fillRect(pad * 0.6, tTop + tH - 1.5, width - pad * 1.2, 1.5);
    ctx.fillRect(pad * 0.6, tTop, 1.5, tH);
    ctx.fillRect(width - pad * 0.6 - 1.5, tTop, 1.5, tH);
    y += gap(0.3);
  } else {
    rowText(receipt.total.toFixed(2) + ' ' + RIYAL, bi('الإجمالي', 'Total'), tStyle === 'plain' ? sz(19) : sz(24), true);
  }
  if(th.boxedTotal){
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.strokeRect(pad * 0.6, totalTop, width - pad * 1.2, y - totalTop - lineH * 0.15);
    ctx.lineWidth = 1;
    y += gap(0.35);
  }
  divider();
  rowText('', receipt.paymentMethodLabel, 17, false);
  if(receipt.change > 0) rowText(receipt.change.toFixed(2), 'الباقي', 17, false);
  if(qrImage){
    y += lineH * 0.5;
    // Centered, deliberately — x = (width - qrSize) / 2 lands it dead-center
    // on the paper regardless of width, never pinned to either edge.
    ctx.drawImage(qrImage, (width - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + lineH * 0.3;
  }
  y += lineH * 0.4;
  // كل سطر يكتبه صاحب المطعم يطبع سطراً: "مدة الجلوس ٦٠ دقيقة" و"شكراً
  // لزيارتكم" جملتان، ودمجهما في فقرة واحدة يطمس الأولى.
  (receipt.customMessage || 'شكراً لزيارتكم').split(/\r?\n/)
    .map(l=>l.trim()).filter(Boolean)
    .forEach(part => wrapLine(part, '600 18px "IBM Plex Sans Arabic", sans-serif')
      .forEach(line=> centerText(line, 18, false)));
  y += pad;

  const finalHeight = Math.min(Math.ceil(y), maxHeight);
  const out = document.createElement('canvas');
  out.width = width; out.height = finalHeight;
  out.getContext('2d').drawImage(scratch, 0, 0, width, finalHeight, 0, 0, width, finalHeight);
  return out;
}

/* ============ Kitchen ticket — items only, no prices/VAT/payment ============
   A completely separate print target from the customer receipt: bigger
   fonts (read fast, often under pressure), qty+name+modifiers+the cashier's
   free-text note per line (state.cart's item.note — e.g. "بدون بصل، إضافي
   صوص" — which the customer receipt never printed either), nothing about
   money. Independently toggleable in POS settings from the customer
   receipt, since some kitchens want both printed, some just one. */
function renderKitchenTicketCanvas(receipt, logoImage){
  const width = DEVICE.printerPaperWidth || 576;
  const pad = 16, lineH = 36;
  const maxHeight = 1200 + receipt.items.length * 260;
  const scratch = document.createElement('canvas');
  scratch.width = width; scratch.height = maxHeight;
  const ctx = scratch.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, maxHeight);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let y = pad + lineH / 2;

  const contentWidth = width - pad * 2;
  const wrapLine = (text, font)=>{
    ctx.font = font;
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w=>{
      const test = cur ? cur + ' ' + w : w;
      if(ctx.measureText(test).width > contentWidth && cur){ lines.push(cur); cur = w; }
      else cur = test;
    });
    if(cur) lines.push(cur);
    return lines;
  };
  const centerText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    y += lineH * (size > 22 ? 1.3 : 1);
  };
  const divider = ()=>{
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    y += lineH * 0.6;
  };

  // الشعار يتصدّرها، و"KITCHEN RECEIPT" تحته بدل كلمة "طلب مطبخ".
  if(logoImage){
    const lw = Math.round(width * 0.34);
    const lr = (logoImage.naturalHeight || logoImage.height) / (logoImage.naturalWidth || logoImage.width);
    const lh = Math.round(lw * lr);
    ctx.drawImage(logoImage, (width - lw) / 2, y, lw, lh);
    y += lh + lineH * 0.35;
  }
  centerText('KITCHEN RECEIPT', logoImage ? 24 : 32, true);
  if(receipt.branchName) centerText(receipt.branchName, 18, false);
  centerText(receipt.dateLabel, 16, false);
  centerText(receipt.metaLabel, 20, true);
  // الرقم الذي يُنادى به: جهاز النداء إن وُجد، وإلا رقم الطلب. ولا
  // يجتمعان -- رقمان كبيران متجاوران يجعلان من يقرأهما عبر مطبخ حار
  // يتردد أيّهما ينادي.
  y += lineH * 0.2;
  if(receipt.pagerNumber != null){
    centerText('جهاز النداء · Pager', 16, false);
    centerText(String(receipt.pagerNumber), 44, true);
  } else {
    centerText('رقم الطلب · Order No', 16, false);
    centerText(receipt.orderNumber || '—', 40, true);
  }
  divider();

  receipt.items.forEach(it=>{
    const kName = it.nameEn ? (it.name + ' | ' + it.nameEn) : it.name;
    wrapLine(it.qty + 'x ' + kName, '800 26px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
      ctx.font = '800 26px "IBM Plex Sans Arabic", sans-serif';
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillText(line, width - pad, y);
      y += lineH * 0.9;
    });
    (it.mods || []).forEach(modText=>{
      wrapLine('— ' + modText, '600 18px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
        ctx.font = '600 18px "IBM Plex Sans Arabic", sans-serif';
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad - 14, y);
        y += lineH * 0.7;
      });
    });
    if(it.note){
      // بلا إيموجي: محرف يحتاج خطاً ملوّناً لا تحمله الطابعة، فيخرج مربعاً.
      wrapLine('ملاحظات: ' + it.note, '700 18px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
        ctx.font = '700 18px "IBM Plex Sans Arabic", sans-serif';
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad - 14, y);
        y += lineH * 0.7;
      });
    }
    y += lineH * 0.3;
  });
  divider();
  y += lineH * 0.15;

  if(receipt.cashierName) centerText('طبعها · By: ' + receipt.cashierName, 16, false);

  // بالعافية عليكم، وقلب مرسوم بجانبها.
  //
  // مرسوم لا مكتوب: الإيموجي محرف يحتاج خطاً ملوّناً لا تحمله طابعة
  // حرارية، فيخرج مربعاً فارغاً. ومنحنيان يُطبعان على أي جهاز لأنهما
  // نقاط لا حروف.
  y += lineH * 0.35;
  const blessing = 'بالعافية عليكم';
  const bSize = 22, heart = bSize * 0.72, gapx = bSize * 0.42;
  ctx.font = '800 ' + bSize + 'px "IBM Plex Sans Arabic", sans-serif';
  const bw = ctx.measureText(blessing).width;
  const startX = (width - (bw + gapx + heart)) / 2;
  ctx.direction = 'rtl'; ctx.textAlign = 'right';
  ctx.fillText(blessing, startX + heart + gapx + bw, y);
  (function(cx, cy, sz){
    const w = sz, h = sz * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx, cy + h * 0.42);
    ctx.bezierCurveTo(cx - w * 0.62, cy - h * 0.05, cx - w * 0.30, cy - h * 0.62, cx, cy - h * 0.18);
    ctx.bezierCurveTo(cx + w * 0.30, cy - h * 0.62, cx + w * 0.62, cy - h * 0.05, cx, cy + h * 0.42);
    ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();
  })(startX + heart / 2, y, heart);
  y += lineH * 0.9 + pad;

  const finalHeight = Math.min(Math.ceil(y), maxHeight);
  const out = document.createElement('canvas');
  out.width = width; out.height = finalHeight;
  out.getContext('2d').drawImage(scratch, 0, 0, width, finalHeight, 0, 0, width, finalHeight);
  return out;
}

function canvasToEscPosRaster(canvas){
  const w = canvas.width, h = canvas.height;
  const imgData = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const bytesPerRow = Math.ceil(w / 8);
  const raster = new Uint8Array(bytesPerRow * h);
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const idx = (y * w + x) * 4;
      const luminance = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;
      if(imgData[idx + 3] > 10 && luminance < 160){
        raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }
  const header = new Uint8Array([0x1D, 0x76, 0x30, 0x00, bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF, h & 0xFF, (h >> 8) & 0xFF]);
  const out = new Uint8Array(header.length + raster.length);
  out.set(header, 0);
  out.set(raster, header.length);
  return out;
}

function buildReceiptEscPosBytes(receipt, qrImage, logoImage){
  const image = canvasToEscPosRaster(renderReceiptCanvas(receipt, qrImage, logoImage));
  const init = new Uint8Array([0x1B, 0x40]); // ESC @ — initialize printer
  const feedCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]); // feed 3 lines + full cut
  const out = new Uint8Array(init.length + image.length + feedCut.length);
  out.set(init, 0);
  out.set(image, init.length);
  out.set(feedCut, init.length + image.length);
  return out;
}

function buildKitchenTicketEscPosBytes(receipt, logoImage){
  const image = canvasToEscPosRaster(renderKitchenTicketCanvas(receipt, logoImage));
  const init = new Uint8Array([0x1B, 0x40]);
  const feedCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]);
  const out = new Uint8Array(init.length + image.length + feedCut.length);
  out.set(init, 0);
  out.set(image, init.length);
  out.set(feedCut, init.length + image.length);
  return out;
}

/* ============ ZATCA Simplified Tax Invoice QR (Phase 1) ============
   Base64-encoded TLV (Tag-Length-Value): 5 mandatory fields — seller name,
   VAT registration number, invoice timestamp, invoice total (incl. VAT),
   VAT amount. Every field is a real thing a ZATCA-compliant scanner reads
   off the printed receipt; this is not decorative. Skipped entirely (no
   QR drawn) when the owner hasn't set a VAT number yet — a QR encoding an
   empty VAT number would be actively wrong, not just incomplete. */
function zatcaQrBase64(sellerName, vatNumber, timestampISO, totalWithVat, vatAmount){
  const enc = new TextEncoder();
  const tlv = (tag, value)=>{
    const bytes = enc.encode(String(value));
    const out = new Uint8Array(2 + bytes.length);
    out[0] = tag; out[1] = bytes.length; out.set(bytes, 2);
    return out;
  };
  const fields = [
    tlv(1, sellerName), tlv(2, vatNumber), tlv(3, timestampISO), tlv(4, totalWithVat), tlv(5, vatAmount)
  ];
  const totalLen = fields.reduce((s,f)=>s+f.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  fields.forEach(f=>{ combined.set(f, offset); offset += f.length; });
  let binary = '';
  combined.forEach(b=> binary += String.fromCharCode(b));
  return btoa(binary);
}

// Fetches the same /api/qr SVG endpoint the loyalty card already uses (real
// dep, same-origin, no third-party QR service) and loads it as a drawable
// Image. Returns null (never throws) on any failure — a receipt must still
// print without its QR rather than fail outright over a network hiccup.
async function loadZatcaQrImage(receipt){
  if(!receipt.vatNumber) return null;
  try {
    const payload = zatcaQrBase64(receipt.businessName || '', receipt.vatNumber, receipt.timestampISO, receipt.total.toFixed(2), receipt.vat.toFixed(2));
    const resp = await fetch('/api/qr?data=' + encodeURIComponent(payload));
    if(!resp.ok) return null;
    const svgText = await resp.text();
    // Was a blob: object URL — silently blocked by this site's own CSP
    // (img-src 'self' data: https:, no blob:), so every single receipt for
    // every VAT-registered business was printing/showing with NO ZATCA QR at
    // all (caught by the catch below, which exists for genuine network
    // failures, not this). A data: URI carries the same SVG bytes and is
    // already allowed by that policy — same image, zero CSP dependency.
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    const img = new Image();
    await new Promise((resolve, reject)=>{ img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    return img;
  } catch (e) { return null; }
}

// Same "never throw, just skip" contract as loadZatcaQrImage — a missing/
// slow logo must never be the reason a receipt fails to print. crossOrigin
// is required here (unlike the QR, which is same-origin) since the logo
// comes from Supabase Storage's public bucket; without it, drawing the
// image onto the canvas would taint it and getImageData() (used later to
// build the ESC/POS raster) would throw a SecurityError.
async function loadLogoImage(url){
  if(!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject)=>{ img.onload = resolve; img.onerror = reject; img.src = url; });
    return img;
  } catch (e) { return null; }
}

function bytesToBase64(bytes){
  let binary = '';
  const chunk = 0x8000;
  for(let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

let printCallbackCounter = 0;
const printCallbacks = {};
window.__androidPrintCallback = function(id, result){
  const cb = printCallbacks[id];
  if(cb){ delete printCallbacks[id]; cb(result); }
};

// ip/port let a caller target a SPECIFIC printer (e.g. the kitchen ticket's
// own printer, DEVICE.kitchenPrinterIp) instead of the default one — falls
// back to DEVICE.printerIp/printerPort when omitted, so anything that
// doesn't care which printer (a plain reprint, the shift report) keeps
// working exactly as before.
/**
 * الطابعة المشغولة تُنتظر، لا تُسلَّم للطابور.
 *
 * الطلب الواحد يُنتج ورقتين تخرجان من طابعة واحدة، وطابعة الشبكة تقبل
 * اتصالاً واحداً في اللحظة وترفض الثاني ما دامت تطبع. فالثانية -- تذكرة
 * المطبخ -- تُرفض دائماً، وكانت تنتظر دورة الطابور التالية.
 *
 * والانتظار متدرّج لا ثابت: مدة انشغال الطابعة تتبع طول الورقة قبلها،
 * ورقمٌ ثابت إمّا أن يقصر فيخفق أو يطول فيؤخّر كل ورقة بلا سبب.
 *
 * ولا يُعاد إلا الرفض والمهلة: جسرٌ غائب أو طابعة غير مضبوطة لا يصلحهما
 * تكرار المحاولة، وإعادتهما تؤخّر ظهور الخطأ الحقيقي للكاشير.
 */
const PRINT_BUSY_RETRY_MS = [400, 900, 1600];
async function sendBytesToPrinter(bytes, ip, port){
  let result = await sendBytesOnce(bytes, ip, port);
  for(let i = 0; !result.ok && (result.error === 'timeout' || result.error === 'connection_refused') && i < PRINT_BUSY_RETRY_MS.length; i++){
    await new Promise(r=> setTimeout(r, PRINT_BUSY_RETRY_MS[i]));
    result = await sendBytesOnce(bytes, ip, port);
  }
  return result;
}

function sendBytesOnce(bytes, ip, port){
  return new Promise((resolve)=>{
    if(!printerBridgeAvailable()){ resolve({ok:false, error:'bridge_unavailable'}); return; }
    const targetIp = ip || DEVICE.printerIp;
    if(!targetIp){ resolve({ok:false, error:'no_printer_configured'}); return; }
    const base64 = bytesToBase64(bytes);
    const callbackId = 'p' + (++printCallbackCounter);
    printCallbacks[callbackId] = resolve;
    window.AndroidPrint.printRaw(base64, targetIp, port || DEVICE.printerPort || 9100, callbackId);
    setTimeout(()=>{
      if(printCallbacks[callbackId]){ delete printCallbacks[callbackId]; resolve({ok:false, error:'timeout'}); }
    }, 8000);
  });
}

/* ============ Cash Drawer ============
   Matches docs/ios-native-bridge-interfaces.md §2 (window.NativeCashDrawer)
   exactly — nothing implements that interface anywhere yet, same as
   window.AndroidPrint before a real printer bridge exists. This used to be
   a bare `showToast('تم فتح الدرج')` with NO command sent anywhere, to any
   device — claiming success for something that never happened. Per explicit
   instruction not to fake an implementation, this now honestly reports
   "not available yet" instead, exactly like a real, unconfigured printer
   already does elsewhere in this file. */
let drawerCallbackCounter = 0;
const drawerCallbacks = {};
window.__nativeCashDrawerCallback = function(id, result){
  const cb = drawerCallbacks[id];
  if(cb){ delete drawerCallbacks[id]; cb(result); }
};
function cashDrawerBridgeAvailable(){
  return !!(window.NativeCashDrawer && typeof window.NativeCashDrawer.isAvailable === 'function' && window.NativeCashDrawer.isAvailable());
}
function kickCashDrawer(ip, port){
  return new Promise((resolve)=>{
    if(!cashDrawerBridgeAvailable()){ resolve({ok:false, error:'bridge_unavailable'}); return; }
    const targetIp = ip || DEVICE.printerIp; // most real setups: drawer wired through the receipt printer's own RJ11 port
    if(!targetIp){ resolve({ok:false, error:'no_printer_configured'}); return; }
    const callbackId = 'd' + (++drawerCallbackCounter);
    drawerCallbacks[callbackId] = resolve;
    window.NativeCashDrawer.kick(targetIp, port || DEVICE.printerPort || 9100, callbackId);
    setTimeout(()=>{
      if(drawerCallbacks[callbackId]){ delete drawerCallbacks[callbackId]; resolve({ok:false, error:'timeout'}); }
    }, 8000);
  });
}
async function openCashDrawer(){
  const result = await kickCashDrawer();
  if(result.ok) showToast('تم فتح الدرج');
  else if(result.error === 'bridge_unavailable') showToast('⚠ فتح الدرج غير متاح بعد — يحتاج تطبيق iOS أصلي');
  else if(result.error === 'no_printer_configured') showToast('⚠ اضبط عنوان IP للطابعة أولًا من الإعدادات');
  else showToast('⚠ تعذّر فتح الدرج — تحقق من الاتصال');
}

async function sendKitchenTicketToPrinter(receipt){
  // الشعار لا يمنع الطباعة: تذكرة بلا شعار تذكرة، وتذكرة لم تُطبع لأن
  // مضيف الصور بطيء هي طلب ضاع في المطبخ.
  const logoImage = await loadLogoImage(receipt.logoUrl);
  let bytes;
  try { bytes = buildKitchenTicketEscPosBytes(receipt, logoImage); }
  catch (e) { return Promise.resolve({ok:false, error:'render_failed'}); }
  // A separate physical printer for the kitchen (e.g. downstairs) is
  // optional — falls back to the main counter printer when not set, so a
  // one-printer restaurant needs no extra configuration at all.
  return sendBytesToPrinter(bytes, DEVICE.kitchenPrinterIp || null, DEVICE.kitchenPrinterPort || null);
}

async function sendToPrinter(receipt){
  let bytes;
  try {
    const [qrImage, logoImage] = await Promise.all([
      loadZatcaQrImage(receipt),
      receipt.showLogo ? loadLogoImage(receipt.logoUrl) : Promise.resolve(null)
    ]);
    bytes = buildReceiptEscPosBytes(receipt, qrImage, logoImage);
  } catch (e) { return {ok:false, error:'render_failed'}; }
  return sendBytesToPrinter(bytes);
}

/* ============ Print Queue ============
   Every print (customer receipt, kitchen ticket, reprint) goes through this
   instead of calling sendToPrinter/sendKitchenTicketToPrinter directly. Each
   job is a plain, IndexedDB-serializable record — receiptData/kitchen
   receipt objects are already pure data (images are loaded fresh inside
   sendToPrinter itself, never stored), so a job survives an app close/
   device restart exactly like a queued order does (same rakeen_pos DB,
   see the offline order queue above).

   Job lifecycle: queued -> printing -> one of:
     printed              — a real printer accepted the bytes
     skipped_no_printer    — no printer bridge/IP configured on this device at
                             all (today, ALWAYS this — no native printer
                             bridge exists yet); nothing to retry against, so
                             this is a terminal, non-error state, not a
                             failure. Matches the pre-queue UX exactly (a
                             cashier with no printer configured always saw
                             "تمت الطباعة", never an error).
     retrying              — a real printer was targeted but the attempt
                             failed (timeout/busy/disconnected) — will retry
                             with backoff, up to PRINT_MAX_RETRIES
     failed                — retries exhausted; needs a manual retry tap
   A failed/stuck job is processed independently of every other queued job —
   processPrintQueue() always continues to the next job on any outcome,
   never stops the pass early. */
const PRINT_STORE = 'print_jobs';
const PRINT_MAX_RETRIES = 5;
const PRINT_MAX_BACKOFF_MS = 2 * 60 * 1000;
const PRINT_DEDUPE_WINDOW_MS = 10000; // catches a double-tapped print button; a genuine reprint later still creates a new job

function simpleHash(str){
  let h = 0;
  for(let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(36);
}
async function putPrintJob(job){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(PRINT_STORE, 'readwrite');
    tx.objectStore(PRINT_STORE).put(job);
    tx.oncomplete = ()=> resolve(job); tx.onerror = ()=> reject(tx.error);
  });
}
async function getAllPrintJobs(){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(PRINT_STORE, 'readonly');
    const req = tx.objectStore(PRINT_STORE).getAll();
    req.onsuccess = ()=> resolve(req.result || []);
    req.onerror = ()=> reject(req.error);
  });
}

const printJobListeners = {};
function notifyPrintJobUpdate(job){
  const fns = printJobListeners[job.id];
  if(fns) fns.slice().forEach(fn=>fn(job));
}
// One-shot subscription — callers that only care about the next update
// (the print-status row, awaitPrintJobFirstAttempt below) don't need to
// manage their own unsubscribe.
function onPrintJobUpdate(jobId, fn){
  (printJobListeners[jobId] ||= []).push(fn);
}

const PRINT_TERMINAL_STATUSES = ['printed', 'skipped_no_printer', 'failed'];
// Resolves once a job's FIRST attempt has an outcome (success, no-printer-
// skip, or scheduled-for-retry/failed) — NOT once every retry is exhausted.
// acceptIncomingOrder's "kitchen ticket dispatched before the receipt
// starts" ordering rule only needs the first attempt to have happened; full
// retry backoff can run up to 2 minutes per job, and blocking that flow
// (the cashier is actively waiting on it) for anywhere near that long over
// a printer that isn't even there yet would be worse than the ordering
// guarantee is worth.
function awaitPrintJobFirstAttempt(job){
  if(job.status !== 'queued' && job.status !== 'printing') return Promise.resolve(job);
  return new Promise(resolve=>{
    onPrintJobUpdate(job.id, (j)=>{ if(j.status !== 'queued' && j.status !== 'printing') resolve(j); });
  });
}
// Resolves once a job reaches a genuinely final state (including after
// retries) — for one-off UI feedback (a toast) where showing the eventual
// real outcome matters more than responding instantly, unlike the ordering
// guarantee above.
function awaitPrintJobSettled(job){
  if(PRINT_TERMINAL_STATUSES.includes(job.status)) return Promise.resolve(job);
  return new Promise(resolve=>{
    onPrintJobUpdate(job.id, (j)=>{ if(PRINT_TERMINAL_STATUSES.includes(j.status)) resolve(j); });
  });
}

// Keyed by content_key, holding the currently-active job (if any) for that
// exact receipt content. Checked and set SYNCHRONOUSLY (no `await` before
// either) so a print button double/triple-tapped in the same tick can't
// race past an async IndexedDB read the way the original version did — that
// version read getAllPrintJobs() before any of the near-simultaneous calls
// had written their own job yet, so none of them saw the others, and 3
// rapid taps produced 3 separate jobs (reproduced directly while testing:
// content_key matched across all 3, created_at identical to the millisecond,
// none deduped). Entries are removed the moment a job reaches a terminal
// state (see processPrintQueue) so a genuine reprint afterward isn't blocked.
const activePrintJobByContentKey = new Map();

async function enqueuePrintJob(type, receipt){
  const contentKey = type + ':' + simpleHash(JSON.stringify(receipt));
  const now = Date.now();
  const active = activePrintJobByContentKey.get(contentKey);
  if(active && (now - active.created_at) < PRINT_DEDUPE_WINDOW_MS) return active;
  const job = {
    id: (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2))),
    type, receipt, content_key: contentKey,
    status: 'queued', retry_count: 0, next_retry_at: 0, last_error: null, created_at: now
  };
  activePrintJobByContentKey.set(contentKey, job); // synchronous — closes the race before any await below
  try { await putPrintJob(job); } catch (e) { /* IndexedDB unavailable — job only lives in-memory for this attempt, matches pre-queue behavior */ }
  processPrintQueue(); // fire-and-forget — caller awaits the job's own status via onPrintJobUpdate/awaitPrintJobFirstAttempt instead
  return job;
}

function sendPrintJobPayload(job){
  return job.type === 'kitchen' ? sendKitchenTicketToPrinter(job.receipt) : sendToPrinter(job.receipt);
}

// Only clears activePrintJobByContentKey's entry if it still points at THIS
// job id — a newer job (a genuine reprint created after this one already
// went terminal, reusing the same content_key) must not have its own,
// still-active entry wiped out by a late-resolving older job.
function clearActiveIfCurrent(job){
  const cur = activePrintJobByContentKey.get(job.content_key);
  if(cur && cur.id === job.id) activePrintJobByContentKey.delete(job.content_key);
}

let printQueueProcessing = false;
async function processPrintQueue(){
  if(printQueueProcessing) return;
  printQueueProcessing = true;
  try {
    const jobs = await getAllPrintJobs();
    const now = Date.now();
    for(const job of jobs){
      if(job.status !== 'queued' && job.status !== 'retrying') continue;
      if(job.next_retry_at && job.next_retry_at > now) continue; // still backing off
      job.status = 'printing';
      try { await putPrintJob(job); } catch (e) {}
      notifyPrintJobUpdate(job);
      let result;
      try { result = await sendPrintJobPayload(job); }
      catch (e) { result = { ok: false, error: (e && e.message) || String(e) }; }
      if(result.ok){
        job.status = 'printed';
      } else if(result.error === 'bridge_unavailable' || result.error === 'no_printer_configured'){
        job.status = 'skipped_no_printer';
      } else {
        job.retry_count += 1;
        job.last_error = result.error || 'unknown_error';
        if(job.retry_count >= PRINT_MAX_RETRIES){
          job.status = 'failed';
        } else {
          job.status = 'retrying';
          job.next_retry_at = now + Math.min(2000 * Math.pow(2, job.retry_count), PRINT_MAX_BACKOFF_MS);
        }
      }
      try { await putPrintJob(job); } catch (e) {}
      if(PRINT_TERMINAL_STATUSES.includes(job.status)) clearActiveIfCurrent(job);
      notifyPrintJobUpdate(job);
      // Deliberately no `break`/`continue`-skipping logic beyond the status
      // checks above — one job's failure never stops the loop from reaching
      // the rest of the queue.
    }
  } catch (e) { /* IndexedDB unavailable — nothing to process */ }
  printQueueProcessing = false;
}
window.addEventListener('online', processPrintQueue);
setInterval(processPrintQueue, 20000);
// Anything left mid-flight from before a crash/close is still 'printing' in
// storage — nothing will ever flip it, so it'd sit there forever looking
// active. Treat it as interrupted and let the normal retry/backoff path
// pick it back up on this fresh boot instead. Deliberately does NOT call
// processPrintQueue() itself here: this runs at script parse time, well
// before loadDeviceConfig() populates DEVICE (that's near the bottom of
// this file, in the Init section) — processing this early would read
// DEVICE.printerIp as empty and wrongly mark a job "no printer configured"
// even when one genuinely is, just because it hasn't loaded yet. The 20s
// interval / next 'online' event / next real print all fire well after
// DEVICE is ready and will pick these back up correctly.
(async function resetInterruptedPrintJobsOnBoot(){
  try {
    const jobs = await getAllPrintJobs();
    for(const job of jobs){
      if(job.status === 'printing'){ job.status = 'queued'; await putPrintJob(job); }
    }
  } catch (e) { /* IndexedDB unavailable — nothing to recover */ }
})();

function buildLiveReceiptData(orderPayload, totals){
  // Closing out an already-registered tab (state.resumingOrder) has no cart
  // — the real line items were fetched from order_items when the payment
  // step opened (see openResumePaymentStep) and stashed there.
  const items = (state.resumingOrder && state.resumingOrder.items) ? state.resumingOrder.items : state.cart.map(item=>{
    const p = PRODUCTS.find(x=>x.id===item.productId);
    const unitPrice = lineUnitPrice(item);
    return {
      name: p ? p.name : '', nameEn: p ? (p.name_en || '') : '',
      qty: item.qty, unitPrice, lineTotal: unitPrice * item.qty,
      mods: formatConfigLabels(item.productId, item.config).map(l=>l.text),
      // الملاحظة صارت تُطبع للزبون أيضاً، بطلب صاحب المطعم -- كانت
      // تُمرَّر لتذكرة المطبخ وحدها.
      note: item.note || ''
    };
  });
  const liveTable = orderPayload.table_id ? (TABLES_CACHE || []).find(t => t.id === orderPayload.table_id) : null;
  const liveTableLabel = liveTable ? ' — طاولة ' + liveTable.number : '';
  return {
    businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
    dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    timestampISO: new Date().toISOString(), vatNumber: BUSINESS_VAT_NUMBER,
    // orderId can genuinely be missing here — still offline-queued, real id
    // not assigned by the server yet. Printing nothing would leave the
    // customer with zero way to reference this order; say so honestly
    // instead of silently dropping the line.
    orderNumber: orderPayload.orderId ? ('#' + orderPayload.orderId) : 'سيُحدَّد عند الاتصال',
    metaLabel: bilingualOrderKind((CHANNEL_LABELS[orderPayload.channel] || orderPayload.channel) + liveTableLabel),
    showLogo: DEVICE.printReceiptLogo !== false && !!RECEIPT_LOGO_URL, logoUrl: RECEIPT_LOGO_URL,
    cashierName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : '',
    tagline: RECEIPT_TAGLINE,
    showBusinessName: RECEIPT_SHOW_NAME,
    locationLine: BRANCH_LOCATION_LINE,
    branchLabel: BRANCH_RECEIPT_LABEL,
    customMessage: RECEIPT_CUSTOM_MESSAGE,
    items, subtotal: totals.subtotal, discount: totals.discount, vat: totals.vat, total: totals.total,
    paymentMethodLabel: PAYMENT_METHOD_LABELS_POS[orderPayload.payment_method] || orderPayload.payment_method,
    change: orderPayload.payment_method === 'cash' ? Math.max(0, (state.cashAmount || 0) - totals.total) : 0
  };
}

// Mirrors buildLiveReceiptData's item mapping but adds the cashier's free-text
// note per line — never printed on the priced customer receipt, but exactly
// what the kitchen needs ("بدون بصل، إضافي صوص") and money never belongs here.
function buildKitchenReceiptData(orderPayload){
  const items = state.cart.map(item=>{
    const p = PRODUCTS.find(x=>x.id===item.productId);
    return {
      name: p ? p.name : '', nameEn: p ? (p.name_en || '') : '',
      qty: item.qty, note: item.note || '',
      mods: formatConfigLabels(item.productId, item.config).map(l=>l.text)
    };
  });
  const tableLabel = orderPayload.tableNumber ? ' — طاولة ' + orderPayload.tableNumber : '';
  return {
    branchName: DEVICE.branchName || '',
    logoUrl: RECEIPT_LOGO_URL,
    cashierName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : '',
    dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    // رقم الطلب سطر قائم بذاته الآن، فلا يُطوى هنا داخل نص النوع.
    orderNumber: orderPayload.orderId ? '#' + orderPayload.orderId : '—',
    metaLabel: bilingualOrderKind((CHANNEL_LABELS[orderPayload.channel] || orderPayload.channel) + tableLabel),
    items,
    // Printed larger than anything else on the ticket: whoever finishes the
    // order reads it off this paper and types it into the base station, so
    // it has to carry across a hot kitchen at a glance.
    pagerNumber: state.pagerNumber ? parseInt(state.pagerNumber, 10) : null
  };
}

// order.restaurant_tables comes from the join in openOrderDetail's select —
// deliberately not resolved via TABLES_CACHE like the live-receipt version,
// since a reprint can happen for an old order before the cashier has ever
// opened the Tables screen this session (TABLES_CACHE would still be empty).
function buildHistoricalReceiptData(order, items){
  const lineItems = (items || []).map(it=>{
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    return {
      name: product ? product.name : ('منتج #' + it.menu_item_id),
      nameEn: product ? (product.name_en || '') : '',
      qty: it.qty,
      unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total),
      note: it.note || '',
      mods: (it.selected_modifiers || []).map(m=>m.text)
    };
  });
  const histTableLabel = order.restaurant_tables ? ' — طاولة ' + order.restaurant_tables.number : '';
  return {
    businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
    dateLabel: new Date(order.created_at).toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    timestampISO: order.created_at, vatNumber: BUSINESS_VAT_NUMBER,
    orderNumber: '#' + order.id,
    metaLabel: bilingualOrderKind((CHANNEL_LABELS[order.channel] || order.channel) + histTableLabel),
    // صاحب الطلب وملاحظته: الطلب الإلكتروني والتوصيل تكون الورقة فيهما
    // الشيء الوحيد الذي يربط الكيس بصاحبه.
    customerName: order.customer_name || '',
    customerPhone: order.customer_phone || '',
    orderNote: order.online_customer_note || '',
    showLogo: DEVICE.printReceiptLogo !== false && !!RECEIPT_LOGO_URL, logoUrl: RECEIPT_LOGO_URL,
    cashierName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : '',
    tagline: RECEIPT_TAGLINE,
    showBusinessName: RECEIPT_SHOW_NAME,
    locationLine: BRANCH_LOCATION_LINE,
    branchLabel: BRANCH_RECEIPT_LABEL,
    customMessage: RECEIPT_CUSTOM_MESSAGE,
    items: lineItems, subtotal: Number(order.subtotal), discount: Number(order.discount_amount || 0),
    vat: Number(order.vat_amount), total: Number(order.total),
    paymentMethodLabel: PAYMENT_METHOD_LABELS_POS[order.payment_method] || order.payment_method,
    change: 0
  };
}

// Kitchen-ticket equivalent of buildHistoricalReceiptData, for the accept-online-order
// flow — buildKitchenReceiptData above reads the live state.cart, which is wrong here
// (would print whatever's in the cashier's current cart, not the accepted online
// order), so this reads from DB-fetched order_items instead, same source as
// buildHistoricalReceiptData.
function buildDbKitchenReceiptData(order, items){
  const mapped = (items || []).map(it=>{
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    return {
      name: product ? product.name : ('منتج #' + it.menu_item_id),
      nameEn: product ? (product.name_en || '') : '',
      qty: it.qty,
      note: it.note || '',
      mods: (it.selected_modifiers || []).map(m=>m.text)
    };
  });
  return {
    branchName: DEVICE.branchName || '',
    logoUrl: RECEIPT_LOGO_URL,
    cashierName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : '',
    dateLabel: new Date(order.created_at).toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    orderNumber: '#' + order.id,
    metaLabel: bilingualOrderKind(CHANNEL_LABELS[order.channel] || order.channel),
    items: mapped
  };
}

/* ============ End-of-shift reconciliation report — printable ============
   Nothing like this existed before (the closing wizard only ever showed
   these numbers in the modal, once, then discarded them). Reuses the same
   canvas -> 1-bit raster -> ESC/POS pipeline as order receipts, but with its
   own simple row layout since a shift report has no product line items. */
function renderShiftReportCanvas(report){
  const width = DEVICE.printerPaperWidth || 576;
  const pad = 16, lineH = 32;
  const gap = n => lineH * n;
  // التقرير صار أطول بعد إضافة المبيعات والمرتجعات والصندوق والتواقيع،
  // والسطح المقصوص على ١٤٠٠ كان سيبتر آخره بلا خطأ يُرى.
  const MAXH = 2200;
  const scratch = document.createElement('canvas');
  scratch.width = width; scratch.height = MAXH;
  const ctx = scratch.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, MAXH);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let y = pad + lineH / 2;

  const centerText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    y += lineH * (size > 22 ? 1.3 : 1);
  };
  const rowText = (leftMono, rightArabic, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(rightArabic, width - pad, y);
    ctx.font = '500 ' + size + 'px "IBM Plex Mono", monospace';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillText(leftMono, pad, y);
    y += lineH;
  };
  const divider = ()=>{
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    y += lineH * 0.6;
  };

  // ترتيب التقرير من مراجع التسوية المحاسبية، لا من عادةٍ عندنا:
  // مبيعات ← طرق دفع ← صندوق ← توقيع. وكل قسم ينتهي بسطر واحد يُنقل
  // إلى الذي بعده، حتى يستطيع من يدقّق أن يتتبّع الرقم بيده.
  const opt = report.options || {};
  const on = k => opt[k] !== false;

  centerText(report.businessName || 'ركين', 30, true);
  if(report.branchName) centerText(report.branchName, 19, false);
  y += gap(0.2);
  centerText('تقرير إغلاق الوردية', 20, true);
  centerText('Shift Close Report', 15, false);
  centerText(report.dateLabel, 16, false);
  divider();
  rowText('', 'الكاشير · Cashier: ' + report.staffName, 17, false);
  if(report.shiftStart) rowText('', 'من · From: ' + report.shiftStart, 16, false);
  divider();

  // ١) المبيعات: من الإجمالي إلى الصافي، خطوةً خطوة.
  centerText('المبيعات · Sales', 16, true);
  rowText(report.grossSales.toFixed(2) + ' ' + RIYAL, 'إجمالي المبيعات · Gross', 18, false);
  if(on('discounts')) rowText('-' + report.discountsTotal.toFixed(2) + ' ' + RIYAL, 'الخصومات · Discounts', 18, false);
  if(on('refunds')) rowText('-' + report.refundsTotal.toFixed(2) + ' ' + RIYAL, 'المرتجعات · Refunds (' + report.refundsCount + ')', 18, false);
  if(on('vat')) rowText(report.vatTotal.toFixed(2) + ' ' + RIYAL, 'ضريبة القيمة المضافة · VAT', 18, false);
  rowText(report.netSales.toFixed(2) + ' ' + RIYAL, 'صافي المبيعات · Net', 20, true);
  divider();

  // ٢) طرق الدفع، مرتّبة بالأهمية لا بالأبجدية.
  centerText('طرق الدفع · Payments', 16, true);
  rowText(report.cashSales.toFixed(2) + ' ' + RIYAL, 'كاش · Cash', 18, false);
  rowText(report.cardTotal.toFixed(2) + ' ' + RIYAL, 'شبكة · Card', 18, false);
  rowText(report.deliveryPlatformTotal.toFixed(2) + ' ' + RIYAL, 'تطبيقات توصيل · Delivery Apps', 18, false);
  // الدفع الإلكتروني لا يظهر إلا لمن فعّله في متجره: صفٌّ بصفر دائماً
  // على مطعم لا يبيع أونلاين ضجيج في ورقة تُدقَّق.
  if(report.onlinePaymentsEnabled) rowText(report.onlineTotal.toFixed(2) + ' ' + RIYAL, 'دفع إلكتروني · Online', 18, false);
  divider();

  // ٣) الصندوق: المعادلة كاملة، فما من رقم يظهر بلا أصل.
  centerText('الصندوق · Cash Drawer', 16, true);
  rowText(report.openingCash.toFixed(2) + ' ' + RIYAL, 'الرصيد الافتتاحي · Opening float', 18, false);
  rowText('+' + report.cashSales.toFixed(2) + ' ' + RIYAL, 'مبيعات الكاش · Cash sales', 18, false);
  // السحب يُذكر ولو كان صفراً حين تُطبع المرتجعات: معادلة الصندوق لا
  // تُقرأ إن غاب أحد طرفيها، ومن يجمع بيده يريد أن يجد كل رقم.
  if(report.refundsTotal > 0) rowText('-' + report.refundsTotal.toFixed(2) + ' ' + RIYAL, 'مرتجعات كاش · Refunds paid', 18, false);
  rowText(report.cashExpected.toFixed(2) + ' ' + RIYAL, 'المتوقع في الدرج · Expected', 18, true);
  rowText(report.cashCounted.toFixed(2) + ' ' + RIYAL, 'المعدود · Counted', 18, false);
  const vTop = y - lineH * 0.55;
  rowText((report.cashVariance >= 0 ? '+' : '') + report.cashVariance.toFixed(2) + ' ' + RIYAL, 'الفرق · Variance', 22, true);
  // الفرق داخل إطار: هو السطر الوحيد الذي يُفتح عليه تحقيق.
  ctx.fillStyle = '#000';
  const vX = pad * 0.6, vW = width - pad * 1.2, vH = (y - lineH * 0.2) - vTop;
  ctx.fillRect(vX, vTop, vW, 1.5);
  ctx.fillRect(vX, vTop + vH - 1.5, vW, 1.5);
  ctx.fillRect(vX, vTop, 1.5, vH);
  ctx.fillRect(vX + vW - 1.5, vTop, 1.5, vH);
  y += gap(0.35);

  if(on('counts')){
    divider();
    rowText(String(report.ordersCount), 'عدد الطلبات · Orders', 17, false);
    rowText(report.avgTicket.toFixed(2) + ' ' + RIYAL, 'متوسط الفاتورة · Avg ticket', 17, false);
  }

  if(on('signatures')){
    divider();
    y += gap(0.5);
    rowText('', 'توقيع الكاشير · Cashier  ______________', 15, false);
    y += gap(0.5);
    rowText('', 'توقيع المدير · Manager   ______________', 15, false);
  }
  y += pad;

  const out = document.createElement('canvas');
  out.width = width; out.height = Math.min(Math.ceil(y), MAXH);
  out.getContext('2d').drawImage(scratch, 0, 0, width, out.height, 0, 0, width, out.height);
  return out;
}
function buildShiftReportEscPosBytes(report){
  const image = canvasToEscPosRaster(renderShiftReportCanvas(report));
  const init = new Uint8Array([0x1B, 0x40]);
  const feedCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]);
  const out = new Uint8Array(init.length + image.length + feedCut.length);
  out.set(init, 0);
  out.set(image, init.length);
  out.set(feedCut, init.length + image.length);
  return out;
}
function sendShiftReportToPrinter(report){
  let bytes;
  try { bytes = buildShiftReportEscPosBytes(report); }
  catch (e) { return Promise.resolve({ok:false, error:'render_failed'}); }
  return sendBytesToPrinter(bytes);
}

function printJobStatusHtml(job){
  if(job.status === 'printed' || job.status === 'skipped_no_printer') return '<span class="print-check">✓</span>تمت الطباعة';
  if(job.status === 'retrying') return '<span class="print-spinner"></span>إعادة محاولة (' + job.retry_count + ')...';
  if(job.status === 'failed') return '<span style="color:var(--danger)">⚠</span>تعذرت الطباعة — <a href="#" class="print-retry-link" data-job-id="' + job.id + '">إعادة المحاولة</a>';
  return '<span class="print-spinner"></span>جاري الطباعة...';
}
// Delegated once (not per-row) — the receipt screen's whole innerHTML gets
// replaced on every checkout, so a listener bound directly to a specific
// row would be gone by the time a failed job's retry link is actually clicked.
document.addEventListener('click', (e)=>{
  const link = e.target.closest('.print-retry-link');
  if(!link) return;
  e.preventDefault();
  retryPrintJob(link.dataset.jobId, link.closest('.print-status-label'));
});
async function retryPrintJob(jobId, labelEl){
  const jobs = await getAllPrintJobs().catch(()=>[]);
  const job = jobs.find(j => j.id === jobId);
  if(!job) return;
  job.status = 'queued'; job.retry_count = 0; job.next_retry_at = 0; job.last_error = null;
  try { await putPrintJob(job); } catch (e) {}
  if(labelEl) labelEl.innerHTML = printJobStatusHtml(job);
  onPrintJobUpdate(job.id, (j)=>{ if(labelEl) labelEl.innerHTML = printJobStatusHtml(j); });
  processPrintQueue();
}
async function attemptPrint(receiptData){
  const row = document.getElementById('printStatusRow');
  const job = await enqueuePrintJob('receipt', receiptData);
  if(!row) return;
  const label = row.querySelector('.print-status-label');
  const render = (j)=>{ if(label) label.innerHTML = printJobStatusHtml(j); };
  render(job);
  onPrintJobUpdate(job.id, render);
}

// Checkout auto-print — respects the two independent POS-settings toggles
// (customer receipt / kitchen ticket, either or both). The customer receipt
// stays the one visible status row (attemptPrint(), unchanged, also reused
// by the manual "إعادة طباعة" button); the kitchen ticket has no dedicated
// UI of its own and just prints silently alongside, same as the loyalty QR/
// push notification above it.
async function autoPrintOnCheckout(orderPayload, receiptData, wasResumingOrder){
  const printCustomer = DEVICE.printCustomerReceipt !== false; // default on
  // Closing out an already-registered dine-in tab (wasResumingOrder) has no
  // new items — the kitchen ticket already went out when the order was
  // registered (see submitTableOrderRegistration), so it never reprints
  // here. Passed in explicitly rather than read live off state.resumingOrder
  // — that flag is already cleared by the time this runs (see completePayment,
  // which resets cart/table state immediately on success, before this call).
  const printKitchen = DEVICE.printKitchenTicket === true && !wasResumingOrder; // default off
  // فاتورة العميل أولاً، ثم المطبخ.
  //
  // الورقتان تخرجان من طابعة واحدة، والثانية تنتظر فراغها من الأولى.
  // ومن يقف عند الكاشير ينتظر ورقته الآن، أما تذكرة المطبخ فتُقرأ بعد
  // دقيقة، فالأسبقية لمن ينتظر.
  if(printCustomer) attemptPrint(receiptData);
  if(printKitchen){
    // 'copy' mode queues a SECOND customer receipt rather than a
    // kitchen-shaped ticket, decided here at enqueue time. A flag inside
    // the renderer would be two code paths that have to be kept looking
    // identical — the exact thing this mode exists to avoid.
    if(KITCHEN_TICKET_MODE === 'copy') enqueuePrintJob('receipt', receiptData);
    else enqueuePrintJob('kitchen', buildKitchenReceiptData(orderPayload));
  }
  if(!printCustomer){
    const row = document.getElementById('printStatusRow');
    if(row) row.style.display = 'none';
  }
}

let activeAutoResetTimer = null;
let loyaltyPollTimer = null;
// Guards against the exact bug a hung device produces: the confirm button
// stayed clickable for the whole submitOrder() await, so a device that lagged
// for even a second let 5 rapid taps fire 5 concurrent completePayment() calls
// — each building its own fresh client_order_uuid, so complete_pos_order's
// existing dedup-by-uuid check (see supabase/migrations/20260808010000)
// couldn't catch any of them, and 5 real duplicate orders got created. Reset
// right after the await, not at the end of the function — that's the actual
// vulnerable window; after it, the DOM below is replaced with the receipt
// screen and confirmPayBtn no longer exists to be re-clicked anyway.
let completingPayment = false;
async function completePayment(){
  if(completingPayment) return;
  completingPayment = true;
  const confirmBtn = document.getElementById('confirmPayBtn');
  if(confirmBtn) confirmBtn.disabled = true;

  // A buzzer number is reused all day, so the same one must never be out
  // with two open orders — buzzing it calls the wrong customer over, and
  // nothing downstream could tell that it happened. The database has a
  // unique index that makes it impossible; this is the check that refuses
  // it while the cashier can still grab a different buzzer, rather than
  // failing after the customer has walked off with it.
  const pagerNum = state.pagerNumber ? parseInt(state.pagerNumber, 10) : null;
  if(pagerNum){
    try {
      const { data: busy } = await window.supabaseClient
        .from('orders').select('id')
        .eq('branch_id', DEVICE.branchId).eq('pager_number', pagerNum)
        .is('delivered_at', null).limit(1);
      if(busy && busy.length){
        const err = document.getElementById('pagerError');
        if(err){ err.textContent = 'جهاز ' + pagerNum + ' مع طلب ثاني الحين — اختر رقم غيره'; err.style.display = 'block'; }
        completingPayment = false;
        if(confirmBtn) confirmBtn.disabled = false;
        return;
      }
    } catch(_){ /* a failed check must not block a sale — the index still guards it */ }
  }

  const {total} = cartTotals();
  const totals = cartTotals();
  const change = state.activePaymentMethod==='cash' ? Math.max(0,(state.cashAmount||0)-total) : 0;
  const customerPhone = state.customer ? state.customer.phone : null;
  const willShowLoyaltyQr = !!customerPhone;
  const orderPayload = await submitOrder(totals);
  completingPayment = false;
  if(pagerNum && orderPayload && orderPayload.orderId){
    window.supabaseClient.rpc('set_order_pager', {
      p_order_id: orderPayload.orderId, p_pager_number: pagerNum
    }).then(({error})=>{ if(error) showToast('انحفظ الطلب، بس ما انسجّل رقم الجهاز'); });
  }
  // Table-order paths (Flow A/D) now go through the same IndexedDB queue as
  // every other channel (see registerTableOrder/submitOrder and
  // migrations/20260831170000's append idempotency, which is what made this
  // safe) — a null orderId here just means "queued, will sync" exactly like
  // a pickup/delivery sale offline, not a failure. Proceed to the normal
  // success receipt in every case.
  if(navigator.onLine) runOwnerNotificationChecks(orderPayload);
  if(orderPayload.channel === 'delivery' && orderPayload.orderId) registerActiveDeliveryOrder(orderPayload.orderId, orderPayload);
  // Hotel checkout hook (roadmap item 7) — startHotelCheckout() loaded the
  // booking's room-type service into this exact cart before sending the
  // cashier here; if that order actually landed (orderId set — offline
  // queueing means it might not have yet, a known MVP limitation), link
  // the booking to it and flip its room to 'cleaning'. No new payment code.
  if(pendingHotelCheckoutBookingId && orderPayload.orderId){
    window.supabaseClient.rpc('finalize_hotel_checkout', { p_booking_id: pendingHotelCheckoutBookingId, p_order_id: orderPayload.orderId })
      .then(({error}) => { if(error) showToast('تنبيه: تعذر ربط الطلب بحجز الفندق — راجع الحجز يدويًا'); })
      .finally(() => { pendingHotelCheckoutBookingId = null; });
  }
  state.lastTransaction = {total, time: new Date().toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})};
  // Snapshot everything the receipt still needs from the live cart/table
  // state, THEN clear that state and re-render the Home screen underneath
  // right now — not deferred to the 4s auto-timer or a "طلب جديد الآن" tap.
  // Previously, closing this modal any other way (✕, back, or just
  // switching screens) skipped that reset entirely, leaving the old
  // items/table badge sitting on Home looking like the order never
  // finished even though it had already been paid.
  const receiptData = buildLiveReceiptData(orderPayload, totals);
  const wasResumingOrder = !!state.resumingOrder;
  state.cart = []; state.customer = null; state.discountPct = 0;
  state.selectedTableId = null; state.selectedOrderId = null; state.resumingOrder = null;
  document.getElementById('discountToggle').textContent = '+ خصم';
  updatePointsRedeemStrip();
  renderOrder();
  paymentModalBody.innerHTML = `<div class="receipt-success">
    <div class="success-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h3>تمت العملية بنجاح</h3>
    <div class="receipt-total">${rkMoney(total)}</div>
    <div class="receipt-detail-row"><span>المدفوع</span>${rkMoney(state.activePaymentMethod==='cash' ? (state.cashAmount||0) : total)}</div>
    ${state.activePaymentMethod==='cash' ? `<div class="receipt-detail-row"><span>الباقي</span>${rkMoney(change)}</div>` : ''}
    <div class="receipt-detail-row print-status" id="printStatusRow"><span>الطابعة</span><span class="print-status-label"><span class="print-spinner"></span>جاري الطباعة...</span></div>
    <div id="loyaltyQrBox"></div>
    <div class="receipt-actions">
      <button class="receipt-action-btn" id="printBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>طباعة</button>
      <button class="receipt-action-btn" id="waBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>واتساب</button>
    </div>
    <button class="new-order-btn" id="newOrderBtn">طلب جديد الآن</button>
    ${willShowLoyaltyQr ? '' : `<div class="auto-reset-note" id="autoResetNote">يبدأ طلب جديد تلقائيًا خلال <span class="mono" id="autoResetCount">4</span></div>`}
  </div>`;
  document.getElementById('printBtn').addEventListener('click', ()=> attemptPrint(receiptData));
  document.getElementById('waBtn').addEventListener('click', ()=> showToast('تم الإرسال'));

  // real "scan to save your loyalty card" QR — only shown when a customer
  // phone was captured on this order (skipped entirely if the customer
  // declined, matching how some customers just don't want to join)
  if(customerPhone){
    window.supabaseClient.from('customers').select('id, public_token, loyalty_points')
      .eq('business_id', DEVICE.businessId).eq('phone', customerPhone).maybeSingle()
      .then(async ({data})=>{
        if(!data) return;
        const cardUrl = window.location.origin + '/loyalty-card/' + data.public_token;
        const box = document.getElementById('loyaltyQrBox');
        if(box){
          box.innerHTML = `
            <div style="text-align:center; margin:14px 0; padding:14px; background:#fff; border-radius:12px;">
              <img src="/api/qr?data=${encodeURIComponent(cardUrl)}" alt="QR بطاقة الولاء" style="width:120px; height:120px;">
              <p style="font-size:11.5px; font-weight:700; color:var(--muted, #666); margin-top:8px;">امسح لإضافة بطاقة الولاء لجوالك</p>
            </div>`;
        }
        // real push notification (free, VAPID) — does nothing visible to the
        // customer if they never enabled notifications on their card, but
        // logs/toasts any failure so it's debuggable from the cashier device
        try {
          const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
          const session = sessionData && sessionData.session;
          if(sessionError){ console.error('push: getSession error', sessionError); showToast('تنبيه: جلسة الدخول غير صالحة'); return; }
          if(!session){ console.error('push: no session'); showToast('تنبيه: ما فيه جلسة دخول لإرسال التنبيه'); return; }
          const res = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({
              customerId: data.id,
              title: 'نقاطك تحدّثت',
              body: 'رصيدك الحين ' + Math.round(Number(data.loyalty_points)) + ' نقطة.'
            })
          });
          if(!res.ok){
            const errText = await res.text().catch(()=> '');
            console.error('push: send-push failed', res.status, errText);
            showToast('تنبيه: فشل الإرسال (' + res.status + ')');
          } else {
            const result = await res.json().catch(()=> null);
            console.log('push: sent', result);
            if(result && result.total > 0) showToast('تم إرسال تنبيه (' + result.sent + '/' + result.total + ')');
          }
        } catch (err) {
          console.error('push: unexpected error', err);
          showToast('تنبيه: خطأ غير متوقع بالإرسال');
        }
      });
  }

  autoPrintOnCheckout(orderPayload, receiptData, wasResumingOrder);

  // Cart/table/customer state is already cleared above (right after
  // success) — this just closes the modal, whether that happens via the
  // timer or an explicit tap.
  const startNewOrder = ()=> closePaymentModalNow();

  // auto-reset for the next customer — visible countdown, cashier can skip by tapping "New Order" or paying again.
  // Skipped entirely when a loyalty QR is shown — 4 seconds isn't enough time
  // for the customer to get their phone out and scan it; the cashier taps
  // "طلب جديد الآن" whenever they're actually ready to move on instead.
  if(!willShowLoyaltyQr){
    let secondsLeft = 4;
    const countEl = document.getElementById('autoResetCount');
    activeAutoResetTimer = setInterval(()=>{
      secondsLeft -= 1;
      if(countEl) countEl.textContent = secondsLeft;
      if(secondsLeft <= 0){
        clearInterval(activeAutoResetTimer);
        startNewOrder();
      }
    }, 1000);
  }

  document.getElementById('newOrderBtn').addEventListener('click', ()=>{
    clearInterval(activeAutoResetTimer);
    startNewOrder();
  });
}

/* ============ ORDERS screen ============ */
let ordersActiveTab = 'running';
document.getElementById('ordersTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.seg-tab'); if(!btn) return;
  document.querySelectorAll('#ordersTabs .seg-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  ordersActiveTab = btn.dataset.tab;
  renderOrdersList();
  // Mobile has real page-level scroll (see .home-zones' stacked layout) —
  // without this, switching tabs while scrolled down left the just-tapped
  // tab sitting invisible above the fold behind the now-fixed topbar, which
  // reads as "the tab moved" even though nothing in its own layout changed.
  window.scrollTo(0, 0);
});
async function renderOrdersList(){
  const el = document.getElementById('ordersList');
  if(ordersActiveTab === 'running'){
    // merged with what used to be the separate "التوصيل" screen — a held
    // order and an active delivery order are both "جارية" in the same real
    // sense, and the countdown ring already communicates delivery urgency
    // without needing its own tab/screen.
    // Not-ready orders (still racing the prep-timeout countdown) sort by
    // urgency; ready-but-undelivered orders come after, oldest-waiting-first
    // — those are two different questions ("what's about to be late?" vs
    // "what's been sitting the longest waiting for a delivered confirmation?")
    // so they don't share a sort key.
    const notReadyRows = ACTIVE_DELIVERY_ORDERS.filter(o=>!o.readyAt)
      .map(o=>({order:o, remaining: deliveryOrderRemainingSeconds(o)}))
      .sort((a,b)=> a.remaining - b.remaining);
    const readyRows = ACTIVE_DELIVERY_ORDERS.filter(o=>o.readyAt)
      .sort((a,b)=> a.readyAt - b.readyAt)
      .map(o=>({order:o, remaining: null}));
    const deliveryRows = [...notReadyRows, ...readyRows];
    // Pickup gets the exact same not-ready/ready split and sort — a pickup
    // order has no prep-timeout countdown ring (that's a delivery-platform
    // concept), so "not ready" just sorts oldest-first (longest waiting to be
    // started is most urgent).
    const notReadyPickupRows = ACTIVE_PICKUP_ORDERS.filter(o=>!o.readyAt).sort((a,b)=> a.createdAt - b.createdAt);
    const readyPickupRows = ACTIVE_PICKUP_ORDERS.filter(o=>o.readyAt).sort((a,b)=> a.readyAt - b.readyAt);
    const pickupRows = [...notReadyPickupRows, ...readyPickupRows];
    if(held.length === 0 && deliveryRows.length === 0 && pickupRows.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه طلبات جارية حاليًا</div>'; return; }
    const gridCards = deliveryRows.map(({order, remaining})=> renderDeliveryCard(order, remaining)).join('')
      + pickupRows.map(order=> renderPickupCard(order)).join('');
    el.innerHTML =
      (gridCards ? `<div class="dorder-grid">${gridCards}</div>` : '') +
      held.map(o=>
        `<div class="order-row"><span class="order-row-badge running"></span>
          <div class="order-row-info"><div class="order-row-title">${o.id}</div><div class="order-row-meta">${o.meta}</div></div>
          <div class="order-row-total">${rkMoney(o.total)}</div>
          <button class="order-row-action" data-held="${o.heldId}">استرجاع</button>
        </div>`
      ).join('');
    el.querySelectorAll('.dorder-card').forEach(card=>{
      card.addEventListener('click', (e)=>{
        if(e.target.closest('.dorder-ready-btn') || e.target.closest('.dorder-delivered-btn') || e.target.closest('.dorder-out-btn')
          || e.target.closest('.pickup-ready-btn') || e.target.closest('.pickup-delivered-btn')) return;
        resetModalStack(()=> openOrderDetail(parseInt(card.dataset.order, 10)));
      });
    });
    el.querySelectorAll('.dorder-ready-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markDeliveryOrderReady(parseInt(btn.dataset.orderId, 10)); });
    });
    el.querySelectorAll('.dorder-delivered-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markDeliveryOrderDelivered(parseInt(btn.dataset.orderId, 10)); });
    });
    el.querySelectorAll('.dorder-out-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markDeliveryOrderOutForDelivery(parseInt(btn.dataset.orderId, 10)); });
    });
    el.querySelectorAll('.pickup-ready-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markPickupOrderReady(parseInt(btn.dataset.orderId, 10)); });
    });
    el.querySelectorAll('.pickup-delivered-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markPickupOrderDelivered(parseInt(btn.dataset.orderId, 10)); });
    });
    return;
  }

  // مكتملة / ملغاة — real rows across every channel, unchanged query except
  // delivery-specific fields so those rows can additionally show their
  // "جهز خلال mm:ss" badge (this tab already pulled delivery orders before
  // the merge, just without that extra context).
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  let completedQuery = window.supabaseClient
    .from('orders').select('id, total, created_at, customer_name, channel, ready_at, prep_duration_seconds, platform_invoice_last4, scheduled_for, delivery_platforms(name)')
    .eq('branch_id', DEVICE.branchId).eq('status', ordersActiveTab);
  // Only for "مكتملة" — a still-active online pickup/delivery order (already
  // shown in "جارية" above) shouldn't ALSO show here just because its status
  // flipped to completed the instant it was accepted. "ملغاة" orders always
  // have delivered_at null legitimately, so this filter must never touch that
  // tab or every cancelled order would wrongly vanish from it.
  if(ordersActiveTab === 'completed') completedQuery = completedQuery.or('channel.not.in.(pickup,delivery),source.neq.online,delivered_at.not.is.null');
  const { data } = await completedQuery.order('created_at', {ascending:false}).limit(30);
  const real = (data||[]).map(o=>{
    let extra = '';
    if(o.channel === 'delivery'){
      extra = ' — ' + (o.ready_at ? `جهز خلال ${formatMmSs(o.prep_duration_seconds||0)}` : (o.delivery_platforms ? o.delivery_platforms.name : 'توصيل'));
    } else if(o.channel === 'pickup' && o.scheduled_for){
      extra = ' — استلام ' + new Date(o.scheduled_for).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
    }
    return {
      id: '#' + o.id, orderId: o.id,
      meta: new Date(o.created_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) + (o.customer_name ? ' — ' + escapeHtml(o.customer_name) : '') + escapeHtml(extra),
      total: Number(o.total)
    };
  });
  if(real.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه طلبات هنا حاليًا</div>'; return; }
  el.innerHTML = real.map(o=>
    `<div class="order-row" data-order="${o.orderId}">
      <span class="order-row-badge ${ordersActiveTab}"></span>
      <div class="order-row-info"><div class="order-row-title">${o.id}</div><div class="order-row-meta">${o.meta}</div></div>
      <div class="order-row-total">${rkMoney(o.total)}</div>
    </div>`
  ).join('');
  el.querySelectorAll('[data-order]').forEach(row=>{
    row.addEventListener('click', ()=> resetModalStack(()=> openOrderDetail(parseInt(row.dataset.order,10))));
  });
}

/* ============ Delivery countdown ring — SVG stroke-dashoffset driven by
   remaining-time fraction. Always the 3-level urgency scheme (green/orange/
   red) regardless of platform brand — the ring's whole job is communicating
   urgency at a glance, and mixing in brand color would defeat that; the
   platform's brand identity is carried by the logo/initial badge instead. */
function deliveryUrgency(remaining){
  return remaining <= 0 ? 'urgent' : remaining <= 300 ? 'warn' : 'ok';
}
function deliveryRingSvg(remaining, timeoutMin, urgency){
  const totalSec = Math.max(1, timeoutMin * 60);
  const pct = Math.max(0, Math.min(1, remaining / totalSec));
  const color = urgency === 'urgent' ? 'var(--danger)' : urgency === 'warn' ? 'var(--amber)' : 'var(--lime-deep)';
  const r = 19, circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);
  return `<svg class="dorder-ring" viewBox="0 0 44 44" width="44" height="44">
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--surf2)" stroke-width="4"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 22 22)"/>
  </svg>`;
}

/* Compact card for the "جارية" grid — the warn/urgent classes below drive a
   pulsing border/glow (see .dorder-card.warn/.urgent in the CSS) so an order
   that's crossed the 5-min-warning or fully-expired threshold stands out at
   a glance even when there are many cards packed tightly together. */
function renderDeliveryCard(order, remaining){
  const platform = DELIVERY_PLATFORMS_LIST.find(p=>p.id === order.platformId);
  const brandColor = platform && platform.brand_color;
  const badge = order.isOnline
    ? `<span class="dorder-logo-initial" style="background:var(--lime);">🌐</span>`
    : platform && platform.logo_url
    ? `<img src="${platform.logo_url}" alt="" class="dorder-logo">`
    : `<span class="dorder-logo-initial" style="background:${brandColor || 'var(--surf2)'}">${(order.platformName||'؟').charAt(0)}</span>`;

  // Ready and waiting on the delivery rep to confirm drop-off — no more
  // countdown ring (the kitchen-prep deadline this order was racing against
  // no longer applies), just how long it's been waiting + a delivered button.
  if(order.readyAt){
    const waitingSec = Math.round((Date.now() - order.readyAt.getTime()) / 1000);
    // "خرج للتوصيل" is an optional extra milestone — a cashier who's always
    // gone ready→delivered directly (the pre-existing flow) can keep doing
    // exactly that; this button just gives the ones who want it a place to
    // mark the rider actually left.
    const outForDeliveryBlock = order.outForDeliveryAt
      ? `<div class="dorder-out-waiting mono">🛵 خرج للتوصيل — منذ ${formatMmSs(Math.round((Date.now() - order.outForDeliveryAt.getTime())/1000))}</div>`
      : `<div class="dorder-out-waiting mono">بانتظار التسليم — ${formatMmSs(waitingSec)}</div>
         <button class="dorder-out-btn" data-order-id="${order.id}">خرج للتوصيل</button>`;
    return `<div class="dorder-card out-for-delivery" data-order="${order.id}">
      <div class="dorder-out-icon">🛵</div>
      <div class="dorder-info">${badge}<span class="dorder-id">#${order.id}</span></div>
      <div class="dorder-platform">${order.platformName}${order.invoiceLast4 ? ' — ...' + order.invoiceLast4 : ''}</div>
      ${outForDeliveryBlock}
      <div class="dorder-total">${rkMoney(order.total)}</div>
      <button class="dorder-delivered-btn" data-order-id="${order.id}">تم توصيله ✅</button>
    </div>`;
  }

  const timeoutMin = PREP_TIMEOUT_MINUTES_BY_PLATFORM[order.platformId] || 17;
  const urgency = deliveryUrgency(remaining);
  const ring = deliveryRingSvg(remaining, timeoutMin, urgency);
  return `<div class="dorder-card ${urgency !== 'ok' ? urgency : ''}" data-order="${order.id}">
    <div class="dorder-ring-wrap">${ring}<span class="dorder-ring-time mono">${formatMmSs(remaining)}</span></div>
    <div class="dorder-info">${badge}<span class="dorder-id">#${order.id}</span></div>
    <div class="dorder-platform">${order.platformName}${order.invoiceLast4 ? ' — ...' + order.invoiceLast4 : ''}</div>
    <div class="dorder-total">${rkMoney(order.total)}</div>
    <button class="dorder-ready-btn" data-order-id="${order.id}">جاهز</button>
  </div>`;
}

/* ============ Order detail + reprint — reuses the payment modal shell
   (paymentModal/paymentModalBody) since it's already the app's generic
   receipt-style modal, just filled with a historical order instead of the
   just-completed one. ============ */
async function openOrderDetail(orderId){
  const modal = document.getElementById('paymentModal');
  const body = document.getElementById('paymentModalBody');
  document.getElementById('paymentModalTitle').textContent = 'تفاصيل الطلب #' + orderId;
  body.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  modal.classList.add('show');

  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*, delivery_platforms(name), restaurant_tables!orders_table_id_fkey(number)').eq('id', orderId).single(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  if(!order){ body.innerHTML = '<p class="pos-auth-sub">تعذر تحميل الطلب.</p>'; return; }

  const itemsHtml = (items||[]).map(it=>{
    const mods = (it.selected_modifiers||[]).map(m=>escapeHtml(m.text)).join('، ');
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    const name = escapeHtml(product ? product.name : ('منتج #' + it.menu_item_id));
    return `<div class="receipt-detail-row"><span>${it.qty} × ${name}${mods ? ' (' + mods + ')' : ''}${it.note ? ' — ' + escapeHtml(it.note) : ''}</span>${rkMoney(Number(it.line_total))}</div>`;
  }).join('');

  const isOnline = order.source === 'online';
  const hasLocation = order.channel === 'delivery' && order.customer_lat != null && order.customer_lng != null;
  const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${order.customer_lat},${order.customer_lng}` : null;
  const waPhone = (order.customer_phone || '').replace(/\D/g, '');
  const waMessage = `مرحبًا ${order.customer_name || ''}! طلبك رقم #${order.id} جاري تجهيزه وراح يوصلك بأقرب وقت 🚴`;
  const waUrl = waPhone ? `https://wa.me/${waPhone.startsWith('966') ? waPhone : '966' + waPhone.replace(/^0/, '')}?text=${encodeURIComponent(waMessage)}` : null;

  body.innerHTML = `
    <div class="receipt-success">
      ${isOnline ? `<div class="receipt-detail-row" style="border-bottom:none; font-weight:800; color:var(--lime-deep);"><span>🌐 طلب إلكتروني — من متجر المطعم</span><span></span></div>` : ''}
      <h3>${escapeHtml(CHANNEL_LABELS[order.channel] || order.channel)}${order.customer_name ? ' — ' + escapeHtml(order.customer_name) : ''}</h3>
      <div class="receipt-total">${rkMoney(Number(order.total))}</div>
      ${pickupTimeNoteHtml(order)}
      ${order.channel === 'dine_in' && order.restaurant_tables ? `<div class="receipt-detail-row"><span>الطاولة</span><span class="mono">طاولة ${order.restaurant_tables.number}</span></div>` : ''}
      ${itemsHtml}
      <div class="receipt-detail-row"><span>المجموع الفرعي</span>${rkMoney(Number(order.subtotal))}</div>
      ${order.delivery_fee > 0 ? `<div class="receipt-detail-row"><span>رسوم التوصيل</span>${rkMoney(Number(order.delivery_fee))}</div>` : ''}
      ${order.discount_amount > 0 ? `<div class="receipt-detail-row"><span>الخصم</span>${rkMoney(-Number(order.discount_amount))}</div>` : ''}
      <div class="receipt-detail-row"><span>الضريبة</span>${rkMoney(Number(order.vat_amount))}</div>
      <div class="receipt-detail-row"><span>طريقة الدفع</span><span class="mono">${PAYMENT_METHOD_LABELS_POS[order.payment_method] || order.payment_method}</span></div>
      <div class="receipt-detail-row"><span>الحالة</span><span class="mono">${ORDER_STATUS_LABELS_POS[order.status] || order.status}</span></div>
      ${order.customer_phone ? `<div class="receipt-detail-row"><span>جوال العميل</span><span class="mono">${escapeHtml(order.customer_phone)}</span></div>` : ''}
      ${order.pager_number != null ? `<div class="receipt-detail-row"><span>جهاز النداء</span><span class="mono">${order.pager_number}</span></div>` : ''}
      ${order.delivery_address ? `<div class="receipt-detail-row"><span>عنوان التوصيل</span><span>${escapeHtml(order.delivery_address)}</span></div>` : ''}
      ${order.channel === 'delivery' ? `
        <div class="receipt-detail-row"><span>منصة التوصيل</span><span>${isOnline ? 'متجر المطعم' : escapeHtml(order.delivery_platforms ? order.delivery_platforms.name : '—')}</span></div>
        ${order.platform_invoice_last4 ? `<div class="receipt-detail-row"><span>آخر ٤ أرقام الفاتورة</span><span class="mono">${escapeHtml(order.platform_invoice_last4)}</span></div>` : ''}
        <div class="receipt-detail-row"><span>وقت التجهيز</span><span class="mono">${order.ready_at ? formatMmSs(order.prep_duration_seconds||0) : 'لم يُسجَّل جاهز بعد'}</span></div>
      ` : ''}
      ${hasLocation ? `
        <div style="text-align:center; margin-top:14px; padding-top:14px; border-top:1px solid var(--line);">
          <div style="font-weight:800; font-size:12.5px; margin-bottom:10px;">📍 موقع العميل — للمندوب</div>
          <img src="/api/qr?data=${encodeURIComponent(mapsUrl)}" alt="" style="width:110px; height:110px; margin:0 auto 10px; display:block;">
          <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="receipt-action-btn" style="text-decoration:none; margin-bottom:8px; display:flex;">فتح بخرائط جوجل</a>
          ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="dorder-ready-btn" style="text-decoration:none; display:block; background:#25D366;">📱 إرسال تحديث عبر واتساب</a>` : ''}
        </div>
      ` : ''}
      <div class="receipt-actions">
        <button class="receipt-action-btn" id="reprintBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>إعادة طباعة</button>
        ${(order.status === 'completed' || order.status === 'partially_refunded') ? `<button class="receipt-action-btn" id="refundOrderBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>استرجاع مبلغ</button>` : ''}
      </div>
    </div>
  `;
  document.getElementById('reprintBtn').addEventListener('click', async ()=>{
    showToast('جاري الطباعة...');
    const job = await enqueuePrintJob('receipt', buildHistoricalReceiptData(order, items));
    const settled = await awaitPrintJobSettled(job);
    if(settled.status === 'printed' || settled.status === 'skipped_no_printer') showToast('تمت الطباعة');
    else showToast('تعذرت الطباعة — تحقق من الطابعة');
  });
  const refundBtn = document.getElementById('refundOrderBtn');
  if(refundBtn){
    refundBtn.addEventListener('click', ()=>{
      // مبلغٌ محدد أو الباقي كله.
      //
      // كان الاسترجاع كله-أو-لا-شيء، ولا وجه له: زبونٌ أعاد صنفاً من
      // ثلاثة لا يُرجَع له ثمن الثلاثة. والسقف هو الباقي من الفاتورة لا
      // إجماليها، حتى لا يُسترجع مرتين على استرجاع سابق.
      const already = Number(order.refunded_amount) || 0;
      const remaining = Math.max(0, Number(order.total) - already);
      if(remaining <= 0.001){ showToast('هذا الطلب مسترجع بالكامل'); return; }
      const raw = window.prompt(
        'كم تبي ترجع؟ الباقي من الفاتورة ' + remaining.toFixed(2) + ' ريال.' + String.fromCharCode(10) +
        'اتركه فاضي لاسترجاع المبلغ كامل.', '');
      if(raw === null) return;
      let amount = null;
      if(raw.trim() !== ''){
        amount = Number(raw.trim().replace(',', '.'));
        if(!isFinite(amount) || amount <= 0){ showToast('اكتب مبلغ صحيح'); return; }
        // السقف يُفحص هنا وفي القاعدة: هذا يمنع الخطأ، وذاك يمنع التحايل.
        if(amount > remaining + 0.001){ showToast('المبلغ أكبر من الباقي في الفاتورة'); return; }
      }
      const shown = amount === null ? remaining : amount;
      if(!window.confirm('استرجاع ' + shown.toFixed(2) + ' ريال كاش من الدرج؟')) return;
      // Manager-PIN gated — same stated convention as voiding an unpaid
      // dine-in order (see the comment above confirmCancelOrder: "same
      // convention as shift close and refunds"). This button used to go
      // straight from a plain confirm() to the RPC — refund_pos_order only
      // checks pos:register (every shared branch PIN has it), so any
      // cashier could solo-refund a completed sale with no manager
      // involved at all, contradicting that documented policy.
      openPinModal(async () => {
        refundBtn.disabled = true;
        try {
          const { data, error } = await window.supabaseClient.rpc('refund_pos_order',
            amount === null ? { p_order_id: orderId } : { p_order_id: orderId, p_amount: amount });
          if(error) throw error;
          const res = data || {};
          // الاسترجاع كاش دائماً، فالدرج يُفتح -- ولا يُنتظر: فشل فتح
          // الدرج لا يُبطل استرجاعاً وقع في القاعدة فعلاً.
          openCashDrawer().catch(()=>{});
          showToast(res.full === false
            ? 'تم استرجاع ' + shown.toFixed(2) + ' ريال — باقي ' + Number(res.remaining || 0).toFixed(2)
            : 'تم استرجاع مبلغ الطلب كامل');
          sendOwnerPush('refund_cancel', 'استرجاع طلب', `تم استرجاع مبلغ ${shown.toFixed(2)} ر.س (طلب #${orderId}).`);
          openOrderDetail(orderId);
          renderOrdersList();
        } catch(err){
          showToast('تعذر الاسترجاع: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
          refundBtn.disabled = false;
        }
      });
    });
  }
}
const ORDER_STATUS_LABELS_POS = {pending:'بانتظار القبول', completed:'مكتمل', cancelled:'ملغى', refunded:'مسترجع', partially_refunded:'مسترجع جزئياً', rejected:'مرفوض'};
const CHANNEL_LABELS = {dine_in:'محلي', pickup:'سفري', delivery:'تطبيقات التوصيل'};
const PAYMENT_METHOD_LABELS_POS = {cash:'كاش', card:'بطاقة', split:'تقسيم دفع', delivery_platform:'مدفوع عبر التطبيق'};

/* ============ TABLES screen — real restaurant_tables, grouped by owner-
   configurable sections. A table's life now has a real ladder, and every
   status has exactly one meaning when tapped — a busy captain never has to
   guess, and never has to open a table to know what's going on with it:
   available        -> seats the guest right here (no product screen yet)
   awaiting_order    -> "بانتظار الطلب" — guest is seated, order not taken
                        yet; tap opens the product screen to register it
   serving           -> "قيد التقديم" — order registered (kitchen has it),
                        not yet paid; tap opens إضافة أصناف / الدفع
   awaiting_payment  -> "بانتظار الدفع" — closing out the bill; tap resumes
                        the payment step
   cleaning          -> single "تم التنظيف" tap, back to available
   reserved          -> legacy manual state from before this redesign, kept
                        as a start-session/release escape hatch
   Walk-in waitlist entries (table_reservations, no table_id until seated)
   live in the "قائمة الانتظار" tab below, not on any individual card. ============ */
const TABLE_STATUS_LABELS = {available:'متاحة', awaiting_order:'بانتظار الطلب', serving:'قيد التقديم', awaiting_payment:'بانتظار الدفع', cleaning:'تنظيف', reserved:'محجوزة'};
function reservationTimeLabel(iso){
  return new Date(iso).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
}
function elapsedMinutesLabel(iso){
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return mins < 1 ? 'الآن' : 'منذ ' + mins + ' د';
}
// Traffic-light severity for how long a table's been sitting in its current
// state — green up to the owner's configured turn-time, amber up to 1.5x
// that, red beyond it. Same threshold drives both "hasn't been touched yet"
// waits (awaiting_order/cleaning) and "order's been open too long" waits
// (serving/awaiting_payment) — one number the owner already controls in
// Settings, not a second one to configure.
function turnTimerSeverityClass(mins){
  if(mins > TABLES_TURN_TIME_MINUTES * 1.5) return ' over';
  if(mins > TABLES_TURN_TIME_MINUTES) return ' warn';
  return ' ok';
}
function waPhoneUrl(phone, message){
  if(!phone) return null;
  const normalized = phone.startsWith('966') ? phone : '966' + phone.replace(/^0/, '');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
// Groups tables under their table_sections in configured sort_order; a
// section with zero tables today is skipped rather than shown empty, and
// unsectioned tables land in a trailing "بدون قسم" group only if any exist.
// When the branch has never created a section, returns one unlabeled group
// (no header rendered) — the flat grid stays exactly as it always has.
function groupTablesForDisplay(tables){
  if(!TABLE_SECTIONS_LIST.length) return [{section: null, tables}];
  const bySection = {};
  tables.forEach(t => { const key = t.section_id || 'none'; (bySection[key] = bySection[key] || []).push(t); });
  const groups = TABLE_SECTIONS_LIST
    .map(s => ({section: s, tables: bySection[s.id] || []}))
    .filter(g => g.tables.length);
  if(bySection.none && bySection.none.length) groups.push({section: {id: null, name: 'بدون قسم'}, tables: bySection.none});
  return groups;
}

/* ---- Tables / قائمة الانتظار sub-tabs ---- */
let tablesActiveTab = 'floor';
document.getElementById('tablesTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.seg-tab'); if(!btn) return;
  document.querySelectorAll('#tablesTabs .seg-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  tablesActiveTab = btn.dataset.tab;
  document.getElementById('tablesFloorPane').classList.toggle('hidden', tablesActiveTab !== 'floor');
  document.getElementById('tablesWaitlistPane').classList.toggle('hidden', tablesActiveTab !== 'waitlist');
  document.getElementById('tablesRemindersPane').classList.toggle('hidden', tablesActiveTab !== 'reminders');
  if(isHotelBusiness()) renderHotelActiveTab();
  else if(tablesActiveTab === 'waitlist') renderWaitlist();
  else if(tablesActiveTab === 'reminders') renderReminders();
  else renderTables();
});
document.getElementById('waitlistAddBtn').addEventListener('click', ()=>{
  if(isHotelBusiness()){ openNewHotelBookingModal(); return; }
  resetModalStack(renderAddToWaitlistStep);
  paymentModal.classList.add('show');
});

async function renderTables(){
  const el = document.getElementById('tablesGrid');
  // switching into this screen used to sit frozen (nothing shown at all)
  // until the fetch resolved — on a slow connection that reads as the whole
  // app hanging, not just this one screen loading
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient
    .from('restaurant_tables').select('*').eq('branch_id', DEVICE.branchId).order('number');
  const tables = data || [];
  TABLES_CACHE = tables;
  if(tables.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه طاولات مسجّلة لهذا الفرع.</div>'; return; }

  // Specific-table bookings (owner-opt-in, separate from the general FIFO
  // waitlist) show as a small time badge on the table they're actually
  // bound to — the table itself stays fully usable for a walk-in until
  // that reservation is actually seated; this is purely a heads-up.
  const boundResByTable = {};
  if(TABLES_SPECIFIC_BOOKING_ENABLED){
    const horizon = new Date(Date.now() + 18*60*60*1000).toISOString();
    const { data: resData } = await window.supabaseClient.from('table_reservations')
      .select('id, table_id, customer_name, customer_phone, party_size, reserved_for')
      .eq('branch_id', DEVICE.branchId).eq('status', 'upcoming')
      .not('table_id', 'is', null).lte('reserved_for', horizon).order('reserved_for');
    (resData || []).forEach(r => { if(!boundResByTable[r.table_id]) boundResByTable[r.table_id] = r; });
  }

  // Turn-time reuses the active order's own created_at — no seated_at
  // column needed, the order already carries that timestamp. Applies to
  // both "serving" and "awaiting_payment" — the order's been taken either way.
  const orderStartByTable = {};
  if(TABLES_TURN_TIME_ENABLED){
    const activeOrderIds = tables.filter(t => (t.status === 'serving' || t.status === 'awaiting_payment') && t.active_order_id).map(t => t.active_order_id);
    if(activeOrderIds.length){
      const { data: ordersData } = await window.supabaseClient.from('orders').select('id, created_at').in('id', activeOrderIds);
      const createdById = {};
      (ordersData || []).forEach(o => { createdById[o.id] = o.created_at; });
      tables.forEach(t => { if(t.active_order_id && createdById[t.active_order_id]) orderStartByTable[t.id] = createdById[t.active_order_id]; });
    }
  }

  const cardHtml = (t) => {
    let subBadge = '';
    if(t.status === 'awaiting_order' || t.status === 'cleaning'){
      const mins = Math.floor((Date.now() - new Date(t.status_changed_at).getTime()) / 60000);
      subBadge = `<span class="table-turn-timer${turnTimerSeverityClass(mins)}">${elapsedMinutesLabel(t.status_changed_at)}</span>`;
    } else if((t.status === 'serving' || t.status === 'awaiting_payment') && TABLES_TURN_TIME_ENABLED && orderStartByTable[t.id]){
      const mins = Math.floor((Date.now() - new Date(orderStartByTable[t.id]).getTime()) / 60000);
      subBadge = `<span class="table-turn-timer${turnTimerSeverityClass(mins)}">${mins} د</span>`;
    }
    const res = boundResByTable[t.id];
    const resBadge = res ? `<button class="table-reservation-badge" data-res-id="${res.id}" type="button">🕐 ${reservationTimeLabel(res.reserved_for)}</button>` : '';
    return `<div class="table-card ${t.status}" data-id="${t.id}" data-status="${t.status}" role="button" tabindex="0">
      <span class="table-num">${t.number}</span>
      <span class="table-status">${TABLE_STATUS_LABELS[t.status]}</span>
      ${subBadge}
      ${resBadge}
    </div>`;
  };

  const groups = groupTablesForDisplay(tables);
  el.innerHTML = groups.map(g => {
    let html = '';
    if(g.section){
      const availCount = g.tables.filter(t => t.status === 'available').length;
      html += `<div class="tables-section-header"><span>${g.section.name}</span><span class="tables-section-count">${availCount} متاحة من ${g.tables.length}</span></div>`;
    }
    return html + g.tables.map(cardHtml).join('');
  }).join('');

  el.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('.table-reservation-badge')) return;
      const table = tables.find(t => String(t.id) === card.dataset.id);
      if(table) routeTableTap(table);
    });
  });
  el.querySelectorAll('.table-reservation-badge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const table = tables.find(t => String(t.id) === btn.closest('.table-card').dataset.id);
      const res = table && boundResByTable[table.id];
      if(!table || !res) return;
      openBoundReservationSheet(table, res);
    });
  });
}

// A specific-table booking's badge opens straight to "seat now"/"cancel" —
// the table itself is already known, no picker needed (unlike the general
// waitlist's seat flow, which has to ask which now-free table to use).
function openBoundReservationSheet(table, res){
  resetModalStack(() => renderBoundReservationSheet(table, res));
  paymentModal.classList.add('show');
}

function renderBoundReservationSheet(table, res){
  document.getElementById('paymentModalTitle').textContent = 'حجز طاولة ' + table.number;
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">${escapeHtml(res.customer_name)} — ${res.party_size} أشخاص — ${reservationTimeLabel(res.reserved_for)}</p>
    ${res.customer_phone ? `<p class="pos-modal-hint">الجوال: <span class="mono">${escapeHtml(res.customer_phone)}</span></p>` : ''}
    ${table.status === 'cleaning' ? `<p class="pos-modal-hint" style="color:var(--amber);">🧹 هذي الطاولة تحتاج تنظيف</p>` : ''}
    <button class="confirm-pay-btn" id="brSeatBtn">بدء الجلسة الآن</button>
    <button class="loyalty-otp-back" id="brCancelBtn">إلغاء الحجز</button>
  `;
  document.getElementById('brSeatBtn').addEventListener('click', async () => {
    if(table.status === 'cleaning' && !window.confirm('طاولة ' + table.number + ' تحتاج تنظيف — تأكيد الجلوس فيها؟')) return;
    const { error } = await window.supabaseClient.rpc('seat_waitlist_entry', { p_reservation_id: res.id, p_table_id: table.id });
    if(error){ showToast('تعذر بدء الجلسة — تحقق من حالة الطاولة'); closePaymentModalNow(); renderTables(); return; }
    showToast('طاولة ' + table.number + ' — بانتظار الطلب');
    closePaymentModalNow();
    renderTables();
  });
  document.getElementById('brCancelBtn').addEventListener('click', async () => {
    if(!window.confirm('تأكيد إلغاء الحجز؟')) return;
    await window.supabaseClient.from('table_reservations').update({status: 'cancelled'}).eq('id', res.id);
    showToast('تم إلغاء الحجز');
    closePaymentModalNow();
    renderTables();
  });
}

/* ============ Table tap-router — one meaning per status, no blind cycling.
   All state-changing updates are guarded (.eq('status', expectedCurrent))
   so two devices tapping the same table within the same instant can't both
   "win" — the loser gets a clear toast instead of a silently wrong state. ============ */
async function routeTableTap(table){
  if(table.status === 'available') return seatWalkInAtTable(table);
  if(table.status === 'awaiting_order') return openAwaitingOrderSheet(table);
  if(table.status === 'serving') return openServingSheet(table);
  if(table.status === 'awaiting_payment') return openAwaitingPaymentSheet(table);
  if(table.status === 'reserved') return openManualReservedSheet(table);
  if(table.status === 'cleaning') return markTableCleaned(table);
}

// Seating is its own moment, separate from taking the order — the guest
// sits down and looks at the menu before anyone's ready to register
// anything. Stays on the Tables screen; a second tap (now "بانتظار الطلب")
// is what actually opens the product screen.
async function seatWalkInAtTable(table){
  const { data, error } = await window.supabaseClient.from('restaurant_tables')
    .update({status: 'awaiting_order'}).eq('id', table.id).eq('status', 'available').select('id');
  if(error || !data || !data.length){ showToast('طاولة ' + table.number + ' انشغلت للتو'); renderTables(); return; }
  showToast('طاولة ' + table.number + ' — بانتظار الطلب');
  renderTables();
}

function beginOrderForTable(table){
  state.selectedTableId = table.id;
  state.selectedOrderId = null;
  updateTableBadge();
  closePaymentModalNow();
  showToast('تسجيل طلب — طاولة ' + table.number);
  document.querySelector('.nav-tab[data-screen="home"]').click();
}

// No order exists yet at this stage, so the only real edge case is "seated
// by mistake / guest left before ordering" — a plain release, no money and
// nothing to move.
function openAwaitingOrderSheet(table){
  resetModalStack(() => renderAwaitingOrderSheet(table));
  paymentModal.classList.add('show');
}

function renderAwaitingOrderSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — بانتظار الطلب';
  // Host mode manages seating only — actual order-taking happens later on
  // the real cashier POS, once they check the table themselves.
  paymentModalBody.innerHTML = `
    ${HOST_MODE ? '' : '<button class="confirm-pay-btn" id="aoTakeOrderBtn">تسجيل الطلب</button>'}
    <button class="${HOST_MODE ? 'confirm-pay-btn' : 'loyalty-otp-back'}" id="aoReleaseBtn">إفراغ الطاولة</button>
  `;
  const takeOrderBtn = document.getElementById('aoTakeOrderBtn');
  if(takeOrderBtn) takeOrderBtn.addEventListener('click', () => beginOrderForTable(table));
  document.getElementById('aoReleaseBtn').addEventListener('click', async () => {
    if(!window.confirm('تأكيد إفراغ طاولة ' + table.number + '؟')) return;
    const { data, error } = await window.supabaseClient.from('restaurant_tables')
      .update({status: 'cleaning'}).eq('id', table.id).eq('status', 'awaiting_order').select('id');
    if(error || !data || !data.length){ showToast('تعذر التحديث'); return; }
    showToast('طاولة ' + table.number + ' — تحتاج تنظيف');
    closePaymentModalNow();
    renderTables();
  });
}

// A "serving" table already has a real, kitchen-printed order — tapping it
// never jumps straight into a fresh cart (that would silently create a
// second, disconnected order for the same table). Offers everything that
// makes sense once an order is genuinely in flight: add more, pay, move the
// party to a different table, or void the whole thing if it walked out.
async function openServingSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — قيد التقديم';
  paymentModalBody.innerHTML = `<p class="pos-modal-hint">جارٍ التحميل...</p>`;
  paymentModal.classList.add('show');
  const { data: order } = await window.supabaseClient.from('orders')
    .select('id, total').eq('id', table.active_order_id).maybeSingle();
  if(!order){ showToast('تعذر تحميل الطلب'); closePaymentModalNow(); renderTables(); return; }
  resetModalStack(() => renderServingSheet(table, order));
}

function renderServingSheet(table, order){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — قيد التقديم';
  paymentModalBody.innerHTML = `
    <div class="due-display"><div class="due-label">إجمالي الطلب حتى الآن</div><div class="due-amount">${rkMoney(Number(order.total))}</div></div>
    ${HOST_MODE ? '' : `
    <button class="confirm-pay-btn" id="servingAddItemsBtn">+ إضافة أصناف</button>
    <button class="loyalty-otp-back" id="servingPayBtn">الدفع</button>`}
    <button class="loyalty-otp-back" id="servingMoveBtn">تغيير الطاولة</button>
    <button class="loyalty-otp-back" id="servingCancelBtn" style="color:var(--danger);">إلغاء الطلب</button>
  `;
  const addItemsBtn = document.getElementById('servingAddItemsBtn');
  if(addItemsBtn) addItemsBtn.addEventListener('click', () => {
    state.selectedTableId = table.id;
    state.selectedOrderId = table.active_order_id;
    updateTableBadge();
    closePaymentModalNow();
    document.querySelector('.nav-tab[data-screen="home"]').click();
  });
  const payBtnEl = document.getElementById('servingPayBtn');
  if(payBtnEl) payBtnEl.addEventListener('click', () => {
    closePaymentModalNow();
    resumePaymentForTable(table);
  });
  document.getElementById('servingMoveBtn').addEventListener('click', () => openModalStep(() => renderMoveTableStep(table, order.id)));
  document.getElementById('servingCancelBtn').addEventListener('click', () => confirmCancelOrder(table, order.id));
}

// A table waiting to close out its bill gets the same escape hatches as
// "serving" — a party doesn't stop being movable/cancellable just because
// the cashier already opened the payment step once.
async function openAwaitingPaymentSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — بانتظار الدفع';
  paymentModalBody.innerHTML = `<p class="pos-modal-hint">جارٍ التحميل...</p>`;
  paymentModal.classList.add('show');
  const { data: order } = await window.supabaseClient.from('orders')
    .select('id, total').eq('id', table.active_order_id).maybeSingle();
  if(!order){ showToast('تعذر تحميل الطلب'); closePaymentModalNow(); renderTables(); return; }
  resetModalStack(() => renderAwaitingPaymentSheet(table, order));
}

function renderAwaitingPaymentSheet(table, order){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — بانتظار الدفع';
  paymentModalBody.innerHTML = `
    <div class="due-display"><div class="due-label">إجمالي الطلب</div><div class="due-amount">${rkMoney(Number(order.total))}</div></div>
    ${HOST_MODE ? '' : '<button class="confirm-pay-btn" id="apContinueBtn">متابعة الدفع</button>'}
    <button class="loyalty-otp-back" id="apMoveBtn">تغيير الطاولة</button>
    <button class="loyalty-otp-back" id="apCancelBtn" style="color:var(--danger);">إلغاء الطلب</button>
  `;
  const continueBtn = document.getElementById('apContinueBtn');
  if(continueBtn) continueBtn.addEventListener('click', () => resumePaymentForTable(table));
  document.getElementById('apMoveBtn').addEventListener('click', () => openModalStep(() => renderMoveTableStep(table, order.id)));
  document.getElementById('apCancelBtn').addEventListener('click', () => confirmCancelOrder(table, order.id));
}

// Shared by both "serving" and "بانتظار الدفع" sheets — carries the order to
// a different table via move_table_order (server-side, keeps the old
// table's live status instead of guessing) rather than two separate client
// writes that could land half-done on a network blip.
function renderMoveTableStep(fromTable, orderId){
  document.getElementById('paymentModalTitle').textContent = 'نقل طاولة ' + fromTable.number + ' — اختر الوجهة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('restaurant_tables').select('*')
    .eq('branch_id', DEVICE.branchId).eq('status', 'available').order('number')
    .then(({data}) => {
      const tables = data || [];
      if(!tables.length){ paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه طاولات متاحة الحين.</p>`; return; }
      const groups = groupTablesForDisplay(tables);
      let html = `<div class="table-picker-grid">`;
      groups.forEach(g => {
        if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}</span></div>`;
        html += g.tables.map(t => `<button type="button" class="table-picker-btn" data-id="${t.id}" data-number="${t.number}">${t.number}</button>`).join('');
      });
      html += `</div>`;
      paymentModalBody.innerHTML = html;
      document.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const newTableId = Number(btn.dataset.id);
          const { error } = await window.supabaseClient.rpc('move_table_order', { p_order_id: orderId, p_new_table_id: newTableId });
          if(error){ showToast('تعذر النقل — تحقق من حالة الطاولة'); return; }
          showToast('تم النقل لطاولة ' + btn.dataset.number);
          closePaymentModalNow();
          renderTables();
        });
      });
    });
}

// Voiding a real, unpaid order (walked out, mistake) is manager-PIN gated —
// same convention as shift close and refunds — since it's the one action
// here with real money written off. Never reverses stock (see the RPC's
// own comment for why).
function confirmCancelOrder(table, orderId){
  if(!window.confirm('تأكيد إلغاء طلب طاولة ' + table.number + '؟')) return;
  // Same distinction as the Home-screen cancel button: "hold off a bit"
  // should leave the table waiting for a real order, not send it to cleaning.
  const stillOccupied = window.confirm('هل الزبائن لسا قاعدين على طاولة ' + table.number + ' ويحتاجون وقت أطول؟\nموافق = نعم لسا قاعدين — إلغاء = لا، غادروا');
  openPinModal(async () => {
    const { error } = await window.supabaseClient.rpc('cancel_dine_in_order', { p_order_id: orderId, p_still_occupied: stillOccupied });
    if(error){ showToast('تعذر الإلغاء'); return; }
    showToast(stillOccupied ? 'تراجعنا عن الطلب — بانتظار الطلب' : 'تم إلغاء الطلب — الطاولة بحاجة تنظيف');
    closePaymentModalNow();
    renderTables();
  });
}

async function resumePaymentForTable(table){
  const { error: flipError } = await window.supabaseClient.from('restaurant_tables')
    .update({status: 'awaiting_payment'}).eq('id', table.id).in('status', ['serving','awaiting_payment']);
  const orderId = table.active_order_id;
  if(flipError || !orderId){ showToast('تعذر فتح الدفع لهذي الطاولة'); renderTables(); return; }

  const [{ data: order }, { data: items }] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).maybeSingle(),
    window.supabaseClient.from('order_items').select('menu_item_id, qty, unit_price, line_total, selected_modifiers').eq('order_id', orderId)
  ]);
  if(!order){ showToast('تعذر تحميل تفاصيل الطلب'); renderTables(); return; }

  state.resumingOrder = {
    id: order.id, table_id: order.table_id,
    subtotal: order.subtotal, discount_amount: order.discount_amount, vat_amount: order.vat_amount, total: order.total,
    items: (items||[]).map(it => {
      const p = PRODUCTS.find(x=>x.id===it.menu_item_id);
      return { name: p ? p.name : ('منتج #' + it.menu_item_id), qty: it.qty, unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total), mods: (it.selected_modifiers||[]).map(m=>m.text) };
    })
  };
  state.activePaymentMethod = 'cash';
  state.cashAmount = 0;
  state.splitCardAmount = 0;
  resetModalStack(renderPaymentStep);
  document.getElementById('paymentModalTitle').textContent = 'الدفع — طاولة ' + table.number;
  paymentModal.classList.add('show');
}

async function markTableCleaned(table){
  const { data, error } = await window.supabaseClient.from('restaurant_tables')
    .update({status: 'available'}).eq('id', table.id).eq('status', 'cleaning').select('id');
  if(error || !data || !data.length){ showToast('تعذر تحديث حالة الطاولة'); return; }
  showToast('طاولة ' + table.number + ' — جاهزة الآن');
  renderTables();
}

// A table sitting at status='reserved' today only got there through the old
// pre-redesign blind status-cycle (real bookings live entirely in the
// waitlist below and never touch .status) — kept as a two-way escape hatch
// so any table already in that state isn't stranded.
function openManualReservedSheet(table){
  resetModalStack(() => renderManualReservedSheet(table));
  paymentModal.classList.add('show');
}

function renderManualReservedSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — محجوزة';
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">هذي الطاولة محجوزة يدويًا (حالة قديمة).</p>
    <button class="confirm-pay-btn" id="manualSeatBtn">بدء الجلسة</button>
    <button class="loyalty-otp-back" id="manualFreeBtn">إلغاء الحجز</button>
  `;
  document.getElementById('manualSeatBtn').addEventListener('click', async () => {
    const { data, error } = await window.supabaseClient.from('restaurant_tables')
      .update({status: 'awaiting_order'}).eq('id', table.id).eq('status', 'reserved').select('id');
    if(error || !data || !data.length){ showToast('تعذر بدء الجلسة'); closePaymentModalNow(); renderTables(); return; }
    showToast('طاولة ' + table.number + ' — بانتظار الطلب');
    closePaymentModalNow();
    renderTables();
  });
  document.getElementById('manualFreeBtn').addEventListener('click', async () => {
    await window.supabaseClient.from('restaurant_tables').update({status: 'available'}).eq('id', table.id).eq('status', 'reserved');
    showToast('تم إلغاء الحجز — الطاولة متاحة');
    closePaymentModalNow();
    renderTables();
  });
}

/* ============ قائمة الانتظار — walk-in waitlist ============
   A waitlist entry is NOT bound to a table at creation (that's the whole
   point — first-come, first-served for whichever table frees up next, not
   a claim on one particular table). reserved_for defaults to "now" for a
   walk-in and can be pushed later for a genuine advance phone booking —
   either way the list sorts by it, so both cases interleave correctly in
   one queue instead of needing two separate systems. ============ */
const WAITLIST_PARTY_PRESETS = [2, 3, 4, 5, 6, 8];

let WAITLIST_CACHE = [];
let REMINDERS_CACHE = [];
async function renderWaitlist(){
  const el = document.getElementById('waitlistList');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  // A busy night's queue realistically resolves throughout the day (seated,
  // no-show, cancelled all leave 'upcoming'), so this is never expected to
  // approach the cap — it's a backstop against a truly degenerate case
  // (months of unresolved test data), not a real ceiling on how many
  // people the queue can genuinely hold at once. Findability at real scale
  // comes from the search box below, not from hiding rows.
  // Every other business type's waitlist is purely "who's waiting to be
  // seated" — a row resolves (seated/no_show/cancelled) and leaves the list
  // for good. تفصيل orders need to stay visible through two more real
  // stages (seated == in progress, ready_for_pickup == done) so staff don't
  // lose track of a garment mid-shop; other types never produce those
  // statuses in the first place, so this widened filter is a no-op for them.
  const waitlistStatuses = isTailoringBusiness() ? ['upcoming', 'seated', 'ready_for_pickup'] : ['upcoming'];
  const { data } = await window.supabaseClient.from('table_reservations')
    .select('id, customer_name, customer_phone, party_size, reserved_for, preferred_section_id, created_at, customer_lat, customer_lng, customer_address_text, status')
    .eq('branch_id', DEVICE.branchId).in('status', waitlistStatuses).order('reserved_for').limit(1000);
  WAITLIST_CACHE = data || [];
  const searchInput = document.getElementById('waitlistSearchInput');
  if(searchInput) searchInput.value = '';
  renderWaitlistList(WAITLIST_CACHE);
}

// Filtering client-side (not a fresh query) — the whole point is instant,
// no-network feedback while typing, and 200 rows is trivial to filter in
// the browser. Re-run any time the search box changes.
document.getElementById('waitlistSearchInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim();
  if(!q){ renderWaitlistList(WAITLIST_CACHE); return; }
  const filtered = WAITLIST_CACHE.filter(r =>
    r.customer_name.includes(q) || (r.customer_phone && r.customer_phone.includes(q))
  );
  renderWaitlistList(filtered, q);
});

function renderWaitlistList(list, activeQuery){
  const el = document.getElementById('waitlistList');
  const countBadge = document.getElementById('waitlistCount');
  countBadge.style.display = WAITLIST_CACHE.length ? '' : 'none';
  countBadge.textContent = WAITLIST_CACHE.length;
  if(!WAITLIST_CACHE.length){ el.innerHTML = '<div class="list-empty">ما فيه أحد بقائمة الانتظار الآن.</div>'; return; }
  if(!list.length){ el.innerHTML = `<div class="list-empty">ما فيه نتائج لـ"${escapeHtml(activeQuery)}".</div>`; return; }

  el.innerHTML = list.map((r) => {
    const i = WAITLIST_CACHE.indexOf(r);
    const section = TABLE_SECTIONS_LIST.find(s => s.id === r.preferred_section_id);
    const isLate = (Date.now() - new Date(r.reserved_for).getTime()) > 20 * 60000;
    // A future booking's reserved_for sits meaningfully later than when it
    // was added — a walk-in's is the same moment. Show whichever fact is
    // actually informative instead of always repeating "الآن".
    const isAdvanceBooking = (new Date(r.reserved_for).getTime() - new Date(r.created_at).getTime()) > 5 * 60000;
    const telUrl = r.customer_phone ? `tel:${r.customer_phone}` : null;
    const waUrl = r.customer_phone ? waPhoneUrl(r.customer_phone, `مرحبا ${r.customer_name}، طاولتك جاهزة الآن في ${DEVICE.branchName || ''}`) : null;
    // mobile_car_wash bookings have no physical resource to seat into
    // (hasNoPhysicalResource()) — a "الموقع" map link replaces the section
    // pill, and "بدء الخدمة" replaces "جلّسه" (dispatches the team via
    // start_mobile_service() instead of opening the table picker).
    const hasLocation = r.customer_lat != null && r.customer_lng != null;
    const mapUrl = hasLocation ? `https://maps.google.com/?q=${r.customer_lat},${r.customer_lng}` : null;
    const noResource = hasNoPhysicalResource();
    const tailoring = isTailoringBusiness();
    // Only tailoring ever produces a 'seated'/'ready_for_pickup' row here
    // (see the widened waitlistStatuses filter above) — every other
    // business type's rows are always 'upcoming', so this whole branch is
    // dead weight for them, same as the noResource check already is.
    let actionBtnHtml;
    if(tailoring && r.status === 'seated'){
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-mark-ready-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">جاهز للاستلام</button>`;
    } else if(tailoring && r.status === 'ready_for_pickup'){
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-complete-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تسليم للعميل</button>`;
    } else if(noResource){
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-start-service-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">${tailoring ? 'بدء التفصيل' : 'بدء الخدمة'}</button>`;
    } else {
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-seat-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">جلّسه</button>`;
    }
    return `<div class="waitlist-card ${isLate ? 'late' : ''}" data-id="${r.id}">
      <div class="wl-card-top">
        <span class="wl-rank">${i+1}</span>
        <div class="wl-name-block">
          <div class="wl-name">${escapeHtml(r.customer_name)}</div>
          ${r.customer_phone ? `<div class="wl-phone mono">${escapeHtml(r.customer_phone)}</div>` : ''}
        </div>
        <span class="wl-wait-badge ${isLate ? 'late' : ''}">${isAdvanceBooking ? reservationTimeLabel(r.reserved_for) : elapsedMinutesLabel(r.created_at)}</span>
      </div>
      <div class="wl-card-meta">
        ${tailoring ? `<span class="wl-pill${r.status==='ready_for_pickup'?' ready':''}">${escapeHtml(TAILORING_STATUS_LABELS[r.status] || r.status)}</span>` : ''}
        ${noResource ? '' : `<span class="wl-pill">${r.party_size} أشخاص</span>`}
        ${section ? `<span class="wl-pill">يفضل ${escapeHtml(section.name)}</span>` : ''}
        ${r.customer_address_text ? `<span class="wl-pill">${escapeHtml(r.customer_address_text)}</span>` : ''}
        ${isAdvanceBooking ? `<span class="wl-pill">حجز مسبق</span>` : ''}
        ${isLate ? `<span class="wl-pill late">متأخر</span>` : ''}
      </div>
      <div class="wl-actions">
        ${telUrl ? `<a href="${escapeHtml(telUrl)}" class="wl-contact-btn" title="اتصال">📞</a>` : ''}
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="واتساب">💬</a>` : ''}
        ${mapUrl ? `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="الموقع">📍</a>` : ''}
        ${actionBtnHtml}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.wl-seat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = list.find(r => String(r.id) === btn.dataset.id);
      if(entry) openWaitlistSeatPicker(entry);
    });
  });
  el.querySelectorAll('.wl-start-service-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('start_mobile_service', { p_reservation_id: parseInt(btn.dataset.id, 10) });
        if(error) throw error;
        showToast(isTailoringBusiness() ? 'تم بدء التفصيل' : 'تم بدء الخدمة — الفريق في الطريق');
        renderWaitlist();
      } catch(err){
        showToast('تعذر البدء: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('.wl-mark-ready-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('mark_reservation_ready', { p_reservation_id: parseInt(btn.dataset.id, 10) });
        if(error) throw error;
        showToast('تم تجهيز الطلب — جاهز للاستلام');
        renderWaitlist();
      } catch(err){
        showToast('تعذر التحديث: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('.wl-complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('complete_reservation', { p_reservation_id: parseInt(btn.dataset.id, 10) });
        if(error) throw error;
        showToast('تم تسليم الطلب للعميل');
        renderWaitlist();
      } catch(err){
        showToast('تعذر التحديث: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('.waitlist-card').forEach(row => {
    row.addEventListener('click', (e) => {
      if(e.target.closest('.wl-seat-btn') || e.target.closest('.wl-contact-btn') || e.target.closest('.wl-start-service-btn')
        || e.target.closest('.wl-mark-ready-btn') || e.target.closest('.wl-complete-btn')) return;
      const entry = list.find(r => String(r.id) === row.dataset.id);
      if(entry) renderWaitlistDetailStep(entry);
    });
  });
}

// Free WhatsApp reminders (see approved plan) — no Business API send, since
// that's metered per-message (Meta's July 2025 pricing change) and would
// bill Rakeen's own shared number, not the individual business. Instead:
// two windows (day-before, 2-hours-before) computed live from
// table_reservations; staff taps a wa.me link that opens THEIR OWN
// WhatsApp app — zero cost, ordinary person-to-person message — then marks
// that specific reminder handled so it stops reappearing.
async function renderReminders(){
  const el = document.getElementById('remindersList');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient.from('table_reservations')
    .select('id, customer_name, customer_phone, reserved_for, service_id, reminder_day_before_sent, reminder_hours_before_sent')
    .eq('branch_id', DEVICE.branchId).eq('status', 'upcoming')
    .gt('reserved_for', new Date().toISOString())
    .order('reserved_for').limit(1000);

  const now = Date.now();
  const tomorrowStr = new Date(now + 24 * 60 * 60000).toDateString();
  const items = [];
  (data || []).forEach(r => {
    const t = new Date(r.reserved_for).getTime();
    if(!r.reminder_day_before_sent && new Date(r.reserved_for).toDateString() === tomorrowStr){
      items.push({...r, kind: 'day_before', label: 'تذكير قبل يوم'});
    }
    if(!r.reminder_hours_before_sent && t > now && t - now <= 2 * 60 * 60000){
      items.push({...r, kind: 'hours_before', label: 'تذكير قبل ساعتين'});
    }
  });
  REMINDERS_CACHE = items;

  const countBadge = document.getElementById('remindersCount');
  countBadge.style.display = items.length ? '' : 'none';
  countBadge.textContent = items.length;
  if(!items.length){ el.innerHTML = '<div class="list-empty">ما فيه أحد يحتاج تذكير الآن.</div>'; return; }

  el.innerHTML = items.map((r, i) => {
    const service = PRODUCTS.find(p => p.id === r.service_id);
    const waMessage = `مرحبا ${r.customer_name}، تذكير بموعدك${service ? ' (' + service.name + ')' : ''} الساعة ${reservationTimeLabel(r.reserved_for)}${DEVICE.branchName ? ' في ' + DEVICE.branchName : ''}.`;
    const waUrl = r.customer_phone ? waPhoneUrl(r.customer_phone, waMessage) : null;
    return `<div class="waitlist-card" data-idx="${i}">
      <div class="wl-card-top">
        <div class="wl-name-block">
          <div class="wl-name">${escapeHtml(r.customer_name)}</div>
          ${r.customer_phone ? `<div class="wl-phone mono">${escapeHtml(r.customer_phone)}</div>` : ''}
        </div>
        <span class="wl-wait-badge">${reservationTimeLabel(r.reserved_for)}</span>
      </div>
      <div class="wl-card-meta">
        <span class="wl-pill">${escapeHtml(r.label)}</span>
        ${service ? `<span class="wl-pill">${escapeHtml(service.name)}</span>` : ''}
      </div>
      <div class="wl-actions">
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="واتساب">💬</a>` : '<span></span>'}
        <button type="button" class="confirm-pay-btn reminder-sent-btn" data-idx="${i}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تم التذكير ✓</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.reminder-sent-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = items[parseInt(btn.dataset.idx, 10)];
      const field = r.kind === 'day_before' ? 'reminder_day_before_sent' : 'reminder_hours_before_sent';
      await window.supabaseClient.from('table_reservations').update({ [field]: true }).eq('id', r.id);
      showToast('تم تسجيل التذكير');
      renderReminders();
    });
  });
}

function renderWaitlistDetailStep(entry){
  document.getElementById('paymentModalTitle').textContent = entry.customer_name;
  const section = TABLE_SECTIONS_LIST.find(s => s.id === entry.preferred_section_id);
  const noResource = hasNoPhysicalResource();
  const tailoring = isTailoringBusiness();
  const mapUrl = (entry.customer_lat != null && entry.customer_lng != null) ? `https://maps.google.com/?q=${entry.customer_lat},${entry.customer_lng}` : null;
  // A tailoring order past 'upcoming' is already in progress — "لم يحضر"
  // (no-show) only makes sense while still waiting to be started.
  const showNoShow = entry.status === 'upcoming';
  let primaryLabel, primaryAction;
  if(tailoring && entry.status === 'seated'){
    primaryLabel = 'جاهز للاستلام';
    primaryAction = 'mark_reservation_ready';
  } else if(tailoring && entry.status === 'ready_for_pickup'){
    primaryLabel = 'تسليم للعميل';
    primaryAction = 'complete_reservation';
  } else if(noResource){
    primaryLabel = tailoring ? 'بدء التفصيل' : 'بدء الخدمة';
    primaryAction = 'start_mobile_service';
  } else {
    primaryLabel = 'جلّسه';
    primaryAction = null; // opens the table picker instead of an RPC call
  }
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">${tailoring ? escapeHtml(TAILORING_STATUS_LABELS[entry.status] || '') + ' — ' : (noResource ? '' : entry.party_size + ' أشخاص')}${section ? ' — يفضل ' + escapeHtml(section.name) : ''} — ${reservationTimeLabel(entry.reserved_for)}</p>
    ${entry.customer_phone ? `<p class="pos-modal-hint">الجوال: <span class="mono">${escapeHtml(entry.customer_phone)}</span></p>` : ''}
    ${entry.customer_address_text ? `<p class="pos-modal-hint">العنوان: ${escapeHtml(entry.customer_address_text)}</p>` : ''}
    ${mapUrl ? `<p class="pos-modal-hint"><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">📍 فتح الموقع على الخريطة</a></p>` : ''}
    <button class="confirm-pay-btn" id="wlDetailSeatBtn">${primaryLabel}</button>
    ${showNoShow ? `<button class="loyalty-otp-back" id="wlDetailNoShowBtn">لم يحضر</button>` : ''}
  `;
  document.getElementById('wlDetailSeatBtn').addEventListener('click', async () => {
    if(primaryAction){
      const { error } = await window.supabaseClient.rpc(primaryAction, { p_reservation_id: entry.id });
      if(error){ showToast('تعذر التحديث: ' + error.message); return; }
      showToast('تم التحديث');
      closePaymentModalNow();
      renderWaitlist();
    } else {
      openWaitlistSeatPicker(entry);
    }
  });
  const noShowBtn = document.getElementById('wlDetailNoShowBtn');
  if(noShowBtn) noShowBtn.addEventListener('click', async () => {
    if(!window.confirm('تأكيد إن العميل ما حضر؟')) return;
    await window.supabaseClient.from('table_reservations').update({status: 'no_show'}).eq('id', entry.id);
    showToast('تم تسجيل عدم الحضور');
    closePaymentModalNow();
    renderWaitlist();
  });
}

/* ============ Hotel (roadmap item 7) — الاستقبال ============
   Reuses the exact #tablesFloorPane/#tablesWaitlistPane containers
   restaurant floor/waitlist rendering uses (relabeled "الغرف"/"الحجوزات"
   above), but with two brand-new render functions and two new tables
   (hotel_rooms/hotel_bookings) — table_reservations/restaurant_tables are
   timestamptz/dine-in-order-specific and don't fit a multi-night date-range
   stay. Room TYPES are ordinary `services` rows (isServiceBusiness()
   already includes 'hotel'), so they already show up in PRODUCTS/SERVICES
   with zero extra code — this block only deals with physical rooms and
   bookings. Checkout reuses the entire existing cart/payment/
   complete_pos_order pipeline unmodified (see the completePayment() hook
   below) — no new payment code anywhere in this feature. */
let hotelRealtimeChannel = null;

function renderHotelActiveTab(){
  if(tablesActiveTab === 'waitlist') renderHotelBookingsList();
  else renderHotelRoomsGrid();
}

function hotelRoomTypeName(serviceId){
  const p = PRODUCTS.find(p => p.isService && -p.id === serviceId);
  return p ? p.name : 'نوع غير معروف';
}

async function renderHotelRoomsGrid(){
  const el = document.getElementById('tablesGrid');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient
    .from('hotel_rooms').select('*').eq('branch_id', DEVICE.branchId).eq('active', true).order('room_number');
  const rooms = data || [];
  HOTEL_ROOMS_CACHE = rooms;
  if(rooms.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه غرف مسجّلة لهذا الفرع — أضفها من لوحة التحكم.</div>'; return; }

  const legendHtml = `<div class="table-legend">
    <div class="legend-item"><span class="legend-dot" style="background:var(--surf2);"></span>متاحة</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--lime);"></span>مشغولة</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--muted);"></span>تنظيف</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--danger);"></span>صيانة</div>
  </div>`;

  el.innerHTML = legendHtml + rooms.map(r => {
    const mins = Math.floor((Date.now() - new Date(r.status_changed_at).getTime()) / 60000);
    const subBadge = (r.status === 'cleaning' || r.status === 'maintenance')
      ? `<span class="table-turn-timer${turnTimerSeverityClass(mins)}">${elapsedMinutesLabel(r.status_changed_at)}</span>` : '';
    return `<div class="table-card ${r.status}" data-id="${r.id}" data-status="${r.status}" role="button" tabindex="0">
      <span class="table-num">${r.room_number}</span>
      <span class="table-status">${HOTEL_ROOM_STATUS_LABELS[r.status] || r.status}</span>
      ${subBadge}
      <span class="table-reservation-badge" style="pointer-events:none;">${hotelRoomTypeName(r.room_type_service_id)}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', () => {
      const room = rooms.find(r => String(r.id) === card.dataset.id);
      if(room) openHotelRoomActionSheet(room);
    });
  });
}

function openHotelRoomActionSheet(room){
  resetModalStack(() => renderHotelRoomActionSheet(room));
  paymentModal.classList.add('show');
}

function renderHotelRoomActionSheet(room){
  document.getElementById('paymentModalTitle').textContent = 'غرفة ' + room.room_number;
  const actions = [];
  if(room.status === 'cleaning' || room.status === 'maintenance'){
    actions.push({label:'وضعها متاحة', next:'available'});
  }
  if(room.status === 'available'){
    actions.push({label:'وضعها تحت الصيانة', next:'maintenance'});
  }
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">${hotelRoomTypeName(room.room_type_service_id)} — ${HOTEL_ROOM_STATUS_LABELS[room.status] || room.status}</p>
    ${actions.map(a => `<button class="confirm-pay-btn" data-next="${a.next}" style="margin-top:8px;">${a.label}</button>`).join('')}
  `;
  paymentModalBody.querySelectorAll('button[data-next]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await window.supabaseClient.from('hotel_rooms').update({ status: btn.dataset.next }).eq('id', room.id);
      if(error){ showToast('تعذر التحديث'); btn.disabled = false; return; }
      showToast('تم التحديث');
      closePaymentModalNow();
      renderHotelRoomsGrid();
    });
  });
}

async function renderHotelBookingsList(){
  const el = document.getElementById('waitlistList');
  const countBadge = document.getElementById('waitlistCount');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient.from('hotel_bookings')
    .select('id, room_type_service_id, guest_name, guest_phone, check_in_date, check_out_date, nights, rate_per_night, status, created_at')
    .eq('branch_id', DEVICE.branchId).in('status', ['upcoming','checked_in']).order('check_in_date');
  const bookings = data || [];
  HOTEL_BOOKINGS_CACHE = bookings;
  countBadge.style.display = bookings.length ? '' : 'none';
  countBadge.textContent = bookings.length;
  if(bookings.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه حجوزات حالياً.</div>'; return; }

  el.innerHTML = bookings.map(b => {
    const telUrl = b.guest_phone ? `tel:${b.guest_phone}` : null;
    const waUrl = b.guest_phone ? waPhoneUrl(b.guest_phone, `مرحبا ${b.guest_name}، بخصوص حجزكم في ${DEVICE.branchName || ''}`) : null;
    const actionBtn = b.status === 'upcoming'
      ? `<button type="button" class="confirm-pay-btn wl-hotel-checkin-btn" data-id="${b.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تسجيل الوصول</button>`
      : `<button type="button" class="confirm-pay-btn wl-hotel-checkout-btn" data-id="${b.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تسجيل المغادرة</button>`;
    return `<div class="waitlist-card" data-id="${b.id}">
      <div class="wl-card-top">
        <div class="wl-name-block">
          <div class="wl-name">${escapeHtml(b.guest_name)}</div>
          ${b.guest_phone ? `<div class="wl-phone mono">${escapeHtml(b.guest_phone)}</div>` : ''}
        </div>
        <span class="wl-wait-badge">${escapeHtml(HOTEL_BOOKING_STATUS_LABELS[b.status] || b.status)}</span>
      </div>
      <div class="wl-card-meta">
        <span class="wl-pill">${escapeHtml(hotelRoomTypeName(b.room_type_service_id))}</span>
        <span class="wl-pill">${b.check_in_date} → ${b.check_out_date} (${b.nights} ليالي)</span>
      </div>
      <div class="wl-actions">
        ${telUrl ? `<a href="${escapeHtml(telUrl)}" class="wl-contact-btn" title="اتصال">📞</a>` : ''}
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="واتساب">💬</a>` : ''}
        ${actionBtn}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.wl-hotel-checkin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const booking = bookings.find(b => String(b.id) === btn.dataset.id);
      if(booking) openHotelCheckinRoomPicker(booking);
    });
  });
  el.querySelectorAll('.wl-hotel-checkout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const booking = bookings.find(b => String(b.id) === btn.dataset.id);
      if(booking) startHotelCheckout(booking);
    });
  });
}

function openHotelCheckinRoomPicker(booking){
  resetModalStack(() => renderHotelCheckinRoomPickerStep(booking));
  paymentModal.classList.add('show');
}

function renderHotelCheckinRoomPickerStep(booking){
  document.getElementById('paymentModalTitle').textContent = 'تسجيل وصول ' + booking.guest_name + ' — اختر غرفة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('hotel_rooms').select('*')
    .eq('branch_id', DEVICE.branchId).eq('room_type_service_id', booking.room_type_service_id)
    .eq('status', 'available').eq('active', true).order('room_number')
    .then(({data}) => {
      const rooms = data || [];
      if(!rooms.length){
        paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه غرف متاحة من هذا النوع الحين.</p>`;
        return;
      }
      paymentModalBody.innerHTML = `<div class="table-picker-grid">${rooms.map(r =>
        `<button type="button" class="table-picker-btn" data-id="${r.id}" data-number="${r.room_number}">${r.room_number}</button>`
      ).join('')}</div>`;
      paymentModalBody.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const { error } = await window.supabaseClient.rpc('checkin_hotel_booking', { p_booking_id: booking.id, p_room_id: Number(btn.dataset.id) });
          if(error){ showToast('تعذر تسجيل الوصول: ' + error.message); renderHotelCheckinRoomPickerStep(booking); return; }
          showToast('تم تسجيل الوصول — غرفة ' + btn.dataset.number);
          closePaymentModalNow();
          renderHotelBookingsList();
        });
      });
    });
}

// Loads the booking's room-type service into the cart at qty=nights, then
// sends the cashier to Home to complete the EXISTING payment flow — no new
// payment code. completePayment() checks pendingHotelCheckoutBookingId
// after a successful order and calls finalize_hotel_checkout to link the
// order back to the booking and flip the room to 'cleaning'.
function startHotelCheckout(booking){
  const product = PRODUCTS.find(p => p.isService && -p.id === booking.room_type_service_id);
  if(!product){ showToast('تعذر إيجاد نوع الغرفة بقائمة المنتجات'); return; }
  addToCartWithConfig(product, null, booking.nights);
  pendingHotelCheckoutBookingId = booking.id;
  showToast('تمت إضافة الإقامة للسلة — أكمل الدفع من الرئيسية');
  const homeBtn = document.querySelector('.nav-tab[data-screen="home"]');
  if(homeBtn) homeBtn.click();
}

function openNewHotelBookingModal(){
  resetModalStack(renderNewHotelBookingStep);
  paymentModal.classList.add('show');
}

function renderNewHotelBookingStep(){
  document.getElementById('paymentModalTitle').textContent = 'حجز جديد';
  const roomTypes = PRODUCTS.filter(p => p.isService);
  if(!roomTypes.length){
    paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه أنواع غرف مضافة بعد — أضفها من "الخدمات" باللوحة أولاً.</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  paymentModalBody.innerHTML = `
    <div class="pos-auth-field">
      <label>نوع الغرفة</label>
      <select id="hbRoomType">${roomTypes.map(p => `<option value="${-p.id}">${p.name} — ${p.price.toFixed(2)} ر.س/ليلة</option>`).join('')}</select>
    </div>
    <div class="pos-auth-field" style="display:flex; gap:10px;">
      <div style="flex:1;">
        <label>تاريخ الوصول</label>
        <input type="date" id="hbCheckIn" min="${today}" value="${today}">
      </div>
      <div style="flex:1;">
        <label>تاريخ المغادرة</label>
        <input type="date" id="hbCheckOut" min="${today}">
      </div>
    </div>
    <button type="button" class="confirm-pay-btn" id="hbCheckAvailBtn" style="background:var(--surf2); color:var(--text);">تحقق من التوفر</button>
    <p class="pos-modal-hint" id="hbAvailResult"></p>
    <div class="pos-auth-field">
      <label>اسم النزيل</label>
      <input type="text" id="hbGuestName" placeholder="اسم النزيل">
    </div>
    <div class="pos-auth-field">
      <label>رقم الجوال (اختياري)</label>
      <input type="text" id="hbGuestPhone" placeholder="05xxxxxxxx" inputmode="tel">
    </div>
    <button type="button" class="confirm-pay-btn" id="hbConfirmBtn" disabled>تأكيد الحجز</button>
  `;
  let lastCheckedAvailable = false;
  document.getElementById('hbCheckAvailBtn').addEventListener('click', async () => {
    const roomTypeServiceId = Number(document.getElementById('hbRoomType').value);
    const checkIn = document.getElementById('hbCheckIn').value;
    const checkOut = document.getElementById('hbCheckOut').value;
    const resultEl = document.getElementById('hbAvailResult');
    const confirmBtn = document.getElementById('hbConfirmBtn');
    if(!checkIn || !checkOut || checkOut <= checkIn){
      resultEl.textContent = 'تأكد إن تاريخ المغادرة بعد تاريخ الوصول.';
      confirmBtn.disabled = true; lastCheckedAvailable = false;
      return;
    }
    resultEl.textContent = 'جارٍ التحقق...';
    const { data, error } = await window.supabaseClient.rpc('hotel_room_availability', { p_room_type_service_id: roomTypeServiceId, p_check_in: checkIn, p_check_out: checkOut });
    if(error){ resultEl.textContent = 'تعذر التحقق من التوفر.'; confirmBtn.disabled = true; lastCheckedAvailable = false; return; }
    lastCheckedAvailable = data > 0;
    resultEl.textContent = data > 0 ? ('متاح ' + data + ' غرفة بهذي التواريخ.') : 'ما فيه غرف متاحة بهذي التواريخ.';
    confirmBtn.disabled = !lastCheckedAvailable;
  });
  document.getElementById('hbConfirmBtn').addEventListener('click', async () => {
    if(!lastCheckedAvailable) return;
    const guestName = document.getElementById('hbGuestName').value.trim();
    if(!guestName){ showToast('لازم تكتب اسم النزيل'); return; }
    const confirmBtn = document.getElementById('hbConfirmBtn');
    confirmBtn.disabled = true;
    const { error } = await window.supabaseClient.rpc('create_hotel_booking', {
      p_branch_id: DEVICE.branchId,
      p_room_type_service_id: Number(document.getElementById('hbRoomType').value),
      p_guest_name: guestName,
      p_guest_phone: document.getElementById('hbGuestPhone').value.trim() || null,
      p_check_in: document.getElementById('hbCheckIn').value,
      p_check_out: document.getElementById('hbCheckOut').value,
    });
    if(error){ showToast('تعذر إنشاء الحجز: ' + error.message); confirmBtn.disabled = false; return; }
    showToast('تم إنشاء الحجز');
    closePaymentModalNow();
    renderHotelBookingsList();
  });
}

function subscribeToHotelChanges(){
  if(hotelRealtimeChannel) return;
  hotelRealtimeChannel = window.supabaseClient
    .channel('pos-hotel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_rooms' }, ()=>{
      if(document.getElementById('screen-tables').classList.contains('active')) renderHotelActiveTab();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_bookings' }, ()=>{
      if(document.getElementById('screen-tables').classList.contains('active')) renderHotelActiveTab();
    })
    .subscribe();
}

function openWaitlistSeatPicker(entry){
  resetModalStack(() => renderWaitlistSeatPickerStep(entry));
  paymentModal.classList.add('show');
}

// Includes 'cleaning' tables (not just 'available') — a table that needs
// bussing is still a real, bookable table, the cashier just needs to see
// that plainly and confirm before seating someone on it. seat_waitlist_entry
// itself accepts either status server-side.
function renderWaitlistSeatPickerStep(entry){
  document.getElementById('paymentModalTitle').textContent = 'جلّس ' + entry.customer_name + ' — اختر طاولة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('restaurant_tables').select('*')
    .eq('branch_id', DEVICE.branchId).in('status', ['available','cleaning']).order('number')
    .then(({data}) => {
      const tables = data || [];
      if(!tables.length){
        paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه طاولات متاحة الحين.</p>`;
        return;
      }
      const groups = groupTablesForDisplay(tables);
      let html = `<div class="table-picker-grid">`;
      groups.forEach(g => {
        if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}${g.section.id === entry.preferred_section_id ? ' ★' : ''}</span></div>`;
        html += g.tables.map(t => `<button type="button" class="table-picker-btn${t.status==='cleaning'?' needs-cleaning':''}" data-id="${t.id}" data-number="${t.number}" data-status="${t.status}">${t.number}${t.status==='cleaning'?'<span class="tpb-clean-flag">🧹</span>':''}</button>`).join('');
      });
      html += `</div>`;
      paymentModalBody.innerHTML = html;
      document.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if(btn.dataset.status === 'cleaning' && !window.confirm('طاولة ' + btn.dataset.number + ' تحتاج تنظيف — تأكيد الجلوس فيها؟')) return;
          const tableId = Number(btn.dataset.id);
          const { error } = await window.supabaseClient.rpc('seat_waitlist_entry', { p_reservation_id: entry.id, p_table_id: tableId });
          if(error){ showToast('تعذر تجليس الطاولة — تحقق من حالتها'); renderWaitlistSeatPickerStep(entry); return; }
          showToast('طاولة ' + btn.dataset.number + ' — بانتظار الطلب');
          closePaymentModalNow();
          document.querySelector('.nav-tab[data-screen="tables"]').click();
        });
      });
    });
}

function defaultWaitlistTime(){
  return new Date().toTimeString().slice(0, 5);
}

function renderAddToWaitlistStep(){
  document.getElementById('paymentModalTitle').textContent = 'إضافة لقائمة الانتظار';
  const depositLine = TABLES_RESERVATION_DEPOSIT_ENABLED
    ? `<p class="pos-modal-hint">عربون مقترح: ${TABLES_RESERVATION_DEPOSIT_PERCENT}٪ من قيمة الطلب المتوقعة — يُحصّل يدويًا، ما فيه دفع أونلاين مربوط حاليًا.</p>` : '';
  const sectionOptions = TABLE_SECTIONS_LIST.length ? `
    <div class="pos-auth-field" id="wlSectionField">
      <label>يفضّل قسم (اختياري)</label>
      <div class="channel-row" id="wlSectionRow">
        <button type="button" class="channel-btn active" data-section="">بدون تفضيل</button>
        ${TABLE_SECTIONS_LIST.map(s=>`<button type="button" class="channel-btn" data-section="${s.id}">${s.name}</button>`).join('')}
      </div>
    </div>` : '';
  // Specific-table advance booking is an owner-opt-in layer on top of the
  // general FIFO queue, not a replacement — most restaurants just want the
  // walk-in queue, so this whole block only exists when explicitly enabled.
  const specificBookingToggle = TABLES_SPECIFIC_BOOKING_ENABLED ? `
    <div class="pos-auth-field">
      <label>حجز طاولة محددة؟</label>
      <div class="channel-row" id="wlSpecificRow">
        <button type="button" class="channel-btn active" data-specific="no">لا — قائمة انتظار عادية</button>
        <button type="button" class="channel-btn" data-specific="yes">نعم — طاولة معينة</button>
      </div>
    </div>
    <div class="pos-auth-field hidden" id="wlTableField">
      <label>اختر الطاولة</label>
      <div class="table-picker-grid" id="wlTableGrid"><div class="list-empty">جارٍ التحميل...</div></div>
    </div>` : '';
  paymentModalBody.innerHTML = `
    <div class="pos-auth-field">
      <label>اسم العميل</label>
      <input type="text" id="wlNameInput" placeholder="اسم العميل">
    </div>
    <div class="pos-auth-field">
      <label>رقم الجوال (اختياري — للتواصل عند توفر طاولة)</label>
      <input type="text" id="wlPhoneInput" placeholder="05xxxxxxxx" inputmode="tel">
    </div>
    <div class="pos-auth-field">
      <label>عدد الأشخاص</label>
      <div class="channel-row" id="wlPartyRow">
        ${WAITLIST_PARTY_PRESETS.map((n,i)=>`<button type="button" class="channel-btn ${i===0?'active':''}" data-party="${n}">${n}</button>`).join('')}
      </div>
    </div>
    ${specificBookingToggle}
    ${sectionOptions}
    <div class="pos-auth-field">
      <label>حجز فوري أو لوقت لاحق؟</label>
      <div class="channel-row" id="wlTimingRow">
        <button type="button" class="channel-btn active" data-timing="now">الآن</button>
        <button type="button" class="channel-btn" data-timing="later">وقت لاحق</button>
      </div>
    </div>
    <div class="pos-auth-field hidden" id="wlTimeField">
      <label>الوقت</label>
      <input type="time" id="wlTimeInput" value="${defaultWaitlistTime()}">
    </div>
    ${depositLine}
    <button class="confirm-pay-btn" id="wlSaveBtn" disabled>إضافة للقائمة</button>
  `;
  let selectedParty = WAITLIST_PARTY_PRESETS[0];
  let selectedSection = '';
  let selectedTiming = 'now';
  let selectedTableId = null;

  const nameInput = document.getElementById('wlNameInput');
  const saveBtn = document.getElementById('wlSaveBtn');
  const validate = () => { saveBtn.disabled = !nameInput.value.trim(); };
  nameInput.addEventListener('input', validate);
  nameInput.focus();

  document.getElementById('wlPartyRow').addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#wlPartyRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    selectedParty = Number(btn.dataset.party);
  });
  const sectionRow = document.getElementById('wlSectionRow');
  if(sectionRow) sectionRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#wlSectionRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    selectedSection = btn.dataset.section;
  });
  const specificRow = document.getElementById('wlSpecificRow');
  if(specificRow){
    let tablesLoaded = false;
    specificRow.addEventListener('click', (e)=>{
      const btn = e.target.closest('.channel-btn'); if(!btn) return;
      document.querySelectorAll('#wlSpecificRow .channel-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const isSpecific = btn.dataset.specific === 'yes';
      document.getElementById('wlTableField').classList.toggle('hidden', !isSpecific);
      const sectionField = document.getElementById('wlSectionField');
      if(sectionField) sectionField.classList.toggle('hidden', isSpecific);
      if(!isSpecific){ selectedTableId = null; return; }
      if(tablesLoaded) return;
      tablesLoaded = true;
      // Booking for a future time — show every table regardless of its
      // current live status, not just what's free right this second.
      window.supabaseClient.from('restaurant_tables').select('*')
        .eq('branch_id', DEVICE.branchId).order('number')
        .then(({data}) => {
          const tables = data || [];
          const groups = groupTablesForDisplay(tables);
          document.getElementById('wlTableGrid').innerHTML = groups.map(g => {
            let html = g.section ? `<div class="tables-section-header"><span>${g.section.name}</span></div>` : '';
            return html + g.tables.map(t => `<button type="button" class="table-picker-btn" data-id="${t.id}">${t.number}</button>`).join('');
          }).join('');
          document.querySelectorAll('#wlTableGrid .table-picker-btn').forEach(tb => {
            tb.addEventListener('click', () => {
              document.querySelectorAll('#wlTableGrid .table-picker-btn').forEach(b=>b.classList.remove('active'));
              tb.classList.add('active');
              selectedTableId = Number(tb.dataset.id);
            });
          });
        });
    });
  }
  document.getElementById('wlTimingRow').addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#wlTimingRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    selectedTiming = btn.dataset.timing;
    document.getElementById('wlTimeField').classList.toggle('hidden', selectedTiming !== 'later');
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'جارٍ الحفظ...';

    let reservedFor = new Date();
    if(selectedTiming === 'later'){
      const [hh, mm] = document.getElementById('wlTimeInput').value.split(':').map(Number);
      reservedFor.setHours(hh, mm, 0, 0);
      if(reservedFor < new Date()) reservedFor.setDate(reservedFor.getDate() + 1);
    }

    const { error } = await window.supabaseClient.from('table_reservations').insert({
      business_id: DEVICE.businessId, branch_id: DEVICE.branchId, table_id: selectedTableId,
      customer_name: nameInput.value.trim(),
      customer_phone: document.getElementById('wlPhoneInput').value.trim() || null,
      party_size: selectedParty,
      preferred_section_id: selectedTableId ? null : (selectedSection ? Number(selectedSection) : null),
      reserved_for: reservedFor.toISOString(),
    });
    if(error){ showToast('تعذر الحفظ'); saveBtn.disabled = false; saveBtn.textContent = 'إضافة للقائمة'; return; }
    showToast(selectedTableId ? 'تم حجز الطاولة' : 'تمت الإضافة لقائمة الانتظار');
    closePaymentModalNow();
    renderWaitlist();
  });
}

/* ============ DELIVERY screen — prep-time countdown ============
   Every delivery order gets a max-prep-time countdown (platform's own
   prep_timeout_minutes, Settings → منصات التوصيل) starting from created_at.
   "جاهز" is a separate signal from payment status — the sale is already
   financially complete the instant it was rung up (complete_pos_order always
   inserts status:'completed'), so today's sales/VAT figures never wait on
   the kitchen. Active orders here are split by urgency across the "جديدة"/
   "قيد التجهيز" tabs (same underlying list, filtered by remaining time) so
   the tab bar doubles as a triage view instead of an artificial pipeline
   stage that doesn't exist in the schema. */
let deliveryActiveTab = 'new';
// readyAt is null while still in prep (racing the countdown), set once the
// cashier taps "جاهز" — the order STAYS in this array after that (it used to
// be removed here, which is exactly why an order handed to the delivery rep
// used to vanish from "الطلبات الجارية" with no way to confirm it actually
// got delivered) until markDeliveryOrderDelivered() removes it for real.
let ACTIVE_DELIVERY_ORDERS = []; // [{id, createdAt, platformId, platformName, total, invoiceLast4, warnedAt5min, alertedExpired, readyAt}]

function deliveryOrderRemainingSeconds(order){
  const timeoutMin = PREP_TIMEOUT_MINUTES_BY_PLATFORM[order.platformId] || 17;
  const elapsedSec = (Date.now() - order.createdAt.getTime()) / 1000;
  return Math.round(timeoutMin * 60 - elapsedSec);
}

// Real, not decorative: lit only while at least one delivery order is
// within 5 minutes of (or past) its prep deadline — the same threshold
// that drives the "قيد التجهيز" tab and the warning/expired alerts.
function updateNotifBell(){
  const dot = document.getElementById('notifBellDot');
  // Only the not-yet-ready orders race a prep deadline — a ready order's
  // "remaining" time is meaningless (and would just count further and
  // further negative forever), so it must never factor into "urgent".
  const urgent = ACTIVE_DELIVERY_ORDERS.some(o => !o.readyAt && deliveryOrderRemainingSeconds(o) <= 300);
  dot.style.display = urgent ? 'block' : 'none';
}
document.getElementById('notifBellBtn').addEventListener('click', ()=>{
  document.querySelector('.nav-tab[data-screen="orders"]').click();
  document.querySelector('#ordersTabs .seg-tab[data-tab="running"]').click();
});

function registerActiveDeliveryOrder(orderId, payload){
  const platform = DELIVERY_PLATFORMS_LIST.find(p=>p.id === payload.delivery_platform_id);
  ACTIVE_DELIVERY_ORDERS.push({
    id: orderId, createdAt: new Date(), platformId: payload.delivery_platform_id,
    platformName: platform ? platform.name : 'توصيل', total: payload.total, isOnline: false,
    invoiceLast4: payload.platform_invoice_last4, warnedAt5min: false, alertedExpired: false, readyAt: null, outForDeliveryAt: null
  });
  if(NOTIFY_SOUND_ENABLED) playAlertSound('new_order');
  updateNotifBell();
  if(document.getElementById('screen-orders').classList.contains('active') && ordersActiveTab === 'running') renderOrdersList();
}

async function seedActiveDeliveryOrders(){
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  // is('delivered_at', null) — not is('ready_at', null) — since a ready order
  // still belongs on this list (awaiting a delivered confirmation); only a
  // genuinely delivered order is done and should drop off.
  const { data } = await window.supabaseClient
    .from('orders').select('id, total, created_at, ready_at, out_for_delivery_at, delivery_platform_id, platform_invoice_last4, source, payment_method, payment_status, delivery_platforms(name)')
    .eq('branch_id', DEVICE.branchId).eq('channel', 'delivery').is('delivered_at', null)
    .gte('created_at', startToday.toISOString()).order('created_at', {ascending:true});
  ACTIVE_DELIVERY_ORDERS = (data||[]).map(o=>({
    id: o.id, createdAt: new Date(o.created_at), platformId: o.delivery_platform_id,
    platformName: o.source === 'online' ? 'متجر المطعم' : (o.delivery_platforms ? o.delivery_platforms.name : 'توصيل'),
    total: Number(o.total), isOnline: o.source === 'online',
    isCod: o.payment_method === 'cash' && o.payment_status === 'unpaid',
    invoiceLast4: o.platform_invoice_last4, warnedAt5min: false, alertedExpired: false,
    readyAt: o.ready_at ? new Date(o.ready_at) : null,
    outForDeliveryAt: o.out_for_delivery_at ? new Date(o.out_for_delivery_at) : null
  }));
}

function pad2(n){ return n < 10 ? '0' + n : String(n); }
function formatMmSs(totalSeconds){
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs/60), s = abs%60;
  return sign + pad2(m) + ':' + pad2(s);
}

async function markDeliveryOrderReady(orderId){
  // this device is the one marking it ready — skip the "kitchen marked it
  // ready" realtime alert below for this order so the cashier doesn't get
  // notified about their own action a moment later
  selfMarkedReadyOrderIds.add(orderId);
  const { data, error } = await window.supabaseClient.rpc('mark_delivery_order_ready', { p_order_id: orderId });
  if(error){ showToast('تعذر تسجيل الطلب جاهز'); return; }
  const row = Array.isArray(data) ? data[0] : data;
  const tracked = ACTIVE_DELIVERY_ORDERS.find(o=>o.id === orderId);
  if(tracked && tracked.isOnline){
    // Only the restaurant's own online orders get a real ready → delivered
    // handoff — a delivery-platform rider's drop-off is invisible to us, so
    // the RPC already auto-completed those (see mark_delivery_order_ready);
    // this just mirrors that by dropping it off the active list right away.
    tracked.readyAt = (row && row.ready_at) ? new Date(row.ready_at) : new Date();
  } else if(tracked){
    ACTIVE_DELIVERY_ORDERS = ACTIVE_DELIVERY_ORDERS.filter(o=>o.id !== orderId);
  }
  const secs = row ? row.prep_duration_seconds : null;
  showToast(secs != null ? `جاهز — استغرق ${formatMmSs(secs)}` : 'تم تسجيل الطلب جاهز');
  updateNotifBell();
  renderOrdersList();
}

// Cash on delivery: handing the order over and taking the money are the
// same moment, so they are one call. confirm_cod_collected marks it paid,
// attaches it to the open shift and records the handover together — an
// online cash order has no other way into a drawer total, because
// complete_pos_order is the only other function that ever writes shift_id.
async function collectCodIfOwed(order){
  if(!order.isCod) return { handled:false, ok:false };
  if(!CURRENT_SHIFT){ showToast('افتح وردية أولاً عشان يتسجل المبلغ فيها'); return { handled:true, ok:false }; }
  const { error } = await window.supabaseClient.rpc('confirm_cod_collected', {
    p_order_id: order.id, p_shift_id: CURRENT_SHIFT.id
  });
  if(error){ showToast(error.message || 'تعذر تسجيل استلام المبلغ'); return { handled:true, ok:false }; }
  return { handled:true, ok:true };
}

async function markDeliveryOrderDelivered(orderId){
  const tracked = ACTIVE_DELIVERY_ORDERS.find(o=>o.id === orderId);
  const collected = await collectCodIfOwed(tracked || {});
  if(collected.handled && !collected.ok) return;
  if(!collected.handled){
    const { error } = await window.supabaseClient.rpc('mark_delivery_order_delivered', { p_order_id: orderId });
    if(error){ showToast('تعذر تسجيل الطلب مُسلَّم'); return; }
  }
  ACTIVE_DELIVERY_ORDERS = ACTIVE_DELIVERY_ORDERS.filter(o=>o.id !== orderId);
  showToast(collected.ok ? 'تم التسليم واستلام المبلغ — طلب #' + orderId : 'تم تسليم الطلب #' + orderId);
  updateNotifBell();
  renderOrdersList();
}

// New, optional milestone — NOT required before markDeliveryOrderDelivered
// (its RPC's guard is untouched), so a cashier who's always gone
// ready→delivered directly keeps working exactly the same.
async function markDeliveryOrderOutForDelivery(orderId){
  const { error } = await window.supabaseClient.rpc('mark_order_out_for_delivery', { p_order_id: orderId });
  if(error){ showToast('تعذر تسجيل خروج الطلب للتوصيل'); return; }
  const tracked = ACTIVE_DELIVERY_ORDERS.find(o=>o.id === orderId);
  if(tracked) tracked.outForDeliveryAt = new Date();
  showToast('الطلب #' + orderId + ' خرج للتوصيل');
  renderOrdersList();
}

// ============ Active pickup orders (mirrors ACTIVE_DELIVERY_ORDERS above) ============
// Online pickup orders had no "جارية" (running) tracking at all before this
// — the instant accept_online_order flipped status pending→completed they
// vanished straight into the flat "مكتملة" list, indistinguishable from an
// order that's actually been picked up. This gives pickup the same
// ready → delivered handoff delivery already had, via the generic
// mark_order_ready (already existed, only ever called from the kitchen
// display before) / mark_order_delivered RPCs.
let ACTIVE_PICKUP_ORDERS = []; // [{id, createdAt, customerName, total, scheduledFor, scheduledByCustomer, readyAt}]

async function seedActivePickupOrders(){
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const { data } = await window.supabaseClient
    .from('orders').select('id, total, created_at, customer_name, ready_at, scheduled_for, scheduled_by_customer, payment_method, payment_status')
    .eq('branch_id', DEVICE.branchId).eq('channel', 'pickup').eq('source', 'online').eq('status', 'completed').is('delivered_at', null)
    .gte('created_at', startToday.toISOString()).order('created_at', {ascending:true});
  ACTIVE_PICKUP_ORDERS = (data||[]).map(o=>({
    id: o.id, createdAt: new Date(o.created_at), customerName: o.customer_name, total: Number(o.total),
    isCod: o.payment_method === 'cash' && o.payment_status === 'unpaid',
    scheduledFor: o.scheduled_for ? new Date(o.scheduled_for) : null, scheduledByCustomer: !!o.scheduled_by_customer,
    readyAt: o.ready_at ? new Date(o.ready_at) : null
  }));
}

function renderPickupCard(order){
  if(order.readyAt){
    const waitingSec = Math.round((Date.now() - order.readyAt.getTime()) / 1000);
    return `<div class="dorder-card out-for-delivery" data-order="${order.id}">
      <div class="dorder-out-icon">🛍️</div>
      <div class="dorder-info"><span class="dorder-id">#${order.id}</span></div>
      <div class="dorder-platform">${order.customerName ? escapeHtml(order.customerName) : 'استلام من الفرع'}</div>
      <div class="dorder-out-waiting mono">بانتظار الاستلام — ${formatMmSs(waitingSec)}</div>
      <div class="dorder-total">${rkMoney(order.total)}</div>
      <button class="pickup-delivered-btn" data-order-id="${order.id}">تم التسليم ✅</button>
    </div>`;
  }
  // ASAP shows a plain "الآن" — it's just this order's own prep estimate,
  // not a real commitment from the customer, so it doesn't deserve the same
  // visual weight as a time the customer actually chose (that case gets a
  // real alert instead, in the incoming-order modal — see renderIncomingOrderModal).
  const timeLabel = order.scheduledByCustomer && order.scheduledFor
    ? 'استلام ' + order.scheduledFor.toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})
    : 'استلام الآن';
  return `<div class="dorder-card" data-order="${order.id}">
    <div class="dorder-info"><span class="dorder-logo-initial" style="background:var(--lime);">🛍️</span><span class="dorder-id">#${order.id}</span></div>
    <div class="dorder-platform">${order.customerName ? escapeHtml(order.customerName) + ' — ' : ''}${timeLabel}</div>
    <div class="dorder-total">${rkMoney(order.total)}</div>
    <button class="pickup-ready-btn" data-order-id="${order.id}">جاهز</button>
  </div>`;
}

async function markPickupOrderReady(orderId){
  // same self-suppression trick as markDeliveryOrderReady — this device
  // already knows it just marked this ready, no need for its own realtime
  // "kitchen marked it ready" alert a moment later.
  selfMarkedReadyOrderIds.add(orderId);
  const { data, error } = await window.supabaseClient.rpc('mark_order_ready', { p_order_id: orderId });
  if(error){ showToast('تعذر تسجيل الطلب جاهز'); return; }
  const row = Array.isArray(data) ? data[0] : data;
  const tracked = ACTIVE_PICKUP_ORDERS.find(o=>o.id === orderId);
  if(tracked) tracked.readyAt = (row && row.ready_at) ? new Date(row.ready_at) : new Date();
  showToast('تم تسجيل الطلب جاهز للاستلام');
  renderOrdersList();
}

async function markPickupOrderDelivered(orderId){
  const tracked = ACTIVE_PICKUP_ORDERS.find(o=>o.id === orderId);
  const collected = await collectCodIfOwed(tracked || {});
  if(collected.handled && !collected.ok) return;
  if(!collected.handled){
    const { error } = await window.supabaseClient.rpc('mark_order_delivered', { p_order_id: orderId });
    if(error){ showToast('تعذر تسجيل تسليم الطلب'); return; }
  }
  ACTIVE_PICKUP_ORDERS = ACTIVE_PICKUP_ORDERS.filter(o=>o.id !== orderId);
  showToast(collected.ok ? 'تم التسليم واستلام المبلغ — طلب #' + orderId : 'تم تسليم الطلب #' + orderId);
  renderOrdersList();
}

// Ticks every second regardless of which POS screen is focused — the
// warning/expired alert must fire even if the cashier is busy on the order
// screen, not only while they happen to be looking at "التوصيل". The visual
// list only re-renders when the delivery screen is actually visible.
setInterval(()=>{
  if(ACTIVE_DELIVERY_ORDERS.length === 0) return;
  ACTIVE_DELIVERY_ORDERS.forEach(order=>{
    if(order.readyAt) return; // already handed to the delivery rep — the prep deadline this was racing no longer applies
    const remaining = deliveryOrderRemainingSeconds(order);
    if(!order.warnedAt5min && remaining <= 300 && remaining > 0){
      order.warnedAt5min = true;
      if(NOTIFY_DELIVERY_PREP_WARNING){
        if(NOTIFY_SOUND_ENABLED) playAlertSound('warning');
        showToast('طلب #' + order.id + ' — باقي ٥ دقائق على وقت التجهيز');
      }
    }
    if(!order.alertedExpired && remaining <= 0){
      order.alertedExpired = true;
      if(NOTIFY_DELIVERY_PREP_EXPIRED){
        if(NOTIFY_SOUND_ENABLED) playAlertSound('alarm');
        showToast('طلب #' + order.id + ' — انتهى وقت التجهيز المحدد');
      }
    }
  });
  // re-render every tick (not just on threshold crossings) so the visible
  // mm:ss actually counts down live — cheap since it's a small list and only
  // happens while the delivery screen is the one on screen.
  updateNotifBell();
  if(document.getElementById('screen-orders').classList.contains('active') && ordersActiveTab === 'running') renderOrdersList();
}, 1000);

/* ============ MORE screen ============ */
// Real audit finding: "customers" and "void" used to be here but only ever
// showed a toast saying the feature doesn't exist yet ("جاي بالنسخة الجاية")
// or pointed at a button that's already visible elsewhere on Home (the ✕ on
// every cart line) — a cashier tapping either learns nothing and gets
// nowhere, exactly the "tried them all, most don't do anything" complaint.
// Removed rather than kept as dead weight. "refund"/"reprint" stay, upgraded
// from a toast-only hint to actually opening Orders (pre-filtered to
// Completed for refund, since that's genuinely where both actions happen —
// there's no separate refund/reprint flow to build here, Orders already
// has it).
const QUICK_ACTIONS = [
  {id:'drawer', label:'فتح الدرج', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 7l4-4h12l4 4"/><line x1="12" y1="12" x2="12" y2="16"/></svg>'},
  {id:'refund', label:'استرجاع مبلغ', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>'},
  {id:'manager', label:'موافقة مدير', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'},
  {id:'reprint', label:'إعادة طباعة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'},
  {id:'scan', label:'مسح باركود', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>'}
];
const SHIFT_ACTIONS = [
  {id:'shiftSummary', label:'ملخص الوردية', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>'},
  {id:'closeShift', label:'إغلاق الوردية', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'},
  {id:'reprintClosing', label:'طباعة آخر موازنة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'},
  {id:'settings', label:'إعدادات الطباعة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'},
  {id:'diagnostics', label:'تشخيص النظام', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'}
];
document.getElementById('moreGridQuick').innerHTML = QUICK_ACTIONS.map(a=>`<button class="more-item" data-action="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('');
document.getElementById('moreGridShift').innerHTML = SHIFT_ACTIONS.map(a=>`<button class="more-item" data-action="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('');

function handleMoreAction(e){
  const btn = e.target.closest('.more-item'); if(!btn) return;
  const id = btn.dataset.action;
  if(id === 'drawer') openCashDrawer();
  else if(id === 'manager') openPinModal();
  else if(id === 'scan') resetModalStack(scanCustomerCard);
  else if(id === 'reprint' || id === 'refund'){
    switchBottomNavScreen('orders');
    const completedTab = document.querySelector('#ordersTabs .seg-tab[data-tab="completed"]');
    if(completedTab) completedTab.click();
    showToast(id === 'refund' ? 'اختر الطلب اللي تبي تسترجعه' : 'اختر الطلب اللي تبي تعيد طباعته');
  }
  else if(id === 'settings') resetModalStack(openPosSettingsModal);
  else if(id === 'shiftSummary') resetModalStack(openShiftSummary);
  else if(id === 'closeShift') resetModalStack(openClosingWizard);
  else if(id === 'reprintClosing') reprintLastClosingReport();
  else if(id === 'diagnostics') resetModalStack(openDiagnosticsModal);
}
document.getElementById('moreGridQuick').addEventListener('click', handleMoreAction);
document.getElementById('moreGridShift').addEventListener('click', handleMoreAction);

/* ============ Settings — real device/branch/session info, no fake config options ============ */
function openPosSettingsModal(){
  document.getElementById('paymentModalTitle').textContent = 'إعدادات الطباعة';
  const bridgeOn = printerBridgeAvailable();
  paymentModalBody.innerHTML = `
    <div class="shift-stat-row"><span>النشاط</span><span class="mono">${DEVICE.businessName || '—'}</span></div>
    <div class="shift-stat-row"><span>الفرع</span><span class="mono">${DEVICE.branchName || '—'}</span></div>
    <div class="shift-stat-row"><span>الموظف الحالي</span><span class="mono">${CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : 'بدون اسم'}</span></div>
    <div class="shift-stat-row"><span>حالة الاتصال</span><span class="mono">${navigator.onLine ? 'متصل بالإنترنت' : 'غير متصل'}</span></div>

    <div class="shift-stat-row" style="margin-top:14px;"><span>طابعة الفواتير</span><span class="mono">${bridgeOn ? '✓ تطبيق الطباعة متاح' : '⚠ افتح من تطبيق الكاشير المثبّت للطباعة'}</span></div>
    <div class="pos-auth-field" style="margin-top:8px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">عنوان الطابعة في الشبكة (نفس شبكة الواي فاي)</label>
      <input type="text" id="printerIpInput" placeholder="مثال: 192.168.1.50" value="${DEVICE.printerIp || ''}" style="width:100%;">
    </div>
    <div class="pos-auth-field" style="margin-top:10px; display:flex; gap:10px;">
      <div style="flex:1;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">المنفذ</label>
        <input type="number" id="printerPortInput" placeholder="9100" value="${DEVICE.printerPort || 9100}" style="width:100%;">
      </div>
      <div style="flex:1;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">عرض الورق</label>
        <select id="printerWidthInput" style="width:100%;">
          <option value="576" ${(DEVICE.printerPaperWidth||576)===576?'selected':''}>80مم (الأشيع)</option>
          <option value="384" ${DEVICE.printerPaperWidth===384?'selected':''}>58مم</option>
        </select>
      </div>
    </div>
    <div class="pos-auth-field" style="margin-top:10px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:2px;">شكل الفاتورة عند الدفع</label>
      ${posCheck(`id="printCustomerReceiptToggle" ${DEVICE.printCustomerReceipt !== false ? 'checked' : ''}`, 'فاتورة العميل (مع السعر والضريبة ورمز QR)')}
      ${posCheck(`id="printKitchenTicketToggle" ${DEVICE.printKitchenTicket === true ? 'checked' : ''}`, 'فاتورة المطبخ (الأصناف والملاحظات فقط، بدون أسعار)')}
      ${RECEIPT_LOGO_URL ? posCheck(`id="printReceiptLogoToggle" ${DEVICE.printReceiptLogo !== false ? 'checked' : ''}`, 'طباعة شعار الفاتورة أعلى فاتورة العميل') : ''}
    </div>
    <div class="pos-auth-field" style="margin-top:10px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">طابعة مطبخ منفصلة (اختياري)</label>
      <div style="display:flex; gap:8px;">
        <input type="text" id="kitchenPrinterIpInput" placeholder="عنوان الطابعة — مثال: 192.168.1.51" value="${DEVICE.kitchenPrinterIp || ''}" style="flex:2;">
        <input type="number" id="kitchenPrinterPortInput" placeholder="9100" value="${DEVICE.kitchenPrinterPort || ''}" style="flex:1;">
      </div>
      <p class="stock-qty-helper" style="margin-top:6px;">اتركه فارغ لو نفس طابعة الكاشير تطبع فاتورة المطبخ برضو. عبّيه فقط لو عندكم طابعة ثانية منفصلة (مثلاً بالمطبخ بالدور الأول وطابعة الكاشير بالدور الثاني) — لازم تكون على نفس شبكة الواي فاي.</p>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="confirm-pay-btn" id="printerSaveBtn" style="flex:1;">حفظ إعدادات الطابعة</button>
      <button class="receipt-action-btn" id="printerTestBtn" style="flex:1;">طباعة اختبار</button>
    </div>

    <button class="confirm-pay-btn" id="posSettingsReprovisionBtn" style="margin-top:16px;">إعادة تجهيز هذا الجهاز</button>
  `;
  document.getElementById('paymentModal').classList.add('show');
  document.getElementById('posSettingsReprovisionBtn').addEventListener('click', ()=>{
    closePaymentModalNow();
    document.getElementById('reprovisionLink').click();
  });
  document.getElementById('printerSaveBtn').addEventListener('click', ()=>{
    DEVICE.printerIp = document.getElementById('printerIpInput').value.trim() || null;
    DEVICE.printerPort = parseInt(document.getElementById('printerPortInput').value, 10) || 9100;
    DEVICE.printerPaperWidth = parseInt(document.getElementById('printerWidthInput').value, 10) || 576;
    DEVICE.printCustomerReceipt = document.getElementById('printCustomerReceiptToggle').checked;
    DEVICE.printKitchenTicket = document.getElementById('printKitchenTicketToggle').checked;
    const logoToggle = document.getElementById('printReceiptLogoToggle');
    if(logoToggle) DEVICE.printReceiptLogo = logoToggle.checked;
    DEVICE.kitchenPrinterIp = document.getElementById('kitchenPrinterIpInput').value.trim() || null;
    DEVICE.kitchenPrinterPort = parseInt(document.getElementById('kitchenPrinterPortInput').value, 10) || null;
    saveDeviceConfig();
    updatePrinterStatusPill();
    showToast('تم حفظ إعدادات الطابعة');
  });
  document.getElementById('printerTestBtn').addEventListener('click', async ()=>{
    showToast('جاري إرسال طباعة اختبار...');
    const result = await sendToPrinter({
      businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
      dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
      timestampISO: new Date().toISOString(), vatNumber: BUSINESS_VAT_NUMBER,
      orderNumber: '#0', metaLabel: 'طباعة اختبار',
      showLogo: DEVICE.printReceiptLogo !== false && !!RECEIPT_LOGO_URL, logoUrl: RECEIPT_LOGO_URL,
      cashierName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : '',
    tagline: RECEIPT_TAGLINE,
    showBusinessName: RECEIPT_SHOW_NAME,
      locationLine: BRANCH_LOCATION_LINE,
      branchLabel: BRANCH_RECEIPT_LABEL,
      customMessage: RECEIPT_CUSTOM_MESSAGE,
      items: [{name:'صنف تجريبي', qty:1, unitPrice:10, lineTotal:10, mods:[]}],
      subtotal:10, discount:0, vat:1.5, total:11.5, paymentMethodLabel:'اختبار', change:0
    });
    if(result.ok) showToast('تمت طباعة الاختبار بنجاح');
    else if(result.error === 'bridge_unavailable') showToast('افتح الكاشير من تطبيق APK المثبّت أولاً');
    else if(result.error === 'no_printer_configured') showToast('احفظ عنوان IP للطابعة أولاً');
    else showToast('تعذر الاتصال بالطابعة — تحقق من العنوان والشبكة');
  });
}

/* ============ Diagnostics ============
   Support/self-service screen — real state read fresh every open/refresh,
   never a guess. Every count here comes straight from the same IndexedDB
   stores the offline order queue and print queue actually use, and
   NETWORK_STATE above — nothing duplicated or cached separately, so this
   can never drift out of sync with what the queues themselves are doing. */
function timeAgoLabel(ts){
  if(!ts) return 'لم يحدث بعد';
  const mins = Math.round((Date.now() - ts) / 60000);
  if(mins < 1) return 'الآن';
  if(mins < 60) return 'قبل ' + mins + ' د';
  const hrs = Math.round(mins / 60);
  return 'قبل ' + hrs + ' سا';
}
// One plain-language sentence naming the SPECIFIC broken layer instead of
// making the cashier cross-reference 4 separate status rows themselves —
// this is the actual thing asked for: "هل المشكلة إنترنت، Cloud، Printer،
// أو Native Bridge" answered directly, checked in the order a real cashier
// would want ruled out (closest to them first): internet, then cloud, then
// whether a native printer bridge exists AT ALL (expected "problem" on
// today's plain web build — no iOS bridge exists yet), then the printer
// itself once a bridge is actually present.
// Every string here shows straight to a cashier via "المزيد ← تشخيص النظام" —
// real reported bug: this used to name internal implementation details
// ("Supabase", "جسر Native", "تطبيق iOS") that mean nothing to a restaurant
// owner. Describe what's true and what to do about it, never how it's built.
function diagnoseProblem(bridgeAvailable, failedOrRetryingPrintCount){
  if(!NETWORK_STATE.internet) return { text: 'المشكلة: الجهاز مو متصل بالإنترنت إطلاقًا.', bad: true };
  if(NETWORK_STATE.cloud === false) return { text: 'المشكلة: الإنترنت شغّال، لكن مزامنة البيانات ما تستجيب حاليًا.', bad: true };
  if(!bridgeAvailable) return { text: 'ملاحظة: الطباعة الفعلية على هذا الجهاز تحتاج تطبيق الكاشير المخصص — النسخة الحالية (عبر المتصفح) ما تدعمها بعد.', bad: false };
  if(failedOrRetryingPrintCount > 0) return { text: 'المشكلة: بالطابعة نفسها — تأكد من اتصالها بالشبكة والطاقة وعنوان IP.', bad: true };
  return { text: 'لا توجد مشكلة ظاهرة الآن.', bad: false };
}
let diagnosticsModalOpen = false;
async function renderDiagnosticsBody(){
  const [queuedOrders, printJobs] = await Promise.all([
    getQueuedOrders().catch(()=>[]),
    getAllPrintJobs().catch(()=>[])
  ]);
  const printByStatus = {};
  printJobs.forEach(j => { printByStatus[j.status] = (printByStatus[j.status]||0) + 1; });
  const failedPrintJobs = printJobs.filter(j => j.status === 'failed');
  const troublePrintJobs = printJobs.filter(j => j.status === 'failed' || j.status === 'retrying');
  const lastPrintError = troublePrintJobs.sort((a,b)=>(b.created_at||0)-(a.created_at||0))[0];
  const stuckOrders = queuedOrders.filter(o => o.stuck);
  const bridgeOn = printerBridgeAvailable();
  const diagnosis = diagnoseProblem(bridgeOn, troublePrintJobs.length);
  const statusRow = (label, ok, detail) => `<div class="shift-stat-row"><span>${label}</span><span class="mono" style="color:${ok===true?'var(--lime-deep)':ok===false?'var(--danger)':'var(--muted)'}">${detail}</span></div>`;
  paymentModalBody.innerHTML = `
    <div class="pos-modal-hint" style="margin-bottom:10px; font-weight:800; color:${diagnosis.bad?'var(--danger)':'var(--lime-deep)'};">${diagnosis.text}</div>
    ${statusRow('الإنترنت', NETWORK_STATE.internet, NETWORK_STATE.internet ? '🟢 متصل' : '🔴 غير متصل')}
    ${statusRow('مزامنة البيانات', NETWORK_STATE.cloud, NETWORK_STATE.cloud === true ? '🟢 تعمل' : NETWORK_STATE.cloud === false ? '🔴 تعذر الاتصال' : '⚪ ما تأكّدنا منها بعد')}
    ${NETWORK_STATE.lastCloudError ? `<div class="shift-stat-row"><span>آخر خطأ مزامنة</span><span class="mono" style="color:var(--danger); font-size:10.5px;">${escapeHtml(friendlyErrorText(NETWORK_STATE.lastCloudError))}</span></div>` : ''}
    ${statusRow('الطباعة', bridgeOn, bridgeOn ? '🟢 جاهزة' : '🔴 غير جاهزة — تحتاج تطبيق الكاشير المخصص')}
    ${statusRow('عنوان IP للطابعة', !!DEVICE.printerIp, DEVICE.printerIp ? DEVICE.printerIp + ':' + (DEVICE.printerPort||9100) : '⚪ غير معدّة')}
    ${lastPrintError ? `<div class="shift-stat-row"><span>آخر خطأ طباعة</span><span class="mono" style="color:var(--danger); font-size:10.5px;">${escapeHtml(friendlyErrorText(lastPrintError.last_error))}</span></div>` : ''}
    ${statusRow('درج النقدية', cashDrawerBridgeAvailable(), cashDrawerBridgeAvailable() ? '🟢 جاهز' : '⚪ غير جاهز بعد — يحتاج تطبيق الكاشير المخصص')}
    <div class="shift-stat-row" style="margin-top:14px;"><span>آخر مزامنة ناجحة</span><span class="mono">${timeAgoLabel(LAST_SUCCESSFUL_SYNC_AT)}</span></div>
    ${statusRow('طلبات بانتظار المزامنة', queuedOrders.length === 0, queuedOrders.length)}
    ${statusRow('طلبات عالقة (تحتاج تدخّل)', stuckOrders.length === 0, stuckOrders.length)}
    <div class="shift-stat-row"><span>طباعات قيد الانتظار/الإعادة</span><span class="mono">${(printByStatus.queued||0) + (printByStatus.retrying||0) + (printByStatus.printing||0)}</span></div>
    ${statusRow('طباعات فاشلة نهائيًا', failedPrintJobs.length === 0, failedPrintJobs.length)}
    <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
      <button class="confirm-pay-btn" id="diagRefreshBtn" style="flex:1;">تحديث واختبار الاتصال</button>
      ${failedPrintJobs.length > 0 ? `<button class="receipt-action-btn" id="diagRetryAllBtn" style="flex:1;">إعادة محاولة الطباعات الفاشلة (${failedPrintJobs.length})</button>` : ''}
      ${stuckOrders.length > 0 ? `<button class="receipt-action-btn" id="diagRetryStuckOrdersBtn" style="flex:1;">إعادة محاولة الطلبات العالقة (${stuckOrders.length})</button>` : ''}
    </div>
  `;
  document.getElementById('diagRefreshBtn').addEventListener('click', async (e)=>{
    // "مزامنة البيانات" only ever resolves as a side-effect of a real
    // request — with nothing queued, that used to mean it could sit on "ما
    // تأكّدنا منها بعد" forever under normal, healthy use. This button is
    // now the direct answer to "how do we confirm it": it forces syncQueue()
    // to run right now (which pings the server for real when the queue's
    // empty, see syncQueue) instead of just re-rendering the same old state.
    const btn = e.currentTarget;
    const originalText = btn.textContent;
    btn.disabled = true; btn.textContent = 'جارٍ الاختبار...';
    try { await syncQueue(); } catch (e2) {}
    btn.disabled = false; btn.textContent = originalText;
    renderDiagnosticsBody();
  });
  const retryAllBtn = document.getElementById('diagRetryAllBtn');
  if(retryAllBtn) retryAllBtn.addEventListener('click', async ()=>{
    retryAllBtn.disabled = true;
    for(const job of failedPrintJobs){
      job.status = 'queued'; job.retry_count = 0; job.next_retry_at = 0; job.last_error = null;
      try { await putPrintJob(job); } catch (e) {}
    }
    processPrintQueue();
    showToast('أُعيدت جدولة ' + failedPrintJobs.length + ' طباعة');
    renderDiagnosticsBody();
  });
  const retryStuckBtn = document.getElementById('diagRetryStuckOrdersBtn');
  if(retryStuckBtn) retryStuckBtn.addEventListener('click', async ()=>{
    retryStuckBtn.disabled = true;
    // Financial data: never delete, only clear the "give up" markers so
    // syncQueue's normal pass picks it up again like any other queued item.
    for(const order of stuckOrders){
      try { await queueOrder({ ...order, stuck: false, retry_count: 0, next_retry_at: 0 }); } catch (e) {}
    }
    syncQueue();
    showToast('أُعيدت جدولة ' + stuckOrders.length + ' طلب');
    renderDiagnosticsBody();
  });
}
function openDiagnosticsModal(){
  document.getElementById('paymentModalTitle').textContent = 'تشخيص النظام';
  paymentModalBody.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  document.getElementById('paymentModal').classList.add('show');
  diagnosticsModalOpen = true;
  renderDiagnosticsBody();
}
// Auto-refreshes the open Diagnostics screen when NETWORK_STATE changes
// (see updateNetworkState) — e.g. the internet drops while a cashier
// happens to already have this screen open, instead of showing stale state
// until they manually tap "تحديث".
function refreshDiagnosticsIfOpen(){
  if(diagnosticsModalOpen && document.getElementById('paymentModal').classList.contains('show')) renderDiagnosticsBody();
}

/* ============ Shift Summary ============ */
/* ============ Shift data — real, computed from orders tagged with the
   currently-open shift's id (see CURRENT_SHIFT / afterStaffReady near the
   auth flow below). cashTotal starts from the shift's real opening_cash so
   the closing wizard's "expected in drawer" figure accounts for the float,
   not just the day's cash sales. ============ */
async function loadShiftData(){
  if(!CURRENT_SHIFT) return {ordersCount:0, salesTotal:0, cashTotal:0, cardTotal:0, startTime:'--:--'};
  // payment_status='paid' excludes a pay-after dine-in table that's still
  // mid-meal (order registered, nothing collected yet) — without this an
  // open tab's total would land in the drawer count before any money
  // actually changed hands.
  // .neq('status','refunded') is doing real accounting work, not tidying:
  // refund_pos_order only sets status='refunded' and never touches
  // payment_status — which cannot even hold 'refunded' (its check
  // constraint allows 'unpaid'/'paid' only). So without this a refunded
  // cash sale kept counting toward "expected in drawer" while the cashier
  // had physically handed the money back, producing a phantom shortfall
  // equal to every cash refund and making an honest cashier look short on
  // a figure a manager then signs off.
  // 'cancelled' needs no exclusion: cancel_dine_in_order only matches
  // payment_status='unpaid', so those orders never enter this query.
  // البيع يُحسب كما وقع، والاسترجاع يُطرح مستقلاً.
  //
  // كان الاستعلام يستبعد المسترجَع كلياً، وهو صحيحٌ في حالة واحدة فقط:
  // بيع كاش أُعيد كاملاً كاشاً -- دخل وخرج فصفر. أما بيع شبكة أُعيد كاشاً
  // فالدرج ينقص فعلاً وإن لم يدخله شيء، وبيع كاش أُعيد بعضه فالباقي منه
  // في الدرج. فالاستبعاد كان يُخفي سحباً حقيقياً من الصندوق.
  const { data } = await window.supabaseClient
    .from('orders').select('total, subtotal, discount_amount, vat_amount, payment_method, cash_amount, source').eq('shift_id', CURRENT_SHIFT.id).eq('payment_status', 'paid');
  const orders = data || [];
  // المرتجعات بورديّة خروج المال لا بورديّة البيع: قد يُرجَع بيع الأمس
  // اليوم، والدرج الذي ينقص هو درج اليوم.
  let refundsTotal = 0, refundsCount = 0;
  try {
    const { data: refunded } = await window.supabaseClient
      .from('orders').select('refunded_amount').eq('refund_shift_id', CURRENT_SHIFT.id);
    (refunded || []).forEach(o=>{
      const amt = Number(o.refunded_amount) || 0;
      if(amt > 0){ refundsTotal += amt; refundsCount++; }
    });
  } catch(_){ /* بلا سطر مرتجعات خير من تقرير لا يُطبع */ }
  // a split order's cash half belongs in the drawer count too — only the
  // remainder is card, not the whole order total (that used to be double
  // counted as "card" while the real cash portion went uncounted entirely).
  let cashSales = 0, cardSales = 0, deliveryPlatformSales = 0, onlineSales = 0;
  let grossSales = 0, discountsTotal = 0, vatTotal = 0;
  orders.forEach(o=>{
    const total = Number(o.total);
    grossSales += Number(o.subtotal) || 0;
    discountsTotal += Number(o.discount_amount) || 0;
    vatTotal += Number(o.vat_amount) || 0;
    // طلب من المتجر الإلكتروني دُفع بغير الكاش هو "دفع إلكتروني" -- لا
    // شبكةَ الصالة. الفصل بالمصدر لا بطريقة الدفع، لأن كليهما يصل
    // بـ'card' وحدها لا تفرّق بينهما.
    if(o.source === 'online' && o.payment_method !== 'cash'){ onlineSales += total; return; }
    if(o.payment_method === 'cash') cashSales += total;
    else if(o.payment_method === 'split'){
      const cashPart = Number(o.cash_amount||0);
      cashSales += cashPart;
      cardSales += total - cashPart;
    } else if(o.payment_method === 'delivery_platform') deliveryPlatformSales += total;
    else cardSales += total;
  });
  // الصافي بعد المرتجعات، والدرج بعد ما خرج منه.
  const netSales = cashSales + cardSales + deliveryPlatformSales + onlineSales - refundsTotal;
  return {
    ordersCount: orders.length,
    grossSales, discountsTotal, vatTotal, refundsTotal, refundsCount,
    netSales,
    avgTicket: orders.length ? netSales / orders.length : 0,
    openingCash: Number(CURRENT_SHIFT.opening_cash) || 0,
    cashSales,
    onlineTotal: onlineSales,
    salesTotal: netSales,
    // الاسترجاع كاش دائماً، فهو سحبٌ من الدرج مهما كانت طريقة دفع البيع.
    cashTotal: Number(CURRENT_SHIFT.opening_cash) + cashSales - refundsTotal,
    cardTotal: cardSales,
    deliveryPlatformTotal: deliveryPlatformSales,
    startTime: new Date(CURRENT_SHIFT.opened_at).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})
  };
}

async function openShiftSummary(){
  document.getElementById('paymentModalTitle').textContent = 'ملخص الوردية';
  paymentModalBody.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  document.getElementById('paymentModal').classList.add('show');
  const data = await loadShiftData();
  paymentModalBody.innerHTML = `
    <div style="text-align:center; margin-bottom:16px;"><div style="font-size:11px; font-weight:700; color:var(--muted);">من بداية الوردية — ${data.startTime}</div></div>
    <div class="shift-stat-row"><span>عدد الطلبات</span><span class="mono">${data.ordersCount}</span></div>
    <div class="shift-stat-row"><span>إجمالي المبيعات</span>${rkMoney(data.salesTotal)}</div>
    <div class="shift-stat-row"><span>كاش (شامل الرصيد الافتتاحي)</span>${rkMoney(data.cashTotal)}</div>
    <div class="shift-stat-row"><span>بطاقة / Apple Pay</span>${rkMoney(data.cardTotal)}</div>
    <div class="shift-stat-row total"><span>توصيل — مدفوع عبر التطبيق</span>${rkMoney(data.deliveryPlatformTotal)}</div>
  `;
}

/* ============ Closing Wizard ============ */
let closingStep = 1, countedCash = '', closingShiftData = null;
// Backup reprint — shift_closing_reports persists every closing report, but
// until now the only time it ever printed was once, automatically, at the
// moment of closing. If the printer jammed/was out of paper right then, the
// cashier had no way back to it once logged out (a closed shift has no
// "open" session to return to). Reprints the most recent one for this
// branch, whenever, no manager PIN needed — it's just re-outputting data
// that was already produced and approved, not a new sensitive action.
async function reprintLastClosingReport(){
  showToast('جاري البحث عن آخر موازنة...');
  const { data, error } = await window.supabaseClient
    .from('shift_closing_reports').select('*')
    .eq('branch_id', DEVICE.branchId).order('created_at', {ascending:false}).limit(1).maybeSingle();
  if(error || !data){ showToast('ما فيه موازنة سابقة مسجلة لهذا الفرع'); return; }
  const report = {
    businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
    dateLabel: new Date(data.created_at).toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    staffName: '—',
    ordersCount: data.orders_count, salesTotal: Number(data.sales_total),
    cardTotal: Number(data.card_total), deliveryPlatformTotal: Number(data.delivery_platform_total),
    cashExpected: Number(data.cash_expected), cashCounted: Number(data.cash_counted), cashVariance: Number(data.cash_variance)
  };
  showToast('جاري الطباعة...');
  const result = await sendShiftReportToPrinter(report);
  if(result.ok) showToast('تمت طباعة آخر موازنة');
  else if(result.error === 'bridge_unavailable') showToast('افتح الكاشير من تطبيق APK المثبّت أولاً');
  else if(result.error === 'no_printer_configured') showToast('احفظ عنوان IP للطابعة أولاً');
  else showToast('تعذر الاتصال بالطابعة — تحقق من العنوان والشبكة');
}

async function openClosingWizard(){
  if(!CURRENT_SHIFT){ showToast('ما فيه وردية مفتوحة'); return; }
  closingStep = 1; countedCash = '';
  document.getElementById('paymentModalTitle').textContent = 'إغلاق الوردية — عدّ الكاش';
  paymentModalBody.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  document.getElementById('paymentModal').classList.add('show');
  closingShiftData = await loadShiftData();
  renderClosingWizard();
}
/* Step 1 is a BLIND count: the expected figure is deliberately withheld
   until step 2.

   Counting the drawer exists to DETECT a discrepancy, and showing the
   expected amount first destroys that. A cashier who counts 1,180 against
   a displayed 1,250 assumes they miscounted and types 1,250 to avoid
   trouble — a real shortfall vanishes, and nobody learns that (say) wrong
   change is being handed out every day. Someone dishonest just types the
   number on screen. Either way the count stops being a measurement and
   becomes agreement with a figure the system already had.

   Entered blind, the number is independent evidence: repeated small
   shortfalls point at a training problem, repeated surpluses at a pricing
   one. It also protects the cashier — a documented independent count is
   their defence; "agreed with our number" is not.

   Step 2 is unchanged: expected, counted and variance still shown
   together. The figure is delayed by one step, not hidden. */
function renderClosingWizard(){
  document.getElementById('paymentModalTitle').textContent = closingStep === 1 ? 'إغلاق الوردية — عدّ الكاش' : 'إغلاق الوردية — المطابقة';
  if(closingStep === 1){
    paymentModalBody.innerHTML = `
      <div class="due-display"><div class="due-label">عدّ الكاش الموجود بالدرج</div><div style="font-size:12px; font-weight:600; color:var(--muted); margin-top:6px; padding:0 12px;">اكتب المبلغ اللي عدّيته — الفرق يظهر بالخطوة الجاية</div></div>
      <div class="cash-input-row"><input type="number" id="countedCashInput" placeholder="0.00" value="${countedCash}"></div>
      <button class="confirm-pay-btn" id="closingNextBtn" ${countedCash?'':'disabled'}>التالي</button>
    `;
    const input = document.getElementById('countedCashInput');
    input.addEventListener('input', (e)=>{ countedCash = e.target.value; document.getElementById('closingNextBtn').disabled = !countedCash; });
    document.getElementById('closingNextBtn').addEventListener('click', ()=>{ closingStep = 2; renderClosingWizard(); });
  } else {
    const counted = parseFloat(countedCash) || 0;
    const variance = counted - closingShiftData.cashTotal;
    const varClass = variance === 0 ? 'ok' : (Math.abs(variance) <= 5 ? 'warn' : 'urgent');
    const varLabel = variance === 0 ? 'مطابق تمامًا' : (variance > 0 ? 'زيادة ' + variance.toFixed(2) : 'عجز ' + Math.abs(variance).toFixed(2));
    paymentModalBody.innerHTML = `
      <div class="shift-stat-row"><span>المتوقع</span>${rkMoney(closingShiftData.cashTotal)}</div>
      <div class="shift-stat-row"><span>المعدود فعليًا</span>${rkMoney(counted)}</div>
      <div class="shift-stat-row total"><span>الفرق</span><span class="mono urgency-badge ${varClass}">${varLabel}</span></div>
      <div class="pos-auth-error" id="closingWizardError" style="display:none;"></div>
      <button class="confirm-pay-btn" id="confirmCloseBtn" style="margin-top:16px;">تأكيد إغلاق الوردية</button>
    `;
    // Closing the drawer asks for the owner's manager PIN by default — it
    // used to be a cashier-only action with no approval at all, and the
    // counted-vs-expected mismatch was shown but never enforced or recorded.
    // The owner can now turn that gate off; see REQUIRE_MANAGER_PIN_FOR_CLOSE.
    document.getElementById('confirmCloseBtn').addEventListener('click', ()=>{
      // The owner can turn this gate off for shops where the person closing
      // IS the manager and the PIN is only friction. Everything else about
      // the close is unchanged — the count, the variance, and the record
      // written against it do not depend on who approved it.
      const runClose = async ()=>{
        const btn = document.getElementById('confirmCloseBtn');
        const errEl = document.getElementById('closingWizardError');
        if(btn) btn.disabled = true;
        try {
          const { error } = await window.supabaseClient.from('shifts')
            .update({ closing_cash: counted, closed_at: new Date().toISOString() }).eq('id', CURRENT_SHIFT.id);
          if(error) throw error;

          const report = {
            businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
            dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
            staffName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : 'بدون اسم',
            shiftStart: closingShiftData.startTime,
            ordersCount: closingShiftData.ordersCount, salesTotal: closingShiftData.salesTotal,
            grossSales: closingShiftData.grossSales, discountsTotal: closingShiftData.discountsTotal,
            refundsTotal: closingShiftData.refundsTotal, refundsCount: closingShiftData.refundsCount,
            vatTotal: closingShiftData.vatTotal, netSales: closingShiftData.netSales,
            avgTicket: closingShiftData.avgTicket, openingCash: closingShiftData.openingCash,
            cashSales: closingShiftData.cashSales, onlineTotal: closingShiftData.onlineTotal,
            onlinePaymentsEnabled: ONLINE_PAYMENTS_ENABLED,
            options: SHIFT_REPORT_OPTIONS,
            cardTotal: closingShiftData.cardTotal, deliveryPlatformTotal: closingShiftData.deliveryPlatformTotal,
            cashExpected: closingShiftData.cashTotal, cashCounted: counted, cashVariance: variance
          };
          const { data: { user } } = await window.supabaseClient.auth.getUser();
          await window.supabaseClient.from('shift_closing_reports').insert({
            shift_id: CURRENT_SHIFT.id, business_id: DEVICE.businessId, branch_id: DEVICE.branchId,
            closed_by: user.id, orders_count: report.ordersCount, sales_total: report.salesTotal,
            cash_expected: report.cashExpected, cash_counted: report.cashCounted, cash_variance: report.cashVariance,
            card_total: report.cardTotal, delivery_platform_total: report.deliveryPlatformTotal
          });
          sendShiftReportToPrinter(report).then(result=>{
            if(result.ok) showToast('تمت طباعة تقرير الإغلاق');
          });

          document.getElementById('paymentModal').classList.remove('show');
          CURRENT_SHIFT = null;
          localStorage.removeItem('rakeen_pos_staff');
          await window.supabaseClient.auth.signOut();
          window.location.reload();
        } catch(err){
          if(errEl){
            errEl.textContent = err && err.message ? err.message : 'تعذر إغلاق الوردية.';
            errEl.style.display = 'block';
          }
          if(btn) btn.disabled = false;
        }
      };
      if(REQUIRE_MANAGER_PIN_FOR_CLOSE) openPinModal(runClose); else runClose();
    });
  }
}

/* ============ PIN modal (manager approval) ============ */
const pinModal = document.getElementById('pinModal');
/* ============ Manager PIN — real verification ============
   Checked against businesses.pos_manager_pin_hash via the verify_pos_manager_pin
   RPC (set only by the owner from the dashboard, screen:settings). Used both
   as a standalone "موافقة مدير" check and, with onApprove, as a real gate in
   front of a specific sensitive action (closing a shift). */
let pinModalOnApprove = null;
function openPinModal(onApprove){
  state.pinEntry = '';
  pinModalOnApprove = onApprove || null;
  setPinError('');
  document.getElementById('pinModalVerifying').classList.add('hidden');
  document.getElementById('pinPad').classList.remove('hidden');
  renderPin();
  pinModal.classList.add('show');
}
document.getElementById('closePinModal').addEventListener('click', ()=> pinModal.classList.remove('show'));
pinModal.addEventListener('click', (e)=>{ if(e.target===pinModal) pinModal.classList.remove('show'); });
function setPinError(msg){
  let errEl = document.getElementById('pinModalError');
  if(!errEl){
    errEl = document.createElement('div');
    errEl.id = 'pinModalError';
    errEl.className = 'pos-auth-error';
    errEl.style.textAlign = 'center';
    document.getElementById('pinDots').insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = msg;
  errEl.style.display = msg ? 'block' : 'none';
}
function renderPin(){
  document.getElementById('pinDots').innerHTML = Array.from({length:state.pinTargetLength}).map((_,i)=>
    `<span class="pin-dot ${i < state.pinEntry.length ? 'filled':''}"></span>`
  ).join('');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  document.getElementById('pinPad').innerHTML = keys.map(k=> k ? `<button class="pin-key" data-key="${k}">${k}</button>` : `<span></span>`).join('');
  document.getElementById('pinPad').querySelectorAll('.pin-key').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const k = btn.dataset.key;
      if(k === '⌫') state.pinEntry = state.pinEntry.slice(0,-1);
      else if(state.pinEntry.length < state.pinTargetLength) state.pinEntry += k;
      renderPin();
      if(state.pinEntry.length !== state.pinTargetLength) return;

      const pin = state.pinEntry;
      document.getElementById('pinPad').classList.add('hidden');
      document.getElementById('pinModalVerifying').classList.remove('hidden');
      const { data, error } = await window.supabaseClient.rpc('verify_pos_manager_pin', { p_pin: pin });
      state.pinEntry = '';
      document.getElementById('pinModalVerifying').classList.add('hidden');
      document.getElementById('pinPad').classList.remove('hidden');
      if(error){
        setPinError('تعذر التحقق من الرمز — تحقق من الاتصال');
        renderPin();
        return;
      }
      if(data === null){
        setPinError('ما تم تعيين كلمة سر مدير بعد — من لوحة التحكم: الإعدادات ← نقطة البيع');
        renderPin();
        return;
      }
      if(data === true){
        pinModal.classList.remove('show');
        showToast('تمت موافقة المدير');
        if(pinModalOnApprove) pinModalOnApprove();
      } else {
        setPinError('رمز خاطئ');
        renderPin();
      }
    });
  });
}

/* ============ Real data hydration — replaces CATEGORIES/PRODUCTS/
   MODIFIER_PRODUCTS with real menu_categories/menu_items/modifier_groups/
   modifier_options/menu_item_box_* fetched from Supabase, reshaped into the
   exact same render-facing shapes so renderCatRail/renderProductGrid/
   renderGroupModifiers/renderBoxBuilder above are untouched. Two side maps
   (MENU_ITEM_META, MODIFIER_OPTION_STOCK) carry the real stock_item_id/qty/
   unit info those render-facing shapes deliberately don't need, used only
   by checkout's stock-decrement computation. ============ */
let MENU_ITEM_META = {};       // menuItemId -> {costMode, recipe:[{stockItemId,qty,unit}], componentSlot:{totalPieces, eligibleItems:[{id,stockItemId,name,costMode}], defaultMix}}
let BARCODE_TO_PRODUCT_ID = {}; // barcode string -> menu_items.id, for retail scan-to-add (empty for service businesses, which have no barcodes)
let BOX_ELIGIBLE_META = {};    // box_eligible_item row id -> {stockItemId, costMode} — 'simple' choices have stockItemId:null and decrement nothing
let MODIFIER_OPTION_STOCK = {}; // "groupId_optionId" -> {stockItemId, qty, unit}
let STOCK_UNIT_BY_ID = {};      // stockItemId -> the stock item's own tracking unit (kg/g/liter/piece)
let DELIVERY_PLATFORMS_LIST = []; // [{id, name}] — real delivery_platforms for this branch's business
let SERVICE_STAFF_BY_SERVICE = {}; // serviceId -> [staffMemberId,...] — empty array means "any active staff eligible" (see service_staff table comment)
let LOYALTY_ENABLED = true;     // businesses.loyalty_enabled — hides the whole customer/points UI when off
let DINE_IN_ENABLED = true;     // businesses.dine_in_enabled — hides "بالمطعم" + Tables for delivery-only kitchens
let BUSINESS_VAT_NUMBER = '';   // businesses.vat_number — required for the ZATCA QR code on printed receipts; blank until the owner sets it in dashboard Settings
let BUSINESS_VAT_RATE = 0.15;   // businesses.vat_rate — real per-business rate, replaces the old hardcoded VAT_RATE constant
let PRICES_INCLUDE_VAT = true;  // businesses.prices_include_vat — default true matches the KSA legal requirement (menu prices already include tax)
let VAT_REGISTERED = true;      // businesses.vat_registered — off means zero VAT everywhere, not just an inclusive/exclusive question
let RECEIPT_LOGO_URL = '';      // businesses.receipt_logo_url — شعار الفاتورة وحدها؛ فارغ = اطبع الاسم بلا شعار (ولا يرتدّ إلى logo_url)
let ONLINE_PAYMENTS_ENABLED = false; // businesses.geidea_connected — صف "دفع إلكتروني" في تقرير الإغلاق
let SHIFT_REPORT_OPTIONS = {};       // businesses.shift_report_options — ما يظهر في التقرير وما لا يظهر
let RECEIPT_SHOW_NAME = true;   // businesses.receipt_show_name — هل يُطبع الاسم تحت الشعار
let RECEIPT_TAGLINE = '';       // businesses.receipt_tagline — سطر تحت الاسم
let BRANCH_LOCATION_LINE = '';  // "حي البيعة، الطائف" من branches.district/city
let BRANCH_RECEIPT_LABEL = '';  // branches.receipt_label — اسم الفرع كما يُطبع؛ فارغ = لا يُطبع
let BUSINESS_LOGO_URL = '';     // businesses.logo_url — same logo already used on reports/dashboard; printed at the top of the customer receipt when DEVICE.printReceiptLogo is on
let RECEIPT_CUSTOM_MESSAGE = ''; // businesses.receipt_custom_message — owner-editable line printed near the receipt footer
let PLATFORM_PRICES = {};       // platformId -> {menuItemId: price} — real menu_item_platform_prices, each platform's own price list
let PREP_TIMEOUT_MINUTES_BY_PLATFORM = {}; // platformId -> delivery_platforms.prep_timeout_minutes
let NOTIFY_DELIVERY_PREP_WARNING = true;
let NOTIFY_DELIVERY_PREP_EXPIRED = true;
let NOTIFY_SOUND_ENABLED = true;
let KITCHEN_DISPLAY_ENABLED = false; // businesses.kitchen_display_enabled — Rakeen-admin-only flag (never shown in the owner dashboard); gates the "kitchen marked an order ready" realtime alert below
let TABLES_RESERVATIONS_ENABLED = false; // businesses.tables_reservations_enabled — hides the whole reservation UI on the Tables screen when off
let TABLES_RESERVATION_DEPOSIT_ENABLED = false; // businesses.tables_reservation_deposit_enabled — shown as guidance for staff, no payment gateway behind it yet
let TABLES_RESERVATION_DEPOSIT_PERCENT = 20; // businesses.tables_reservation_deposit_percent
let TABLES_TURN_TIME_ENABLED = false; // businesses.tables_turn_time_enabled — shows an elapsed-time badge on occupied tables
let TABLES_TURN_TIME_MINUTES = 45; // businesses.tables_turn_time_minutes
let TABLES_RESERVATION_CONFLICT_WARNING_ENABLED = true; // businesses.tables_reservation_conflict_warning_enabled
let TABLE_SECTIONS_LIST = []; // table_sections for this branch — empty means "no sections configured", Tables screen stays a flat grid
let TABLES_CACHE = []; // last-loaded restaurant_tables — lets the order-panel table badge resolve a number from state.selectedTableId without a round trip
let DINE_IN_PAY_TIMING = 'before'; // businesses.dine_in_pay_timing — whether a table's order is paid the moment it's registered, or later when the guest asks for the bill
let POS_HIDE_POPULAR_TAB = false; // businesses.pos_hide_popular_tab — drops the "الأكثر طلبًا" shortcut category
let POS_HIDE_SEARCH = false;      // businesses.pos_hide_search — hides the search box (also the barcode-scanner input — only meant for businesses that don't scan barcodes)
let POS_HIDE_PRODUCT_IMAGES = true; // businesses.pos_hide_product_images — shows the plain category icon instead of the uploaded photo on every product tile; defaults true (real photos are the slowest thing this grid renders, and a plain icon is guaranteed to paint instantly regardless of device/network)
let POS_HIDE_NOTIF_BELL = false; // businesses.pos_hide_notif_bell — the delivery-prep-timing alert bell; only meaningful for businesses that run their own delivery
let TABLES_SPECIFIC_BOOKING_ENABLED = false; // businesses.tables_specific_booking_enabled — lets the add-to-waitlist form book an exact table in advance, separate from the general FIFO queue
let BUSINESS_TYPE = 'restaurant'; // businesses.business_type — service-based types (see SERVICE_BUSINESS_TYPES below) source PRODUCTS from services instead of menu_items (see loadPosData); quick_service/cafe/cloud_kitchen are 'restaurant' under the hood with different default settings, no code branches on them
// Every one of these shares the exact services/service_staff/table_reservations
// engine built for salon — a car wash bay or a clinic treatment room is the
// same "resource booked for a timed service" shape as a salon chair. Only
// the label copy differs (RESOURCE_LABELS below); the data/checkout path is identical.
const SERVICE_BUSINESS_TYPES = ['salon', 'ladies_salon', 'car_wash', 'mobile_car_wash', 'clinic', 'tailoring', 'hotel'];
function isServiceBusiness(){ return SERVICE_BUSINESS_TYPES.includes(BUSINESS_TYPE); }
// Copy per service-business type — "chair" for a salon reads wrong for a
// car wash ("bay") or clinic ("room"); "service" likewise becomes "wash"/"session".
// mobile_car_wash and tailoring both have resource:null on purpose — neither
// has a physical bay/chair/room to book or seat into (mobile_car_wash: the
// team travels to the customer; tailoring: an order sits on a rack, not a
// seat) — see hasNoPhysicalResource() below, which branches the Tables
// screen away from the floor grid for both types.
const RESOURCE_LABELS = {
  salon: { resource: 'كرسي', resourcePlural: 'كراسي', service: 'خدمة', bookingScreen: 'الحجوزات' },
  ladies_salon: { resource: 'كرسي', resourcePlural: 'كراسي', service: 'خدمة', bookingScreen: 'الحجوزات' },
  car_wash: { resource: 'باي', resourcePlural: 'باياء', service: 'خدمة غسيل', bookingScreen: 'الحجوزات' },
  mobile_car_wash: { resource: null, resourcePlural: null, service: 'خدمة غسيل', bookingScreen: 'الحجوزات' },
  clinic: { resource: 'غرفة', resourcePlural: 'غرف', service: 'جلسة', bookingScreen: 'المواعيد' },
  tailoring: { resource: null, resourcePlural: null, service: 'طلب تفصيل', bookingScreen: 'الطلبات' },
  hotel: { resource: 'غرفة', resourcePlural: 'غرف', service: 'نوع غرفة', bookingScreen: 'الاستقبال' },
};
function resourceLabels(){ return RESOURCE_LABELS[BUSINESS_TYPE] || RESOURCE_LABELS.salon; }
function hasNoPhysicalResource(){ return resourceLabels().resource === null; }
// Roadmap item 5 — تفصيل orders need a genuine 3-stage tracker
// (upcoming/waiting -> seated/in progress -> ready_for_pickup), unlike
// mobile_car_wash which only ever needed upcoming->seated. Gates the
// widened waitlist query and the extra status pill/action buttons below.
function isTailoringBusiness(){ return BUSINESS_TYPE === 'tailoring'; }
const TAILORING_STATUS_LABELS = { upcoming: 'قيد الانتظار', seated: 'قيد التفصيل', ready_for_pickup: 'جاهز للاستلام' };
// Roadmap item 7 — a hotel HAS a physical resource (rooms), unlike
// mobile_car_wash/tailoring, so it doesn't take the hasNoPhysicalResource()
// waitlist-only branch below. It gets its own dedicated pair of renderers
// (renderHotelRoomsGrid/renderHotelBookingsList) reusing the same
// #tablesFloorPane/#tablesWaitlistPane containers instead.
function isHotelBusiness(){ return BUSINESS_TYPE === 'hotel'; }
const HOTEL_ROOM_STATUS_LABELS = { available: 'متاحة', occupied: 'مشغولة', cleaning: 'تنظيف', maintenance: 'صيانة' };
const HOTEL_BOOKING_STATUS_LABELS = { upcoming: 'قادم', checked_in: 'مسجّل دخول', checked_out: 'غادر' };
let HOTEL_ROOMS_CACHE = [];
let HOTEL_BOOKINGS_CACHE = [];
// Set right before "تسجيل المغادرة" loads a booking's room-type service
// into the cart and sends the cashier to Home to pay — completePayment()
// checks this after a successful order and calls finalize_hotel_checkout,
// then clears it. No new payment code: this just hooks the existing flow.
let pendingHotelCheckoutBookingId = null;
// Roadmap item 2 — retail/grocery businesses check out by scanning a
// barcode instead of tapping the grid. Same PRODUCTS/menu_items data path
// as a restaurant (cost_mode='direct' items), just a different default
// input mode — no schema branching needed beyond menu_items.barcode.
const RETAIL_BUSINESS_TYPES = ['retail'];
function isRetailBusiness(){ return RETAIL_BUSINESS_TYPES.includes(BUSINESS_TYPE); }

function convertToUnit(qty, fromUnit, toUnit){
  if(fromUnit === toUnit) return qty;
  if(fromUnit==='g' && toUnit==='kg') return qty/1000;
  if(fromUnit==='kg' && toUnit==='g') return qty*1000;
  return qty;
}

function iconForCategory(name){
  if(!name) return 'bowl';
  if(name.includes('ساخن') || name.includes('قهوة')) return 'cupHot';
  if(name.includes('بارد')) return 'cupCold';
  if(name.includes('حلا') || name.includes('كيك')) return 'cake';
  if(name.includes('مخبوز')) return 'pastry';
  if(name.includes('رئيسي') || name.includes('برجر')) return 'burger';
  if(name.includes('بيتزا')) return 'pizza';
  if(name.includes('ماء') || name.includes('مياه')) return 'water';
  return 'bowl';
}

// Set by loadPosData() every boot: false after a normal live fetch, true
// when it had to fall back to the last cached snapshot (see below). Read by
// the Home screen to show a persistent "يعمل من نسخة محفوظة محليًا" banner —
// menu/prices/settings shown offline may be stale, and the cashier should
// know that rather than trust them silently.
let POS_USING_OFFLINE_SNAPSHOT = false;
let POS_SNAPSHOT_AGE_MS = 0;

async function loadPosData(){
  const sb = window.supabaseClient;
  const businessId = DEVICE.businessId;

  // menu_item_recipe_lines/menu_item_box_default_mix are never fetched here
  // on purpose — checkout resolves recipe/box-pick stock decrements
  // server-side now (resolve_menu_item_recipe_decrements /
  // resolve_box_selection_decrements), and the quantities are encrypted at
  // rest besides. The cashier terminal has no legitimate use for either
  // table and, before this change, was downloading the business's real
  // recipe into every POS session whether it needed it or not.
  let [catRes, itemsRes, boxEligRes, groupRes, optRes, itemModRes, stockRes, platformRes, platformPriceRes, loyaltyRes, tableSectionsRes, servicesRes, serviceStaffRes] = await Promise.all([
    sb.from('menu_categories').select('*').eq('business_id', businessId).order('sort_order'),
    sb.from('menu_items').select('*').eq('business_id', businessId).eq('active', true).eq('visible_pos', true).or(`hidden_until.is.null,hidden_until.lt.${new Date().toISOString()}`).order('sort_order').order('id'),
    sb.from('menu_item_box_eligible_items').select('*'),
    sb.from('modifier_groups').select('*').eq('business_id', businessId).order('id'),
    sb.from('modifier_options').select('*'),
    sb.from('menu_item_modifier_groups').select('*'),
    sb.from('stock_items').select('id, name, unit'),
    sb.from('delivery_platforms').select('id, name, prep_timeout_minutes, logo_url, brand_color').eq('business_id', businessId).eq('active', true).order('name'),
    sb.from('menu_item_platform_prices').select('*'),
    sb.from('businesses').select('business_type, loyalty_enabled, notify_delivery_prep_warning, notify_delivery_prep_expired, notify_sound_enabled, dine_in_enabled, vat_number, vat_rate, prices_include_vat, vat_registered, logo_url, receipt_custom_message, kitchen_display_enabled, tables_reservations_enabled, tables_reservation_deposit_enabled, tables_reservation_deposit_percent, tables_turn_time_enabled, tables_turn_time_minutes, tables_reservation_conflict_warning_enabled, dine_in_pay_timing, tables_specific_booking_enabled, pos_hide_popular_tab, pos_hide_search, pos_hide_product_images, pos_hide_notif_bell').eq('id', businessId).single(),
    sb.from('table_sections').select('id, name, sort_order').eq('branch_id', DEVICE.branchId).order('sort_order'),
    // Only ever non-empty for a business_type='salon' business — a
    // restaurant's services table is always empty (RLS-scoped by
    // business_id), so this fetch is harmless dead weight for restaurants
    // rather than something worth branching out of the boot query.
    sb.from('services').select('*').eq('business_id', businessId).eq('active', true).order('id'),
    sb.from('service_staff').select('*'),
  ]);

  // supabase-js never rejects this Promise.all on a network failure — a
  // dropped connection resolves each query as {data: null, error: {...}}
  // instead of throwing, so a cold boot with no network used to silently
  // proceed with an EMPTY menu (CATEGORIES=[], PRODUCTS=[]) and every
  // business setting falling back to its generic default, no error shown
  // anywhere. catRes/itemsRes failing is the reliable signal something
  // network-shaped went wrong (RLS/permission errors surface differently
  // and shouldn't fall back to a stale snapshot); everything else in this
  // boot query either isn't essential to ringing up a sale or degrades
  // gracefully as empty on its own already.
  const liveResults = { catRes, itemsRes, boxEligRes, groupRes, optRes, itemModRes, stockRes, platformRes, platformPriceRes, loyaltyRes, tableSectionsRes, servicesRes, serviceStaffRes };
  if(catRes.error || itemsRes.error){
    const cached = await getCacheValue('posdata:' + businessId).catch(()=>null);
    if(!cached || !cached.value){
      // Never successfully loaded on this device before — nothing to fall
      // back to, so this has to surface as a real failure (matches
      // bootPos()'s existing caller, which already has no offline path for
      // a device that's never been online at all).
      throw (catRes.error || itemsRes.error);
    }
    POS_USING_OFFLINE_SNAPSHOT = true;
    POS_SNAPSHOT_AGE_MS = Date.now() - cached.cached_at;
    for(const key of Object.keys(liveResults)) liveResults[key] = { data: cached.value[key] };
    ({ catRes, itemsRes, boxEligRes, groupRes, optRes, itemModRes, stockRes, platformRes, platformPriceRes, loyaltyRes, tableSectionsRes, servicesRes, serviceStaffRes } = liveResults);
    showToast('لا يوجد اتصال — يعمل بمنيو محفوظ محليًا (آخر تحديث ' + Math.round(POS_SNAPSHOT_AGE_MS / 60000) + ' د)');
  } else {
    POS_USING_OFFLINE_SNAPSHOT = false;
    const snapshotData = {};
    for(const key of Object.keys(liveResults)) snapshotData[key] = liveResults[key].data;
    try { await setCacheValue('posdata:' + businessId, snapshotData); } catch(e) { /* IndexedDB unavailable — no snapshot for next time, not fatal now */ }
  }

  TABLE_SECTIONS_LIST = tableSectionsRes.data || [];
  BUSINESS_TYPE = loyaltyRes.data ? (loyaltyRes.data.business_type || 'restaurant') : 'restaurant';

  // some restaurants genuinely don't want to run a loyalty program — when
  // off, the whole customer/points UI disappears from the cashier rather
  // than sitting there disabled, since "customer" in this POS only ever
  // exists to attach loyalty (nothing else reads state.customer)
  LOYALTY_ENABLED = loyaltyRes.data ? loyaltyRes.data.loyalty_enabled !== false : true;

  // cloud/delivery-only kitchens have no dining room — "بالمطعم" and the
  // whole Tables screen are dead weight on their cashier. renderChannelStep()
  // (rendered dynamically inside the payment popup, not present in the DOM
  // at boot time) reads this flag itself to leave the button out entirely.
  DINE_IN_ENABLED = loyaltyRes.data ? loyaltyRes.data.dine_in_enabled !== false : true;
  BUSINESS_VAT_NUMBER = loyaltyRes.data ? (loyaltyRes.data.vat_number || '') : '';
  BUSINESS_VAT_RATE = loyaltyRes.data && loyaltyRes.data.vat_rate != null ? Number(loyaltyRes.data.vat_rate) : 0.15;
  PRICES_INCLUDE_VAT = loyaltyRes.data ? loyaltyRes.data.prices_include_vat !== false : true;
  VAT_REGISTERED = loyaltyRes.data ? loyaltyRes.data.vat_registered !== false : true;
  BUSINESS_LOGO_URL = loyaltyRes.data ? (loyaltyRes.data.logo_url || '') : '';
  RECEIPT_CUSTOM_MESSAGE = loyaltyRes.data ? (loyaltyRes.data.receipt_custom_message || '') : '';
  // Its own query rather than a field on the select above: PostgREST fails
  // an entire select over one unknown column, and this one would take the
  // whole cashier offline on any deploy that landed before the migration.
  // Anything unrecognised falls back to classic, so a till on the old
  // schema prints exactly what it printed before.
  try {
    const themeRes = await sb.from('businesses')
      .select('receipt_theme, pos_require_manager_pin_for_close, dine_in_mode, pos_pager_enabled, kitchen_ticket_mode')
      .eq('id', businessId).single();
    RECEIPT_THEME = (themeRes.data && themeRes.data.receipt_theme) || 'classic';
    // هوية الفاتورة، في نفس الاستعلام المتسامح ولنفس سببه.
    try {
      const brandRes = await sb.from('businesses')
        .select('receipt_logo_url, receipt_tagline, receipt_show_name').eq('id', businessId).single();
      RECEIPT_LOGO_URL = (brandRes.data && brandRes.data.receipt_logo_url) || '';
      RECEIPT_TAGLINE = (brandRes.data && brandRes.data.receipt_tagline) || '';
      // إلا إذا أُطفئ صراحةً: قاعدة بلا هذا العمود تبقى تطبع الاسم.
      RECEIPT_SHOW_NAME = !(brandRes.data && brandRes.data.receipt_show_name === false);
    } catch(_){ RECEIPT_LOGO_URL = ''; RECEIPT_TAGLINE = ''; RECEIPT_SHOW_NAME = true; }
    // إعدادات تقرير الإغلاق، باستعلام ثالث متسامح لنفس السبب.
    try {
      const shRes = await sb.from('businesses')
        .select('geidea_connected, shift_report_options').eq('id', businessId).single();
      ONLINE_PAYMENTS_ENABLED = !!(shRes.data && shRes.data.geidea_connected);
      SHIFT_REPORT_OPTIONS = (shRes.data && shRes.data.shift_report_options) || {};
    } catch(_){ ONLINE_PAYMENTS_ENABLED = false; SHIFT_REPORT_OPTIONS = {}; }
    // الحي والمدينة، وعدد الفروع. العدد هو ما يقرر طباعة اسم الفرع:
    // منشأة بفرع واحد لا تحتاج تمييزه، وسطرٌ يقول "الفرع الأول" حيث لا
    // ثانيَ له سطرٌ بلا معنى.
    try {
      // اسم الفرع صار خياراً صريحاً لا استنتاجاً من عدد الفروع: من أراده
      // كتبه في الإعدادات، ومن تركه فارغاً لا يُطبع. عدّ الفروع كان
      // تخميناً نيابةً عن صاحب المطعم، وقد طلب أن يقرر هو.
      const brRes = await sb.from('branches')
        .select('id, district, city, receipt_label').eq('business_id', businessId);
      const rows = brRes.data || [];
      const mine = rows.find(b => String(b.id) === String(DEVICE.branchId));
      BRANCH_LOCATION_LINE = mine
        ? [mine.district, mine.city].filter(Boolean).join('، ')
        : '';
      BRANCH_RECEIPT_LABEL = (mine && mine.receipt_label) || '';
    } catch(_){ BRANCH_LOCATION_LINE = ''; BRANCH_RECEIPT_LABEL = ''; }
    // 'tables' only when it says so: defaulting to tables would put a café
    // that has none into a table workflow.
    DINE_IN_MODE = (themeRes.data && themeRes.data.dine_in_mode === 'tables') ? 'tables' : 'simple';
    POS_PAGER_ENABLED = !!(themeRes.data && themeRes.data.pos_pager_enabled === true);
    KITCHEN_TICKET_MODE = (themeRes.data && themeRes.data.kitchen_ticket_mode === 'copy') ? 'copy' : 'brief';
    // Only an explicit false turns the gate off, so a till on the old
    // schema — or one whose fetch failed — keeps asking for the PIN. The
    // safe direction for a control over the cash drawer is ON.
    REQUIRE_MANAGER_PIN_FOR_CLOSE = !(themeRes.data && themeRes.data.pos_require_manager_pin_for_close === false);
  } catch(_){
    RECEIPT_THEME = 'classic'; REQUIRE_MANAGER_PIN_FOR_CLOSE = true;
    DINE_IN_MODE = 'simple'; POS_PAGER_ENABLED = false; KITCHEN_TICKET_MODE = 'brief';
  }
  POS_HIDE_POPULAR_TAB = loyaltyRes.data ? loyaltyRes.data.pos_hide_popular_tab === true : false;
  POS_HIDE_SEARCH = loyaltyRes.data ? loyaltyRes.data.pos_hide_search === true : false;
  POS_HIDE_PRODUCT_IMAGES = loyaltyRes.data ? loyaltyRes.data.pos_hide_product_images !== false : true;
  POS_HIDE_NOTIF_BELL = loyaltyRes.data ? loyaltyRes.data.pos_hide_notif_bell === true : false;
  if(POS_HIDE_POPULAR_TAB && state.activeCat === 'popular') state.activeCat = 'all';
  if(POS_HIDE_SEARCH){
    const searchBox = document.querySelector('.search-box');
    if(searchBox) searchBox.style.display = 'none';
  }
  if(POS_HIDE_NOTIF_BELL){
    const notifBtn = document.getElementById('notifBellBtn');
    if(notifBtn) notifBtn.style.display = 'none';
  }
  const tablesNavBtn = document.querySelector('.nav-tab[data-screen="tables"]');
  if(!DINE_IN_ENABLED){
    if(tablesNavBtn) tablesNavBtn.remove();
    if(state.orderChannel === 'dine_in') state.orderChannel = 'pickup';
  } else if(DINE_IN_MODE === 'simple' && !isServiceBusiness()){
    // Simple dine-in has no tables to manage — the customer sits wherever
    // they like. The channel STAYS available (the kitchen still needs to
    // know it plates rather than bags); only the screen goes, because
    // there is nothing on it. A service business keeps the screen: its
    // "tables" are bays or rooms, which are booked whatever the dining
    // arrangement is.
    if(tablesNavBtn) tablesNavBtn.remove();
  } else if(isServiceBusiness() && tablesNavBtn){
    // "طاولات" reads wrong for a car wash bay or clinic room — relabel the
    // nav tab text node in place rather than touching the markup file
    // (same DOM-surgery pattern already used above for hiding it entirely).
    const label = tablesNavBtn.querySelector('span') || tablesNavBtn;
    label.textContent = resourceLabels().bookingScreen;
    const screenHeading = document.getElementById('tablesScreenHeading');
    if(screenHeading) screenHeading.textContent = resourceLabels().bookingScreen;
    if(hasNoPhysicalResource()){
      const floorTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="floor"]');
      if(floorTabBtn) floorTabBtn.remove();
      tablesActiveTab = 'waitlist';
      document.querySelectorAll('#tablesTabs .seg-tab').forEach(t=>t.classList.remove('active'));
      const waitlistTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="waitlist"]');
      if(waitlistTabBtn) waitlistTabBtn.classList.add('active');
      document.getElementById('tablesFloorPane').classList.add('hidden');
      document.getElementById('tablesWaitlistPane').classList.remove('hidden');
    } else if(isHotelBusiness()){
      // Hotel keeps both tabs (rooms grid + bookings list are both real,
      // distinct views) — just relabels them and drops the reminders tab
      // entirely, since hotel never writes table_reservations.
      const floorTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="floor"]');
      if(floorTabBtn) floorTabBtn.textContent = 'الغرف';
      const waitlistTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="waitlist"]');
      if(waitlistTabBtn){
        for(const node of waitlistTabBtn.childNodes){ if(node.nodeType === 3){ node.nodeValue = 'الحجوزات'; break; } }
        waitlistTabBtn.classList.remove('hidden');
      }
      const remindersTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="reminders"]');
      if(remindersTabBtn) remindersTabBtn.remove();
      const legendEl = document.getElementById('tablesLegend');
      if(legendEl) legendEl.classList.add('hidden');
    }
  }
  if(loyaltyRes.data){
    NOTIFY_DELIVERY_PREP_WARNING = loyaltyRes.data.notify_delivery_prep_warning !== false;
    NOTIFY_DELIVERY_PREP_EXPIRED = loyaltyRes.data.notify_delivery_prep_expired !== false;
    NOTIFY_SOUND_ENABLED = loyaltyRes.data.notify_sound_enabled !== false;
    KITCHEN_DISPLAY_ENABLED = loyaltyRes.data.kitchen_display_enabled === true;
    TABLES_RESERVATIONS_ENABLED = loyaltyRes.data.tables_reservations_enabled === true;
    TABLES_RESERVATION_DEPOSIT_ENABLED = loyaltyRes.data.tables_reservation_deposit_enabled === true;
    TABLES_RESERVATION_DEPOSIT_PERCENT = loyaltyRes.data.tables_reservation_deposit_percent != null ? Number(loyaltyRes.data.tables_reservation_deposit_percent) : 20;
    TABLES_TURN_TIME_ENABLED = loyaltyRes.data.tables_turn_time_enabled === true;
    TABLES_TURN_TIME_MINUTES = loyaltyRes.data.tables_turn_time_minutes != null ? Number(loyaltyRes.data.tables_turn_time_minutes) : 45;
    TABLES_RESERVATION_CONFLICT_WARNING_ENABLED = loyaltyRes.data.tables_reservation_conflict_warning_enabled !== false;
    DINE_IN_PAY_TIMING = loyaltyRes.data.dine_in_pay_timing === 'after' ? 'after' : 'before';
    TABLES_SPECIFIC_BOOKING_ENABLED = loyaltyRes.data.tables_specific_booking_enabled === true;
  }
  const waitlistTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="waitlist"]');
  // tables_reservations_enabled is a restaurant-specific waitlist setting —
  // irrelevant to hotel, whose "الحجوزات" tab (bookings list) must always show.
  if(waitlistTabBtn && !isHotelBusiness()) waitlistTabBtn.classList.toggle('hidden', !TABLES_RESERVATIONS_ENABLED);
  const remindersTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="reminders"]');
  if(remindersTabBtn) remindersTabBtn.classList.toggle('hidden', !TABLES_RESERVATIONS_ENABLED);

  const stockNameById = {};
  STOCK_UNIT_BY_ID = {};
  (stockRes.data||[]).forEach(s=>{ stockNameById[s.id] = s.name; STOCK_UNIT_BY_ID[s.id] = s.unit; });

  DELIVERY_PLATFORMS_LIST = platformRes.data || [];
  PREP_TIMEOUT_MINUTES_BY_PLATFORM = {};
  DELIVERY_PLATFORMS_LIST.forEach(p=>{ PREP_TIMEOUT_MINUTES_BY_PLATFORM[p.id] = Number(p.prep_timeout_minutes) || 17; });
  PLATFORM_PRICES = {};
  (platformPriceRes.data||[]).forEach(pp=>{
    if(!PLATFORM_PRICES[pp.platform_id]) PLATFORM_PRICES[pp.platform_id] = {};
    PLATFORM_PRICES[pp.platform_id][pp.menu_item_id] = Number(pp.price);
  });

  CATEGORIES = (catRes.data||[]).map(c=>({id: String(c.id), name: c.name, nameEn: c.name_en || c.name, icon: iconForCategory(c.name)}));

  SERVICE_STAFF_BY_SERVICE = {};
  (serviceStaffRes.data||[]).forEach(r=>{ (SERVICE_STAFF_BY_SERVICE[r.service_id] ||= []).push(r.staff_member_id); });

  // Roadmap item 4 (unified checkout) — a service business (salon/car_wash/
  // clinic/mobile_car_wash) can now sell a physical retail product (shampoo,
  // air freshener) in the SAME cart as a service booking. services.id and
  // menu_items.id are independent sequences that can collide, so a
  // service's virtual PRODUCTS id is its real id negated (-s.id) — real
  // menu_items ids are always positive bigints, so this is collision-proof
  // with zero schema change. Every place that turns a cart line back into
  // an order_items row branches on the sign of productId (see
  // buildOrderPayload/registerTableOrder below) instead of the old
  // whole-cart isServiceBusiness() check. A service has no recipe/box/
  // modifiers, so it simply never gets a MENU_ITEM_META/MODIFIER_PRODUCTS
  // entry — computeLineStockDecrements() already no-ops gracefully when a
  // line's productId has no meta (unchanged behavior), and openProductFlow()
  // already takes the "simple product, add straight to cart" path when
  // MODIFIER_PRODUCTS[productId] is undefined.
  const serviceProducts = isServiceBusiness() ? (servicesRes.data||[]).map(s=>({
    id: -s.id, cat: String(s.category_id), name: s.name, price: Number(s.price),
    icon: 'bowl', image: null, fav: false, pop: 0,
    isService: true, durationMinutes: s.duration_minutes
  })) : [];

  const boxEligByItem = {}; (boxEligRes.data||[]).forEach(r=>{ if(!boxEligByItem[r.menu_item_id]) boxEligByItem[r.menu_item_id] = []; boxEligByItem[r.menu_item_id].push(r); });
  const groupIdsByItem = {}; (itemModRes.data||[]).forEach(r=>{ if(!groupIdsByItem[r.menu_item_id]) groupIdsByItem[r.menu_item_id] = []; groupIdsByItem[r.menu_item_id].push(r.modifier_group_id); });
  const catById = {}; (catRes.data||[]).forEach(c=> catById[c.id] = c);

  const menuItemProducts = (itemsRes.data||[]).map(m=>({
    id: m.id, cat: String(m.category_id), name: m.name, nameEn: m.name_en || null, price: Number(m.price),
    icon: iconForCategory(catById[m.category_id] ? catById[m.category_id].name : ''),
    image: m.image_url || null,
    imageThumb: m.image_thumb_url || null,
    barcode: m.barcode || null,
    isService: false, fav: false, pop: 0
  }));
  PRODUCTS = [...serviceProducts, ...menuItemProducts];

  // فئة ما بقي فيها منتج بعد الترشيح ما تُعرض. المنتجات فوق مُرشَّحة
  // أصلاً (active و visible_pos و hidden_until)، فالفئة التي أُخفي كل
  // ما فيها كانت تبقى تبويباً يفتح على شبكة فاضية — والكاشير يضغطه
  // أمام الزبون ولا يجد شيئاً. الخدمات داخلة في نفس القائمة، فصالون
  // بخدمات فقط ما تختفي فئاته.
  const catsWithProducts = new Set(PRODUCTS.map(p => p.cat));
  CATEGORIES = CATEGORIES.filter(c => catsWithProducts.has(c.id));

  BARCODE_TO_PRODUCT_ID = {};
  menuItemProducts.forEach(p=>{ if(p.barcode) BARCODE_TO_PRODUCT_ID[p.barcode] = p.id; });

  MENU_ITEM_META = {};
  MODIFIER_PRODUCTS = {};
  BOX_ELIGIBLE_META = {};
  (itemsRes.data||[]).forEach(m=>{
    // recipe/defaultMix stay empty here on purpose — checkout resolves them
    // server-side now (see the comment above loadPosData's Promise.all).
    MENU_ITEM_META[m.id] = { costMode: m.cost_mode, recipe: [], pointsRedeemPrice: m.points_redeem_price != null ? Number(m.points_redeem_price) : null };

    if(m.cost_mode === 'box'){
      // eligible items key off their own row id now, not the stock item id —
      // a 'simple' choice (no inventory tracking) has no stock_item_id at
      // all, so the selection key can't be the stock id anymore. BOX_ELIGIBLE_META
      // is the reverse lookup computeLineBoxSelections uses to build the
      // customer's picks the server then resolves against real stock.
      const eligibleItems = (boxEligByItem[m.id]||[]).map(r=>({
        id: r.id,
        name: r.cost_mode==='simple' ? r.name : (stockNameById[r.stock_item_id] || '—'),
        costMode: r.cost_mode, stockItemId: r.stock_item_id
      }));
      eligibleItems.forEach(e=>{ BOX_ELIGIBLE_META[e.id] = {stockItemId: e.stockItemId, costMode: e.costMode}; });
      MENU_ITEM_META[m.id].componentSlot = {
        totalPieces: m.total_pieces || 0,
        eligibleItems,
        defaultMix: []
      };
      MODIFIER_PRODUCTS[m.id] = {
        isBox: true, alwaysCustomize: true, slots: m.total_pieces || 0,
        items: eligibleItems.map(e=>({id: String(e.id), name: e.name})) // string id: matches how Object.entries(config.selections) keys come back out in formatConfigLabels/renderBoxBuilder (untouched, original code)
      };
      return;
    }

    const groupIds = groupIdsByItem[m.id] || [];
    if(groupIds.length === 0) return; // no modifier groups -> simple product, always fast-add

    const groups = groupIds.map(gid=>{
      const g = (groupRes.data||[]).find(x=>x.id===gid);
      if(!g) return null;
      const options = (optRes.data||[]).filter(o=>o.group_id===gid).map((o,i)=>{
        if(o.cost_mode === 'stock' && o.stock_item_id){
          MODIFIER_OPTION_STOCK[gid+'_'+o.id] = {stockItemId: o.stock_item_id, qty: Number(o.stock_qty), unit: o.stock_unit};
        }
        return {id: String(o.id), name: o.name, price: Number(o.price_delta)||0, default: i===0 && g.type==='single'};
      });
      return {id: String(g.id), name: g.name, type: g.type, required: g.type === 'single', max: g.max_select, options};
    }).filter(Boolean);

    if(groups.length > 0) MODIFIER_PRODUCTS[m.id] = { groups, alwaysCustomize: groups.some(g=>g.required) };
  });
}

/* ============ Real auth: one-time device provisioning (real manager/owner
   login, picks a branch, never used again) + cashier PIN login (username +
   4-digit PIN only, reusing the same synthetic-email trick documented in
   the migration: password = pin + '-pos', a fixed padding satisfying
   Supabase Auth's 6-char minimum without the cashier ever knowing it). */
let CURRENT_PROFILE = null;
let DEVICE = { businessId: null, branchId: null, branchName: null };

function loadDeviceConfig(){
  try {
    const raw = localStorage.getItem('rakeen_pos_device');
    if(raw) DEVICE = JSON.parse(raw);
  } catch (e) { /* ignore malformed/blocked storage — falls through to provisioning */ }
}
function saveDeviceConfig(){
  try { localStorage.setItem('rakeen_pos_device', JSON.stringify(DEVICE)); } catch (e) { /* storage may be unavailable (e.g. private mode) */ }
}
function showAuthScreen(id){
  document.querySelectorAll('.pos-auth-screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('posApp').classList.add('hidden');
  if(id) document.getElementById(id).classList.remove('hidden');
  else document.getElementById('posApp').classList.remove('hidden');
}

document.getElementById('provSubmitBtn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('provError');
  const branchField = document.getElementById('provBranchField');
  const branchSelect = document.getElementById('provBranchSelect');
  errEl.style.display = 'none';

  if(!branchField.classList.contains('hidden')){
    if(!branchSelect.value) return;
    DEVICE.branchId = parseInt(branchSelect.value, 10);
    DEVICE.branchName = branchSelect.options[branchSelect.selectedIndex].text;
    saveDeviceConfig();
    await window.supabaseClient.auth.signOut();
    showCashierLogin();
    return;
  }

  const email = document.getElementById('provEmail').value.trim();
  const password = document.getElementById('provPassword').value;
  if(!email || !password){ errEl.textContent = 'اكتب البريد وكلمة المرور.'; errEl.style.display='block'; return; }
  const submitBtn = document.getElementById('provSubmitBtn');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'جارٍ الدخول...';
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    const { data: profile, error: profErr } = await window.supabaseClient
      .from('profiles').select('business_id, user_type').eq('id', data.user.id).single();
    if(profErr || !profile) throw profErr || new Error('تعذر تحميل الحساب');
    if(profile.user_type === 'employee'){ await window.supabaseClient.auth.signOut(); throw new Error('لازم تسجّل دخول كمدير أو مالك عشان تجهّز الجهاز.'); }
    DEVICE.businessId = profile.business_id;
    const { data: business } = await window.supabaseClient
      .from('businesses').select('name').eq('id', profile.business_id).single();
    DEVICE.businessName = business ? business.name : '';
    const { data: branches, error: brErr } = await window.supabaseClient
      .from('branches').select('id, name').eq('business_id', profile.business_id);
    if(brErr) throw brErr;
    if(!branches || branches.length === 0){ throw new Error('ما فيه فروع مسجّلة لهذا المشروع.'); }
    if(branches.length === 1){
      DEVICE.branchId = branches[0].id; DEVICE.branchName = branches[0].name;
      saveDeviceConfig();
      await window.supabaseClient.auth.signOut();
      showCashierLogin();
      return;
    }
    branchSelect.innerHTML = branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    branchField.classList.remove('hidden');
    submitBtn.textContent = 'تأكيد الفرع';
  } catch(err){
    errEl.textContent = err && err.message ? err.message : 'تعذر تسجيل الدخول.';
    errEl.style.display = 'block';
    submitBtn.textContent = originalBtnText;
  } finally {
    submitBtn.disabled = false;
  }
});

let loginPinEntry = '';
function renderLoginPin(){
  document.getElementById('loginPinDots').innerHTML = Array.from({length:4}).map((_,i)=>
    `<span class="pin-dot ${i < loginPinEntry.length ? 'filled':''}"></span>`
  ).join('');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  document.getElementById('loginPinPad').innerHTML = keys.map(k=> k ? `<button class="pin-key" data-key="${k}">${k}</button>` : `<span></span>`).join('');
  document.getElementById('loginPinPad').querySelectorAll('.pin-key').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.dataset.key;
      if(k === '⌫') loginPinEntry = loginPinEntry.slice(0,-1);
      else if(loginPinEntry.length < 4) loginPinEntry += k;
      renderLoginPin();
      if(loginPinEntry.length === 4) attemptCashierLogin();
    });
  });
}
function showCashierLogin(){
  loginPinEntry = '';
  document.getElementById('posLoginError').style.display = 'none';
  document.getElementById('posLoginBranchLabel').textContent = DEVICE.branchName ? ('أدخل رمز فرع: ' + DEVICE.branchName) : 'أدخل رمز نقطة البيع لهذا الفرع';
  document.getElementById('pinVerifying').classList.add('hidden');
  document.getElementById('loginPinPad').classList.remove('hidden');
  renderLoginPin();
  showAuthScreen('posLoginScreen');
}
// Proxies through /api/pos/login instead of calling
// supabaseClient.auth.signInWithPassword() directly — a direct call never
// touches Rakeen's own server at all, so a PIN brute force couldn't be
// rate-limited or locked out no matter how few combinations the PIN has.
// See that route for the actual per-branch lockout logic.
async function attemptCashierLogin(){
  const errEl = document.getElementById('posLoginError');
  errEl.style.display = 'none';
  document.getElementById('loginPinPad').classList.add('hidden');
  document.getElementById('pinVerifying').classList.remove('hidden');
  try {
    const res = await fetch('/api/pos/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: DEVICE.branchId, pin: loginPinEntry }),
    });
    const result = await res.json();
    if(!res.ok || !result.session) throw new Error(result.error || 'رمز الفرع غلط.');
    const { error: sessionError } = await window.supabaseClient.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if(sessionError) throw sessionError;
    await loadCashierProfile(result.userId);
    await showStaffPick();
  } catch (e) {
    errEl.textContent = (e && e.message) || 'رمز الفرع غلط.';
    errEl.style.display = 'block';
    loginPinEntry = '';
    renderLoginPin();
    document.getElementById('pinVerifying').classList.add('hidden');
    document.getElementById('loginPinPad').classList.remove('hidden');
  }
}
document.getElementById('reprovisionLink').addEventListener('click', ()=>{
  localStorage.removeItem('rakeen_pos_device');
  DEVICE = { businessId: null, branchId: null, branchName: null };
  window.location.reload();
});
document.getElementById('posLogoutBtn').addEventListener('click', async ()=>{
  localStorage.removeItem('rakeen_pos_staff');
  await window.supabaseClient.auth.signOut();
  window.location.reload();
});
document.getElementById('posSwitchStaffBtn').addEventListener('click', ()=>{
  localStorage.removeItem('rakeen_pos_staff');
  showStaffPick();
});

async function loadCashierProfile(userId){
  const { data: profile, error } = await window.supabaseClient
    .from('profiles').select('id, business_id, branch_id, full_name, user_type').eq('id', userId).single();
  if(error || !profile){
    // A cold boot with literally no network can't run this query at all —
    // fall back to whatever profile last loaded successfully for this exact
    // account, rather than forcing a re-login that also can't succeed
    // offline (see initAuth's caller, which used to just sign the cashier
    // out here and land them on a PIN screen /api/pos/login can't reach).
    const cached = await getCacheValue('profile:' + userId).catch(()=>null);
    if(!cached || !cached.value) throw error || new Error('تعذر تحميل بيانات الجهاز');
    CURRENT_PROFILE = cached.value;
  } else {
    CURRENT_PROFILE = profile;
    try { await setCacheValue('profile:' + userId, profile); } catch(e) { /* IndexedDB unavailable — no fallback next time, not fatal now */ }
  }
  document.getElementById('posBusinessName').textContent = DEVICE.businessName || '';
  document.getElementById('posBranchName').textContent = DEVICE.branchName || '';
}

/* ============ Staff picker — who's on duty, purely for attributing orders
   (not a login of its own; the branch PIN above is the real credential) ============ */
let CURRENT_STAFF_MEMBER = null;
function applyStaffMember(member){
  CURRENT_STAFF_MEMBER = member;
  document.getElementById('posCashierName').textContent = 'مرحبًا، ' + (member ? member.name : 'بدون اسم');
  const avatarEl = document.getElementById('posCashierAvatar');
  avatarEl.textContent = member ? member.name.charAt(0) : '؟';
  avatarEl.title = member ? member.name : 'بدون اسم'; // the name/role text is hidden from the topbar now (see .user-cluster .identity-text) — this keeps it reachable on hover
  // localStorage, not sessionStorage: a genuine device restart (part of the
  // offline-boot chain this now needs to survive) clears sessionStorage,
  // which used to force a re-pick of who's on duty even though nothing
  // about that actually requires a fresh choice.
  try { localStorage.setItem('rakeen_pos_staff', JSON.stringify(member)); } catch (e) { /* ignore */ }
}
async function showStaffPick(){
  const el = document.getElementById('posStaffList');
  el.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  showAuthScreen('posStaffPickScreen');
  const { data } = await window.supabaseClient
    .from('staff_members').select('id, name, is_reservation_host').eq('branch_id', DEVICE.branchId).eq('active', true).order('name');
  // On the host stand, whoever's flagged as the dedicated reservation host
  // shows first — a small convenience, not a restriction (any staff member
  // can still pick their own name either way).
  const staff = HOST_MODE ? [...(data||[])].sort((a,b)=> (b.is_reservation_host===true) - (a.is_reservation_host===true)) : (data || []);
  if(staff.length === 0){
    el.innerHTML = '<p class="pos-auth-sub">ما فيه موظفين مضافين لهذا الفرع بعد — أضفهم من الإعدادات بالداشبورد.</p><button class="confirm-pay-btn" id="staffSkipBtn">متابعة بدون اسم</button>';
    document.getElementById('staffSkipBtn').addEventListener('click', async ()=>{
      applyStaffMember(null);
      await goToStaffReady(el);
    });
    return;
  }
  el.innerHTML = staff.map(s=>`<button class="pos-staff-btn" data-id="${s.id}" data-name="${s.name}">${s.name}</button>`).join('');
  el.querySelectorAll('.pos-staff-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      applyStaffMember({ id: parseInt(btn.dataset.id,10), name: btn.dataset.name });
      await goToStaffReady(el);
    });
  });
}

// Picking a name used to just sit there with no feedback while
// findOpenShift() (network) and, on a fresh boot, bootPos()'s full
// loadPosData()+renders (the heaviest step in the whole login chain) ran —
// exactly the "feels stuck" gap reported for this screen. Also the first
// real error handling around afterStaffReady(): it had none before, so a
// failed request here left the cashier frozen with no way back.
async function goToStaffReady(listEl){
  listEl.innerHTML = '<div class="pin-verifying"><span class="pin-verifying-spinner"></span>جارٍ تجهيز الكاشير...</div>';
  try {
    await afterStaffReady();
  } catch(e){
    showToast('صار خطأ وإحنا نجهّز الكاشير — حاول مرة ثانية');
    showStaffPick();
  }
}

/* ============ Shifts — a shift is scoped to the branch's shared PIN account
   (the only real auth identity here; see shifts_cashier_manage RLS: cashier_id
   = auth.uid()), so there's at most one open shift per branch at a time. Which
   staff member opened it is recorded via staff_member_id, purely for the
   dashboard's shift log — it doesn't grant any extra access. ============ */
let CURRENT_SHIFT = null;

async function findOpenShift(){
  // A network failure here used to read as "no data" (only `data` was
  // destructured, `error` silently dropped) — same supabase-js contract as
  // loadPosData's Promise.all (resolves {data:null,error} rather than
  // throwing). That meant a cold boot with no network always landed on
  // "بدء الوردية" even when a shift was genuinely already open, since it
  // couldn't tell "confirmed no open shift" apart from "couldn't check".
  const { data, error } = await window.supabaseClient
    .from('shifts').select('*').eq('cashier_id', CURRENT_PROFILE.id).is('closed_at', null)
    .order('opened_at', {ascending:false}).limit(1);
  if(error){
    const cached = await getCacheValue('shift:' + CURRENT_PROFILE.id).catch(()=>null);
    return cached ? cached.value : null;
  }
  const shift = (data && data[0]) || null;
  // Cache the real (possibly null) result on every successful check — a
  // shift closed while online must overwrite a stale "still open" cache
  // entry, not leave it behind for the next offline boot to wrongly trust.
  try { await setCacheValue('shift:' + CURRENT_PROFILE.id, shift); } catch(e) { /* IndexedDB unavailable — no fallback next time, not fatal now */ }
  return shift;
}

async function afterStaffReady(){
  // A host stand doesn't run a cash drawer — no shift concept applies, skip
  // straight to the app regardless of whether the branch's real POS
  // terminal happens to have one open right now.
  if(HOST_MODE){ await bootPos(); return; }
  CURRENT_SHIFT = await findOpenShift();
  if(CURRENT_SHIFT) await bootPos();
  else showOpenShiftScreen();
}

function showOpenShiftScreen(){
  document.getElementById('openShiftCashInput').value = '';
  document.getElementById('openShiftError').style.display = 'none';
  showAuthScreen('posOpenShiftScreen');
}

document.getElementById('openShiftSubmitBtn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('openShiftError');
  const input = document.getElementById('openShiftCashInput');
  const openingCash = parseFloat(input.value);
  errEl.style.display = 'none';
  if(!(openingCash >= 0)){ errEl.textContent = 'اكتب رصيد افتتاحي صحيح.'; errEl.style.display = 'block'; return; }
  try {
    const { data, error } = await window.supabaseClient.from('shifts').insert({
      business_id: CURRENT_PROFILE.business_id,
      branch_id: DEVICE.branchId,
      cashier_id: CURRENT_PROFILE.id,
      staff_member_id: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.id : null,
      opening_cash: openingCash
    }).select().single();
    if(error) throw error;
    CURRENT_SHIFT = data;
    await bootPos();
  } catch(err){
    errEl.textContent = err && err.message ? err.message : 'تعذر بدء الوردية.';
    errEl.style.display = 'block';
  }
});

let tablesRealtimeChannel = null;
function subscribeToTableChanges(){
  if(tablesRealtimeChannel) return; // one subscription per boot is enough — a re-login always reloads the whole page first
  tablesRealtimeChannel = window.supabaseClient
    .channel('pos-restaurant-tables')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, ()=>{
      if(document.getElementById('screen-tables').classList.contains('active')) renderTables();
    })
    .subscribe();
}

/* ============ Kitchen "order ready" alert — only for restaurants Rakeen
   has turned KITCHEN_DISPLAY_ENABLED on for. The kitchen device marks an
   order ready via mark_order_ready (any channel) or mark_delivery_order_ready
   (delivery only, also used by this very POS's own "جاهز" button) — both
   just set orders.ready_at, so listening for that column going non-null on
   this branch's orders covers either RPC without needing to special-case
   channels. selfMarkedReadyOrderIds skips alerting the cashier about their
   own action a moment after they take it. ============ */
let ordersReadyRealtimeChannel = null;
const selfMarkedReadyOrderIds = new Set();
function subscribeToOrderReadyAlerts(){
  if(!KITCHEN_DISPLAY_ENABLED || ordersReadyRealtimeChannel) return;
  ordersReadyRealtimeChannel = window.supabaseClient
    .channel('pos-order-ready-alerts')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, (payload)=>{
      const order = payload.new;
      if(!order || !order.ready_at) return;
      if(selfMarkedReadyOrderIds.has(order.id)){ selfMarkedReadyOrderIds.delete(order.id); return; }
      if(NOTIFY_SOUND_ENABLED) playAlertSound('order_ready');
      showToast('✅ طلب #' + order.id + ' جاهز — سلّمه للعميل');
    })
    .subscribe();
}

/* ============ Incoming online-order accept/reject popup ============
   Every online order now lands as status='pending' (see submit_online_order)
   and must be explicitly accepted or rejected by the cashier here before it
   becomes a real, kitchen-visible order. This is a genuinely new modal
   pattern for this file: every other modal (paymentModal/pinModal/
   modifierModal) is backdrop-click-dismissible — this one has no close
   button and no backdrop listener, since the only valid way out is an
   explicit Accept or Reject. A FIFO queue (not a single slot) means a
   second order arriving mid-review of the first is never lost or silently
   overwritten — it just waits its turn. ============ */
let incomingOrderQueue = [];
let incomingOrderModalBusy = false;
let incomingOrderSoundTimer = null;
let incomingOrderCurrent = null; // {order, items} for the order currently shown, so the reject-reason sub-view can go "back" without a re-fetch

function enqueueIncomingOrder(orderId){
  if(incomingOrderQueue.includes(orderId)) return;
  incomingOrderQueue.push(orderId);
  if(!incomingOrderModalBusy) showNextIncomingOrder();
}

async function showNextIncomingOrder(){
  if(incomingOrderQueue.length === 0){ stopIncomingOrderSound(); return; }
  // paymentModal is the one shell behind checkout, the loyalty-redemption
  // wait/picker steps, order detail, shift close, settings... all of it.
  // It and incomingOrderModal sit at the exact same z-index, so whichever is
  // later in the DOM (incomingOrderModal) simply paints over the other —
  // and since this modal has deliberately no backdrop-dismiss, a payment
  // already in progress (a real customer's loyalty confirmation is even
  // running a 2-minute countdown, see renderLoyaltyWaitStep) would be
  // completely buried with no visual cue anything was stuck underneath.
  // Defer instead: leave the order queued, don't mark ourselves busy, and
  // let closePaymentModalNow() re-drive the queue once that modal clears.
  if(paymentModal.classList.contains('show')) return;
  incomingOrderModalBusy = true;
  const orderId = incomingOrderQueue[0];
  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).maybeSingle(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  if(!order || order.status !== 'pending'){
    // already handled from another device (or the order vanished) — drop and move on
    incomingOrderQueue.shift();
    return showNextIncomingOrder();
  }
  incomingOrderCurrent = { order, items: items || [] };
  renderIncomingOrderModal(order, items || []);
  document.getElementById('incomingOrderModal').classList.add('show');
  startIncomingOrderSound();
}

function startIncomingOrderSound(){
  stopIncomingOrderSound();
  if(!NOTIFY_SOUND_ENABLED) return;
  playAlertSound('incoming_order');
  incomingOrderSoundTimer = setInterval(()=> playAlertSound('incoming_order'), 4000);
}
function stopIncomingOrderSound(){
  if(incomingOrderSoundTimer){ clearInterval(incomingOrderSoundTimer); incomingOrderSoundTimer = null; }
}

function advanceIncomingQueue(orderId){
  incomingOrderQueue = incomingOrderQueue.filter(id => id !== orderId);
  document.getElementById('incomingOrderModal').classList.remove('show');
  incomingOrderModalBusy = false;
  incomingOrderCurrent = null;
  stopIncomingOrderSound();
  if(incomingOrderQueue.length) showNextIncomingOrder();
}

async function acceptIncomingOrder(orderId){
  const acceptBtn = document.getElementById('incomingAcceptBtn');
  const rejectBtn = document.getElementById('incomingRejectBtn');
  if(acceptBtn) acceptBtn.disabled = true;
  if(rejectBtn) rejectBtn.disabled = true;
  const { error } = await window.supabaseClient.rpc('accept_online_order', { p_order_id: orderId });
  if(error){ showToast('تعذر قبول الطلب: ' + error.message); return advanceIncomingQueue(orderId); }

  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).single(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  // Kitchen ticket FIRST, then customer receipt SECOND — always, unconditionally
  // (not gated by the per-device DEVICE.printKitchenTicket/printCustomerReceipt
  // toggles that govern normal POS checkout auto-print). Both go through the
  // print queue now (persisted, retried with backoff) but the ordering
  // requirement only needs the kitchen job's FIRST attempt to have happened
  // before the receipt job is even created — waiting for its full retry
  // chain (up to ~2 minutes) would hang this accept flow far longer than
  // the 8s ceiling the cashier used to see here.
  // العميل أولاً هنا أيضاً، ونُنتظر أول محاولة له لا للمطبخ: الورقة
  // التي يجب أن تكون بيد الكاشير قبل أن تُغلق الشاشة هي فاتورة الزبون.
  const receiptJob = await enqueuePrintJob('receipt', buildHistoricalReceiptData(order, items || []));
  await awaitPrintJobFirstAttempt(receiptJob);
  await enqueuePrintJob('kitchen', buildDbKitchenReceiptData(order, items || []));
  // Without this, an accepted delivery order only appears in the "جارية"
  // (running) list after the next page reload — seedActiveDeliveryOrders()
  // would eventually pick it up, but nothing repopulates ACTIVE_DELIVERY_ORDERS
  // live when an order is accepted mid-session, so the cashier sees it on the
  // kitchen board but not here until they reload. Mirrors registerActiveDeliveryOrder's
  // shape (called for POS-native delivery orders) but with the online-order fields
  // seedActiveDeliveryOrders already uses for source==='online' rows.
  if(order && order.channel === 'delivery'){
    ACTIVE_DELIVERY_ORDERS.push({
      id: order.id, createdAt: new Date(order.created_at), platformId: order.delivery_platform_id,
      platformName: 'متجر المطعم', total: Number(order.total), isOnline: true,
      invoiceLast4: order.platform_invoice_last4, warnedAt5min: false, alertedExpired: false, readyAt: null, outForDeliveryAt: null
    });
    updateNotifBell();
  }
  // Same "don't make the cashier wait for a reload" fix as the delivery block
  // above, mirrored for pickup — see ACTIVE_PICKUP_ORDERS' own comment for why
  // pickup needs this tracking at all (it had none before this feature).
  if(order && order.channel === 'pickup' && order.source === 'online'){
    ACTIVE_PICKUP_ORDERS.push({
      id: order.id, createdAt: new Date(order.created_at), customerName: order.customer_name, total: Number(order.total),
      scheduledFor: order.scheduled_for ? new Date(order.scheduled_for) : null, scheduledByCustomer: !!order.scheduled_by_customer,
      readyAt: null
    });
  }
  showToast('تم قبول الطلب #' + orderId);
  if(document.getElementById('screen-orders').classList.contains('active')) renderOrdersList();
  advanceIncomingQueue(orderId);
}

async function rejectIncomingOrder(orderId, reason){
  const { error } = await window.supabaseClient.rpc('reject_online_order', { p_order_id: orderId, p_reason: reason });
  if(error){ showToast('تعذر رفض الطلب: ' + error.message); return advanceIncomingQueue(orderId); }
  showToast('تم رفض الطلب #' + orderId);
  advanceIncomingQueue(orderId);
}

// ASAP (scheduled_by_customer=false) is just this order's own prep estimate,
// not a real commitment the customer is expecting — a plain line is enough.
// A time the customer actually PICKED deserves a loud, hard-to-miss banner so
// the cashier notices and doesn't treat it like a normal now-order.
function pickupTimeNoteHtml(order){
  if(order.channel !== 'pickup' || !order.scheduled_for) return '';
  const timeStr = new Date(order.scheduled_for).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
  if(!order.scheduled_by_customer){
    return `<div class="receipt-detail-row"><span>وقت الاستلام</span><span class="mono">الآن</span></div>`;
  }
  return `<div class="pickup-scheduled-alert">⏰ العميل اختار وقت استلام لاحق — <span class="mono">${timeStr}</span></div>`;
}

const INCOMING_ORDER_REJECT_REASONS = ['عدم توفر الصنف', 'المطعم مشغول', 'خارج نطاق التوصيل', 'الفرع مغلق الآن'];

function renderIncomingOrderModal(order, items){
  const itemsHtml = items.map(it=>{
    const mods = (it.selected_modifiers||[]).map(m=>escapeHtml(m.text)).join('، ');
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    const name = escapeHtml(product ? product.name : ('منتج #' + it.menu_item_id));
    return `<div class="receipt-detail-row"><span>${it.qty} × ${name}${mods ? ' (' + mods + ')' : ''}${it.note ? ' — ' + escapeHtml(it.note) : ''}</span>${rkMoney(Number(it.line_total))}</div>`;
  }).join('');
  const phoneDigits = (order.customer_phone || '').replace(/\D/g, '');
  const body = document.getElementById('incomingOrderModalBody');
  body.innerHTML = `
    <div class="receipt-detail-row" style="border-bottom:none; font-weight:800;"><span>${escapeHtml(CHANNEL_LABELS[order.channel] || order.channel)}${order.customer_name ? ' — ' + escapeHtml(order.customer_name) : ''}</span><span></span></div>
    ${order.customer_phone ? `<a class="incoming-order-call" href="tel:${escapeHtml(phoneDigits)}">📞 ${escapeHtml(order.customer_phone)}</a>` : ''}
    <div class="receipt-detail-row"><span>طريقة الدفع</span><span class="mono">${escapeHtml(PAYMENT_METHOD_LABELS_POS[order.payment_method] || order.payment_method)}${order.payment_method === 'cash' ? ' — يُدفع عند الاستلام' : ''}</span></div>
    ${pickupTimeNoteHtml(order)}
    ${order.delivery_address ? `<div class="receipt-detail-row"><span>عنوان التوصيل</span><span>${escapeHtml(order.delivery_address)}</span></div>` : ''}
    ${itemsHtml}
    <div class="receipt-total">${rkMoney(Number(order.total))}</div>
    <div class="incoming-order-actions">
      <button class="confirm-pay-btn" id="incomingAcceptBtn">قبول ✅</button>
      <button class="clear-btn armed" id="incomingRejectBtn">رفض ❌</button>
    </div>
  `;
  document.getElementById('incomingAcceptBtn').addEventListener('click', ()=> acceptIncomingOrder(order.id));
  document.getElementById('incomingRejectBtn').addEventListener('click', ()=> renderRejectReasonView(order.id));
}

function renderRejectReasonView(orderId){
  const body = document.getElementById('incomingOrderModalBody');
  body.innerHTML = `
    <p class="pos-auth-sub">اختر سبب الرفض</p>
    <div class="reject-reason-chips">
      ${INCOMING_ORDER_REJECT_REASONS.map(r=>`<button class="reject-reason-chip" data-reason="${r}">${r}</button>`).join('')}
      <button class="reject-reason-chip" data-reason="__other__">سبب آخر</button>
    </div>
    <div class="pos-auth-field" id="rejectOtherField" style="display:none;"><input type="text" id="rejectOtherInput" placeholder="اكتب السبب..."></div>
    <div class="incoming-order-actions">
      <button class="clear-btn" id="rejectBackBtn">رجوع</button>
      <button class="confirm-pay-btn" id="rejectConfirmBtn" disabled>تأكيد الرفض</button>
    </div>
  `;
  let selectedReason = null;
  const confirmBtn = document.getElementById('rejectConfirmBtn');
  const otherField = document.getElementById('rejectOtherField');
  const otherInput = document.getElementById('rejectOtherInput');
  body.querySelectorAll('.reject-reason-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      body.querySelectorAll('.reject-reason-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      if(chip.dataset.reason === '__other__'){
        otherField.style.display = 'block';
        selectedReason = otherInput.value.trim() || null;
      } else {
        otherField.style.display = 'none';
        selectedReason = chip.dataset.reason;
      }
      confirmBtn.disabled = !selectedReason;
    });
  });
  otherInput.addEventListener('input', (e)=>{
    selectedReason = e.target.value.trim() || null;
    confirmBtn.disabled = !selectedReason;
  });
  document.getElementById('rejectBackBtn').addEventListener('click', ()=>{
    if(incomingOrderCurrent) renderIncomingOrderModal(incomingOrderCurrent.order, incomingOrderCurrent.items);
  });
  confirmBtn.addEventListener('click', ()=>{
    confirmBtn.disabled = true;
    rejectIncomingOrder(orderId, selectedReason);
  });
}

let incomingOrdersRealtimeChannel = null;
function subscribeToIncomingOnlineOrders(){
  if(incomingOrdersRealtimeChannel) return;
  incomingOrdersRealtimeChannel = window.supabaseClient
    .channel('pos-incoming-online-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, (payload)=>{
      const order = payload.new;
      if(!order || order.status !== 'pending') return;
      enqueueIncomingOrder(order.id);
    })
    .subscribe();
}

/* ============ General "الطلبات" screen live sync ============
   Before this, the Orders screen only ever refreshed on this device's OWN
   actions (checkout, refund, accept, mark-ready) or a manual tab click — a
   sale rung up on a SECOND register, or an online order accepted/rejected
   from elsewhere, sat stale here until the cashier happened to click a tab or
   reload the page. Deliberately a separate, always-on channel rather than
   piggybacking on pos-order-ready-alerts, since that one only subscribes at
   all when KITCHEN_DISPLAY_ENABLED is on (most businesses don't have it) —
   this needs to work for every business regardless of that flag. */
function syncActiveDeliveryOrderFromRow(order){
  if(!order || order.channel !== 'delivery' || order.status !== 'completed') return;
  const tracked = ACTIVE_DELIVERY_ORDERS.find(o=>o.id===order.id);
  if(order.delivered_at != null){
    // delivered from another device (or this device's own action, already
    // removed locally by markDeliveryOrderDelivered — this is then a no-op)
    if(tracked){ ACTIVE_DELIVERY_ORDERS = ACTIVE_DELIVERY_ORDERS.filter(o=>o.id!==order.id); updateNotifBell(); }
    return;
  }
  if(tracked){
    // already tracked — the only thing that can meaningfully change while it
    // stays on this list is ready_at flipping from null to set (another
    // device tapped "جاهز")
    if(order.ready_at && !tracked.readyAt){ tracked.readyAt = new Date(order.ready_at); updateNotifBell(); }
    return;
  }
  const platform = DELIVERY_PLATFORMS_LIST.find(p=>p.id === order.delivery_platform_id);
  ACTIVE_DELIVERY_ORDERS.push({
    id: order.id, createdAt: new Date(order.created_at), platformId: order.delivery_platform_id,
    platformName: order.source === 'online' ? 'متجر المطعم' : (platform ? platform.name : 'توصيل'),
    total: Number(order.total), isOnline: order.source === 'online',
    invoiceLast4: order.platform_invoice_last4, warnedAt5min: false, alertedExpired: false,
    readyAt: order.ready_at ? new Date(order.ready_at) : null,
    outForDeliveryAt: order.out_for_delivery_at ? new Date(order.out_for_delivery_at) : null
  });
  updateNotifBell();
}

// Mirrors syncActiveDeliveryOrderFromRow exactly, for pickup — see
// ACTIVE_PICKUP_ORDERS' own comment for why this list exists at all.
function syncActivePickupOrderFromRow(order){
  if(!order || order.channel !== 'pickup' || order.source !== 'online' || order.status !== 'completed') return;
  const tracked = ACTIVE_PICKUP_ORDERS.find(o=>o.id===order.id);
  if(order.delivered_at != null){
    if(tracked) ACTIVE_PICKUP_ORDERS = ACTIVE_PICKUP_ORDERS.filter(o=>o.id!==order.id);
    return;
  }
  if(tracked){
    if(order.ready_at && !tracked.readyAt) tracked.readyAt = new Date(order.ready_at);
    return;
  }
  ACTIVE_PICKUP_ORDERS.push({
    id: order.id, createdAt: new Date(order.created_at), customerName: order.customer_name, total: Number(order.total),
    scheduledFor: order.scheduled_for ? new Date(order.scheduled_for) : null, scheduledByCustomer: !!order.scheduled_by_customer,
    readyAt: order.ready_at ? new Date(order.ready_at) : null
  });
}

let ordersLiveSyncChannel = null;
function subscribeToOrdersLiveSync(){
  if(ordersLiveSyncChannel) return;
  const onOrdersChange = (payload)=>{
    syncActiveDeliveryOrderFromRow(payload.new);
    syncActivePickupOrderFromRow(payload.new);
    if(document.getElementById('screen-orders').classList.contains('active')) renderOrdersList();
  };
  ordersLiveSyncChannel = window.supabaseClient
    .channel('pos-orders-live-sync')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, onOrdersChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, onOrdersChange)
    .subscribe();
}

// Catches orders that arrived while this device was offline/asleep/reloading —
// the realtime INSERT subscription alone only sees orders from this point on.
async function loadPendingOnlineOrdersOnBoot(){
  const { data } = await window.supabaseClient
    .from('orders').select('id')
    .eq('branch_id', DEVICE.branchId).eq('status', 'pending')
    .order('created_at', { ascending: true });
  (data || []).forEach(o => enqueueIncomingOrder(o.id));
}

async function bootPos(){
  await loadPosData();
  if(HOST_MODE){
    document.getElementById('posApp').classList.add('host-mode');
    document.getElementById('posApp').classList.remove('home-active'); // Tables, not Home, is the only reachable screen here
    document.getElementById('posCashierRole').textContent = 'الحجز والطاولات';
    renderTables();
    subscribeToTableChanges();
    showAuthScreen(null);
    // Order-taking/payment stay entirely off this device (see the sheet
    // buttons hidden below in HOST_MODE) — a real cashier registers the
    // order later from the actual POS once they check the table — so the
    // product grid / cart never needs to load here at all.
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelector('.nav-tab[data-screen="tables"]').classList.add('active');
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-tables').classList.add('active');
    return;
  }
  renderPlatformButtons();
  applyLang(); // re-apply now that CATEGORIES/PRODUCTS carry real nameEn values
  renderCatRail();
  renderProductGrid();
  renderOrder();
  await seedActiveDeliveryOrders();
  await seedActivePickupOrders();
  updateNotifBell();
  renderOrdersList();
  // mobile_car_wash lands on the waitlist pane by default (no floor grid —
  // see hasNoPhysicalResource() above), so populate that instead of the grid.
  if(isHotelBusiness()){ renderHotelActiveTab(); subscribeToHotelChanges(); }
  else {
    if(tablesActiveTab === 'waitlist') renderWaitlist();
    else renderTables();
    subscribeToTableChanges();
  }
  subscribeToOrderReadyAlerts();
  subscribeToIncomingOnlineOrders();
  subscribeToOrdersLiveSync();
  await loadPendingOnlineOrdersOnBoot();
  showAuthScreen(null);
  if(isRetailBusiness()) document.getElementById('searchInput').focus();
}

/* ============ Init ============ */
loadDeviceConfig();
updatePrinterStatusPill();
(async function initAuth(){
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if(session){
    try {
      await loadCashierProfile(session.user.id);
      if(CURRENT_PROFILE.user_type !== 'employee' || !CURRENT_PROFILE.branch_id){
        await window.supabaseClient.auth.signOut();
        CURRENT_PROFILE = null;
      }
    } catch (e) { CURRENT_PROFILE = null; }
  }
  if(!DEVICE.businessId || !DEVICE.branchId){
    showAuthScreen('posProvisionScreen');
  } else if(CURRENT_PROFILE){
    try {
      const savedStaff = JSON.parse(localStorage.getItem('rakeen_pos_staff') || 'null');
      if(savedStaff){ applyStaffMember(savedStaff); await afterStaffReady(); }
      else await showStaffPick();
    } catch (e) { await showStaffPick(); }
  } else {
    showCashierLogin();
  }
})();

})();
