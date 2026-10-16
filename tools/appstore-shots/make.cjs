// App Store screenshots: real Rakeen screens (public/help/previews, built
// on the real stylesheets) inside a device, under a short caption.
// Needs the dev server on :3000. Output: docs/appstore/screenshots/.
const { chromium } = require('../../node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../docs/appstore/screenshots');
// raw screens come from scenes.cjs (the real cashier on demo data)
const SHOTS = [
  { n: 'cart', t: ['كاشير', 'سريع'], s: 'يكمل البيع حتى لو انقطع النت' },
  { n: 'pay', t: ['الدفع', 'بثواني'], s: 'كاش، بطاقة، أو تقسيم بين الأصحاب' },
  { n: 'online', t: ['طلبات المتجر', 'توصلك'], s: 'تقبلها بضغطة، وتروح للمطبخ على طول' },
  { n: 'tables', t: ['طاولاتك', 'قدامك'], s: 'مين ينتظر طلبه، ومين باقي يدفع' },
  { n: 'loyalty', t: ['عملاؤك', 'ونقاطهم'], s: 'تلقى العميل بالاسم أو الجوال، ونقاطه معه' },
];
const DEV = {
  ipad: { W: 2752, H: 2064, vw: 1376, vh: 1032, dpr: 2 },
  iphone: { W: 1290, H: 2796, vw: 430, vh: 932, dpr: 3 },
};

// colour themes: THEME=cream|olive|violet (PREVIEW=1 renders only the first
// screen of each device into scratch, to compare)
const THEMES = {
  cream: { bg: 'radial-gradient(90% 60% at 50% 0%, #FFFFFF 0%, #F6F3EA 60%, #EFEBDD 100%)', glow: 'rgba(196,255,43,.55)', ink: '#121212', sub: 'rgba(18,18,18,.6)', grid: 'rgba(18,18,18,.045)', wm: 'rakeen-wordmark-deep.png', shadow: 'rgba(60,70,20,.35)' },
  olive: { bg: 'radial-gradient(120% 80% at 50% 0%, #3E5516 0%, #1F2B0A 55%, #121A06 100%)', glow: 'rgba(196,255,43,.28)', ink: '#F4F7E8', sub: 'rgba(244,247,232,.68)', grid: 'rgba(255,255,255,.05)', wm: 'rakeen-wordmark.png', shadow: 'rgba(0,0,0,.6)' },
  violet: { bg: 'radial-gradient(120% 80% at 50% 0%, #7347F5 0%, #3F1FA6 50%, #1D0E52 100%)', glow: 'rgba(196,255,43,.22)', ink: '#FFFFFF', sub: 'rgba(255,255,255,.72)', grid: 'rgba(255,255,255,.06)', wm: 'rakeen-wordmark.png', shadow: 'rgba(10,0,40,.6)' },
};
const TH = THEMES[process.env.THEME || 'cream'];

const frame = (dev, img, t, s, top) => {
  const d = DEV[dev];
  const ipad = dev === 'ipad';
  // device box: screen keeps the raw aspect, scaled to fit under the caption
  const capH = ipad ? 470 : 720;
  const sw = ipad ? 2260 : 1040;
  const sh = Math.round(sw * (d.vh / d.vw));
  const bez = ipad ? 30 : 26;
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:TD;src:url(http://localhost:3000/fonts/thmanyah-serif-display/thmanyahserifdisplay-Black.woff2) format('woff2');font-weight:900}
@font-face{font-family:TS;src:url(http://localhost:3000/fonts/thmanyah-sans/thmanyahsans-Medium.woff2) format('woff2');font-weight:500}
*{margin:0;box-sizing:border-box}
html,body{width:${d.W}px;height:${d.H}px;overflow:hidden;background:${TH.bg}}
body{position:relative;font-family:TS,sans-serif;color:${TH.ink}}
.glow{position:absolute;width:${ipad ? 1800 : 1300}px;height:${ipad ? 1800 : 1300}px;border-radius:50%;left:50%;top:${ipad ? 600 : 900}px;transform:translateX(-50%);background:radial-gradient(closest-side,${TH.glow},transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(${TH.grid} 1px,transparent 1px),linear-gradient(90deg,${TH.grid} 1px,transparent 1px);background-size:${ipad ? 96 : 80}px ${ipad ? 96 : 80}px;mask-image:radial-gradient(70% 55% at 50% 25%,#000,transparent 85%)}
.cap{position:absolute;top:${ipad ? 60 : 130}px;left:0;right:0;text-align:center}
h1{font-family:TD;font-weight:900;font-size:${ipad ? 132 : 128}px;line-height:1.15}
h1 span{color:#121212;background:#C4FF2B;border-radius:${ipad ? 28 : 26}px;padding:0 .18em;display:inline-block;transform:rotate(-2deg);margin-inline-start:.28em}
p{margin-top:${ipad ? 26 : 34}px;font-size:${ipad ? 52 : 52}px;color:${TH.sub}}
.wm{display:block;margin:0 auto ${ipad ? 30 : 46}px;height:${ipad ? 58 : 66}px;width:auto}
.dev{position:absolute;left:50%;transform:translateX(-50%);top:${capH + (ipad ? 40 : 60)}px;padding:${bez}px;border-radius:${ipad ? 70 : 150}px;background:#050505;box-shadow:0 0 0 3px rgba(255,255,255,.08) inset,0 80px 160px -50px ${TH.shadow}}
.scr{border-radius:${ipad ? 42 : 124}px;overflow:hidden;background:${top};${ipad ? '' : 'padding-top:150px;'}}
.dev img{display:block;width:${sw}px;height:${ipad ? sh : sh - 150}px;object-fit:cover;object-position:top}
${ipad ? '' : '.dev::before{content:"";position:absolute;top:58px;left:50%;width:330px;height:96px;margin-left:-165px;border-radius:60px;background:#050505;z-index:2}'}
</style></head><body><div class="grid"></div><div class="glow"></div>
<div class="cap"><img class="wm" src="http://localhost:3000/brand/${TH.wm}"><h1>${t[0]}<span>${t[1]}</span></h1><p>${s}</p></div>
<div class="dev"><div class="scr"><img src="data:image/png;base64,${img}"></div></div></body></html>`;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const dev of ['ipad', 'iphone']) {
    const d = DEV[dev];
    const raw = await (await browser.newContext({ viewport: { width: d.vw, height: d.vh }, deviceScaleFactor: d.dpr })).newPage();
    const out = await (await browser.newContext({ viewport: { width: d.W, height: d.H }, deviceScaleFactor: 1 })).newPage();
    await out.goto('http://localhost:3000/help/previews/pos-login.html'); // same origin, so the fonts load
    let i = 0;
    for (const sh of process.env.PREVIEW ? SHOTS.slice(0, 1) : SHOTS) {
      const img = fs.readFileSync(path.join(__dirname, `raw-${dev}-${sh.n}.png`)).toString('base64');
      // the strip under the notch takes the colour of the screen's top edge
      // (white, or the dimmed overlay when a sheet is open)
      const top = await out.evaluate(async (src) => {
        const im = new Image(); im.src = src; await im.decode();
        const c = document.createElement('canvas'); c.width = 4; c.height = 4;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0, im.width, 4, 0, 0, 4, 4);
        const [r, gg, b] = g.getImageData(1, 1, 1, 1).data; return `rgb(${r},${gg},${b})`;
      }, 'data:image/png;base64,' + img);
      await out.setContent(frame(dev, img, sh.t, sh.s, top), { waitUntil: 'networkidle' });
      await out.waitForTimeout(500);
      i++;
      const file = process.env.PREVIEW
        ? path.join(__dirname, `preview-${process.env.THEME || 'cream'}-${dev}.png`)
        : path.join(OUT, `${dev}-${String(i).padStart(2, '0')}-${sh.n}.png`);
      await out.screenshot({ path: file });
      console.log(file);
    }
  }
  await browser.close();
})();
