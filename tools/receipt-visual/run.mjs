/**
 * الانحدارُ البصريّ: تُصوَّر الفواتيرُ وتُقارن بصورها المعتمَدة.
 *
 * والبصماتُ في jest تمسك تغيّرَ المواضع، وهذا يمسك ما لا موضعَ له:
 * خطٌّ تبدّل، أو وزنٌ لم يعد يُحمَّل، أو محرفٌ صار مربّعاً فارغاً، أو
 * منحنىً رُسم على غير وجهه. وهي أعطالٌ لا يراها إلّا من نظر.
 *
 * ولا يُفحص نموذجٌ عن الشيء: الدوالُّ المصوَّرة تُنتزع من
 * `public/pos/rakeen-pos.js` عند التشغيل -- هي المشحونةُ بعينها.
 *
 *   node tools/receipt-visual/run.mjs            يقارن، ويفشل عند الاختلاف
 *   node tools/receipt-visual/run.mjs --update   يعتمد الصور الجديدة
 *
 * والاعتمادُ فعلٌ مقصود: لا تُحدَّث الصورةُ لأنّ الاختبار فشل، إنّما
 * لأنّ التغييرَ أُريد ورُئي في الفرق.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { buildCases } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const BASELINE = join(HERE, 'baseline');
const DIFF = join(HERE, 'diff');
const UPDATE = process.argv.includes('--update');

/**
 * حدُّ الاختلاف.
 *
 * صفرٌ مستحيل: تنعيمُ الحروف يختلف بكسلاً أو بكسلين بين إصدارَي
 * متصفّح. وحدٌّ واسعٌ يمرّر عطلاً حقيقياً. فالحدُّ على عدد البكسلات
 * المختلفة نسبةً إلى الورقة -- وربعُ بالألف كافٍ ليمرّ التنعيمُ ولا
 * يمرّ حرفٌ زاح أو خطٌّ اختفى.
 */
const TOLERANCE = 0.00025;
const PIXEL_THRESHOLD = 0.12;

/** ينتزع الدوالَّ المشحونة من ملفّ الكاشير -- لا نسخةَ عنها. */
async function shippedFunctions() {
  const src = await readFile(join(ROOT, 'public/pos/rakeen-pos.js'), 'utf8');
  const grab = (name) => {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('لم تُوجد الدالّة ' + name + ' في rakeen-pos.js');
    let depth = 0;
    let started = false;
    for (let i = at; i < src.length; i++) {
      if (src[i] === '{') { depth++; started = true; }
      else if (src[i] === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('لم يُغلق قوسُ ' + name);
  };
  const names = ['receiptFontString', 'paintReceiptOps', 'renderReceiptCanvas',
                 'renderKitchenTicketCanvas', 'renderShiftReportCanvas'];
  /* والعملةُ تُنتزع كذلك لا تُكتب هنا: قيمةٌ مكرّرةٌ في أداة الفحص
     تجعل الفحصَ يمرّ على رمزٍ لم يعد الكاشيرُ يطبعه. */
  const riyal = src.match(/const RECEIPT_RIYAL = '[^']*';/);
  if (!riyal) throw new Error('لم يُوجد RECEIPT_RIYAL في rakeen-pos.js');
  return riyal[0] + '\n' + names.map(grab).join('\n\n') +
    '\nwindow.renderReceiptCanvas = renderReceiptCanvas;' +
    '\nwindow.renderKitchenTicketCanvas = renderKitchenTicketCanvas;' +
    '\nwindow.renderShiftReportCanvas = renderShiftReportCanvas;\n';
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.png': 'image/png', '.css': 'text/css',
};

async function startServer(shipped, casesJs) {
  const server = createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    try {
      if (url === '/' || url === '/gallery.html') {
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        return res.end(await readFile(join(HERE, 'gallery.html')));
      }
      if (url === '/__shipped.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        return res.end(shipped);
      }
      if (url === '/__cases.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        return res.end(casesJs);
      }
      const file = join(ROOT, 'public', url);
      if (!file.startsWith(join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

function decode(dataUrl) {
  return PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function main() {
  const cases = await buildCases();
  const shipped = await shippedFunctions();
  const casesJs = 'window.__CASES = ' + JSON.stringify(cases) + ';';
  const { server, port } = await startServer(shipped, casesJs);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/gallery.html`, { waitUntil: 'load' });
  const made = await page.evaluate(() => window.__renderAll());
  if (errors.length) {
    console.error('أخطاءٌ في الصفحة:\n  ' + errors.join('\n  '));
    await browser.close(); server.close();
    process.exit(1);
  }
  if (made.length !== cases.length) {
    console.error(`رُسمت ${made.length} من ${cases.length}`);
    await browser.close(); server.close();
    process.exit(1);
  }

  await mkdir(BASELINE, { recursive: true });
  if (existsSync(DIFF)) await rm(DIFF, { recursive: true });

  const added = [], changed = [], ok = [];
  for (const c of cases) {
    const dataUrl = await page.evaluate((id) => window.__capture(id), c.id);
    if (!dataUrl) { changed.push([c.id, 'لم تُرسم']); continue; }
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const target = join(BASELINE, c.id + '.png');

    if (!existsSync(target)) {
      await writeFile(target, buf);
      added.push(c.id);
      continue;
    }
    const a = PNG.sync.read(await readFile(target));
    const b = decode(dataUrl);
    if (a.width !== b.width || a.height !== b.height) {
      if (UPDATE) { await writeFile(target, buf); changed.push([c.id, `القياس ${a.width}×${a.height} ← ${b.width}×${b.height} (اعتُمد)`]); }
      else changed.push([c.id, `القياس تغيّر: ${a.width}×${a.height} ← ${b.width}×${b.height}`]);
      continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: PIXEL_THRESHOLD });
    const ratio = n / (a.width * a.height);
    if (ratio > TOLERANCE) {
      if (UPDATE) { await writeFile(target, buf); changed.push([c.id, `${n} بكسل (اعتُمد)`]); }
      else {
        await mkdir(DIFF, { recursive: true });
        await writeFile(join(DIFF, c.id + '.diff.png'), PNG.sync.write(diff));
        await writeFile(join(DIFF, c.id + '.actual.png'), buf);
        changed.push([c.id, `${n} بكسل مختلف (${(ratio * 100).toFixed(3)}٪)`]);
      }
    } else {
      ok.push(c.id);
    }
  }

  await browser.close();
  server.close();

  console.log(`مطابق: ${ok.length}`);
  if (added.length) console.log(`جديد (اعتُمد أوّل مرّة): ${added.length}\n  ${added.join('\n  ')}`);
  if (changed.length) {
    console.error(`\nمختلف: ${changed.length}`);
    for (const [id, why] of changed) console.error('  ' + id + ' — ' + why);
    if (!UPDATE) {
      console.error('\nالصورُ الفعليةُ والفروقُ في tools/receipt-visual/diff/.');
      console.error('إن كان التغييرُ مقصوداً فاعتمده: npm run receipt:visual:update');
      process.exit(1);
    }
  }
  const stale = (await readdir(BASELINE)).filter((f) => f.endsWith('.png') && !cases.some((c) => c.id + '.png' === f));
  if (stale.length) console.log(`\nصورٌ مرجعيةٌ لحالاتٍ لم تعد موجودة: ${stale.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
