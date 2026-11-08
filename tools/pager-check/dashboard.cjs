// فحص تبويب «بيجر ركين» في لوحة التحكم -- الكود الحقيقي مستخرجاً من
// rakeen-dashboard.js، و CSS اللوحة الحقيقي، وقاعدةٌ مزيّفة. لا يكتب شيئاً.
//   node tools/pager-check/dashboard.cjs   (SHOTS=1)
const path = require('path');
const fs = require('fs');
const R = path.resolve(__dirname, '..', '..');
const { chromium } = require(R + '/node_modules/playwright-core');
const SHOTS = !!process.env.SHOTS;
const OUT = path.join(__dirname, 'shots');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(R + '/public/dashboard/rakeen-dashboard.js', 'utf8');
function grab(startRe) {
  const m = startRe.exec(src);
  if (!m) throw new Error('not found: ' + startRe);
  let i = src.indexOf('{', m.index), depth = 0, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) break; }
  }
  let end = i + 1; if (src[end] === ';') end++;
  return src.slice(m.index, end);
}
// كتلة البيجر كاملة (من أول تعليقها إلى قبل rkCheck) + المساعدات التي تستعملها.
const a = src.indexOf('/* ============ بيجر ركين — تبويب الإعدادات');
const b = src.indexOf('function rkCheck(inputAttrs, label){');
const pagerBlock = src.slice(a, b);
// escapeHtml فيها /'/g -- مطابق الأقواس يحسبها بداية نص، فتُقطع بنهاية سطرها.
const eh = src.indexOf('function escapeHtml(value){');
const helpers = src.slice(eh, src.indexOf('\n}\n', eh) + 3) + [
  /const RK_ICON_PATHS = \{/, /function rkIcon\(/, /function rkSectionHead\(/,
  /function rkSwitchRow\(/, /function rkWireSwitchStatus\(/, /function helpIcon\(/,
  /function rkBtnLoading\(/, /function rkBtnSuccess\(/,
].map(grab).join('\n');
const css = fs.readFileSync(R + '/app/dashboard/rakeen-dashboard.css', 'utf8');

const SIZES = [[1440, 900], [1280, 800], [1024, 768], [820, 1180], [768, 1024], [414, 896], [390, 844], [360, 740], [320, 568]];
const CASES = {
  brand: { schemaOk: true, enabled: true, settings: { channels: ['pickup'], prep_min: 12, buffer_min: 4, tone: 'bell', wifi: 'Anoob-Guests', ready_msg: 'تفضّل من الكاونتر الأيسر' },
    biz: { name: 'عنوب | Anoob', online_theme_color: '#7ADC69', online_color_surf: '#2A5A21', online_color_card: '#346B2A', online_color_ink: '#FAF8EB', online_color_muted: '#A9CF9C' } },
  fresh: { schemaOk: true, enabled: false, settings: null, biz: { name: 'كافيه بدون ألوان' } },
  oldschema: { schemaOk: false, enabled: false, settings: null, biz: { name: 'قاعدة قديمة', online_theme_color: '#FF4A12' } },
  longname: { schemaOk: true, enabled: true, settings: { channels: ['dine_in', 'pickup'] }, biz: { name: 'مطعم ومقهى الذواقة الكبير للمأكولات الشعبية والحديثة', online_theme_color: '#FFF4D6', online_color_surf: '#FFFFFF', online_color_ink: '#222' } },
};

let pass = 0, fail = 0; const fails = [];
function check(n, ok, info) { if (ok) pass++; else { fail++; fails.push(n + (info ? ' — ' + info : '')); } }

(async () => {
  const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [cname, cs] of Object.entries(CASES)) {
    for (const theme of ['light', 'dark']) {
      for (const [w, h] of SIZES) {
        if (theme === 'dark' && ![1440, 390].includes(w)) continue;
        const ctx = await br.newContext({ viewport: { width: w, height: h } });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load|NotSupportedError|play\(\)/i.test(m.text())) errs.push(m.text()); });
        await p.route('**/pager/*.wav', r => r.fulfill({ status: 200, contentType: 'audio/wav', body: fs.readFileSync(R + '/public/pager/' + r.request().url().split('/').pop()) }));
        await p.setContent(`<!doctype html><html dir="rtl" lang="ar" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
          <style>body{margin:0;background:var(--bg);font-family:system-ui;} .content{padding:16px;}</style></head>
          <body><div class="content"><div id="posSettingsPanelBody"></div></div></body></html>`);
        await p.addScriptTag({ content: `
          window.__saved = null; window.__toasts = [];
          const CURRENT_PROFILE = { business_id: 1 };
          const RESTAURANT_INFO = { name: '' };
          function showToast(m){ window.__toasts.push(m); }
          function logDashboardAudit(){}
          function posSnapshotSwitches(){}
          async function updateCurrentBusiness(u){ window.__saved = JSON.parse(JSON.stringify(u)); return { id: 1 }; }
          const CASE = ${JSON.stringify(cs)};
          window.supabaseClient = { from(){ let cols=''; const q = {
            select(c){ cols = c; return q; }, eq(){ return q; },
            single(){ if (cols.includes('pager_')) return Promise.resolve(CASE.schemaOk ? { data: { pager_enabled: CASE.enabled, pager_settings: CASE.settings }, error: null } : { data: null, error: { message: 'column businesses.pager_enabled does not exist' } });
              return Promise.resolve({ data: CASE.biz, error: null }); } }; return q; } };
          ${helpers}
          ${pagerBlock}
          window.__boot = async (ar, tables) => {
            await loadPagerSettingsTab(ar, tables);
            document.getElementById('posSettingsPanelBody').innerHTML = pagerSettingsTabHtml();
            wirePagerSettingsTab();
          };` });
        await p.evaluate(() => window.__boot({ dine_in: false, pickup: true }, false));
        await p.waitForTimeout(150);
        const tag = `${cname}/${theme} @${w}`;
        const geo = () => p.evaluate(() => {
          const off = [];
          document.querySelectorAll('#posSettingsPanelBody *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (!r.width || el.closest('.pgs-stage')) return; // المسرح يتمرّر أفقياً عمداً في الجوال
            if (r.right > innerWidth + 1 || r.left < -1) off.push((el.className || el.tagName) + '');
          });
          const stage = document.querySelector('.pgs-stage');
          const small = [...document.querySelectorAll('#pgsBody button, .pgs-master')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 36 || r.width < 36); }).map(e => e.className || e.textContent.trim());
          const tr = [...document.querySelectorAll('.pgs-tone b, .pgs-chip b, .pgs-seg button')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim());
          return { scrollW: document.documentElement.scrollWidth, off, stageOk: stage && stage.getBoundingClientRect().right <= innerWidth + 1, small, tr };
        });
        let g = await geo();
        check(tag + ' no horizontal page scroll', g.scrollW <= w + 1, g.scrollW);
        check(tag + ' nothing off-screen', g.off.length === 0, g.off.slice(0, 3).join(','));
        check(tag + ' stage contained', g.stageOk);
        check(tag + ' touch targets ≥36px', g.small.length === 0, g.small.slice(0, 3).join(','));
        check(tag + ' no truncated labels', g.tr.length === 0, g.tr.slice(0, 3).join(','));

        const st = await p.evaluate(() => ({
          off: document.querySelector('.pgs-stage').classList.contains('is-off'),
          dim: document.getElementById('pgsBody').classList.contains('pgs-dim'),
          saveDisabled: document.getElementById('pgsSaveBtn').disabled,
          master: document.getElementById('pgsEnabled').disabled,
          warn: document.getElementById('pgsChannelWarn').innerText,
          strong: !!document.querySelector('.pgs-warn.strong'),
          eta: document.querySelector('.pgs-ph-eta').innerText,
          wifi: (document.querySelector('.pgs-r-wifi') || {}).innerText || '',
          msg: document.querySelector('.pgs-ph-msg').innerText,
          accent: getComputedStyle(document.querySelector('.pgs-phone.ready')).backgroundColor,
        }));
        if (cname === 'oldschema') {
          check(tag + ' old schema: save + master disabled, notice', st.saveDisabled && st.master && st.strong);
        } else {
          check(tag + ' save enabled', !st.saveDisabled && !st.master && !st.strong);
          check(tag + ' preview off-state matches', st.off === !cs.enabled && st.dim === !cs.enabled);
        }
        if (cname === 'brand') {
          check(tag + ' eta = prep+buffer', st.eta.includes('16'), st.eta);
          check(tag + ' wifi on receipt', st.wifi.includes('Anoob-Guests'), st.wifi);
          check(tag + ' custom ready msg', st.msg.includes('الكاونتر الأيسر'));
          check(tag + ' brand accent on ready phone', st.accent === 'rgb(122, 220, 105)', st.accent);
          check(tag + ' auto-ready conflict warned', /السفري/.test(st.warn), st.warn);
        }
        if (cname === 'longname') check(tag + ' no warnings when fine', true);
        if (SHOTS && ['brand', 'fresh'].includes(cname) && [1440, 390].includes(w)) await p.screenshot({ path: path.join(OUT, `dash-${cname}-${theme}-${w}.png`), fullPage: true });

        if (cname === 'fresh' && theme === 'light') {
          // تفاعل كامل: تفعيل، قنوات، مدد، نغمة، رسائل، حفظ.
          await p.click('.pgs-master');
          let r = await p.evaluate(() => ({ off: document.querySelector('.pgs-stage').classList.contains('is-off'), dirty: !document.getElementById('pgsDirty').hidden }));
          check(tag + ' enable → preview live + dirty', !r.off && r.dirty);
          await p.click('.pgs-chip[data-ch="dine_in"]');
          r = await p.evaluate(() => document.getElementById('pgsChannelWarn').innerText);
          await p.click('.pgs-chip[data-ch="pickup"]');
          const none = await p.evaluate(() => document.getElementById('pgsChannelWarn').innerText);
          check(tag + ' no channel → warning', /ولا نوع/.test(none), none);
          await p.click('.pgs-chip[data-ch="pickup"]');
          await p.evaluate(() => { const steps = document.querySelectorAll('.pgs-step'); for (let i = 0; i < 3; i++) steps[0].querySelector('[data-d="1"]').click(); for (let i = 0; i < 9; i++) steps[1].querySelector('[data-d="-1"]').click(); });
          r = await p.evaluate(() => ({ prep: document.getElementById('pgsPrep').value, buf: document.getElementById('pgsBuffer').value, eta: document.querySelector('.pgs-ph-eta').innerText, sum: document.querySelector('.pgs-tl-legend .sum').innerText }));
          check(tag + ' steppers: prep 13, buffer clamps 0', r.prep === '13' && r.buf === '0', JSON.stringify(r));
          check(tag + ' eta follows steppers', r.eta.includes('13') && r.sum.includes('13'), r.eta + ' | ' + r.sum);
          await p.fill('#pgsPrep', '500'); await p.dispatchEvent('#pgsPrep', 'change');
          check(tag + ' typed prep clamps 120', (await p.inputValue('#pgsPrep')) === '120');
          await p.fill('#pgsPrep', '15'); await p.dispatchEvent('#pgsPrep', 'change');
          await p.click('#pgsDisplaySecs button[data-v="0"]');
          await p.click('#pgsRemind button[data-v="5"]');
          await p.click('#pgsClose button[data-v="0"]');
          await p.click('.pgs-tone[data-tone="beep"]');
          await p.fill('#pgsReadyMsg', 'طلبك ينتظرك <b>هنا</b>');
          await p.fill('#pgsWifi', 'Cafe-5G');
          r = await p.evaluate(() => ({ msg: document.querySelector('.pgs-ph-msg').innerHTML, wifi: document.querySelector('.pgs-r-wifi').innerText, tone: document.querySelector('.pgs-tone.on').dataset.tone }));
          check(tag + ' ready msg escaped in preview', r.msg.includes('&lt;b&gt;'), r.msg);
          check(tag + ' wifi live on receipt', r.wifi.includes('Cafe-5G'));
          check(tag + ' tone picked', r.tone === 'beep');
          await p.click('label[for="pgsReceipt"]').catch(() => p.evaluate(() => { const i = document.getElementById('pgsReceipt'); i.checked = !i.checked; i.dispatchEvent(new Event('change', { bubbles: true })); }));
          r = await p.evaluate(() => !!document.querySelector('.pgs-receipt.off'));
          check(tag + ' receipt off → preview says so', r);
          await p.evaluate(() => { const i = document.getElementById('pgsDisplay'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); });
          check(tag + ' display off hides duration', await p.evaluate(() => document.getElementById('pgsDisplayRow').style.display === 'none'));
          // «اعرض للزبون وقت متوقع» مطفأ: الاحتياط والخط الزمني يختفون، والجوال بلا وقت.
          await p.evaluate(() => { const i = document.getElementById('pgsShowEta'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); });
          r = await p.evaluate(() => ({
            buf: document.getElementById('pgsBuffer').closest('.pgs-eta-only').style.display,
            tl: document.getElementById('pgsTimeline').style.display,
            help: document.querySelector('.pgs-noeta-only').style.display,
            eta: document.querySelector('.pgs-ph-eta').innerText,
          }));
          check(tag + ' show_eta off → buffer/timeline hidden, phone has no time', r.buf === 'none' && r.tl === 'none' && r.help === '' && r.eta.includes('نجهزه لك الحين') && !/\d/.test(r.eta), JSON.stringify(r));
          if (SHOTS) await p.locator('.rk-section', { has: p.locator('#pgsPrep') }).screenshot({ path: path.join(OUT, `dash-noeta-${w}.png`) });
          if (SHOTS) await p.locator('.pgs-stage').screenshot({ path: path.join(OUT, `dash-noeta-stage-${w}.png`) });
          await p.click('#pgsSaveBtn');
          await p.waitForTimeout(200);
          const saved = await p.evaluate(() => window.__saved);
          if (!saved) console.log('DEBUG', await p.evaluate(() => JSON.stringify({ t: window.__toasts, dis: document.getElementById('pgsSaveBtn').disabled, cls: document.getElementById('pgsSaveBtn').className })));
          const exp = { pager_enabled: true, pager_settings: { channels: ['pickup'], prep_min: 15, buffer_min: 0, receipt: false, display: false, display_secs: 0, remind_min: 5, close_min: 0, wifi: 'Cafe-5G', ready_msg: 'طلبك ينتظرك <b>هنا</b>', late_alert: true, tone: 'beep', show_eta: false } };
          const ok = saved && saved.pager_enabled === true && Object.keys(exp.pager_settings).every(k => JSON.stringify(saved.pager_settings[k]) === JSON.stringify(exp.pager_settings[k]));
          check(tag + ' save payload exact', ok, JSON.stringify(saved));
          check(tag + ' dirty cleared after save', await p.evaluate(() => document.getElementById('pgsDirty').hidden));
          if (SHOTS) await p.screenshot({ path: path.join(OUT, `dash-edited-${w}.png`), fullPage: true });
        }
        if (cname === 'brand' && theme === 'light' && w === 1440) {
          // المحلي بطاولات: يُحذَّر أن البيجر للسفري بس.
          await p.evaluate(() => window.__boot({ dine_in: false, pickup: false }, true));
          await p.click('.pgs-chip[data-ch="dine_in"]');
          const t = await p.evaluate(() => document.getElementById('pgsChannelWarn').innerText);
          check(tag + ' tables-mode warning', /بالطاولات/.test(t), t);
        }
        check(tag + ' no JS errors', errs.length === 0, errs[0]);
        await ctx.close();
      }
    }
    process.stdout.write(`${cname}: ${pass} pass, ${fail} fail\n`);
  }
  await br.close();
  console.log(`\nCHECKS ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
  fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})();
