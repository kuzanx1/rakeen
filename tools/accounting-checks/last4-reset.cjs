/**
 * آخرُ أربعةٍ لا تُورَّث لطلبٍ آخر.
 *
 * والأنماطُ تبدأ بأوّل السطر عمداً: سطرٌ معلَّقٌ (// ...) يحوي الأمرَ
 * نفسَه ليس تصفيراً، وقد جُرّب الحارسُ بتعليقِ السطر فمرّ -- فشُدَّ.
 *
 * أبلغ صاحبُ المطعم (٢٠٢٦/١١/١٩، على السنمي): يكتب رقمَ فاتورة التطبيق
 * أو آخرَ أربعةٍ من جوال الزبون، يتمّ الطلب، ثم يفتح طلبَ توصيلٍ ثانياً
 * فيجد الرقمَ القديم مكتوباً وزرَّ التأكيد مضاءً. فيمضي -- ويحمل الطلبُ
 * الجديد رقمَ فاتورةِ طلبٍ قديم: لا يُطابَق بكشف كيتا عند الجرد، ولا
 * يُعرف صاحبُ طلب الجوال حين يجي يستلم.
 *
 * وهذا ليس شيئاً يُختبر بوحدةٍ: الحقلُ حالةُ شاشةٍ في عميلين مختلفين،
 * أحدهما React والآخر صفحةُ جافاسكربت. فيُحرس بما يمكن حراستُه -- أن
 * تصفيرَه موجودٌ في مسار «تمّ البيع» في كليهما، فلا يُحذف بإعادة ترتيب.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const fails = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// ١) التطبيق: التصفير داخل نفس كتلة «تمّت الصفقة» التي تمحو العميل.
const app = read('react-native-poc/src/ui/ProductsScreen.tsx');
const settleIdx = app.indexOf('transaction fully settled -- start clean for the next customer');
if (settleIdx < 0) {
  fails.push('ما لقينا كتلة «تمّت الصفقة» في ProductsScreen — تغيّر النص؟');
} else {
  const after = app.slice(settleIdx, settleIdx + 1200);
  if (!/^[ \t]*setInvoiceLast4\(\s*''\s*\)/m.test(after)) {
    fails.push("التطبيق: بعد إتمام البيع ما يُصفَّر invoiceLast4 — الرقم ينتقل للطلب اللي بعده (ProductsScreen.tsx)");
  }
}

// ٢) الويب: التصفير داخل كتلة ما بعد الدفع التي تمحو السلة والعميل.
const web = read('public/pos/rakeen-pos.js');
const paidIdx = web.indexOf("state.lastTransaction.receipt = receiptData;");
if (paidIdx < 0) {
  fails.push('ما لقينا كتلة ما بعد الدفع في rakeen-pos.js — تغيّر النص؟');
} else {
  const after = web.slice(paidIdx, paidIdx + 1600);
  if (!/^[ \t]*state\.platformInvoiceLast4\s*=\s*''/m.test(after)) {
    fails.push("الويب: بعد إتمام الدفع ما يُصفَّر state.platformInvoiceLast4 (rakeen-pos.js)");
  }
}

// ٢ب) ونوعُ الطلب يرجع لأصله مع البيع -- لا يرث الطلبُ الجديد «توصيل».
if (settleIdx >= 0) {
  const after = app.slice(settleIdx, settleIdx + 1400);
  if (!/^[ \t]*cart\.setOrderChannel\(/m.test(after)) {
    fails.push('التطبيق: نوع الطلب ما يرجع لأصله بعد البيع (ProductsScreen.tsx)');
  }
}
if (paidIdx >= 0) {
  const after = web.slice(paidIdx, paidIdx + 1800);
  if (!/^[ \t]*state\.orderChannel\s*=\s*DINE_IN_ENABLED/m.test(after)) {
    fails.push('الويب: نوع الطلب ما يرجع لأصله بعد الدفع (rakeen-pos.js)');
  }
}

// ٣) وفي الاثنين: الرقمُ لا يُرسل إلا لطلب التوصيل.
if (!/orderChannel === 'delivery' \? invoiceLast4 \|\| null : null/.test(app)) {
  fails.push('التطبيق: آخر أربعة تُرسل خارج قناة التوصيل؟ راجع حمولة الطلب');
}
if (!/state\.orderChannel === 'delivery' \? \(state\.platformInvoiceLast4 \|\| null\) : null/.test(web)) {
  fails.push('الويب: آخر أربعة تُرسل خارج قناة التوصيل؟ راجع حمولة الطلب');
}

// ٤) وتصل الخادمَ فعلاً: الحمولةُ تحملها، لا `null` مكتوبةً فيها.
//
//    كان هذا الحارس يفحص الشاشةَ وحدَها -- أن الرقم يُجمع ويُصفَّر --
//    فمرّ سنةً كاملة بينما بناءُ الحمولة يُلقيه قبل الإرسال. فلا يكفي
//    أن تُفحص طبقةُ الجمع: تُفحص الطبقةُ التي تُرسل.
const orderDomain = read('react-native-poc/src/domain/order.ts');
if (!/^[ \t]*platform_invoice_last4: ctx\.channel === 'delivery' \? ctx\.platformInvoiceLast4/m.test(orderDomain)) {
  fails.push(
    'التطبيق: حمولةُ الطلب ما تحمل آخرَ أربعة إلى الخادم — ' +
      'الشاشةُ تجمعها والحمولةُ تُلقيها (domain/order.ts)',
  );
}

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(Buffer.from('✓ آخر ٤ أرقام ونوع الطلب: يرجعان لأصلهما مع كل بيع في العميلين\n', 'utf8'));
