// شاشة «الكاشير» (إعدادات نقطة البيع) في اللوحة ببيانات مطعم واقعية. كل طلبات
// Supabase تنرد محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/pos-check/run.cjs [out-dir] [empty]
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions FRESH=1 node tools/pos-check/run.cjs
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
// READY=1: فرع واحد مقترن = «كاشيرك جاهز». FRESH=1: مطعم لسا ما ضبط شي (لا كلمة سر مدير ولا جهاز مقترن ولا شعار فاتورة).
const FRESH = !!process.env.FRESH || EMPTY;
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي', district: FRESH ? null : 'حي البيعة', city: FRESH ? null : 'الطائف', receipt_label: FRESH ? null : 'الفرع الأول' }]
  .concat(EMPTY || process.env.READY ? [] : [{ id: 100, business_id: BIZ, name: 'فرع الحوية', district: null, city: null, receipt_label: null }]);
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'kds', 'tables_reservations', 'pager'], plan_tier: 'sarh', online_subscribed: true, inventory_enabled: true, prices_include_vat: true, vat_registered: true, vat_rate: 0.15, vat_number: '310123456700003', is_active: true,
  dine_in_enabled: true, dine_in_mode: FRESH ? 'simple' : 'tables', pos_pager_enabled: false, kitchen_ticket_mode: 'brief', receipt_theme: 'classic',
  receipt_logo_url: null, receipt_tagline: FRESH ? null : 'مكبوس على الحطب من ١٩٩٨', receipt_show_name: true, receipt_print_refund: true, receipt_custom_message: FRESH ? null : 'شكراً لزيارتكم', shift_report_options: {},
  kitchen_ready_mode: 'manual', kitchen_auto_ready_minutes: 15, kitchen_new_order_sound_enabled: true, tables_reservations_enabled: !FRESH, dine_in_pay_timing: 'after', require_manager_pin_for_close: true,
  pos_hide_popular_tab: false, pos_hide_search: false, pos_hide_product_images: true, pos_hide_notif_bell: false, pager_enabled: false, pager_settings: {} };
const TABLES = FRESH ? [] : [1, 2, 3, 4, 5, 6].map(n => ({ id: 300 + n, business_id: BIZ, branch_id: 99, number: n, active_order_id: n === 2 ? 4410 : null, section_id: n <= 3 ? 41 : 42, status: 'available' }));
const SECTIONS = FRESH ? [] : [{ id: 41, business_id: BIZ, branch_id: 99, name: 'عائلات', sort_order: 1 }, { id: 42, business_id: BIZ, branch_id: 99, name: 'أفراد', sort_order: 2 }];
const PRESETS = FRESH ? [] : [{ id: 1, business_id: BIZ, name: 'موظفين', pct: 20, active: true, sort_order: 0 }, { id: 2, business_id: BIZ, name: 'عسكريين', pct: 10, active: true, sort_order: 1 }];

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
      case 'profiles':
        if (u.includes('user_type=eq.employee')) return send(FRESH ? [] : [{ branch_id: 99, created_at: new Date(now - 40 * 864e5).toISOString() }]);
        return send([{ id: 'demo-user', business_id: BIZ, branch_id: 99, full_name: 'أبو فيصل', user_type: 'owner', role: 'owner' }]);
      case 'businesses':
        if (u.includes('pos_manager_pin_hash')) return send(FRESH ? [] : [{ id: BIZ }]);
        return send([BUSINESS]);
      case 'branches': return send(BRANCHES);
      case 'restaurant_tables': return send(TABLES);
      case 'table_sections': return send(SECTIONS);
      case 'discount_presets': return send(PRESETS);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="pos"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.max(h, tall) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('pos');
    if (STEPS.includes('tabs')) {
      for (const t of ['tables', 'receipt', 'interface', 'pager', 'kitchen', 'discounts', 'branches']) {
        const ok = await page.evaluate(t => { const b = document.querySelector('#posSettingsTabs [data-tab="' + t + '"]'); if (!b) return false; b.click(); return true; }, t);
        if (!ok) { console.log('no tab', t); continue; }
        await page.waitForTimeout(1300);
        await full('tab-' + t);
      }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
        const wait = ms => new Promise(r => setTimeout(r, ms));
        out.tiles = qa('#posSettingsTabs [data-tab]').length;
        out.quest = qa('.ps-quest .hm-qstep, .ps-quest .hm-quest-next').length;
        const go = q('[data-ps-go]'); if (go) { out.goTab = go.dataset.psGo; go.click(); await wait(1600); out.focused = document.activeElement && (document.activeElement.id || document.activeElement.className); out.activeTab = q('#posSettingsTabs .active')?.dataset.tab; }
        q('#posSettingsTabs [data-tab="tables"]').click(); await wait(1300);
        const rm = q('.table-remove-btn'); if (rm) { rm.click(); await wait(300); out.askOpen = !!q('.rk-ask-card'); q('#rkAskOk')?.click(); await wait(900); }
        const tile = q('#posSettingsTabs [data-tab="receipt"]'); tile.click(); await wait(1300); out.receiptActive = tile.classList.contains('active') && !!q('#receiptBrandSaveBtn');
        return out;
      });
      console.log('actions', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || '') + ' ' + (w.url || '').replace(/^.*\/v1\//, '').slice(0, 80))));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
