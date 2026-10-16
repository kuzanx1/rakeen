// Takes the raw App Store screens from the real cashier on demo data.
// node scenes.cjs ipad|iphone
const { chromium } = require('../../node_modules/playwright-core');
const { installMocks, signIn, MODE } = require('./mockpos.cjs');
const dev = process.argv[2] || 'ipad';
const SIZE = dev === 'ipad' ? { width: 1376, height: 1032, dpr: 2 } : { width: 430, height: 932, dpr: 3 };
const HIDE = 'nextjs-portal{display:none!important}';

async function boot(browser, online) {
  MODE.online = online;
  const ctx = await browser.newContext({ viewport: { width: SIZE.width, height: SIZE.height }, deviceScaleFactor: SIZE.dpr, isMobile: dev === 'iphone', hasTouch: dev === 'iphone' });
  const page = await ctx.newPage();
  await installMocks(page);
  await signIn(page);
  await page.waitForSelector('.product-card', { timeout: 30000 });
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1500);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${__dirname}/raw-${dev}-${name}.png` });
const tapProduct = (page, name) => page.locator('.product-card', { hasText: name }).first().click();

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let page = await boot(browser, false);
  // 1) the cashier with an order
  await page.locator('.cat-btn, .cat-rail button', { hasText: 'الكل' }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  for (const n of ['سبانيش لاتيه', 'سبانيش لاتيه', 'كورتادو', 'سبانيش لاتيه بارد']) { await tapProduct(page, n); await page.waitForTimeout(350); }
  // close any modifier sheet that might open
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }));
  await page.waitForTimeout(600);
  await shot(page, 'cart');
  // 2) payment
  await page.locator('#payBtn, .pay-btn').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.locator('#paymentModal >> text=سفري').first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.locator('#paymentModal >> text=تخطي').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, 'pay');
  await page.close();
  // 3) an online order arrives
  page = await boot(browser, true);
  await page.waitForTimeout(2500);
  await shot(page, 'online');
  await page.close();
  // 4) tables, 5) orders, 6) loyalty customer
  page = await boot(browser, false);
  await page.locator('.nav-tab[data-screen="tables"]').click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, 'tables');
  await page.locator('.nav-tab[data-screen="home"], .nav-tab').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.locator('text=عميل ولاء').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('#paymentModal input').first().pressSequentially('عبد', { delay: 80 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, 'loyalty');
  await browser.close();
})();
