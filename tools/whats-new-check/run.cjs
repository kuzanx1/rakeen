// يفتح اللوحة الحقيقية (localhost) بحساب وهمي كل طلباته تنرد محلياً —
// ما يوصل شي لـSupabase ولا ينكتب شي — ويتحقق من «جديد ركين»:
// البنر والزر والنقطة واللوحة الجانبية والإغلاق وزر «جرّبها» بأكثر من مقاس
// وبالوضعين الفاتح والداكن، ويحفظ لقطات.
//   node tools/whats-new-check/run.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = path.resolve(process.env.OUT || path.join(__dirname, 'shots'));
require('fs').mkdirSync(OUT, { recursive: true });
const now = Date.now();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'demo-user', role: 'authenticated', aud: 'authenticated', exp: Math.floor(now / 1000) + 86400, email: 'demo@example.com' }) + '.demo';
const user = { id: 'demo-user', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date(now - 864e5 * 90).toISOString() };
const session = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(now / 1000) + 86400, refresh_token: 'demo', user };
const BIZ = { id: 999, name: 'مطعم تجريبي', business_type: 'restaurant', allowed_features: ['pos', 'online_store', 'reports', 'inventory', 'loyalty', 'team_permissions'], plan_tier: 'sarh', online_subscribed: true, online_menu_slug: 'demo', online_ordering_enabled: true, online_theme_style: 'facade', online_occasion: {}, logo_url: null, is_active: true, created_at: new Date(now - 864e5 * 90).toISOString() };
function rows(table) {
  switch (table) {
    case 'profiles': return [{ id: 'demo-user', business_id: 999, branch_id: 99, full_name: 'صاحب المطعم', user_type: 'owner', role: 'owner' }];
    case 'businesses': return [BIZ];
    case 'branches': return [{ id: 99, business_id: 999, name: 'الفرع الرئيسي' }];
    default: return [];
  }
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
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    const r = rows(rest.split('/')[0]);
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, r.length - 1)}/${r.length}` }, body: JSON.stringify(single ? r[0] || null : r) });
  });
}
const NOISE = /eval\(\) is not supported|Internal Next\.js error|hasn.t mounted yet/;
let pass = 0, fail = 0; const fails = [];
const check = (where, name, ok, d) => { if (ok) pass++; else { fail++; fails.push(`${where}: ${name}${d ? ' — ' + d : ''}`); } };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  const sizes = [[360, 780, true], [390, 844, true], [430, 932, true], [768, 1024, true], [1024, 768, false], [1280, 800, false], [1440, 900, false], [1920, 1080, false]].filter(s => !only || only.includes(s[0]));
  for (const theme of ['light', 'dark']) for (const [w, h, touch] of sizes) {
    const where = `${theme} ${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch && w < 700, hasTouch: touch, deviceScaleFactor: 2 });
    await ctx.addInitScript(([s]) => {
      try {
        if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); sessionStorage.setItem('__seeded', '1'); }
        localStorage.setItem('sb-jgrlefclttoazamzvwca-auth-token', JSON.stringify(s));
      } catch (_) {}
      addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(st); });
    }, [session]);
    // اللوحة تحفظ الجلسة في كوكي (@supabase/ssr) باسم sb-rakeen-dashboard-auth
    await ctx.addCookies([{ name: 'sb-rakeen-dashboard-auth', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: BASE }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (process.env.DEBUG) console.log('PAGEERR', e.message.slice(0, 300)); if (!NOISE.test(e.message)) errs.push(e.message); }); if (process.env.DEBUG) page.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
    await mocks(page);
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.body.dataset.stage === 'dashboard', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForSelector('.rk-wn-hero', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      const hero = document.querySelector('.rk-wn-hero');
      const btn = document.querySelector('.rk-wn-btn');
      const notif = document.getElementById('topbarNotifBtn');
      const img = hero && hero.querySelector('.rk-wn-hero-art img');
      return {
        stage: document.body.dataset.stage, vw: innerWidth, sw: document.documentElement.scrollWidth,
        hero: R(hero), heroInHome: !!hero && document.getElementById('screen-home').contains(hero),
        btn: R(btn), notif: R(notif), dot: !!document.querySelector('.rk-wn-dot'),
        img: img ? { ...R(img), ok: img.complete && img.naturalWidth > 0, hidden: getComputedStyle(img.closest('.rk-wn-hero-art')).display === 'none' } : null,
        cta: !!document.querySelector('.rk-wn-hero .rk-wn-cta'),
        spill: [...(hero ? hero.querySelectorAll('*') : [])].filter(e => { const b = e.getBoundingClientRect(); const hb = hero.getBoundingClientRect(); return b.width && (b.left < hb.left - 1 || b.right > hb.right + 1) && !e.closest('.rk-wn-hero-art'); }).map(e => e.className.baseVal ?? e.className).slice(0, 3),
        topbarOverflow: (() => { const t = document.querySelector('.topbar'); return t ? t.scrollWidth - t.clientWidth : 0; })(),
      };
    });
    check(where, 'dashboard loaded', st.stage === 'dashboard', st.stage);
    check(where, 'hero shown on home', !!st.hero && st.heroInHome);
    check(where, 'hero fits screen', st.hero && st.hero.l >= -1 && st.hero.r <= st.vw + 1, JSON.stringify(st.hero));
    check(where, 'nothing spills out of hero', st.spill.length === 0, st.spill.join(','));
    check(where, 'no page sideways scroll', st.sw <= st.vw + 1, `${st.sw}/${st.vw}`);
    // في البطاقة المختصرة (≤١٠٢٤) الصورة مخفية عن قصد، فما تتحمّل.
    check(where, 'hero image loaded', st.img && (st.img.ok || st.img.hidden));
    check(where, 'CTA present', st.cta);
    check(where, 'topbar button ≥36px', !!st.btn && st.btn.w >= 36 && st.btn.h >= 36, JSON.stringify(st.btn));
    check(where, 'button next to notifications', st.btn && st.notif && Math.abs(st.btn.t - st.notif.t) < 2);
    check(where, 'unseen dot on', st.dot);
    check(where, 'topbar not overflowing', st.topbarOverflow <= 1, String(st.topbarOverflow));
    await page.screenshot({ path: `${OUT}/home-${theme}-${w}.png` });
    await page.click('.rk-wn-btn');
    await page.waitForTimeout(1200);
    const pn = await page.evaluate(() => {
      const p = document.querySelector('.rk-wn-panel'); const b = p && p.getBoundingClientRect();
      return { open: !!p, w: b && b.width, l: b && b.left, r: b && b.right, posts: document.querySelectorAll('.rk-wn-post').length, dot: !!document.querySelector('.rk-wn-dot'), imgs: [...document.querySelectorAll('.rk-wn-post-img')].filter(i => { const r = i.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).every(i => i.complete && i.naturalWidth) };
    });
    check(where, 'panel opens', pn.open);
    check(where, 'panel fits', pn.open && pn.l >= -1 && pn.r <= w + 1 && pn.w <= 481, JSON.stringify(pn));
    check(where, 'panel lists posts', pn.posts >= 1);
    check(where, 'panel images loaded', pn.imgs);
    check(where, 'opening panel clears dot', !pn.dot);
    await page.screenshot({ path: `${OUT}/panel-${theme}-${w}.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    check(where, 'Esc closes panel', !(await page.$('.rk-wn-panel')));
    if (w > 500) {
      await page.click('.rk-wn-btn'); await page.waitForTimeout(300);
      await page.mouse.click(w - 5, h / 2); await page.waitForTimeout(300);
      check(where, 'outside click closes panel', !(await page.$('.rk-wn-panel')));
    }
    if (st.cta) {
      await page.click('.rk-wn-hero .rk-wn-cta'); await page.waitForTimeout(1800);
      // زر البوست يفتح شاشته، أو نافذة الترقية لو الميزة مو ضمن باقة الحساب.
      const nav = await page.evaluate(() => ({ active: document.querySelector('.screen.active')?.id, upgrade: !!document.querySelector('.plan-upgrade-ov.show') }));
      check(where, 'CTA opens its screen (or the upgrade dialog)', nav.upgrade || nav.active !== 'screen-home', JSON.stringify(nav));
      await page.evaluate(() => document.querySelectorAll('.plan-upgrade-ov.show').forEach(o => o.classList.remove('show')));
      await page.evaluate(() => document.querySelector('.nav-item[data-screen="home"]')?.click()); await page.waitForTimeout(600);
    }
    // إغلاق البنر يخفي هذا البوست؛ لو فيه بوست أحدث من ٤٥ يوم ما انقفل، يطلع هو مكانه.
    const heroTitle = () => page.evaluate(() => document.querySelector('.rk-wn-hero .rk-wn-title')?.textContent || null);
    const closedTitle = await heroTitle();
    await page.click('.rk-wn-hero .rk-wn-x'); await page.waitForTimeout(300);
    check(where, 'hero closes', (await heroTitle()) !== closedTitle);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.stage === 'dashboard', null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    check(where, 'hero stays closed after reload', (await heroTitle()) !== closedTitle);
    check(where, 'button stays after reload', !!(await page.$('.rk-wn-btn')));
    check(where, 'no dot after seen', !(await page.$('.rk-wn-dot')));
    check(where, 'no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(`CHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  fails.forEach(f => console.log('  ' + f));
  process.exit(fail ? 1 : 0);
})();
