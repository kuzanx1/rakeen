// شاشة «الإعدادات» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/settings-check/run.cjs [out-dir] [empty]   (empty = مطعم جديد: بدون شعار ولا رقم ضريبي ولا موقع فرع)
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions STAFF=1 node tools/settings-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const STEPS = (process.env.STEPS || 'list,tabs').split(',');
const STAFF = !!process.env.STAFF;
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'owner@makboos.sa', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const IMG = 'https://media.rakeenapp.com/links/examples/';
const BRANCHES = EMPTY ? [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي', address: null, lat: null, lng: null, opening_time: null, closing_time: null, district: null, city: null }]
  : [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي', address: 'طريق الملك فهد، حي البيعة، الطائف', lat: 21.2703, lng: 40.4158, opening_time: '12:00:00', closing_time: '01:00:00', district: 'البيعة', city: 'الطائف' },
     { id: 100, business_id: BIZ, name: 'فرع الحوية', address: null, lat: null, lng: null, opening_time: '13:00:00', closing_time: '00:00:00', district: 'الحوية', city: 'الطائف' }];
const WEEK = EMPTY ? [] : [{ branch_id: 99, weekday: 5, opening_time: '13:30:00', closing_time: '02:00:00', is_closed: false }];
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'link_page', 'team_permissions', 'multi_branch', 'tables_reservations'], plan_tier: 'sarh', is_active: true,
  logo_url: EMPTY ? null : IMG + 'mk-logo.jpg', online_menu_slug: 'makboos', online_ordering_enabled: true, branch_limit: EMPTY ? 1 : 3,
  vat_registered: true, vat_rate: 0.15, vat_number: EMPTY ? null : '310123456700003', prices_include_vat: true, dine_in_enabled: true,
  notify_low_stock: !EMPTY, notify_low_stock_pct: 20, notify_new_order: !EMPTY, notify_refund_cancel: true, notify_sales_target: !EMPTY, notify_sales_target_amount: 3000,
  notify_delivery_prep_warning: false, notify_delivery_prep_expired: false, notify_document_expiry: true, notify_sound_enabled: true };
const OWNER = { id: 'demo-user', business_id: BIZ, branch_id: null, full_name: 'أبو فيصل', user_type: STAFF ? 'employee' : 'owner', role: STAFF ? 'employee' : 'owner', active: true };
const TEAM = EMPTY ? [OWNER] : [OWNER, { id: 'u2', business_id: BIZ, branch_id: null, full_name: 'سارة العتيبي', user_type: 'manager', active: true }, { id: 'u3', business_id: BIZ, branch_id: null, full_name: 'خالد الزهراني', user_type: 'employee', active: true }, { id: 'u4', business_id: BIZ, branch_id: null, full_name: 'محمد الغامدي', user_type: 'employee', active: false }];
const PERMS = [{ user_id: 'u3', permission_key: 'screen:menu' }, { user_id: 'u3', permission_key: 'screen:inventory' }].concat(STAFF ? [{ user_id: 'demo-user', permission_key: 'screen:settings' }] : []);

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
    const send = rows => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(single ? rows[0] || null : rows) });
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
      case 'profiles': return send(TEAM);
      case 'businesses': return send([BUSINESS]);
      case 'branches': return send(BRANCHES);
      case 'branch_weekly_hours': return send(WEEK);
      case 'user_permissions': return send(PERMS);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="settings"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('settings');
    await page.waitForTimeout(800);
    if (STEPS.includes('tabs')) {
      const tabs = await page.evaluate(() => [...document.querySelectorAll('#settingsTabs [data-tab]')].map(b => b.dataset.tab));
      for (const t of tabs) {
        await page.evaluate(t => document.querySelector('#settingsTabs [data-tab="' + t + '"]').click(), t);
        await page.waitForTimeout(1100);
        await full('tab-' + t);
      }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector('#screen-settings ' + s), qa = s => [...document.querySelectorAll('#screen-settings ' + s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.hero = (q('#stHero')?.innerText || '').replace(/\s+/g, ' ').slice(0, 220);
        out.sums = qa('#settingsTabs [data-tab] small').map(x => x.textContent).join(' | ');
        for (const k of qa('[data-st-go]').map(x => x.dataset.stGo)) { const go = q('[data-st-go="' + k + '"]'); if (!go) continue; go.click(); await wait(1200); (out.go ||= []).push(k + '>' + (document.querySelector('#settingsTabs .active')?.dataset.tab || '') + ':' + ((document.activeElement && (document.activeElement.id || document.activeElement.className)) || '').slice(0, 40)); }
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || ''))));
    }
    if (STEPS.includes('save')) {
      // مطعمك: «احفظ التغييرات» -- التنبيهات: مفتاح واحد ينحفظ لحاله -- فريقك: الحذف يسأل بـ rkAsk ثم يرسل.
      const r = {};
      await page.evaluate(() => document.querySelector('#settingsTabs [data-tab="restaurant"]').click()); await page.waitForTimeout(700);
      await page.evaluate(() => document.getElementById('settingsSaveBtn').click()); await page.waitForTimeout(900);
      r.restaurant = writes.filter(w => w.table === 'businesses').map(w => Object.keys(w.body || {}).join(',')).pop();
      await page.evaluate(() => document.querySelector('#settingsTabs [data-tab="notifications"]').click()); await page.waitForTimeout(900);
      await page.evaluate(() => document.getElementById('notifyDeliveryPrepWarning').click()); await page.waitForTimeout(800);
      const nw = writes.filter(w => w.table === 'businesses').pop(); r.notify = nw && nw.body && nw.body.notify_delivery_prep_warning;
      await page.evaluate(() => document.querySelector('#settingsTabs [data-tab="permissions"]').click()); await page.waitForTimeout(900);
      await page.evaluate(() => document.querySelector('.team-delete-btn')?.click()); await page.waitForTimeout(500);
      r.ask = await page.evaluate(() => document.querySelector('.rk-ask-title')?.textContent || '');
      await page.evaluate(() => document.getElementById('rkAskNo')?.click()); await page.waitForTimeout(300);
      r.modals = await page.evaluate(() => document.querySelectorAll('.modal-overlay').length);
      console.log('save', JSON.stringify(r));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
