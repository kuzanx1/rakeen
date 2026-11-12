// القائمة الجانبية + الشريط العلوي (والشريط السفلي بالجوال) في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/nav-check/run.cjs [out-dir] [empty]   (empty = مطعم جديد: ما باع ولا طلب)
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,actions,save STAFF=1 NOPROFIT=1 PLAN=asas node tools/nav-check/run.cjs
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
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: process.env.PLAN === 'asas' ? ['pos', 'zatca_invoice', 'offline', 'shift_close'] : ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'link_page', 'team_permissions', 'purchases_scan', 'delivery_apps'], plan_tier: process.env.PLAN || 'sarh', is_active: true,
  logo_url: IMG + 'mk-logo.jpg', online_menu_slug: 'makboos', loyalty_enabled: true, vat_registered: true, vat_rate: 0.15, prices_include_vat: true };
const OWNER = { id: 'demo-user', business_id: BIZ, branch_id: null, full_name: 'أبو فيصل', user_type: STAFF ? 'employee' : 'owner', role: STAFF ? 'employee' : 'owner', active: true };
const PERMS = STAFF ? [{ user_id: 'demo-user', permission_key: 'screen:orders' }, { user_id: 'demo-user', permission_key: 'screen:menu' }, { user_id: 'demo-user', permission_key: 'screen:ai' }].concat(process.env.NOPROFIT ? [] : [{ user_id: 'demo-user', permission_key: 'view_profit' }]) : [];
const CATS = [{ id: 1, business_id: BIZ, name: 'مكبوس', sort_order: 1 }, { id: 2, business_id: BIZ, name: 'مشروبات', sort_order: 2 }];
// [id, الاسم، الفئة، السعر، التكلفة]
const ITEMS = [[1, 'مكبوس دجاج', 1, 32, 11.5], [2, 'مكبوس لحم', 1, 55, 24], [3, 'زربيان', 1, 38, 13], [4, 'لبن', 2, 4, 1.2], [5, 'بيبسي', 2, 3, 0]]
  .map(([id, name, c, price, cost], i) => ({ id, business_id: BIZ, name, category_id: c, price, active: true, sort_order: i, cost_mode: 'direct', direct_cost: cost, link_profit: true, link_inventory: false }));
const PLATFORMS = EMPTY ? [] : [{ id: 1, business_id: BIZ, name: 'هنقرستيشن', active: true, prep_timeout_minutes: 17, commission_pct: 22, commission_base: 'total', fee_model: 'flat', flat_fee: 0, compensation_pct: 1 },
  { id: 2, business_id: BIZ, name: 'جاهز', active: true, prep_timeout_minutes: 20, commission_pct: 18, commission_base: 'total', fee_model: 'flat', flat_fee: 3, compensation_pct: 0 },
  { id: 3, business_id: BIZ, name: 'كيتا', active: true, prep_timeout_minutes: 17, commission_pct: 0, commission_base: 'total', fee_model: 'flat', flat_fee: 0, compensation_pct: 0 }];
const PPRICES = EMPTY ? [] : ITEMS.slice(0, 3).map(it => ({ menu_item_id: it.id, platform_id: 1, price: Math.ceil(it.price * 1.2) }));
const iso = (daysAgo, h) => { const d = new Date(now); d.setHours(h || 13, 0, 0, 0); return new Date(d.getTime() - daysAgo * 864e5).toISOString(); };
const ORDERS = [], OITEMS = [];
if (!EMPTY) { let id = 5000;
  // [أيام مضت، القناة، المنصة، [[صنف، كمية]]، خصم]
  const mk = (d, ch, plat, lines, disc) => { const oid = ++id; let t = 0;
    lines.forEach(([mi, q]) => { const it = ITEMS.find(x => x.id === mi); t += it.price * q; OITEMS.push({ order_id: oid, menu_item_id: mi, qty: q, line_total: it.price * q }); });
    ORDERS.push({ id: oid, business_id: BIZ, total: t - (disc || 0), subtotal: +((t - (disc || 0)) / 1.15).toFixed(2), discount_amount: disc || 0, channel: ch, delivery_platform_id: plat, status: 'completed', payment_status: 'paid', staff_member_id: d < 2 ? 61 + (oid % 3) : null, created_at: iso(d, 11 + (oid % 9)) }); };
  for (let k = 0; k < 44; k++) mk(0, ['dine_in', 'pickup', 'delivery'][k % 3], k % 3 === 2 ? (k % 2 ? 1 : 2) : null, [[1 + (k % 3), 1 + (k % 2)], [4, 1], [5, k % 2]], k === 4 ? 10 : 0);
  for (let k = 0; k < 10; k++) mk(1, ['dine_in', 'pickup'][k % 2], null, [[1 + (k % 3), 2]], 0);
  for (let k = 0; k < 9; k++) mk(3 + k, 'delivery', 1 + (k % 2), [[1 + (k % 3), 2], [4, 2]], 0);
}
const STAFFM = [[61, 'سالم'], [62, 'نورة'], [63, 'فهد']].map(([id, name]) => ({ id, business_id: BIZ, branch_id: 99, name, active: true }));
const STOCK = EMPTY ? [] : [[71, 'أرز بسمتي', 'kg', 4, 40, 7], [72, 'دجاج', 'kg', 18, 30, 16], [73, 'لحم', 'kg', 3, 20, 48], [74, 'لبن', 'piece', 60, 80, 1.2]]
  .map(([id, name, unit, q, par, cost]) => ({ id, business_id: BIZ, name, unit, qty_on_hand: q, par_level: par, unit_cost: cost, category: 'raw' }));
const ECATS = [[21, 'صيانة'], [22, 'تسويق'], [23, 'رسوم حكومية']].map(([id, name]) => ({ id, business_id: BIZ, name }));
const EXP = EMPTY ? [] : [[31, 21, 180, 'تصليح ثلاجة العرض', 0], [32, 22, 450, 'إعلان سناب', 3], [33, 23, 300, 'تجديد رخصة البلدية', 9], [34, 21, 120, 'سباك', 17], [35, 22, 200, 'تصوير منيو', 40]]
  .map(([id, c, amount, description, d]) => ({ id, business_id: BIZ, category_id: c, amount, description, spent_at: iso(d, 10) }));
const FIXED = EMPTY ? [] : [{ business_id: BIZ, rent: 9000, salaries: 24000, utilities: 2500, other: 1000 }];
const WASTE = EMPTY ? [] : [{ business_id: BIZ, cost: 36.5, created_at: iso(0, 12) }];
// فلاتر PostgREST البسيطة (gte/lt/eq) على الأعمدة -- عشان «اليوم» و«أمس» و«الشهر» يرجعون صح
const pick = (rows, u) => { const q = u.split('?')[1] || ''; let out = rows;
  for (const part of q.split('&')) { const m = part.match(/^([a-z_]+)=(gte|lt|eq|is|not)\.(.*)$/); if (!m) continue; const [, col, op, v] = m;
    if (op === 'gte') out = out.filter(r => r[col] == null || String(r[col]) >= v);
    else if (op === 'lt') out = out.filter(r => r[col] == null || String(r[col]) < v);
    else if (op === 'eq' && col !== 'business_id' && col in (rows[0] || {})) out = out.filter(r => String(r[col]) === v); }
  return out; };
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
      case 'menu_categories': return send(CATS);
      case 'menu_items': return send(ITEMS);
      case 'orders': return send(pick(ORDERS, u));
      case 'staff_members': return send(STAFFM);
      case 'stock_items': return send(STOCK);
      case 'order_items': return send(OITEMS);
      case 'delivery_platforms': return send(PLATFORMS);
      case 'delivery_platform_fee_tiers': return send([]);
      case 'menu_item_platform_prices': return send(PPRICES);
      case 'expense_categories': return send(ECATS);
      case 'general_expenses': return send(pick(EXP, u));
      case 'fixed_costs': return send(FIXED);
      case 'waste_log': return send(pick(WASTE, u));
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
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) }); };
    if (STEPS.includes('list')) await shot('nav');
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async (SKIPLOGOUT) => {
        const wait = ms => new Promise(r => setTimeout(r, ms)), txt = el => (el?.innerText || '').replace(/\s+/g, ' ').trim();
        const out = {};
        const vis = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        out.nav = [...document.querySelectorAll('.sidebar .nav-item[data-screen], .sidebar .nav-section-label, .sidebar [data-nav-go]')].filter(vis).map(el => (el.classList.contains('nav-section-label') ? '## ' : '') + txt(el) + (el.dataset.planFeature ? ' [🔒' + el.dataset.planFeature + ']' : '') + (el.dataset.screen ? ' <' + el.dataset.screen + '>' : ''));
        out.badges = [...document.querySelectorAll('.sidebar .nav-badge')].filter(vis).map(b => b.closest('.nav-item')?.dataset.screen + ':' + txt(b));
        out.setup = txt(document.querySelector('.sidebar .nav-setup'));
        out.owner = txt(document.querySelector('.sidebar-owner'));
        out.topbar = txt(document.querySelector('.topbar'));
        out.bottom = [...document.querySelectorAll('.rk-bn-item')].filter(vis).map(b => txt(b) + (b.classList.contains('active') ? '*' : ''));
        // كل عنصر بالقائمة يفتح شاشته
        out.clicks = [];
        for (const b of [...document.querySelectorAll('.sidebar .nav-item[data-screen]')].filter(vis)) {
          if (b.dataset.planFeature) continue;
          b.click(); await wait(250);
          const s = b.dataset.screen, sec = document.getElementById('screen-' + s);
          out.clicks.push(s + (sec && sec.classList.contains('active') ? '' : ' ✗') + (document.getElementById('topbarTitle')?.textContent ? '' : ' (no title)'));
        }
        document.querySelector('.sidebar .nav-item[data-screen="home"]')?.click(); await wait(300);
        const lo = document.getElementById('logoutBtn'); if (lo && !SKIPLOGOUT) { lo.click(); await wait(400); out.logoutAsk = document.querySelector('.rk-ask-title')?.textContent || 'NO ASK'; document.getElementById('rkAskNo')?.click(); await wait(300); }
        return out;
      }, !!process.env.SKIPLOGOUT);
      console.log('actions', JSON.stringify(r, null, 1));
      if (w >= 900) {
        await page.evaluate(() => document.getElementById('sidebarCollapseBtn')?.click());
        await shot('collapsed');
        await page.evaluate(() => document.getElementById('sidebarCollapseBtn')?.click());
      } else {
        await page.evaluate(() => document.querySelector('.rk-hamburger-btn')?.click());
        await page.waitForTimeout(500);
        const tall = await page.evaluate(() => document.querySelector('.sidebar')?.scrollHeight || 0);
        await page.setViewportSize({ width: w, height: Math.max(h, tall) });
        await shot('drawer');
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate(() => document.querySelector('.rk-sidebar-backdrop')?.click());
      }
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length, writes.map(w => w.table + ':' + (w.method || '')).join(','));
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
