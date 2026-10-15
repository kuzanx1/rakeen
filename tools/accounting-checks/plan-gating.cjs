/* الباقة داخل الشاشات: لوحة التحكم، وكاشير الويب، والتطبيق.
   قبلها كانت الباقة تخفي الشاشة كاملة بس، فصاحب أساس يلقى تبويب «التكلفة
   والمخزون» داخل المنتج، وخطوات تجهيز المخزون والمحاسبة في الرئيسية،
   والكاشير يطبع للمطبخ. قرار المالك: الميزة تبان لكل الباقات، واللي مو في
   باقته عليها قفل واسم الباقة، والضغط يفتح «اطلب الترقية».
   التشغيل: node tools/accounting-checks/plan-gating.cjs */
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}
const objBlock = (src, decl) => {
  const i = src.indexOf(decl);
  return i < 0 ? '' : src.slice(i, src.indexOf('\n};', i));
};
const keysOf = (block) => [...block.matchAll(/^\s+([a-z_]+): \[/gm)].map((m) => m[1]);

const contracts = read('lib/contracts.ts');
const featureKeys = new Set([...contracts.matchAll(/\{ key: "([a-z_]+)", label:/g)].map((m) => m[1]));

// أصغر باقة فيها كل ميزة، من lib/plans.ts نفسه
const plans = read('lib/plans.ts');
const listOf = (name) => {
  const m = plans.match(new RegExp(`const ${name}: FeatureKey\\[\\] = \\[([^\\]]*)\\];`));
  const own = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  const spread = [...m[1].matchAll(/\.\.\.([A-Z]+)/g)].map((x) => x[1]);
  return [...spread.flatMap(listOf), ...own];
};
const minPlan = {};
[['SARH', 'صرح'], ['EMAD', 'عماد'], ['ASAS', 'أساس']].forEach(([k, n]) => listOf(k).forEach((f) => { minPlan[f] = n; }));

console.log('=== لوحة التحكم ===');
const dash = read('public/dashboard/rakeen-dashboard.js');
const lockBlock = objBlock(dash, 'const PLAN_LOCK_SELECTORS = {');
const hideBlock = objBlock(dash, 'const PLAN_HIDE_SELECTORS = {');
const minBlock = dash.slice(dash.indexOf('const FEATURE_MIN_PLAN = {'), dash.indexOf('};', dash.indexOf('const FEATURE_MIN_PLAN = {')));
const dashMin = Object.fromEntries([...minBlock.matchAll(/([a-z_]+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
ok('كل ميزات القفل والإخفاء ميزات حقيقية', [...keysOf(lockBlock), ...keysOf(hideBlock)].every((k) => featureKeys.has(k)));
ok('اسم الباقة على كل قفل = أصغر باقة فيها الميزة (lib/plans.ts)', Object.keys(dashMin).length > 0 && Object.entries(dashMin).every(([f, n]) => minPlan[f] === n));
ok('كل ميزة مو في أساس لها اسم باقة على القفل', [...featureKeys].filter((f) => f !== 'ai_advisor' && minPlan[f] && minPlan[f] !== 'أساس').every((f) => dashMin[f]));
const tagged = [...dash.matchAll(/planAttr\('([a-z_]+)'(?:, 'hide')?\)/g)].map((m) => m[1]);
ok('كل وسم planAttr لميزة لها اسم باقة', tagged.length > 0 && tagged.every((k) => dashMin[k]));
ok('القفل: باهت + اسم الباقة + الضغط يفتح بطاقة الترقية', dash.includes('${lock} > *{opacity:.42;') && dash.includes('content:"${FEATURE_MIN_PLAN[f]}"') && /document\.addEventListener\('click', \(e\)=>\{\s+const el = e\.target\.closest && e\.target\.closest\('\[data-plan-feature\]'\);[\s\S]{0,200}showPlanUpgrade\(f\);\s+\}, true\);/.test(dash));
ok('بطاقة الترقية فيها اسم الباقة وزر «اطلب الترقية» بالواتساب ومعرّف الحساب', dash.includes('>اطلب الترقية</a>') && dash.includes('معرّف الحساب ${bizId}') && dash.includes("const PLAN_UPGRADE_WA = '966557444227';"));
ok('الشاشة المقفولة بالباقة تبان بالقائمة مقفولة', dash.includes("btn.style.display = (allowedScreens.includes(s) || locked) ? '' : 'none';") && dash.includes("if(locked) btn.setAttribute('data-plan-feature', PLAN_SCREEN_FEATURE[s]);"));
ok('تبويب «التكلفة والمخزون» و«أسعار التوصيل» مقفولة بالمنتج', lockBlock.includes(`'#productEditTabs [data-tab="cost"]'`) && lockBlock.includes(`'#productEditTabs [data-tab="delivery"]'`));
ok('ربط المنتج بالمخزون موسوم بالمخزون', /<div \$\{planAttr\('inventory'\)\}>\$\{rkSwitchRow\('pfLinkInventory'/.test(dash));
ok('أرقام التكلفة والهامش (canViewProfit) تتبع الباقة', /function canViewProfit\(\)\{\s+if\(!CURRENT_PROFILE\) return false;[^}]*if\(!planHas\('costing_profit'\)\) return false;/.test(dash));
ok('مرشحات القائمة (بلا تكلفة، بلا مخزون) تتبع الباقة', dash.includes(".filter(f=> !f.feature || planHas(f.feature))") && dash.includes("tone:'muted', feature:'inventory'"));
ok('خطوات التجهيز تتبع الباقة', dash.includes(".filter(s=> !s.feature || planHas(s.feature));") && dash.includes("feature:'inventory', label:'سجّل أصناف مخزونك'"));
ok('عنوان قسم بلا شاشات يختفي', dash.includes("document.querySelectorAll('.nav-section-label').forEach"));
const screenMap = objBlock(dash, 'const PLAN_SCREEN_FEATURE = {');
ok('شاشة التقارير مفتوحة لكل الباقات (الأساسية لأساس)', screenMap.length > 0 && !/^\s+reports:/m.test(screenMap));
ok('التقارير الأساسية مفتوحة، والباقي مقفول بعماد', ['counter', 'products', 'discounts'].every((r) => lockBlock.includes(`'[data-report="${r}"]'`)) && !['sales', 'tax', 'vat_return', 'shift', 'payments', 'daily_auto'].some((r) => lockBlock.includes(`data-report="${r}"`)));
ok('تقرير المشتريات والمصاريف والمالي والهدر مع ميزاتها', ['purchases', 'expenses', 'financial', 'waste'].every((r) => lockBlock.includes(`'[data-report="${r}"]'`)));
ok('الكاشير يُضاف لكل الباقات («قائمة الموظفين» مو مقفولة)', !lockBlock.includes('data-tab="employees"') && !lockBlock.includes('data-tab="overview"'));
ok('الصلاحيات والامتثال والأقسام وسجل العمليات مقفولة بصلاحيات الموظفين', ['#settingsTabs [data-tab="permissions"]', '#hrTabs [data-tab="compliance"]', '#hrTabs [data-tab="departments"]', '#auditFooter'].every((s) => lockBlock.includes(`'${s}'`)));
ok('نسخة المطبخ وآلية شاشة المطبخ مقفولة بالمطبخ', (dash.match(/class="rk-section" \$\{planAttr\('kds'\)\}/g) || []).length === 2);
ok('أقسام الطاولات مقفولة (5 أماكن)', (dash.match(/\$\{planAttr\('tables_reservations'\)\}/g) || []).length >= 5);
ok('الطاولات ما تنقفل لنشاط الخدمات', /if\(feature === 'tables_reservations' && isServiceBusinessType\(BUSINESS_TYPE\)\) return '';/.test(dash));
ok('الخانات الصغيرة المتكررة تختفي بدل قفل على كل سطر', dash.includes("<div ${planAttr('costing_profit', 'hide')}>") && dash.includes("planAttr('team_permissions', 'hide')"));
ok('نقاط الاسترداد في المنتج مع الولاء', dash.includes("<div class=\"menu-add-field\" ${planAttr('loyalty')} style=\"margin-top:12px; max-width:220px;\">"));
ok('القفل يتطبّق بعد قراءة الباقة', /PLAN_ALLOWED_FEATURES = [^\n]+\n\s+applyPlanHiding\(\);/.test(dash));

console.log('\n=== كاشير الويب ===');
const pos = read('public/pos/rakeen-pos.js');
ok('يقرأ allowed_features وآخر قراءة محفوظة للعمل بدون نت', pos.includes("select('allowed_features')") && pos.includes("'rk_plan_features_' + businessId"));
ok('تطبيقات التوصيل تتبع الباقة', pos.includes("DELIVERY_PLATFORMS_LIST = posPlanHas('delivery_apps') ? (platformRes.data || []) : [];"));
ok('نسخة المطبخ ما تنطبع بدون المطبخ (التسجيل والدفع)', pos.includes("DEVICE.printKitchenTicket === true && posPlanHas('kds')){") && pos.includes("DEVICE.printKitchenTicket === true && posPlanHas('kds') && !wasResumingOrder"));
ok('إعداد نسخة المطبخ وطابعته مخفي بدون المطبخ', (pos.match(/posPlanHas\('kds'\) \? '' :/g) || []).length === 2);
ok('بدون الطاولات: محلي بسيط (عدا الخدمات)', pos.includes("if(!posPlanHas('tables_reservations') && !isServiceBusiness()) DINE_IN_MODE = 'simple';"));
ok('الهدر وشاشة العميل يبانون مقفولين باسم الباقة', pos.includes("const PLAN_MORE_ACTIONS = { waste: 'inventory', myDisplay: 'loyalty' };") && pos.includes('if(posPlanLockedAction(id)) return;') && pos.includes("'متوفرة في باقة ' + POS_FEATURE_PLAN[feature]"));
ok('الولاء ما يظهر إذا مطفي (مفتاح المطعم)', pos.includes("if(!LOYALTY_ENABLED){ proceedFromCustomerStep(); return; }"));

console.log('\n=== التطبيق ===');
const plan = read('react-native-poc/src/application/planService.ts');
ok('نفس العمود allowed_features ونفس الحفظ للعمل بدون نت', plan.includes(".select('allowed_features')") && plan.includes('rk_plan_features_'));
const cat = read('react-native-poc/src/application/catalogService.ts');
ok('تطبيقات التوصيل تتبع الباقة', cat.includes("if (!planHas('delivery_apps')) return [];"));
ok('بدون الطاولات: محلي بسيط (عدا الخدمات)', cat.includes("planHas('tables_reservations') || isServiceBusinessType("));
const ps = read('react-native-poc/src/ui/ProductsScreen.tsx');
ok('نسخة المطبخ ما تنطبع بدون المطبخ (المكانين)', (ps.match(/shouldPrintKitchenTicket\([a-zA-Z]+\) && planHas\('kds'\)/g) || []).length === 2);
const app = read('react-native-poc/App.tsx');
ok('الهدر وشاشة العميل يبانون مقفولين باسم الباقة', app.includes("onPress={planHas('inventory') ? onOpenWaste : () => planLockedAlert('عماد')}") && app.includes("onPress={planHas('loyalty') ? onOpenMyDisplay : () => planLockedAlert('عماد')}"));
ok('تغيير الباقة يوصل التطبيق', app.includes('await loadPlanFeatures(cashier.business_id, true);'));
const printer = read('react-native-poc/src/ui/PrinterSettingsScreen.tsx');
ok('إعداد تذكرة المطبخ مخفي بدون المطبخ', printer.includes("{planHas('kds') && ("));

console.log('\n=== الباقات ===');
ok('شاشة العميل مربوطة بالولاء في عرض السعر', plans.includes('{ text: "شاشة العميل: يشوف طلبه وباركود الولاء", feature: "loyalty" }'));

console.log(fails ? `\n✗ ${fails} فشل` : '\nكلها ناجحة');
process.exit(fails ? 1 : 0);
