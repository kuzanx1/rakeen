/* الفترة التجريبية (350 طلب كاشير + متجر، مهلة 24 ساعة، ثم القفل) ومدة الخصم.
   يفحص: الـ migration، والكاشير (الويب والتطبيق) يقفلون قبل البيع وينادون نفس
   الدالة، واللوحة والمتجر، وجدول دفعات العقد بعد مدة الخصم، ونص العقد والعرض.
   التشغيل: node --experimental-strip-types tools/accounting-checks/trial-and-discount.cjs */
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}

(async () => {
  console.log('=== قاعدة البيانات ===');
  const sql = read('supabase/migrations/20261016090000_trial_350_combined.sql');
  ok('عمود وقت الوصول للحد', /add column if not exists trial_limit_reached_at timestamptz/.test(sql));
  ok('المشتركين (باقة أو عقد موقّع) يتعلّمون مشتركين قبل أي قفل',
    sql.indexOf("set online_subscribed = true") > 0 && sql.indexOf("set online_subscribed = true") < sql.indexOf('create trigger rk_trial_pos_gate'));
  ok('المهلة 24 ساعة', /trial_limit_reached_at \+ interval '24 hours'/.test(sql));
  ok('المالك ما يقدر يصفّر وقت الوصول', /current_user in \('authenticated', 'anon'\) then\s+new\.trial_limit_reached_at := old\.trial_limit_reached_at/.test(sql));
  ok('رفع الحد أو الاشتراك يفتح التجربة', /new\.online_subscribed\s+or coalesce\(new\.online_order_free_count, 0\) < coalesce\(new\.online_order_free_limit, 350\)/.test(sql));
  ok('طلب الكاشير يرفض بعد القفل (before insert)', /before insert on orders/.test(sql) && /raise exception 'trial_ended'/.test(sql));
  ok('طلب الكاشير ينعدّ (after insert)، والإلكتروني ما ينعدّ مرتين', /after insert on orders/.test(sql) && /if new\.source = 'online' then\s+return new;/.test(sql));
  ok('المتجر يقفل بنفس القاعدة (submit_online_order)', /replace\(v_def, v_old, 'public\.rk_trial_locked\(v_business\.id\)'\)/.test(sql));
  ok('get_trial_status للمستخدم المسجّل بس', /grant execute on function get_trial_status\(\) to authenticated;/.test(sql) && /revoke execute on function get_trial_status\(\) from public, anon;/.test(sql));
  ok('عمود مدة الخصم في العقود', /add column if not exists discount_periods int/.test(sql));

  console.log('\n=== الكاشير ===');
  const pos = read('public/pos/rakeen-pos.js');
  ok('الويب ينادي get_trial_status', pos.includes("rpc('get_trial_status')"));
  ok('الويب يمنع طلب جديد بعد القفل قبل ما يبدأ', /if\(!state\.resumingOrder && trialLockedNow\(\)\)\{ showTrialEnded\(\); return; \}/.test(pos));
  const rn = read('react-native-poc/src/application/trialService.ts');
  ok('التطبيق ينادي نفس الدالة', rn.includes("supabase.rpc('get_trial_status')"));
  const ps = read('react-native-poc/src/ui/ProductsScreen.tsx');
  ok('التطبيق يمنع الدفع والتسجيل بعد القفل', (ps.match(/blockedByTrial\(\)/g) || []).length >= 2);
  ok('التطبيق يعرض الشريط', ps.includes('<TrialBanner status={trial} />'));

  console.log('\n=== اللوحة والمتجر ===');
  const dash = read('public/dashboard/rakeen-dashboard.js');
  ok('اللوحة فيها شريط كم باقي', dash.includes("'الفترة التجريبية: باقي ' + left + ' طلب من '"));
  const store = read('public/order/rakeen-order.js');
  ok('المتجر يقرأ وقت الوصول ويعطي المهلة', store.includes('trial_limit_reached_at') && store.includes('trialReached + 24 * 3600 * 1000'));

  console.log('\n=== إضافة مشترك ===');
  const route = read('app/api/admin/businesses/route.ts');
  ok('POST للأدمن بس', /export async function POST/.test(route) && /isAdminEmail\(caller\.email\)/.test(route));
  ok('تجريبي = غير مشترك', route.includes('online_subscribed: !trial'));
  ok('رابط التفعيل يرجع لشاشة كلمة المرور', route.includes('type: "recovery"') && route.includes('/dashboard'));

  console.log('\n=== مدة الخصم ===');
  const c = await import(require('url').pathToFileURL(require('path').resolve('lib/contracts.ts')).href);
  const rows = c.buildSchedule('monthly', 143.2, 500, '2026-10-16', 3, { listPrice: 179, periods: 1 });
  ok('شهري، خصم لأول شهر: الأولى 143.20 + التأسيس', rows[0].amount === 643.2);
  ok('وبعدها بالسعر الأساسي', rows[1].amount === 179 && rows[2].amount === 179);
  const rows3 = c.buildSchedule('monthly', 143.2, 0, '2026-10-16', 4, { listPrice: 179, periods: 3 });
  ok('خصم 3 أشهر: 3 بالخصم ثم الأساسي', rows3.map((r) => r.amount).join() === '143.2,143.2,143.2,179');
  const annual = c.buildSchedule('annual', 1432, 0, '2026-10-16', 4, { listPrice: 1790, periods: 1 });
  ok('سنوي: السنة كلها بالخصم', annual.reduce((t, r) => t + r.amount, 0) === 1432);
  ok('بدون خصم: كما كان', c.buildSchedule('monthly', 179, 0, '2026-10-16', 2).map((r) => r.amount).join() === '179,179');
  ok('النص: لأول شهر / شهرين / 3 أشهر / سنة', [
    c.discountTermText('monthly', 1), c.discountTermText('monthly', 2), c.discountTermText('monthly', 3), c.discountTermText('annual', 1),
  ].join('|') === 'لأول شهر|لأول شهرين|لأول 3 أشهر|لأول سنة');
  const offer = { contract_number: 'X', plan_name: 'باقة عماد', billing_period: 'monthly', price: 143.2, setup_fee: 0, vat_mode: 'exclusive', start_date: '2026-10-16', branches_count: 1, features: [], special_terms: null, jurisdiction: 'taif', list_price: 179, discount_periods: 1 };
  const text = JSON.stringify(c.buildClauses(offer));
  ok('العقد يقول مدة الخصم والسعر بعده', text.includes('يسري لأول شهر من تاريخ البدء فقط') && text.includes('179.00 ر.س لكل شهر'));
  ok('عقد قديم بدون مدة: ولا سطر زيادة', !JSON.stringify(c.buildClauses({ ...offer, discount_periods: null })).includes('يسري لأول'));
  const quote = read('app/contract/QuoteDocument.tsx');
  ok('عرض السعر يقول المدة', quote.includes('discountTermText(q.billingPeriod, q.discountPeriods)'));

  console.log(fails ? `\n✗ ${fails} فشل` : '\nكلها ناجحة');
  process.exit(fails ? 1 : 0);
})();
