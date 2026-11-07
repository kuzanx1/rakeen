// شاشة العميل بلا سؤال دوري -- عبر Supabase Realtime الحقيقي:
//   ١) باركود البيجر والولاء يُرسمان في الشاشة (data:) لا يُطلبان من /api/qr.
//   ٢) البيجر يبقى لما يصل بثٌّ بلا «فتحه» (وصل الطلب مثلاً).
//   ٣) ينزل في لحظته لما يُبثّ «الزبون فتحه» على قناة الطلب -- نفس ما يبثّه
//      orders_pager_broadcast من القاعدة.
//   ٤) وبيجرٌ ثاني بعده لا ينزل ببثّ الأول.
//   node tools/pager-check/display-live.cjs   (BASE=http://localhost:3010 SLUG=anoob)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const R = path.resolve(__dirname, '..', '..');
const { chromium } = require(R + '/node_modules/playwright-core');
const { createClient } = require(R + '/node_modules/@supabase/supabase-js');

const BASE = process.env.BASE || 'http://localhost:3010';
const SLUG = process.env.SLUG || 'anoob';
const env = Object.fromEntries(fs.readFileSync(path.join(R, '.env.local'), 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));

const key = (u) => Buffer.from(u.replace(/-/g, ''), 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let pass = 0, fail = 0;
function check(name, ok, info) { if (ok) pass++; else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  async function send(uuid, payload) {
    const ch = sb.channel('pager:' + uuid);
    await new Promise((res) => ch.subscribe(st => { if (st === 'SUBSCRIBED') res(); }));
    await ch.send({ type: 'broadcast', event: 'pager', payload });
    await sleep(300);
    await sb.removeChannel(ch);
  }

  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const qrRequests = [];
  p.on('request', r => { if (r.url().includes('/api/qr')) qrRequests.push(r.url()); });
  await p.goto(`${BASE}/display/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.rakeenDisplayPreview && window.RakeenReceiptEngine && window.supabaseClient, null, { timeout: 60000 });

  const hidden = () => p.evaluate(() => { const c = document.getElementById('rkDispPager'); return !c || c.hidden; });

  // ١ + ٢ + ٣
  const u1 = crypto.randomUUID();
  await p.evaluate((u) => window.rakeenDisplayPreview.showPager(u, 501, 0), 'https://rakeenapp.com/p/' + key(u1));
  const src = await p.evaluate(() => document.querySelector('#rkDispPagerQr img')?.src || '');
  check('pager QR drawn locally (data:)', src.startsWith('data:image/svg+xml'), src.slice(0, 40));
  check('pager visible', !(await hidden()));
  await sleep(2500); // اشتراك القناة
  await send(u1, { seen: false, ready: false, collected: false, ring_count: 0 });
  await sleep(800);
  check('not-seen broadcast keeps it', !(await hidden()));
  const t0 = Date.now();
  await send(u1, { seen: true, ready: false, collected: false, ring_count: 0 });
  for (let i = 0; i < 30 && !(await hidden()); i++) await sleep(100);
  check('seen broadcast hides it', await hidden());
  console.log(`  (hid ${Date.now() - t0}ms after the send started)`);

  // ٤: بيجرٌ جديد لا يتأثر ببثّ القديم، وينزل بالاستلام.
  const u2 = crypto.randomUUID();
  await p.evaluate((u) => window.rakeenDisplayPreview.showPager(u, 502, 0), 'https://rakeenapp.com/p/' + key(u2));
  await sleep(2500);
  await send(u1, { seen: true, ready: true, collected: true, ring_count: 0 });
  await sleep(800);
  check('old order broadcast leaves the new pager', !(await hidden()));
  await send(u2, { seen: false, ready: true, collected: true, ring_count: 0 });
  for (let i = 0; i < 30 && !(await hidden()); i++) await sleep(100);
  check('collected hides it', await hidden());

  // الولاء أيضاً يُرسم محلياً.
  await p.evaluate(() => window.rakeenDisplayPreview.show('https://rakeenapp.com/api/wallet/add/00000000-0000-4000-8000-000000000000', ''));
  const lsrc = await p.evaluate(() => document.querySelector('#rkDispQr img')?.src || '');
  check('loyalty QR drawn locally (data:)', lsrc.startsWith('data:image/svg+xml'), lsrc.slice(0, 40));
  check('no /api/qr requests', qrRequests.length === 0, qrRequests[0]);

  // الباركود المرسوم يُقرأ: نفس الرابط بالضبط (jsQR على بكسلات الصورة).
  const jsQR = require(R + '/node_modules/jsqr');
  for (const [sel, want] of [['#rkDispQr img', 'https://rakeenapp.com/api/wallet/add/00000000-0000-4000-8000-000000000000']]) {
    const px = await p.evaluate(async (sel) => {
      const img = document.querySelector(sel); await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 400;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 400, 400);
      return Array.from(x.getImageData(0, 0, 400, 400).data);
    }, sel);
    const r = jsQR(Uint8ClampedArray.from(px), 400, 400);
    check(sel + ' scans back to the same URL', r && r.data === want, r ? r.data : 'unreadable');
  }
  const pu = crypto.randomUUID(), purl = 'https://rakeenapp.com/p/' + key(pu);
  await p.evaluate((u) => window.rakeenDisplayPreview.showPager(u, 7, 0), purl);
  const px2 = await p.evaluate(async () => {
    const img = document.querySelector('#rkDispPagerQr img'); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 400;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 400, 400);
    return Array.from(x.getImageData(0, 0, 400, 400).data);
  });
  const r2 = jsQR(Uint8ClampedArray.from(px2), 400, 400);
  check('pager QR scans back to the same URL', r2 && r2.data === purl, r2 ? r2.data : 'unreadable');

  await b.close();
  await sb.removeAllChannels();
  console.log(`\nCHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
