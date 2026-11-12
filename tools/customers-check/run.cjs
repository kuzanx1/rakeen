// شاشة «العملاء» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/customers-check/run.cjs [out-dir] [empty]   (empty = ما فيه عملاء مسجّلين)
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions STAFF=1 node tools/customers-check/run.cjs
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
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }];
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'link_page', 'team_permissions'], plan_tier: 'sarh', is_active: true,
  logo_url: IMG + 'mk-logo.jpg', online_menu_slug: 'makboos', loyalty_points_divisor: 10, loyalty_enabled: true, vat_registered: true, vat_rate: 0.15, prices_include_vat: true };
const OWNER = { id: 'demo-user', business_id: BIZ, branch_id: null, full_name: 'أبو فيصل', user_type: STAFF ? 'employee' : 'owner', role: STAFF ? 'employee' : 'owner', active: true };
const PERMS = STAFF ? [{ user_id: 'demo-user', permission_key: 'screen:customers' }] : [];
const ITEMS = [{ id: 1, name: 'مكبوس دجاج', price: 32, category_id: 1, business_id: BIZ, is_available: true }, { id: 2, name: 'مكبوس لحم', price: 58, category_id: 1, business_id: BIZ, is_available: true }, { id: 3, name: 'مندي دجاج', price: 30, category_id: 1, business_id: BIZ, is_available: true }, { id: 4, name: 'شاي عدني', price: 6, category_id: 2, business_id: BIZ, is_available: true }];
const CATS = [{ id: 1, name: 'الرز', business_id: BIZ, sort_order: 1 }, { id: 2, name: 'المشروبات', business_id: BIZ, sort_order: 2 }];
// [الاسم، الجوال، كم طلب، كل كم يوم، آخر طلب قبل كم يوم، متوسط الفاتورة، الصنف المفضّل]
const PEOPLE = EMPTY ? [] : [
  ['فهد العتيبي', '0551112233', 24, 1.2, 0, 64, 2], ['نورة القحطاني', '0503334455', 16, 2, 1, 48, 1], ['عبدالله الشهري', '0567778899', 12, 3, 2, 72, 2],
  ['سلطان الحربي', '0549990011', 14, 2.5, 26, 55, 1], ['ريم الدوسري', '0532221100', 11, 3, 31, 61, 3], ['ماجد الغامدي', '0554443322', 6, 4, 3, 40, 1],
  ['هيفاء الزهراني', '0596665544', 3, 3, 1, 36, 3], ['خالد المالكي', '0538887766', 1, 1, 0, 45, 2], ['منيرة السبيعي', '0577776655', 1, 1, 2, 29, 4],
  ['تركي العنزي', '0512223344', 2, 10, 45, 33, 1], ['سارة الشمري', '0565554433', 1, 1, 60, 22, 3], ['بندر القرشي', null, 4, 5, 9, 50, 2],
];
const CUSTOMERS = [], ORDERS = [], OITEMS = [];
let oid = 5000;
PEOPLE.forEach(([name, phone, n, every, last, avg, fav], i) => {
  const id = 300 + i;
  const first = now - (last + (n - 1) * every) * 864e5 - 5 * 36e5;
  CUSTOMERS.push({ id, business_id: BIZ, name, phone, created_at: new Date(first - 60e3).toISOString(), public_token: 'tok' + id, loyalty_points: Math.floor(n * avg / 10), loyalty_visits: n % 8, loyalty_free_rewards: n > 10 ? 1 : 0, loyalty_units: 0 });
  for (let k = 0; k < n; k++) {
    const t = now - (last + k * every) * 864e5 - (2 + (k % 5)) * 36e5;
    const total = Math.round(avg * (0.8 + ((k * 7) % 5) / 10));
    ORDERS.push({ id: ++oid, business_id: BIZ, branch_id: 99, customer_id: id, total, subtotal: total, created_at: new Date(t).toISOString(), channel: ['dine_in','pickup','delivery'][k % 3], status: 'completed', payment_method: 'cash' });
    OITEMS.push({ order_id: oid, menu_item_id: fav, qty: 2 }, { order_id: oid, menu_item_id: 4, qty: 1 });
  }
});

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
      case 'customers': return send(CUSTOMERS);
      case 'menu_items': return send(ITEMS);
      case 'menu_categories': return send(CATS);
      case 'order_items': return send(OITEMS);
      case 'orders': { const m = u.match(/customer_id=eq\.(\d+)/); return send(m ? ORDERS.filter(o => String(o.customer_id) === m[1]) : ORDERS); }
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="customers"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('customers');
    await page.waitForTimeout(800);
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector('#screen-customers ' + s), qa = s => [...document.querySelectorAll('#screen-customers ' + s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.hero = (q('#cuHero')?.innerText || '').replace(/\s+/g, ' ').slice(0, 240);
        out.todo = qa('#cuTodo .iv-todo-row').map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 60));
        out.segs = qa('[data-seg]').map(x => (x.dataset.seg || 'all') + ':' + (x.querySelector('.cu-seg-n, .rfm-seg-count')?.textContent || '')).join(' ');
        out.rows = qa('.cu-row, .cust-row').length;
        const seg = q('[data-seg="at-risk"]'); if (seg) { seg.click(); await wait(300); out.atRiskRows = qa('.cu-row, .cust-row').length; }
        const s = q('#cuSearch'); if (s) { s.value = 'نورة'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); out.searchRows = qa('.cu-row').length; s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); }
        const row = q('.cu-row, .cust-row'); if (row) { row.click(); await wait(900); out.modal = (document.querySelector('#customerDetailModal.show .modal-card, #customerDetailModal.show')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160); }
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || ''))));
      if (r.modal) await full('modal');
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
