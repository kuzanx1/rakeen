// فحص صفحة بيجر ركين (/p/<key>) بحالاتٍ مزيّفة -- لا يكتب شيئاً في القاعدة.
//   node tools/pager-check/page.cjs            (BASE=http://localhost:3010)
//   SHOTS=1 يحفظ صوراً في tools/pager-check/shots/
const path = require('path');
const fs = require('fs');
const R = path.resolve(__dirname, '..', '..');
const { chromium } = require(R + '/node_modules/playwright-core');

const BASE = process.env.BASE || 'http://localhost:3010';
const SHOTS = !!process.env.SHOTS;
const OUT = path.join(__dirname, 'shots');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const KEY = 'q7Xb2LmN9pRsT4vWx8YzAa';
const SIZES = [[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [768, 1024], [1280, 800]];
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const BRANDS = {
  makboos: { name: 'مكبوس زربيان', logo: null, accent: '#FF4A12', surf: '#4A1106', card: '#5C1C0D', ink: '#FF4A12', muted: '#D98A6C' },
  anoob: { name: 'عنوب | Anoob', logo: null, accent: '#7ADC69', surf: '#2A5A21', card: '#346B2A', ink: '#FAF8EB', muted: '#A9CF9C' },
  plain: { name: 'كافيه بدون ألوان', logo: null },
  light: { name: 'مخبز فاتح', accent: '#E85D04', surf: '#FFF8F0', card: '#FFFFFF', ink: '#2B1A0E', muted: '#8A6E5A' },
};

function status(kind, brand, extra = {}) {
  if (kind === 'waiting') return { found: false };
  const base = {
    found: true, order_id: 48213, channel: 'pickup', status: 'completed',
    created_at: iso(now - 4 * 60000), eta_at: iso(now + 11 * 60000), ready_at: null, delivered_at: null,
    delayed_at: null, rung_at: null, ring_count: 0, customer: 'محمد', business: BRANDS[brand],
    branch: 'فرع النرجس', ready_msg: null, tone: 'chime',
  };
  if (kind === 'late') Object.assign(base, { eta_at: iso(now - 60000) });
  if (kind === 'delayed') Object.assign(base, { delayed_at: iso(now - 30000), eta_at: iso(now + 6 * 60000) });
  if (kind === 'ready') Object.assign(base, { ready_at: iso(now - 5000) });
  if (kind === 'rung') Object.assign(base, { ready_at: iso(now - 200000), ring_count: 1 });
  if (kind === 'collected') Object.assign(base, { ready_at: iso(now - 200000), delivered_at: iso(now - 1000) });
  if (kind === 'cancelled') Object.assign(base, { status: 'cancelled' });
  if (kind === 'longnum') Object.assign(base, { order_id: 1234567 });
  if (kind === 'noeta') Object.assign(base, { eta_at: null, customer: null });
  return Object.assign(base, extra);
}

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, info) { if (ok) pass++; else { fail++; fails.push(name + (info ? ' — ' + info : '')); if (process.env.V) console.log('  ✗ ' + fails[fails.length - 1]); } }

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
  const kinds = ['waiting', 'preparing', 'late', 'delayed', 'ready', 'rung', 'collected', 'cancelled', 'longnum', 'noeta'];
  for (const brand of Object.keys(BRANDS)) {
    for (const kind of kinds) {
      for (const [w, h] of SIZES) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => { if (!/React requires eval|Router action dispatched before initialization/.test(e.message)) errs.push(e.message); });
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|websocket|WebSocket|realtime|React requires eval|hasn't mounted|Internal Next.js error/i.test(m.text())) errs.push(m.text()); });
        let current = status(kind, brand);
        await p.route(/supabase\.co\/rest\/v1\/rpc\/get_pager_status/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) }));
        await p.route(/supabase\.co\/rest\/v1\/rpc\/subscribe_pager_push/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }));
        await p.route(/supabase\.co\/realtime/, r => r.abort());
        await p.goto(`${BASE}/p/${KEY}`, { waitUntil: 'domcontentloaded' });
        await p.waitForSelector('.pg-root', { timeout: 30000 });
        await p.waitForTimeout(kind === 'waiting' ? 600 : 1400);
        const tag = `${brand}/${kind} @${w}x${h}`;
        const m = await p.evaluate(() => {
          const root = document.querySelector('.pg-root');
          const r = root.getBoundingClientRect();
          const over = [];
          root.querySelectorAll('*').forEach(el => {
            const b = el.getBoundingClientRect();
            if (b.width && (b.right > innerWidth + 1 || b.left < -1) && !el.closest('.pg-burst') && !el.closest('.pg-pulse') && !el.classList.contains('pg-pulse')) over.push(el.className || el.tagName);
          });
          const num = document.querySelector('.pg-num');
          const nb = num && num.getBoundingClientRect();
          const ringIn = document.querySelector('.pg-ring-in, .pg-ready-core');
          const rb = ringIn && ringIn.getBoundingClientRect();
          const txt = root.innerText;
          const cs = getComputedStyle(root);
          return {
            scrollW: document.documentElement.scrollWidth, w: innerWidth, over, txt,
            numIn: !nb || !rb || (nb.left >= rb.left - 1 && nb.right <= rb.right + 1),
            bg: cs.backgroundColor, color: cs.color, height: r.height,
          };
        });
        check(tag + ' no horizontal scroll', m.scrollW <= m.w + 1, m.scrollW + '>' + m.w);
        check(tag + ' nothing off-screen', m.over.length === 0, m.over.slice(0, 3).join(','));
        check(tag + ' number inside circle', m.numIn);
        check(tag + ' no JS errors', errs.length === 0, errs[0]);
        const expect = {
          waiting: 'طلبك في الطريق', preparing: 'متوقع يجهز خلال', late: 'على وشك يجهز', delayed: 'تأخرنا عليك شوي',
          ready: 'طلبك جاهز!', rung: 'نناديك مرة ثانية', collected: 'بالعافية عليك', cancelled: 'انلغى الطلب',
          longnum: '1234567', noeta: 'نجهزه لك الحين',
        }[kind];
        check(tag + ' shows "' + expect + '"', m.txt.includes(expect), m.txt.slice(0, 80).replace(/\n/g, ' | '));
        if (['preparing', 'late', 'delayed', 'longnum', 'noeta'].includes(kind)) {
          check(tag + ' has arm button', m.txt.includes('شغّل البيجر'));
          if (w === 390) {
            // الضغطة: تنتقل لـ«البيجر شغّال»، وتطلب الإشعار.
            await ctx.grantPermissions(['notifications'], { origin: BASE });
            await p.click('.pg-arm');
            await p.waitForTimeout(500);
            const t2 = await p.evaluate(() => document.querySelector('.pg-root').innerText);
            check(tag + ' arm → armed', t2.includes('البيجر شغّال'), t2.slice(0, 60));
            // الكاشير يضغط جاهز: الصفحة ترن وتتلوّن.
            current = status('ready', brand);
            await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            await p.waitForTimeout(900);
            const r2 = await p.evaluate(() => ({ ring: !!document.querySelector('.pg-ringing'), t: document.querySelector('.pg-root').innerText }));
            check(tag + ' ready → ringing', r2.ring && r2.t.includes('طلبك جاهز!'), r2.t.slice(0, 60));
            await p.click('.pg-btn');
            await p.waitForTimeout(200);
            check(tag + ' stop button stops', !(await p.$('.pg-ringing')));
            // رنّة ثانية من الكاشير.
            current = status('rung', brand);
            await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            await p.waitForTimeout(900);
            check(tag + ' second ring rings again', !!(await p.$('.pg-ringing')));
            current = status('collected', brand);
            await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            await p.waitForTimeout(900);
            const t3 = await p.evaluate(() => document.querySelector('.pg-root').innerText);
            check(tag + ' collected → done, ringing stops', t3.includes('بالعافية عليك') && !(await p.$('.pg-ringing')));
          }
        }
        if (SHOTS && (w === 390 || w === 320 || w === 1280)) {
          await p.screenshot({ path: path.join(OUT, `${brand}-${kind}-${w}.png`) });
        }
        await ctx.close();
      }
    }
    process.stdout.write(`${brand}: ${pass} pass, ${fail} fail\n`);
  }
  await b.close();
  console.log(`\nCHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
