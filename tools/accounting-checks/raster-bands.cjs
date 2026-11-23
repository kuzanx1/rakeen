/**
 * الصورةُ تُرسَل شرائحَ، وكلُّ بايتٍ منها يصل كما هو.
 *
 * ليس هذا تحسُّباً: فاتورةٌ واحدةٌ من مئة كيلوبايتٍ في أمرِ `GS v 0`
 * واحدٍ تعني أنّ الطابعةَ تنتظر مئةَ كيلوبايتٍ بالضبط -- فإن انقطع
 * الإرسال، ابتلعت كلَّ ما بعده كأنه بقيّةُ الصورة. وقع عند مطعمٍ
 * حقيقيٍّ على طابعة TA POS: فاتورةٌ «محيوسة» ثم مترُ ورقٍ رموزاً.
 *
 * والخطرُ في التقطيع أن يُزاح بايتٌ أو يُحسب ارتفاعُ شريحةٍ خطأً، فتخرج
 * الصورةُ مائلةً أو مشطورة -- ولا يُرى ذلك إلا على ورقٍ حقيقيّ. فيُفكّ
 * هنا ما يُرسَل فعلاً ويُقارن بالأصل بايتاً بايتاً، في كلِّ نشرة.
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
  new Function('exports', 'require', 'module', js)(mod.exports, require, mod);
  return mod.exports;
}

const { rasterJobBase64 } = loadTs('react-native-poc/src/domain/escposRaster.ts');

/** صورةٌ بنقوشٍ لا تتكرّر، فإزاحةُ بايتٍ واحدٍ تُكشف. */
function buffer(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const ink = ((x * 7 + y * 13) % 11) < 4;
      data[i] = data[i + 1] = data[i + 2] = ink ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** يفكّ المهمّة: ESC @ ثم شرائحُ GS v 0 ثم التغذية والقصّ. */
function parse(job) {
  if (job[0] !== 0x1b || job[1] !== 0x40) return { error: 'ما بدأت بـESC @' };
  let at = 2;
  const bands = [];
  const rows = [];
  while (at + 8 <= job.length && job[at] === 0x1d && job[at + 1] === 0x76 && job[at + 2] === 0x30) {
    const bpr = job[at + 4] | (job[at + 5] << 8);
    const h = job[at + 6] | (job[at + 7] << 8);
    at += 8;
    const need = bpr * h;
    if (at + need > job.length) return { error: 'شريحةٌ أطولُ من المهمّة' };
    bands.push({ bpr, h });
    rows.push(job.subarray(at, at + need));
    at += need;
  }
  return { bands, rows, tail: job.subarray(at) };
}

for (const [w, h] of [[576, 1356], [576, 128], [576, 127], [576, 129], [384, 900], [576, 1]]) {
  const buf = buffer(w, h);
  const job = Buffer.from(rasterJobBase64(buf, undefined), 'base64');
  const got = parse(job);
  if (got.error) {
    fails.push(`${w}x${h}: ${got.error}`);
    continue;
  }
  const bpr = Math.ceil(w / 8);
  const totalRows = got.bands.reduce((s, b) => s + b.h, 0);
  if (totalRows !== h) fails.push(`${w}x${h}: مجموع أسطر الشرائح ${totalRows} والمفروض ${h}`);
  if (got.bands.some((b) => b.bpr !== bpr)) fails.push(`${w}x${h}: شريحةٌ بعرضٍ غير ${bpr}`);
  if (got.bands.some((b, i) => i < got.bands.length - 1 && b.h !== 128)) fails.push(`${w}x${h}: شريحةٌ وسطى ليست ١٢٨ سطراً`);
  if (got.bands.length !== Math.ceil(h / 128)) fails.push(`${w}x${h}: عدد الشرائح ${got.bands.length} والمفروض ${Math.ceil(h / 128)}`);
  // والبايتات نفسُها: الشرائحُ مجتمعةً = الصورةُ كما لو أُرسلت كتلةً واحدة.
  const joined = Buffer.concat(got.rows.map((r) => Buffer.from(r)));
  if (joined.length !== bpr * h) fails.push(`${w}x${h}: البايتات ${joined.length} والمفروض ${bpr * h}`);
  // كلُّ سطرٍ في مكانه: يُعاد حسابُ البتّات من الصورة الأصلية ويُقارن.
  let bad = -1;
  for (let y = 0; y < h && bad < 0; y++) {
    for (let xb = 0; xb < bpr; xb++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const x = xb * 8 + b;
        if (x >= w) continue;
        const i = (y * w + x) * 4;
        if (buf.data[i] < 160) byte |= 0x80 >> b;
      }
      if (joined[y * bpr + xb] !== byte) { bad = y; break; }
    }
  }
  if (bad >= 0) fails.push(`${w}x${h}: السطر ${bad} مُزاحٌ أو مختلف`);
  const tail = Array.from(got.tail);
  if (tail.join(',') !== '10,10,10,29,86,0') fails.push(`${w}x${h}: الذيل ${tail.join(',')} والمفروض تغذية ثلاث وقصّ`);
}

/* والعميلان لا يفترقان: كاشير الويب يقطّع كذلك. */
const web = fs.readFileSync(path.join(root, 'public/pos/rakeen-pos.js'), 'utf8');
if (!/BAND_ROWS/.test(web)) fails.push('كاشير الويب ما يقطّع الصورة شرائح — يطبع هراءً عند أي انقطاع');

if (fails.length) {
  console.error('✗ شرائح الصورة:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ شرائح الصورة: البنية والبايتات في العميلين');
