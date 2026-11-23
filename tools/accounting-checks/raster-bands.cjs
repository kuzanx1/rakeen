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

/**
 * نفسُ خوارزميّة paperRows في UsbPrinterTransport.kt، حرفاً بحرف.
 *
 * عليها يقوم انتظارُ الورق بين الفاتورة وتذكرة المطبخ. ولو عدّت أسطراً
 * أكثرَ ممّا في الورقة لانتظرنا بلا سبب، ولو أقلَّ لرُكِبت ورقةٌ على
 * ورقة -- وهو العطبُ الأوّل. فتُجرَّب هنا على المهمّة الحقيقيّة نفسِها.
 */
function paperRowsLikeKotlin(job) {
  let rows = 0;
  let i = 0;
  while (i + 8 <= job.length) {
    if (job[i] === 0x1d && job[i + 1] === 0x76 && job[i + 2] === 0x30) {
      const bpr = job[i + 4] | (job[i + 5] << 8);
      const h = job[i + 6] | (job[i + 7] << 8);
      const skip = 8 + bpr * h;
      if (bpr > 0 && h > 0 && i + skip <= job.length) {
        rows += h;
        i += skip;
        continue;
      }
    }
    i++;
  }
  return rows;
}

/* ومهمّةٌ بلا صورة -- فتحُ الدرج -- ورقُها صفر، فلا تنتظر ولا يُنتظر لها. */
if (paperRowsLikeKotlin(Buffer.from([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa])) !== 0) {
  fails.push('أمرُ الدرج يُحسب ورقاً — يتأخّر الدرجُ بلا سبب');
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
  // وكم سطرَ ورقٍ تقول الطابعةُ عنها؟ بالضبط ارتفاعُ الصورة.
  const counted = paperRowsLikeKotlin(job);
  if (counted !== h) fails.push(`${w}x${h}: عدُّ أسطر الورق ${counted} والمفروض ${h} — انتظارُ الورق مبنيٌّ عليه`);
}

/* ── والإرسالُ بسرعةِ الورق لا بسرعةِ الكابل ──────────────────
   قياسٌ من «كباب طارق» على طابعة TA POS: إيصالُ ٧٦٫٤ ك.ب خرج في ٦٧٠
   ملّي ثانية، وطولُه على الورق ١٣ سنتيمتراً -- أي ورقُ ثانيتين سُلِّم
   في ثلثي ثانية. والطابعةُ تبتلع ما لا تطبع في ذاكرةٍ صغيرة، فإن
   امتلأت أسقطت بايتاتٍ بلا أن تقول، فتنزاح الصورةُ وتخرج رموزاً --
   والإرسالُ يقول «نجح» لأنّ البايتات خرجت من الكابل فعلاً. */
const usb = fs.readFileSync(path.join(root, 'react-native-poc/android/app/src/main/java/com/rakeenpoc/UsbPrinterTransport.kt'), 'utf8');
for (const need of ['PACED_BYTES_PER_SECOND', 'PACED_CHUNK', 'owedMs']) {
  if (!usb.includes(need)) fails.push(`مسارُ USB بلا تهدئة (${need}) — يُغرق ذاكرةَ الطابعة`);
}
if (!/val paced = bytes\.size > PACE_ABOVE_BYTES/.test(usb)) {
  fails.push('التهدئةُ ما تُحسب من حجم المهمّة — إمّا تُبطئ كلَّ أمرٍ صغير أو لا تشتغل');
}

/* والمحروسُ هو **المتراكم** في مخزون الطابعة، لا السرعةُ نفسُها.
   سرعةٌ فوق أبطأ رأسٍ يُباع (٥٠ مم/ث = ٢٨٫٨ ك.ب/ث) تُراكم مع كلِّ سطر،
   والمتراكمُ يكبر مع طولِ الفاتورة بلا سقف: جرّبتُ ٤٨ ك.ب/ث وحسبتُ
   أثرَها على فاتورةٍ واحدةٍ (٣٢ ك.ب) ونسيتُ أنّ فاتورةَ ثلاثين صنفاً
   تُراكم ٩١، ومئةِ صنفٍ ٢٥٩. فالشرطُ سقفٌ لا أرضيّة -- والأرضيّةُ التي
   كانت هنا كانت تمنع الرجوعَ إلى ٢٤، وهي القيمةُ الوحيدةُ المُجرَّبة. */
const rate = /PACED_BYTES_PER_SECOND = (\d+) \* 1024/.exec(usb);
if (!rate) fails.push('ما عرفنا سرعةَ التهدئة — شكلُ الثابت تغيّر');
else if (Number(rate[1]) > 28) fails.push(`التهدئة ${rate[1]} ك.ب/ث — فوق أبطأ رأس، فالمتراكم ينمو مع طول الفاتورة`);

/* والسرعةُ وحدَها تجعل أوّلَ الورقة يزحف، وهو ما يراه الكاشير ويحكم به.
   فدفعةٌ أولى بسرعة الكابل -- والرأسُ يسحبها وهي تصل -- ثم تهدئة. وهي
   سقفُ المتراكم مهما طالت الفاتورة. */
const burst = /BURST_BYTES = (\d+) \* 1024/.exec(usb);
if (!burst) fails.push('ما في دفعةٌ أولى سريعة — أوّلُ الورقة يزحف');
else if (Number(burst[1]) > 32) fails.push(`الدفعة الأولى ${burst[1]} ك.ب — أكبرُ من مخزونٍ نثق به`);
if (!/offset > BURST_BYTES/.test(usb)) fails.push('التهدئةُ تبدأ من أوّل بايت — الدفعةُ الأولى بلا أثر');

/* وتتابعُ الفاتورة وتذكرةِ المطبخ على طابعةٍ واحدة يُعالَج بانتظارِ
   الورق بينهما، لا بإبطاء الكابل على الورقة المفردة. */
for (const need of ['fun awaitPaper', 'fun paperRows', 'paperBusyUntil', 'EST_ROWS_PER_SECOND', 'MAX_PAPER_ROWS']) {
  if (!usb.includes(need)) fails.push(`مسارُ USB بلا انتظارِ ورقٍ بين المهمّتين (${need})`);
}
if (!/val myPaperMs = paperMs\(bytes\)\s*\n\s*if \(myPaperMs > 0\) awaitPaper/.test(usb)) {
  fails.push('الانتظارُ يُقاس بحجم البايتات لا بالورق — إمّا يتأخّر الدرجُ أو تسقط الحمايةُ عن تذكرةٍ قصيرة');
}
/* والانتظارُ قبل فتح الطابعة: بعضُها يختفي من USB بعد القصّ ويرجع، فنومٌ
   ونحن ممسكون بالمَقبض يعني مَقبضاً ميّتاً ثم دَيناً بحجم الورقة كلِّها. */
const atWait = usb.indexOf('if (myPaperMs > 0) awaitPaper');
const atOpen = usb.indexOf('manager().openDevice(device)');
if (atWait < 0 || atOpen < 0 || atWait > atOpen) {
  fails.push('الانتظارُ بعد فتح الطابعة لا قبلَه — المَقبضُ يموت أثناء النوم');
}
if (!/paperBusyUntil\[stableId\(device\)\] = maxOf\(/.test(usb)) {
  fails.push('زمنُ الورق بلا حدٍّ أدنى — إرسالٌ متعثّرٌ يُسقط الانتظارَ وقت الحاجة إليه');
}
/* ولا يُقيَّد انشغالُ ورقٍ على مهمّةٍ لا تُخرج ورقاً. فتحُ الدرج خمسةُ
   بايتاتٍ لا تُحرّك الورقَ، وكان يُسجّل ٣٠٠ملّي ثانيةٍ تنتظرها الفاتورةُ
   بعده -- والدرجُ يُفتح قبل كلِّ بيعةٍ نقديّة، فالثمنُ على كلّ زبون. */
if (!/if \(myPaperMs > 0\) \{\s*\n\s*paperBusyUntil\[stableId\(device\)\] = maxOf\(/.test(usb)) {
  fails.push('فتحُ الدرج يُسجّل انشغالَ ورقٍ — كلُّ بيعةٍ نقديّة تنتظر ٣٠٠ملّي ثانيةٍ بلا ورق');
}
if (!/if \(myPaperMs > 0\) paperBusyUntil\.remove\(/.test(usb)) {
  fails.push('مهمّةٌ بلا ورقٍ انقطعت فمسحت موعدَ فراغِ الفاتورة قبلها');
}
/* وبساعةٍ لا ترجع: تصحيحُ الساعة للوراء يُجمّد الدَّينَ ويُطيل الانتظار. */
if (/System\.currentTimeMillis/.test(usb)) {
  fails.push('ساعةُ الحائط في مسار USB — قفزةٌ للوراء تُجمّد الدَّين أو تُطيل الانتظار');
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
