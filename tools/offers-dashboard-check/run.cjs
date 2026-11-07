// العروض والمناسبات من جهة اللوحة، بحساب عادي (مو من التجريبيين ١ و١١٤).
// اللوحة الحقيقية على localhost وكل طلبات Supabase تنرد محلياً وتنسجّل —
// ما ينكتب شي على القاعدة. يتحقق إن القسمين يطلعون، وإن الإضافة والتعديل
// والإيقاف والحذف والمناسبة ترسل الصفوف الصح، بثلاث مقاسات.
//   node tools/offers-dashboard-check/run.cjs
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:3010';
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400 }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ_ID = 777;
const ITEMS = [{ id: 501, business_id: BIZ_ID, category_id: 1, name: 'برجر لحم', price: 28, active: true, sort_order: 0 }, { id: 502, business_id: BIZ_ID, category_id: 1, name: 'بطاطس', price: 9, active: true, sort_order: 1 }];

function makeState() {
  return {
    offers: [{ id: 11, business_id: BIZ_ID, title: 'عرض قديم', subtitle: null, badge: 'جديد', image_url: null, menu_item_id: null, active: true, sort_order: 0, ends_at: null, price: 20, compare_price: 25 }],
    occasion: {}, writes: [],
  };
}
async function mocks(page, S) {
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
    const method = req.method();
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const send = rows => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }, body: JSON.stringify(single ? rows[0] || null : rows) });
    if (method !== 'GET' && method !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch (_) {}
      S.writes.push({ table, method, url: decodeURIComponent(url), body });
      if (table === 'store_offers') {
        const idm = decodeURIComponent(url).match(/id=eq\.(\d+)/);
        if (method === 'POST') { const rows = Array.isArray(body) ? body : [body]; rows.forEach(r => S.offers.push(Object.assign({ id: 100 + S.offers.length, active: true }, r))); }
        if (method === 'PATCH' && idm) S.offers = S.offers.map(o => o.id === Number(idm[1]) ? Object.assign({}, o, body) : o);
        if (method === 'DELETE' && idm) S.offers = S.offers.filter(o => o.id !== Number(idm[1]));
      }
      if (table === 'businesses' && method === 'PATCH' && body && body.online_occasion) S.occasion = body.online_occasion;
      return route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(table === 'businesses' ? (single ? { id: BIZ_ID } : [{ id: BIZ_ID }]) : []) });
    }
    switch (table) {
      case 'profiles': return send([{ id: 'demo-user', business_id: BIZ_ID, branch_id: 99, full_name: 'صاحب المطعم', user_type: 'owner', role: 'owner' }]);
      case 'businesses': return send([{ id: BIZ_ID, name: 'مطعم الاختبار', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports'], plan_tier: 'emad', online_subscribed: true, online_menu_slug: 'test', online_ordering_enabled: true, online_theme_style: 'luxury', online_theme_options: {}, online_occasion: S.occasion, is_active: true }]);
      case 'branches': return send([{ id: 99, business_id: BIZ_ID, name: 'الفرع الرئيسي' }]);
      case 'menu_items': return send(ITEMS);
      case 'menu_categories': return send([{ id: 1, business_id: BIZ_ID, name: 'الرئيسية', sort_order: 0 }]);
      case 'store_offers': return send(S.offers.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));
      default: return send([]);
    }
  });
}
const NOISE = /eval\(\) is not supported|Internal Next\.js error|hasn.t mounted yet/;
let pass = 0, fail = 0; const fails = [];
const check = (where, name, ok, d) => { if (ok) pass++; else { fail++; fails.push(`${where}: ${name}${d ? ' — ' + d : ''}`); } };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [w, h] of [[390, 844], [768, 1024], [1366, 860]]) {
    const where = `${w}x${h}`;
    const S = makeState();
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 1000 });
    await ctx.addCookies([{ name: 'sb-rakeen-dashboard-auth', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: BASE }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (!NOISE.test(e.message)) errs.push(e.message); });
    await mocks(page, S);
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.body.dataset.stage === 'dashboard', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.querySelector('.nav-item[data-screen="onlineMenu"]')?.click(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('#onlineMenuTabs button[data-tab="design"]')?.click());
    await page.waitForSelector('#storeOffersSection .rk-offer-row', { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('#storeOccasionSection #occSaveBtn', { timeout: 15000 }).catch(() => {});
    check(where, 'offers section visible for non-beta account', !!(await page.$('#storeOffersSection')));
    check(where, 'occasion section visible for non-beta account', !!(await page.$('#occSaveBtn')));
    check(where, 'existing offer listed', (await page.$$('#storeOffersSection .rk-offer-row')).length === 1);
    check(where, 'no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    // إضافة عرض غير مربوط بسعر وخصم
    await page.click('#storeOfferAddBtn');
    await page.waitForSelector('#offTitle');
    check(where, 'price fields shown', !!(await page.$('#offPrice')) && !!(await page.$('#offWas')));
    check(where, 'modal fits screen', await page.evaluate(() => { const b = document.querySelector('.modal-card').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; }));
    await page.click('#offSave'); await page.waitForTimeout(300);
    check(where, 'empty title blocked', S.writes.filter(x => x.table === 'store_offers').length === 0);
    await page.fill('#offTitle', 'وجبة العائلة');
    await page.fill('#offBadge', 'خصم ٢٠٪');
    await page.fill('#offSub', 'تكفي أربعة');
    await page.fill('#offPrice', '79.999');
    await page.fill('#offWas', '99');
    await page.fill('#offEnds', '2030-01-31');
    await page.click('#offSave');
    await page.waitForFunction(() => !document.querySelector('#offTitle'), null, { timeout: 8000 }).catch(() => {});
    const ins = S.writes.find(x => x.table === 'store_offers' && x.method === 'POST');
    const r = ins && (Array.isArray(ins.body) ? ins.body[0] : ins.body);
    check(where, 'insert sent', !!r);
    if (r) {
      check(where, 'insert business_id', r.business_id === BIZ_ID, String(r.business_id));
      check(where, 'insert title/badge/sub', r.title === 'وجبة العائلة' && r.badge === 'خصم ٢٠٪' && r.subtitle === 'تكفي أربعة');
      check(where, 'insert price rounded', r.price === 80, String(r.price));
      check(where, 'insert compare_price', r.compare_price === 99, String(r.compare_price));
      check(where, 'insert ends end-of-day', r.ends_at && new Date(r.ends_at).getHours() === 23, r.ends_at);
      check(where, 'insert sort after existing', r.sort_order === 1, String(r.sort_order));
      check(where, 'insert unlinked', r.menu_item_id === null);
    }
    await page.waitForTimeout(500);
    check(where, 'list shows 2 offers', (await page.$$('#storeOffersSection .rk-offer-row')).length === 2);

    // تعديل: ربط بصنف → حقل السعر يختفي والسعر يتصفّر
    await page.locator('#storeOffersSection .rk-offer-row').first().locator('[data-act="edit"]').click();
    await page.waitForSelector('#offItem');
    await page.selectOption('#offItem', '501');
    check(where, 'linking hides price field', await page.evaluate(() => document.getElementById('offPriceWrap').style.display === 'none'));
    check(where, 'linked price note shows item price', /28/.test(await page.textContent('#offPriceNote')));
    await page.click('#offSave');
    await page.waitForFunction(() => !document.querySelector('#offTitle'), null, { timeout: 8000 }).catch(() => {});
    const up = S.writes.find(x => x.table === 'store_offers' && x.method === 'PATCH');
    check(where, 'update sent to right id', up && /id=eq\.11/.test(up.url), up && up.url);
    check(where, 'update linked + price null', up && up.body.menu_item_id === 501 && up.body.price === null, JSON.stringify(up && up.body));
    check(where, 'update keeps compare_price', up && up.body.compare_price === 25, JSON.stringify(up && up.body));

    // إيقاف
    await page.waitForTimeout(400);
    await page.click('#storeOffersSection .rk-offer-row [data-act="toggle"]');
    await page.waitForTimeout(600);
    const tg = S.writes.filter(x => x.table === 'store_offers' && x.method === 'PATCH').pop();
    check(where, 'toggle sends active:false', tg && tg.body && tg.body.active === false, JSON.stringify(tg && tg.body));

    // حذف: نافذة ركين (مو confirm المتصفح) ثم حذف
    let nativeDialog = false; page.once('dialog', d => { nativeDialog = true; d.dismiss(); });
    await page.locator('#storeOffersSection .rk-offer-row').last().locator('[data-act="delete"]').click();
    await page.waitForTimeout(500);
    check(where, 'delete uses rkAsk, not browser dialog', !nativeDialog);
    const okBtn = await page.$('button:has-text("احذف العرض")');
    check(where, 'rkAsk delete button named', !!okBtn);
    if (okBtn) await okBtn.click();
    await page.waitForTimeout(700);
    check(where, 'delete sent', S.writes.some(x => x.table === 'store_offers' && x.method === 'DELETE'));
    check(where, 'list shows 1 after delete', (await page.$$('#storeOffersSection .rk-offer-row')).length === 1);

    // المناسبة: تواريخ معكوسة تنرفض، ثم حفظ صحيح
    await page.click('#storeOccasionSection [data-occ-preset="ramadan"]');
    await page.waitForTimeout(200);
    await page.check('#occEnabled');
    await page.fill('#occFrom', '2030-03-10');
    await page.fill('#occTo', '2030-03-01');
    await page.click('#occSaveBtn'); await page.waitForTimeout(400);
    check(where, 'reversed dates rejected', !S.writes.some(x => x.table === 'businesses'));
    await page.fill('#occTo', '2030-04-09');
    await page.fill('#occTitle', 'رمضان كريم يا جماعة');
    await page.click('#occSaveBtn'); await page.waitForTimeout(1200);
    const oc = S.occasion;
    check(where, 'occasion saved', oc && oc.enabled === true && oc.preset === 'ramadan', JSON.stringify(oc));
    check(where, 'occasion dates', oc.starts_on === '2030-03-10' && oc.ends_on === '2030-04-09', JSON.stringify(oc));
    check(where, 'occasion title', oc.title === 'رمضان كريم يا جماعة');
    check(where, 'occasion fits 2KB check', Buffer.byteLength(JSON.stringify(oc)) < 1800);
    check(where, 'occasion preview drawn', !!(await page.$('#occPreview div, #occPreview img')));
    check(where, 'no sideways scroll after edits', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check(where, 'no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.screenshot({ path: require('path').resolve(__dirname, `shot-${w}.png`), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log(`CHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  fails.forEach(f => console.log('  ' + f));
  process.exit(fail ? 1 : 0);
})();
