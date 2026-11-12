// شاشة «المشتريات» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/purchases-check/run.cjs [out-dir] [empty]   (empty = ما فيه فواتير)
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,actions,save STAFF=1 node tools/purchases-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const STEPS = (process.env.STEPS || 'list').split(',');
const STAFF = !!process.env.STAFF;
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'owner@makboos.sa', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const IMG = 'https://media.rakeenapp.com/links/examples/';
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }];
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'link_page', 'team_permissions', 'purchases_scan'], plan_tier: 'sarh', is_active: true,
  logo_url: IMG + 'mk-logo.jpg', online_menu_slug: 'makboos', loyalty_enabled: true, vat_registered: true, vat_rate: 0.15, prices_include_vat: true };
const OWNER = { id: 'demo-user', business_id: BIZ, branch_id: null, full_name: 'أبو فيصل', user_type: STAFF ? 'employee' : 'owner', role: STAFF ? 'employee' : 'owner', active: true };
const PERMS = STAFF ? [{ user_id: 'demo-user', permission_key: 'screen:purchases' }] : [];
// [id, الاسم، الوحدة، الموجود، المعتاد، التكلفة]
const STOCK = [[1, 'دجاج', 'kg', 6, 40, 17.5], [2, 'رز بسمتي', 'kg', 55, 60, 7.2], [3, 'لحم غنم', 'kg', 3, 15, 48], [4, 'زيت', 'liter', 18, 20, 6.4], [5, 'بصل', 'kg', 9, 12, 3.1], [6, 'علب سفري', 'piece', 40, 300, 0.45]]
  .map(([id, name, unit, q, par, c]) => ({ id, business_id: BIZ, name, unit, qty_on_hand: q, par_level: par, unit_cost: c, category: id === 6 ? 'packaging' : 'raw', alias_names: [] }));
const SUPP = EMPTY ? [] : [[11, 'مزرعة الرياض للدواجن'], [12, 'دواجن الوطنية'], [13, 'أسواق العثيم'], [14, 'ملحمة الخير'], [15, 'مصنع التغليف الحديث']].map(([id, name]) => ({ id, business_id: BIZ, name, vat_registered: id !== 14 }));
const INV = [];
if (!EMPTY) { let id = 900, g = 0;
  const add = (daysAgo, sup, lines) => { g++; const at = new Date(now - daysAgo * 864e5 - 3 * 36e5).toISOString(); lines.forEach(([sid, qty, total]) => INV.push({ id: ++id, business_id: BIZ, stock_item_id: sid, supplier_id: sup, qty, unit: STOCK.find(s => s.id === sid).unit, total_cost: total, invoiced_at: at, invoice_group_id: 'g' + g })); };
  add(0, 11, [[1, 20, 340]]);
  add(0, 13, [[2, 25, 175], [5, 10, 30], [4, 10, 62]]);
  add(2, 14, [[3, 10, 470]]);
  add(5, 12, [[1, 20, 380]]);
  add(9, 15, [[6, 500, 210]]);
  add(12, 11, [[1, 25, 430]]);
  add(16, 13, [[2, 25, 182], [4, 10, 66]]);
  add(23, 14, [[3, 8, 392]]);
  add(40, 12, [[1, 20, 372]]);
}
INV.sort((a, b) => a.invoiced_at < b.invoiced_at ? 1 : -1);

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
      case 'profiles': return send([OWNER]);
      case 'businesses': return send([BUSINESS]);
      case 'branches': return send(BRANCHES);
      case 'user_permissions': return send(PERMS);
      case 'stock_items': return send(STOCK);
      case 'suppliers': return send(SUPP);
      case 'purchase_invoices': return send(INV);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="purchases"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('purchases');
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector('#screen-purchases ' + s), qa = s => [...document.querySelectorAll('#screen-purchases ' + s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.hero = (q('#puHero')?.innerText || '').replace(/\s+/g, ' ').slice(0, 260);
        out.todo = qa('#puTodo .iv-todo-row').map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 80));
        out.invRows = qa('.pu-inv').length;
        for (const r of ['today', 'week', 'month', 'all']) { const b = q('[data-pu-range="' + r + '"]'); if (b) { b.click(); await wait(150); out['range_' + r] = qa('.pu-inv').length; } }
        const tiles = qa('#puTabs [data-pu-tab]').map(t => t.dataset.puTab);
        for (const t of tiles) { q('#puTabs [data-pu-tab="' + t + '"]').click(); await wait(250); out['tab_' + t] = (q('#puPanel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 90); }
        if (tiles.length) q('#puTabs [data-pu-tab="' + tiles[0] + '"]').click();
        await wait(200);
        return out;
      });
      console.log('actions', JSON.stringify(r));
      for (const t of ['compare', 'suppliers']) {
        const ok = await page.evaluate(t => { const b = document.querySelector('#puTabs [data-pu-tab="' + t + '"]'); if (b) b.click(); return !!b; }, t);
        if (ok) { await page.waitForTimeout(500); await full('tab-' + t); }
      }
      await page.evaluate(() => document.querySelector('#puTabs [data-pu-tab="invoices"]')?.click());
      const opened = await page.evaluate(async () => { const b = document.querySelector('#screen-purchases [data-pu-go="@manual"], #openAddInvoiceBtn2'); if (!b) return false; b.click(); await new Promise(r => setTimeout(r, 600)); return !!document.querySelector('#invoiceModal.show'); });
      if (opened) { await full('modal'); await page.evaluate(() => document.getElementById('invoiceModal').classList.remove('show')); }
      console.log('modal', opened, 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || ''))));
    }
    if (STEPS.includes('save')) {
      const r = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
        const del = document.querySelector('#screen-purchases [data-pu-del]');
        if (del) { del.click(); await wait(400); out.ask = document.querySelector('.rk-ask-title')?.textContent; document.getElementById('rkAskOk')?.click(); await wait(1200); }
        const use = document.querySelector('#screen-purchases [data-pu-use]');
        if (use) { use.click(); await wait(400); out.ask2 = document.querySelector('.rk-ask-title')?.textContent; document.getElementById('rkAskOk')?.click(); await wait(1000); }
        const buy = document.querySelector('#screen-purchases [data-pu-buy]');
        if (buy) { buy.click(); await wait(600); out.prefill = document.querySelector('#invoiceModal.show .inv-line-item')?.value; }
        return out;
      });
      console.log('save', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || '') + ':' + JSON.stringify(w.body || '').slice(0, 80))));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
