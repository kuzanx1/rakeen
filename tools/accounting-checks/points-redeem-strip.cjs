/* شريط «عنده X نقطة، يقدر يستبدل كذا منتج» عند الكاشير.
   الحساب نفسه في العميلين: rkPointsRedeemOffer (الويب) و pointsRedeemOffer
   (التطبيق، react-native-poc/__tests__/pointsRedeemOffer.test.ts) -- نفس الحالات. */
const fs = require('fs');
const src = fs.readFileSync('public/pos/rakeen-pos.js', 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}
const cut = (name) => {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error(name + ' not found in shipped file');
  return src.slice(s, src.indexOf('\n}', s) + 2);
};
const { offer, text } = new Function(
  cut('rkPointsRedeemOffer') + cut('rkRedeemableCountText')
  + '; return { offer: rkPointsRedeemOffer, text: rkRedeemableCountText };')();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('=== متى يظهر الشريط ===');
ok('يعدّ ما تكفيه النقاط فقط', same(offer(50, [20, 50, 80], 0), { remaining: 50, count: 2 }));
ok('لا شريط حين لا تكفي النقاط', offer(10, [20, 50], 0) === null);
ok('لا شريط بلا منتجات قابلة للاستبدال', offer(500, [null, undefined], 0) === null && offer(500, [], 0) === null);
ok('يطرح ما في السلّة من استبدال', same(offer(50, [20, 50], 20), { remaining: 30, count: 1 }) && offer(50, [20, 50], 40) === null);
ok('سعر صفر ليس استبدالاً', offer(50, [0], 0) === null);
ok('كسور النقاط لا تُحسب', offer(19.9, [20], 0) === null);
ok('مفرد ومثنى وجمع', text(1) === 'منتج واحد' && text(2) === 'منتجين' && text(5) === '5 منتجات');

console.log('\n=== الضغطة تمرّ بتأكيد العميل ===');
const strip = cut('updatePointsRedeemStrip');
const pts = strip.slice(strip.indexOf("rkLoyaltySystemType() === 'points'"));
ok('الشريط لنظام النقاط موجود', pts.length > 0 && pts.includes('rkPointsRedeemOffer('));
ok('يفتح التأكيد لا القائمة مباشرةً',
  pts.includes("addEventListener('click', startLoyaltyRedeem)") && !strip.includes('openPointsRedeemModal'));

console.log('\n' + (fails === 0 ? 'كل الحالات صحيحة ✓' : fails + ' خلل ✗'));
process.exit(fails ? 1 : 0);
