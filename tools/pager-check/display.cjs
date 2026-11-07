// فحص بطاقة بيجر الطلب على شاشة العميل (/display/<slug>) -- وحدها، وبجانب الولاء.
//   node tools/pager-check/display.cjs     (BASE=http://localhost:3010 SLUG=anoob SHOTS=1)
const path = require('path');
const fs = require('fs');
const R = path.resolve(__dirname, '..', '..');
const { chromium } = require(R + '/node_modules/playwright-core');

const BASE = process.env.BASE || 'http://localhost:3010';
const SLUG = process.env.SLUG || 'anoob';
const SHOTS = !!process.env.SHOTS;
const OUT = path.join(__dirname, 'shots');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const URL = 'https://rakeenapp.com/p/q7Xb2LmN9pRsT4vWx8YzAa';
const SIZES = [[1024, 600], [1280, 800], [1920, 1080], [1366, 768], [800, 1280], [768, 1024], [600, 1024], [414, 896], [375, 667]];
const BRANDS = [
  null,
  { brand: '#FF4A12', ink: '#FFFFFF', surf: '#4A1106', card: '#5C1C0D', text: '#FFE9DF', muted: '#D98A6C' },
  { brand: '#7ADC69', ink: '#10240C', surf: '#FFFFFF', card: '#FFFFFF', text: '#18170F', muted: '#6b6b6b' },
];

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, info) { if (ok) pass++; else { fail++; fails.push(name + (info ? ' — ' + info : '')); } }

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [bi, brand] of BRANDS.entries()) {
    for (const [w, h] of SIZES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => { if (!/React requires eval/.test(e.message)) errs.push(e.message); });
      await p.route(/supabase\.co\/realtime/, r => r.abort());
      await p.goto(`${BASE}/display/${SLUG}`, { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => !!window.rakeenDisplayPreview, null, { timeout: 30000 });
      await p.evaluate((br) => {
        const st = document.createElement('style'); st.textContent = '#rkDispPairBox{display:none!important}'; document.head.appendChild(st);
        // !important: المتجر يحمّل ألوانه الحقيقية بعدنا ويكتبها على <html>.
        if (br) { const t = document.createElement('style');
          t.textContent = `:root{--brand:${br.brand}!important;--brand-ink:${br.ink}!important;--surf:${br.surf}!important;--card:${br.card}!important;--ink:${br.text}!important;--muted:${br.muted}!important}`;
          document.head.appendChild(t); }
      }, brand);
      const tag = `brand${bi} @${w}x${h}`;

      const measure = () => p.evaluate(() => {
        const ov = document.querySelector('.rk-disp-overlay:not(#rkDispPairBox)');
        const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; };
        const rect = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const imgs = [...document.querySelectorAll('.rk-disp-qr img')].filter(i => i.getBoundingClientRect().width > 0);
        const off = [];
        document.querySelectorAll('.rk-disp-overlay *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > innerWidth + 1 || r.left < -1)) off.push(el.className || el.id || el.tagName);
        });
        return {
          shown: !!ov && !ov.hidden, pager: vis('rkDispPager'), loyal: vis('rkDispLoyal'),
          pr: vis('rkDispPager') ? rect('rkDispPager') : null, lr: vis('rkDispLoyal') ? rect('rkDispLoyal') : null,
          num: (document.getElementById('rkDispPagerNum') || {}).textContent || '',
          qrOk: imgs.every(i => i.complete && i.naturalWidth > 0), qrN: imgs.length,
          qrMin: imgs.length ? Math.min(...imgs.map(i => i.getBoundingClientRect().width)) : 0,
          timer: (document.getElementById('rkDispPagerTimer') || {}).textContent || '',
          scrollW: document.documentElement.scrollWidth, off,
          bandBg: (() => { const e = document.querySelector('.rk-disp-pager-band'); return e ? getComputedStyle(e).backgroundColor : ''; })(),
        };
      });
      const settle = () => p.waitForFunction(() => [...document.querySelectorAll('.rk-disp-qr img')].every(i => !i.getBoundingClientRect().width || (i.complete && i.naturalWidth > 0)), null, { timeout: 15000 }).catch(() => {});

      // 1) البيجر وحده، ٦٠ ثانية.
      await p.evaluate((u) => window.rakeenDisplayPreview.showPager(u, 48213, 60), URL);
      await settle(); await p.waitForTimeout(300);
      let m = await measure();
      check(tag + ' pager: overlay shown', m.shown && m.pager && !m.loyal);
      check(tag + ' pager: number', m.num === '#48213', m.num);
      check(tag + ' pager: QR loaded', m.qrOk && m.qrN === 1, m.qrN);
      check(tag + ' pager: QR scannable size', m.qrMin >= 150, m.qrMin);
      check(tag + ' pager: inside viewport', m.pr && m.pr.l >= 0 && m.pr.r <= w + 1, JSON.stringify(m.pr));
      check(tag + ' pager: nothing off-screen', m.off.length === 0, m.off.slice(0, 3).join(','));
      check(tag + ' pager: timer counts', /^\d+ ثانية$/.test(m.timer), m.timer);
      if (brand) check(tag + ' pager: band uses brand color', m.bandBg.replace(/\s/g, '') === 'rgb(' + parseInt(brand.brand.slice(1, 3), 16) + ',' + parseInt(brand.brand.slice(3, 5), 16) + ',' + parseInt(brand.brand.slice(5, 7), 16) + ')', m.bandBg);
      if (SHOTS && bi && [1024, 1920, 800, 375].includes(w)) await p.screenshot({ path: path.join(OUT, `disp-b${bi}-pager-${w}.png`) });

      // 2) الكاشير ضغط «باركود الولاء»: يظهر بجانبه.
      await p.evaluate(() => window.rakeenDisplayPreview.show('https://rakeenapp.com/loyalty/join/x', 'بالعافية عليك — امسح وصير من خلّان المكان'));
      await settle(); await p.waitForTimeout(300);
      m = await measure();
      check(tag + ' both: two cards', m.shown && m.pager && m.loyal);
      check(tag + ' both: two QRs loaded', m.qrOk && m.qrN === 2, m.qrN);
      check(tag + ' both: QRs scannable', m.qrMin >= 150, m.qrMin);
      check(tag + ' both: no overlap', m.pr && m.lr && (m.pr.r <= m.lr.l + 1 || m.lr.r <= m.pr.l + 1 || m.pr.b <= m.lr.t + 1 || m.lr.b <= m.pr.t + 1));
      if (w > 760) check(tag + ' both: side by side', m.pr && m.lr && Math.abs(m.pr.t - m.lr.t) < 2 && m.pr.b > m.lr.t);
      check(tag + ' both: cards not crushed', m.pr && m.lr && (m.pr.b - m.pr.t) >= 300 && (m.lr.b - m.lr.t) >= 260, m.pr && m.lr && Math.round(m.pr.b - m.pr.t) + '/' + Math.round(m.lr.b - m.lr.t));
      check(tag + ' both: no horizontal scroll', m.scrollW <= w + 1, m.scrollW);
      check(tag + ' both: nothing off-screen', m.off.length === 0, m.off.slice(0, 3).join(','));
      if (SHOTS && bi && [1024, 1920, 800, 375].includes(w)) await p.screenshot({ path: path.join(OUT, `disp-b${bi}-both-${w}.png`) });

      // 3) الطلب التالي بدأ: البيجر ينزل والولاء يبقى.
      await p.evaluate(() => window.rakeenDisplayPreview.hidePager());
      m = await measure();
      check(tag + ' hidePager keeps loyalty', m.shown && !m.pager && m.loyal);
      await p.evaluate(() => window.rakeenDisplayPreview.hide());
      m = await measure();
      check(tag + ' both hidden → overlay gone', !m.shown);

      // 4) «لين الطلب اللي بعده» (secs 0): لا عدّاد، ويبقى.
      await p.evaluate((u) => window.rakeenDisplayPreview.showPager(u, null, 0), URL);
      await p.waitForTimeout(1300);
      m = await measure();
      check(tag + ' secs0: stays, no timer, no number', m.shown && m.pager && m.timer === '' && m.num === '');
      // 5) مهلة قصيرة تنتهي وحدها.
      await p.evaluate((u) => window.rakeenDisplayPreview.showPager(u, 7, 2), URL);
      await p.waitForTimeout(3300);
      m = await measure();
      check(tag + ' secs2: auto-hides', !m.pager && !m.shown);
      check(tag + ' no JS errors', errs.length === 0, errs[0]);
      await ctx.close();
    }
    process.stdout.write(`brand${bi}: ${pass} pass, ${fail} fail\n`);
  }
  await b.close();
  console.log(`\nCHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
