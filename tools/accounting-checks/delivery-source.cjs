/**
 * طلبُ التوصيل يحمل مصدرَه دائماً -- تطبيقاً أو «جوال».
 *
 * كان الصفُّ يُفتح على أوّل تطبيقٍ حين توجد تطبيقات، وعلى لا شيءٍ حين
 * لا توجد. فمطعمٌ بلا تطبيقات (وهم من أجلهم صُنع «جوال») يضغط «توصيل»
 * ويدفع، فيُحفظ الطلبُ بـ channel=delivery وبلا منصّةٍ وبلا آخرِ أربعة
 * -- فلا شيءَ فيه يقول إنه جاء بالهاتف. ثم يُقرأ في اللوحة «توصيل»
 * عارياً، وفي تقرير التطبيقات لا يُحسب على أحد. (بلاغ صاحب المطعم
 * ٢٠٢٦/١١/٢٠، الطلب ٥٧.)
 *
 * والقاعدةُ الآن واحدة: أوّلُ ما في الصفِّ هو المختار -- والصفُّ يضمّ
 * «جوال» حين تكون طلباتُ الجوال مفعّلة. فيُحرس أن العميلين يأخذانها
 * من مكانٍ واحد، وأن التصفير بعد البيع لا يعيد الفراغ.
 *
 * (الأنماطُ تبدأ بأوّل السطر: سطرٌ معلَّقٌ ليس تنفيذاً -- انظر
 * last4-reset.cjs، فقد مرّ حارسٌ على سطرٍ معلَّق.)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const fails = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// ١) القاعدةُ نفسُها في الحقل، لا منسوخةً في الشاشة.
const domain = read('react-native-poc/src/domain/phoneOrder.ts');
if (!/^export function defaultDeliverySourceId\(/m.test(domain)) {
  fails.push('ما لقينا defaultDeliverySourceId في domain/phoneOrder.ts');
}

// ٢) التطبيق: الشاشةُ تناديها، ولا تصفّر المصدرَ إلى فراغٍ بعد البيع.
const app = read('react-native-poc/src/ui/ProductsScreen.tsx');
if (!/defaultDeliverySourceId\(/.test(app)) {
  fails.push(
    'التطبيق: ما ينادي defaultDeliverySourceId — طلبُ توصيلٍ ممكن ' +
      'يُحفظ بلا مصدر (ProductsScreen.tsx)',
  );
}
if (/^[ \t]*setDeliveryPlatformId\(null\)/m.test(app)) {
  fails.push(
    'التطبيق: المصدر يُصفَّر إلى null — الطلبُ الذي بعده يمضي بلا ' +
      'مصدر. رجّعه إلى أوّل الصفّ (ProductsScreen.tsx)',
  );
}
const settleIdx = app.indexOf('transaction fully settled -- start clean for the next customer');
if (settleIdx >= 0 && !/^[ \t]*setDeliveryPlatformId\(/m.test(app.slice(settleIdx, settleIdx + 1800))) {
  fails.push('التطبيق: المصدر ما يرجع لأصله بعد البيع (ProductsScreen.tsx)');
}

// ٣) الويب: الافتراضيُّ من الصفِّ المعروض (rowItems)، لا من قائمة
//    التطبيقات وحدها -- وإلّا سقط «جوال» من الحساب من جديد.
const web = read('public/pos/rakeen-pos.js');
const fnIdx = web.indexOf('function renderPlatformButtons()');
if (fnIdx < 0) {
  fails.push('ما لقينا renderPlatformButtons في rakeen-pos.js');
} else {
  const body = web.slice(fnIdx, fnIdx + 1600);
  if (!/^[ \t]*if\(!state\.deliveryPlatformId && rowItems\.length\)/m.test(body)) {
    fails.push(
      'الويب: الاختيارُ الافتراضيّ ما يُؤخذ من rowItems — «جوال» ما ' +
        'يُختار لمطعمٍ بلا تطبيقات (rakeen-pos.js)',
    );
  }
  const rowIdx = body.indexOf('const rowItems');
  const defIdx = body.indexOf('if(!state.deliveryPlatformId');
  if (rowIdx >= 0 && defIdx >= 0 && defIdx < rowIdx) {
    fails.push('الويب: الافتراضيّ يُحسب قبل بناء rowItems (rakeen-pos.js)');
  }
}
if (/^[ \t]*if\(!state\.deliveryPlatformId && DELIVERY_PLATFORMS_LIST\.length\)/m.test(web)) {
  fails.push(
    'الويب: بقيت قاعدةٌ ثانيةٌ تتجاهل «جوال» ' +
      '(if(!state.deliveryPlatformId && DELIVERY_PLATFORMS_LIST.length)) — rakeen-pos.js',
  );
}

// ٤) ومن يقرأ الطلبَ المحفوظ يعرفه بالمال، لا بآخرِ أربعةٍ وحدها:
//    طلبُ المنصّة 'delivery_platform' دائماً (وكان كذلك قبل «جوال»)،
//    وطلبُ الجوال يُدفع عندنا. فطلبٌ بلا أربعةٍ يبقى معروفاً.
if (!/^export function isPhoneOrderRow\(/m.test(domain)) {
  fails.push('ما لقينا isPhoneOrderRow في domain/phoneOrder.ts');
} else if (!/o\.paymentMethod !== 'delivery_platform'/.test(domain)) {
  fails.push('القاعدة ما تنظر لطريقة الدفع — رجعت تعتمد على آخر أربعة وحدها');
}
const dash = read('public/dashboard/rakeen-dashboard.js');
if (!/^function odIsPhoneOrder\(/m.test(dash)) {
  fails.push('اللوحة: ما لقينا odIsPhoneOrder — «جوال» يرجع «توصيل» عارياً');
}
if (/platform_invoice_last4 \? 'جوال'/.test(dash)) {
  fails.push("اللوحة: بقي موضعٌ يعرف «جوال» بآخر أربعةٍ وحدها (rakeen-dashboard.js)");
}
if (/platform_invoice_last4 \? RK_PHONE_PLATFORM_LABEL/.test(web)) {
  fails.push('كاشير الويب: بقي موضعٌ يعرف «جوال» بآخر أربعةٍ وحدها (rakeen-pos.js)');
}

// ٥) وكلُّ أيقونةٍ تطلبها شاراتُ الطلبات موجودةٌ في خريطة اللوحة.
//    طلبنا «phone» ولا وجودَ له فيها، فخرجت شارةُ «جوال» بمربّعٍ فارغ:
//    اسمٌ مجهولٌ لا يُخطئ، إنما يُرسم فراغاً -- فلا يراه إلا المستخدم.
{
  const metaIdx = dash.indexOf('const ORDER_CHANNEL_TAG_META');
  const mapIdx = dash.indexOf('const RK_ICON_PATHS');
  if (metaIdx < 0 || mapIdx < 0) {
    fails.push('اللوحة: ما لقينا شارات الطلبات أو خريطة الأيقونات');
  } else {
    const meta = dash.slice(metaIdx, dash.indexOf('};', metaIdx));
    const map = dash.slice(mapIdx, dash.indexOf('\nfunction rkIcon', mapIdx));
    for (const m of meta.matchAll(/icon:\s*'([a-z0-9_-]+)'/gi)) {
      if (!map.includes('\n  ' + m[1] + ':')) {
        fails.push('اللوحة: أيقونة «' + m[1] + '» مطلوبةٌ في شارات الطلبات ولا وجودَ لها في RK_ICON_PATHS');
      }
    }
  }
}

/* ── آخرُ أربعةٍ اختياريّة، وسقفُها أربعة ──
   كانت تمنع التأكيد حتى تُكتب أربعةٌ كاملة. فكاشيرٌ لم يسمع إلّا
   رقمين يقف -- أو يخترع أربعةً ليمضي، وهذا أسوأ: رقمٌ مخترَعٌ
   يُسلَّم به طلبٌ لغير صاحبه. والعودةُ إليها في عميلٍ دون الآخر لا
   تُرى: الورقةُ تخرج، وإنّما يقف كاشيرٌ واحدٌ في فرعٍ واحد. */
{
  const webPos = read('public/pos/rakeen-pos.js');
  const pay = read('react-native-poc/src/ui/PaymentModal.tsx');
  if (!/function rkLast4Ok\(\)\s*\{\s*return true; \}/.test(webPos)) {
    fails.push('كاشيرُ الويب يشترط أربعةَ أرقامٍ لتأكيد الطلب');
  }
  if (/last4Valid\s*\?/.test(webPos) || /confirmPayBtn'\)\.disabled/.test(webPos)) {
    fails.push('كاشيرُ الويب يُعطّل زرَّ التأكيد على آخر أربعة');
  }
  if (/needsLast4 && !\/\^\\d\{4\}\$\//.test(pay)) {
    fails.push('التطبيقُ يشترط أربعةَ أرقامٍ لتأكيد الطلب');
  }
  // والسقفُ باقٍ: أربعةٌ حدّاً أعلى في العميلين.
  if (!/maxlength="4"/.test(webPos)) fails.push('كاشيرُ الويب بلا سقفٍ لآخر أربعة');
  if (!/maxLength=\{4\}/.test(pay)) fails.push('التطبيقُ بلا سقفٍ لآخر أربعة');

  /* ── «جوال» قناةٌ باسمها حين لا تطبيقَ للمنشأة ──
     مطعمٌ يستقبل بالجوال وحدَه لا يُقال له «أخرى» ثمّ يُفتح له صفٌّ
     فيه خيارٌ واحد. وإن سقط التمريرُ في عميلٍ وقف الكاشيرُ ينتظر
     جواباً لا يُسأل: خطوةٌ لا تمضي، وبيعةٌ لا تُحفظ. */
  for (const [who, src, needle] of [
    ['كاشير الويب', webPos, /const phoneOnly = DELIVERY_PLATFORMS_LIST\.length === 0 && PHONE_ORDERS_ENABLED;/],
    ['التطبيق', pay, /const phoneOnly = deliveryPlatforms\.length === 0 && phoneOrdersEnabled;/],
  ]) {
    if (!needle.test(src)) fails.push(`${who}: «جوال» ما صارت قناةً باسمها بلا تطبيقات`);
  }
  if (!/state\.orderChannel !== 'delivery' \|\| phoneOnly/.test(webPos)) {
    fails.push('كاشيرُ الويب يقف عند «جوال» ينتظر اختيارَ تطبيقٍ لا وجودَ له');
  }
  if (!/if \(phoneOnly\) advanceToCustomer\(PHONE_PLATFORM\.id\);/.test(pay)) {
    fails.push('التطبيقُ يقف عند «جوال» ينتظر اختيارَ تطبيقٍ لا وجودَ له');
  }
}

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(
  Buffer.from('✓ مصدرُ طلب التوصيل: أوّلُ الصفِّ مختارٌ دائماً في العميلين\n', 'utf8'),
);
