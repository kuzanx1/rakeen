// شاشة «القائمة» (المنيو) في اللوحة ببيانات مطعم واقعية. كل طلبات
// Supabase تنرد محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/menu-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,product,new,mods,cats node tools/menu-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const EMPTY = process.argv[3] === 'empty';
const STEPS = (process.env.STEPS || 'list,product,new,mods').split(',');
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = 777;
const IMG = 'https://media.rakeenapp.com/links/examples/';
const CATS = EMPTY ? [] : [[1, 'المكبوس'], [2, 'المقبلات'], [3, 'المشروبات'], [4, 'الحلا']].map(([id, name], i) => ({ id, business_id: BIZ, name, sort_order: i }));
const ITEM = (id, c, name, price, o = {}) => Object.assign({ id, business_id: BIZ, category_id: c, name, price, active: true, sort_order: id, image_url: null,
  visible_online: true, visible_pos: true, hidden_until: null, cost_mode: 'direct', direct_cost: 0, link_inventory: false, link_profit: false, description: '', calories: null }, o);
const ITEMS = EMPTY ? [] : [
  ITEM(501, 1, 'مكبوس دجاج', 32, { image_url: IMG + 'mk-plate.png', direct_cost: 13.5, link_profit: true, description: 'نص دجاجة على رز مكبوس بالبهارات' }),
  ITEM(502, 1, 'مكبوس لحم', 48, { image_url: IMG + 'mk-cover.jpg', direct_cost: 24, link_profit: true }),
  ITEM(503, 1, 'نص مكبوس', 18, { direct_cost: 7, link_profit: true }),
  ITEM(510, 1, 'مكبوس عائلي', 120, { cost_mode: 'recipe', link_profit: true, link_inventory: true }),
  ITEM(504, 2, 'سلطة دقوس', 8, { image_url: IMG + 'an-bg.jpg', direct_cost: 2, link_profit: true }),
  ITEM(505, 2, 'شوربة', 9, { hidden_until: new Date(now + 6 * 3600e3).toISOString() }),
  ITEM(509, 2, 'سمبوسة', 6, { image_url: IMG + 'an-cover.jpg', direct_cost: 1.8, link_profit: true }),
  ITEM(506, 3, 'لبن', 4, { direct_cost: 1.2, link_profit: true }),
  ITEM(507, 3, 'ببسي', 3, { direct_cost: 1.5, link_profit: true, visible_online: false }),
  ITEM(508, 4, 'كنافة', 14, { image_url: IMG + 'an-bg2.jpg', active: false }),
];
// COMPLETE=1: منيو كامل (كل منتج له صورة وتكلفة) -- يطلع شريط «منيوك كامل».
if (process.env.COMPLETE) ITEMS.forEach(i => Object.assign(i, { image_url: i.image_url || IMG + 'mk-plate.png', cost_mode: 'direct', direct_cost: i.direct_cost || i.price * .3, link_profit: true }));
const GROUPS = EMPTY ? [] : [{ id: 31, business_id: BIZ, name: 'الحجم', type: 'single', max_select: 1, min_select: 1 }, { id: 32, business_id: BIZ, name: 'الإضافات', type: 'multi', max_select: 4, min_select: 0 }];
const OPTS = EMPTY ? [] : [
  { id: 1, group_id: 31, name: 'عادي', price_delta: 0, cost_mode: 'simple', extra_cost: 0 }, { id: 2, group_id: 31, name: 'كبير', price_delta: 8, cost_mode: 'simple', extra_cost: 3 },
  { id: 3, group_id: 32, name: 'دقوس زيادة', price_delta: 2, cost_mode: 'simple', extra_cost: .5 }, { id: 4, group_id: 32, name: 'رز زيادة', price_delta: 5, cost_mode: 'simple', extra_cost: 1.5 }];
const ITEM_MODS = EMPTY ? [] : [{ menu_item_id: 501, modifier_group_id: 31 }, { menu_item_id: 501, modifier_group_id: 32 }, { menu_item_id: 502, modifier_group_id: 31 }];
const STOCK = EMPTY ? [] : [{ id: 71, business_id: BIZ, name: 'رز بسمتي', category: 'raw', unit: 'kg', unit_cost: 9, qty_on_hand: 40, par_level: 60 }, { id: 72, business_id: BIZ, name: 'دجاج كامل', category: 'raw', unit: 'piece', unit_cost: 14, qty_on_hand: 30, par_level: 50 }];

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
      if (fn === 'menu_item_costs') return send(ITEMS.filter(i => i.cost_mode === 'direct').map(i => ({ menu_item_id: i.id, variable_cost: i.direct_cost })));
      if (fn === 'get_menu_item_recipe' || fn === 'get_menu_item_box_mix') return send([]);
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
      case 'businesses': return send([{ id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty'], plan_tier: 'sarh', online_subscribed: true, online_menu_slug: 'makboos', online_ordering_enabled: true, inventory_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, is_active: true, logo_url: IMG + 'mk-logo.jpg' }]);
      case 'branches': return send([{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }]);
      case 'menu_items': return send(ITEMS);
      case 'menu_categories': return send(CATS);
      case 'modifier_groups': return send(GROUPS);
      case 'modifier_options': return send(OPTS);
      case 'menu_item_modifier_groups': return send(ITEM_MODS);
      case 'stock_items': return send(STOCK);
      case 'fixed_costs': return send(EMPTY ? [] : [{ business_id: BIZ, rent: 9000, salaries: 18000, utilities: 2500, other: 0, expected_monthly_units: 3000 }]);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="menu"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.max(h, tall) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('menu');
    if (STEPS.includes('product') && !EMPTY) {
      await page.evaluate(() => (document.querySelector('.mn-card') || document.querySelector('.menu-table-row'))?.click());
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `product-${w}.png`) });
      for (const tab of ['cost', 'options']) {
        await page.evaluate(t => document.querySelector(`#productEditTabs [data-tab="${t}"]`)?.click(), tab);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `product-${tab}-${w}.png`) });
      }
      await page.evaluate(() => document.getElementById('productEditModalClose')?.click());
      await page.waitForTimeout(300);
    }
    if (STEPS.includes('new')) {
      await page.evaluate(() => document.getElementById('openAddProductBtn')?.click());
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `new-${w}.png`) });
      await page.evaluate(() => document.getElementById('productEditModalClose')?.click());
      await page.waitForTimeout(300);
    }
    if (STEPS.includes('mods')) {
      await page.evaluate(() => document.querySelector('#menuScreenTabs [data-tab="modifiers"]')?.click());
      await page.waitForTimeout(500);
      await full('mods');
    }
    if (STEPS.includes('actions') && !EMPTY) {
      // كل زر في الشاشة: يسوي اللي يقوله؟
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        q('#menuScreenTabs [data-tab="products"]').click(); await wait(100);
        const next = q('#costCompletionBanner .hm-quest-next');
        out.nextStep = next && next.dataset.mnGo;
        next.click(); await wait(200);
        out.flagActive = q('.menu-flag-tab.active')?.dataset.flag;
        out.cardsNoImage = qa('.mn-card').length;
        q('.menu-flag-tab.active').click(); await wait(100);
        out.cardsAll = qa('.mn-card').length;
        qa('.menu-cat-tab')[1].click(); await wait(100);
        out.cardsCat = qa('.mn-card').length;
        out.moveBtns = qa('.mn-card .prod-move-btn').length;
        qa('.menu-cat-tab')[0].click(); await wait(100);
        const inp = q('#menuSearchInput'); inp.value = 'مكبوس'; inp.dispatchEvent(new Event('input')); await wait(100);
        out.cardsSearch = qa('.mn-card').length;
        inp.value = 'zzz'; inp.dispatchEvent(new Event('input')); await wait(100);
        const clr = q('[data-mn-clear]'); out.emptySearch = !!clr; clr && clr.click(); await wait(100);
        out.cardsAfterClear = qa('.mn-card').length;
        const sel = q('.mn-card .mtr-hide-select'); sel.value = 'today'; sel.dispatchEvent(new Event('change')); await wait(400);
        out.hiddenTag = !!q('.mn-card[data-id="' + sel.dataset.id + '"].off');
        q('.mn-card[data-id="' + sel.dataset.id + '"] .mtr-hide-select').value = 'show';
        q('.mn-card[data-id="' + sel.dataset.id + '"] .mtr-hide-select').dispatchEvent(new Event('change')); await wait(400);
        out.shownAgain = !q('.mn-card[data-id="' + sel.dataset.id + '"].off');
        q('#openAddCategoryBtn').click(); await wait(300);
        out.catModal = !!document.querySelector('.modal-overlay.show');
        document.querySelectorAll('.modal-overlay.show').forEach(o => { const c = o.querySelector('.tdp-close, [data-close], .modal-close'); c ? c.click() : o.classList.remove('show'); });
        await wait(200);
        q('#menuScreenTabs [data-tab="modifiers"]').click(); await wait(100);
        out.modsVisible = q('#menuTabModifiers').style.display !== 'none' && qa('.mn-mod').length;
        q('.mn-mod').click(); await wait(300);
        out.modModal = q('#modGroupModal').classList.contains('show');
        q('#modGroupModalClose').click(); await wait(200);
        q('#menuScreenTabs [data-tab="products"]').click();
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + JSON.stringify(w.body))));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
