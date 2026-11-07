// مصفوفة اختبار العروض والمناسبات في المتجر قبل فتحها لكل المشتركين.
//
// يشغّل المتجر الحقيقي (localhost:3010/order/<slug>) بالـJS والـCSS
// الحقيقيين، ويعترض استعلامات store_offers و online_occasion والشكل
// فيردّ ببيانات اختبار. ما يكتب شي على القاعدة.
//
// كل تحميل: شكل × سيناريو (عروض + مناسبة) × نوع جهاز، ثم يتنقّل بين
// خمس مقاسات لنفس الجهاز ويتحقق من كل شي في كل مقاس، وبعدها يجرّب
// الأسهم والنقاط والسحب والتقليب التلقائي والضغط على العرض.
//
//   node tools/offers-occasions-matrix/run.cjs [--quick]
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:3010';
const QUICK = process.argv.includes('--quick');

const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY = 864e5;
const TODAY = dstr(new Date()), YDAY = dstr(new Date(Date.now() - DAY)), TMRW = dstr(new Date(Date.now() + DAY));
const iso = ms => new Date(Date.now() + ms).toISOString();

// أسعار الأصناف المربوطة (menu_items.online_price ?? price)
const PRICES = { 38: 79, 101: 32, 52: 39, 219: 39, 221: 15 };
const STORES = {
  anoob:   { linked: [38, 101, 52], img: ['https://media.rakeenapp.com/menu-item-images/1/101-1788053491911.jpg', 'https://media.rakeenapp.com/menu-item-images/1/52-1786205858433.jpeg'] },
  makboos: { linked: [219, 221],    img: ['https://makboos.rakeenapp.com/img/plate.png', 'https://makboos.rakeenapp.com/img/cup-cut.png'] },
};
const LONG_T = 'بوكس العايلة الكبير مع ورق عنب وسمبوسة ورولات وصوصات منوعة';           // ٦٠
const LONG_S = 'طبقات مكرونة ولحم وصوص بشميل طالع من الفرن، يكفي أربعة أشخاص ومعه سلطة خضراء وعصير طازج وحلى اليوم، والتوصيل مجاني فوق مية ريال لكل الأحياء'.slice(0, 140);
const XSS = '<img src=x onerror="window.__xss=1">';

let oid = 1000;
const off = o => Object.assign({ id: ++oid, title: 'عرض', subtitle: null, badge: null, image_url: null, menu_item_id: null, ends_at: null, sort_order: oid, price: null, compare_price: null }, o);

function offersFor(name, st) {
  const [l1, l2, l3] = st.linked;
  switch (name) {
    case 'none': return [];
    case 'single': return [off({ title: 'عرض الأسبوع', subtitle: 'خصم على الطبق', badge: 'جديد', image_url: st.img[0], menu_item_id: l1, compare_price: PRICES[l1] + 10 })];
    case 'real3': return [
      off({ title: 'الطبق الأول', subtitle: 'وصف قصير', badge: 'الأكثر طلباً', image_url: st.img[0], menu_item_id: l1 }),
      off({ title: 'الطبق الثاني', badge: 'جديد', image_url: st.img[1], menu_item_id: l2, compare_price: PRICES[l2] + 6 }),
      off({ title: 'زِد إضافات', subtitle: 'بريالين بس', badge: 'إضافات', price: 2, compare_price: 3, ends_at: iso(30 * 3600e3) }),
    ];
    case 'long6': return [
      off({ title: LONG_T, subtitle: LONG_S, badge: 'لفترة محدودة جداً جداً'.slice(0, 24), price: 120, compare_price: 150, ends_at: iso(50 * 60e3) }),
      off({ title: LONG_T, subtitle: LONG_S, price: 49.5, compare_price: 40 }),            // قبل < بعد: بدون شطب
      off({ title: 'سعر صفر', price: 0, compare_price: 20 }),                               // ما يطلع سعر
      off({ title: 'صنف مو موجود', menu_item_id: 99999999, price: 18, compare_price: 20 }), // مو مربوط فعلياً
      off({ title: 'عرض بخمسة أيام', badge: 'خصم', price: 9.99, compare_price: 1000, ends_at: iso(5 * DAY) }),
      off({ title: 'منتهي', price: 10, ends_at: iso(-60e3) }),                              // يختفي
    ];
    case 'nasty': return [
      off({ title: XSS, subtitle: `"quotes' & <b>bold</b>`, badge: '<script>window.__xss=2</script>', image_url: 'https://media.rakeenapp.com/does-not-exist-404.jpg', menu_item_id: l1 }),
      off({ title: 'English Offer Title That Is Rather Long Indeed', subtitle: 'Mixed عربي and English', image_url: st.img[1], price: 12.5 }),
      off({ title: 'بدون شي' }),
    ];
    case 'many': return Array.from({ length: 10 }, (_, i) => off({ title: 'عرض رقم ' + (i + 1), badge: i % 2 ? 'جديد' : null, image_url: i % 3 ? st.img[i % 2] : null, menu_item_id: i % 4 === 0 ? (l3 || l1) : null, price: i % 4 === 0 ? null : 10 + i, compare_price: i % 2 ? 30 : null }));
  }
}
function occFor(name) {
  const o = (x) => Object.assign({ enabled: true, preset: 'national', title: '', subtitle: '', image_url: '', starts_on: '', ends_on: '' }, x);
  switch (name) {
    case 'off': return {};
    case 'disabled': return o({ enabled: false, image_url: 'https://media.rakeenapp.com/occasion/demo/national-day-v2.jpg' });
    case 'image': return o({ image_url: 'https://media.rakeenapp.com/occasion/demo/national-day-v2.jpg', ends_on: TMRW });
    case 'national': case 'founding': case 'ramadan': case 'eid': return o({ preset: name });
    case 'custom': return o({ preset: 'custom', title: 'افتتاح فرعنا الجديد في حي النرجس والياسمين، حياكم الله كلكم', subtitle: 'خصم ٢٠٪ على كل الطلبات أول ثلاثة أيام من الافتتاح، لا تفوتكم' });
    case 'expired': return o({ image_url: 'https://media.rakeenapp.com/occasion/demo/national-day-v2.jpg', ends_on: YDAY });
    case 'future': return o({ preset: 'eid', starts_on: TMRW });
    case 'today': return o({ preset: 'ramadan', starts_on: TODAY, ends_on: TODAY });
    case 'badimg': return o({ preset: 'founding', image_url: 'http://insecure.example.com/x.jpg' });
    case 'junkpreset': return o({ preset: 'xyz', title: '' });
  }
}
const OCC_SHOWN = n => ['image', 'national', 'founding', 'ramadan', 'eid', 'custom', 'today', 'badimg', 'junkpreset'].includes(n);

// المتوقّع لكل بطاقة، من المواصفة (مو منسوخ من الكود)
function expectOffers(list, linkedIds) {
  return list.filter(o => !o.ends_at || new Date(o.ends_at).getTime() > Date.now()).map(o => {
    const linked = o.menu_item_id != null && linkedIds.includes(o.menu_item_id);
    const price = linked ? PRICES[o.menu_item_id] : o.price;
    const showPrice = price != null && price > 0;
    const showWas = showPrice && o.compare_price != null && o.compare_price > price;
    const pct = showWas ? Math.round((1 - price / o.compare_price) * 100) : 0;
    return { linked, price: showPrice ? price : null, was: showWas ? o.compare_price : null, pct: pct >= 1 ? pct : null };
  });
}

const SCEN = [
  ['real3', 'image'], ['none', 'off'], ['single', 'national'], ['long6', 'custom'], ['nasty', 'founding'],
  ['many', 'ramadan'], ['real3', 'eid'], ['real3', 'expired'], ['single', 'future'], ['long6', 'today'],
  ['none', 'image'], ['nasty', 'badimg'], ['many', 'disabled'], ['single', 'junkpreset'],
];
const STYLES = ['classic', 'luxury', 'folk', 'facade'];
const DEVICES = {
  mobile:  { touch: true,  sizes: [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932]] },
  desktop: { touch: false, sizes: [[768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]] },
};
const FACADE_OPTS = [{ heroSize: 'tall', showIdentity: true }, { heroSize: 'full', showIdentity: false, cutout: true }];

const jobs = [];
for (const slug of Object.keys(STORES)) for (const style of STYLES) SCEN.forEach(([o, c], si) => {
  for (const dev of Object.keys(DEVICES)) {
    if (QUICK && si > 2) continue;
    jobs.push({ slug, style, offers: o, occ: c, dev, display: si % 5 === 4, opts: style === 'facade' ? FACADE_OPTS[si % 2] : null });
  }
});

// ONLY=makboos/luxury/nasty+badimg يشغّل حالة وحدة (REPEAT=5 يكررها)
if (process.env.ONLY) {
  const keep = jobs.filter(j => `${j.slug}/${j.style}/${j.offers}+${j.occ}` === process.env.ONLY);
  jobs.length = 0;
  for (let k = 0; k < Number(process.env.REPEAT || 1); k++) jobs.push(...keep);
}
const results = { pass: 0, fail: 0, cases: 0, failures: [] };
function check(job, where, name, ok, detail) {
  results.cases++;
  if (ok) { results.pass++; return; }
  results.fail++;
  results.failures.push(`${job.slug}/${job.style}/${job.offers}+${job.occ}/${job.dev}${job.display ? '/display' : ''} @${where}: ${name}${detail ? ' — ' + detail : ''}`);
}

async function runJob(browser, job) {
  const st = STORES[job.slug];
  const offers = offersFor(job.offers, st);
  const exp = expectOffers(offers, st.linked);
  const D = DEVICES[job.dev];
  const ctx = await browser.newContext({ viewport: { width: D.sizes[0][0], height: D.sizes[0][1] }, deviceScaleFactor: 1, isMobile: D.touch, hasTouch: D.touch });
  if (job.display) await ctx.addInitScript(s => { try { localStorage.setItem('rakeen_order_display_mode_' + s, '1'); } catch (_) {} }, job.slug);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => { if (!/Internal Next.js error|hasn't mounted yet|eval\(\) is not supported/.test(e.message)) errs.push(e.message); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR|404|Internal Next.js error|hasn't mounted yet|eval\(\) is not supported/.test(m.text())) errs.push(m.text()); });
  await page.route(/rest\/v1\/businesses\?select=online_occasion/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ online_occasion: occFor(job.occ) }) }));
  await page.route(/rest\/v1\/businesses\?select=/, async r => {
    if (/online_occasion/.test(r.request().url())) return r.fallback();
    const res = await r.fetch(); let j = await res.json();
    const patch = o => { if (o && typeof o === 'object' && 'online_theme_style' in o) { o.online_theme_style = job.style; if (job.opts) o.online_theme_options = { facade: job.opts }; } return o; };
    j = Array.isArray(j) ? j.map(patch) : patch(j);
    r.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await page.route(/rest\/v1\/store_offers/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(offers) }));
  await page.goto(`${BASE}/order/${job.slug}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('.om-product, .om-card, [data-product]') || document.getElementById('omOffers'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const tag = `${job.dev}`;
  check(job, tag, 'shell style applied', await page.evaluate(s => document.getElementById('omShell')?.dataset.style === s || (s === 'classic' || s === 'luxury'), job.style));

  for (const [w, h] of D.sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const where = `${w}x${h}`;
    const r = await page.evaluate(() => {
      const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      const offEl = document.getElementById('omOffers'), occEl = document.getElementById('omOccasion');
      const cards = offEl && !offEl.hidden ? [...offEl.querySelectorAll('.om-offer')] : [];
      const track = document.getElementById('omOffersTrack');
      const nums = s => (s || '').replace(/[^\d.]+/g, ' ').trim();
      return {
        vw: window.innerWidth, sw: document.documentElement.scrollWidth, bodySw: document.body.scrollWidth,
        xss: window.__xss || 0, injected: !!document.querySelector('#omOffers img[src="x"], #omOffers script, #omOffers b'),
        offersHidden: !offEl || offEl.hidden, nCards: cards.length,
        track: track ? R(track) : null, trackOverflowY: track ? track.scrollHeight - track.clientHeight : 0,
        cards: cards.map(c => {
          const pick = s => { const e = c.querySelector(s); return e ? { ...R(e), sw: e.scrollWidth, cw: e.clientWidth, txt: e.textContent.replace(/\s+/g, ' ').trim(), fs: parseFloat(getComputedStyle(e).fontSize), vis: getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' } : null; };
          return {
            box: R(c), linked: c.classList.contains('linked'), tag: c.tagName,
            name: pick('.om-offer-name'), sub: pick('.om-offer-sub'), badge: pick('.om-offer-badge'), cta: pick('.om-offer-cta'), ends: pick('.om-offer-ends'),
            now: pick('.om-offer-now'), was: pick('.om-offer-was'), offp: pick('.om-offer-off'),
            nowN: nums(c.querySelector('.om-offer-now')?.textContent), wasN: nums(c.querySelector('.om-offer-was')?.textContent), offN: nums(c.querySelector('.om-offer-off')?.textContent),
          };
        }),
        arrows: [...document.querySelectorAll('.om-offers-arrow')].map(R),
        dots: document.querySelectorAll('#omOffersDots > span').length,
        dotsOn: [...document.querySelectorAll('#omOffersDots > span')].findIndex(d => d.classList.contains('on')),
        occHidden: !occEl || occEl.hidden, occ: occEl && !occEl.hidden ? R(occEl) : null,
        occArt: (() => { const i = occEl && occEl.querySelector('.om-occ-art img'); return i ? { ...R(i), nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete, fit: getComputedStyle(i).objectFit } : null; })(),
        occBand: !!(occEl && occEl.querySelector('.om-occ-band')),
        occTexts: occEl ? [...occEl.querySelectorAll('.om-occ-kicker,.om-occ-title,.om-occ-sub')].map(e => ({ ...R(e), fs: parseFloat(getComputedStyle(e).fontSize), sw: e.scrollWidth, cw: e.clientWidth, color: getComputedStyle(e).color })) : [],
        occBg: occEl ? getComputedStyle(occEl.querySelector('.om-occ-band') || occEl).backgroundColor + '|' + getComputedStyle(occEl.querySelector('.om-occ-band') || occEl).backgroundImage.slice(0, 40) : '',
        occPreset: occEl ? occEl.getAttribute('data-preset') : null,
        hero: (() => { const e = document.querySelector('.om-hero-banner, .om-hero'); return e ? R(e) : null; })(),
      };
    });

    check(job, where, 'no horizontal page scroll', r.sw <= r.vw + 1 && r.bodySw <= r.vw + 1, `scrollWidth ${r.sw}/${r.bodySw} > ${r.vw}`);
    check(job, where, 'no script injection', !r.xss && !r.injected);
    check(job, where, 'offers visibility', exp.length ? !r.offersHidden : r.offersHidden, `expected ${exp.length}, hidden=${r.offersHidden}`);
    check(job, where, 'offer card count', r.nCards === exp.length, `${r.nCards} vs ${exp.length}`);
    if (exp.length > 1) {
      check(job, where, 'two arrows', r.arrows.length === 2, String(r.arrows.length));
      check(job, where, 'arrow tap size ≥32px', r.arrows.every(a => a.w >= 32 && a.h >= 32), JSON.stringify(r.arrows.map(a => [a.w, a.h])));
      check(job, where, 'arrows on screen', r.arrows.every(a => a.l >= 0 && a.r <= r.vw + 0.5));
      check(job, where, 'dot per card', r.dots === exp.length, `${r.dots}`);
    } else {
      check(job, where, 'no nav for 0/1 offers', r.arrows.length === 0 && r.dots === 0);
    }
    if (r.track) check(job, where, 'track no vertical clip', r.trackOverflowY <= 2, `overflowY ${r.trackOverflowY}`);
    r.cards.forEach((c, i) => {
      const e = exp[i] || {};
      const inCard = (x, label) => { if (!x || !x.vis) return; check(job, where, `card${i} ${label} inside card`, x.l >= c.box.l - 1 && x.r <= c.box.r + 1 && x.t >= c.box.t - 1 && x.b <= c.box.b + 1, JSON.stringify([x.l, x.r, x.t, x.b, c.box.l, c.box.r, c.box.t, c.box.b].map(Math.round))); };
      ['name', 'sub', 'badge', 'cta', 'ends', 'now'].forEach(k => inCard(c[k], k));
      if (c.name) check(job, where, `card${i} name no sideways overflow`, c.name.sw <= c.name.cw + 2, `${c.name.sw}>${c.name.cw}`);
      if (c.name) check(job, where, `card${i} name legible`, c.name.fs >= 13, String(c.name.fs));
      if (c.badge) check(job, where, `card${i} badge one line`, c.badge.h <= c.badge.fs * 1.6 + 16, `${c.badge.h}`);
      check(job, where, `card${i} width sane`, c.box.w >= Math.min(220, r.vw * 0.6) && c.box.w <= Math.max(r.vw, 1) , String(Math.round(c.box.w)));
      // البطاقة الحالية (النقطة المضيئة) كاملة في الشاشة — التقليب التلقائي يحرّك الشريط أثناء الفحص
      if (i === Math.max(0, r.dotsOn)) check(job, where, 'current card fully on screen', c.box.r <= r.vw + 1 && c.box.l >= -1, `${Math.round(c.box.l)}..${Math.round(c.box.r)} / ${r.vw}`);
      check(job, where, `card${i} linked state`, c.linked === !!e.linked && (c.tag === 'BUTTON') === !!e.linked);
      check(job, where, `card${i} price`, e.price == null ? !c.now : (c.now && Number(c.nowN) === e.price), `${c.nowN} vs ${e.price}`);
      check(job, where, `card${i} was-price`, e.was == null ? !c.was : (c.was && Number(c.wasN) === e.was), `${c.wasN} vs ${e.was}`);
      check(job, where, `card${i} discount %`, e.pct == null ? !c.offp : (c.offp && Number(c.offN) === e.pct), `${c.offN} vs ${e.pct}`);
      if (job.display) check(job, where, `card${i} no order CTA in display mode`, !c.cta);
      else if (e.linked) check(job, where, `card${i} CTA on linked`, !!c.cta);
    });
    const occShown = OCC_SHOWN(job.occ);
    check(job, where, 'occasion visibility', occShown ? !r.occHidden : r.occHidden, `hidden=${r.occHidden}`);
    if (occShown && r.occ) {
      check(job, where, 'occasion within screen width', r.occ.l >= -1 && r.occ.r <= r.vw + 1, `${Math.round(r.occ.l)}..${Math.round(r.occ.r)}`);
      check(job, where, 'occasion has height', r.occ.h >= 40, String(r.occ.h));
      if (job.occ === 'image') {
        check(job, where, 'occasion image loaded', r.occArt && r.occArt.complete && r.occArt.nw > 0, JSON.stringify(r.occArt));
        if (r.occArt && r.occArt.nw) {
          const ar = r.occArt.w / r.occArt.h, nar = r.occArt.nw / r.occArt.nh;
          check(job, where, 'occasion image not cropped/stretched', Math.abs(ar - nar) / nar < 0.04 || r.occArt.fit === 'contain', `${ar.toFixed(2)} vs ${nar.toFixed(2)} fit=${r.occArt.fit}`);
        }
      } else {
        check(job, where, 'occasion drawn band (no image)', r.occBand && !r.occArt);
        check(job, where, 'occasion has background', !/rgba\(0, 0, 0, 0\)\|none/.test(r.occBg), r.occBg);
        r.occTexts.forEach((t, k) => {
          check(job, where, `occasion text${k} inside band`, t.l >= r.occ.l - 1 && t.r <= r.occ.r + 1 && t.t >= r.occ.t - 1 && t.b <= r.occ.b + 1, JSON.stringify([t.l, t.r, t.t, t.b].map(Math.round)));
          check(job, where, `occasion text${k} no sideways overflow`, t.sw <= t.cw + 2, `${t.sw}>${t.cw}`);
          check(job, where, `occasion text${k} legible`, t.fs >= 11, String(t.fs));
        });
        check(job, where, 'occasion preset key', r.occPreset === (['national', 'founding', 'ramadan', 'eid', 'custom'].includes(occFor(job.occ).preset) ? occFor(job.occ).preset : 'custom'), r.occPreset);
      }
      if (r.track) check(job, where, 'occasion & offers do not overlap', r.occ.b <= r.track.t + 1 || r.track.b <= r.occ.t + 1);
    }
  }

  // ---------- التفاعل ----------
  const W = D.sizes[2];
  await page.setViewportSize({ width: W[0], height: W[1] });
  await page.waitForTimeout(300);
  if (exp.length >= 3) {
    await page.evaluate(() => { const t = document.getElementById('omOffers'); t.scrollIntoView({ block: 'center' }); });
    await page.mouse.move(2, 2);
    const dot = () => page.evaluate(() => [...document.querySelectorAll('#omOffersDots > span')].findIndex(d => d.classList.contains('on')));
    // ينتظر لين يوقف الشريط فعلاً (التمرير الناعم لعشر بطاقات ياخذ أكثر من ثانية)
    const settle = async () => { await page.waitForTimeout(250); let last = null; for (let k = 0; k < 40; k++) { const v = await page.evaluate(() => document.getElementById('omOffersTrack').scrollLeft); if (v === last) break; last = v; await page.waitForTimeout(150); } await page.waitForTimeout(700); };
    // التقليب التلقائي (أول شي، قبل أي لمسة)
    if (job.offers === 'real3' || job.offers === 'many') {
      const before = await dot();
      await page.waitForTimeout(5800);
      const after = await dot();
      check(job, 'interact', 'autoplay advances by itself', after !== before, `${before}→${after}`);
      await page.waitForTimeout(6500); // ينتظر يرجع لوضعه بعد ما يتقلّب مرة ثانية؟ نرجع للأول بالنقطة
    }
    await page.click('#omOffersDots > span:nth-child(1)'); await settle();
    check(job, 'interact', 'dot 1 → card 1', await dot() === 0);
    await page.click('.om-offers-arrow[data-dir="next"]'); await settle();
    check(job, 'interact', 'next arrow → card 2', await dot() === 1, String(await dot()));
    await page.click('.om-offers-arrow[data-dir="next"]'); await settle();
    check(job, 'interact', 'next again → card 3', await dot() === 2, String(await dot()));
    await page.click('.om-offers-arrow[data-dir="prev"]'); await settle();
    check(job, 'interact', 'prev arrow → card 2', await dot() === 1, String(await dot()));
    await page.click('#omOffersDots > span:nth-child(1)'); await settle();
    await page.click('.om-offers-arrow[data-dir="prev"]'); await settle();
    check(job, 'interact', 'prev from first wraps to last', await dot() === exp.length - 1, String(await dot()));
    await page.click('.om-offers-arrow[data-dir="next"]'); await settle();
    check(job, 'interact', 'next from last wraps to first', await dot() === 0, String(await dot()));
    await page.click(`#omOffersDots > span:nth-child(${Math.min(3, exp.length)})`); await settle();
    check(job, 'interact', 'dot 3 → card 3', await dot() === Math.min(3, exp.length) - 1);
    await page.click('#omOffersDots > span:nth-child(1)'); await settle();
    check(job, 'interact', 'page did not jump sideways', await page.evaluate(() => window.scrollX === 0));
    const sheetOpen = () => page.evaluate(() => !!document.querySelector('.om-sheet-overlay.show, #omModifierOverlay.show, .om-toast.show, #omToast.show, [id$="Overlay"].show'));
    if (!D.touch) {
      // سحب بالماوس: يحرّك الشريط ولا يفتح الصنف
      const tb = await page.evaluate(() => { const b = document.getElementById('omOffersTrack').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      const y0 = await page.evaluate(() => window.scrollY);
      await page.mouse.move(tb.x, tb.y); await page.mouse.down();
      for (let k = 1; k <= 12; k++) await page.mouse.move(tb.x + k * 18, tb.y);
      await page.mouse.up(); await settle();
      const moved = await dot();
      check(job, 'interact', 'mouse drag moves to another card', moved !== 0, String(moved));
      check(job, 'interact', 'drag does not open product', !(await sheetOpen()));
      check(job, 'interact', 'drag does not scroll page vertically', Math.abs((await page.evaluate(() => window.scrollY)) - y0) < 4);
      await page.mouse.move(2, 2);
    } else {
      // سحب باللمس: تمرير أفقي حقيقي
      const tb = await page.evaluate(() => { const t = document.getElementById('omOffersTrack'); const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tb.x, y: tb.y }] });
      for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tb.x + k * 20, y: tb.y }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1200);
      check(job, 'interact', 'touch swipe moves to another card', (await dot()) !== 0, String(await dot()));
      check(job, 'interact', 'swipe does not open product', !(await sheetOpen()));
    }
  }
  if (exp.length >= 1 && exp[0].linked) {
    await page.click('#omOffersDots > span:nth-child(1)').catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('.om-offer.linked')?.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.click('.om-offer.linked');
    await page.waitForTimeout(900);
    check(job, 'interact', 'tap linked offer opens/adds product', await page.evaluate(() => !!document.querySelector('[id$="Overlay"].show, .om-toast.show, #omToast.show, .show')), '');
  }
  check(job, 'all', 'no JS errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const N = Number(process.env.WORKERS || 6);
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: N }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await runJob(browser, job); } catch (e) { check(job, 'run', 'job crashed', false, e.message.split('\n')[0]); }
      done++;
      if (done % 20 === 0) console.log(`${done}/${jobs.length} loads, ${results.cases} checks, ${results.fail} failed, ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }));
  await browser.close();
  console.log(`\nLOADS ${jobs.length} | CHECKS ${results.cases} | PASS ${results.pass} | FAIL ${results.fail}`);
  const grouped = {};
  results.failures.forEach(f => { const k = f.replace(/^[^@]*@[^:]*: /, '').replace(/ — .*/, ''); (grouped[k] ||= []).push(f); });
  Object.entries(grouped).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => { console.log(`\n[${v.length}] ${k}`); v.slice(0, 4).forEach(x => console.log('   ' + x)); });
  process.exit(results.fail ? 1 : 0);
})();
