/**
 * قوالبُ الفاتورة: الورقةُ والمعاينتان رقمٌ واحد.
 *
 * المقاساتُ مكتوبةٌ ثلاثَ مرّات: في المحرّك (`shared/receipt/tokens.ts`)
 * وهو وحدَه ما يُطبع، وفي معاينةِ إعداداتِ الطابعة في التطبيق
 * (`domain/receiptTheme.ts`)، وفي معاينةِ لوحة التحكّم
 * (`public/dashboard/rakeen-dashboard.js`). والنسختان الأخيرتان لا
 * تطبعان شيئاً -- تُريان المالكَ ما سيستلمه.
 *
 * وقد افترقت فعلاً: رُفع شعارُ «كلاسيكي» من ٠.٣٠ إلى ٠.٤٢ في المحرّك
 * (f4d0e81، ١٣ نوفمبر ٢٠٢٦) ولم يُنقل إلى أيٍّ من المعاينتين. فبقي
 * المالكُ أحدَ عشرَ يوماً يعاين شعاراً ويستلم شعاراً أكبرَ منه بأربعين
 * في المئة -- وثلاثةُ سنتيمتراتٍ من الورق لا يراها أحدٌ في أيّ شاشة.
 *
 * وهذا هو ما جعل نموَّ الفاتورة خفيّاً: ليس أنّ أحداً أخفاه، بل أنّ
 * كلَّ ما يستطيع المالكُ النظرَ إليه كان يقول الرقمَ القديم. ولمّا
 * بدأت الطباعةُ تخرج محيوسةً، لم يكن في أيّ شاشةٍ ما يشير إلى أنّ
 * الورقةَ كبرت.
 *
 * فيُقرأ الثلاثةُ ويُقارَن. والتعليقُ في ملفّ اللوحة يطلب هذا سلفاً
 * («أيُّ تعديلٍ هناك يُنقل هنا، وإلّا عاد الافتراق») -- وطلبٌ مكتوبٌ
 * في تعليقٍ لا يُنفّذ نفسَه.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

/** الحقولُ المشتركةُ بين الثلاثة. وqrSize/qrMaxSize ليست منها: دلالتهما
 *  مختلفة (سقفٌ مقابل مقاسٍ فعليّ)، فمقارنتُهما تُخرج خطأً كاذباً. */
const FIELDS = ['density', 'typeScale', 'logoWidth'];
const THEMES = ['classic', 'compact', 'elegant', 'signature'];

/** `classic: { density: 1, typeScale: 1, ... logoWidth: 0.42, ... }` */
function fromEngine(src) {
  const out = {};
  for (const theme of THEMES) {
    const at = src.indexOf(`\n  ${theme}: {`);
    if (at < 0) continue;
    const body = src.slice(at, src.indexOf('\n  },', at));
    out[theme] = {};
    for (const f of FIELDS) {
      const m = new RegExp(`${f}:\\s*([0-9.]+)`).exec(body);
      if (m) out[theme][f] = Number(m[1]);
    }
  }
  return out;
}

/** معاينةُ التطبيق: الحقولُ متفرّقةٌ على أسطرٍ داخل كلِّ قالب. */
function fromAppPreview(src) {
  const out = {};
  for (let i = 0; i < THEMES.length; i++) {
    const theme = THEMES[i];
    const at = src.indexOf(`  ${theme}: {`);
    if (at < 0) continue;
    const nextAt = i + 1 < THEMES.length ? src.indexOf(`  ${THEMES[i + 1]}: {`) : src.length;
    const body = src.slice(at, nextAt > at ? nextAt : src.length);
    out[theme] = {};
    for (const f of FIELDS) {
      const m = new RegExp(`${f}:\\s*([0-9.]+)`).exec(body);
      if (m) out[theme][f] = Number(m[1]);
    }
  }
  return out;
}

/** لوحةُ التحكّم: سطرٌ واحدٌ لكلِّ قالب داخل RECEIPT_THEMES. */
function fromDashboard(src) {
  const at = src.indexOf('const RECEIPT_THEMES = [');
  if (at < 0) return null;
  const block = src.slice(at, src.indexOf('\n];', at));
  const out = {};
  for (const theme of THEMES) {
    const m = new RegExp(`id:\\s*'${theme}'[\\s\\S]{0,400}?\\}`).exec(block);
    if (!m) continue;
    out[theme] = {};
    for (const f of FIELDS) {
      const v = new RegExp(`${f}:\\s*([0-9.]+)`).exec(m[0]);
      if (v) out[theme][f] = Number(v[1]);
    }
  }
  return out;
}

const engine = fromEngine(read('shared/receipt/tokens.ts'));
const app = fromAppPreview(read('react-native-poc/src/domain/receiptTheme.ts'));
const dash = fromDashboard(read('public/dashboard/rakeen-dashboard.js'));

const fails = [];
if (!dash) fails.push('ما وجدنا RECEIPT_THEMES في لوحة التحكّم — شكلُ الجدول تغيّر');

for (const theme of THEMES) {
  if (!engine[theme]) {
    fails.push(`قالبُ «${theme}» مفقودٌ من المحرّك — وهو وحدَه ما يُطبع`);
    continue;
  }
  for (const [label, table] of [['معاينةِ التطبيق', app], ['معاينةِ اللوحة', dash]]) {
    if (!table) continue;
    if (!table[theme]) {
      fails.push(`قالبُ «${theme}» مفقودٌ من ${label}`);
      continue;
    }
    for (const f of FIELDS) {
      const want = engine[theme][f];
      const got = table[theme][f];
      if (want === undefined) continue;
      if (got === undefined) {
        fails.push(`«${theme}».${f} مفقودٌ من ${label}`);
      } else if (Math.abs(want - got) > 1e-9) {
        fails.push(`«${theme}».${f}: الورقةُ تطبع ${want} و${label} تُري ${got} — المالكُ يعاين غيرَ ما يستلم`);
      }
    }
  }
}

if (fails.length) {
  console.error('✗ قوالب الفاتورة:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✓ قوالب الفاتورة: ${THEMES.length} قوالب × ${FIELDS.length} مقاسات — الورقةُ والمعاينتان رقمٌ واحد`);
