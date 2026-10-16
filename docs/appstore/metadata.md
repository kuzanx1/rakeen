# ركين على App Store: كل النصوص جاهزة للنسخ

> كل خانة تحتها النص اللي تنسخه كما هو. الحد الأقصى من آبل مكتوب بين قوسين.

---

## 1) App Information (معلومات التطبيق)

| الخانة | القيمة |
|---|---|
| **Name** (30) | `ركين - كاشير المطاعم` |
| **Subtitle** (30) | `كاشير ومطبخ ومخزون وولاء` |
| **Primary Category** | Business |
| **Secondary Category** | Food & Drink |
| **Privacy Policy URL** | `https://rakeenapp.com/privacy` |
| **Content Rights** | لا يحتوي محتوى طرف ثالث (No) |
| **Age Rating** | كل الأسئلة «None / No» ← النتيجة **4+** |

إنجليزي (لو تضيف لغة English):
- **Name:** `Rakeen POS`
- **Subtitle:** `Restaurant cashier & kitchen`

---

## 2) Pricing and Availability

- **Price:** Free (مجاني)
- **Availability:** Saudi Arabia (وتقدر تضيف دول الخليج)

---

## 3) صفحة النسخة 1.0 (iOS App 1.0)

### Promotional Text (170)
```
أول 350 طلب مجانًا بكل المزايا: كاشير، مطبخ، مخزون، وولاء. بدون عقد ولا التزام.
```

### Description (4000)
```
ركين نظام كاشير للمطاعم والكافيهات والفود ترك، يشتغل على الآيباد والآيفون.

كاشير سريع
• بيع بضغطة، مع الإضافات والملاحظات
• كاش وشبكة ودفع مقسّم
• يكمل البيع حتى لو انقطع الإنترنت، ويرسل الطلبات أول ما يرجع
• فاتورة ضريبية برمز QR مع كل طلب

المطبخ والطاولات
• طلبات المطبخ تنطبع لحالها على طابعة المطبخ
• الطاولات والطلبات الجارية بمكان واحد

الطلبات الأونلاين
• طلبات متجرك الإلكتروني توصل الكاشير مباشرة، وتقبلها أو ترفضها بضغطة

العملاء والولاء
• نقاط ومستويات، والعميل يستبدل مكافأته عند الكاشير
• بطاقة ولاء في Apple Wallet بدون تطبيق للعميل

إغلاق اليوم
• فتح وإغلاق الوردية، وحركة النقد، وسجل الطلبات والاسترجاع

يتصل مع لوحة تحكم ركين على الويب: المنيو، المخزون، التقارير، الموظفين، وصافي الربح.

التطبيق لأصحاب المطاعم المشتركين في ركين. للاشتراك والتجربة: rakeenapp.com
```

### Keywords (100) ← 80 حرف
```
كاشير,نقاط بيع,مطاعم,كافيه,فاتورة ضريبية,مخزون,مطبخ,ولاء,منيو,محاسبة,فود ترك,POS
```
إنجليزي ← 96 حرف:
```
pos,cashier,restaurant,cafe,point of sale,zatca,vat invoice,inventory,kitchen,loyalty,menu,saudi
```

### Support URL
```
https://rakeenapp.com
```
### Marketing URL
```
https://rakeenapp.com
```
### Copyright
```
2026 Rakeen
```

---

## 4) App Review Information (أهم جزء)

**Sign-in required:** ✅
- **User name:** _(إيميل مطعم تجريبي، تسويه أنت من لوحة الأدمن)_
- **Password:** _(كلمته)_

**Contact:** اسمك، جوالك `+966557444227`، إيميلك.

### Notes (انسخها كما هي)
```
Rakeen is a point-of-sale (cashier) app for restaurants and cafes in Saudi Arabia. It is used by business staff, not consumers.

How to test:
1. Sign in with the demo account above. This links the device to the demo restaurant.
2. Enter the cashier PIN: ____ (4 digits).
3. Tap any product to add it to the order, then tap "ادفع" (Pay) and choose Cash to complete a sale.

A receipt printer is optional; without one the sale completes normally.
Accounts are created by Rakeen for each restaurant; businesses subscribe with us directly (B2B). There are no in-app purchases.
The interface is in Arabic; English can be switched from the top bar (EN).
```

---

## 5) App Privacy (الخصوصية)

**Do you collect data?** Yes

| نوع البيانات | ليش | مربوطة بالمستخدم؟ | تتبع؟ |
|---|---|---|---|
| Contact Info ← Name | App Functionality | Yes | No |
| Contact Info ← Email Address | App Functionality | Yes | No |
| Contact Info ← Phone Number (عملاء الولاء) | App Functionality | Yes | No |
| Purchases ← Purchase History (الطلبات) | App Functionality | Yes | No |
| Identifiers ← User ID | App Functionality | Yes | No |

- **Tracking:** No (ما فيه إعلانات ولا تتبع)
- **Diagnostics / Analytics:** لا (التطبيق ما فيه أدوات تحليلات أو تقارير أعطال خارجية)

---

## 6) الصور (Screenshots) ✅ جاهزة

في مجلد `docs/appstore/screenshots/`:

| الجهاز | المقاس | الملفات |
|---|---|---|
| iPad 13 إنش | 2752 × 2064 (بالعرض) | `ipad-01-cart` … `ipad-05-loyalty` |
| iPhone 6.9 إنش | 1290 × 2796 | `iphone-01-cart` … `iphone-05-loyalty` |

الترتيب: الكاشير ← الدفع ← طلب أونلاين وصل ← الطاولات ← العملاء ونقاطهم.

كلها شاشات الكاشير الحقيقية (نفس الكود والتصميم اللي في التطبيق، والنصوص نفسها موجودة في التطبيق: PaymentModal، IncomingOrderModal، TablesScreen، CustomerPickerModal)، ببيانات تجريبية بأصناف هَبيّة.
لإعادة توليدها بعد أي تغيير في الشكل: شغّل السيرفر المحلي، ثم `node tools/appstore-shots/scenes.cjs ipad` و `iphone` ثم `THEME=cream node tools/appstore-shots/make.cjs`.
