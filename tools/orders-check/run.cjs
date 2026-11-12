// شاشة «الطلبات» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/orders-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,detail,table,actions NOTABLES=1 node tools/orders-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const STEPS = (process.env.STEPS || 'list,detail,table').split(',');
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const ITEMS = [[501, 'مكبوس دجاج', 32], [502, 'مكبوس لحم', 48], [503, 'نص مكبوس', 18], [504, 'سلطة دقوس', 8], [506, 'لبن', 4], [509, 'سمبوسة', 6]].map(([id, name, price]) => ({ id, business_id: BIZ, category_id: 1, name, price, active: true, sort_order: id }));
const PLATFORMS = [{ id: 1, business_id: BIZ, name: 'هنقرستيشن' }, { id: 2, business_id: BIZ, name: 'جاهز' }];
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ORDERS = [], OITEMS = [];
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
const nowH = new Date().getHours() + new Date().getMinutes() / 60;
let oid = 4200;
if (!EMPTY) for (let d = 9; d >= 0; d--) {
  const base = day0.getTime() - d * 86400000;
  const n = d === 0 ? 18 : 14 + Math.round(rnd() * 8);
  for (let k = 0; k < n; k++) {
    let h = rnd() < .5 ? 12.5 + rnd() * 2.5 : 19 + rnd() * 3.5;
    if (d === 0 && h > nowH) h = Math.max(0.2, nowH - rnd() * Math.min(nowH, 10));
    const at = new Date(base + h * 3600000);
    const lines = 1 + Math.floor(rnd() * 3); let total = 0; const id = ++oid;
    for (let l = 0; l < lines; l++) {
      const it = ITEMS[Math.floor(Math.pow(rnd(), 1.7) * ITEMS.length)];
      const qty = 1 + Math.floor(rnd() * 2); total += it.price * qty;
      OITEMS.push({ id: id * 10 + l, order_id: id, menu_item_id: it.id, qty, line_total: it.price * qty, selected_modifiers: [] });
    }
    const ch = rnd(); const channel = ch < .45 ? 'pickup' : ch < .75 ? 'dine_in' : 'delivery';
    const plat = channel === 'delivery' && rnd() < .75 ? PLATFORMS[rnd() < .6 ? 0 : 1].id : null;
    const pm = plat ? 'delivery_platform' : rnd() < .35 ? 'cash' : 'card';
    const r = rnd();
    ORDERS.push({ id, business_id: BIZ, branch_id: 99, total, subtotal: +(total / 1.15).toFixed(2), vat_amount: +(total - total / 1.15).toFixed(2), discount_amount: 0, delivery_fee: 0, channel, payment_method: pm,
      status: r < .04 ? 'cancelled' : r < .07 ? 'refunded' : 'completed', created_at: at.toISOString(), source: channel !== 'dine_in' && !plat && rnd() < .3 ? 'online' : 'pos',
      delivery_platform_id: plat, customer_name: null, customer_phone: null, order_items: [{ count: lines }] });
  }
}
const SECTIONS = [{ id: 1, business_id: BIZ, name: 'الصالة', sort_order: 0 }, { id: 2, business_id: BIZ, name: 'العوائل', sort_order: 1 }];
const lastDine = ORDERS.filter(o => o.channel === 'dine_in').slice(-3);
const ago = m => new Date(now - m * 60000).toISOString();
const TABLES = (EMPTY || process.env.NOTABLES) ? [] : [
  [1, 1, 'serving', lastDine[0], 18], [2, 1, 'available'], [3, 1, 'awaiting_payment', lastDine[1], 52], [4, 1, 'available'], [5, 1, 'cleaning', null, 6], [6, 1, 'available'],
  [7, 2, 'awaiting_order', null, 3], [8, 2, 'serving', lastDine[2], 74], [9, 2, 'available'], [10, 2, 'reserved', null, 0]]
  .map(([number, sec, status, o, mins]) => ({ id: 300 + number, business_id: BIZ, branch_id: 99, number, section_id: sec, status, active_order_id: o ? o.id : null, status_changed_at: mins != null ? ago(mins) : null }));

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
async function mocks(page, writes) {
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE + '/api/billing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payments: [], to_sign: null, bank: { name: '', iban: '', holder: '' } }) });
    if (url.startsWith(BASE + '/api/qr')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' });
    if (url.startsWith(BASE + '/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const m = url.match(/supabase\.co\/(rest|auth|realtime|storage|functions)\/v1\/([^?]*)/);
    if (!m) return route.continue();
    const [, kind, rest] = m;
    if (kind === 'auth') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rest.startsWith('user') ? user : session) });
    if (kind !== 'rest') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = rows => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }, body: JSON.stringify(single ? rows[0] || null : rows) });
    if (rest.startsWith('rpc/')) {
      let body = null; try { body = req.postDataJSON(); } catch (_) {}
      if (rest === 'rpc/refund_pos_order') { writes.push({ table: rest, body }); const o = ORDERS.find(x => x.id === Number(body.p_order_id)); if (o) o.status = 'refunded'; }
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    const table = rest.split('/')[0];
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch (_) {}
      writes.push({ table, method: req.method(), body });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? body : [body]) });
    }
    switch (table) {
      case 'profiles': return send([{ id: 'demo-user', business_id: BIZ, branch_id: 99, full_name: 'أبو فيصل', user_type: 'owner', role: 'owner' }]);
      case 'businesses': return send([{ id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'tables_reservations'], plan_tier: 'sarh', online_subscribed: true, online_menu_slug: 'makboos', online_ordering_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, is_active: true, tables_turn_time_minutes: 45, tables_reservations_enabled: true }]);
      case 'branches': return send([{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }]);
      case 'menu_items': return send(ITEMS);
      case 'menu_categories': return send(EMPTY ? [] : [{ id: 1, business_id: BIZ, name: 'المكبوس', sort_order: 0 }]);
      case 'orders': return send(filterRows(ORDERS, url).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      case 'order_items': return send(filterRows(OITEMS, url));
      case 'restaurant_tables': return send(TABLES);
      case 'table_sections': return send(TABLES.length ? SECTIONS : []);
      case 'delivery_platforms': return send(PLATFORMS);
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
    page.on('pageerror', e => { if (!NOISE.test(e.message)) errs.push(e.message); });
    await mocks(page, writes);
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.body.dataset.stage === 'dashboard', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('welcomeContinueBtn')?.click(); });
    if (process.env.DARK) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="orders"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.max(h, tall) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `orders-${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    if (STEPS.includes('list')) await full('page');
    if (STEPS.includes('table') && !EMPTY && !process.env.NOTABLES) {
      await page.evaluate(() => document.querySelector('.floor-table.awaiting_payment, .floor-table')?.click());
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `orders-table-${w}.png`) });
    }
    if (STEPS.includes('detail') && !EMPTY) {
      await page.evaluate(() => document.querySelector('#ordersTable [data-order-id]')?.click());
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `orders-detail-${w}.png`) });
      await page.evaluate(() => document.getElementById('orderDetailModalClose')?.click());
      await page.waitForTimeout(300);
    }
    if (STEPS.includes('actions') && !EMPTY) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const rows = () => qa('#ordersTable [data-order-id]').length;
        out.rows = rows();
        const st = q('[data-od-status="cancelled"]') || q('#orderStatusTabs [data-status="cancelled"]');
        st && st.click(); await wait(150); out.cancelled = rows();
        (q('[data-od-status="all"]') || q('#orderStatusTabs [data-status="all"]'))?.click(); await wait(150);
        const per = q('[data-od-range="today"]'); if (per) { per.click(); await wait(900); out.today = rows(); }
        const per2 = q('[data-od-range="month"]'); if (per2) { per2.click(); await wait(900); out.month = rows(); }
        const s = q('#orderSearchInput'); const first = q('#ordersTable [data-order-id]')?.dataset.orderId;
        s.value = first; s.dispatchEvent(new Event('input')); await wait(150); out.search = rows();
        s.value = ''; s.dispatchEvent(new Event('input')); await wait(150);
        const more = q('[data-od-more]'); if (more) { const b = rows(); more.click(); await wait(150); out.more = [b, rows()]; }
        // استرجاع: أول ضغطة تسأل داخل النافذة، الثانية تنفّذ
        const comp = qa('#ordersTable [data-order-id]').find(r => r.querySelector('.completed, [data-st="completed"]')) || q('#ordersTable [data-order-id]');
        comp.click(); await wait(800);
        const rb = q('#refundOrderBtn'); out.refundBtn = !!rb;
        if (rb) { rb.click(); await wait(200); out.askInline = !!q('#refundConfirmBtn'); out.overlays = qa('.modal-overlay.show').length; q('#refundConfirmBtn')?.click(); await wait(1500); }
        out.afterStatus = q('#orderDetailModalBody')?.innerText.includes('مسترجع');
        q('#orderDetailModalClose').click(); await wait(200);
        const tb = q('.floor-table'); if (tb) { tb.click(); await wait(200); out.tablePanel = q('#tableDetailPanel').style.display !== 'none'; }
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes));
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (errs.length || sw > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', sw, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
