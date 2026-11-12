// شاشة «المتجر الإلكتروني» في اللوحة ببيانات مطعم واقعية. كل طلبات
// Supabase تنرد محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/online-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions FRESH=1|READY=1 node tools/online-check/run.cjs
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
// FRESH=1: متجر لسا ما انضبط (بلا رابط ولا شعار ولا بوابة دفع). READY=1: كل شي مضبوط.
const FRESH = !!process.env.FRESH || EMPTY, READY = !!process.env.READY;
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }];
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'kds', 'tables_reservations', 'pager'], plan_tier: 'sarh', inventory_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, is_active: true,
  online_ordering_enabled: true, online_menu_slug: FRESH ? null : 'makboos', online_subscribed: READY, online_order_free_count: FRESH ? 0 : 37, online_theme_style: FRESH ? 'classic' : 'luxury', online_theme_color: '#B5562B',
  logo_url: FRESH ? null : IMG + 'mk-logo.jpg', online_banner_url: FRESH ? null : IMG + 'mk-cover.jpg', online_offers_delivery: !FRESH, online_offers_pickup: true, online_delivery_fee: 10, online_pickup_prep_minutes: 20,
  online_contact_whatsapp: FRESH ? '' : '0551234567', geidea_connected: READY, online_cod_enabled: true, online_card_enabled: READY };
const CATS = EMPTY ? [] : [[1, 'المكبوس'], [2, 'المقبلات'], [3, 'المشروبات']].map(([id, name], i) => ({ id, business_id: BIZ, name, sort_order: i }));
const ITEMS = EMPTY ? [] : [[501, 1, 'مكبوس دجاج', 32, 'mk-plate.png'], [502, 1, 'مكبوس لحم', 48, 'mk-cover.jpg'], [504, 2, 'سلطة دقوس', 8, 'an-bg.jpg'], [506, 3, 'لبن', 4, null]]
  .map(([id, c, name, price, img]) => ({ id, business_id: BIZ, category_id: c, name, price, active: true, sort_order: id, image_url: img ? IMG + img : null, visible_online: true, visible_pos: true }));

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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="onlineMenu"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('online');
    if (STEPS.includes('tabs')) {
      for (const t of ['settings', 'design', 'catalog', 'display', 'gateway']) {
        const ok = await page.evaluate(t => { const b = document.querySelector('#onlineMenuTabs [data-tab="' + t + '"]'); if (!b) return false; b.click(); return true; }, t);
        if (!ok) { console.log('no tab', t); continue; }
        await page.waitForTimeout(1300);
        await full('tab-' + t);
      }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.tiles = qa('#onlineMenuTabs [data-tab]').length;
        out.quest = qa('.ol-quest .hm-qstep, .ol-quest .hm-quest-next').length;
        out.link = q('#olHeroUrl')?.textContent || null;
        const go = q('[data-ol-go]'); if (go) { out.goTab = go.dataset.olGo; go.click(); await wait(1500); out.focused = document.activeElement && (document.activeElement.id || document.activeElement.className); out.activeTab = q('#onlineMenuTabs .active')?.dataset.tab; }
        for (const t of ['design', 'gateway', 'settings']) { const b = q('#onlineMenuTabs [data-tab="' + t + '"]'); b.click(); await wait(1200); out['tab_' + t] = b.classList.contains('active') && q('#onlineMenuPanelBody').children.length > 0; }
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || ''))));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
