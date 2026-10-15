/* الباقة داخل الشاشات: لوحة التحكم، وكاشير الويب، والتطبيق.
   قبلها كانت الباقة تخفي الشاشة كاملة بس، فصاحب أساس يلقى تبويب «التكلفة
   والمخزون» داخل المنتج، وخطوات تجهيز المخزون والمحاسبة في الرئيسية، و«المالية»
   عنوان فاضي بالقائمة، والكاشير يطبع للمطبخ ويعرض تطبيقات التوصيل.
   التشغيل: node tools/accounting-checks/plan-gating.cjs */
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if (!cond) fails++;
}

const contracts = read('lib/contracts.ts');
const featureKeys = new Set([...contracts.matchAll(/\{ key: "([a-z_]+)", label:/g)].map((m) => m[1]));

console.log('=== لوحة التحكم ===');
const dash = read('public/dashboard/rakeen-dashboard.js');
const hideBlock = dash.slice(dash.indexOf('const PLAN_HIDE_SELECTORS = {'), dash.indexOf('function applyPlanHiding'));
const hideKeys = [...hideBlock.matchAll(/^\s+([a-z_]+): \[/gm)].map((m) => m[1]);
ok('كل ميزة في قائمة الإخفاء ميزة حقيقية من الباقات', hideKeys.length > 0 && hideKeys.every((k) => featureKeys.has(k)));
const markupKeys = (dash.match(/const FEATURE_KEYS_IN_MARKUP = \[([^\]]+)\]/) || [, ''])[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
ok('كل ميزة للوسوم حقيقية', markupKeys.every((k) => featureKeys.has(k)));
const tagged = [...dash.matchAll(/planAttr\('([a-z_]+)'\)/g)].map((m) => m[1]);
ok('كل وسم planAttr لميزة يعرفها الإخفاء', tagged.length > 0 && tagged.every((k) => markupKeys.includes(k)));
ok('تبويب «التكلفة والمخزون» في المنتج مع التكلفة', hideBlock.includes(`'#productEditTabs [data-tab="cost"]'`));
ok('تبويب «أسعار التوصيل» مع تطبيقات التوصيل', hideBlock.includes(`'#productEditTabs [data-tab="delivery"]'`));
ok('ربط المنتج بالمخزون موسوم بالمخزون', /<div \$\{planAttr\('inventory'\)\}>\$\{rkSwitchRow\('pfLinkInventory'/.test(dash));
ok('أرقام التكلفة والهامش (canViewProfit) تتبع الباقة', /function canViewProfit\(\)\{\s+if\(!CURRENT_PROFILE\) return false;[^}]*if\(!planHas\('costing_profit'\)\) return false;/.test(dash));
ok('مرشحات القائمة (بلا تكلفة، بلا مخزون) تتبع الباقة', dash.includes(".filter(f=> !f.feature || planHas(f.feature))") && dash.includes("tone:'muted', feature:'inventory'"));
ok('خطوات التجهيز تتبع الباقة', dash.includes(".filter(s=> !s.feature || planHas(s.feature));") && dash.includes("feature:'inventory', label:'سجّل أصناف مخزونك'"));
ok('عنوان قسم بلا شاشات يختفي', dash.includes("document.querySelectorAll('.nav-section-label').forEach"));
ok('التقارير الأساسية لأساس، والباقي مع عماد', ['counter', 'products', 'discounts'].every((r) => hideBlock.includes(`'[data-report="${r}"]'`)) && !['sales', 'tax', 'vat_return', 'shift', 'payments', 'daily_auto'].some((r) => hideBlock.includes(`data-report="${r}"`)));
ok('تقرير المشتريات والمصاريف والمالي والهدر مع ميزاتها', ['purchases', 'expenses', 'financial', 'waste'].every((r) => hideBlock.includes(`'[data-report="${r}"]'`)));
ok('الكاشير يُضاف لكل الباقات («قائمة الموظفين» مو مقفولة)', !hideBlock.includes('data-tab="employees"') && !hideBlock.includes('data-tab="overview"'));
ok('الصلاحيات والامتثال والأقسام وسجل العمليات مع صلاحيات الموظفين', ['#settingsTabs [data-tab="permissions"]', '#hrTabs [data-tab="compliance"]', '#hrTabs [data-tab="departments"]', '#auditFooter'].every((s) => hideBlock.includes(`'${s}'`)));
ok('نسخة المطبخ وآلية شاشة المطبخ موسومة بالمطبخ', (dash.match(/class="rk-section" \$\{planAttr\('kds'\)\}/g) || []).length === 2);
ok('أقسام الطاولات موسومة (5 أماكن)', (dash.match(/\$\{planAttr\('tables_reservations'\)\}/g) || []).length >= 5);
ok('الطاولات ما تنوسم لنشاط الخدمات', /if\(feature === 'tables_reservations' && isServiceBusinessType\(BUSINESS_TYPE\)\) return '';/.test(dash));
const screenMap = dash.slice(dash.indexOf('const PLAN_SCREEN_FEATURE = {'), dash.indexOf('};', dash.indexOf('const PLAN_SCREEN_FEATURE = {')));
ok('شاشة التقارير مفتوحة لكل الباقات (الأساسية لأساس)', !/^\s+reports:/m.test(screenMap));
ok('تكلفة الخيارات والإضافات مع التكلفة، و«من المخزون» مع المخزون', dash.includes("<div ${planAttr('costing_profit')}>\n      <div class=\"mg-cost-divider\">") && dash.includes('data-mode="stock" ${planAttr(\'inventory\')}'));
ok('نقاط الاسترداد في المنتج مع الولاء', dash.includes("<div class=\"menu-add-field\" ${planAttr('loyalty')} style=\"margin-top:12px; max-width:220px;\">"));
ok('الإخفاء يتطبّق بعد قراءة الباقة', /PLAN_ALLOWED_FEATURES = [^\n]+\n\s+applyPlanHiding\(\);/.test(dash));

console.log('\n=== كاشير الويب ===');
const pos = read('public/pos/rakeen-pos.js');
ok('يقرأ allowed_features وآخر قراءة محفوظة للعمل بدون نت', pos.includes("select('allowed_features')") && pos.includes("'rk_plan_features_' + businessId"));
ok('تطبيقات التوصيل تتبع الباقة', pos.includes("DELIVERY_PLATFORMS_LIST = posPlanHas('delivery_apps') ? (platformRes.data || []) : [];"));
ok('نسخة المطبخ ما تنطبع بدون المطبخ (التسجيل والدفع)', pos.includes("DEVICE.printKitchenTicket === true && posPlanHas('kds')){") && pos.includes("DEVICE.printKitchenTicket === true && posPlanHas('kds') && !wasResumingOrder"));
ok('إعداد نسخة المطبخ وطابعته مخفي بدون المطبخ', (pos.match(/posPlanHas\('kds'\) \? '' :/g) || []).length === 2);
ok('بدون الطاولات: محلي بسيط (عدا الخدمات)', pos.includes("if(!posPlanHas('tables_reservations') && !isServiceBusiness()) DINE_IN_MODE = 'simple';"));
ok('الهدر مع المخزون وشاشة العميل مع الولاء', pos.includes("const PLAN_MORE_ACTIONS = { waste: 'inventory', myDisplay: 'loyalty' };") && pos.includes("if(posPlanHas('inventory')) openWasteModal();"));
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
ok('الهدر مع المخزون وشاشة العميل مع الولاء', app.includes("{planHas('inventory') && (") && app.includes("{planHas('loyalty') && ("));
ok('تغيير الباقة يوصل التطبيق', app.includes('await loadPlanFeatures(cashier.business_id, true);'));
const printer = read('react-native-poc/src/ui/PrinterSettingsScreen.tsx');
ok('إعداد تذكرة المطبخ مخفي بدون المطبخ', printer.includes("{planHas('kds') && ("));

console.log('\n=== الباقات ===');
const plans = read('lib/plans.ts');
ok('شاشة العميل مربوطة بالولاء في عرض السعر', plans.includes('{ text: "شاشة العميل: يشوف طلبه وباركود الولاء", feature: "loyalty" }'));

console.log(fails ? `\n✗ ${fails} فشل` : '\nكلها ناجحة');
process.exit(fails ? 1 : 0);
