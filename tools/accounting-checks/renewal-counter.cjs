/**
 * حسابُ تذكيرِ الاشتراك وعدّادِه -- بالأرقام، على المصدرِ نفسِه.
 *
 * ليس هذا تحسُّباً نظريّاً: حسابُ المراحل كُتب أولَ مرّةٍ بالساعات،
 * فأسقط اليومَ السادس من النافذة أصلاً وقال «٣» لدفعةٍ تستحقّ بعد
 * يومين -- ولم يظهر ذلك في أي قراءةٍ للكود، إنما في تشغيلِ الأرقام.
 * فيُشغَّل هنا في كلّ نشرة بدل أن يبقى في مسوَّدة.
 *
 * ويُحمَّل المصدرُ التايبسكربت كما هو ويُترجَم في الذاكرة: نسخةٌ ثانيةٌ
 * من القاعدة في ملفِ فحصٍ تعني أنّ الفحصَ يوافق نفسَه لا الكود.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');
const fails = [];

function loadTs(rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', js)(mod.exports, require, mod);
  return mod.exports;
}

const { pickRenewal, pickSubscription, projectSubscription, addCycle, NOTICE_DAYS, GRACE_DAYS } = loadTs('lib/renewalStage.ts');
const { subscriptionBigKey } = loadTs('react-native-poc/src/domain/renewal.ts');

/** منتصفُ نهارِ الرياض في يومٍ ثابت -- حتى لا يصير الفحصُ رهنَ ساعةِ تشغيله. */
const NOW = Date.parse('2026-11-23T09:00:00+03:00');
const DAY = 86_400_000;
/** تاريخٌ بعد n يوماً من يومِ NOW بتقويم الرياض. */
function iso(n) {
  return new Date(NOW + 3 * 3_600_000 + n * DAY).toISOString().slice(0, 10);
}
const due = (n, status = 'due') => ({ due_date: iso(n), status });

function eq(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails.push(`${what}: طلع ${JSON.stringify(got)} والمفروض ${JSON.stringify(want)}`);
  }
}

if (NOTICE_DAYS !== 6) fails.push(`نافذةُ الكاشير المفروض ٦ أيام، وهي ${NOTICE_DAYS} (اختيار المالك)`);
if (GRACE_DAYS !== 7) fails.push(`المهلة المفروض ٧ أيام مثل اللوحة، وهي ${GRACE_DAYS}`);

/* ── التذكير: يسكت بعيداً، ويدخل عند ستّة بالضبط ─────────────── */
eq('بلا دفعات', pickRenewal([], NOW), null);
eq('الموعد بعد ٣٠ يوم', pickRenewal([due(30)], NOW), null);
eq('الموعد بعد ٧ أيام', pickRenewal([due(7)], NOW), null);
eq('الموعد بعد ٦ أيام (أول يوم في النافذة)', pickRenewal([due(6)], NOW), { stage: 'upcoming', days: 6 });
eq('الموعد بعد يومين', pickRenewal([due(2)], NOW), { stage: 'upcoming', days: 2 });
eq('اليوم نفسه', pickRenewal([due(0)], NOW), { stage: 'upcoming', days: 0 });
eq('عدّى بيوم', pickRenewal([due(-1)], NOW), { stage: 'grace', days: 6 });
eq('عدّى بسبعة (آخر يوم مهلة)', pickRenewal([due(-7)], NOW), { stage: 'grace', days: 0 });
eq('عدّت المهلة', pickRenewal([due(-8)], NOW), { stage: 'expired', days: 0 });
eq('إيصال تحت المراجعة يُسكت', pickRenewal([due(1, 'submitted')], NOW), null);
eq('إيصال مرفوض يسبق', pickRenewal([due(30, 'rejected'), due(1)], NOW), { stage: 'rejected', days: 37 });

/* ── العدّاد: دائمٌ، بلا نافذةٍ ولا مرحلة ───────────────────── */
eq('عدّاد: بلا دفعات', pickSubscription([], NOW), null);
eq('عدّاد: بعد ٣٠ يوم (التذكير ساكت)', pickSubscription([due(30)], NOW), { days: 30, date: iso(30), status: 'due' });
eq('عدّاد: اليوم', pickSubscription([due(0)], NOW), { days: 0, date: iso(0), status: 'due' });
eq('عدّاد: متأخّر', pickSubscription([due(-3)], NOW), { days: -3, date: iso(-3), status: 'due' });
eq('عدّاد: أقربُ دفعةٍ مفتوحة لا أحدثُها', pickSubscription([due(40), due(5)], NOW), { days: 5, date: iso(5), status: 'due' });
eq('عدّاد: يحمل حالةَ الدفعة', pickSubscription([due(2, 'submitted')], NOW), { days: 2, date: iso(2), status: 'submitted' });

/* الرقمُ لا يتغيّر بين صباحِ اليوم ومسائه -- السببُ الأصليُّ لحساب
   التواريخ بدل الساعات. */
for (const hour of ['00:05', '08:00', '12:00', '23:55']) {
  const at = Date.parse(`2026-11-23T${hour}:00+03:00`);
  const got = pickSubscription([{ due_date: '2026-11-29', status: 'due' }], at);
  if (!got || got.days !== 6) fails.push(`عدّاد: الساعة ${hour} تقول ${got && got.days} والمفروض ٦ طولَ اليوم`);
}

/* ── المسدَّدُ لا يُطلِع شيئاً، ومن جهتين ──────────────────────
   المسارُ لا يسحب الصفوفَ المسدَّدة أصلاً، لكنّ حمايةً واحدةً في سطرِ
   سيكوالٍ يحذفه أيُّ تعديلٍ غيرُ كافية: صفٌّ مسدَّدٌ عدّى موعدَه كان
   يُطلِع بطاقةً حمراءَ تقول «3 أيام تأخير» لمن سدَّد فعلاً. */
eq('عدّاد: صفٌّ مسدَّدٌ متأخّر لا يُطلِع شيئاً', pickSubscription([due(-3, 'paid')], NOW), null);
eq('عدّاد: المسدَّدُ يُتجاوَزُ إلى المفتوح', pickSubscription([due(-3, 'paid'), due(20)], NOW), { days: 20, date: iso(20), status: 'due' });
eq('تذكير: صفٌّ مسدَّدٌ متأخّر لا يُطلِع شيئاً', pickRenewal([due(-3, 'paid')], NOW), null);

/* ── موعدُ التجديدِ المستنتَجُ حين ينتهي الجدول ──────────────────
   الدفعاتُ تُضاف يدوياً، وجدولُ السنويِّ قد يكون سطراً واحداً: فلحظةَ
   تُؤكَّد دفعتُه يصير صفرَ صفوفٍ مفتوحة، فيختفي العدّادُ عن أكثرِ
   الناسِ استحقاقاً له -- وطلبُ المالك «ثابت دايم». */
eq('استنتاج: سنويٌّ سُدِّد، الدورةُ القادمة', projectSubscription({ start_date: '2026-03-01', billing_period: 'annual' }, '2026-03-01', NOW), { days: 98, date: '2027-03-01', status: 'projected' });
eq('استنتاج: شهريٌّ سُدِّد', projectSubscription({ start_date: '2026-01-20', billing_period: 'monthly' }, '2026-11-20', NOW), { days: 27, date: '2026-12-20', status: 'projected' });
eq('استنتاج: بلا دفعاتٍ أصلاً، من بدايةِ العقد', projectSubscription({ start_date: '2026-11-01', billing_period: 'monthly' }, null, NOW), { days: 8, date: '2026-12-01', status: 'projected' });
eq('استنتاج: دوراتٌ كثيرةٌ مضت لا تُخرج تاريخاً ماضياً', projectSubscription({ start_date: '2019-04-05', billing_period: 'monthly' }, null, NOW), { days: 12, date: '2026-12-05', status: 'projected' });
eq('استنتاج: بلا عقد', projectSubscription(null, null, NOW), null);
eq('استنتاج: دورةٌ غيرُ معروفة', projectSubscription({ start_date: '2026-03-01', billing_period: 'weekly' }, null, NOW), null);
eq('استنتاج: تاريخٌ خربان', projectSubscription({ start_date: 'لا تاريخ', billing_period: 'annual' }, null, NOW), null);
/* ويومُ الشهرِ يُثبَّت على آخرِه إن قَصُر، وإلا صار 31 فبراير. */
eq('دورة: ٣١ يناير شهرياً', addCycle('2026-01-31', 'monthly'), '2026-02-28');
eq('دورة: ديسمبر يقلب السنة', addCycle('2026-12-20', 'monthly'), '2027-01-20');
eq('دورة: سنويّاً', addCycle('2026-03-01', 'annual'), '2027-03-01');
/* والمستنتَجُ لا يكون متأخّراً أبداً: ليس ديناً، إنما متى تدور الدورة. */
for (const start of ['2020-01-31', '2026-11-23', '2026-11-24', '2031-02-28']) {
  for (const period of ['monthly', 'annual']) {
    const got = projectSubscription({ start_date: start, billing_period: period }, null, NOW);
    if (got && got.days < 0) fails.push(`استنتاج ${start}/${period}: طلع ${got.days} — المستنتَجُ لا يتأخّر`);
  }
}

/* ── صيغةُ الأيام: «5 يوم» و«3 يوم تأخير» غلطٌ عربيّ ──────────
   أوّلُ بناءٍ وقف عند المثنّى، فكان العدّادُ يناقض شريطَ التذكير على
   نفس الشاشة: الشريطُ «باقي 5 أيام» والبطاقةُ تحته «5 يوم». */
const forms = [[0, 'اليوم'], [1, 'يوم واحد'], [2, 'يومان'], [3, '{n} أيام'], [10, '{n} أيام'], [11, '{n} يوم'], [40, '{n} يوم'],
               [-1, 'يوم تأخير'], [-2, 'يومان تأخير'], [-3, '{n} أيام تأخير'], [-10, '{n} أيام تأخير'], [-11, '{n} يوم تأخير']];
for (const [d, want] of forms) {
  eq(`صيغة ${d}`, subscriptionBigKey({ days: d, date: iso(d), status: 'due' }), want);
}

/* ── ما يراه العميلان: المبلغُ لا يعبر هذا الحدّ أبداً ───────── */
const route = fs.readFileSync(path.join(root, 'app/api/pos/account-status/route.ts'), 'utf8');
/* التعليقاتُ تُنزع أولاً: نصُّ المسار نفسُه يشرح أنه لا يرسل مبلغاً،
   فحارسٌ يقرأ الشرحَ كأنه كودٌ يسقط على كلامٍ يقول الصواب. */
const routeCode = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
if (/\bamount\b/.test(routeCode)) fails.push('مسار الكاشير يذكر amount — الكاشير يُقال له متى لا كم');
if (!/pickSubscription/.test(route)) fails.push('مسار الكاشير ما يرسل العدّاد — بطاقةُ «المزيد» تختفي');
if (!/projectSubscription\(/.test(routeCode)) fails.push('مسار الكاشير ما يستنتج الموعد — العدّادُ يختفي عن السنويِّ المسدِّد');
/* والفلترُ في السيكوال هو الحمايةُ الأولى، وبعدَه فلترُ pickSubscription. */
if (!/neq\("status",\s*"paid"\)/.test(routeCode)) fails.push('مسار الكاشير ما يستثني المسدَّد في السيكوال');

/* والعميلان كلاهما يقرؤه: ناقصٌ في أحدهما = ميزةٌ في جهازٍ وغائبةٌ في جهاز. */
const web = fs.readFileSync(path.join(root, 'public/pos/rakeen-pos.js'), 'utf8');
for (const need of ['out.subscription', 'function rkSubTone', 'function renderMoreSubCard', 'moreSubCard', '{n} أيام', '{n} أيام تأخير']) {
  if (!web.includes(need)) fails.push(`كاشير الويب ناقصه ${need} — العدّاد في التطبيق وحده`);
}
const svc = fs.readFileSync(path.join(root, 'react-native-poc/src/application/renewalService.ts'), 'utf8');
if (!svc.includes('out.subscription')) fails.push('كاشير التطبيق ما يقرأ subscription من الردّ');
const tbl = fs.readFileSync(path.join(root, 'react-native-poc/src/ui/i18nMore.ts'), 'utf8');
for (const key of ['{n} أيام', '{n} أيام تأخير']) {
  if (!tbl.includes(key)) fails.push(`جدولُ التطبيق ناقصه «${key}» — سطرٌ نصفُه مترجَم`);
}
const more = fs.readFileSync(path.join(root, 'react-native-poc/App.tsx'), 'utf8');
if (!more.includes('<SubscriptionCard')) fails.push('شاشة «المزيد» في التطبيق ما فيها بطاقة العدّاد');

/* وشريطُ التذكير يُزيح الشاشة ولا تُطليه.
   على اللوح شريطُ الرأسِ ومنطقةُ الشاشات كلاهما position:absolute من
   أعلى القشرة، فشريطٌ في السياق قبلهما يُرسم ثم يُغطّى -- وهذا ما وقع
   على السُنمي: النقطةُ ظاهرةٌ والشريطُ لا. فكلاهما يُزاح بارتفاعه. */
for (const who of ['<Topbar', 'styles.screenArea']) {
  const i = more.indexOf(who);
  if (i < 0) { fails.push(`ما لقينا ${who} في App.tsx`); continue; }
  if (!more.slice(i, i + 420).includes('renewalStripHeight')) {
    fails.push(`${who} ما يُزاح بارتفاع شريط التذكير — الشريط ينرسم تحته ولا يبان على اللوح`);
  }
}

/* والحدُّ نفسُه في العميلين: «قريب» تبدأ من نفس اليوم الذي يبدأ منه
   التذكير، وإلا صار عدّادٌ أصفرُ وشريطٌ ساكتٌ -- أو العكس. */
const rn = fs.readFileSync(path.join(root, 'react-native-poc/src/domain/renewal.ts'), 'utf8');
for (const [who, src] of [['الويب', web], ['التطبيق', rn]]) {
  if (!/days\s*<=\s*6/.test(src)) fails.push(`حدُّ «قريب» في ${who} مو ٦ أيام — افترق العميلان عن lib/renewalStage.ts`);
  if (!/days\s*<\s*0/.test(src)) fails.push(`${who}: ما فيه حالةُ تأخّرٍ في العدّاد`);
  /* و«5 days» في قالبٍ عربيِّ الاتّجاه تُقرأ «days 5» بلا علامةِ اتّجاه. */
  if (!/u200E/.test(src)) fails.push(`${who}: بلا علامةِ اتّجاهٍ قبل الرقم — «5 days» تنقلب «days 5»`);
}

if (fails.length) {
  console.error('✗ تذكير الاشتراك وعدّاده:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ تذكير الاشتراك وعدّاده: الحساب والحدود والعميلان');
