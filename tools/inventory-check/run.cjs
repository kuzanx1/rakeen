// شاشة «المخزون» في اللوحة ببيانات مطعم واقعية. كل طلبات
// Supabase تنرد محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/inventory-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,item,actions node tools/inventory-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const STEPS = (process.env.STEPS || 'list,item').split(',');
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const S = (id, name, cat, unit, cost, qty, par) => ({ id, business_id: BIZ, name, category: cat, unit, unit_cost: cost, qty_on_hand: qty, par_level: par });
const STOCK = EMPTY ? [] : [
  S(71, 'رز بسمتي', 'raw', 'kg', 9, 12, 60), S(72, 'دجاج كامل', 'raw', 'piece', 14, 6, 50), S(73, 'لحم غنم', 'raw', 'kg', 52, 18, 20),
  S(74, 'بهارات مكبوس', 'raw', 'kg', 38, 3.5, 4), S(75, 'طماطم', 'raw', 'kg', 5, 0, 15), S(76, 'زيت', 'raw', 'liter', 8, 22, 20),
  S(77, 'لبن', 'raw', 'piece', 1.2, 40, 0), S(78, 'علب سفري', 'packaging', 'piece', 0.9, 120, 400), S(79, 'أكياس', 'packaging', 'piece', 0.2, 900, 1000),
  S(80, 'ملاعق بلاستيك', 'packaging', 'piece', 0.05, -12, 500)];
const INSIGHTS = EMPTY ? [] : [[71, 8, 1.5], [72, 9, .7], [73, 2.5, 7.2], [74, .3, 11.7], [75, 2, 0], [76, 1, 22], [78, 30, 4], [79, 40, 22.5]]
  .map(([id, u, d]) => ({ stock_item_id: id, daily_usage: u, days_left: d, history_days: 21, cycle_days: 7, suggested_par: Math.round(u * 9) }));
const ITEMS = EMPTY ? [] : [[501, 'مكبوس دجاج', 32], [502, 'مكبوس لحم', 48], [504, 'سلطة دقوس', 8], [506, 'لبن', 4]]
  .map(([id, name, price]) => ({ id, business_id: BIZ, category_id: 1, name, price, active: true, sort_order: id, cost_mode: 'recipe', link_inventory: true, link_profit: true, visible_online: true, visible_pos: true }));
const RECIPE = EMPTY ? [] : [[501, 71], [501, 72], [501, 74], [502, 71], [502, 73], [502, 74], [504, 75], [506, 77]].map(([m, s]) => ({ menu_item_id: m, stock_item_id: s }));
const MOVES = EMPTY ? [] : [
  { delta: 25, qty_before: 2, qty_after: 27, reason: 'purchase', source: 'receipt', note: 'فاتورة المورد', created_at: new Date(now - 3 * 864e5).toISOString() },
  { delta: -15, qty_before: 27, qty_after: 12, reason: 'sale', source: 'recipe', order_id: 398, created_at: new Date(now - 864e5).toISOString() }];

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
      if (fn === 'rk_stock_insights') return send(INSIGHTS);
      if (fn === 'menu_item_costs') return send([]);
      if (req.method() === 'POST' && !/^get_|_costs$|^rk_stock_insights/.test(fn)) { let body = null; try { body = req.postDataJSON(); } catch (_) {} writes.push({ table: 'rpc:' + fn, body }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    const table = rest.split('/')[0];
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch (_) {}
      writes.push({ table, method: req.method(), url: decodeURIComponent(url), body });
      const rows = Array.isArray(body) ? body : [Object.assign({ id: 900 + writes.length }, body || {})];
      return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] : rows) });
    }
    switch (table) {
      case 'profiles': return send([{ id: 'demo-user', business_id: BIZ, branch_id: 99, full_name: 'أبو فيصل', user_type: 'owner', role: 'owner' }]);
      case 'businesses': return send([{ id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty'], plan_tier: 'sarh', online_subscribed: true, inventory_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, is_active: true }]);
      case 'branches': return send([{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }]);
      case 'stock_items': return send(STOCK);
      case 'menu_items': return send(ITEMS);
      case 'menu_categories': return send(EMPTY ? [] : [{ id: 1, business_id: BIZ, name: 'المكبوس', sort_order: 0 }]);
      case 'menu_item_recipe_lines': return send(RECIPE);
      case 'stock_movements': return send(MOVES);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="inventory"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('inventory');
    if (STEPS.includes('item') && !EMPTY) {
      await page.evaluate(() => (document.querySelector('.iv-card[data-id="71"]') || document.querySelector('#stockTable .menu-table-row'))?.click());
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `item-${w}.png`) });
      await page.evaluate(() => document.getElementById('stockItemModalClose')?.click());
      await page.waitForTimeout(300);
    }
    if (STEPS.includes('actions') && !EMPTY) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const cards = () => qa('#stockTable .iv-card').length;
        out.cards = cards();
        out.todo = qa('.iv-todo-row').length;
        for (const f of ['attention', 'packaging', 'raw']) { const b = q(`[data-iv-filter="${f}"]`); if (b) { b.click(); await wait(150); out[f] = cards(); } }
        q('[data-iv-filter="all"]')?.click(); await wait(150);
        const s = q('#stockSearchInput'); s.value = 'رز'; s.dispatchEvent(new Event('input')); await wait(150); out.search = cards();
        s.value = 'zzz'; s.dispatchEvent(new Event('input')); await wait(150); out.emptySearch = !!q('[data-iv-clear]');
        q('[data-iv-clear]')?.click(); await wait(150); out.afterClear = cards();
        const quick = q('.iv-todo-row [data-iv-act="receive"]');
        if (quick) { quick.click(); await wait(1000); out.modalOpen = q('#stockItemModal')?.classList.contains('show'); out.actActive = q('#siActions [data-act="receive"]')?.classList.contains('active'); out.actPanel = !!q('#siActPanel input'); out.overlays = qa('.modal-overlay.show').length; q('#stockItemModalClose').click(); await wait(300); }
        const dup = q('#checkDuplicateStockBtn'); if (dup) { dup.click(); await wait(250); out.dup = !q('#duplicateStockPanel').classList.contains('hidden'); }
        q('#openAddStockBtn').click(); await wait(600); out.newModal = q('#stockItemModal')?.classList.contains('show'); q('#stockItemModalClose').click(); await wait(300);
        q('#stockTable .iv-card[data-id="80"]')?.click(); await wait(900);
        const del = q('#stockItemDeleteLink'); if (del) { del.click(); await wait(250); out.delAsk = !!q('#ivDelConfirm:not([hidden])'); q('#ivDelYes')?.click(); await wait(600); out.deletedGone = !q('#stockTable .iv-card[data-id="80"]'); }
        q('#stockItemModalClose')?.click(); await wait(200);
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || '') + ' ' + (w.url || '').replace(/^.*\/v1\//, ''))));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
