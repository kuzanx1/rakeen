/**
 * طابعةُ المطبخ المنفصلة تقبل الثلاثة: شبكةً وبلوتوثاً وUSB.
 *
 * وكان الحقلُ عنواناً ومنفذاً فقط، منقولاً مع اسمِه من كاشير الويب --
 * وهو هناك قيدُ المتصفّح نفسِه: جسرُه لا يعرف إلّا IP. فجاء القيدُ إلى
 * التطبيق أثراً لا سبباً، والتطبيقُ له بلوتوثٌ وUSB حقيقيّان للطابعة
 * الرئيسية منذ Feature Parity Pass. فمطعمٌ طابعتُه الرئيسية USB
 * ومطبخُه بلوتوث -- ومنفذُ USB في الجهاز واحد -- لم يكن يملك طريقاً
 * لاختيار الثانية. (كباب طارق، ٢٠٢٦/١١/٢٥.)
 *
 * وما يُحرس هنا ثلاثةٌ ترجع بصمتٍ لو عاد أحدُها:
 *
 * ١) الطرقُ الثلاث. عودتُها إلى الشبكة وحدَها تُسكت مطابخَ قائمة.
 *
 * ٢) ناقصُ الإعداد يرجع إلى طابعة الكاشير، لا إلى null. التذكرةُ على
 *    الورقة الخطأ يراها الطبّاخُ ويشتكي؛ وتذكرةٌ لا تُطبع أصلاً لا
 *    يراها أحدٌ حتى يضيع الطلب في ذروة.
 *
 * ٣) تحقّقُ المطبخ خارج validatePrinterProfile. فتلك يُبطل بطلانُها
 *    هدفَ الطابعة الرئيسية كلَّه (profileToPrinterTarget يرجع null)،
 *    فنصفُ إعدادٍ لمطبخٍ كان يوقف فواتيرَ الزبائن كلَّها -- عطبٌ أكبرُ
 *    من الذي يُبلَّغ عنه، وفي موضعٍ لا يخطر ببال من ضبط المطبخ.
 *
 * (الأنماطُ تبدأ بأوّل السطر حيث يصحّ: سطرٌ معلَّقٌ ليس تنفيذاً.)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const fails = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const domain = read('react-native-poc/src/domain/printerProfile.ts');
const screen = read('react-native-poc/src/ui/PrinterSettingsScreen.tsx');
const types = read('react-native-poc/src/platform/printer.ts');

// ١) الحقولُ موجودةٌ في العقد، وإلّا لم يكن للاختيار ما يُحفظ فيه.
for (const f of [
  'kitchenTransport\\?: PrinterTransportKind;',
  'kitchenBluetoothId\\?: string;',
  'kitchenUsbAccessoryId\\?: string;',
]) {
  if (!new RegExp('^\\s*' + f, 'm').test(types)) {
    fails.push(`platform/printer.ts: ما فيه حقل ${f.split('\\?')[0]}`);
  }
}

// ٢) الهدفُ يعرف الثلاث.
for (const [kind, re] of [
  ['بلوتوث', /transport: 'bluetooth', bluetoothId: profile\.kitchenBluetoothId/],
  ['USB', /transport: 'usb', usbAccessoryId: profile\.kitchenUsbAccessoryId/],
  ['شبكة', /transport: 'network', host: profile\.kitchenHost, port: profile\.kitchenPort/],
]) {
  if (!re.test(domain)) fails.push(`طابعةُ المطبخ ما عادت تقبل ${kind}`);
}

// ٣) والقاعدةُ القديمة بحرفها: ملفٌّ محفوظٌ بلا kitchenTransport وفيه
//    عنوانٌ ومنفذٌ يبقى شبكةً. مطبخٌ يعمل اليوم لا يتحوّل بتحديث.
if (!/profile\.kitchenHost && profile\.kitchenHost\.trim\(\) && profile\.kitchenPort != null/.test(domain)) {
  fails.push('القاعدةُ القديمة (عنوانٌ ومنفذٌ بلا kitchenTransport) ضاعت');
}

// ٤) ناقصُ الإعداد يرجع إلى طابعة الكاشير، لا إلى العدم.
{
  const fn = domain.slice(domain.indexOf('export function profileToKitchenPrinterTarget'));
  const body = fn.slice(0, fn.indexOf('\nexport ', 1));
  if (/return null;/.test(body.replace(/if \(!profile\) return null;/, ''))) {
    fails.push('مطبخٌ ناقصُ الإعداد يرجع null -- تذكرةٌ لا تُطبع ولا يراها أحد');
  }
  const fallbacks = (body.match(/return profileToPrinterTarget\(profile\);/g) || []).length;
  if (fallbacks < 3) {
    fails.push(`مسالكُ الرجوع إلى طابعة الكاشير ${fallbacks} -- ناقصةٌ لإحدى الطرق`);
  }
}

// ٥) تحقّقُ المطبخ منفصل: نصفُ إعدادٍ لمطبخٍ لا يُسكت فاتورةَ الزبون.
if (!/^export function kitchenPrinterGaps\(/m.test(domain)) {
  fails.push('ما فيه kitchenPrinterGaps -- ما ينقص المطبخَ لا يُقال لأحد');
}
{
  const v = domain.slice(domain.indexOf('export function validatePrinterProfile'));
  const body = v.slice(0, v.indexOf('\nexport ', 1));
  if (/kitchenTransport|kitchenBluetoothId|kitchenUsbAccessoryId|kitchenHost/.test(body)) {
    fails.push(
      'تحقّقُ المطبخ دخل validatePrinterProfile -- نصفُ إعدادٍ لمطبخٍ ' +
        'يوقف طباعةَ فواتير الزبائن كلِّها',
    );
  }
}

// ٦) الشاشةُ تعرض الأربعة، و«نفس طابعة الكاشير» أحدُها.
for (const key of ["'same'", "'network'", "'bluetooth'", "'usb'"]) {
  if (!new RegExp('key: ' + key).test(screen)) {
    fails.push(`شاشةُ الإعدادات ما تعرض خيار ${key} لطابعة المطبخ`);
  }
}

// ٧) ولوحا البحث لا يتشاركان نتيجةً واحدة: الكاشيرُ يختار للمطبخ من
//    قائمةٍ فتحها للمطبخ، لا من قائمةِ الرئيسية.
if (!/scanSlot/.test(screen)) {
  fails.push('ما فيه scanSlot -- نتيجةُ بحثٍ واحدةٌ تحت لوحين');
}
for (const slot of ['main', 'kitchen']) {
  if (!new RegExp(`scanResult=\\{scanSlot === '${slot}' \\? scanResult : null\\}`).test(screen)) {
    fails.push(`لوحُ ${slot}: نتيجةُ البحث ما هي مقصورةٌ عليه`);
  }
}

if (fails.length) {
  process.stdout.write(Buffer.from('✗ ' + fails.join('\n✗ ') + '\n', 'utf8'));
  process.exit(1);
}
process.stdout.write(
  Buffer.from('✓ طابعةُ المطبخ: شبكةٌ وبلوتوثٌ وUSB، وناقصُها يرجع لطابعة الكاشير\n', 'utf8'),
);
