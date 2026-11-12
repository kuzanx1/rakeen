// شاشة «الموظفين» في اللوحة ببيانات مطعم واقعية. كل طلبات Supabase تنرد
// محلياً وتنسجّل -- ما ينكتب شي على القاعدة.
//   node tools/hr-check/run.cjs [out-dir] [empty]   (empty = ما فيه موظفين)
//   SIZES='[[1366,860]]' DARK=1 STEPS=list,tabs,actions STAFF=1 node tools/hr-check/run.cjs
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
const BRANCHES = [{ id: 99, business_id: BIZ, name: 'الفرع الرئيسي' }, { id: 98, business_id: BIZ, name: 'فرع النرجس' }];
const BUSINESS = { id: BIZ, name: 'مكبوس زربيان', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'costing_profit', 'loyalty', 'link_page', 'team_permissions', 'tables_reservations'], plan_tier: 'sarh', is_active: true,
  logo_url: IMG + 'mk-logo.jpg', online_menu_slug: 'makboos', loyalty_enabled: true, vat_registered: true, vat_rate: 0.15, prices_include_vat: true };
const OWNER = { id: 'demo-user', business_id: BIZ, branch_id: null, full_name: 'أبو فيصل', user_type: STAFF ? 'employee' : 'owner', role: STAFF ? 'employee' : 'owner', active: true };
const PERMS = STAFF ? [{ user_id: 'demo-user', permission_key: 'screen:hr' }] : [];
const day = d => new Date(now + d * 864e5).toISOString().slice(0, 10);
const DEPTS = EMPTY ? [] : [{ id: 1, business_id: BIZ, name: 'المطبخ', parent_department_id: null }, { id: 2, business_id: BIZ, name: 'الكاشير والصالة', parent_department_id: null }, { id: 3, business_id: BIZ, name: 'التوصيل', parent_department_id: null }];
// [الاسم، المسمى، القسم، الفرع، الحالة، الراتب، الجنسية، انتهاء الإقامة بعد كم يوم، الجوال]
const PEOPLE = EMPTY ? [] : [
  ['محمد رفيق', 'شيف رئيسي', 1, 99, 'active', 4500, 'باكستان', 210, '0551231234'],
  ['أحمد سليم', 'مساعد شيف', 1, 99, 'active', 2800, 'مصر', 12, '0559876543'],
  ['خالد العتيبي', 'كاشير', 2, 99, 'active', 4000, 'السعودية', null, '0501112222'],
  ['جون ديلا', 'كاشير', 2, 98, 'active', 2600, 'الفلبين', -5, '0533334444'],
  ['سامي يوسف', 'مندوب توصيل', 3, 99, 'on_leave', 2200, 'السودان', 95, '0544445555'],
  ['عمر فاروق', 'مضيف', 2, 98, 'active', 2400, 'الهند', 340, null],
];
const EMPLOYEES = PEOPLE.map(([full_name, job_title, department_id, branch_id, status, base_salary, nationality, iq, phone], i) => ({
  id: 10 + i, business_id: BIZ, full_name, job_title, department_id, branch_id, status, base_salary, nationality, phone,
  employment_type: i === 5 ? 'part_time' : 'full_time', hire_date: day(-400 + i * 60), national_id_or_iqama: nationality === 'السعودية' ? '1088776655' : '24' + (33445566 + i),
  iqama_expiry: iq === null ? null : day(iq), emergency_contact_name: i < 2 ? 'أخوه' : null, emergency_contact_phone: i < 2 ? '0550000000' : null, created_at: day(-400 + i * 60) }));
const st = d => d < 0 ? 'expired' : d <= 30 ? 'expiring_soon' : 'valid';
const COMP = [];
let cid = 500;
EMPLOYEES.forEach((e, i) => {
  if (e.iqama_expiry) { const d = PEOPLE[i][7]; COMP.push({ id: ++cid, business_id: BIZ, employee_id: e.id, document_type: 'iqama', document_number: e.national_id_or_iqama, issued_date: null, expiry_date: e.iqama_expiry, status: st(d), reminder_days_before: 30, reminder_enabled: true }); }
  if (i !== 3 && i !== 5) { const d = i === 1 ? 20 : 150 + i * 10; COMP.push({ id: ++cid, business_id: BIZ, employee_id: e.id, document_type: 'health_cert', document_number: 'HC-' + (7000 + i), issued_date: null, expiry_date: day(d), status: st(d), reminder_days_before: 30, reminder_enabled: true }); }
  if (i < 4) { const d = 180 + i * 20; COMP.push({ id: ++cid, business_id: BIZ, employee_id: e.id, document_type: 'insurance', document_number: null, issued_date: null, expiry_date: day(d), status: st(d), reminder_days_before: 30, reminder_enabled: i !== 2 }); }
});
COMP.sort((a, b) => a.expiry_date < b.expiry_date ? -1 : 1);
const STAFFM = EMPTY ? [] : [
  { id: 71, business_id: BIZ, employee_id: 12, branch_id: 99, name: 'خالد العتيبي', active: true, is_reservation_host: false },
  { id: 72, business_id: BIZ, employee_id: 13, branch_id: 98, name: 'جون ديلا', active: true, is_reservation_host: false },
  { id: 73, business_id: BIZ, employee_id: 15, branch_id: 98, name: 'عمر فاروق', active: true, is_reservation_host: true },
  { id: 74, business_id: BIZ, employee_id: null, branch_id: 99, name: 'كاشير الصباح', active: true, is_reservation_host: false },
];
const ORDERS = [];
if (!EMPTY) { let oid = 8000; const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  [[71, 23, 41], [72, 15, 38], [74, 4, 30]].forEach(([sid, n, avg]) => { for (let k = 0; k < n; k++) ORDERS.push({ id: ++oid, business_id: BIZ, branch_id: 99, staff_member_id: sid, total: avg + (k * 7) % 19, created_at: new Date(Math.min(now - 6e5, t0.getTime() + (9 + k * 0.4) * 36e5)).toISOString(), status: 'completed' }); }); }

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
      case 'employees': { const m = u.match(/[?&]id=eq\.(\d+)/); return send(m ? EMPLOYEES.filter(e => String(e.id) === m[1]) : EMPLOYEES); }
      case 'departments': return send(DEPTS);
      case 'staff_members': return send(STAFFM);
      case 'compliance_items': { let r = COMP; const e = u.match(/employee_id=eq\.(\d+)/), t = u.match(/document_type=eq\.(\w+)/); if (e) r = r.filter(c => String(c.employee_id) === e[1]); if (t) r = r.filter(c => c.document_type === t[1]); return send(r); }
      case 'orders': return send(ORDERS);
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
    await page.evaluate(() => document.querySelector('.nav-item[data-screen="hr"]')?.click());
    await page.waitForTimeout(1200);
    const full = async name => {
      const tall = await page.evaluate(() => { const c = document.querySelector('.content'); return c ? c.scrollHeight + c.getBoundingClientRect().top + 40 : 0; });
      await page.setViewportSize({ width: w, height: Math.ceil(Math.max(h, tall)) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
      await page.setViewportSize({ width: w, height: h });
    };
    const sw = async () => page.evaluate(() => document.documentElement.scrollWidth);
    if (STEPS.includes('list')) await full('hr');
    if (STEPS.includes('tabs')) {
      const tabs = await page.evaluate(() => [...document.querySelectorAll('#hrTabs [data-tab]')].filter(b => b.offsetParent).map(b => b.dataset.tab));
      for (const t of tabs) { await page.evaluate(t => document.querySelector('#hrTabs [data-tab="' + t + '"]').click(), t); await page.waitForTimeout(900); await full('tab-' + t); }
      if (tabs.length) { await page.evaluate(t => document.querySelector('#hrTabs [data-tab="' + t + '"]').click(), tabs[0]); await page.waitForTimeout(700); }
    }
    if (STEPS.includes('actions')) {
      const r = await page.evaluate(async () => {
        const out = {}, q = s => document.querySelector('#screen-hr ' + s), qa = s => [...document.querySelectorAll('#screen-hr ' + s)];
        out.hero = (q('#hrHero')?.innerText || '').replace(/\s+/g, ' ').slice(0, 260);
        out.todo = qa('#hrTodo .iv-todo-row').map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 70));
        out.tiles = qa('#hrTabs [data-tab]').map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 50));
        return out;
      });
      console.log('actions', JSON.stringify(r));
      const opened = await page.evaluate(async () => { const b = document.querySelector('#screen-hr [data-hr-emp], #screen-hr .hr-emp-edit-btn'); if (!b) return false; b.click(); await new Promise(r => setTimeout(r, 700)); return !!document.querySelector('#hrModal.show'); });
      if (opened) { await full('modal'); await page.evaluate(() => document.querySelector('#hrModal')?.classList.remove('show')); }
      console.log('modal', opened, 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || ''))));
    }
    if (STEPS.includes('save')) {
      const r = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
        document.querySelector('#screen-hr [data-hr-go="@add"]').click(); await wait(400);
        document.getElementById('empName').value = 'فيصل التجربة'; document.getElementById('empJobTitle').value = 'كاشير'; document.getElementById('empBranch').value = '99';
        const cb = document.getElementById('empCashierEnabled'); cb.checked = true; cb.dispatchEvent(new Event('change'));
        document.getElementById('hrModalSaveBtn').click(); await wait(1200);
        out.modalClosed = !document.querySelector('#hrModal.show');
        const del = document.querySelector('#screen-hr [data-hr-legacy-del]');
        if (del) { del.click(); await wait(400); out.ask = document.querySelector('.rk-ask-title')?.textContent; document.getElementById('rkAskOk')?.click(); await wait(1000); }
        document.querySelector('#hrTabs [data-tab="departments"]').click(); await wait(400);
        const q = document.querySelector('#screen-hr [data-hr-quickdept]'); if (q) { q.click(); await wait(1500); out.quick = true; }
        return out;
      });
      console.log('save', JSON.stringify(r), 'writes', JSON.stringify(writes.map(w => w.table + ':' + (w.method || '') + ':' + JSON.stringify(w.body || '').slice(0, 90))));
    }
    const s = await sw();
    if (errs.length || s > w + 1) bad++;
    console.log(`${w}x${h}`, 'scrollWidth', s, errs.length ? 'ERRORS: ' + errs.slice(0, 3).join(' | ') : 'no errors', 'writes', writes.length);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
