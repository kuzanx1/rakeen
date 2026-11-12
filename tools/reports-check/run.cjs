// شاشة «التقارير» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/reports-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,types,actions STAFF=1 node tools/reports-check/run.cjs
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
// STAFF=1: موظف بدون صلاحية «يشوف الأرباح». EMPTY: مطعم ما باع شي.
const STAFF = !!process.env.STAFF;
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }];
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'purchases_scan', 'delivery_apps'], plan_tier: 'sarh', inventory_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, is_active: true, logo_url: IMG + 'mk-logo.jpg' };
const CATS = [[1, 'المكبوس'], [2, 'المقبلات'], [3, 'المشروبات']].map(([id, name], i) => ({ id, business_id: BIZ, name, sort_order: i }));
const ITEMS = [[501, 1, 'مكبوس دجاج', 32], [502, 1, 'مكبوس لحم', 48], [504, 2, 'سلطة دقوس', 8], [506, 3, 'لبن', 4]]
  .map(([id, c, name, price]) => ({ id, business_id: BIZ, category_id: c, name, price, active: true, sort_order: id, visible_pos: true, cost: price * 0.38 }));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ORDERS = [], LINES = [];
if (!EMPTY) for (let i = 0; i < 46; i++) {
  const at = new Date(now - Math.floor(rnd() * 10) * 3600e3 - 600e3);
  const lines = 1 + Math.floor(rnd() * 3); let total = 0;
  for (let k = 0; k < lines; k++) { const it = ITEMS[Math.floor(rnd() * ITEMS.length)]; const q = 1 + Math.floor(rnd() * 2); total += it.price * q; LINES.push({ order_id: 9000 + i, menu_item_id: it.id, qty: q, line_total: it.price * q }); }
  const ch = ['dine_in', 'takeaway', 'delivery'][Math.floor(rnd() * 3)];
  ORDERS.push({ id: 9000 + i, business_id: BIZ, total, subtotal: +(total / 1.15).toFixed(2), discount_amount: i % 9 === 0 ? 5 : 0, vat_amount: +(total - total / 1.15).toFixed(2), channel: ch === 'takeaway' ? 'pickup' : ch, delivery_platform_id: null, payment_method: rnd() < .6 ? 'card' : 'cash', cash_amount: null, status: 'completed', payment_status: 'paid', shift_id: null, created_at: at.toISOString() });
}

async function mocks(page, writes) {
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE + '/api/billing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payments: [], to_sign: null, bank: { name: '', iban: '', holder: '' } }) });
    if (url.startsWith(BASE + '/api/reports/send-email')) { writes.push({ table: 'api:send-email', body: req.postData() }); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
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
      case 'profiles': return send([{ id: 'demo-user', business_id: BIZ, branch_id: 99, full_name: STAFF ? 'سالم' : 'أبو فيصل', user_type: STAFF ? 'employee' : 'owner', role: STAFF ? 'manager' : 'owner' }]);
      case 'businesses': return send([BUSINESS]);
      case 'branches': return send(BRANCHES);
      case 'menu_categories': return send(CATS);
      case 'menu_items': return send(ITEMS);
      case 'orders': return send(ORDERS);
      case 'order_items': return send(LINES);
      case 'report_exports': return send(EMPTY ? [] : [{ report_type: 'tax', format: 'pdf', exported_at: new Date(now - 2 * 864e5).toISOString(), profiles: { full_name: 'أبو فيصل' } }, { report_type: 'sales', format: 'excel', exported_at: new Date(now - 5 * 864e5).toISOString(), profiles: { full_name: 'سالم' } }]);
      case 'user_permissions': return send(STAFF ? [{ permission_key: 'screen:reports' }, { permission_key: 'screen:home' }] : []);      default: return send([]);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="reports"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('reports');
    if (STEPS.includes('types')) {
      for (const t of (process.env.TYPES || 'sales,products,financial,tax,shift,counter,daily_auto').split(',')) {
        await page.evaluate(t => document.querySelector('#reportTypeChips [data-report="' + t + '"]')?.click(), t);
        await page.waitForTimeout(1200);
        await full('type-' + t);
      }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.hero = (q('#rpHero')?.innerText || '').replace(/s+/g, ' ').slice(0, 160);
        out.tiles = qa('#reportTypeChips [data-report]').length;
        out.sums = qa('#reportTypeChips [data-rp-sum]').map(x => x.textContent).filter(Boolean).slice(0, 6).join(' | ');
        const p = q('#reportRangePresets [data-preset="7d"]'); if (p) { p.click(); await wait(1200); out.range7 = q('#reportPreviewPanel .panel-title')?.textContent; }
        const qs = q('#rpQuarter'); if (qs) { qs.value = 'q1'; qs.dispatchEvent(new Event('change', { bubbles: true })); await wait(1200); out.quarter = q('#reportPreviewPanel .panel-title')?.textContent; }
        const em = q('#reportEmailToggleBtn'); if (em) { em.click(); await wait(300); out.emailOpen = !q('#reportEmailRow').classList.contains('hidden'); }
        const h = q('.report-history-row-clickable'); if (h) { h.click(); await wait(1200); out.historyType = q('#reportTypeChips .active')?.dataset.report; }
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
