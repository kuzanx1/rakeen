// الرئيسية في اللوحة ببيانات مطعم واقعية (بيانات وهمية، كل الطلبات محلية،
// ما ينكتب شي على القاعدة). يصوّر بمقاسين ويطلع أخطاء الصفحة.
//   node tools/home-check/run.cjs [out-dir] [empty]
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const CATS = [[1, 'المكبوس'], [2, 'المقبلات'], [3, 'المشروبات'], [4, 'الحلا']];
const ITEMS = [[501, 1, 'مكبوس دجاج', 32], [502, 1, 'مكبوس لحم', 48], [503, 1, 'نص مكبوس', 18], [504, 2, 'سلطة دقوس', 8], [505, 2, 'شوربة', 9], [506, 3, 'لبن', 4], [507, 3, 'ببسي', 3], [508, 4, 'كنافة', 14], [509, 2, 'سمبوسة', 6]]
  .map(([id, c, name, price], i) => ({ id, business_id: BIZ, category_id: c, name, price, active: true, sort_order: i }));
const STAFF = [{ id: 1, name: 'سعود', branch_id: 99, active: true }, { id: 2, name: 'فهد', branch_id: 99, active: true }, { id: 3, name: 'نوف', branch_id: 99, active: true }];
// طلبات ٨ أيام، أكثرها الظهر والعشاء
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ORDERS = [], OITEMS = [];
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
const nowH = new Date().getHours() + new Date().getMinutes() / 60;
let oid = 9000;
if (!EMPTY) for (let d = 7; d >= 0; d--) {
  const base = day0.getTime() - d * 86400000;
  const n = d === 0 ? 46 : 38 + Math.round(rnd() * 22);
  for (let k = 0; k < n; k++) {
    const peak = rnd() < .5 ? 12.5 + rnd() * 2.5 : 19 + rnd() * 3.5;
    let h = rnd() < .2 ? 11 + rnd() * 12 : peak;
    if (d === 0 && h > nowH) h = Math.max(0.2, nowH - rnd() * Math.min(nowH, 10));
    const at = new Date(base + h * 3600000);
    const lines = 1 + Math.floor(rnd() * 3); let total = 0; const id = ++oid;
    for (let l = 0; l < lines; l++) {
      const it = ITEMS[Math.floor(Math.pow(rnd(), 1.7) * ITEMS.length)];
      const qty = 1 + Math.floor(rnd() * 2); total += it.price * qty;
      OITEMS.push({ order_id: id, menu_item_id: it.id, qty, line_total: it.price * qty });
    }
    const ch = rnd(); const channel = ch < .45 ? 'pickup' : ch < .75 ? 'dine_in' : 'delivery';
    const pm = channel === 'delivery' && rnd() < .7 ? 'delivery_platform' : rnd() < .35 ? 'cash' : 'card';
    ORDERS.push({ id, business_id: BIZ, branch_id: 99, total, subtotal: +(total / 1.15).toFixed(2), discount_amount: 0, channel, payment_method: pm, cash_amount: 0,
      status: rnd() < .03 ? 'cancelled' : 'completed', payment_status: 'paid', created_at: at.toISOString(), staff_member_id: STAFF[Math.floor(rnd() * 3)].id, source: 'pos', shift_id: null, order_items: [{ count: lines }] });
  }
}
function filterRows(rows, url) {
  const q = new URL(url).searchParams; let out = rows;
  for (const [k, v] of q) {
    const m = v.match(/^(gte|lt|lte|gt|eq|in)\.(.*)$/); if (!m || k === 'select' || k === 'order') continue;
    const [, op, val] = m;
    out = out.filter(r => {
      if (!(k in r)) return true;
      const a = r[k];
      if (op === 'in') return val.replace(/[()]/g, '').split(',').map(String).includes(String(a));
      if (op === 'eq') return String(a) === val;
      const isT = k.endsWith('_at');
      const x = isT ? new Date(a).getTime() : Number(a), y = isT ? new Date(val).getTime() : Number(val);
      return op === 'gte' ? x >= y : op === 'gt' ? x > y : op === 'lt' ? x < y : x <= y;
    });
  }
  return out;
}
async function mocks(page) {
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE + '/api/billing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payments: [], to_sign: null, bank: { name: '', iban: '', holder: '' } }) });
    if (url.startsWith(BASE + '/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const m = url.match(/supabase\.co\/(rest|auth|realtime|storage|functions)\/v1\/([^?]*)/);
    if (!m) return route.continue();
    const [, kind, rest] = m;
    if (kind === 'auth') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rest.startsWith('user') ? user : session) });
    if (kind !== 'rest') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (rest.startsWith('rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    const table = rest.split('/')[0];
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = rows => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }, body: JSON.stringify(single ? rows[0] || null : rows) });
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    switch (table) {
      case 'profiles': return send([{ id: 'demo-user', business_id: BIZ, branch_id: 99, full_name: 'أبو فيصل', user_type: 'owner', role: 'owner' }]);
      case 'businesses': return send([{ id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit'], plan_tier: 'emad', online_subscribed: true, online_menu_slug: 'makboos', online_ordering_enabled: true, is_active: true, logo_url: 'https://media.rakeenapp.com/links/examples/mk-logo.jpg' }]);
      case 'branches': return send([{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }]);
      case 'menu_items': return send(ITEMS);
      case 'menu_categories': return send(CATS.map(([id, name], i) => ({ id, business_id: BIZ, name, sort_order: i })));
      case 'staff_members': return send(STAFF);
      case 'orders': return send(filterRows(ORDERS, url).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      case 'order_items': return send(filterRows(OITEMS, url));
      default: return send([]);
    }
  });
}
const NOISE = /eval\(\) is not supported|Internal Next\.js error|hasn.t mounted yet/;
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [w, h] of (process.env.SIZES ? JSON.parse(process.env.SIZES) : [[1366, 860], [390, 844]])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 1000, deviceScaleFactor: w < 700 ? 2 : 1 });
    await ctx.addCookies([{ name: 'sb-rakeen-dashboard-auth', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: BASE }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (!NOISE.test(e.message)) errs.push(e.message); });
    await mocks(page);
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.body.dataset.stage === 'dashboard', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('welcomeContinueBtn')?.click(); });
    if (process.env.PRESET) { await page.waitForTimeout(2500); await page.click(`#salesRangePresets button[data-preset="${process.env.PRESET}"]`); await page.click('[data-hm-sellers="worst"]'); }
    if (process.env.DARK) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, `home-${w}.png`) });
    if (process.env.DISMISS) await page.evaluate(() => document.querySelector('.wn-close, [aria-label="إغلاق"]')?.click());
    const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + (c.getBoundingClientRect().top) + 40 : 0; });
    await page.setViewportSize({ width: w, height: Math.max(h, tall) });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `home-${w}-full.png`) });
    const sw = await page.evaluate(() => [document.body.dataset.stage, document.documentElement.scrollWidth]);
    console.log(`${w}x${h}`, sw, errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
    await ctx.close();
  }
  await browser.close();
})();
