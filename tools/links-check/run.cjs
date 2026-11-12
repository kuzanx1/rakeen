// شاشة «روابطك» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/links-check/run.cjs [out-dir] [empty]   (empty = صفحة أول مرة، بدون link_page)
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions LIVE=1 node tools/links-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const STEPS = (process.env.STEPS || 'list,tabs').split(',');
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const IMG = 'https://media.rakeenapp.com/links/examples/';
const STAFF = false;
// LIVE=1: صفحة منشورة ومحفوظة وفيها زيارات.
const LIVE = !!process.env.LIVE;
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }];
const id = n => 'l' + n;
const LINK_PAGE = EMPTY ? null : { v: 1, enabled: LIVE, template: 'velvet', name: 'مكبوس زربيان', bio: 'مكبوس على الحطب من ٢٠١٢', avatar: '', wordmark: '', badge: '',
  links: [{ id: id(1), type: 'order', label: 'اطلب أونلاين', value: '', on: true, star: true }, { id: id(2), type: 'menu', label: 'المنيو', value: '', on: true },
    { id: id(3), type: 'whatsapp', label: 'راسلنا واتساب', value: '0551234567', on: true }, { id: id(4), type: 'location', label: 'موقعنا', value: LIVE ? 'https://maps.app.goo.gl/abc' : '', on: true }],
  socials: LIVE ? [{ id: id(5), type: 'instagram', label: 'إنستقرام', value: 'makboos', on: true }] : [],
  stats: [], cta: { on: true, label: 'اطلب الآن', type: 'order', value: '' }, icons: true, share: true, announce: { on: false, text: '', link: '' },
  opts: {}, brand: { primary: '#B5562B', second: '', tone: { velvet: 0, cover: 0, bold: 0 } } };
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'link_page'], plan_tier: 'sarh', is_active: true,
  logo_url: IMG + 'mk-logo.jpg', online_menu_slug: EMPTY ? null : 'makboos', online_ordering_enabled: true, online_booking_enabled: false, online_contact_whatsapp: '0551234567', online_social_instagram: 'makboos', online_social_tiktok: 'makboos.sa', online_social_twitter: null, online_theme_color: '#B5562B', link_page: LINK_PAGE };
const CATS = [], ITEMS = [];
const HITS = [];
if (LIVE) for (let d = 0; d < 30; d++) { const day = new Date(now - d * 864e5 + 3 * 36e5).toISOString().slice(0, 10); HITS.push({ day, link_id: '', hits: 8 + ((d * 7) % 13) }); HITS.push({ day, link_id: id(1), hits: 3 + (d % 4) }); HITS.push({ day, link_id: id(3), hits: 1 + (d % 3) }); }

async function mocks(page, writes) {
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE + '/api/billing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payments: [], to_sign: null, bank: { name: '', iban: '', holder: '' } }) });
    if (url.startsWith(BASE + '/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const m = url.match(/supabase\.co\/(rest|auth|realtime|storage|functions)\/v1\/([^?]*)/);
    if (!m) return route.continue();
    const [, kind, rest] = m;
    if (kind === 'auth') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rest.startsWith('user') ? user : session) });
    if (kind !== 'rest') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = rows => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }, body: JSON.stringify(single ? rows[0] || null : rows) });
    if (rest.startsWith('rpc/')) {
      const fn = rest.slice(4);
      if (req.method() === 'POST' && !/^get_|_costs$/.test(fn)) { let body = null; try { body = req.postDataJSON(); } catch (_) {} writes.push({ table: 'rpc:' + fn, body }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    const table = rest.split('/')[0];
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch (_) {}
      writes.push({ table, method: req.method(), url: decodeURIComponent(url), body });
      const rows = Array.isArray(body) ? body : [Object.assign({ id: 900 + writes.length }, body || {})];
      return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] : rows) });
    }
    const u = decodeURIComponent(url);
    switch (table) {
      case 'profiles': return send([{ id: 'demo-user', business_id: BIZ, branch_id: 99, full_name: 'أبو فيصل', user_type: 'owner', role: 'owner' }]);
      case 'businesses': return send([BUSINESS]);
      case 'branches': return send(BRANCHES);
      case 'menu_categories': return send(CATS);
      case 'menu_items': return send(ITEMS);
      case 'link_page_hits': return send(HITS);
      default: return send([]);
    }
  });
}
const NOISE = /eval\(\) is not supported|Internal Next\.js error|hasn.t mounted yet/;
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let bad = 0;
  for (const [w, h] of (process.env.SIZES ? JSON.parse(process.env.SIZES) : [[1366, 860], [768, 1024], [390, 844]])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 1000, deviceScaleFactor: w < 700 ? 2 : 1 });
    await ctx.addCookies([{ name: 'sb-rakeen-dashboard-auth', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: BASE }]);
    const page = await ctx.newPage();
    const errs = [], writes = [];
    page.on('pageerror', e => { if (!NOISE.test(e.message)) errs.push(e.message + (process.env.STACK ? ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ') : '')); });
    page.on('dialog', d => { errs.push('DIALOG: ' + d.message()); d.dismiss(); });
    await mocks(page, writes);
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.body.dataset.stage === 'dashboard', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('welcomeContinueBtn')?.click(); });
    if (process.env.DARK) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="links"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('links');
    await page.waitForSelector('#linksStudioRoot .ls, #linksStudioRoot .lk-studio', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (STEPS.includes('tabs')) {
      const tabs = await page.evaluate(() => [...document.querySelectorAll('#linksStudioRoot [data-ls-tab]')].map(b => b.dataset.lsTab));
      for (const t of tabs) {
        await page.evaluate(t => document.querySelector('#linksStudioRoot [data-ls-tab="' + t + '"]').click(), t);
        await page.waitForTimeout(900);
        await full('tab-' + t);
      }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector('#linksStudioRoot ' + s), qa = s => [...document.querySelectorAll('#linksStudioRoot ' + s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.hero = (q('.lsx-hero')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200);
        out.steps = qa('.lsx-hero .hm-qstep, .lsx-hero .hm-quest-next').length;
        out.sums = qa('[data-ls-tab] small').map(x => x.textContent).join(' | ');
        const go = q('[data-lsx-go]'); if (go) { out.go = go.dataset.lsxGo; go.click(); await wait(800); out.focused = document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.className || document.activeElement.tagName); out.tab = q('[data-ls-tab].on')?.dataset.lsTab; }
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || ''))));
    }
    if (STEPS.includes('publish')) {
      // يكمّل الخطوة الناقصة (رابط الموقع) ثم «انشرها» من البطاقة فوق: لازم يحفظ ويحتفل.
      const loc = await page.$('#linksStudioRoot [data-ls-link="l4"] input[dir=ltr]');
      if (loc) await loc.fill('https://maps.app.goo.gl/abc');
      await page.evaluate(() => [...document.querySelectorAll('#linksStudioRoot #lsSocials button')].find(x => x.textContent.includes('استورد'))?.click());
      await page.waitForTimeout(300);
      const pub = await page.$('#linksStudioRoot [data-lsx-go="publish"]');
      if (pub) await pub.click();
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => ({ cel: !!document.querySelector('.lsx-hero.mn-celebrate'), done: !!document.querySelector('.lsx-hero.lsx-done'), toast: document.querySelector('.toast, #toast')?.textContent || '' }));
      const up = writes.find(x => x.table === 'businesses');
      console.log('publish', JSON.stringify(r), 'saved enabled', up && up.body && up.body.link_page && up.body.link_page.enabled);
      await full('published');
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
