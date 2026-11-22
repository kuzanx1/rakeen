/**
 * ملاحظةُ الصنف تُكتب في السلة مع الحرف، لا حين يخرج المؤشر.
 *
 * أبلغ مطعمٌ (٢٠٢٦/١١/٢٠) أنها «تُطبع أحياناً ولا تُطبع أحياناً». ولم
 * تكن الطباعةُ هي العلّة: كانت الكتابةُ تُحفظ في onBlur وحدَه.
 *
 *  - في التطبيق: الحقلُ داخل قائمة السلة وزرُّ «الدفع» خارجَها، وزرٌّ
 *    في أندرويد لا يأخذ التركيز -- فلا يفقده الحقل، ولا يجري onBlur،
 *    ويمضي الطلبُ بملاحظةٍ فارغة.
 *  - في الويب: أيُّ إعادةِ رسمٍ للسلة (زيادةُ عدد، حذفُ صنف) تنتزع
 *    الحقلَ المفتوح من الصفحة ومعه ما كُتب فيه.
 *
 * ومن لمس شيئاً آخر قبل الدفع أُغلقت لوحةُ المفاتيح فحُفظت الملاحظة --
 * فطُبعت. هذا كلُّ «أحياناً»: ليست عشوائية، إنما تتبع ترتيبَ اللمس.
 *
 * وهذه حالةُ شاشةٍ في عميلين -- أحدهما React والآخر صفحةُ جافاسكربت --
 * فلا تُختبر بوحدة. فيُحرس ما يمكن حراستُه: أن الكتابةَ في السلة موجودةٌ
 * في مسار «مع كل حرف» في كليهما، فلا تُحذف بإعادة ترتيب. والأنماطُ
 * تبدأ بأوّل السطر عمداً -- سطرٌ معلَّقٌ يحوي الأمرَ نفسَه ليس حفظاً،
 * وقد مرّ بنا حارسٌ نجح على سطرٍ معلَّق (انظر last4-reset.cjs).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const fails = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// ١) التطبيق: onChangeText يكتب في السلة، لا في المسوّدة وحدها.
const app = read('react-native-poc/src/ui/ProductsScreen.tsx');
const inputIdx = app.indexOf('styles.oiNoteInput');
if (inputIdx < 0) {
  fails.push('ما لقينا حقلَ الملاحظة في ProductsScreen — تغيّر اسم النمط؟');
} else {
  const region = app.slice(inputIdx, inputIdx + 2500);
  const changeIdx = region.indexOf('onChangeText');
  const placeholderIdx = region.indexOf('placeholder=');
  if (changeIdx < 0 || placeholderIdx < 0 || placeholderIdx < changeIdx) {
    fails.push('التطبيق: ما لقينا onChangeText في حقل الملاحظة (ProductsScreen.tsx)');
  } else {
    const onChange = region.slice(changeIdx, placeholderIdx);
    if (!/^[ \t]*cart\.setLineNote\(/m.test(onChange)) {
      fails.push(
        'التطبيق: ملاحظةُ الصنف ما تُكتب في السلة إلا في onBlur — ' +
          'والدفعُ لا يُفقد الحقلَ تركيزَه، فتضيع (ProductsScreen.tsx)',
      );
    }
  }
}

// ٢) الويب: مستمعُ input يكتب item.note، وبلا إعادة رسمٍ تقتل الحقل.
const web = read('public/pos/rakeen-pos.js');
const listIdx = web.indexOf(".oi-note-input'");
if (listIdx < 0) {
  fails.push('ما لقينا مستمعاتِ حقل الملاحظة في rakeen-pos.js — تغيّر الصنف؟');
} else {
  const region = web.slice(listIdx, listIdx + 1800);
  const onInput = region.indexOf("addEventListener('input'");
  const onBlur = region.indexOf("addEventListener('blur'");
  if (onInput < 0) {
    fails.push(
      "الويب: ملاحظةُ الصنف ما تُحفظ إلا في blur — وإعادةُ رسم السلة " +
        'تنتزع الحقلَ المفتوح ومعه ما كُتب فيه (rakeen-pos.js)',
    );
  } else {
    const body = region.slice(onInput, onBlur > onInput ? onBlur : onInput + 600);
    if (!/^[ \t]*(if\s*\(\s*item\s*\)\s*)?item\.note\s*=/m.test(body)) {
      fails.push('الويب: مستمعُ input ما يكتب item.note (rakeen-pos.js)');
    }
    if (/^[ \t]*renderOrder\(\)/m.test(body)) {
      fails.push(
        'الويب: renderOrder() داخل مستمع input — إعادةُ الرسم أثناء ' +
          'الكتابة تقتل الحقلَ الذي يُكتب فيه (rakeen-pos.js)',
      );
    }
  }
}

// ٣) وملاذُ الحروف اللاتينية يحمل الملاحظة -- تذكرةٌ بلا شروطِ التحضير
//    أسوأُ من تذكرةٍ لم تُطبع: المطبخ يقرؤها ويطبخ على غير ما طُلب.
const fallback = read('react-native-poc/src/domain/receipt.ts');
const fbIdx = fallback.indexOf('export function buildKitchenTicketEscPosBase64');
if (fbIdx < 0) {
  fails.push('ما لقينا ملاذَ تذكرة المطبخ في domain/receipt.ts');
} else {
  const body = fallback.slice(fbIdx, fbIdx + 1800);
  if (!/^[ \t]*if \(line\.note\)/m.test(body)) {
    fails.push('الملاذ اللاتيني: تذكرةُ المطبخ تخرج بلا ملاحظات (domain/receipt.ts)');
  }
  if (!/^[ \t]*for \(const m of line\.mods/m.test(body)) {
    fails.push('الملاذ اللاتيني: تذكرةُ المطبخ تخرج بلا إضافات (domain/receipt.ts)');
  }
}

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(
  Buffer.from('✓ ملاحظةُ الصنف: تُحفظ مع الحرف في العميلين، وتصل الورقةَ حتى في الملاذ\n', 'utf8'),
);
