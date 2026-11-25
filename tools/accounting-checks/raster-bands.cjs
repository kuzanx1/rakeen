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

/* ويعرف استيرادَ المشترك: المرمِّزُ صار في shared/receipt/raster.ts،
   يناديه العميلان. فيُحمَّل كما يُحمَّل غيرُه، لا يُنسخ هنا. */
function loadTs(rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  const req = (id) => {
    if (id.includes('shared/receipt/')) return loadTs('shared/receipt/' + id.split('shared/receipt/')[1] + '.ts');
    return require(id);
  };
  new Function('exports', 'require', 'module', js)(mod.exports, req, mod);
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
  /* ودفعاتُ البياض (`ESC J n`) تُعاد أسطراً بيضاء: ما يصل الطابعةَ من
     صورةٍ هو هو، وإنّما لم تُرسَل أصفارُه على الوصل. فالمقارنةُ بالأصل
     تبقى بايتاً ببايت. (shared/receipt/raster.ts) */
  let feeds = 0;
  let pendingBlank = 0;
  while (at < job.length) {
    if (at + 3 <= job.length && job[at] === 0x1b && job[at + 1] === 0x4a) {
      pendingBlank += job[at + 2];
      feeds += 1;
      at += 3;
      continue;
    }
    if (!(at + 8 <= job.length && job[at] === 0x1d && job[at + 1] === 0x76 && job[at + 2] === 0x30)) break;
    const bpr = job[at + 4] | (job[at + 5] << 8);
    const h = job[at + 6] | (job[at + 7] << 8);
    at += 8;
    const need = bpr * h;
    if (at + need > job.length) return { error: 'شريحةٌ أطولُ من المهمّة' };
    if (pendingBlank > 0) {
      bands.push({ bpr, h: pendingBlank, blank: true });
      rows.push(new Uint8Array(bpr * pendingBlank));
      pendingBlank = 0;
    }
    bands.push({ bpr, h });
    rows.push(job.subarray(at, at + need));
    at += need;
  }
  if (pendingBlank > 0 && bands.length) {
    const bpr = bands[0].bpr;
    bands.push({ bpr, h: pendingBlank, blank: true });
    rows.push(new Uint8Array(bpr * pendingBlank));
  }
  return { bands, rows, feeds, tail: job.subarray(at) };
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
  /* الشرائحُ تُقطَّع عند البياض أيضاً، فلا عددَ ثابتٌ يُقاس عليه.
     والمحروسُ ما يحمي فعلاً: ألّا تطولَ شريحةٌ عن الحدّ (فيتّسع ضررُ
     الانقطاع)، وألّا تُرسَل الصورةُ كتلةً واحدة. */
  if (got.bands.some((b) => !b.blank && b.h > 128)) fails.push(`${w}x${h}: شريحةٌ أطولُ من ١٢٨ سطراً — ضررُ الانقطاع يتّسع`);
  if (got.bands.some((b) => b.h <= 0)) fails.push(`${w}x${h}: شريحةٌ بلا أسطر`);
  if (h > 128 && got.bands.filter((b) => !b.blank).length < 2) fails.push(`${w}x${h}: الصورةُ كتلةٌ واحدة`);
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
/* ولا تهدئةَ هنا، ولا يجوز أن تُعاد بلا قياس.

   كانت من 1.69 إلى 1.73 على مقدّمةٍ باطلة: «الطابعةُ تُسقط بايتاتٍ بصمت
   إن امتلأت ذاكرتُها». وهذا لا يقع على USB -- ضبطُ التدفّق في البروتوكول،
   فالطابعةُ ترفض ما لا تقدر عليه وbulkTransfer يحتبس. وثمنُها كان بطءاً
   حقيقياً: رأسُ طابعةِ المطعم يبتلع ٤٢-٦٦ ك.ب/ث (محسوبةً من فيديو المالك:
   ١٦٦٫٧ ك.ب في ٤٫٠ ثوانٍ على 1.66 مقابل ٨٫٤ على تهدئةِ ٢٤)، وتهدئةُ ٢٧
   كانت تُجوّعه بين ٥٤٪ و١٤٣٪.

   فمن أعادها فعليه أن يقيس رأسَ الطابعة أوّلاً ويكتب الرقمَ المقيس هنا.
   والفواتيرُ المشفَّرةُ تحرسها الثلاثُ أدناه، لا السرعة. */
const atWriteAll = usb.indexOf('private fun writeAll');
const afterWriteAll = usb.indexOf('\n        private fun ', atWriteAll + 1);
if (atWriteAll < 0 || afterWriteAll < 0) fails.push('ما وجدنا writeAll — شكلُ الملفّ تغيّر');
const inWriteAll = atWriteAll < 0 ? '' : usb.slice(atWriteAll, afterWriteAll < 0 ? usb.length : afterWriteAll);
if (/PACED_BYTES_PER_SECOND|BURST_BYTES|PACED_CHUNK/.test(usb)) {
  fails.push('التهدئةُ المسبقةُ عادت إلى مسار USB — إن كان بقياسٍ من طابعةٍ حقيقيّة فحدِّث هذا الحارس، وإلّا فهي البطءُ نفسُه');
}

/* والتهدئةُ تُستحقّ ولا تُفترض: شرطُها أن تكون الطابعةُ قد انقطع عليها
   إرسالٌ قبلُ. فلا يجوز أن يصير الشرطُ عامّاً (فيعود البطءُ لكلِّ مطعم)
   ولا أن تزول الشبكةُ كلُّها (فلا يبقى لنا ما نفعله إن انقطعت الطباعةُ
   عند مطعمٍ لا نملك طابعتَه). */
if (!/val paced = bytes\.size > PAPER_JOB_BYTES && pacedPrinters\.contains\(printerId\)/.test(inWriteAll)) {
  fails.push('شرطُ التهدئة ليس «طابعةٌ انقطع عليها إرسال» — إمّا البطءُ عاد للكلّ أو الشبكةُ سقطت');
}
if (!/pacedPrinters\.add\(stableId\(dev\)\)/.test(usb)) {
  fails.push('لا شيءَ يُهدّئ طابعةً انقطع عليها الإرسال — بلا شبكةِ أمانٍ ولا نملك طابعةً نُجرّب عليها');
}
const atTrunc = usb.indexOf('if (sentAll < bytes.size)');
const atAdd = usb.indexOf('pacedPrinters.add(');
if (atTrunc < 0 || atAdd < 0 || atAdd < atTrunc) {
  fails.push('التهدئةُ تُستحقّ من غير الانقطاع — العلامةُ الوحيدةُ التي نراها هي إرسالٌ انقطع');
}
/* والنومُ الوحيدُ المسموحُ في writeAll هو إعادةُ الدفعةِ الصفريّة
   (EMPTY_RETRY_SLEEP_MS) وتهدئةُ المستحقّة (owedMs): الأولى انتظارُ طابعةٍ لم تقبل شيئاً، لا تهدئةُ
   مَن قبلت. وأيُّ نومٍ غيرُه تهدئةٌ بلا اسم. */
const sleeps = inWriteAll.match(/Thread\.sleep\(([^)]*)\)/g) || [];
for (const s of sleeps) {
  if (!s.includes('EMPTY_RETRY_SLEEP_MS') && !s.includes('owedMs - goneMs')) fails.push(`نومٌ غيرُ معروفٍ في writeAll (${s}) — تهدئةٌ بلا اسم`);
}

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
const atWait = usb.indexOf('if (myPaperMs > 0) awaitPaper(stableId(device))');
const atOpen = usb.indexOf('manager().openDevice(dev)');
if (atWait < 0 || atOpen < 0 || atWait > atOpen) {
  fails.push('الانتظارُ بعد فتح الطابعة لا قبلَه — المَقبضُ يموت أثناء النوم');
}
if (!/paperBusyUntil\[stableId\(dev\)\] = maxOf\(/.test(usb)) {
  fails.push('زمنُ الورق بلا حدٍّ أدنى — إرسالٌ متعثّرٌ يُسقط الانتظارَ وقت الحاجة إليه');
}
/* ولا يُقيَّد انشغالُ ورقٍ على مهمّةٍ لا تُخرج ورقاً. فتحُ الدرج خمسةُ
   بايتاتٍ لا تُحرّك الورقَ، وكان يُسجّل ٣٠٠ملّي ثانيةٍ تنتظرها الفاتورةُ
   بعده -- والدرجُ يُفتح قبل كلِّ بيعةٍ نقديّة، فالثمنُ على كلّ زبون. */
if (!/if \(myPaperMs > 0\) \{\s*\n\s*paperBusyUntil\[stableId\(dev\)\] = maxOf\(/.test(usb)) {
  fails.push('فتحُ الدرج يُسجّل انشغالَ ورقٍ — كلُّ بيعةٍ نقديّة تنتظر ٣٠٠ملّي ثانيةٍ بلا ورق');
}
if (!/if \(myPaperMs > 0\) paperBusyUntil\.remove\(/.test(usb)) {
  fails.push('مهمّةٌ بلا ورقٍ انقطعت فمسحت موعدَ فراغِ الفاتورة قبلها');
}
/* وبساعةٍ لا ترجع: تصحيحُ الساعة للوراء يُجمّد الدَّينَ ويُطيل الانتظار. */
if (/System\.currentTimeMillis/.test(usb)) {
  fails.push('ساعةُ الحائط في مسار USB — قفزةٌ للوراء تُجمّد الدَّين أو تُطيل الانتظار');
}

/* والعميلان لا يفترقان -- ولا بنسختين متشابهتين، إنّما بالمرمِّز نفسِه.
   كان لكلٍّ منهما نسخةٌ من التقطيع، فتُصلَح واحدةٌ وتبقى الأخرى. */
const web = fs.readFileSync(path.join(root, 'public/pos/rakeen-pos.js'), 'utf8');
if (!/RakeenReceiptEngine\.bandRaster\(raster, bytesPerRow, h\)/.test(web)) {
  fails.push('كاشير الويب لا ينادي مرمِّزَ المحرّك — نسختان تفترقان، أو صورةٌ بلا شرائح');
}
if (/BAND_ROWS\s*=\s*128/.test(web)) {
  fails.push('نسخةٌ من التقطيع عادت إلى كاشير الويب — المرمِّزُ في shared/receipt/raster.ts وحدَه');
}
const engine = fs.readFileSync(path.join(root, 'public/pos/receipt-engine.js'), 'utf8');
for (const need of ['bandRaster', 'rasterChunks']) {
  if (!engine.includes(need)) fails.push(`محرّكُ الويب المبنيّ بلا ${need} — شغّل npm run receipt:build`);
}

/* ودفعُ البياض: نصفُ الورقة أسطرٌ بيضاء، وإرسالُها أصفاراً هو نصفُ
   زمنِ الإرسال ونصفُ نافذةِ الانقطاع. فإن عادت تُرسَل، عاد البطء. */
const rasterTs = fs.readFileSync(path.join(root, 'shared/receipt/raster.ts'), 'utf8');
if (!/0x1b; out\[at \+ 1\] = 0x4a/.test(rasterTs)) {
  fails.push('البياضُ يُرسَل أصفاراً لا يُدفع بـESC J — نصفُ البايتات بلا حبر');
}
{
  /* ويُقاس المكسبُ لا يُفترض: صفحةٌ نصفُها بياضٌ يجب أن تنكمش فعلاً. */
  const { bandRaster } = loadTs('shared/receipt/raster.ts');
  const bpr = 72;
  const height = 800;
  const bm = new Uint8Array(bpr * height);
  for (let y = 0; y < height; y += 1) {
    if (y % 20 >= 9) continue;
    for (let i = 0; i < bpr; i += 1) bm[y * bpr + i] = 0xa5;
  }
  const got = bandRaster(bm, bpr, height).length;
  if (got > bm.length * 0.7) {
    fails.push(`دفعُ البياض بلا أثر: ${got} بايتاً من ${bm.length} — راجِع MIN_FEED_ROWS`);
  }
}

if (fails.length) {
  console.error('✗ شرائح الصورة:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ شرائح الصورة: البنية والبايتات في العميلين');
