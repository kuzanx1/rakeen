// شاشة «نادي الولاء» في اللوحة ببيانات مقهى واقعية. كل طلبات Supabase
// تنرد محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/loyalty-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions SYS=points|visits|products FRESH=1|OFF=1 node tools/loyalty-check/run.cjs
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
// SYS: نظام الولاء (visits افتراضي). FRESH=1: نادي جديد ما انضبط (بلا شعار ولا مكافأة). OFF=1: معطّل.
const SYS = process.env.SYS || 'visits', FRESH = !!process.env.FRESH || EMPTY, OFF = !!process.env.OFF;
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }];
const BUSINESS = { id: BIZ, name: 'قهوة المساء', business_type: 'cafe', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'kds', 'tables_reservations', 'pager'], plan_tier: 'sarh', inventory_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, is_active: true,
  loyalty_enabled: !OFF, loyalty_points_divisor: 10, loyalty_system_type: FRESH ? 'points' : SYS, loyalty_visits_threshold: 6, loyalty_unit_threshold: 8, loyalty_reward_label: 'قهوة مجانية', loyalty_reward_mode: 'open',
  loyalty_logo_url: FRESH ? null : IMG + 'mk-logo.jpg', loyalty_accent_color: '#B5562B', loyalty_icon_style: 'coffee', loyalty_pattern_style: 'none', loyalty_theme: 'classic', loyalty_tagline: FRESH ? '' : 'قهوتك على مزاجك',
  notify_win_back: !FRESH, win_back_inactive_days: 30, win_back_message: 'مشتقنالك!', wallet_offer_text: FRESH ? null : 'خصم ١٥٪ على الحلا هالأسبوع', wallet_offer_at: new Date(now - 3 * 864e5).toISOString() };
const CATS = EMPTY ? [] : [[1, 'القهوة'], [2, 'الحلا']].map(([id, name], i) => ({ id, business_id: BIZ, name, sort_order: i }));
const ITEMS = EMPTY ? [] : [[501, 1, 'لاتيه', 16, 120], [502, 1, 'قهوة سعودية', 12, 90], [504, 2, 'كيك تمر', 18, null]]
  .map(([id, c, name, price, pts]) => ({ id, business_id: BIZ, category_id: c, name, price, active: true, sort_order: id, points_redeem_price: pts, visible_pos: true }));
const NAMES = ['نورة العتيبي', 'فهد الشمري', 'ريم القحطاني', 'سلطان الدوسري', 'هيا المطيري', 'عبدالله الحربي', 'سارة الزهراني', 'خالد الغامدي', 'منيرة السبيعي', 'ماجد العنزي', 'لمى الشهري', 'تركي البقمي'];
const CUSTOMERS = (EMPTY || FRESH) ? [] : NAMES.map((name, i) => ({ id: 300 + i, business_id: BIZ, name, phone: '05' + String(51234560 + i), created_at: new Date(now - (60 - i) * 864e5).toISOString(), public_token: 't' + i,
  loyalty_points: [140, 85, 230, 40, 12, 310, 66, 0, 95, 20, 175, 8][i], loyalty_visits: [5, 3, 4, 1, 5, 2, 0, 1, 3, 5, 2, 1][i], loyalty_units: [7, 2, 5, 1, 6, 3, 0, 4, 1, 7, 2, 0][i], loyalty_free_rewards: [1, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0][i] }));
const ORDERS = [];
CUSTOMERS.forEach((c, i) => { const n = [9, 4, 6, 1, 7, 12, 3, 1, 5, 6, 2, 1][i]; const last = [1, 3, 0, 45, 2, 6, 38, 1, 12, 0, 70, 4][i]; for (let k = 0; k < n; k++) ORDERS.push({ id: 7000 + ORDERS.length, customer_id: c.id, total: [62, 38, 140, 25, 44, 210, 30, 18, 55, 41, 90, 22][i], created_at: new Date(now - (last + k * 5) * 864e5).toISOString() }); });
const STATS = (EMPTY || FRESH) ? { systemType: 'points', members: 0, pointsOutstanding: 0, rewardsReady: 0, visitsActive: 0, visitsNearReward: 0, unitsActive: 0, unitsNearReward: 0, visitsSum: 0, unitsSum: 0 }
  : { systemType: SYS, members: CUSTOMERS.length, pointsOutstanding: 1181, rewardsReady: 4, visitsActive: 11, visitsNearReward: 3, visitsSum: 32, unitsActive: 10, unitsNearReward: 2, unitsSum: 38 };

async function mocks(page, writes) {
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE + '/api/billing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payments: [], to_sign: null, bank: { name: '', iban: '', holder: '' } }) });
    if (url.startsWith(BASE + '/api/dashboard/send-loyalty-broadcast')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 14 }) });
    if (url.startsWith(BASE + '/api/dashboard/wallet-broadcast')) { writes.push({ table: 'api:wallet-broadcast', body: req.postData() }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: 9, written: 12 }) }); }
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
      if (fn === 'get_loyalty_program_stats') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) });
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
      case 'customers': return send(CUSTOMERS);
      case 'orders': return send(u.includes('customer_id') ? ORDERS : []);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="loyalty"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('loyalty');
    if (STEPS.includes('tabs')) {
      const tabs = await page.evaluate(() => [...document.querySelectorAll('#loyaltyTabs [data-loyalty-tab]')].filter(b => !b.hidden).map(b => b.dataset.loyaltyTab));
      for (const t of tabs) {
        await page.evaluate(t => document.querySelector('#loyaltyTabs [data-loyalty-tab="' + t + '"]').click(), t);
        await page.waitForTimeout(900);
        await full('tab-' + t);
      }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.tiles = qa('#loyaltyTabs [data-loyalty-tab]:not([hidden])').map(b => b.dataset.loyaltyTab).join(',');
        out.quest = qa('.ly-quest .hm-qstep, .ly-quest .hm-quest-next').length;
        out.todo = qa('#lyTodo [data-ly-act]').map(b => b.dataset.lyAct).join(',');
        out.sums = qa('#loyaltyTabs [data-ly-sum]').map(s => s.textContent).join(' | ');
        const go = q('[data-ly-go]'); if (go) { out.goTab = go.dataset.lyGo; go.click(); await wait(1200); out.focused = document.activeElement && (document.activeElement.id || document.activeElement.name || document.activeElement.className); out.activeTab = q('#loyaltyTabs .active')?.dataset.loyaltyTab; }
        const near = q('#lyNear [data-cust-id]'); if (near) { near.click(); await wait(700); out.memberModal = !!q('#memberDetailModal.show'); q('#memberDetailModal').classList.remove('show'); }
        // «ذكّرهم» يفتح «أرسل لعملائك» على خانة العرض، و«شوفهم» يفلتر الغايبين.
        const rem = q('[data-ly-act="notify"]'); if (rem) { rem.click(); await wait(900); out.remind = q('#loyaltyTabs .active')?.dataset.loyaltyTab + ':' + (document.activeElement && document.activeElement.id); }
        const dor = q('[data-ly-act="dormant"]'); if (dor) { dor.click(); await wait(900); out.dormant = q('#loyaltyTabs .active')?.dataset.loyaltyTab + ':' + q('#loyMembersFilters .selected')?.dataset.seg + ':' + qa('#loyMembersList [data-cust-id], #loyMembersList .loy-member-row').length; }
        out.targeted = !!q('[data-loyalty-panel="notify"] #rkTargetedMoved');
        const qs = q('.ly-quest .hm-quest-next'); if (qs) { qs.click(); await wait(900); out.questGo = qs.dataset.lyGo + '>' + (q('#loyaltyTabs .active')?.dataset.loyaltyTab || 'none') + ':' + (document.activeElement && document.activeElement.id); }
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
