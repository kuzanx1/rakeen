/**
 * كلُّ حقلٍ تقرؤه الورقةُ يصلها.
 *
 * راسمُ التطبيق يُعيد بناء نموذج الورقة حقلاً حقلاً قبل أن يسلّمه
 * للتخطيط (application/receiptRenderer.ts). وهي قائمةٌ مكتوبةٌ باليد:
 * حقلٌ جديدٌ يُضاف إلى النموذج ويُملأ في الشاشة وفي الطبقة الوسطى، ثم
 * يسقط هنا في آخر خطوةٍ قبل الرسم -- بلا خطأٍ ولا تحذير، إنما ورقةٌ
 * تُطبع ناقصة.
 *
 * وقع هذا مرّتين في يومين: `platform_invoice_last4: null` في بناء
 * الحمولة (فلم تُحفظ الأربعةُ قطّ)، ثم `phoneOrder` المنسيّة هنا (فكُتب
 * على ورقة طلبِ الجوال «آخر ٤ أرقام فاتورة التطبيق»). والعلّةُ واحدة:
 * طبقةُ نقلٍ تنسخ الحقولَ بيدها.
 *
 * فيُقارَن ما يقرؤه التخطيطُ (receipt.X في shared/receipt/layout.ts)
 * بما يمرّره الراسم. وما يُقرأ ولا يُمرَّر يسقط البناء.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const fails = [];

const layout = read('shared/receipt/layout.ts');
const renderer = read('react-native-poc/src/application/receiptRenderer.ts');

// ١) ما يقرؤه التخطيط من النموذج.
const used = new Set();
for (const m of layout.matchAll(/\breceipt\.([A-Za-z_][A-Za-z0-9_]*)/g)) used.add(m[1]);

// ٢) ما يمرّره الراسم: كتلةُ `receipt: { ... }` داخل نداء layoutReceipt.
const callIdx = renderer.indexOf('const layout = layoutReceipt({');
if (callIdx < 0) {
  fails.push('ما لقينا نداء layoutReceipt في receiptRenderer.ts — تغيّر النص؟');
} else {
  const start = renderer.indexOf('receipt: {', callIdx);
  // نقف عند أوّل سطرٍ يُغلق الكائن بمستواه نفسه.
  const end = renderer.indexOf('\n      },', start);
  if (start < 0 || end < 0) {
    fails.push('ما قدرنا نقرأ كتلة النموذج الممرَّر في receiptRenderer.ts');
  } else {
    const block = renderer.slice(start, end);
    const passed = new Set();
    for (const m of block.matchAll(/^\s{8}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) passed.add(m[1]);

    for (const field of [...used].sort()) {
      if (!passed.has(field)) {
        fails.push(
          'الورقةُ تقرأ «' + field + '» والراسمُ لا يمرّره — يسقط قبل الرسم ' +
            '(receiptRenderer.ts)',
        );
      }
    }
  }
}

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(
  Buffer.from('✓ نموذجُ الورقة: كلُّ حقلٍ يقرؤه التخطيطُ يمرّره الراسم\n', 'utf8'),
);
