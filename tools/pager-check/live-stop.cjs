// صفحة البيجر ترن؛ الكاشير يضغط «استلمه» → يوصل بثٌّ حقيقي عبر Realtime
// (قناة مؤقتة عشوائية، بدون أي كتابة في القاعدة) → لازم الرنين يوقف فوراً.
//   node tools/pager-check/live-stop.cjs   (BASE=http://localhost:3010)
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const R = path.resolve(__dirname, '..', '..');
const { chromium } = require(R + '/node_modules/playwright-core');
const { createClient } = require(R + '/node_modules/@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(R + '/.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE || 'http://localhost:3010';
const uuid = crypto.randomUUID();
const key = Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = Date.now(), iso = ms => new Date(ms).toISOString();
const st = (k) => ({ found: true, order_id: 777, channel: 'pickup', status: 'completed', created_at: iso(now - 300000), eta_at: iso(now + 60000),
  ready_at: k === 'prep' ? null : iso(now), delivered_at: k === 'done' ? iso(Date.now()) : null, ring_count: 0, customer: null, business: { name: 'اختبار' }, tone: 'chime', show_eta: true, items: null });
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.addInitScript(() => {
    window.__aud = new Set();
    const pl = HTMLMediaElement.prototype.play, pa = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function () { if (this.loop && /chime|bell|beep/.test(this.src)) window.__aud.add(this); return pl.call(this); };
    HTMLMediaElement.prototype.pause = function () { window.__aud.delete(this); return pa.call(this); };
    window.__ringing = () => [...window.__aud].filter(a => !a.paused).length;
  });
  let cur = st('prep');
  await p.route(/rpc\/get_pager_status/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cur) }));
  await p.route(/rpc\/subscribe_pager_push/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }));
  await p.goto(`${BASE}/p/${key}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.pg-ask-yes', { timeout: 30000 });
  await p.click('.pg-ask-yes');
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const ch = sb.channel('pager:' + uuid);
  await new Promise(res => ch.subscribe(s => s === 'SUBSCRIBED' && res()));
  await p.waitForTimeout(2500); // الصفحة تشترك
  const send = () => ch.send({ type: 'broadcast', event: 'pager', payload: { x: 1 } });
  cur = st('ready'); await send();
  await p.waitForSelector('.pg-ringing', { timeout: 8000 }).then(() => console.log('ready → ringing via realtime ✓', p.evaluate(() => window.__ringing()).then(n => console.log('  tones playing:', n)))).catch(() => console.log('✗ did not ring'));
  cur = st('done'); const t0 = Date.now(); await send();
  const ok = await p.waitForFunction(() => !document.querySelector('.pg-ringing') && /بالعافية/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
  console.log(ok ? `collected → stopped in ${Date.now() - t0}ms ✓` : '✗ STILL RINGING after 15s');
  const left = await p.evaluate(() => window.__ringing());
  console.log(left ? `✗ ${left} tone(s) still playing` : 'tone audio paused ✓');
  // الجوال مقفول والاتصال اللحظي مات بصمت: البثّ ما يوصل، يوصل الإشعار وحده.
  // رنّة ثانية (من الإشعار)، ثم «استلمه» من الإشعار -- بلا أي بثّ.
  await p.reload({ waitUntil: 'domcontentloaded' });
  cur = st('prep');
  await p.waitForSelector('.pg-ask-yes', { timeout: 30000 }); await p.click('.pg-ask-yes');
  await p.waitForTimeout(9000); // لا بثّ من مدة
  const sw = (kind) => p.evaluate(k => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'pager-push', data: { kind: k } } })), kind);
  cur = st('ready'); await sw('ready');
  const rang = await p.waitForSelector('.pg-ringing', { timeout: 8000 }).then(() => true).catch(() => false);
  console.log(rang ? 'push-only ready → ringing ✓' : '✗ push-only did not ring');
  const t1 = Date.now(); await sw('collected'); // الحالة ما تغيّرت بعد في الخادم المزيّف -- السكوت لازم يكون فوري
  await p.waitForTimeout(150);
  const n = await p.evaluate(() => window.__ringing());
  console.log(n === 0 ? `push-only collected → silent in <${Date.now() - t1}ms ✓` : '✗ still ringing after collected push');
  if (n) process.exitCode = 1;
  await sb.removeChannel(ch); await b.close(); process.exit(ok && !process.exitCode ? 0 : 1);
})();
