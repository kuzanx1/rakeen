/**
 * الورقتان لا تُرسلان معاً إلّا إلى طابعتين مختلفتين بيقين.
 *
 * عند «كباب طارق»: الكاشير على USB، والمطبخ أُعطي عنواناً على الشبكة.
 * فاختلف وصفُ الهدفين نصّاً، فظنّهما الكودُ طابعتين وأرسل الورقتين في
 * نفس اللحظة. وأكثرُ الطابعات الحراريّة فيها USB وإيثرنت معاً، فجازَ
 * أن يكون الهدفان بابَين لرأسٍ واحد -- فتتداخل بايتاتُ تذكرة المطبخ
 * داخل صورة الفاتورة. التذكرةُ خرجت، والفاتورةُ ابتُلعت، والتطبيق قال
 * «نجحت» لأنّ البايتات خرجت من الكابل فعلاً. وزرُّ إعادة الطباعة
 * يُخرجها لأنّه يُرسلها وحدَها.
 *
 * ولا يُكتشف هذا من عطبٍ مسجَّل -- لا عطبَ فيه. فيُحرس بالقاعدة نفسها.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');
const fails = [];

function loadTs(rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  const req = (id) => {
    if (id.startsWith('.')) return {};
    return require(id);
  };
  new Function('exports', 'require', 'module', js)(mod.exports, req, mod);
  return mod.exports;
}

const { printersAreProvablySeparate } = loadTs('react-native-poc/src/domain/printerProfile.ts');
if (typeof printersAreProvablySeparate !== 'function') {
  fails.push('ما لقينا printersAreProvablySeparate — القاعدةُ اختفت من المجال');
} else {
  const d = (t) => (t.transport === 'network' ? t.host + ':' + t.port : t.transport === 'usb' ? 'USB ' + t.usbAccessoryId : 'BLE ' + t.bluetoothId);
  const net = (h) => ({ transport: 'network', host: h, port: 9100 });
  const usb = (i) => ({ transport: 'usb', usbAccessoryId: i });
  const ble = (i) => ({ transport: 'bluetooth', bluetoothId: i });

  /* الحالةُ التي كسرت عند مطعمٍ حقيقيّ. */
  if (printersAreProvablySeparate(usb('19267:14384'), net('192.168.8.250'), d) !== false) {
    fails.push('USB مع شبكة يُعدّ طابعتين — الورقتان تُرسلان معاً إلى ما قد يكون رأساً واحداً');
  }
  for (const [a, b, what] of [
    [net('10.0.0.5'), ble('AA:BB'), 'شبكة مع بلوتوث'],
    [usb('1:2'), ble('AA:BB'), 'USB مع بلوتوث'],
  ]) {
    if (printersAreProvablySeparate(a, b, d) !== false) fails.push(what + ' يُعدّ طابعتين');
  }
  /* ولا يُقفل البابُ على الحالة الصحيحة: مدخلٌ واحدٌ وعنوانان. */
  if (printersAreProvablySeparate(net('192.168.8.10'), net('192.168.8.250'), d) !== true) {
    fails.push('طابعتا شبكةٍ بعنوانَين لا تُعدّان طابعتين — التوازي ضاع حيث هو آمن');
  }
  if (printersAreProvablySeparate(usb('1110:2056'), usb('19267:14384'), d) !== true) {
    fails.push('طابعتا USB بمعرّفَين لا تُعدّان طابعتين');
  }
  /* ونفسُ الهدف طابعةٌ واحدة، وناقصُه لا يُوازى عليه. */
  if (printersAreProvablySeparate(net('192.168.8.250'), net('192.168.8.250'), d) !== false) {
    fails.push('نفسُ العنوان يُعدّ طابعتين');
  }
  if (printersAreProvablySeparate(null, net('192.168.8.250'), d) !== false) {
    fails.push('هدفٌ ناقصٌ يُعدّ طابعتين');
  }
}

/* والخدمةُ تبني التوازي على هذي القاعدة، لا على مقارنةِ وصفٍ نصّية. */
const svc = fs.readFileSync(path.join(root, 'react-native-poc/src/application/printService.ts'), 'utf8');
if (!/printersAreProvablySeparate\(main, kitchen, describeTarget\)/.test(svc)) {
  fails.push('مسارُ الطباعة لا ينادي القاعدة — التوازي عاد يُقرَّر بمقارنةِ نصّ');
}
if (!/if \(!\(await kitchenIsProvablySeparate\(\)\)\) return runLane\('all'\);/.test(svc)) {
  fails.push('بوّابةُ المسار الواحد تغيّرت — تأكّد أنّ غيرَ اليقين يرجع إلى مسارٍ واحد');
}
/* ولا تبقى مقارنةٌ نصّيةٌ عاريةٌ تقرّر التوازي. */
if (/return !!kitchen && !!main && describeTarget\(kitchen\) !== describeTarget\(main\)/.test(svc)) {
  fails.push('المقارنةُ النصّية العارية رجعت — هي عينُ العطب');
}

if (fails.length) {
  console.error('✗ أمانُ الطباعة المتوازية:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ الطباعة المتوازية: لا تُوازى ورقتان إلّا إلى طابعتين مختلفتين بيقين');
