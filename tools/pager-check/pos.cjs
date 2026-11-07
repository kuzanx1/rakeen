// فحص وحدة البيجر في كاشير الويب: الكود الحقيقي من rakeen-pos.js، و CSS
// الكاشير الحقيقي، وخادمٌ مزيّف. لا يكتب شيئاً.
//   node tools/pager-check/pos.cjs   (SHOTS=1)
const path = require('path');
const fs = require('fs');
const R = path.resolve(__dirname, '..', '..');
const { chromium } = require(R + '/node_modules/playwright-core');
const SHOTS = !!process.env.SHOTS;
const OUT = path.join(__dirname, 'shots');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(R + '/public/pos/rakeen-pos.js', 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf('/* ============ بيجر ركين — جوال الزبون هو جهاز النداء');
const b = src.indexOf('// Ticks every second regardless');
const block = src.slice(a, b);
const fmt = src.slice(src.indexOf('function formatMmSs('), src.indexOf('\n}\n', src.indexOf('function formatMmSs(')) + 3);
const pad = src.slice(src.indexOf('function pad2('), src.indexOf('\n', src.indexOf('function pad2(')) + 1);
const esc = src.slice(src.indexOf('function escapeHtml('), src.indexOf('\n}\n', src.indexOf('function escapeHtml(')) + 3);
const css = fs.readFileSync(R + '/app/pos/rakeen-pos.css', 'utf8') + '\n' + fs.readFileSync(R + '/app/pos/rakeen-pos-additions.css', 'utf8');

function serverKey(uuid) {
  const hex = uuid.replace(/-/g, '');
  let bin = '';
  for (let i = 0; i < 32; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let pass = 0, fail = 0; const fails = [];
function check(n, ok, info) { if (ok) pass++; else { fail++; fails.push(n + (info ? ' — ' + info : '')); } }

const SIZES = [[1366, 768], [1280, 800], [1024, 600], [800, 1280], [768, 1024], [600, 960], [414, 896], [360, 740]];

(async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of SIZES) {
      const ctx = await br.newContext({ viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.setContent(`<!doctype html><html dir="rtl" lang="ar" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
        <style>body{margin:0} #ordersList{padding:12px}</style></head><body>
        <div class="screen active" id="screen-orders"><div id="ordersList"></div></div></body></html>`);
      await p.addScriptTag({ content: `
        // about:blank ليس سياقاً آمناً، فلا randomUUID فيه.
        if (!crypto.randomUUID) crypto.randomUUID = () => {
          const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
          const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
          return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
        };
        window.__calls = []; window.__toasts = [];
        const state = { resumingOrder: null };
        let DINE_IN_MODE = 'simple';
        let NOTIFY_SOUND_ENABLED = true;
        let ordersActiveTab = 'running';
        const DEVICE = { branchId: 3 };
        const selfMarkedReadyOrderIds = new Set();
        function showToast(m){ window.__toasts.push(m); }
        function updateNotifBell(){}
        function ensurePosDeviceId(){ return 'pos-dev-1'; }
        function playAlertSound(k){ window.__calls.push({ sound: k }); }
        function renderOrdersList(){ document.getElementById('ordersList').innerHTML = '<div class="dorder-grid">' + rkPagerSortedRows().map(renderPagerCard).join('') + '</div>'; }
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) }, from(){ return { select(){ return this; }, eq(){ return this; }, not(){ return this; }, is(){ return this; }, gte(){ return this; }, order(){ return Promise.resolve({ data: [], error: null }); }, single(){ return Promise.resolve({ data: null, error: { message: 'x' } }); } }; } };
        window.fetch = async (url, init) => {
          const body = init && init.body ? JSON.parse(init.body) : null;
          window.__calls.push({ url, body });
          if (url === '/api/pager/notify') {
            const now = new Date().toISOString();
            const o = { id: body.orderId, ready_at: (body.action === 'ready' || body.action === 'ring') ? now : null, eta_at: body.action === 'delay' ? new Date(Date.now() + 9 * 60000).toISOString() : null, delayed_at: body.action === 'delay' ? now : null, seen_at: body.orderId === 101 ? now : null, ring_count: body.action === 'ring' ? 1 : 0 };
            return { ok: true, json: async () => ({ ok: true, pushed: body.orderId === 101 ? 1 : 0, order: o }) };
          }
          return { ok: true, json: async () => ({ ok: true }) };
        };
        ${esc}
        ${pad}
        ${fmt}
        ${block}
      ` });
      const tag = `${theme} @${w}`;

      // ---- منطق (مرّة واحدة يكفي، لكنه رخيص) ----
      if (w === 1366 && theme === 'light') {
        const keys = await p.evaluate(() => {
          const out = [];
          for (let i = 0; i < 300; i++) { const u = crypto.randomUUID(); out.push([u, rkPagerKey(u)]); }
          return out;
        });
        check('300 keys match the server', keys.every(([u, k]) => k === serverKey(u) && /^[A-Za-z0-9_-]{22}$/.test(k)));
        const el = await p.evaluate(() => {
          const U = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
          PAGER_ENABLED = true; PAGER_SETTINGS = rkPagerSettings({ channels: ['dine_in', 'pickup'] }); PAGER_AUTO_READY = { dine_in: false, pickup: false };
          const r = {
            pickup: rkPagerEligible({ client_order_uuid: U, channel: 'pickup' }),
            dine: rkPagerEligible({ client_order_uuid: U, channel: 'dine_in' }),
            delivery: rkPagerEligible({ client_order_uuid: U, channel: 'delivery' }),
            table: rkPagerEligible({ client_order_uuid: U, channel: 'dine_in', table_id: 3 }),
            bad: rkPagerEligible({ client_order_uuid: 'nope', channel: 'pickup' }),
          };
          DINE_IN_MODE = 'tables'; r.tablesMode = rkPagerEligible({ client_order_uuid: U, channel: 'dine_in' }); DINE_IN_MODE = 'simple';
          PAGER_AUTO_READY.pickup = true; r.autoReady = rkPagerEligible({ client_order_uuid: U, channel: 'pickup' }); PAGER_AUTO_READY.pickup = false;
          state.resumingOrder = { id: 1 }; r.resume = rkPagerEligible({ client_order_uuid: U, channel: 'pickup' }); state.resumingOrder = null;
          PAGER_ENABLED = false; r.off = rkPagerEligible({ client_order_uuid: U, channel: 'pickup' }); PAGER_ENABLED = true;
          PAGER_SETTINGS.wifi = 'Cafe-5G';
          r.block = rkPagerReceiptBlock({ client_order_uuid: U, channel: 'pickup', orderId: 77 });
          r.blockOffline = rkPagerReceiptBlock({ client_order_uuid: U, channel: 'pickup', orderId: null });
          PAGER_SETTINGS.receipt = false; r.noReceipt = rkPagerReceiptBlock({ client_order_uuid: U, channel: 'pickup', orderId: 77 }); PAGER_SETTINGS.receipt = true;
          return r;
        });
        check('eligible: pickup + simple dine-in', el.pickup && el.dine);
        check('not eligible: delivery/table/tables-mode/auto-ready/resume/off/bad uuid', !el.delivery && !el.table && !el.tablesMode && !el.autoReady && !el.resume && !el.off && !el.bad, JSON.stringify(el));
        check('receipt block shape', el.block && /^https:\/\/rakeenapp\.com\/p\/[A-Za-z0-9_-]{22}$/.test(el.block.url) && el.block.tag === 'طلب 77' && el.block.wifi === 'Cafe-5G', JSON.stringify(el.block));
        check('offline receipt block still prints (no number yet)', el.blockOffline && el.blockOffline.tag === 'بيجر طلبك');
        check('receipt switch off → no block', el.noReceipt === null);

        // بعد الدفع: يدخل «جارية» ويطلب الشاشة بالمدة المختارة.
        const after = await p.evaluate(async () => {
          window.__calls = []; ACTIVE_PAGER_ORDERS = [];
          PAGER_SETTINGS.display_secs = 90;
          rkPagerAfterCheckout({ client_order_uuid: crypto.randomUUID(), channel: 'pickup', orderId: 555, total: 30, customer_name: 'سارة' });
          await new Promise(r => setTimeout(r, 100));
          const shown = window.__calls.find(c => c.url === '/api/pos/show-pager');
          const row = ACTIVE_PAGER_ORDERS.find(o => o.id === 555);
          window.__calls = [];
          rkPagerHideOnNextOrder(); await new Promise(r => setTimeout(r, 100));
          const hid = window.__calls.find(c => c.url === '/api/pos/show-pager');
          window.__calls = [];
          rkPagerHideOnNextOrder(); await new Promise(r => setTimeout(r, 100));
          return { shown, row: row && { mine: row.mine, eta: Math.round((row.etaAt - row.createdAt) / 60000) }, hid, again: window.__calls.length };
        });
        if (!after.shown) console.log('DEBUG', JSON.stringify(after), await p.evaluate(() => JSON.stringify({ en: PAGER_ENABLED, s: PAGER_SETTINGS, on: navigator.onLine })));
        check('checkout → display with secs', after.shown && after.shown.body.secs === 90 && after.shown.body.number === 555, JSON.stringify(after.shown));
        check('checkout → row in جارية, mine, eta=prep+buffer', after.row && after.row.mine && after.row.eta === 15, JSON.stringify(after.row));
        check('next order hides display once', after.hid && after.hid.body.hide === true && after.again === 0);

        // الأزرار: نفس المسار، والنتيجة تنعكس على البطاقة.
        const acts = await p.evaluate(async () => {
          const now = Date.now();
          ACTIVE_PAGER_ORDERS = [
            { id: 100, channel: 'pickup', createdAt: new Date(now - 4 * 60000), etaAt: new Date(now + 11 * 60000), readyAt: null, ringCount: 0, seenAt: null },
            { id: 101, channel: 'dine_in', createdAt: new Date(now - 4 * 60000), etaAt: new Date(now + 11 * 60000), readyAt: null, ringCount: 0, seenAt: null },
          ];
          window.__calls = []; window.__toasts = [];
          await rkPagerAction(100, 'delay', { minutes: 5 });
          await rkPagerAction(101, 'ready');
          await rkPagerAction(100, 'ready');
          await rkPagerAction(101, 'collected');
          return { calls: window.__calls.map(c => c.body), toasts: window.__toasts, left: ACTIVE_PAGER_ORDERS.map(o => ({ id: o.id, ready: !!o.readyAt, delayed: !!o.delayedAt, mine: !!o.mine })), self: [...selfMarkedReadyOrderIds] };
        });
        check('actions post exact bodies', JSON.stringify(acts.calls) === JSON.stringify([{ orderId: 100, action: 'delay', minutes: 5 }, { orderId: 101, action: 'ready', minutes: 5 }, { orderId: 100, action: 'ready', minutes: 5 }, { orderId: 101, action: 'collected', minutes: 5 }]), JSON.stringify(acts.calls));
        check('toast: reached customer vs call by number', /رنّ جوال الزبون — طلب #101/.test(acts.toasts[1]) && /ما فتح البيجر، ناده برقمه/.test(acts.toasts[2]), acts.toasts.join(' | '));
        check('delay toast', /أضفنا 5 دقايق/.test(acts.toasts[0]));
        check('collected removes; ready marks mine', JSON.stringify(acts.left) === JSON.stringify([{ id: 100, ready: true, delayed: true, mine: true }]), JSON.stringify(acts.left));
        check('self-marked suppresses own alert', acts.self.includes(100) && acts.self.includes(101));

        // خطأ من الخادم يظهر كما هو، والقائمة لا تتغيّر.
        const err = await p.evaluate(async () => {
          const f = window.fetch; window.fetch = async () => ({ ok: false, json: async () => ({ error: 'هذا الحساب ما عنده صلاحية الكاشير' }) });
          window.__toasts = [];
          const ok = await rkPagerAction(100, 'ring');
          window.fetch = async () => { throw new TypeError('Failed to fetch'); };
          const ok2 = await rkPagerAction(100, 'ring');
          window.fetch = f;
          return { ok, ok2, t: window.__toasts, n: ACTIVE_PAGER_ORDERS.length };
        });
        check('server error surfaced verbatim', !err.ok && err.t[0] === 'هذا الحساب ما عنده صلاحية الكاشير', err.t[0]);
        check('network error → friendly message', !err.ok2 && /تأكد من النت/.test(err.t[1]), err.t[1]);

        // المؤقّت: رنّة تذكير وإقفال لطلب هذا الجهاز فقط، وتنبيه تأخير مرّة.
        const auto = await p.evaluate(async () => {
          const now = Date.now();
          PAGER_SETTINGS.remind_min = 3; PAGER_SETTINGS.close_min = 20; PAGER_SETTINGS.late_alert = true;
          ACTIVE_PAGER_ORDERS = [
            { id: 200, channel: 'pickup', createdAt: new Date(now - 30 * 60000), etaAt: new Date(now - 10 * 60000), readyAt: new Date(now - 4 * 60000), ringCount: 0, mine: true },
            { id: 201, channel: 'pickup', createdAt: new Date(now - 30 * 60000), etaAt: new Date(now - 10 * 60000), readyAt: new Date(now - 25 * 60000), ringCount: 1, mine: true },
            { id: 202, channel: 'pickup', createdAt: new Date(now - 30 * 60000), etaAt: new Date(now - 10 * 60000), readyAt: new Date(now - 25 * 60000), ringCount: 0, mine: false },
            { id: 203, channel: 'pickup', createdAt: new Date(now - 30 * 60000), etaAt: new Date(now - 60000), readyAt: null, ringCount: 0 },
          ];
          window.__calls = []; window.__toasts = [];
          await new Promise(r => setTimeout(r, 5600));
          const first = window.__calls.filter(c => c.body).map(c => c.body.orderId + ':' + c.body.action).sort();
          const sounds = window.__calls.filter(c => c.sound).length;
          window.__calls = [];
          await new Promise(r => setTimeout(r, 5200));
          return { first, sounds, second: window.__calls.filter(c => c.body).length, toasts: window.__toasts };
        });
        check('auto: ring 200, close 201, never touch 202', JSON.stringify(auto.first) === JSON.stringify(['200:ring', '201:collected']), JSON.stringify(auto.first));
        check('auto: late alert once with sound', auto.sounds === 1 && auto.toasts.filter(t => /203 تأخر/.test(t)).length === 1, JSON.stringify(auto.toasts));
        check('auto: nothing repeats next tick', auto.second === 0, auto.second);
      }

      // ---- البطاقات في «جارية» ----
      await p.evaluate(() => {
        const now = Date.now();
        PAGER_ENABLED = true; PAGER_SETTINGS = rkPagerSettings({ prep_min: 10, buffer_min: 5, remind_min: 0, close_min: 0, late_alert: false });
        ACTIVE_PAGER_ORDERS = [
          { id: 48213, channel: 'pickup', customerName: 'محمد عبدالرحمن الشمري', createdAt: new Date(now - 3 * 60000), etaAt: new Date(now + 12 * 60000), readyAt: null, ringCount: 0, seenAt: new Date() },
          { id: 1234567, channel: 'dine_in', customerName: '', createdAt: new Date(now - 12 * 60000), etaAt: new Date(now + 3 * 60000), readyAt: null, ringCount: 0, seenAt: null, delayedAt: new Date() },
          { id: 77, channel: 'pickup', customerName: 'سارة', createdAt: new Date(now - 20 * 60000), etaAt: new Date(now - 5 * 60000), readyAt: null, ringCount: 0, seenAt: null },
          { id: 501, channel: 'pickup', customerName: 'فهد', createdAt: new Date(now - 20 * 60000), etaAt: new Date(now - 5 * 60000), readyAt: new Date(now - 95000), ringCount: 1, seenAt: new Date() },
        ];
        renderOrdersList();
      });
      const g = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.pager-card')];
        const vw = innerWidth;
        const off = [], small = [], trunc = [];
        cards.forEach(c => c.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          const cr = c.getBoundingClientRect();
          if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1)) off.push(el.className);
        }));
        document.querySelectorAll('.pager-btn').forEach(b => { const r = b.getBoundingClientRect(); if (r.height < 36) small.push(b.textContent); if (b.scrollWidth > b.clientWidth + 1) trunc.push(b.textContent); });
        document.querySelectorAll('.pager-num, .pager-time').forEach(e => { if (e.scrollWidth > e.clientWidth + 1) trunc.push(e.textContent); });
        return {
          n: cards.length, order: cards.map(c => c.dataset.order),
          cls: cards.map(c => c.className.replace('dorder-card pager-card', '').trim()),
          scrollW: document.documentElement.scrollWidth, vw, off, small, trunc,
          numColor: getComputedStyle(document.querySelector('.pager-num')).color,
          bg: getComputedStyle(cards[0]).backgroundImage,
        };
      });
      check(tag + ' 4 cards, sorted by promise then ready', g.n === 4 && JSON.stringify(g.order) === JSON.stringify(['77', '1234567', '48213', '501']), JSON.stringify(g.order));
      check(tag + ' states: urgent/warn/ok/ready', JSON.stringify(g.cls) === JSON.stringify(['urgent', 'warn', '', 'ready']), JSON.stringify(g.cls));
      check(tag + ' no page scroll', g.scrollW <= g.vw + 1, g.scrollW);
      check(tag + ' content inside card', g.off.length === 0, g.off.slice(0, 3).join(','));
      check(tag + ' buttons ≥36px', g.small.length === 0, g.small.join(','));
      check(tag + ' nothing truncated', g.trunc.length === 0, g.trunc.join(','));
      if (SHOTS && [1366, 414].includes(w)) await p.screenshot({ path: path.join(OUT, `pos-${theme}-${w}.png`) });
      check(tag + ' no JS errors', errs.length === 0, errs[0]);
      await ctx.close();
    }
    process.stdout.write(`${theme}: ${pass} pass, ${fail} fail\n`);
  }
  await br.close();
  console.log(`\nCHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
