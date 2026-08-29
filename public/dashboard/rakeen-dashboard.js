(function(){
  if (window.__rakeenDashboardBooted) return;
  window.__rakeenDashboardBooted = true;

// Every innerHTML template in this file that interpolates customer-supplied
// text (names/notes seeded from online orders, OCR-extracted supplier names
// from scanned invoices) MUST run it through this first — none of that data
// is trusted, and it renders inside the owner's authenticated session.
function escapeHtml(value){
  if(value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
/* ============ DATA — same schema the POS's real sales tracking produces ============
   In production this comes from the connected POS terminals via the backend.
   Seeded here with realistic representative data so the computation logic is genuine
   and directly reusable once wired to live data. */
/* ============ RBAC — role definitions match the brief's detailed table exactly.
   "Pages exist for everyone, but content is filtered by role" — screens not in allowedScreens
   simply don't appear in the sidebar and are blocked if reached directly. */
let CURRENT_ROLE = null; // set to 'owner'|'manager'|'employee' after real login (loadProfileAndPermissions)

const PRODUCTS_REF = {
  1:'قهوة عربي', 2:'لاتيه', 7:'لاتيه مثلج', 11:'مياه معدنية', 15:'برجر لحم', 17:'بيتزا مارجريتا', 19:'تشيز كيك'
};
/* ============ Sales data — hourly is the source of truth; today's totals are derived from it ============ */
let HOURLY_SALES = [
  {hour:'8', revenue:100, orders:2}, {hour:'9', revenue:150, orders:3}, {hour:'10', revenue:200, orders:4},
  {hour:'11', revenue:250, orders:5}, {hour:'12', revenue:500, orders:10}, {hour:'13', revenue:600, orders:12},
  {hour:'14', revenue:350, orders:7}, {hour:'15', revenue:220, orders:5}, {hour:'16', revenue:200, orders:4},
  {hour:'17', revenue:280, orders:6}, {hour:'18', revenue:450, orders:9}, {hour:'19', revenue:580, orders:11},
  {hour:'20', revenue:550, orders:10}, {hour:'21', revenue:330, orders:7}, {hour:'22', revenue:60, orders:1}
];
const SALES_TARGET = 5200;

const TODAY = (function(){
  const netSales = HOURLY_SALES.reduce((s,h)=>s+h.revenue, 0);
  const ordersCount = HOURLY_SALES.reduce((s,h)=>s+h.orders, 0);
  return {
    netSales, grossSales: netSales + 220, profit: Math.round(netSales*0.361),
    ordersCount, avgTicket: netSales/ordersCount,
    cancelledCount: 0, refundedCount: 0,
    topProducts: [
      {productId:1, name:'قهوة عربي', qty:58, revenue:696},
      {productId:15, name:'برجر لحم', qty:34, revenue:1360.80},
      {productId:2, name:'لاتيه', qty:41, revenue:846.60},
      {productId:7, name:'لاتيه مثلج', qty:26, revenue:598}
    ]
  };
})();
const YESTERDAY = {netSales: 4230, profit: 1490, ordersCount: 88, avgTicket: 48.07};
// real 7-day rollup, populated by loadWeekTrend() once real orders are fetched
let WEEK_TREND = [
  {day:'السبت', total:0}, {day:'الأحد', total:0}, {day:'الاثنين', total:0},
  {day:'الثلاثاء', total:0}, {day:'الأربعاء', total:0}, {day:'الخميس', total:0},
  {day:'اليوم', total:0}
];
let WEEK_HOUR_GRID = []; // [{day, total, hours:{0..23:{total,count}}}] — real, built in loadWeekTrend()
/* AI_INSIGHTS/HEALTH_CATEGORIES/ATTENTION_ITEMS/DECISION_CARDS were removed —
   they were hardcoded demo text that never got wired to anything real (fake
   "Cashier 2" accusations, fake printer/inventory numbers), duplicated across
   5 separate Home-screen widgets. Replaced by computeRealAttentionItems() /
   computeOverallStatus() below, feeding one consolidated real panel. */

const DELIVERY_PLATFORMS_STATUS = [
  {name:'هنقرستيشن', online:true}, {name:'جاهز', online:true}, {name:'ذا شفز', online:true},
  {name:'ToYou', online:false}, {name:'مرسول', online:true}, {name:'كيتا', online:true}
];

/* ============ Orders screen — status counts computed for real from RECENT_ORDERS
   (see computeOrderStatusCounts()) once real orders are fetched; this is just the
   pre-login placeholder shown before loadOrdersAndTables() runs. */
let ORDER_STATUS_COUNTS = { completed: 0, cancelled: 0, refunded: 0, voided: 0 };
let RECENT_ORDERS = [
  {id:'#1096', time:'٩:٤٢ م', type:'داخل المطعم', items:3, total:86.50, payment:'بطاقة', status:'completed'},
  {id:'#1095', time:'٩:٣٨ م', type:'توصيل', items:2, total:64.00, payment:'كاش', status:'completed'},
  {id:'#1094', time:'٩:٣٠ م', type:'سفري', items:1, total:18.00, payment:'Apple Pay', status:'completed'},
  {id:'#1093', time:'٩:٢١ م', type:'داخل المطعم', items:4, total:142.30, payment:'بطاقة', status:'completed'},
  {id:'#1092', time:'٩:١٠ م', type:'داخل المطعم', items:2, total:45.00, payment:'كاش', status:'refunded'},
  {id:'#1091', time:'٩:٠٢ م', type:'سفري', items:3, total:97.60, payment:'بطاقة', status:'completed'},
  {id:'#1090', time:'٨:٥٥ م', type:'درايف ثرو', items:1, total:32.00, payment:'كاش', status:'completed'},
  {id:'#1089', time:'٨:٤٨ م', type:'توصيل', items:5, total:168.00, payment:'بطاقة', status:'completed'},
  {id:'#1088', time:'٨:٤٠ م', type:'داخل المطعم', items:2, total:58.00, payment:'كاش', status:'cancelled'},
  {id:'#1087', time:'٨:٣٣ م', type:'سفري', items:1, total:12.00, payment:'كاش', status:'voided'},
  {id:'#1086', time:'٨:٢٥ م', type:'داخل المطعم', items:3, total:76.50, payment:'Apple Pay', status:'completed'},
  {id:'#1085', time:'٨:١٨ م', type:'توصيل', items:2, total:54.00, payment:'بطاقة', status:'completed'},
  {id:'#1084', time:'٨:١٠ م', type:'داخل المطعم', items:1, total:22.00, payment:'كاش', status:'cancelled'},
  {id:'#1083', time:'٨:٠٢ م', type:'سفري', items:4, total:118.40, payment:'بطاقة', status:'completed'},
  {id:'#1082', time:'٧:٥٥ م', type:'درايف ثرو', items:2, total:41.00, payment:'كاش', status:'cancelled'}
];
const AVG_PREP_TIME = 8.4; // minutes

/* ============ Inventory data ============
   Chicken (6 hours) and cheese (20%) figures are deliberately identical to the ones already
   established in the Welcome screen, Attention Center, and Health Score "why" text — this
   screen explains those facts, it doesn't invent new ones. Waste (7%, 3,200 SAR/month) matches
   the exact figures from the original landing page's health radar scene. */
let STOCK_ITEMS = [
  {id:1, name:'دجاج', qtyOnHand:3, parLevel:20, duration:'يكفي ٦ ساعات تقريبًا', unitCost:18, unit:'kg', category:'raw'},
  {id:2, name:'جبن', qtyOnHand:3, parLevel:15, duration:'يكفي يوم ونص تقريبًا', unitCost:32, unit:'kg', category:'raw'},
  {id:3, name:'بطاطس', qtyOnHand:10, parLevel:40, duration:'يكفي يوم واحد', unitCost:4, unit:'kg', category:'raw'},
  {id:4, name:'خبز برجر', qtyOnHand:90, parLevel:200, duration:'يكفي يومين', unitCost:1.2, unit:'piece', category:'raw'},
  {id:5, name:'حليب', qtyOnHand:15, parLevel:25, duration:'يكفي ٣ أيام', unitCost:6, unit:'liter', category:'raw'},
  {id:6, name:'حبوب قهوة', qtyOnHand:8, parLevel:10, duration:'يكفي أسبوع تقريبًا', unitCost:55, unit:'kg', category:'raw'},
  {id:7, name:'لحم برجر', qtyOnHand:5, parLevel:13, duration:'يكفي يوم تقريبًا', unitCost:45, unit:'kg', category:'raw'},
  {id:8, name:'طماطم', qtyOnHand:8, parLevel:20, duration:'يكفي يومين', unitCost:6, unit:'kg', category:'raw'},
  {id:9, name:'صوص', qtyOnHand:4, parLevel:10, duration:'يكفي أسبوع', unitCost:14, unit:'kg', category:'raw'},
  {id:10, name:'كيس تغليف', qtyOnHand:150, parLevel:300, duration:'يكفي أسبوع تقريبًا', unitCost:0.30, unit:'piece', category:'packaging'},
  {id:11, name:'كرتون تغليف', qtyOnHand:120, parLevel:250, duration:'يكفي أسبوع تقريبًا', unitCost:1.20, unit:'piece', category:'packaging'},
  {id:12, name:'كوب وغطاء (حار)', qtyOnHand:100, parLevel:200, duration:'يكفي أسبوع', unitCost:0.40, unit:'piece', category:'packaging'},
  {id:13, name:'كوب وغطاء (بارد)', qtyOnHand:80, parLevel:200, duration:'يكفي أسبوع', unitCost:0.60, unit:'piece', category:'packaging'},
  {id:14, name:'ملعقة', qtyOnHand:300, parLevel:500, duration:'يكفي أسبوعين', unitCost:0.05, unit:'piece', category:'packaging'},
  {id:15, name:'سمبوسة دجاج', qtyOnHand:80, parLevel:200, duration:'يكفي يومين', unitCost:1.20, unit:'piece', category:'raw'},
  {id:16, name:'سمبوسة لحم', qtyOnHand:60, parLevel:200, duration:'يكفي يومين', unitCost:1.40, unit:'piece', category:'raw'},
  {id:17, name:'ورق عنب', qtyOnHand:100, parLevel:250, duration:'يكفي يومين', unitCost:0.90, unit:'piece', category:'raw'},
  {id:18, name:'مسخن', qtyOnHand:50, parLevel:150, duration:'يكفي يومين', unitCost:1.60, unit:'piece', category:'raw'},
  {id:19, name:'كرتون تغليف كبير', qtyOnHand:60, parLevel:150, duration:'يكفي أسبوع', unitCost:1.80, unit:'piece', category:'packaging'},
  {id:20, name:'بيكون', qtyOnHand:4, parLevel:10, duration:'يكفي ٤ أيام', unitCost:60, unit:'kg', category:'raw'}
];
let stockIdCounter = 21;
function computeStockPct(item){ return Math.max(0, Math.min(100, Math.round(item.qtyOnHand/item.parLevel*100))); }
function computeStockTier(pct){ if(pct<20) return 'critical'; if(pct<45) return 'warn'; return 'ok'; }
const UNIT_LABELS = {kg:'كجم', g:'غرام', liter:'لتر', piece:'حبة'};
// A per-gram/per-ml cost is often a fraction of a halala (e.g. 46 ر.س ÷ 9600 غ) —
// toFixed(2) alone shows a misleading "0.00 ر.س" for those. Widen the decimals
// only when the value is actually that small, so normal per-kg/per-piece costs
// still show their usual clean 2-decimal form.
function formatUnitCost(cost){
  if(cost === 0) return '0.00';
  if(Math.abs(cost) < 0.1) return cost.toFixed(4);
  return cost.toFixed(2);
}
/* recipe quantities can be entered in a different (but compatible) unit than the stock item's
   purchasing unit — e.g. stock tracked in kg, recipe entered in grams for precision. */
function convertToUnit(qty, fromUnit, toUnit){
  if(fromUnit === toUnit) return qty;
  if(fromUnit==='g' && toUnit==='kg') return qty/1000;
  if(fromUnit==='kg' && toUnit==='g') return qty*1000;
  return qty; // liter and piece have no cross-unit conversion in this system
}
function compatibleUnits(baseUnit){
  if(baseUnit==='kg' || baseUnit==='g') return ['g','kg'];
  if(baseUnit==='liter') return ['liter'];
  return ['piece'];
}

/* Purchase invoices — real records enabling genuine supplier price comparison,
   not a decorative feature. Unit costs are computed from qty/totalCost, never hand-typed. */
let PURCHASE_INVOICES = [
  {id:1, stockItem:'لحم برجر', supplier:'مزرعة الشرق للحوم', qty:20, unit:'kg', totalCost:900, date:'قبل ٣ أيام'},
  {id:2, stockItem:'لحم برجر', supplier:'اللحوم الطازجة', qty:15, unit:'kg', totalCost:630, date:'قبل أسبوع'},
  {id:3, stockItem:'جبن', supplier:'مصنع الألبان الوطني', qty:10, unit:'kg', totalCost:310, date:'قبل يومين'},
  {id:4, stockItem:'جبن', supplier:'شركة الأجبان المتحدة', qty:8, unit:'kg', totalCost:272, date:'قبل ٥ أيام'},
  {id:5, stockItem:'دجاج', supplier:'مزرعة الرياض للدواجن', qty:25, unit:'kg', totalCost:450, date:'أمس'}
];
let invoiceIdCounter = 6;

const FOOD_COST_STATS = {pct:31, note:'ضمن المعدل الصحي لمطاعم الكوفي (٢٨-٣٣٪)'};

/* ============ Accounting waterfall — real, bottom-up: COGS is the actual
   ingredient+packaging cost of everything sold today (same per-unit cost
   logic as the Menu screen's margin display — computeVariableCost), not a
   flat 31% assumption. Opex is real fixed costs (Settings → المصاريف الثابتة)
   prorated to a day, plus any general expenses actually logged today — no
   more solving opex backward to force-match a placeholder profit. Populated
   by recomputeAccounting(), called after loadSalesRealData(). */
let ACCOUNTING = {revenue:0, discounts:0, netSales:0, vat:0, subtotal:0, cogs:0, deliveryPlatformCost:0, grossProfit:0, opex:0, netProfit:0};
let TODAY_COGS = 0;
// real per-order delivery-platform commission+fee+compensation deduction for
// today's delivery orders (computeOrderDeliveryPlatformCost, same math as the
// monthly reconciliation report) — without this, a box sold via Keeta/Jahez/etc.
// looked exactly as profitable as one sold at the counter, which it isn't.
let TODAY_DELIVERY_PLATFORM_COST = 0;
let TODAY_GENERAL_EXPENSES_TOTAL = 0;
function recomputeAccounting(){
  const revenue = TODAY.grossSales;
  const discounts = revenue - TODAY.netSales;
  const netSales = TODAY.netSales;
  const vat = netSales - (netSales / 1.15);
  const subtotal = netSales - vat;
  const cogs = TODAY_COGS;
  const deliveryPlatformCost = TODAY_DELIVERY_PLATFORM_COST;
  const grossProfit = subtotal - cogs - deliveryPlatformCost;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
  const opex = (getMonthlyFixedCostsTotal() / daysInMonth) + TODAY_GENERAL_EXPENSES_TOTAL;
  const netProfit = grossProfit - opex;
  ACCOUNTING = {revenue, discounts, netSales, vat, subtotal, cogs, deliveryPlatformCost, grossProfit, opex, netProfit};
  TODAY.profit = netProfit; // keeps Home's "الربح الحقيقي" KPI consistent with this same real waterfall
}

/* ============ Employees data — real staff_members + order stats — see
   loadStaffStats/renderEmployeeCards near the Employees screen render code.
   The old "توصية تدريب من ركين" coaching card and "إنجازات الأسبوع"
   achievements were both hardcoded fake data (a fabricated coaching note
   naming a specific fictional employee for discounts/voids the schema
   doesn't even track, and a fixed "سارة العتيبي" win) shown as real on
   every business's dashboard. Coaching had no real data to fall back to,
   so it's gone; achievements is rebuilt from STAFF_STATS below. */

/* ============ Customers data — real customers table, see loadCustomersReal()
   near the Customers screen render code. No birthdate is ever captured
   anywhere, so there's no real "upcoming birthdays" feature to show — the
   old always-empty panel for it was removed rather than kept as dead
   weight on the screen. */
let CUSTOMERS_TODAY = {newCount:0, returningCount:0};
let TOP_CUSTOMERS = [];
let CUSTOMER_INSIGHT = {what:'', why:''};

let ALL_SELLERS = [
  {name:'قهوة عربي', qty:58, revenue:696, cat:'مشروبات ساخنة'},
  {name:'برجر لحم', qty:34, revenue:1360.80, cat:'أطباق رئيسية'},
  {name:'لاتيه', qty:41, revenue:846.60, cat:'مشروبات ساخنة'},
  {name:'لاتيه مثلج', qty:26, revenue:598, cat:'مشروبات باردة'},
  {name:'بيتزا مارجريتا', qty:9, revenue:342, cat:'أطباق رئيسية'},
  {name:'سلطة سيزر', qty:7, revenue:168, cat:'أطباق رئيسية'},
  {name:'كنافة', qty:6, revenue:120, cat:'حلا'},
  {name:'مياه معدنية', qty:22, revenue:110, cat:'مشروبات باردة'}
];

let CATEGORY_PERF = [
  {name:'مشروبات ساخنة', revenue:1542.60}, {name:'أطباق رئيسية', revenue:1870.80},
  {name:'مشروبات باردة', revenue:708}, {name:'حلا', revenue:120}, {name:'مخبوزات', revenue:578.60}
];

let PAYMENT_BREAKDOWN = [
  {name:'كاش', amount:1830, icon:'cash'}, {name:'مدى / بطاقة', amount:2340, icon:'card'},
  {name:'Apple Pay', amount:520, icon:'apple'}, {name:'تقسيم دفع', amount:130, icon:'split'}
];
/* real totals for today, replacing the demo figures above once fetched
   (loadPaymentBreakdown, called from renderPhase1Screens post-login) */
async function loadPaymentBreakdown(){
  const sb = window.supabaseClient;
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  // payment_status='paid' excludes a pay-after dine-in table still mid-meal
  // (order registered, not yet paid) from today's payment breakdown.
  const { data } = await sb.from('orders').select('total, payment_method, cash_amount')
    .eq('business_id', CURRENT_PROFILE.business_id).gte('created_at', startOfDay.toISOString()).eq('payment_status', 'paid');
  // split orders aren't a third bucket — their cash half is real cash, their
  // card half is real card, so each folds into the matching total instead of
  // hiding under a separate "تقسيم دفع" row that never looked like either.
  let cash = 0, card = 0, deliveryPlatform = 0;
  (data||[]).forEach(o=>{
    const total = Number(o.total);
    if(o.payment_method === 'cash') cash += total;
    else if(o.payment_method === 'split'){
      const cashPart = Number(o.cash_amount||0);
      cash += cashPart;
      card += total - cashPart;
    } else if(o.payment_method === 'delivery_platform') deliveryPlatform += total;
    else card += total;
  });
  PAYMENT_BREAKDOWN = [{name:'كاش', amount:cash}, {name:'بطاقة', amount:card}, {name:'توصيل — مدفوع عبر التطبيق', amount:deliveryPlatform}].filter(p=>p.amount>0);
}

let CHANNEL_PERF = [
  {name:'داخل المطعم', orders:52, revenue:2610},
  {name:'سفري', orders:28, revenue:1340},
  {name:'توصيل', orders:12, revenue:690},
  {name:'درايف ثرو', orders:4, revenue:180}
];

/* ============ Pulse computation — same tiered-scoring pattern used in the POS shift health card ============ */
/* ============ Onboarding checklist — real, verifiable completion checks (not just "did they visit
   the page"), matching exactly what Rakeen needs configured to calculate margins correctly. */
function getOnboardingSteps(){
  return [
    {label:'حدد مصاريفك الثابتة الشهرية', desc:'إيجار، رواتب، فواتير — عشان ركين يحسب هامش ربح دقيق لكل منتج', screen:'accounting', tab:'fixedcosts', done: getMonthlyFixedCostsTotal() > 0},
    {label:'سجّل أصناف مخزونك', desc:'المواد الخام والتغليف اللي تستخدمها بمنتجاتك', screen:'inventory', done: STOCK_ITEMS.length > 0},
    {label:'أضف منتجات قائمتك وحدد تكلفتها', desc:'مباشرة، وصفة، أو بوكس — عشان يطلع هامش ربح كل صنف', screen:'menu', done: MENU_ITEMS.some(m=>m.linkProfit)},
    {label:'اربط منتجاتك بالمخزون', desc:'عشان يُخصم المخزون تلقائيًا كل ما تبيع، بدون ما تحسبها يدوي', screen:'menu', done: MENU_ITEMS.some(m=>m.linkInventory)}
  ];
}
function renderOnboardingChecklist(){
  const el = document.getElementById('onboardingChecklistPanel');
  if(!el) return;
  const steps = getOnboardingSteps();
  const doneCount = steps.filter(s=>s.done).length;
  const pct = Math.round(doneCount/steps.length*100);

  // Once every step is done, this panel has done its job — a permanent
  // "you're all set" banner is just clutter on a screen that should lead
  // with today's real numbers, not a completed checklist.
  if(pct === 100){
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="panel onboard-panel">
      <div class="onboard-header">
        <div class="onboard-title">خلّنا نجهّز لوحتك — ${doneCount} من ${steps.length} خطوات</div>
        <div class="onboard-subtitle">كمّل هالخطوات مرة وحدة، وركين يصير شريكك يحسب كل أرباحك صح تلقائيًا من بعدها</div>
      </div>
      <div class="onboard-progress-track"><div class="onboard-progress-fill" style="width:${pct}%"></div></div>
      <div class="onboard-steps">
        ${steps.map((s,i)=>`
          <div class="onboard-step ${s.done?'done':''}" data-screen="${s.screen}" ${s.tab?`data-tab="${s.tab}"`:''}>
            <div class="onboard-step-check">${s.done?'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':(i+1)}</div>
            <div class="onboard-step-text">
              <div class="onboard-step-label">${s.label}</div>
              <div class="onboard-step-desc">${s.desc}</div>
            </div>
            ${!s.done ? '<span class="onboard-step-arrow">←</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  el.querySelectorAll('.onboard-step:not(.done)').forEach(step=>{
    step.addEventListener('click', ()=>{
      const screen = step.dataset.screen;
      document.querySelector('.nav-item[data-screen="'+screen+'"]').click();
      const tabName = step.dataset.tab;
      if(tabName){
        setTimeout(()=>{
          const tabBtn = document.querySelector('#acctScreenTabs button[data-tab="'+tabName+'"]');
          if(tabBtn) tabBtn.click();
        }, 30);
      }
    });
  });
}

/* ============ Real attention items + overall status — one source of truth
   for both the Home screen's status panel and the AI advisor (avoids the two
   ever disagreeing, and avoids maintaining two copies of the same logic). */
function computeRealAttentionItems(){
  const items = [];

  // most-depleted first, but only surface the top few here — Inventory
  // already has the full list; this panel is for "what needs attention
  // *first*", not a duplicate of the inventory table.
  const STOCK_ITEMS_SHOWN = 3;
  const stockIssues = STOCK_ITEMS
    .map(s=>({ s, tier: computeStockTier(s.parLevel > 0 ? (s.qtyOnHand/s.parLevel*100) : 100), pct: s.parLevel > 0 ? (s.qtyOnHand/s.parLevel*100) : 100 }))
    .filter(x=> x.tier==='critical' || x.tier==='warn')
    .sort((a,b)=> a.pct - b.pct);

  stockIssues.slice(0, STOCK_ITEMS_SHOWN).forEach(({s, tier})=>{
    const isOut = s.qtyOnHand <= 0;
    const qtyText = `${Math.max(0, s.qtyOnHand)} ${UNIT_LABELS[s.unit]||s.unit}`;
    const coverage = !isOut ? stockCoverage(s) : null;
    items.push({
      level: (tier === 'critical' || isOut) ? 'urgent' : 'warn',
      text: isOut ? `مخزون ${s.name} نفد` : `مخزون ${s.name} ${tier==='critical'?'شارف على النفاد':'منخفض'} (${qtyText})`,
      sub: coverage ? `يكفي تقريبًا ${coverage.servings} من "${coverage.name}"` : 'راجع شاشة المخزون',
      action: 'المخزون', screen: 'inventory'
    });
  });
  if(stockIssues.length > STOCK_ITEMS_SHOWN){
    items.push({
      level: 'warn',
      text: `+${stockIssues.length - STOCK_ITEMS_SHOWN} صنف ثاني بمخزون منخفض`,
      sub: 'راجع شاشة المخزون للقائمة الكاملة', action: 'المخزون', screen: 'inventory'
    });
  }

  if(TODAY.cancelledCount >= 3){
    items.push({
      level: 'warn', text: `${TODAY.cancelledCount} طلبات ملغاة اليوم`,
      sub: 'أعلى من المعتاد — يستاهل مراجعة', action: 'الطلبات', screen: 'orders'
    });
  }
  if(TODAY.refundedCount >= 2){
    items.push({
      level: 'warn', text: `${TODAY.refundedCount} عمليات استرجاع اليوم`,
      sub: 'راجع أسباب الاسترجاع', action: 'الطلبات', screen: 'orders'
    });
  }

  // A 'recipe'/'box' item with no recipe lines (and no default mix / eligible
  // items) silently costs 0 — computeVariableCost has no way to distinguish
  // "genuinely free" from "nobody finished setting this up yet". Left
  // unflagged, that 0 quietly inflates every margin/profit number that reads
  // it (menu margin badge, COGS, net profit) without ever looking wrong on
  // its own. Generic across any business — not specific to any one product.
  const uncostedItems = canViewProfit() ? MENU_ITEMS.filter(m=>m.active && m.linkProfit && m.price>0 && m.costMode!=='direct' && computeVariableCost(m,'default')===0) : [];
  if(uncostedItems.length){
    items.push({
      level: 'warn',
      text: uncostedItems.length===1 ? `تكلفة "${uncostedItems[0].name}" غير محددة` : `${uncostedItems.length} منتجات تكلفتها غير محددة`,
      sub: 'هامش الربح المعروض لهذا المنتج وهمي (تكلفته صفر) — أكمل وصفته أو حوّله لتكلفة مباشرة من شاشة المنيو',
      action: 'المنيو', screen: 'menu'
    });
  }

  return items.sort((a,b)=> (a.level==='urgent'?0:1) - (b.level==='urgent'?0:1));
}

function computeOverallStatus(items){
  const urgentCount = items.filter(i=>i.level==='urgent').length;
  const warnCount = items.filter(i=>i.level==='warn').length;
  const salesDelta = YESTERDAY.netSales > 0 ? (TODAY.netSales - YESTERDAY.netSales) / YESTERDAY.netSales : 0;

  let tier, label, reason;
  if(urgentCount > 0){
    tier='critical'; label='حرج'; reason = items[0].text + ' — يحتاج تدخّل سريع.';
  } else if(warnCount > 1){
    tier='attention'; label='يحتاج انتباه'; reason = `فيه ${warnCount} أمور تستاهل متابعتك اليوم.`;
  } else if(warnCount === 1){
    tier='healthy'; label='جيد'; reason = items[0].text + '، بقية الأمور طبيعية.';
  } else if(salesDelta >= 0.10){
    tier='excellent'; label='ممتاز'; reason='مبيعاتك أعلى من أمس وما فيه أي شي يحتاج انتباه فوري.';
  } else {
    tier='healthy'; label='جيد'; reason='الأداء العام طبيعي، ما فيه شي يحتاج انتباه فوري.';
  }

  const score = urgentCount>0 ? -2 : warnCount>1 ? -1 : warnCount===1 ? 0.5 : (salesDelta>=0.10 ? 2 : 1);
  const pct = Math.max(10, Math.min(100, 50 + score*15));
  return {tier, label, reason, pct};
}

/* ============ Render: consolidated status panel — replaces the old Pulse +
   AI insights + Health Score + Attention Center + Decision Cards (5 separate
   widgets showing overlapping "what needs attention" framings). One real,
   prioritized answer instead. */
function renderStatusHero(){
  const items = computeRealAttentionItems();
  const status = computeOverallStatus(items);
  const banner = document.getElementById('statusBanner');
  if(!banner) return;

  if(items.length === 0){
    banner.className = 'status-banner tier-clear';
    banner.innerHTML = `
      <div class="status-clear-emoji">🎉</div>
      <div class="status-clear-title">كل شي تمام اليوم</div>
      <div class="status-banner-reason">${status.reason}</div>
    `;
    return;
  }

  banner.className = 'status-banner ' + (status.tier === 'critical' ? 'tier-critical' : status.tier === 'attention' ? 'tier-attention' : '');
  const headIcon = status.tier === 'critical'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  // The reason line already states the single most urgent item clearly —
  // the full list is real detail, not the headline, so it stays collapsed
  // behind an explicit toggle instead of always expanded and eating space.
  banner.innerHTML = `
    <div class="status-banner-head">${headIcon}${status.label}</div>
    <div class="status-banner-reason">${status.reason}</div>
    <button type="button" class="attention-toggle" id="attentionToggle">
      <span>عرض التفاصيل (${items.length})</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="attention-list" id="attentionList" hidden>
      ${items.map(a=>{
        const icon = a.level === 'urgent'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        return `<button type="button" class="attention-item ${a.level}" data-screen="${a.screen}">
          <div class="attention-icon">${icon}</div>
          <div class="attention-info"><div class="attention-text">${a.text}</div><div class="attention-sub">${a.sub}</div></div>
          <svg class="attention-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>`;
      }).join('')}
    </div>
  `;
  banner.querySelectorAll('.attention-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const nav = document.querySelector('.nav-item[data-screen="'+btn.dataset.screen+'"]');
      if(nav) nav.click();
    });
  });
  const toggle = document.getElementById('attentionToggle');
  const list = document.getElementById('attentionList');
  toggle.addEventListener('click', ()=>{
    const open = !list.hidden;
    list.hidden = open;
    toggle.classList.toggle('open', !open);
  });
}

/* ============ Render: hero money card — the one number that matters most,
   given real visual weight instead of sitting in an equal-sized grid cell
   among three others. Ring shows real progress toward SALES_TARGET. ============ */
/* ============ Render: أبطال اليوم — real recognition (top product + top
   staff), not a third copy of the Sales screen's best-sellers list. ============ */
function renderTodayHeroes(){
  const productEl = document.getElementById('heroProductCard');
  if(productEl){
    const top = [...(TODAY.topProducts||[])].sort((a,b)=>b.revenue-a.revenue)[0];
    productEl.innerHTML = `
      <div class="hero-spotlight-medal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"/><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"/><path d="M18 9h1.5a1 1 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6 9H4.5a1 1 0 0 1 0-5H6"/></svg></div>
      <div class="hero-spotlight-body">
        <div class="hero-spotlight-kicker">المنتج الأكثر مبيعًا اليوم</div>
        ${top
          ? `<div class="hero-spotlight-name">${top.name}</div><div class="hero-spotlight-meta">${top.qty} طلب — ${top.revenue.toFixed(2)} ر.س</div>`
          : `<div class="hero-spotlight-name" style="color:var(--muted);">ما فيه مبيعات بعد</div>`}
      </div>`;
  }
  const staffEl = document.getElementById('heroStaffCard');
  if(staffEl){
    const topStaff = [...STAFF_STATS].filter(s=>s.sales>0).sort((a,b)=>b.sales-a.sales)[0];
    staffEl.innerHTML = `
      <div class="hero-spotlight-medal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg></div>
      <div class="hero-spotlight-body">
        <div class="hero-spotlight-kicker">بطل الفريق اليوم</div>
        ${topStaff
          ? `<div class="hero-spotlight-name">${topStaff.name}</div><div class="hero-spotlight-meta">${topStaff.sales.toFixed(2)} ر.س — ${topStaff.orders} طلب</div>`
          : `<div class="hero-spotlight-name" style="color:var(--muted);">ما فيه مبيعات مسجّلة بعد</div>`}
      </div>`;
  }
}

/* ============ Sales screen — real data ============
   Replaces HOURLY_SALES/ALL_SELLERS/CATEGORY_PERF/CHANNEL_PERF (and the
   netSales/ordersCount/avgTicket/topProducts fields on TODAY/YESTERDAY) with
   figures computed from real orders + order_items for today (and yesterday,
   for the delta comparisons already used across Home/Sales). TODAY.grossSales
   is netSales plus the real sum of each order's discount_amount (the original
   demo's `netSales + 220` placeholder never got replaced here, so every
   business showed the exact same fake discount figure — including a business
   with zero real sales). TODAY.profit is overwritten right after by
   recomputeAccounting() with the real bottom-up netProfit, so its own
   placeholder value here is only ever transient. */
async function loadSalesRealData(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate()-1);

  // payment_status='paid' excludes a pay-after dine-in table still mid-meal
  // — its total isn't real revenue yet, so it shouldn't inflate today's (or
  // yesterday's) net sales before any money has actually been collected.
  const [{data: todayOrders}, {data: yesterdayOrders}] = await Promise.all([
    sb.from('orders').select('id, total, subtotal, discount_amount, channel, delivery_platform_id, status, created_at').eq('business_id', businessId).gte('created_at', startToday.toISOString()).eq('payment_status', 'paid'),
    sb.from('orders').select('total').eq('business_id', businessId).gte('created_at', startYesterday.toISOString()).lt('created_at', startToday.toISOString()).eq('payment_status', 'paid')
  ]);
  const todayList = todayOrders || [];
  const yList = yesterdayOrders || [];

  const orderIds = todayList.map(o=>o.id);
  const [{ data: items }, { data: todayExpenses }, { data: platforms }, { data: feeTiers }] = await Promise.all([
    orderIds.length
      ? sb.from('order_items').select('order_id, menu_item_id, qty, line_total').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),
    sb.from('general_expenses').select('amount').eq('business_id', businessId).gte('spent_at', startToday.toISOString()),
    sb.from('delivery_platforms').select('*').eq('business_id', businessId),
    sb.from('delivery_platform_fee_tiers').select('*')
  ]);
  const orderItemsList = items || [];
  TODAY_GENERAL_EXPENSES_TOTAL = (todayExpenses||[]).reduce((s,e)=>s+Number(e.amount),0);

  const platformById = {}; (platforms||[]).forEach(p=>{ platformById[p.id] = p; });
  const tiersByPlatform = {}; (feeTiers||[]).forEach(t=>{ (tiersByPlatform[t.delivery_platform_id] ||= []).push(t); });
  TODAY_DELIVERY_PLATFORM_COST = todayList.reduce((sum, o)=>{
    if(o.channel !== 'delivery' || !o.delivery_platform_id) return sum;
    const platform = platformById[o.delivery_platform_id];
    if(!platform) return sum;
    return sum + computeOrderDeliveryPlatformCost(o, platform, tiersByPlatform[platform.id]).total;
  }, 0);

  const netSales = todayList.reduce((s,o)=>s+Number(o.total),0);
  const todayDiscounts = todayList.reduce((s,o)=>s+Number(o.discount_amount||0),0);
  const ordersCount = todayList.length;
  TODAY.netSales = netSales;
  TODAY.ordersCount = ordersCount;
  TODAY.avgTicket = ordersCount > 0 ? netSales/ordersCount : 0;
  TODAY.grossSales = TODAY.netSales + todayDiscounts;
  TODAY.cancelledCount = todayList.filter(o=>o.status==='cancelled').length;
  TODAY.refundedCount = todayList.filter(o=>o.status==='refunded').length;

  const yNetSales = yList.reduce((s,o)=>s+Number(o.total),0);
  const yOrdersCount = yList.length;
  YESTERDAY.netSales = yNetSales;
  YESTERDAY.ordersCount = yOrdersCount;
  YESTERDAY.avgTicket = yOrdersCount > 0 ? yNetSales/yOrdersCount : 0;
  YESTERDAY.profit = Math.round(yNetSales*0.361);

  const byProduct = {};
  TODAY_COGS = 0;
  orderItemsList.forEach(it=>{
    const product = MENU_ITEMS.find(m=>m.id===it.menu_item_id);
    if(!product) return;
    const bucket = (byProduct[it.menu_item_id] ||= {name: product.name, cat: product.category, qty:0, revenue:0});
    bucket.qty += Number(it.qty);
    bucket.revenue += Number(it.line_total);
    // same per-unit ingredient+packaging cost logic as the Menu screen's margin
    // display (computeVariableCost) — real bottom-up COGS, not a flat % guess
    TODAY_COGS += Number(it.qty) * computeVariableCost(product, 'default');
  });
  ALL_SELLERS = Object.values(byProduct);
  TODAY.topProducts = [...ALL_SELLERS].sort((a,b)=>b.revenue-a.revenue).slice(0,4)
    .map(p=>({productId:null, name:p.name, qty:p.qty, revenue:p.revenue}));

  const byCategory = {};
  ALL_SELLERS.forEach(p=>{
    const bucket = (byCategory[p.cat] ||= {name:p.cat, revenue:0});
    bucket.revenue += p.revenue;
  });
  CATEGORY_PERF = Object.values(byCategory).filter(c=>c.revenue>0);

  const byChannel = {};
  todayList.forEach(o=>{
    const bucket = (byChannel[o.channel] ||= {name: ORDER_CHANNEL_TYPE_LABELS[o.channel]||o.channel, orders:0, revenue:0});
    bucket.orders += 1;
    bucket.revenue += Number(o.total);
  });
  CHANNEL_PERF = Object.values(byChannel).filter(c=>c.orders>0);

  const byHour = {};
  todayList.forEach(o=>{
    const hour = new Date(o.created_at).getHours();
    const bucket = (byHour[hour] ||= {hour:String(hour), revenue:0, orders:0});
    bucket.revenue += Number(o.total);
    bucket.orders += 1;
  });
  HOURLY_SALES = Object.values(byHour).sort((a,b)=>Number(a.hour)-Number(b.hour));
}

/* ============ Home screen 7-day trend — real day-by-day rollup, feeds the
   "المبيعات — آخر ٧ أيام" chart (was hardcoded demo data before). */
const WEEKDAY_LABELS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
async function loadWeekTrend(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const start7 = new Date(startToday); start7.setDate(start7.getDate()-6);

  // payment_status='paid' — see loadPaymentBreakdown's note above.
  const { data } = await sb.from('orders').select('total, created_at')
    .eq('business_id', businessId).gte('created_at', start7.toISOString()).eq('payment_status', 'paid');

  const buckets = [];
  for(let i=6; i>=0; i--){
    const d = new Date(startToday); d.setDate(d.getDate()-i);
    buckets.push({ start: d, day: i===0 ? 'اليوم' : WEEKDAY_LABELS[d.getDay()], total: 0, hours: {} });
  }
  (data||[]).forEach(o=>{
    const created = new Date(o.created_at);
    const bucket = buckets.find(b=> created >= b.start && created < new Date(b.start.getTime() + 86400000));
    if(bucket){
      bucket.total += Number(o.total);
      const hr = created.getHours();
      const hb = (bucket.hours[hr] ||= {total:0, count:0});
      hb.total += Number(o.total); hb.count += 1;
    }
  });
  WEEK_TREND = buckets.map(b=>({day: b.day, total: b.total}));
  WEEK_HOUR_GRID = buckets.map(b=>({day: b.day, total: b.total, hours: b.hours}));
}

/* ============ Sales screen date-range picker ============
   Deliberately does NOT touch TODAY/ALL_SELLERS/CATEGORY_PERF/CHANNEL_PERF/
   HOURLY_SALES/PAYMENT_BREAKDOWN — those stay real-and-"today" for Home, the
   AI advisor, and the Reports screen (which all assume "today" and say so in
   their own labels). A non-today range computes its own local dataset and
   feeds it explicitly into the same render functions instead. */
function salesRangeBounds(preset){
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday); startTomorrow.setDate(startTomorrow.getDate()+1);
  switch(preset){
    case 'yesterday': { const from = new Date(startToday); from.setDate(from.getDate()-1); return {from, to: startToday}; }
    case '7d': { const from = new Date(startToday); from.setDate(from.getDate()-6); return {from, to: startTomorrow}; }
    case 'month': { const from = new Date(now.getFullYear(), now.getMonth(), 1); return {from, to: startTomorrow}; }
    case '30d': { const from = new Date(startToday); from.setDate(from.getDate()-29); return {from, to: startTomorrow}; }
    // Real calendar quarters for the current year — matches how ZATCA
    // actually periods a small business's VAT return (Q1 Jan-Mar, etc.),
    // so filing every quarter is a genuine one-click flow instead of
    // manually typing two dates each time.
    case 'q1': return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 3, 1) };
    case 'q2': return { from: new Date(now.getFullYear(), 3, 1), to: new Date(now.getFullYear(), 6, 1) };
    case 'q3': return { from: new Date(now.getFullYear(), 6, 1), to: new Date(now.getFullYear(), 9, 1) };
    case 'q4': return { from: new Date(now.getFullYear(), 9, 1), to: new Date(now.getFullYear()+1, 0, 1) };
    case 'today':
    default: return {from: startToday, to: startTomorrow};
  }
}

async function loadSalesRangeData(from, to){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const { data: rangeOrders } = await sb.from('orders')
    .select('id, total, subtotal, discount_amount, vat_amount, channel, delivery_platform_id, payment_method, cash_amount, status, payment_status, shift_id, created_at')
    .eq('business_id', businessId).gte('created_at', from.toISOString()).lt('created_at', to.toISOString());
  // A still-open pay-after dine-in tab (payment_status='unpaid') is excluded
  // the same way a non-completed order already is — its totals aren't final
  // yet (more items could still be appended before it's paid), so it
  // shouldn't feed sales/VAT figures until it actually settles.
  const list = (rangeOrders || []).filter(o=>(o.status==='completed' || !o.status) && o.payment_status !== 'unpaid');
  const orderIds = list.map(o=>o.id);
  const [{ data: items }, { data: platforms }, { data: feeTiers }] = await Promise.all([
    orderIds.length
      ? sb.from('order_items').select('order_id, menu_item_id, qty, line_total').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),
    sb.from('delivery_platforms').select('*').eq('business_id', businessId),
    sb.from('delivery_platform_fee_tiers').select('*')
  ]);
  const itemsList = items || [];
  const platformById = {}; (platforms||[]).forEach(p=>{ platformById[p.id] = p; });
  const tiersByPlatform = {}; (feeTiers||[]).forEach(t=>{ (tiersByPlatform[t.delivery_platform_id] ||= []).push(t); });
  // same per-order commission/fee/compensation math as today's live waterfall
  // and the monthly reconciliation report — a "financial report" for any
  // chosen date must never show a rosier net profit than what actually happened.
  const deliveryPlatformCost = list.reduce((sum, o)=>{
    if(o.channel !== 'delivery' || !o.delivery_platform_id) return sum;
    const platform = platformById[o.delivery_platform_id];
    if(!platform) return sum;
    return sum + computeOrderDeliveryPlatformCost(o, platform, tiersByPlatform[platform.id]).total;
  }, 0);

  const netSales = list.reduce((s,o)=>s+Number(o.total),0);
  const ordersCount = list.length;
  const avgTicket = ordersCount>0 ? netSales/ordersCount : 0;
  const revenue = list.reduce((s,o)=>s+Number(o.subtotal||0),0) || netSales;
  const discounts = list.reduce((s,o)=>s+Number(o.discount_amount||0),0);
  const vat = list.reduce((s,o)=>s+Number(o.vat_amount||0),0) || (netSales - netSales/1.15);

  const byProduct = {};
  let cogs = 0;
  itemsList.forEach(it=>{
    const product = MENU_ITEMS.find(m=>m.id===it.menu_item_id);
    if(!product) return;
    const bucket = (byProduct[it.menu_item_id] ||= {name: product.name, cat: product.category, qty:0, revenue:0});
    bucket.qty += Number(it.qty);
    bucket.revenue += Number(it.line_total);
    // same per-unit ingredient+packaging cost logic as the Menu screen's
    // margin display (computeVariableCost) — real bottom-up COGS for the range
    cogs += Number(it.qty) * computeVariableCost(product, 'default');
  });
  const sellers = Object.values(byProduct);

  const byCategory = {};
  sellers.forEach(p=>{ (byCategory[p.cat] ||= {name:p.cat, revenue:0}).revenue += p.revenue; });
  const categoryPerf = Object.values(byCategory).filter(c=>c.revenue>0);

  const byChannel = {};
  list.forEach(o=>{
    const bucket = (byChannel[o.channel] ||= {name: ORDER_CHANNEL_TYPE_LABELS[o.channel]||o.channel, orders:0, revenue:0});
    bucket.orders += 1; bucket.revenue += Number(o.total);
  });
  const channelPerf = Object.values(byChannel).filter(c=>c.orders>0);

  const byHour = {};
  list.forEach(o=>{
    const hour = new Date(o.created_at).getHours();
    const bucket = (byHour[hour] ||= {hour:String(hour), revenue:0, orders:0});
    bucket.revenue += Number(o.total); bucket.orders += 1;
  });
  const hourly = Object.values(byHour).sort((a,b)=>Number(a.hour)-Number(b.hour));

  let cash=0, card=0, deliveryPlatform=0;
  list.forEach(o=>{
    const total = Number(o.total);
    if(o.payment_method==='cash') cash += total;
    else if(o.payment_method==='split'){ const cashPart=Number(o.cash_amount||0); cash+=cashPart; card += total-cashPart; }
    else if(o.payment_method==='delivery_platform') deliveryPlatform += total;
    else card += total;
  });
  const paymentBreakdown = [{name:'كاش', amount:cash}, {name:'بطاقة', amount:card}, {name:'توصيل — مدفوع عبر التطبيق', amount:deliveryPlatform}].filter(p=>p.amount>0);

  const { data: rangeExpenses } = await sb.from('general_expenses').select('amount')
    .eq('business_id', businessId).gte('spent_at', from.toISOString()).lt('spent_at', to.toISOString());
  const expensesTotal = (rangeExpenses||[]).reduce((s,e)=>s+Number(e.amount),0);
  const daysInRange = Math.max(1, Math.round((to.getTime()-from.getTime())/86400000));
  const subtotal = netSales - vat;
  const opex = (getMonthlyFixedCostsTotal()/30)*daysInRange + expensesTotal;
  const grossProfit = subtotal - cogs - deliveryPlatformCost;
  const netProfit = grossProfit - opex;

  const salesByShift = {};
  list.forEach(o=>{ if(o.shift_id) salesByShift[o.shift_id] = (salesByShift[o.shift_id]||0) + Number(o.total); });

  return { netSales, ordersCount, avgTicket, sellers, categoryPerf, channelPerf, hourly, paymentBreakdown,
    revenue, discounts, vat, subtotal, cogs, deliveryPlatformCost, opex, grossProfit, netProfit, expensesTotal, salesByShift };
}

function renderSalesRangeSummary(data){
  const el = document.getElementById('salesRangeSummary');
  if(!el) return;
  const profit = data.profit ?? data.netProfit ?? 0;
  const profitUp = profit >= 0;
  const hasDelta = typeof data.salesDelta === 'number' && isFinite(data.salesDelta);
  const deltaUp = hasDelta && data.salesDelta >= 0;
  const walletIcon = '<path d="M17 14h.01"/><path d="M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14"/>';
  const receiptIcon = '<path d="M13 16H8"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>';
  const trendUpIcon = '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7l7 0l0 7"/>';
  const trendDownIcon = '<path d="M3 7l6 6 4-4 8 8"/><path d="M21 10l0 7l-7 0"/>';
  const pillArrowUp = '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>';
  const pillArrowDown = '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>';

  const deltaHtml = !hasDelta ? '' : `
    <div class="sales-kpi-hero-delta ${deltaUp?'up':'down'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">${deltaUp?pillArrowUp:pillArrowDown}</svg>
      ${deltaUp?'+':''}${data.salesDelta.toFixed(0)}%
    </div>`;

  el.innerHTML = `
    <div class="sales-kpi-card sales-kpi-hero">
      <div class="sales-kpi-hero-top">
        <div class="sales-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${walletIcon}</svg></div>
        ${deltaHtml}
      </div>
      <div class="sales-kpi-label">إجمالي المبيعات</div>
      <div class="sales-kpi-value sales-kpi-hero-value mono" title="${data.netSales.toFixed(2)} ر.س">${data.netSales.toFixed(2)} ر.س</div>
    </div>
    <div class="sales-kpi-row">
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${receiptIcon}</svg></div>
        <div class="sales-kpi-label">عدد الطلبات</div>
        <div class="sales-kpi-value mono" title="${data.ordersCount}">${data.ordersCount}</div>
      </div>
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${profitUp?trendUpIcon:trendDownIcon}</svg></div>
        <div class="sales-kpi-label">صافي الأرباح</div>
        <div class="sales-kpi-value mono${profitUp?'':' negative'}" title="${profit.toFixed(2)} ر.س">${profit.toFixed(2)} ر.س</div>
      </div>
    </div>`;
}

function isTodayRange(from, to){
  const today = salesRangeBounds('today');
  return from.getTime() === today.from.getTime() && to.getTime() === today.to.getTime();
}

async function applySalesRange(from, to){
  if(isTodayRange(from, to)){
    renderBestWorstSellers(); renderCategoryPerf(); renderChannelCards(); renderPaymentBreakdown();
    renderSalesRangeSummary({netSales: TODAY.netSales, ordersCount: TODAY.ordersCount, avgTicket: TODAY.avgTicket, profit: TODAY.profit, salesDelta: YESTERDAY.netSales > 0 ? (TODAY.netSales - YESTERDAY.netSales) / YESTERDAY.netSales * 100 : null});
    return;
  }
  const data = await loadSalesRangeData(from, to);
  renderBestWorstSellers(data.sellers);
  renderCategoryPerf(data.categoryPerf);
  renderChannelCards(data.channelPerf);
  renderPaymentBreakdown(data.paymentBreakdown);
  renderSalesRangeSummary(data);
}

function dateInputValue(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

document.getElementById('salesRangePresets').addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-preset]');
  if(!btn) return;
  document.querySelectorAll('#salesRangePresets button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const {from, to} = salesRangeBounds(btn.dataset.preset);
  const toInclusive = new Date(to); toInclusive.setDate(toInclusive.getDate()-1);
  document.getElementById('salesRangeFrom').value = dateInputValue(from);
  document.getElementById('salesRangeTo').value = dateInputValue(toInclusive);
  await applySalesRange(from, to);
});

document.getElementById('salesRangeApplyBtn').addEventListener('click', async ()=>{
  const fromStr = document.getElementById('salesRangeFrom').value;
  const toStr = document.getElementById('salesRangeTo').value;
  if(!fromStr || !toStr){ showToast('اختر تاريخ البداية والنهاية'); return; }
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00'); to.setDate(to.getDate()+1);
  if(from >= to){ showToast('تاريخ البداية لازم يكون قبل أو يساوي تاريخ النهاية'); return; }
  document.querySelectorAll('#salesRangePresets button').forEach(b=>b.classList.remove('active'));
  if(isTodayRange(from, to)) document.querySelector('#salesRangePresets button[data-preset="today"]').classList.add('active');
  await applySalesRange(from, to);
});

(function initSalesRangeInputs(){
  const {from, to} = salesRangeBounds('today');
  const toInclusive = new Date(to); toInclusive.setDate(toInclusive.getDate()-1);
  const fromInput = document.getElementById('salesRangeFrom');
  const toInput = document.getElementById('salesRangeTo');
  if(fromInput) fromInput.value = dateInputValue(from);
  if(toInput) toInput.value = dateInputValue(toInclusive);
})();

/* ============ Home render functions ============ */
/* Real day × hour sales grid — every cell is an actual value pill from real
   orders (WEEK_HOUR_GRID, built in loadWeekTrend()), not a color-only
   heatmap swatch: you read the number directly, tap a cell for the exact
   time range, order count, and how it compares to that hour's usual take. */
function fmtHour12(h){
  const period = h < 12 ? 'ص' : 'م';
  let h12 = h % 12; if(h12 === 0) h12 = 12;
  return h12 + ' ' + period;
}

function renderHourGrid(){
  const el = document.getElementById('hourGridWrap');
  if(!el) return;
  const days = WEEK_HOUR_GRID;
  if(!days || days.length === 0){ el.innerHTML = '<div class="orders-empty">ما فيه مبيعات هالأسبوع بعد</div>'; return; }

  const hourSet = new Set();
  days.forEach(d => Object.keys(d.hours).forEach(h => hourSet.add(Number(h))));
  const hours = Array.from(hourSet).sort((a,b)=>a-b);
  if(hours.length === 0){ el.innerHTML = '<div class="orders-empty">ما فيه مبيعات هالأسبوع بعد</div>'; return; }

  const rowAvg = {};
  hours.forEach(h=>{
    const vals = days.map(d=>d.hours[h]?.total||0).filter(v=>v>0);
    rowAvg[h] = vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
  });
  const allTotals = days.flatMap(d=>Object.values(d.hours).map(h=>h.total));
  const max = Math.max(...allTotals, 0);
  // Three discrete tiers in the brand's own lime family (not a rainbow
  // gradient) — عادي/جيد/ممتاز. Simple to read at a glance: neutral means
  // quiet, lime-deep means solid, full lime means the best hour.
  function tierFor(v){
    const t = max>0 ? v/max : 0;
    if(t > 0.66) return { bg:'var(--lime)', text:'var(--graphite)' };
    if(t > 0.33) return { bg:'var(--lime-deep)', text:'#fff' };
    return { bg:'var(--surf2)', text:'var(--text)' };
  }

  let html = `<div class="hour-grid" style="grid-template-columns:40px repeat(${days.length},1fr);">`;
  html += '<div class="hg-corner"></div>';
  days.forEach(d=> html += `<div class="hg-day-label">${d.day}</div>`);
  hours.forEach(h=>{
    html += `<div class="hg-hour-label">${fmtHour12(h)}</div>`;
    days.forEach(d=>{
      const cell = d.hours[h];
      if(!cell || cell.total<=0){ html += '<div class="hg-cell empty"></div>'; return; }
      const pct = rowAvg[h]>0 ? Math.round(((cell.total-rowAvg[h])/rowAvg[h])*100) : 0;
      const tier = tierFor(cell.total);
      html += `<button type="button" class="hg-cell" style="background:${tier.bg}; color:${tier.text};"
        data-day="${d.day}" data-hour="${h}" data-total="${cell.total.toFixed(2)}" data-count="${cell.count}" data-pct="${pct}">
        <span class="hg-val mono">${Math.round(cell.total)}</span>
      </button>`;
    });
  });
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('.hg-cell:not(.empty)').forEach(cell=>{
    cell.addEventListener('click', (e)=>{ e.stopPropagation(); showHourGridTooltip(cell); });
  });
}

function showHourGridTooltip(cell){
  document.querySelectorAll('.hg-tooltip').forEach(t=>t.remove());
  const day = cell.dataset.day, hour = Number(cell.dataset.hour);
  const total = cell.dataset.total, count = cell.dataset.count, pct = Number(cell.dataset.pct);
  const tip = document.createElement('div');
  tip.className = 'hg-tooltip';
  tip.innerHTML = `
    <div class="hg-tip-time">${fmtHour12(hour)} – ${fmtHour12((hour+1)%24)} · ${day}</div>
    <div class="hg-tip-row"><span class="hg-tip-pct ${pct>=0?'up':'down'}">${pct>=0?'↑':'↓'} ${Math.abs(pct)}٪</span><span class="hg-tip-count">${count} ${count==1?'طلب':'طلبات'}</span></div>
    <div class="hg-tip-total mono">${total} ر.س</div>
  `;
  document.body.appendChild(tip);
  const r = cell.getBoundingClientRect();
  tip.style.left = (r.left + r.width/2) + 'px';
  tip.style.top = (r.top - 8) + 'px';
  requestAnimationFrame(()=> tip.classList.add('show'));
  setTimeout(()=>{
    document.addEventListener('click', function closeTip(){ tip.remove(); document.removeEventListener('click', closeTip); }, {once:true});
  }, 0);
}

function renderBestWorstSellers(sellers){
  sellers = sellers || ALL_SELLERS;
  if(sellers.length === 0){
    document.getElementById('bestSellersList').innerHTML = '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>';
    document.getElementById('worstSellersList').innerHTML = '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>';
    return;
  }
  const sorted = [...sellers].sort((a,b)=>b.revenue-a.revenue);
  const best = sorted.slice(0,4);
  const worst = sorted.slice(-4).reverse();
  document.getElementById('bestSellersList').innerHTML = best.map((p,i)=>
    `<div class="seller-row"><div class="seller-rank best">${i===0?'🏆':i+1}</div><div class="seller-info"><div class="seller-name">${p.name}</div><div class="seller-meta">${p.qty} طلب — ${p.cat}</div></div><div class="seller-value mono">${p.revenue.toFixed(2)}</div></div>`
  ).join('');
  document.getElementById('worstSellersList').innerHTML = worst.map((p,i)=>
    `<div class="seller-row"><div class="seller-rank low">${i+1}</div><div class="seller-info"><div class="seller-name">${p.name}</div><div class="seller-meta">${p.qty} طلب — ${p.cat}</div></div><div class="seller-value low mono">${p.revenue.toFixed(2)}</div></div>`
  ).join('');
}

function renderCategoryPerf(categoryPerf){
  categoryPerf = categoryPerf || CATEGORY_PERF;
  const el = document.getElementById('categoryPerf');
  if(categoryPerf.length === 0){
    el.innerHTML = '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>';
    return;
  }
  // Calmer than a bar+track+badge stack: one line per category, a subtle
  // proportional color wash behind the text instead of a separate bar row.
  const ranked = [...categoryPerf].sort((a,b)=>b.revenue-a.revenue);
  const max = ranked[0].revenue;
  const COLORS = ['var(--acc-ops)','var(--acc-res)','var(--acc-fin)','var(--acc-team)','var(--acc-ai)'];
  el.innerHTML = ranked.map((c,i)=>{
    const pct = Math.round((c.revenue/max)*100);
    const color = COLORS[i%5];
    return `<div class="perf-row-clean">
      <div class="fill" style="width:${pct}%; background:${color};"></div>
      <div class="perf-row-content">
        <span class="name"><span class="dot" style="background:${color};"></span>${c.name}</span>
        <span class="value mono">${c.revenue.toFixed(2)} ر.س</span>
      </div>
    </div>`;
  }).join('');
}

function renderPaymentBreakdown(breakdown){
  breakdown = breakdown || PAYMENT_BREAKDOWN;
  const el = document.getElementById('paymentBreakdown');
  const total = breakdown.reduce((s,p)=>s+p.amount,0);
  if(total === 0){
    el.innerHTML = '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>';
    return;
  }
  const DONUT_COLORS = ['var(--acc-ops)','var(--acc-res)','var(--acc-fin)','var(--acc-team)','var(--acc-ai)'];
  const r = 50, circumference = 2*Math.PI*r;
  let cumulative = 0;
  const segments = breakdown.map((p,i)=>{
    const share = p.amount/total;
    const segLen = share*circumference;
    const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${DONUT_COLORS[i%5]}" stroke-width="16"
      stroke-dasharray="${segLen} ${circumference}" stroke-dashoffset="${-cumulative}" stroke-linecap="butt"/>`;
    cumulative += segLen;
    return seg;
  }).join('');
  const legend = breakdown.map((p,i)=>{
    const share = ((p.amount/total)*100).toFixed(0);
    return `<div class="donut-legend-row"><span class="donut-swatch" style="background:${DONUT_COLORS[i%5]}"></span>
      <span class="donut-legend-name">${p.name}</span><span class="donut-legend-val mono">${share}٪</span></div>`;
  }).join('');
  el.innerHTML = `<div class="donut-wrap">
    <svg class="donut-svg" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surf2)" stroke-width="16"/>
      ${segments}
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

function renderChannelCards(channelPerf){
  channelPerf = channelPerf || CHANNEL_PERF;
  if(channelPerf.length === 0){
    document.getElementById('channelCards').innerHTML = '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>';
    return;
  }
  const icons = {
    'داخل المطعم':'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'سفري':'<path d="M20 12v-2a2 2 0 0 0-2-2h-2m-8 0H6a2 2 0 0 0-2 2v2m0 4v2a2 2 0 0 0 2 2h2m8 0h2a2 2 0 0 0 2-2v-2"/>',
    'توصيل':'<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'
  };
  document.getElementById('channelCards').innerHTML = channelPerf.map((c,i)=>
    `<div class="channel-card" data-c="${i%3}">
      <div class="channel-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[c.name]||''}</svg></div>
      <div class="channel-card-name">${c.name}</div>
      <div class="channel-card-value mono">${c.revenue.toFixed(2)}</div>
      <div class="channel-card-sub">${c.orders} طلب</div>
    </div>`
  ).join('');
}

/* ============ Operations Center ============ */
/* ============ Orders screen ============ */
const ORDER_STATUS_LABELS = {completed:'مكتمل', cancelled:'ملغى', refunded:'مسترجع', voided:'ملغى صنف'};
let orderStatusFilter = 'all', orderSearchQuery = '';
let orderDateRange = '7d';

/* orders.status in the DB only ever holds completed/cancelled/refunded — there is
   no per-order "voided" status (that concept is item-level, not modeled yet), so
   the voided card is real but will always read 0 until that's built. */
function computeOrderStatusCounts(){
  const counts = { completed: 0, cancelled: 0, refunded: 0, voided: 0 };
  RECENT_ORDERS.forEach(o=>{ if(counts[o.status] !== undefined) counts[o.status]++; });
  ORDER_STATUS_COUNTS = counts;
}

function renderOrderStatusGrid(){
  // Orders' own visual language: status = color, not a neutral card with an
  // accent border. Same 4 semantic tokens the status tags already use
  // (success/danger/amber/muted), just carried through boldly here so the
  // grid reads at a glance like a traffic light, not a stat sheet.
  const cards = [
    {key:'completed', label:'مكتملة', icon:'<path d="M9 12l2 2l4 -4"/><path d="M21 12a9 9 0 1 1 -18 0a9 9 0 0 1 18 0"/>'},
    {key:'cancelled', label:'ملغاة', icon:'<path d="M21 12a9 9 0 1 1 -18 0a9 9 0 0 1 18 0"/><path d="M10 10l4 4m0 -4l-4 4"/>'},
    {key:'refunded', label:'مسترجعة', icon:'<path d="M9 13l-4 -4l4 -4"/><path d="M5 9h7a4 4 0 1 1 0 8h-1"/>'},
    {key:'voided', label:'ملغاة الصنف', icon:'<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M5.7 5.7l12.6 12.6"/>'}
  ];
  document.getElementById('orderStatusGrid').innerHTML = cards.map(c=>
    `<div class="order-status-card ${c.key}">
      <div class="osc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${c.icon}</svg></div>
      <div class="osc-body">
        <div class="osc-count mono">${ORDER_STATUS_COUNTS[c.key]}</div>
        <div class="osc-label">${c.label}</div>
      </div>
    </div>`
  ).join('');
}

function orderDateRangeCutoff(range){
  const now = new Date();
  switch(range){
    case 'month': { const d = new Date(now.getFullYear(), now.getMonth(), 1); return d.toISOString(); }
    case '3m': { const d = new Date(now); d.setMonth(d.getMonth()-3); return d.toISOString(); }
    case '6m': { const d = new Date(now); d.setMonth(d.getMonth()-6); return d.toISOString(); }
    case '1y': { const d = new Date(now); d.setFullYear(d.getFullYear()-1); return d.toISOString(); }
    case '7d':
    default: { const d = new Date(now); d.setDate(d.getDate()-7); return d.toISOString(); }
  }
}

function renderOrdersTable(){
  let rows = RECENT_ORDERS;
  if(orderStatusFilter !== 'all') rows = rows.filter(o=>o.status===orderStatusFilter);
  if(orderSearchQuery.trim()) rows = rows.filter(o=>o.id.includes(orderSearchQuery.trim()));

  const head = `<div class="order-row head"><span>رقم الطلب</span><span>التاريخ</span><span>النوع</span><span>الأصناف</span><span>الإجمالي</span><span>الدفع</span><span>الحالة</span></div>`;
  if(rows.length === 0){
    document.getElementById('ordersTable').innerHTML = head + '<div class="orders-empty">ما فيه طلبات مطابقة</div>';
    return;
  }
  document.getElementById('ordersTable').innerHTML = head + rows.map(o=>
    `<div class="order-row" data-order-id="${o.id.replace('#','')}" style="cursor:pointer;">
      <span class="order-id mono">${o.id}</span>
      <span class="mono" style="line-height:1.4;">${o.date}<br><span style="color:var(--muted); font-weight:600;">${o.time}</span></span>
      <span>${o.type}${o.isOnline ? ' <span title="طلب إلكتروني" style="font-size:11px;">🌐</span>' : ''}</span>
      <span>${o.items}</span>
      <span class="order-total">${o.total.toFixed(2)}</span>
      <span>${o.payment}</span>
      <span class="order-status-tag ${o.status}">${ORDER_STATUS_LABELS[o.status]}</span>
    </div>`
  ).join('');
  document.getElementById('ordersTable').querySelectorAll('.order-row:not(.head)').forEach(row=>{
    row.addEventListener('click', ()=> openOrderDetailModal(row.dataset.orderId));
  });
}

async function openOrderDetailModal(orderId){
  const modal = document.getElementById('orderDetailModal');
  const body = document.getElementById('orderDetailModalBody');
  document.getElementById('orderDetailModalTitle').textContent = 'تفاصيل الطلب #' + orderId;
  body.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">جاري التحميل...</p>';
  modal.classList.add('show');

  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).single(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  if(!order){ body.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">تعذر تحميل الطلب.</p>'; return; }

  const itemsHtml = (items||[]).map(it=>{
    const product = MENU_ITEMS.find(m=>m.id===it.menu_item_id);
    const name = escapeHtml(product ? product.name : ('منتج #' + it.menu_item_id));
    const mods = (it.selected_modifiers||[]).map(m=>escapeHtml(m.option_name || m.text)).filter(Boolean).join('، ');
    return `<div class="cpb-row"><span>${it.qty} × ${name}${mods ? ' (' + mods + ')' : ''}${it.note ? ' — ' + escapeHtml(it.note) : ''}</span><span class="mono">${Number(it.line_total).toFixed(2)}</span></div>`;
  }).join('');

  const isOnline = order.source === 'online';
  const hasLocation = order.channel === 'delivery' && order.customer_lat != null && order.customer_lng != null;
  const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${order.customer_lat},${order.customer_lng}` : null;
  const waMessage = `مرحبًا ${order.customer_name || ''}! طلبك رقم #${order.id} جاري تجهيزه وراح يوصلك بأقرب وقت 🚴`;
  const waPhone = (order.customer_phone || '').replace(/\D/g, '');
  const waUrl = waPhone ? `https://wa.me/${waPhone.startsWith('966') ? waPhone : '966' + waPhone.replace(/^0/, '')}?text=${encodeURIComponent(waMessage)}` : null;

  body.innerHTML = `
    ${isOnline ? `<div class="cost-preview-box" style="margin-bottom:14px; background:color-mix(in srgb, var(--lime, #C4FF2B) 14%, transparent); border:1px solid color-mix(in srgb, var(--lime, #C4FF2B) 35%, transparent);">
      <div class="cpb-row"><span style="font-weight:800;">🌐 طلب إلكتروني — من متجر المطعم مباشرة</span><span></span></div>
    </div>` : ''}
    <div class="cost-preview-box" style="margin-bottom:14px;">
      <div class="cpb-row"><span>التاريخ</span><span class="mono">${new Date(order.created_at).toLocaleString('ar-SA')}</span></div>
      <div class="cpb-row"><span>النوع</span><span class="mono">${ORDER_CHANNEL_TYPE_LABELS[order.channel] || order.channel}</span></div>
      ${order.customer_name ? `<div class="cpb-row"><span>العميل</span><span class="mono">${escapeHtml(order.customer_name)}</span></div>` : ''}
      ${order.customer_phone ? `<div class="cpb-row"><span>جوال العميل</span><span class="mono">${escapeHtml(order.customer_phone)}</span></div>` : ''}
      ${order.delivery_address ? `<div class="cpb-row"><span>عنوان التوصيل</span><span class="mono">${escapeHtml(order.delivery_address)}</span></div>` : ''}
      <div class="cpb-row"><span>الحالة</span><span class="mono">${ORDER_STATUS_LABELS[order.status] || order.status}</span></div>
      ${order.channel === 'delivery' ? `
      ${order.platform_invoice_last4 ? `<div class="cpb-row"><span>فاتورة المنصة</span><span class="mono">...${order.platform_invoice_last4}</span></div>` : ''}
      <div class="cpb-row"><span>التجهيز</span><span class="mono">${order.ready_at
        ? 'جهز خلال ' + Math.floor((order.prep_duration_seconds||0)/60) + 'د ' + ((order.prep_duration_seconds||0)%60) + 'ث'
        : 'قيد التجهيز'}</span></div>` : ''}
    </div>
    ${hasLocation ? `
    <div class="cost-preview-box" style="margin-bottom:14px; text-align:center;">
      <div style="font-weight:800; font-size:12.5px; margin-bottom:10px;">📍 موقع العميل — للمندوب</div>
      <img src="/api/qr?data=${encodeURIComponent(mapsUrl)}" alt="QR موقع العميل" style="width:120px; height:120px; margin:0 auto 10px; display:block;">
      <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="mtr-edit-btn" style="display:inline-block; text-decoration:none; margin-bottom:8px;">فتح بخرائط جوجل</a>
      ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="settings-save-btn" style="display:block; text-decoration:none; background:#25D366;">📱 إرسال تحديث للعميل عبر واتساب</a>` : ''}
    </div>` : ''}
    <div class="cost-preview-box">
      ${itemsHtml}
      <div class="cpb-row"><span>المجموع الفرعي</span><span class="mono">${Number(order.subtotal).toFixed(2)}</span></div>
      ${order.delivery_fee > 0 ? `<div class="cpb-row"><span>رسوم التوصيل</span><span class="mono">${Number(order.delivery_fee).toFixed(2)}</span></div>` : ''}
      ${order.discount_amount > 0 ? `<div class="cpb-row"><span>الخصم</span><span class="mono">-${Number(order.discount_amount).toFixed(2)}</span></div>` : ''}
      <div class="cpb-row"><span>الضريبة</span><span class="mono">${Number(order.vat_amount).toFixed(2)}</span></div>
      <div class="cpb-row total"><span>الإجمالي</span><span class="mono">${Number(order.total).toFixed(2)} ر.س</span></div>
      <div class="cpb-row"><span>طريقة الدفع</span><span class="mono">${ORDER_PAYMENT_LABELS[order.payment_method] || order.payment_method}</span></div>
    </div>
    ${order.status === 'completed' ? `
    <div class="product-edit-footer" style="margin-top:14px; padding-top:0; border-top:none;">
      <span></span>
      <button class="mtr-edit-btn" id="refundOrderBtn" style="color:var(--danger, #a3402c); border-color:var(--danger, #a3402c);">استرجاع مبلغ الطلب</button>
    </div>` : ''}
  `;
  const refundBtn = document.getElementById('refundOrderBtn');
  if(refundBtn){
    refundBtn.addEventListener('click', async ()=>{
      if(!window.confirm('متأكد إنك تبي تسترجع مبلغ هذا الطلب؟')) return;
      refundBtn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('refund_pos_order', { p_order_id: orderId });
        if(error) throw error;
        logDashboardAudit('استرجع مبلغ الطلب #' + orderId);
        showToast('تم استرجاع مبلغ الطلب');
        await loadOrdersAndTables();
        computeOrderStatusCounts();
        renderOrderStatusGrid();
        renderOrdersTable();
        openOrderDetailModal(orderId);
      } catch(err){
        showToast('تعذر الاسترجاع: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        refundBtn.disabled = false;
      }
    });
  }
}
document.getElementById('orderDetailModalClose').addEventListener('click', ()=>{
  document.getElementById('orderDetailModal').classList.remove('show');
});

document.getElementById('orderStatusTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.seg-tab'); if(!btn) return;
  document.querySelectorAll('#orderStatusTabs .seg-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  orderStatusFilter = btn.dataset.status;
  renderOrdersTable();
});
document.getElementById('orderSearchInput').addEventListener('input', (e)=>{
  orderSearchQuery = e.target.value;
  renderOrdersTable();
});
document.getElementById('orderDateRangeSelect').addEventListener('change', async (e)=>{
  orderDateRange = e.target.value;
  await loadOrdersAndTables();
  computeOrderStatusCounts();
  renderOrderStatusGrid();
  renderOrdersTable();
  renderTablesFloorGrid();
});

/* ============ Table Management — occupied tables link to real dine-in orders from RECENT_ORDERS,
   not invented data. Table #7 is intentionally seated-but-not-yet-ordered (a real, common floor state). */
let TABLE_SECTIONS = []; // real table_sections for this business — populated by loadOrdersAndTables()
let TABLES_TURN_TIME_MINUTES = 45; // businesses.tables_turn_time_minutes — populated by loadOrdersAndTables()
// Traffic-light severity for how long a table's been sitting in its current
// state — mirrors the identical helper in rakeen-pos.js (two small,
// clearly cross-referenced copies rather than a shared engine file the two
// independently-loaded scripts have no load-order guarantee over).
function turnTimerSeverityClass(mins){
  if(mins > TABLES_TURN_TIME_MINUTES * 1.5) return ' over';
  if(mins > TABLES_TURN_TIME_MINUTES) return ' warn';
  return ' ok';
}
let TABLES = [
  {number:1, status:'serving', orderId:'#1096'},
  {number:2, status:'available'},
  {number:3, status:'awaiting_payment', orderId:'#1093'},
  {number:4, status:'reserved'},
  {number:5, status:'available'},
  {number:6, status:'cleaning'},
  {number:7, status:'awaiting_order', orderId:null},
  {number:8, status:'available'},
  {number:9, status:'available'},
  {number:10, status:'reserved'},
  {number:11, status:'available'},
  {number:12, status:'available'}
];
const TABLE_STATUS_LABEL = {available:'فارغة', awaiting_order:'بانتظار الطلب', serving:'قيد التقديم', awaiting_payment:'بانتظار الدفع', reserved:'محجوزة', cleaning:'تحتاج تنظيف'};

function renderTablesFloorGrid(){
  // Meta line only ever shows real data — the table's linked order total via
  // active_order_id. No guest-count/seated-time here: restaurant_tables has
  // no columns for those, so a field this screen can't back with a real
  // value doesn't get a UI slot.
  const tableBtnHtml = (t) => {
    let meta = '';
    if((t.status === 'serving' || t.status === 'awaiting_payment') && t.orderId){
      const order = RECENT_ORDERS.find(o=>o.id===t.orderId);
      if(order) meta = `<span class="ft-meta mono">${order.total.toFixed(2)} ر.س</span>`;
    }
    // Same green/amber/red read as the cashier's own Tables screen — an
    // owner checking the floor remotely sees at a glance not just that a
    // table's stuck, but roughly how overdue, without opening the detail panel.
    let turnBadge = '';
    if(t.statusChangedAt && t.status !== 'available'){
      const mins = Math.floor((Date.now() - new Date(t.statusChangedAt).getTime()) / 60000);
      turnBadge = `<span class="ft-turn-timer${turnTimerSeverityClass(mins)}">${mins < 1 ? 'الآن' : mins + ' د'}</span>`;
    }
    return `<button class="floor-table ${t.status}" data-table="${t.number}">
      ${(t.status === 'serving' || t.status === 'awaiting_payment') ? '<span class="ft-live-dot"></span>' : ''}
      <span class="ft-num">${t.number}</span>
      <span class="ft-status">${TABLE_STATUS_LABEL[t.status]}</span>
      ${meta}
      ${turnBadge}
    </button>`;
  };

  // Read-only grouping, mirrors the POS Tables screen — status itself still
  // only ever changes from the cashier device (see the note in
  // showTableDetail below), this just organizes the same live data the same
  // way so the owner sees a matching picture from their phone.
  let groups;
  if(!TABLE_SECTIONS.length){
    groups = [{section: null, tables: TABLES}];
  } else {
    const bySection = {};
    TABLES.forEach(t => { const key = t.sectionId || 'none'; (bySection[key] = bySection[key] || []).push(t); });
    groups = TABLE_SECTIONS.map(s => ({section: s, tables: bySection[s.id] || []})).filter(g => g.tables.length);
    if(bySection.none && bySection.none.length) groups.push({section: {id: null, name: 'بدون قسم'}, tables: bySection.none});
  }

  document.getElementById('tablesFloorGrid').innerHTML = groups.map(g => {
    let html = '';
    if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}</span></div>`;
    return html + g.tables.map(tableBtnHtml).join('');
  }).join('');
  document.querySelectorAll('.floor-table').forEach(btn=>{
    btn.addEventListener('click', ()=> showTableDetail(parseInt(btn.dataset.table)));
  });
}

function showTableDetail(tableNumber){
  const t = TABLES.find(x=>x.number===tableNumber);
  document.querySelectorAll('.floor-table').forEach(b=> b.classList.toggle('selected', parseInt(b.dataset.table)===tableNumber));
  const panel = document.getElementById('tableDetailPanel');
  let bodyHtml = `<div class="tdp-row"><span>الحالة</span><span class="mono">${TABLE_STATUS_LABEL[t.status]}</span></div>`;
  if(t.statusChangedAt && t.status !== 'available'){
    const mins = Math.floor((Date.now() - new Date(t.statusChangedAt).getTime()) / 60000);
    bodyHtml += `<div class="tdp-row"><span>منذ</span><span class="mono ft-turn-timer${turnTimerSeverityClass(mins)}">${mins < 1 ? 'الآن' : mins + ' د'}</span></div>`;
  }

  if(t.orderId){
    const order = RECENT_ORDERS.find(o=>o.id===t.orderId);
    if(order){
      bodyHtml += `<div class="tdp-row"><span>رقم الطلب</span><span class="mono">${order.id}</span></div>`;
      bodyHtml += `<div class="tdp-row"><span>عدد الأصناف</span><span class="mono">${order.items}</span></div>`;
      bodyHtml += `<div class="tdp-row"><span>الإجمالي</span><span class="mono">${order.total.toFixed(2)} ر.س</span></div>`;
    }
  }
  bodyHtml += `<div class="tdp-row"><span>تبديل الحالة من</span><span class="mono">الكاشير</span></div>`;

  panel.innerHTML = `<div class="tdp-head"><span class="tdp-title">طاولة ${tableNumber}</span><button class="tdp-close" id="tdpCloseBtn">✕</button></div>` + bodyHtml;
  panel.style.display = 'block';
  document.getElementById('tdpCloseBtn').addEventListener('click', ()=>{
    panel.style.display = 'none';
    document.querySelectorAll('.floor-table').forEach(b=> b.classList.remove('selected'));
  });
}

function renderOrdersByType(){
  const el = document.getElementById('ordersByType');
  const total = CHANNEL_PERF.reduce((s,c)=>s+c.orders,0);
  if(total === 0){ el.innerHTML = '<div class="orders-empty">ما فيه طلبات بهالفترة</div>'; return; }
  const COLORS = ['var(--acc-ops)','var(--acc-res)','var(--acc-fin)','var(--acc-team)','var(--acc-ai)'];
  const COLORS_BG = ['var(--acc-ops-bg)','var(--acc-res-bg)','var(--acc-fin-bg)','var(--acc-team-bg)','var(--acc-ai-bg)'];
  const ranked = [...CHANNEL_PERF].sort((a,b)=>b.orders-a.orders);
  const r = 50, circumference = 2*Math.PI*r;
  let cumulative = 0;
  const segments = ranked.map((c,i)=>{
    const share = c.orders/total;
    const segLen = share*circumference;
    const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${COLORS[i%5]}" stroke-width="16"
      stroke-dasharray="${segLen} ${circumference}" stroke-dashoffset="${-cumulative}" stroke-linecap="butt"/>`;
    cumulative += segLen;
    return seg;
  }).join('');
  const legend = ranked.map((c,i)=>{
    const share = ((c.orders/total)*100).toFixed(0);
    const color = COLORS[i%5], bg = COLORS_BG[i%5];
    return `<div class="donut-legend-row"><span class="donut-swatch" style="background:${color}"></span>
      <span class="donut-legend-name">${c.name}</span>
      <span class="donut-legend-stats">
        <span class="donut-legend-count mono">${c.orders} طلب</span>
        <span class="donut-legend-pct mono" style="background:${bg}; color:${color};">${share}٪</span>
      </span></div>`;
  }).join('');
  el.innerHTML = `<div class="donut-wrap">
    <svg class="donut-svg" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surf2)" stroke-width="16"/>
      ${segments}
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

function renderOrdersBySource(){
  const deliveryTotal = CHANNEL_PERF.find(c=>c.name==='توصيل')?.orders || 0;
  const walkInTotal = CHANNEL_PERF.filter(c=>c.name!=='توصيل').reduce((s,c)=>s+c.orders,0);
  // split delivery orders across the connected platforms proportionally to keep this illustrative but non-arbitrary
  const onlinePlatforms = DELIVERY_PLATFORMS_STATUS.filter(p=>p.online);
  const perPlatform = onlinePlatforms.length > 0 ? Math.floor(deliveryTotal / onlinePlatforms.length) : 0;
  const remainder = deliveryTotal - perPlatform*onlinePlatforms.length;
  const sources = [{name:'زبون مباشر (بدون تطبيق)', orders:walkInTotal}]
    .concat(onlinePlatforms.map((p,i)=>({name:p.name, orders: perPlatform + (i < remainder ? 1 : 0)})));
  const el = document.getElementById('ordersBySource');
  const total = sources.reduce((s,x)=>s+x.orders,0);
  if(total === 0){ el.innerHTML = '<div class="orders-empty">ما فيه طلبات بهالفترة</div>'; return; }
  const ranked = [...sources].sort((a,b)=>b.orders-a.orders);
  const COLORS = ['var(--acc-ops)','var(--acc-res)','var(--acc-fin)','var(--acc-team)','var(--acc-ai)'];
  const COLORS_BG = ['var(--acc-ops-bg)','var(--acc-res-bg)','var(--acc-fin-bg)','var(--acc-team-bg)','var(--acc-ai-bg)'];
  const r = 50, circumference = 2*Math.PI*r;
  let cumulative = 0;
  const segments = ranked.map((s,i)=>{
    const share = s.orders/total;
    const segLen = share*circumference;
    const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${COLORS[i%5]}" stroke-width="16"
      stroke-dasharray="${segLen} ${circumference}" stroke-dashoffset="${-cumulative}" stroke-linecap="butt"/>`;
    cumulative += segLen;
    return seg;
  }).join('');
  const legend = ranked.map((s,i)=>{
    const share = ((s.orders/total)*100).toFixed(0);
    const color = COLORS[i%5], bg = COLORS_BG[i%5];
    return `<div class="donut-legend-row"><span class="donut-swatch" style="background:${color}"></span>
      <span class="donut-legend-name">${s.name}</span>
      <span class="donut-legend-stats">
        <span class="donut-legend-count mono">${s.orders} طلب</span>
        <span class="donut-legend-pct mono" style="background:${bg}; color:${color};">${share}٪</span>
      </span></div>`;
  }).join('');
  el.innerHTML = `<div class="donut-wrap">
    <svg class="donut-svg" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surf2)" stroke-width="16"/>
      ${segments}
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

/* ============ Inventory screen ============ */
function realFoodCostPct(){
  return ACCOUNTING.subtotal > 0 ? Math.round(ACCOUNTING.cogs/ACCOUNTING.subtotal*100) : null;
}
function renderWasteAndFoodCost(){
  // The old "نسبة الهدر" (waste %) card was a hardcoded constant
  // (WASTE_STATS = {pct:7, monthlyCost:3200}) shown as if real on every
  // business's dashboard — there's no actual waste-logging feature behind
  // it. Swapped for something equally useful in the same slot that's
  // fully real: total value currently sitting in stock, computed straight
  // from STOCK_ITEMS, plus how many items are running low.
  const stockValuePanel = document.getElementById('stockValuePanel');
  const totalValue = STOCK_ITEMS.reduce((s,i)=> s + Math.max(0, i.qtyOnHand) * i.unitCost, 0);
  const lowItems = STOCK_ITEMS.filter(i => computeStockTier(computeStockPct(i)) !== 'ok');
  document.getElementById('stockValueAmount').textContent = totalValue.toFixed(2) + ' ر.س';
  document.getElementById('stockValueDetail').textContent = lowItems.length > 0
    ? lowItems.length + (lowItems.length===1 ? ' صنف منخفض يحتاج انتباه' : ' أصناف منخفضة تحتاج انتباه')
    : 'كل أصنافك بمستوى جيد';
  if(stockValuePanel){
    stockValuePanel.classList.remove('ok','warn','critical');
    stockValuePanel.classList.add(lowItems.some(i=>computeStockTier(computeStockPct(i))==='critical') ? 'critical' : lowItems.length>0 ? 'warn' : 'ok');
  }

  const foodCostPanel = document.getElementById('foodCostPanel');
  const realPct = realFoodCostPct();
  document.getElementById('foodCostPct').textContent = (realPct ?? FOOD_COST_STATS.pct) + '٪';
  document.getElementById('foodCostDetail').textContent = realPct === null
    ? 'بعد أول عملية بيع بيصير هذا الرقم حقيقي'
    : realPct <= 33 ? 'ضمن المعدل الصحي لمطاعم الكوفي (٢٨-٣٣٪)' : 'أعلى من المعدل الصحي لمطاعم الكوفي (٢٨-٣٣٪) — راجع تكلفة وصفاتك';
  if(foodCostPanel){
    foodCostPanel.classList.remove('ok','warn','critical');
    foodCostPanel.classList.add(realPct === null ? 'ok' : realPct <= 33 ? 'ok' : 'warn');
  }
}

/* ============ Today's real consumption — computed from actual units sold (ALL_SELLERS) x each
   recipe's quantities, unit-converted to the stock item's own tracking unit. This is the literal
   "an order came in, deduct it from what's registered in inventory" connection. */
function computeTodayConsumption(stockItemName){
  const stockItem = STOCK_ITEMS.find(s=>s.name===stockItemName);
  if(!stockItem) return {totalQty:0, orderCount:0};
  let totalQty = 0, orderCount = 0;
  MENU_ITEMS.forEach(item=>{
    if(!item.linkInventory || item.costMode!=='recipe') return;
    const sold = ALL_SELLERS.find(a=>a.name===item.name);
    if(!sold) return;
    (item.recipe||[]).forEach(r=>{
      if(r.ingredient !== stockItemName) return;
      totalQty += convertToUnit(r.qty, r.unit, stockItem.unit) * sold.qty;
      orderCount += sold.qty;
    });
  });
  return {totalQty, orderCount};
}

function stockRowHtml(s, usedInMap){
  const usedBy = usedInMap[s.name];
  const pct = computeStockPct(s);
  const tier = computeStockTier(pct);
  const consumption = computeTodayConsumption(s.name);
  // A negative qty_on_hand (consumption recorded exceeding what was ever
  // purchased, or a data-entry error) is otherwise invisible — the stock
  // bar clamps to 0% same as a legitimately-empty item, so nothing visually
  // distinguishes "genuinely out of stock" from "the numbers don't add up
  // and need investigation." Confirmed this is a real, live case, not
  // hypothetical.
  const negativeWarning = s.qtyOnHand < 0
    ? `<div class="mtr-negative-warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M10.4 3.9 1.7 18a2 2 0 0 0 1.7 3h17.2a2 2 0 0 0 1.7-3L13.6 3.9a2 2 0 0 0-3.2 0z"/><path d="M12 16h.01"/></svg>الكمية سالبة (${s.qtyOnHand} ${UNIT_LABELS[s.unit]}) — راجع سجل المشتريات والاستهلاك لهذا الصنف</div>`
    : '';
  return `<div class="menu-table-row" data-id="${s.id}">
      <div class="mtr-product">
        <div class="mtr-name-col">
          <div class="mtr-name">${s.name}</div>
          <div class="mtr-meta">${s.qtyOnHand} من ${s.parLevel} ${UNIT_LABELS[s.unit]} متبقي${consumption.totalQty>0 ? ' — استهلك اليوم '+consumption.totalQty.toFixed(consumption.totalQty<10?2:0)+' '+UNIT_LABELS[s.unit]+' ('+consumption.orderCount+' طلب)' : ''}</div>
          ${negativeWarning}
        </div>
      </div>
      <div class="mtr-price mono">${formatUnitCost(s.unitCost)} / ${UNIT_LABELS[s.unit]}</div>
      <div class="mtr-stock-bar-cell">
        <div class="stock-bar-track"><div class="stock-bar-fill ${tier}" style="width:${pct}%"></div></div>
        <span class="mtr-stock-pct mono">${pct}٪</span>
      </div>
      <div class="mth-col-modused"><span class="mtr-mod-used">${usedBy ? '<b>'+usedBy.length+'</b> منتج' : 'غير مرتبط'}</span></div>
      <div class="mtr-action"><button class="mtr-edit-btn" data-id="${s.id}">تعديل</button></div>
    </div>`;
}
let stockSearchQuery = '';
let stockAttentionFilter = 'all';
// Collapsed state persists across re-renders (search, filter toggles) so
// folding away "تغليف" while you work through raw materials doesn't keep
// popping back open.
let stockCatCollapsed = {raw:false, packaging:false};
function needsStockAttention(s){ return computeStockTier(computeStockPct(s)) !== 'ok'; }

function stockCatGroupHtml(key, label, items, usedInMap){
  if(items.length === 0) return '';
  const collapsed = stockCatCollapsed[key];
  return `
    <div class="stock-cat-group">
      <button type="button" class="stock-cat-toggle" data-cat="${key}">
        <span>${label} <span class="stock-cat-count">${items.length}</span></span>
        <svg class="stock-cat-chevron ${collapsed?'':'open'}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="stock-cat-body ${collapsed?'hidden':''}">
        ${items.map(s=>stockRowHtml(s, usedInMap)).join('')}
      </div>
    </div>`;
}

function renderStockTable(){
  const usedInMap = getUsedInMap();
  const el = document.getElementById('stockTable');
  if(!el) return;
  const q = stockSearchQuery.trim();
  let filtered = q ? STOCK_ITEMS.filter(s=>s.name.includes(q)) : STOCK_ITEMS;
  if(stockAttentionFilter === 'attention') filtered = filtered.filter(needsStockAttention);

  const attentionCountEl = document.getElementById('stockAttentionCount');
  if(attentionCountEl) attentionCountEl.textContent = '(' + STOCK_ITEMS.filter(needsStockAttention).length + ')';

  if(filtered.length === 0){
    el.innerHTML = `<div class="menu-table-empty">${q ? 'ما فيه أصناف تطابق هذا البحث.' : 'كل أصنافك بمستوى جيد — ما فيه شي يحتاج انتباه الحين.'}</div>`;
    return;
  }
  const raw = filtered.filter(s=>s.category!=='packaging');
  const packaging = filtered.filter(s=>s.category==='packaging');
  el.innerHTML = stockCatGroupHtml('raw', 'مواد خام أساسية', raw, usedInMap) + stockCatGroupHtml('packaging', 'تغليف ومستلزمات', packaging, usedInMap);

  el.querySelectorAll('.menu-table-row').forEach(row=>{
    row.addEventListener('click', ()=> openStockItemModal(parseInt(row.dataset.id)));
  });
  el.querySelectorAll('.stock-cat-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const key = btn.dataset.cat;
      stockCatCollapsed[key] = !stockCatCollapsed[key];
      renderStockTable();
    });
  });
}

let stockModalState = {};
let editingStockId = null;

function openStockItemModal(stockId){
  editingStockId = stockId || null;
  const existing = stockId ? STOCK_ITEMS.find(s=>s.id===stockId) : null;
  stockModalState = existing
    ? {name:existing.name, unit:existing.unit, unitCost:existing.unitCost, qtyOnHand:existing.qtyOnHand, parLevel:existing.parLevel, duration:existing.duration, category:existing.category||'raw'}
    : {name:'', unit:'kg', unitCost:0, qtyOnHand:0, parLevel:0, duration:'يكفي فترة كافية', category:'raw'};

  document.getElementById('stockItemModalTitle').textContent = existing ? 'تعديل: ' + existing.name : 'إضافة صنف جديد';
  document.getElementById('stockItemDeleteLink').style.display = existing ? 'block' : 'none';
  const consumption = existing ? computeTodayConsumption(existing.name) : {totalQty:0, orderCount:0};
  document.getElementById('stockItemModalBody').innerHTML = `
    <div class="menu-add-field" style="margin-bottom:14px;"><label>اسم الصنف</label><input type="text" id="siName" value="${stockModalState.name}" placeholder="مثال: زيت زيتون"></div>
    <div class="menu-add-field" style="margin-bottom:16px; max-width:260px;"><label class="field-label-row">نوع الصنف ${helpIcon('مواد خام: أي شي مأكول أو مشروب يدخل بوصفة (لحم، جبن، خضار...). تغليف ومستلزمات: أكياس، كراتين، أكواب، ملاعق — أي شي تغليف مو أكل. هذا التصنيف يفصلهم بجدول المخزون عشان يكون مرتب.')}</label>
      <select id="siCategory">
        <option value="raw" ${stockModalState.category==='raw'?'selected':''}>مادة خام أساسية</option>
        <option value="packaging" ${stockModalState.category==='packaging'?'selected':''}>تغليف ومستلزمات</option>
      </select>
    </div>
    <div class="menu-add-row" style="margin-bottom:16px;">
      <div class="menu-add-field"><label>وحدة الشراء</label>
        <select id="siUnit">
          <option value="kg" ${stockModalState.unit==='kg'?'selected':''}>كيلوغرام</option>
          <option value="g" ${stockModalState.unit==='g'?'selected':''}>غرام</option>
          <option value="liter" ${stockModalState.unit==='liter'?'selected':''}>لتر</option>
          <option value="piece" ${stockModalState.unit==='piece'?'selected':''}>حبة</option>
        </select>
      </div>
      <div class="menu-add-field"><label id="siCostLabel">تكلفة ${UNIT_LABELS[stockModalState.unit]} الواحد (ر.س)</label><input type="number" id="siUnitCost" value="${stockModalState.unitCost}" step="0.01"></div>
    </div>

    <div class="menu-add-field" style="margin-bottom:6px;"><label>${existing ? 'الكمية المتوفرة الآن' : 'كم عندك الآن؟ (بتصير ١٠٠٪)'}</label><input type="number" id="siQtyOnHand" value="${stockModalState.qtyOnHand}" step="0.1"></div>
    <div class="stock-live-bar-box" id="siLiveBarBox"></div>

    ${existing ? `
    <div class="advanced-section" style="margin-top:16px;">
      <div class="advanced-toggle-row" id="parAdvancedToggle">
        <div class="panel-subtitle">توريد اليوم أقل من المعتاد؟ (اختياري)</div>
        <svg class="advanced-chevron" id="parAdvancedChevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="advanced-body" id="parAdvancedBody">
        <p style="font-size:11px; color:var(--muted); font-weight:600; margin:8px 0 10px;">هذا يغيّر تعريف "١٠٠٪" لهذا الصنف — استخدمه بس لو التوريد المعتاد تغيّر فعليًا.</p>
        <div class="menu-add-field" style="max-width:220px;"><label>الكمية الجديدة اللي تمثّل ١٠٠٪</label><input type="number" id="siParLevel" value="${stockModalState.parLevel}" step="0.1"></div>
      </div>
    </div>` : ''}

    <div class="menu-add-field" style="margin:16px 0 14px;"><label>وصف المدة المتبقية (اختياري)</label><input type="text" id="siDuration" value="${stockModalState.duration}" placeholder="مثال: يكفي يومين"></div>
    ${existing ? `<div class="accounting-note">استهلك اليوم من هذا الصنف: <b>${consumption.totalQty.toFixed(2)} ${UNIT_LABELS[existing.unit]}</b> عبر ${consumption.orderCount} طلب مبيعات حقيقي — محسوبة تلقائيًا من وصفات المنتجات المرتبطة بالمخزون.</div>` : ''}
  `;
  const updatePctPreview = ()=>{
    const par = stockModalState.parLevel;
    const pct = par>0 ? Math.max(0,Math.min(100,Math.round(stockModalState.qtyOnHand/par*100))) : 100;
    const tier = computeStockTier(pct);
    const unitLabel = UNIT_LABELS[stockModalState.unit];
    document.getElementById('siLiveBarBox').innerHTML = existing ? `
      <div class="stock-bar-track" style="height:14px;"><div class="stock-bar-fill ${tier}" style="width:${pct}%"></div></div>
      <div class="stock-live-bar-label">يعني عندك <b class="mono">${pct}٪</b> من مخزونك المعتاد — ${stockModalState.qtyOnHand} من ${par} ${unitLabel}</div>
    ` : `
      <div class="stock-live-bar-label">أول ما تحفظ، هذي الكمية (${stockModalState.qtyOnHand} ${unitLabel}) بتصير مرجعك — يعني ١٠٠٪ تلقائيًا.</div>
    `;
  };
  document.getElementById('siName').addEventListener('input', (e)=> stockModalState.name = e.target.value);
  document.getElementById('siCategory').addEventListener('change', (e)=> stockModalState.category = e.target.value);
  document.getElementById('siUnit').addEventListener('change', (e)=>{
    stockModalState.unit = e.target.value;
    document.getElementById('siCostLabel').textContent = 'تكلفة ' + UNIT_LABELS[stockModalState.unit] + ' الواحد (ر.س)';
    updatePctPreview();
  });
  document.getElementById('siUnitCost').addEventListener('input', (e)=> stockModalState.unitCost = parseFloat(e.target.value)||0);
  document.getElementById('siQtyOnHand').addEventListener('input', (e)=>{ stockModalState.qtyOnHand = parseFloat(e.target.value)||0; updatePctPreview(); });
  document.getElementById('siDuration').addEventListener('input', (e)=> stockModalState.duration = e.target.value);
  if(existing){
    document.getElementById('siParLevel').addEventListener('input', (e)=>{ stockModalState.parLevel = parseFloat(e.target.value)||0; updatePctPreview(); });
    document.getElementById('parAdvancedToggle').addEventListener('click', ()=>{
      const body = document.getElementById('parAdvancedBody');
      const chevron = document.getElementById('parAdvancedChevron');
      const open = !body.classList.contains('open');
      body.classList.toggle('open', open);
      chevron.classList.toggle('open', open);
    });
  }
  updatePctPreview();

  document.getElementById('stockItemModal').classList.add('show');
}
function closeStockItemModal(){
  document.getElementById('stockItemModal').classList.remove('show');
  editingStockId = null;
}
async function saveStockItem(){
  const name = stockModalState.name.trim();
  if(!name){ showToast('لازم تكتب اسم الصنف'); return; }
  if(!(stockModalState.unitCost >= 0)){ showToast('لازم تدخل تكلفة صحيحة'); return; }
  if(!(stockModalState.qtyOnHand >= 0)){ showToast('لازم تدخل كمية صحيحة'); return; }

  const saveBtn = document.getElementById('stockItemSaveBtn');
  saveBtn.disabled = true;
  try {
    if(editingStockId){
      // editing: keep the existing par level unless the hidden advanced field changed it
      const data = {name, unit: stockModalState.unit, unit_cost: stockModalState.unitCost, category: stockModalState.category,
        qty_on_hand: stockModalState.qtyOnHand, par_level: stockModalState.parLevel, duration: stockModalState.duration, updated_at: new Date().toISOString()};
      const { error } = await window.supabaseClient.from('stock_items').update(data).eq('id', editingStockId);
      if(error) throw error;
      Object.assign(STOCK_ITEMS.find(s=>s.id===editingStockId),
        {name, unit: stockModalState.unit, unitCost: stockModalState.unitCost, category: stockModalState.category,
         qtyOnHand: stockModalState.qtyOnHand, parLevel: stockModalState.parLevel, duration: stockModalState.duration});
      STOCK_ITEM_ID_BY_NAME[name] = editingStockId; STOCK_ITEM_NAME_BY_ID[editingStockId] = name;
      logDashboardAudit('عدّل صنف مخزون: ' + name);
      showToast('تم حفظ التعديلات');
    } else {
      // new item: whatever quantity is entered right now defines 100% automatically
      const data = {business_id: CURRENT_PROFILE.business_id, name, unit: stockModalState.unit, unit_cost: stockModalState.unitCost,
        category: stockModalState.category, qty_on_hand: stockModalState.qtyOnHand, par_level: stockModalState.qtyOnHand, duration: stockModalState.duration};
      const { data: inserted, error } = await window.supabaseClient.from('stock_items').insert(data).select().single();
      if(error) throw error;
      STOCK_ITEMS.push({id: inserted.id, name, unit: stockModalState.unit, unitCost: stockModalState.unitCost,
        category: stockModalState.category, qtyOnHand: stockModalState.qtyOnHand, parLevel: stockModalState.qtyOnHand, duration: stockModalState.duration, aliasNames: []});
      STOCK_ITEM_ID_BY_NAME[name] = inserted.id; STOCK_ITEM_NAME_BY_ID[inserted.id] = name;
      logDashboardAudit('أضاف صنف مخزون جديد: ' + name);
      showToast('تمت إضافة "' + name + '" — جاهز للصنف اللي بعده');
    }
    // Setting up a new place means adding many items back to back — closing
    // the modal after every single one and reopening it from the list is
    // the single biggest friction point in that session. A new (not
    // edited) item reopens a fresh blank form immediately instead.
    if(editingStockId){
      closeStockItemModal();
    } else {
      openStockItemModal(null);
      const nameInput = document.getElementById('siName');
      if(nameInput) nameInput.focus();
    }
    renderStockTable();
    renderWasteAndFoodCost();
    if(typeof renderMenuProductTable === 'function') renderMenuProductTable(); // costs may have shifted
    if(typeof renderOnboardingChecklist === 'function') renderOnboardingChecklist();
  } catch(err){
    showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    saveBtn.disabled = false;
  }
}
async function deleteStockItem(){
  if(!editingStockId) return;
  const item = STOCK_ITEMS.find(s=>s.id===editingStockId);
  const usedBy = getUsedInMap()[item.name];
  if(usedBy && usedBy.length){ showToast('ما تقدر تحذفه — مستخدم بوصفة ' + usedBy.length + ' منتج. شيله من الوصفة أول.'); return; }
  try {
    const { error } = await window.supabaseClient.from('stock_items').delete().eq('id', editingStockId);
    if(error) throw error;
    STOCK_ITEMS = STOCK_ITEMS.filter(s=>s.id!==editingStockId);
    delete STOCK_ITEM_ID_BY_NAME[item.name]; delete STOCK_ITEM_NAME_BY_ID[editingStockId];
    logDashboardAudit('حذف صنف مخزون: ' + item.name);
    closeStockItemModal();
    renderStockTable();
    renderWasteAndFoodCost();
    showToast('تم حذف الصنف');
  } catch(err){
    showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  }
}

/* ============ Supplier price comparison — every number derives from PURCHASE_INVOICES (qty/totalCost),
   never a hand-typed unit price. "استخدم هذا السعر" writes straight into STOCK_ITEMS, which is the
   same source the Menu costing engine reads from — so the connection is real, not decorative. */
let supplierMonthlyQty = {}; // per-item editable "how much do you buy monthly" for the savings projection

function renderSupplierComparison(){
  const titleEl = document.getElementById('supplierComparisonTitle');
  if(titleEl) titleEl.innerHTML = 'مقارنة أسعار الموردين ' + helpIcon('كل ما تسجّل فاتورة شراء لنفس الصنف من مورد جديد، ركين يقارن السعر تلقائيًا مع الموردين اللي سجّلتهم قبل، ويوريك مين الأرخص.');
  const el = document.getElementById('supplierComparisonList');
  if(!el) return;
  const itemNames = [...new Set(PURCHASE_INVOICES.map(i=>i.stockItem))];
  if(itemNames.length === 0){ el.innerHTML = '<div class="supcomp-empty">ما فيه فواتير مسجّلة لسا — سجّل أول فاتورة من الزر فوق.</div>'; return; }

  el.innerHTML = itemNames.map(itemName=>{
    const stockItem = STOCK_ITEMS.find(s=>s.name===itemName);
    const entries = PURCHASE_INVOICES.filter(i=>i.stockItem===itemName)
      .map(i=>({...i, unitPrice: i.totalCost/i.qty}))
      .sort((a,b)=>a.unitPrice-b.unitPrice);
    const best = entries[0];
    const unitLabel = UNIT_LABELS[best.unit]||best.unit;
    const currentCost = stockItem ? stockItem.unitCost : null;
    const hasSavings = currentCost !== null && best.unitPrice < currentCost - 0.01;
    if(!supplierMonthlyQty[itemName]) supplierMonthlyQty[itemName] = 20;
    const monthlyQty = supplierMonthlyQty[itemName];
    const monthlySavings = hasSavings ? (currentCost - best.unitPrice) * monthlyQty : 0;

    return `<div class="supcomp-card">
      ${hasSavings ? `
      <div class="supcomp-verdict">
        <div class="supcomp-verdict-text"><b>${escapeHtml(best.supplier)}</b> أفضل خيار لـ<b>${escapeHtml(itemName)}</b></div>
        <div class="supcomp-verdict-calc">
          لو تشتري <input type="number" class="supcomp-qty-input" data-item="${escapeHtml(itemName)}" value="${monthlyQty}" min="1"> ${escapeHtml(unitLabel)} بالشهر،
          توفر <b class="mono">${monthlySavings.toFixed(0)} ر.س</b> شهريًا
        </div>
        <button class="supcomp-use-btn" data-item="${escapeHtml(itemName)}" data-price="${best.unitPrice}">اعتمد ${escapeHtml(best.supplier)} الآن</button>
      </div>` : `
      <div class="supcomp-verdict supcomp-verdict-ok">
        <div class="supcomp-verdict-text">أنت أصلًا عند أفضل سعر مسجّل لـ<b>${escapeHtml(itemName)}</b> (${escapeHtml(best.supplier)})</div>
      </div>`}
      <div class="supcomp-head">
        <span class="supcomp-item-name">كل الأسعار المسجّلة</span>
        <span class="supcomp-current">التكلفة المعتمدة حاليًا: ${currentCost !== null ? formatUnitCost(currentCost)+' ر.س' : '—'}</span>
      </div>
      ${entries.map((e,i)=>`
        <div class="supcomp-row ${i===0?'best':''}">
          <span class="supcomp-rank">${i+1}</span>
          <div style="flex:1;">
            <div class="supcomp-supplier">${escapeHtml(e.supplier)}</div>
            <div class="supcomp-meta">${e.qty} ${escapeHtml(UNIT_LABELS[e.unit]||e.unit)} — ${e.totalCost.toFixed(2)} ر.س — ${escapeHtml(e.date)}</div>
          </div>
          <span class="supcomp-unit-price">${formatUnitCost(e.unitPrice)} ر.س/${escapeHtml(UNIT_LABELS[e.unit]||e.unit)}</span>
        </div>
      `).join('')}
    </div>`;
  }).join('');

  el.querySelectorAll('.supcomp-qty-input').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      supplierMonthlyQty[inp.dataset.item] = parseFloat(inp.value)||1;
      renderSupplierComparison();
    });
  });
  el.querySelectorAll('.supcomp-use-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const itemName = btn.dataset.item;
      const newPrice = parseFloat(btn.dataset.price);
      const stockItem = STOCK_ITEMS.find(s=>s.name===itemName);
      if(!stockItem) return;
      const oldPrice = stockItem.unitCost;
      try {
        const { error } = await window.supabaseClient.from('stock_items')
          .update({unit_cost: newPrice, updated_at: new Date().toISOString()}).eq('id', stockItem.id);
        if(error) throw error;
      } catch(err){
        showToast('تعذر تحديث التكلفة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        return;
      }
      stockItem.unitCost = newPrice;
      logDashboardAudit('حدّث تكلفة ' + itemName + ' من ' + oldPrice.toFixed(2) + ' إلى ' + newPrice.toFixed(2) + ' (مقارنة موردين)');
      showToast('تم تحديث التكلفة — هامش المنتجات المرتبطة تحدّث تلقائيًا');
      renderSupplierComparison();
      renderStockTable();
      renderWasteAndFoodCost();
      if(typeof renderMenuProductTable === 'function') renderMenuProductTable();
    });
  });
}

let invLineIdCounter = 0;

function invLineRowHtml(lineId){
  return `
    <div class="inv-line-row" data-line-id="${lineId}">
      <div class="inv-line-main">
        <select class="inv-line-item">${STOCK_ITEMS.map(s=>`<option value="${s.name}">${s.name}</option>`).join('')}<option value="__new__">+ إضافة صنف جديد للمخزون</option></select>
        <input type="number" class="inv-line-qty" placeholder="الكمية">
        <input type="number" class="inv-line-total" placeholder="السعر (ر.س)">
        <button type="button" class="inv-line-remove" title="حذف الصنف">✕</button>
      </div>
      <div class="inv-line-new-fields hidden">
        <input type="text" class="inv-line-new-name" placeholder="اسم الصنف الجديد">
        <select class="inv-line-new-unit">
          <option value="kg">كجم</option>
          <option value="g">جرام</option>
          <option value="liter">لتر</option>
          <option value="piece">حبة</option>
        </select>
        <div class="inv-line-similar-suggestion hidden"></div>
      </div>
      <div class="inv-line-raw-caption hidden"></div>
    </div>
  `;
}

// Arabic unit words the AI might return, mapped to the stock_items unit codes.
// Gemini doesn't always populate the dedicated `unit` field reliably (observed
// in production: an oil tank and a chicken carton both came back as "piece"),
// but the raw invoice text almost always has the unit word right in it
// ("...17 لتر", "...2 كيلو") — check that too as a fallback signal, not just
// the field meant to carry it, so a dropped field doesn't silently mislabel
// something liquid or weighed as "per piece".
function guessUnitCode(unitLabel, fallbackText){
  const s = ((unitLabel||'') + ' ' + (fallbackText||'')).trim();
  // JS's \b is ASCII-word-based — it doesn't form a boundary between two
  // Arabic letters, or between an Arabic letter and punctuation glued right
  // after it (e.g. a footnote "*" copied verbatim from an invoice: "...جم*"),
  // so \b silently failed to match "جم" in exactly that real case. A
  // negative lookahead for a following Arabic letter gets the same
  // "don't match inside a longer word" safety (e.g. "جميل"، "ملعقة")
  // without depending on \b's ASCII-only notion of a word boundary.
  // Real invoices are also often bilingual (imported-goods SKUs printed in
  // English) — recognize the Latin abbreviations too, not just Arabic words.
  // real invoices glue Latin unit abbreviations straight onto a digit with no
  // space ("8X2LTR", "5kg") — \b doesn't form a boundary between two word
  // characters (digit+letter), so it needs its own not-preceded/followed-by-
  // a-letter check rather than \b.
  const latin = (word) => new RegExp('(?<![A-Za-z])' + word + '(?![A-Za-z])', 'i');
  if(/كجم|كيلو/.test(s) || latin('KG').test(s)) return 'kg';
  if(/جرام|جم(?![ء-ي])/.test(s) || latin('GM?').test(s)) return 'g';
  if(/لتر|ملل|مل(?![ء-ي])/.test(s) || latin('L(TR)?').test(s) || latin('ML').test(s)) return 'liter'; // ml is liter-family — the ÷1000 scaling already happened upstream
  return 'piece';
}

// Weight (kg/g) and volume (liter) are different physical dimensions — you
// can't convert between them without knowing the product's density, which
// this system never guesses. Two purchases of "the same" ingredient sold by
// different suppliers in different dimensions (one by weight, one by volume)
// must NOT be silently merged into one stock item's average cost — that's
// exactly the bug that inflated a real item's qty 1000x when a volume-sold
// product ("340 ملل") got forced into a weight-tracked item's "kg" unit.
const UNIT_FAMILY = {kg:'weight', g:'weight', liter:'volume', piece:'count'};
function unitsCompatible(a, b){ return UNIT_FAMILY[a] && UNIT_FAMILY[a] === UNIT_FAMILY[b]; }

// Bigram (Dice coefficient) similarity — works well for short Arabic names
// without needing a stemmer/normalizer, and is cheap enough to run against
// the whole stock/supplier list on every keystroke. Not used to auto-merge
// anything (findStockItemMatch above stays strict on purpose) — only to
// *suggest* a likely-existing match before a new item/supplier gets
// created, since every duplicate seen so far came from exactly that gap:
// no match found, so a new record got created silently instead of asking
// "did you mean X?" first.
function bigramSet(s){
  const norm = (s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const set = new Set();
  for(let i=0; i<norm.length-1; i++) set.add(norm.slice(i, i+2));
  return set;
}
function stringSimilarity(a, b){
  const setA = bigramSet(a), setB = bigramSet(b);
  if(setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  setA.forEach(bg => { if(setB.has(bg)) overlap++; });
  return (2 * overlap) / (setA.size + setB.size);
}
// Threshold picked to catch "بيبار" vs "بيبار هندي" (~0.55) and "خضار" vs
// "خضار الدومي" (~0.5) without also flooding unrelated short names —
// tune from real reports of missed/over-eager suggestions, not in the abstract.
const SIMILARITY_SUGGEST_THRESHOLD = 0.45;
function findSimilarNames(candidateName, existingNames, excludeExact){
  const exact = (candidateName||'').trim().toLowerCase();
  return existingNames
    .filter(n => n && n.trim().toLowerCase() !== exact)
    .map(n => ({ name: n, score: stringSimilarity(candidateName, n) }))
    .filter(r => r.score >= SIMILARITY_SUGGEST_THRESHOLD)
    .sort((a,b) => b.score - a.score)
    .slice(0, 3);
}

// A deliberately strict match — a naive "contains" check would fold "طماطم
// مقشرة" (canned/peeled) into "طماطم" (fresh) just because they share a word,
// even though they're different ingredients with different cost/shelf life.
// Checks remembered brand/vendor aliases first (learned from past manual
// corrections — instant, zero decisions), then falls back to an exact match
// on Gemini's own normalized baseIngredient name. Anything else goes to
// "+ إضافة صنف جديد" for the owner to decide, rather than guessing wrong.
function findStockItemMatch(rawName, baseIngredient){
  const norm = s => s.trim().toLowerCase().replace(/\s+/g,' ');
  if(rawName){
    const targetRaw = norm(rawName);
    const aliasMatch = STOCK_ITEMS.find(s => (s.aliasNames||[]).some(a => norm(a) === targetRaw));
    if(aliasMatch) return aliasMatch;
  }
  if(!baseIngredient) return null;
  const target = norm(baseIngredient);
  return STOCK_ITEMS.find(s => norm(s.name) === target) || null;
}

// ============================================================
// OCR-first deterministic parsing (Step 4)
//
// This operates on Tesseract's word/line bounding-box geometry
// (line.words[].bbox, line.paragraph.is_ltr, word.is_numeric) rather than
// the flattened linear text string. Production invoice-extraction systems
// (AWS Textract AnalyzeExpense, Azure Form Recognizer, Google Document AI
// Invoice Parser) all reconstruct table rows/columns from token pixel
// position for exactly the reason found during this app's own Step 3
// OCR benchmark: text linearization order is not stable — the same
// receipt produced tokens in a different apparent order depending on
// Tesseract's page-segmentation mode. Pixel position doesn't have that
// failure mode, and Tesseract already computes per-paragraph reading
// direction and per-word "is this numeric" — reusing the engine's own
// analysis beats re-guessing it with regex.
//
// Every rule here is generic across ANY invoice layout — nothing is keyed
// to a specific supplier's phrasing or column order. Supplier-specific
// behavior (a vendor's typical decimal style, which parser strategy
// tends to work for them) belongs entirely in the supplier pattern-cache
// layer (Step 7), never hardcoded here — a new supplier's odd phrasing
// should teach the cache, not add a special case to this file.
// ============================================================

const PARSE_REASON = {
  ARITHMETIC_MISMATCH: 'arithmetic_mismatch',
  UNKNOWN_UNIT: 'unknown_unit',
  OCR_AMBIGUITY: 'ocr_ambiguity',
  MISSING_TOTAL: 'missing_total',
  MISSING_VAT: 'missing_vat',
  MISSING_SUBTOTAL: 'missing_subtotal',
  UNKNOWN_PACKAGE_NOTATION: 'unknown_package_notation',
  DECIMAL_RECOVERED: 'decimal_recovered',
  NO_LINES_FOUND: 'no_lines_found',
  IMPLAUSIBLE_VALUE: 'implausible_value',
  API_ERROR: 'api_error',
  RATE_LIMITED: 'rate_limited',
  GEMINI_ERROR: 'gemini_error',
};

// Maps /api/purchases/scan-invoice's structured `code` (route.ts) to a
// PARSE_REASON for telemetry — added after production data showed the
// text-Gemini tier failing with a generic API_ERROR far more often than
// expected, forcing costly escalations to vision with no way to tell
// *why* without manually reproducing the call. A distinct rate_limited
// reason turns that into something visible in the metrics panel instead.
const SCAN_API_CODE_TO_REASON = {
  rate_limited: 'rate_limited',
  gemini_http_error: 'gemini_error',
  invalid_json: 'gemini_error',
  no_content: 'no_lines_found',
  no_items: 'no_lines_found',
  network_error: 'api_error',
};

// A defensive sanity bound, not a business rule — exists specifically
// because text-only Gemini was directly observed (Step 6 testing) to
// hallucinate values like 1e+308 / 1e+84 when given ambiguous OCR input.
// Any restaurant-supply invoice line in the tens-of-thousands of SAR is
// already implausible, let alone astronomical; catching this here means
// the arithmetic-reconciliation check below can't be fooled by a total
// that "matches" only because both sides are nonsense.
function isSaneAmount(n){
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e6;
}

// Every parser below returns this shape: a value (or null), a 0-1
// confidence, and — whenever confidence is reduced or value is null — a
// machine-readable reason the validation/decision layer can act on
// instead of re-deriving "why" from scratch.
function parseResult(value, confidence, reason){
  return { value, confidence, reason: reason || null };
}

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function normalizeOcrDigits(s){
  if(!s) return '';
  return String(s).replace(/[٠-٩]/g, d => String(ARABIC_INDIC_DIGITS.indexOf(d)));
}

// OCR on thermal receipts frequently drops the decimal point in currency
// amounts ("11.50" -> "1150") — a consistent-enough failure mode
// (confirmed against real invoice photos during the Step 3 benchmark) to
// recover deterministically rather than just distrust. Only ever called
// on a token the caller has already identified as an amount-shaped
// column — never applied blindly, since a package count like "24" must
// stay 24 rather than become "0.24".
function recoverDecimalAmount(rawToken){
  const t = normalizeOcrDigits(rawToken).trim();
  if(!/^\d+(\.\d+)?$/.test(t)) return parseResult(null, 0, PARSE_REASON.OCR_AMBIGUITY);
  if(t.includes('.')) return parseResult(parseFloat(t), 1, null);
  if(t.length >= 3){
    // most SAR invoice amounts print two decimal places, so a 3+ digit run
    // with no dot is far more often "1150" -> 11.50 than a genuine
    // 1150 SAR line item on a small restaurant-supply invoice
    const recovered = parseFloat(t.slice(0, -2) + '.' + t.slice(-2));
    return parseResult(recovered, 0.6, PARSE_REASON.DECIMAL_RECOVERED);
  }
  return parseResult(parseFloat(t), 0.85, null);
}

// Tesseract already computes per-paragraph reading direction (is_ltr) —
// this app sees both RTL Arabic-POS receipts and LTR English-templated
// receipts with Arabic strings mixed in (e.g. a LuLu Hypermarket
// receipt), so direction is read from the engine's own analysis per line
// rather than assumed once for the whole document. Falls back to a
// position heuristic only if that field is unavailable.
function orderWordsByReadingDirection(line){
  const words = (line.words || []).filter(w => w.text && w.text.trim());
  if(words.length < 2) return words;
  const lineMidX = (line.bbox.x0 + line.bbox.x1) / 2;
  const isLtr = line.paragraph && typeof line.paragraph.is_ltr === 'boolean'
    ? line.paragraph.is_ltr
    : words[0].bbox.x0 <= lineMidX;
  return [...words].sort((a, b) => isLtr ? a.bbox.x0 - b.bbox.x0 : b.bbox.x0 - a.bbox.x0);
}

// The text sent to the text-only Gemini tier (Step 6) — reading-order
// reconstructed per line, not Tesseract's raw flattened `data.text`. Tested
// directly against real invoices: feeding Gemini the raw linear text
// produced a hallucinated field (unitsPerPackage: 1e+308) and missed most
// line items; the same request against this reconstructed text correctly
// extracted supplier name, date, grand total, and all line items. Column
// order is exactly what a language model needs to reason about which
// number is qty vs price vs total — garbling it costs real accuracy, not
// just tidiness.
function buildReadingOrderText(lines){
  return (lines || [])
    .map(line => orderWordsByReadingDirection(line).map(w => w.text).join(' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractNumericTokens(orderedWords){
  const out = [];
  for(const w of orderedWords){
    const cleaned = normalizeOcrDigits(w.text).replace(/[^\d.]/g, '');
    if(!cleaned || !/\d/.test(cleaned)) continue;
    if(w.is_numeric === false && cleaned.length < 2) continue; // trust the engine's own signal to skip stray punctuation-adjacent digits
    const amount = recoverDecimalAmount(cleaned);
    if(amount.value == null) continue;
    out.push({ ...amount, ocrConfidence: (w.confidence || 0) / 100 });
  }
  return out;
}

// Generic packaging-notation patterns collected from real invoice formats
// across many different suppliers (wholesale grocers, hypermarkets,
// frozen distributors) — keyword/shape-based, never a specific supplier's
// exact phrasing.
const PACKAGE_UNIT_WORDS = 'كرتون|كيس|علبة|ربطة|حزمة|تنك|جالون|شد|صندوق';
// IMPORTANT: this reads packaging *size* notation out of the item's own
// description text ("24×340ml" = a carton holding 24 bottles of 340ml
// each) — it describes what's *inside* one purchased unit, not how many
// of that unit this invoice line actually bought. It is NOT a substitute
// for the invoice's own printed qty/unit-price columns, and must never be
// used to override or replace them when those columns were read
// successfully — see parseInvoiceLines, which only falls back to this for
// the purchased qty when the row didn't yield its own explicit qty/price
// pair. Confidence is capped below decideInvoiceResolution's 0.5
// escalation gate on purpose: a match here is a plausible-looking guess
// from prose, not a read of the invoice's own structured data, so a line
// that has to fall back to it should always escalate to text-Gemini
// rather than being locally accepted on the strength of this alone (a
// real production bug: three real invoice lines were previously getting
// silently collapsed into one row with a fabricated qty computed from
// packaging text, while the "unit price" was reverse-engineered as
// lineTotal ÷ that fabricated qty — which trivially passes arithmetic
// validation no matter how wrong the qty is, since the price was derived
// FROM it rather than read independently).
function parsePackageNotation(rawText){
  const s = normalizeOcrDigits(rawText || '');
  // "24×340" / "24 × 340" — the single most common cross-supplier
  // packaging notation on printed invoices (units-per-package × size)
  const crossMatch = s.match(/(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)/);
  if(crossMatch){
    return parseResult({
      packageQty: 1,
      unitsPerPackage: parseFloat(crossMatch[1]),
      contentPerUnit: parseFloat(crossMatch[2]),
    }, 0.35, null);
  }
  // "تنك 17 لتر" / "17 لتر" — a single container whose own size is the
  // sub-unit content, no separate packages-per-carton breakdown
  const singleContainer = s.match(new RegExp('(?:' + PACKAGE_UNIT_WORDS + ')?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:كجم|كيلو|جرام|جم|لتر|ملل|مل)'));
  if(singleContainer){
    return parseResult({
      packageQty: 1,
      unitsPerPackage: 1,
      contentPerUnit: parseFloat(singleContainer[1]),
    }, 0.3, null);
  }
  // bare decimal weight/volume with no packaging words at all — bought
  // directly by weight/volume ("بصل ابيض .585" -> 0.585 كجم)
  const bareDecimal = s.match(/\d*\.\d{2,3}/);
  if(bareDecimal){
    return parseResult({ packageQty: parseFloat(bareDecimal[0]), unitsPerPackage: 1, contentPerUnit: 1 }, 0.25, null);
  }
  return parseResult(null, 0, PARSE_REASON.UNKNOWN_PACKAGE_NOTATION);
}

// Header/footer boilerplate that must never be mistaken for a line item —
// generic invoice vocabulary (ZATCA-standard terms, common POS-system
// field labels), not any one supplier's specific wording.
const NON_ITEM_LINE_PATTERN = /الرقم الضريبي|السجل التجاري|فاتورة ضريبية|الإجمالي|الاجمالي|ضريبة القيمة|المدفوع|الباقي|شكرا|رقم الفاتورة|التاريخ|الوقت|Trans No|Sales\.|Cashier|Store\.|عدد القطع|سياسة الاسترجاع|الاسترجاع خلال|بيان الصنف|الكمية.*السعر/;

// A bare item barcode is already 10+ digits, so requiring 4+ digits here
// only ever fires on a genuine numeric row (code/qty/price/total), not on
// short incidental numbers inside a description.
function isNumericRow(text){
  return (text.match(/\d/g) || []).length >= 4;
}

// True across this app's real invoices (confirmed in the Step 3/4 OCR
// dumps): the numeric row (code/qty/price/total) and the Arabic item
// description often print as two SEPARATE OCR lines for the same
// item — e.g. "5523002020005 2 2.50 5.00" on one line, "بقدونس طازج" on
// the next. Pairing a numeric line with its nearest non-numeric,
// non-boilerplate neighbor reconstructs the logical row generically,
// without assuming which supplier's layout produced it.
function parseInvoiceLines(lines){
  const candidates = (lines || [])
    .map(line => ({ line, text: normalizeOcrDigits(line.text || '').trim() }))
    .filter(c => c.text && !NON_ITEM_LINE_PATTERN.test(c.text));

  const results = [];
  const consumed = new Set();
  for(let i = 0; i < candidates.length; i++){
    if(consumed.has(i)) continue;
    const { line, text } = candidates[i];
    if(!isNumericRow(text)) continue;
    consumed.add(i);

    let descriptionText = '';
    for(const j of [i + 1, i - 1]){
      const neighbor = candidates[j];
      if(neighbor && !consumed.has(j) && !isNumericRow(neighbor.text)){
        descriptionText = neighbor.text;
        consumed.add(j);
        break;
      }
    }

    const ordered = orderWordsByReadingDirection(line);
    const numericTokens = extractNumericTokens(ordered);
    if(numericTokens.length < 2){
      results.push(parseResult(null, 0, PARSE_REASON.OCR_AMBIGUITY));
      continue;
    }

    // last token in reading order = total — conventionally the final
    // column a reader's eye reaches, true across RTL and LTR layouts
    // alike (not a supplier-specific assumption)
    const lineTotal = numericTokens[numericTokens.length - 1];
    const packaging = parsePackageNotation(text);
    const unit = guessUnitCode(null, text + ' ' + descriptionText);
    const qty = packaging.value
      ? packaging.value.packageQty * packaging.value.unitsPerPackage * packaging.value.contentPerUnit
      : null;
    const unitPrice = (qty && lineTotal.value != null) ? lineTotal.value / qty : null;

    // structural confidence (did the packaging pattern match at all)
    // combined with the OCR engine's own per-token confidence (was
    // Tesseract itself sure about these specific digits) — either one
    // being weak should pull the overall confidence down, not just one
    const ocrConf = numericTokens.reduce((min, t) => Math.min(min, t.ocrConfidence), 1);
    const confidence = Math.min(lineTotal.confidence, packaging.confidence || 0.3, ocrConf);
    const reason = packaging.reason || lineTotal.reason || (ocrConf < 0.6 ? PARSE_REASON.OCR_AMBIGUITY : null);

    results.push(parseResult({
      name: descriptionText || text.replace(/[\d.]/g, '').trim(),
      unit,
      qty,
      unitPrice,
      lineTotal: lineTotal.value,
      packageQty: packaging.value ? packaging.value.packageQty : null,
      unitsPerPackage: packaging.value ? packaging.value.unitsPerPackage : null,
      contentPerUnit: packaging.value ? packaging.value.contentPerUnit : null,
    }, confidence, reason));
  }
  return results;
}

// ZATCA e-invoicing requires these exact Arabic phrases on every
// simplified tax invoice regardless of supplier — generic regulatory
// vocabulary, not a supplier-specific hack.
function findLabeledAmount(lines, labelPattern){
  for(let i = 0; i < lines.length; i++){
    const text = normalizeOcrDigits(lines[i].text || '');
    if(labelPattern.test(text)){
      // OCR sometimes puts the amount and its label on the same printed
      // row, sometimes on the row directly above/below depending on how
      // the receipt wrapped — check the label's own line first, then its
      // immediate neighbors
      for(const candidateLine of [lines[i], lines[i - 1], lines[i + 1]]){
        if(!candidateLine) continue;
        const ordered = orderWordsByReadingDirection(candidateLine);
        const numericTokens = extractNumericTokens(ordered);
        if(numericTokens.length) return numericTokens[numericTokens.length - 1];
      }
    }
  }
  return parseResult(null, 0, PARSE_REASON.OCR_AMBIGUITY);
}

function parseInvoiceHeader(lines){
  const fullText = (lines || []).map(l => normalizeOcrDigits(l.text || '')).join('\n');
  const vatMatch = fullText.match(/(?:الرقم الضريبي|VAT\s*(?:NO|No)?)[^\d]{0,10}(\d{10,15})/i);
  return {
    vatNumber: vatMatch ? parseResult(vatMatch[1], 0.8, null) : parseResult(null, 0, PARSE_REASON.OCR_AMBIGUITY),
    subtotalBeforeVat: findLabeledAmount(lines, /الاجمالي قبل الضريبة|الإجمالي قبل الضريبة/),
    vatAmount: findLabeledAmount(lines, /ضريبة القيمة المضافة|ضريبة القيمة/),
    finalTotal: findLabeledAmount(lines, /الاجمالي النهائي|الإجمالي النهائي|المدفوع|الصافي/),
  };
}

// ============================================================
// Validation layer — the only things that ever gate acceptance are
// checks against the invoice's own arithmetic, which is either
// self-consistent or it isn't. Raw OCR confidence is deliberately never
// used as a gate here — a model being "sure" about pixels isn't the same
// as the extracted numbers being *correct*. This is standard practice in
// production invoice-capture systems ("totals validation" / "3-way
// match"-style tolerance checks), not something specific to this app.
// ============================================================

function invoiceAmountEpsilon(amount){
  return Math.max(0.05, Math.abs(amount || 0) * 0.02);
}

function validateLineArithmetic(item){
  if(item.unitPrice == null || item.qty == null || item.lineTotal == null){
    return { ok: false, reason: PARSE_REASON.OCR_AMBIGUITY };
  }
  const expected = item.unitPrice * item.qty;
  const ok = Math.abs(expected - item.lineTotal) <= invoiceAmountEpsilon(item.lineTotal);
  return { ok, reason: ok ? null : PARSE_REASON.ARITHMETIC_MISMATCH };
}

const KSA_STANDARD_VAT_RATE = 0.15;
function validateVat(subtotalBeforeVat, vatAmount, vatRate){
  if(subtotalBeforeVat == null) return { ok: false, reason: PARSE_REASON.MISSING_SUBTOTAL };
  if(vatAmount == null) return { ok: false, reason: PARSE_REASON.MISSING_VAT };
  const rate = vatRate != null ? vatRate : KSA_STANDARD_VAT_RATE;
  const expected = Math.round(subtotalBeforeVat * rate * 100) / 100;
  const ok = Math.abs(expected - vatAmount) <= invoiceAmountEpsilon(vatAmount);
  return { ok, reason: ok ? null : PARSE_REASON.ARITHMETIC_MISMATCH };
}

function validateTotalsReconciliation(lineTotals, expectedTotal){
  if(expectedTotal == null) return { ok: false, reason: PARSE_REASON.MISSING_TOTAL };
  if(!lineTotals.length) return { ok: false, reason: PARSE_REASON.NO_LINES_FOUND };
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  const ok = Math.abs(sum - expectedTotal) <= invoiceAmountEpsilon(expectedTotal);
  return { ok, reason: ok ? null : PARSE_REASON.ARITHMETIC_MISMATCH };
}

// The routing decision: local-accept only when the extracted data is
// internally self-consistent; otherwise escalate exactly one tier —
// never straight from "local failed" to Vision. This mirrors the
// confidence-based routing / model-cascade pattern used both in
// production Intelligent Document Processing platforms (Textract
// AnalyzeExpense and similar route low-confidence extractions to a
// fallback rather than trusting them) and in LLM-systems literature
// (cascading a cheap model first, escalating only on failure — the
// "FrugalGPT" pattern). Raw OCR confidence is never itself the gate —
// only a failed validation check against the invoice's own arithmetic is.
function decideInvoiceResolution({ qrResult, header, lines }){
  if(!lines.length){
    return { stage: 'text_gemini', reason: PARSE_REASON.NO_LINES_FOUND };
  }
  const unparsedLine = lines.find(l => !l.value);
  if(unparsedLine){
    return { stage: 'text_gemini', reason: unparsedLine.reason || PARSE_REASON.OCR_AMBIGUITY };
  }
  const lowConfidenceLine = lines.find(l => l.confidence < 0.5);
  if(lowConfidenceLine){
    return { stage: 'text_gemini', reason: lowConfidenceLine.reason || PARSE_REASON.OCR_AMBIGUITY };
  }
  const badArithmeticLine = lines.find(l => !validateLineArithmetic(l.value).ok);
  if(badArithmeticLine){
    return { stage: 'text_gemini', reason: PARSE_REASON.ARITHMETIC_MISMATCH };
  }

  const lineTotals = lines.map(l => l.value.lineTotal);

  if(qrResult && qrResult.total != null){
    const check = validateTotalsReconciliation(lineTotals, qrResult.total);
    return check.ok ? { stage: 'local', reason: null } : { stage: 'text_gemini', reason: check.reason };
  }

  const subtotalCheck = validateTotalsReconciliation(lineTotals, header.subtotalBeforeVat.value);
  if(!subtotalCheck.ok) return { stage: 'text_gemini', reason: subtotalCheck.reason };

  const vatCheck = validateVat(header.subtotalBeforeVat.value, header.vatAmount.value, BUSINESS_VAT_RATE);
  if(!vatCheck.ok) return { stage: 'text_gemini', reason: vatCheck.reason };

  if(header.finalTotal.value == null) return { stage: 'text_gemini', reason: PARSE_REASON.MISSING_TOTAL };
  const expectedFinal = header.subtotalBeforeVat.value + header.vatAmount.value;
  if(Math.abs(expectedFinal - header.finalTotal.value) > invoiceAmountEpsilon(header.finalTotal.value)){
    return { stage: 'text_gemini', reason: PARSE_REASON.ARITHMETIC_MISMATCH };
  }

  return { stage: 'local', reason: null };
}

let invBlockIdCounter = 0;
let EDITING_GROUP_ID = null; // non-null while the invoice modal is editing an existing invoice_group_id instead of creating a new one

// Rough, clearly-labeled cost approximation (USD→SAR ~3.75) — not exact
// billing reconciliation, just enough signal for the AI-usage panel to
// show a believable trend and a monthly-cost order of magnitude.
// IMPORTANT: must always match GEMINI_MODEL_ID in
// app/api/purchases/scan-invoice/route.ts — currently gemini-flash-lite-
// latest (Gemini 3.5 Flash-Lite, $0.30/$2.50), chosen over the previous
// gemini-flash-latest (Gemini 3.6 Flash, $1.50/$7.50) after it was
// verified to answer two real invoices correctly, ~4x cheaper. If that
// model ID ever changes, update these two numbers in the same edit —
// letting them drift apart is exactly the bug that silently under-
// reported real cost by ~15x for a previous, unrelated pricing mismatch.
const GEMINI_USD_PER_1M_INPUT_TOKENS = 0.30;
const GEMINI_USD_PER_1M_OUTPUT_TOKENS = 2.50;
const USD_TO_SAR = 3.75;
function estimateGeminiCostSar(usage){
  if(!usage) return null;
  const inputCost = ((usage.promptTokens || 0) / 1e6) * GEMINI_USD_PER_1M_INPUT_TOKENS;
  const outputCost = ((usage.candidatesTokens || 0) / 1e6) * GEMINI_USD_PER_1M_OUTPUT_TOKENS;
  return (inputCost + outputCost) * USD_TO_SAR;
}

// One row per invoice-scan attempt regardless of outcome — powers the
// per-business AI-usage/cost metrics panel. Never throws: telemetry must
// never break the actual scan flow the owner is waiting on.
async function logInvoiceScanEvent(evt){
  try {
    const sb = window.supabaseClient;
    await sb.from('invoice_scan_events').insert({
      business_id: CURRENT_PROFILE.business_id,
      created_by: CURRENT_PROFILE.id,
      resolution_stage: evt.resolutionStage,
      qr_present: !!evt.qrPresent,
      qr_total_match: evt.qrTotalMatch != null ? evt.qrTotalMatch : null,
      ocr_mean_confidence: evt.ocrMeanConfidence != null ? evt.ocrMeanConfidence : null,
      ocr_line_match_rate: evt.ocrLineMatchRate != null ? evt.ocrLineMatchRate : null,
      line_item_count: evt.lineItemCount != null ? evt.lineItemCount : null,
      estimated_gemini_tokens: evt.usage ? evt.usage.totalTokens : null,
      estimated_cost_sar: estimateGeminiCostSar(evt.usage),
      supplier_vat_number: evt.supplierVatNumber || null,
      supplier_name: evt.supplierName || null,
      duration_ms: evt.durationMs != null ? evt.durationMs : null,
      error_message: evt.errorMessage || null,
      local_parse_decision_stage: evt.localParseDecisionStage || null,
      local_parse_decision_reason: evt.localParseDecisionReason || null,
      text_parse_escalation_reason: evt.textParseEscalationReason || null
    });
  } catch(e){
    console.error('logInvoiceScanEvent failed:', e);
  }
}

function invBlockHtml(blockId){
  return `
    <div class="inv-block" data-block-id="${blockId}">
      <div class="inv-block-header">
        <div class="menu-add-field" style="margin-bottom:10px; flex:1;">
          <label>اسم المورد</label>
          <input type="text" class="inv-block-supplier" placeholder="مثال: مزرعة الشرق">
          <div class="inv-block-supplier-suggestion hidden"></div>
        </div>
        <button type="button" class="inv-block-remove hidden" title="حذف هذه الفاتورة">✕</button>
      </div>
      <div class="menu-add-field" style="margin-bottom:10px;">
        <label>رقم الفاتورة (اختياري)</label>
        <input type="text" class="inv-block-invoice-number" placeholder="مثال: INV-1029">
      </div>
      <div class="inv-scan-wrap">
        <button type="button" class="inv-scan-btn inv-scan-btn-ai inv-block-scan-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z"/><path d="M5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15z"/></svg>
          <span class="inv-scan-btn-text">
            <span class="inv-scan-btn-title">صوّر الفاتورة</span>
            <span class="inv-scan-btn-sub">تُقرأ تلقائيًا — الأصناف والمورد والإجمالي</span>
          </span>
        </button>
        <div class="inv-scan-overlay hidden inv-block-scan-overlay">
          <div class="inv-scan-spinner"></div>
          <div class="inv-scan-overlay-text inv-block-scan-overlay-text">جارٍ قراءة الفاتورة...</div>
        </div>
      </div>
      <div class="inv-scan-or">أو أدخلها يدويًا</div>
      <input type="file" class="inv-block-scan-input" accept="image/*" style="display:none;">
      <div class="inv-review-notice hidden inv-block-review-notice">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/></svg>
        <span class="inv-block-review-notice-text">القراءة الذكية سريعة، بس راجع الكميات والأسعار قبل ما تحفظ.</span>
      </div>
      <label class="inv-lines-label">أصناف الفاتورة</label>
      <div class="inv-line-headers"><span>الصنف</span><span>الكمية</span><span>السعر</span><span></span></div>
      <div class="inv-block-lineitems"></div>
      <button type="button" class="inv-add-line-btn inv-block-add-line-btn">+ إضافة صنف آخر لنفس الفاتورة</button>
      <div class="inv-block-subtotal mono"></div>
      <div class="menu-add-field" style="margin-top:10px;">
        <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer;">
          <input type="checkbox" class="inv-block-vat-registered" checked style="width:auto;">
          هذا المورد يصدر فاتورة ضريبية (مسعّرة شاملة الضريبة)
        </label>
        <p class="stock-qty-helper" style="margin-top:6px;">مفعّل افتراضيًا — يحسب الضريبة تلقائيًا من داخل السعر المدخل أعلاه (مثل أسعار منيوك بالضبط)، وتُحتسب ضمن الضريبة القابلة للاسترداد بتقرير الإقرار الضريبي. عطّله بس لو هذا المورد لا يصدر فاتورة ضريبية (محل غير مسجّل بالضريبة).</p>
      </div>
    </div>
  `;
}

// Persistent 🟢/🟡 reconciliation status — replaces the old toast-only
// signal (which vanished after ~2 seconds) with a badge that stays visible
// on the block until it's saved or re-scanned, reusing exactly the same
// arithmetic-reconciliation outcome each scan branch already computes.
function setInvoiceReviewBadge(blockEl, ok, text){
  const notice = blockEl.querySelector('.inv-block-review-notice');
  if(!notice) return;
  notice.classList.remove('hidden');
  notice.classList.toggle('ok', ok);
  notice.classList.toggle('warn', !ok);
  const textEl = notice.querySelector('.inv-block-review-notice-text');
  if(textEl) textEl.textContent = text;
}

// Fills the invoice-number/date fields from a Gemini-extracted result —
// only when the owner hasn't already typed something in themselves, same
// "don't overwrite a real edit" rule used elsewhere in this modal.
function prefillInvoiceMetadata(blockEl, data){
  if(!data) return;
  const numberInput = blockEl.querySelector('.inv-block-invoice-number');
  if(numberInput && !numberInput.value && data.invoiceNumber) numberInput.value = data.invoiceNumber;
  const dateInput = document.getElementById('invDate');
  if(dateInput && data.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(data.invoiceDate)){
    const today = dateInputValue(new Date());
    // only overwrite while the date field still holds its default (today) —
    // once the owner has deliberately changed it, never touch it again
    if(dateInput.value === today) dateInput.value = data.invoiceDate;
  }
  if(data.invoiceType) blockEl.dataset.invoiceType = data.invoiceType;
}

function updateInvoiceGrandTotal(){
  let grand = 0;
  document.querySelectorAll('#invoiceBlocksContainer .inv-line-row .inv-line-total').forEach(inp=>{
    grand += parseFloat(inp.value) || 0;
  });
  const el = document.getElementById('invGrandTotal');
  if(el) el.innerHTML = `<div class="cpb-row total"><span>إجمالي كل الفواتير</span><span class="mono">${grand.toFixed(2)} ر.س</span></div>`;
}

function updateInvBlockRemoveVisibility(){
  const blocks = document.querySelectorAll('#invoiceBlocksContainer .inv-block');
  blocks.forEach(b => b.querySelector('.inv-block-remove').classList.toggle('hidden', blocks.length <= 1));
}

function wireInvoiceBlock(blockEl, prefillLines){
  const lineItemsEl = blockEl.querySelector('.inv-block-lineitems');
  const subtotalEl = blockEl.querySelector('.inv-block-subtotal');

  const updateBlockSubtotal = ()=>{
    let subtotal = 0;
    lineItemsEl.querySelectorAll('.inv-line-row').forEach(row=>{
      subtotal += parseFloat(row.querySelector('.inv-line-total').value) || 0;
    });
    subtotalEl.textContent = 'إجمالي هذه الفاتورة: ' + subtotal.toFixed(2) + ' ر.س';
    updateInvoiceGrandTotal();
  };
  const toggleNewFields = (row)=>{
    const isNew = row.querySelector('.inv-line-item').value === '__new__';
    row.querySelector('.inv-line-new-fields').classList.toggle('hidden', !isNew);
  };
  const wireRow = (row)=>{
    row.querySelector('.inv-line-total').addEventListener('input', updateBlockSubtotal);
    row.querySelector('.inv-line-total').addEventListener('input', ()=> row.querySelector('.inv-line-total').classList.remove('field-invalid'));
    row.querySelector('.inv-line-qty').addEventListener('input', ()=> row.querySelector('.inv-line-qty').classList.remove('field-invalid'));
    const newNameInput = row.querySelector('.inv-line-new-name');
    newNameInput.addEventListener('input', ()=> newNameInput.classList.remove('field-invalid'));
    // Every duplicate stock item traced today came from the same gap: no
    // exact match found, so a brand-new item got created silently instead
    // of asking "isn't this the same as X?" first. This doesn't block
    // anything — it's a suggestion the owner can ignore by just continuing
    // to type, but one click here fixes the whole class of bug at its
    // actual source instead of relying on catching it after the fact.
    newNameInput.addEventListener('input', ()=>{
      const suggestBox = row.querySelector('.inv-line-similar-suggestion');
      const value = newNameInput.value.trim();
      if(value.length < 2){ suggestBox.classList.add('hidden'); suggestBox.innerHTML = ''; return; }
      const similar = findSimilarNames(value, STOCK_ITEMS.map(s=>s.name));
      if(!similar.length){ suggestBox.classList.add('hidden'); suggestBox.innerHTML = ''; return; }
      suggestBox.innerHTML = 'يشبه صنف موجود، تقصد: ' + similar.map(s=>
        `<button type="button" class="inv-line-suggest-btn" data-name="${s.name}">${s.name}</button>`
      ).join(' ');
      suggestBox.classList.remove('hidden');
      suggestBox.querySelectorAll('.inv-line-suggest-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const select = row.querySelector('.inv-line-item');
          select.value = btn.dataset.name;
          select.dispatchEvent(new Event('change', {bubbles:true}));
          newNameInput.value = '';
          suggestBox.classList.add('hidden');
          suggestBox.innerHTML = '';
        });
      });
    });
    row.querySelector('.inv-line-item').addEventListener('change', ()=> toggleNewFields(row));
    row.querySelector('.inv-line-remove').addEventListener('click', ()=>{
      const rows = lineItemsEl.querySelectorAll('.inv-line-row');
      if(rows.length <= 1){ showToast('لازم يبقى صنف واحد على الأقل'); return; }
      row.remove();
      updateBlockSubtotal();
    });
  };
  const addRow = ()=>{
    invLineIdCounter++;
    const wrap = document.createElement('div');
    wrap.innerHTML = invLineRowHtml(invLineIdCounter);
    const row = wrap.firstElementChild;
    lineItemsEl.appendChild(row);
    wireRow(row);
    return row;
  };
  if(prefillLines && prefillLines.length){
    prefillLines.forEach(pl=>{
      const row = addRow();
      row.querySelector('.inv-line-item').value = pl.stockItemName;
      row.querySelector('.inv-line-qty').value = pl.qty;
      row.querySelector('.inv-line-total').value = pl.totalCost.toFixed(2);
    });
  } else {
    addRow();
  }
  updateBlockSubtotal();
  blockEl.querySelector('.inv-block-add-line-btn').addEventListener('click', addRow);
  blockEl.querySelector('.inv-block-remove').addEventListener('click', ()=>{
    if(document.querySelectorAll('#invoiceBlocksContainer .inv-block').length <= 1) return;
    blockEl.remove();
    updateInvoiceGrandTotal();
    updateInvBlockRemoveVisibility();
  });

  const fillRowFromItem = (row, item)=>{
    const select = row.querySelector('.inv-line-item');
    const baseIngredient = item.baseIngredient || item.name;
    const detectedUnit = guessUnitCode(item.unit, item.name);
    const rawMatch = findStockItemMatch(item.name, baseIngredient);
    const unitConflict = rawMatch && !unitsCompatible(detectedUnit, rawMatch.unit);
    const match = unitConflict ? null : rawMatch;
    if(match){
      select.value = match.name;
    } else if(baseIngredient){
      // no usable match — either no name match at all, or the name/alias
      // matched but the two purchases are measured in different physical
      // dimensions (weight vs volume) and can't be merged without a density
      // conversion this system won't guess. Either way: ask, don't guess.
      select.value = '__new__';
      const newNameInput = row.querySelector('.inv-line-new-name');
      newNameInput.value = unitConflict ? item.name : baseIngredient;
      row.querySelector('.inv-line-new-unit').value = detectedUnit;
      toggleNewFields(row);
      // A scan-proposed name is exactly the case that produced today's
      // duplicates (وصل "بيبار" بدل "بيبار هندي" الموجود) — the similarity
      // check is wired as an `input` listener (see wireRow), which a plain
      // .value assignment never fires on its own.
      newNameInput.dispatchEvent(new Event('input', {bubbles:true}));
    }
    if(item.qty != null) row.querySelector('.inv-line-qty').value = item.qty;
    if(item.lineTotal != null) row.querySelector('.inv-line-total').value = item.lineTotal.toFixed(2);
    // keep the exact invoice text (brand/pack size) for traceability even
    // though the row is linked to a generic ingredient for costing — and show
    // the packaging math (packages × units-per-package × size-per-unit) so
    // the computed qty is verifiable at a glance, not a black box
    const captionParts = [];
    if(unitConflict){
      captionParts.push('⚠️ "' + rawMatch.name + '" مسجّل عندك بوحدة ' + UNIT_LABELS[rawMatch.unit] + '، وهذا الصنف بوحدة مختلفة (' + UNIT_LABELS[detectedUnit] + ') — ما نقدر ندمجهم بدون معرفة الكثافة، سجّله كصنف منفصل أو صحّح يدويًا');
    }
    if(item.name && item.name !== baseIngredient) captionParts.push('كما بالفاتورة: ' + item.name);
    if(item.unitsPerPackage > 1 || item.contentPerUnit > 1){
      captionParts.push('الحساب: ' + (item.packageQty ?? 1) + ' × ' + (item.unitsPerPackage ?? 1) + ' × ' + (item.contentPerUnit ?? 1) + ' = ' + item.qty);
    }
    if(captionParts.length){
      row.dataset.rawDescription = item.name;
      const caption = row.querySelector('.inv-line-raw-caption');
      caption.textContent = captionParts.join(' — ');
      caption.classList.remove('hidden');
      if(unitConflict) caption.classList.add('inv-line-caption-warn');
    }
  };

  const getOrCreateRow = (index)=>{
    const rows = lineItemsEl.querySelectorAll('.inv-line-row');
    if(index < rows.length) return rows[index];
    return addRow();
  };

  // Where a new scan should start filling in: reuse row 0 only if it's still
  // the untouched blank row this block started with, otherwise append after
  // whatever a PRIOR scan in this same block already filled in.
  const scanFillOffset = ()=>{
    const rows = lineItemsEl.querySelectorAll('.inv-line-row');
    const firstRowBlank = rows.length === 1
      && rows[0].querySelector('.inv-line-item').value !== '__new__'
      && !rows[0].querySelector('.inv-line-qty').value
      && !rows[0].querySelector('.inv-line-total').value;
    return firstRowBlank ? 0 : rows.length;
  };

  const supplierInput = blockEl.querySelector('.inv-block-supplier');
  // A missing-supplier save failure used to be signaled by a toast alone —
  // easy to miss mid-workflow (confirmed: a real user pressed save, saw
  // nothing happen, and had to go hunting for why). The red outline stays
  // on the field itself until they actually fix it, not just for a couple
  // of seconds.
  supplierInput.addEventListener('input', ()=> supplierInput.classList.remove('field-invalid'));
  // Same "did you mean X?" pattern as the new-stock-item name field —
  // typo'd supplier names ("محل مجني" vs "محل مجنى") would otherwise
  // create a second supplier record silently.
  supplierInput.addEventListener('input', ()=>{
    const suggestBox = blockEl.querySelector('.inv-block-supplier-suggestion');
    const value = supplierInput.value.trim();
    if(value.length < 2){ suggestBox.classList.add('hidden'); suggestBox.innerHTML = ''; return; }
    const similar = findSimilarNames(value, Object.keys(SUPPLIER_ID_BY_NAME));
    if(!similar.length){ suggestBox.classList.add('hidden'); suggestBox.innerHTML = ''; return; }
    suggestBox.innerHTML = 'يشبه مورد مسجّل، تقصد: ' + similar.map(s=>
      `<button type="button" class="inv-block-supplier-suggest-btn" data-name="${s.name}">${s.name}</button>`
    ).join(' ');
    suggestBox.classList.remove('hidden');
    suggestBox.querySelectorAll('.inv-block-supplier-suggest-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        supplierInput.value = btn.dataset.name;
        supplierInput.classList.remove('field-invalid');
        suggestBox.classList.add('hidden');
        suggestBox.innerHTML = '';
      });
    });
  });
  const scanBtn = blockEl.querySelector('.inv-block-scan-btn');
  const scanInput = blockEl.querySelector('.inv-block-scan-input');
  const overlay = blockEl.querySelector('.inv-block-scan-overlay');
  const overlayText = blockEl.querySelector('.inv-block-scan-overlay-text');
  const reviewNotice = blockEl.querySelector('.inv-block-review-notice');
  scanBtn.addEventListener('click', ()=> scanInput.click());

  // One authenticated call to /api/purchases/scan-invoice, shared by both
  // the text-Gemini and vision-Gemini tiers below (they only differ in
  // which field they put in the FormData) — same error shape either way.
  const callScanInvoiceApi = async (session, buildFormData)=>{
    const fd = new FormData();
    await buildFormData(fd);
    try {
      const resp = await fetch('/api/purchases/scan-invoice', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token }, body: fd });
      const data = await resp.json();
      if(!resp.ok) return { error: data.error || 'تعذرت قراءة الفاتورة', code: data.code || null };
      return { data };
    } catch(e){
      return { error: 'تعذر الاتصال بخدمة القراءة: ' + (e && e.message ? e.message : ''), code: 'network_error' };
    }
  };

  scanInput.addEventListener('change', async ()=>{
    const file = scanInput.files && scanInput.files[0];
    scanInput.value = '';
    if(!file) return;
    overlay.classList.remove('hidden');
    overlayText.textContent = 'جارٍ قراءة الفاتورة محليًا...';
    scanBtn.disabled = true;
    if(reviewNotice) reviewNotice.classList.remove('hidden');
    const scanStartedAt = Date.now();
    // accumulates across whichever tiers get attempted, logged once at the
    // very end regardless of which stage finally accepted (or none did) —
    // this is what makes every scan's full path through the cascade
    // traceable, not just its final outcome
    const telemetry = { qrPresent:false, qrTotalMatch:null, ocrMeanConfidence:null, ocrLineMatchRate:null,
      localParseDecisionStage:null, localParseDecisionReason:null, textParseEscalationReason:null,
      lineItemCount:null, supplierVatNumber:null, usage:null, errorMessage:null };
    // captures supplierInput's *current* value at the moment each call
    // fires — it may fill in partway through (from QR or a Gemini tier),
    // so this can't be read once up front
    const logScan = (stage)=> logInvoiceScanEvent({
      resolutionStage: stage, durationMs: Date.now()-scanStartedAt,
      supplierName: supplierInput.value.trim() || null, ...telemetry
    });
    try {
      // QR decode and local OCR are both free/local — always run, in
      // parallel, regardless of what happens next.
      const [qrResult, ocrResult] = await Promise.all([
        window.scanZatcaInvoiceQr ? window.scanZatcaInvoiceQr(file).catch(()=>null) : Promise.resolve(null),
        window.scanInvoiceOcrText ? window.scanInvoiceOcrText(file).catch(()=>null) : Promise.resolve(null)
      ]);
      telemetry.qrPresent = !!qrResult;
      telemetry.supplierVatNumber = qrResult && qrResult.vatNumber;
      telemetry.ocrMeanConfidence = ocrResult && ocrResult.meanConfidence;

      if(qrResult && qrResult.sellerName && !supplierInput.value.trim()){
        supplierInput.value = qrResult.sellerName;
        supplierInput.dispatchEvent(new Event('input', {bubbles:true}));
      }

      // Tier 1: local deterministic parse + validation. Never gated on raw
      // OCR confidence — only on whether the extracted numbers reconcile
      // with each other (and the QR total, when present). A photo the
      // local OCR pass entirely failed on (e.g. handwritten, no lines at
      // all) still falls through to tier 2 rather than being special-cased
      // here — "never skip a stage" applies structurally, not just when
      // there's data to work with.
      let parsedLines = [];
      let parsedHeader = null;
      let decision = { stage: 'text_gemini', reason: PARSE_REASON.NO_LINES_FOUND };
      if(ocrResult && ocrResult.lines && ocrResult.lines.length){
        parsedHeader = parseInvoiceHeader(ocrResult.lines);
        parsedLines = parseInvoiceLines(ocrResult.lines);
        if(parsedLines.length){
          telemetry.ocrLineMatchRate = parsedLines.filter(l => l.value).length / parsedLines.length;
        }
        decision = decideInvoiceResolution({ qrResult, header: parsedHeader, lines: parsedLines });
      }
      telemetry.localParseDecisionStage = decision.stage;
      telemetry.localParseDecisionReason = decision.reason;

      if(decision.stage === 'local'){
        const offset = scanFillOffset();
        parsedLines.forEach((l, i)=>{
          const row = getOrCreateRow(offset + i);
          fillRowFromItem(row, {
            name: l.value.name, qty: l.value.qty, lineTotal: l.value.lineTotal, unit: l.value.unit,
            packageQty: l.value.packageQty, unitsPerPackage: l.value.unitsPerPackage, contentPerUnit: l.value.contentPerUnit,
          });
        });
        updateBlockSubtotal();
        const newCount = lineItemsEl.querySelectorAll('.inv-line-new-fields:not(.hidden)').length;
        showToast('تم استخراج ' + parsedLines.length + (parsedLines.length===1?' صنف':' أصناف') + ' محليًا بدون ذكاء اصطناعي' +
          (newCount ? ' — ' + newCount + (newCount===1?' صنف جديد':' أصناف جديدة') + ' غير مسجّلة بالمخزون، راجعها' : '') +
          '. راجع الأصناف والكميات ثم احفظ');
        telemetry.lineItemCount = parsedLines.length;
        telemetry.qrTotalMatch = (qrResult && qrResult.total != null) ? true : null; // local-accept with QR present only happens when the QR-total reconciliation already passed
        setInvoiceReviewBadge(blockEl, true, '🟢 متطابقة — قراءة محلية موثوقة');
        logScan('local_ocr');
        return;
      }

      // Tier 2: text-only Gemini — the cheap escalation target. Sent the
      // reading-order-reconstructed text (never Tesseract's raw flattened
      // string — see buildReadingOrderText), even if that text is empty;
      // the route itself rejects an empty/missing body for free rather
      // than this client special-casing "OCR found nothing" as a skip.
      overlayText.textContent = 'جارٍ قراءة الفاتورة بالذكاء الاصطناعي (نص)...';
      const sb = window.supabaseClient;
      const { data: { session } } = await sb.auth.getSession();
      if(!session){
        telemetry.errorMessage = 'جلسة غير صالحة';
        logScan('failed');
        showToast('جلسة غير صالحة');
        return;
      }
      const ocrText = (ocrResult && ocrResult.lines) ? buildReadingOrderText(ocrResult.lines) : '';
      const textResult = await callScanInvoiceApi(session, fd => fd.append('ocrText', ocrText));

      // Validate text-Gemini's own output before trusting it — the same
      // discipline as the local tier: never accept on the model's say-so
      // alone, only when the numbers actually reconcile. Confirmed during
      // Step 6 testing that ambiguous OCR input can make the model
      // hallucinate (e.g. unitsPerPackage: 1e+308), so a plausibility
      // bound on every value is checked before the arithmetic check even
      // runs — a "total" that only matches because both sides are
      // nonsense must not slip through.
      let textEscalationReason = null;
      if(textResult.error){
        textEscalationReason = SCAN_API_CODE_TO_REASON[textResult.code] || PARSE_REASON.API_ERROR;
      } else if(!textResult.data || !Array.isArray(textResult.data.items) || !textResult.data.items.length){
        textEscalationReason = PARSE_REASON.NO_LINES_FOUND;
      } else if(!textResult.data.items.every(it => isSaneAmount(it.lineTotal) && isSaneAmount(it.qty))){
        textEscalationReason = PARSE_REASON.IMPLAUSIBLE_VALUE;
      } else {
        const expectedTotal = (qrResult && qrResult.total != null) ? qrResult.total : textResult.data.grandTotal;
        const check = validateTotalsReconciliation(textResult.data.items.map(it => it.lineTotal), expectedTotal);
        textEscalationReason = check.ok ? null : check.reason;
      }

      if(!textEscalationReason){
        const offset = scanFillOffset();
        textResult.data.items.forEach((item, i)=>{
          const row = getOrCreateRow(offset + i);
          fillRowFromItem(row, item);
        });
        updateBlockSubtotal();
        const newCount = lineItemsEl.querySelectorAll('.inv-line-new-fields:not(.hidden)').length;
        showToast('تم استخراج ' + textResult.data.items.length + (textResult.data.items.length===1?' صنف':' أصناف') +
          (newCount ? ' — ' + newCount + (newCount===1?' صنف جديد':' أصناف جديدة') + ' غير مسجّلة بالمخزون، راجعها' : '') +
          '. راجع الأصناف والكميات ثم احفظ');
        telemetry.lineItemCount = textResult.data.items.length;
        telemetry.usage = textResult.data.usage;
        telemetry.qrTotalMatch = (qrResult && qrResult.total != null && textResult.data.grandTotal != null)
          ? Math.abs(qrResult.total - textResult.data.grandTotal) <= 0.02 * qrResult.total : null;
        setInvoiceReviewBadge(blockEl, true, '🟢 متطابقة — تحقق الذكاء الاصطناعي من المجموع');
        prefillInvoiceMetadata(blockEl, textResult.data);
        logScan('text_gemini');
        return;
      }
      telemetry.textParseEscalationReason = textEscalationReason;

      // Tier 3: vision Gemini — last resort, only reached when both the
      // local parse and the text-only pass failed to produce trustworthy
      // data. This is the tier the whole pipeline exists to minimize.
      overlayText.textContent = 'جارٍ قراءة الفاتورة بالذكاء الاصطناعي (صورة)...';
      // Tried routing this through the same grayscale + contrast-stretch
      // pass used for local Tesseract OCR (preprocessInvoiceImage in
      // DashboardPage.tsx) — reverted after a real side-by-side test on the
      // same physical invoice made results measurably WORSE (a 1080 vs 1.08
      // qty error, unit conversions lost, item names polluted with raw
      // barcode text that weren't there before). That preprocessing was
      // benchmarked for Tesseract specifically, a classical OCR engine that
      // genuinely benefits from near-binarized high-contrast input — Gemini's
      // vision model is trained on natural photos, and pushing an image into
      // that harsh look apparently confuses it rather than helping. Send the
      // raw file here; keep preprocessInvoiceImage for local OCR only unless
      // a *vision-tuned* enhancement is separately tested and proven to help.
      const visionResult = await callScanInvoiceApi(session, fd => fd.append('image', file));

      if(visionResult.error && !qrResult){
        telemetry.errorMessage = visionResult.error;
        setInvoiceReviewBadge(blockEl, false, '🟡 تحتاج مراجعة — تعذرت القراءة الآلية، أدخل البيانات يدويًا');
        logScan('failed');
        showToast(visionResult.error);
        return;
      }

      // (the QR's sellerName, if any, was already filled in right after
      // QR decode above — this only fires when QR had none)
      const supplierName = visionResult.data && visionResult.data.supplierName;
      if(supplierName && !supplierInput.value.trim()){
        supplierInput.value = supplierName;
        supplierInput.dispatchEvent(new Event('input', {bubbles:true}));
      }

      if(visionResult.data && Array.isArray(visionResult.data.items) && visionResult.data.items.length){
        // Vision is the last-resort tier — nowhere left to escalate to — but
        // "nowhere to escalate" must mean "make the user check it," not
        // "trust it blindly": production telemetry showed ~70% of real
        // scans landing here with zero automated sanity-checking beforehand,
        // exactly the gap that let a fabricated qty (60kg instead of 10kg)
        // through silently before this fix. Same discipline as the text
        // tier: sanity-bound every value, then reconcile against whichever
        // total is available (QR first, since it's never AI-derived).
        const items = visionResult.data.items;
        let visionValid = items.every(it => isSaneAmount(it.lineTotal) && isSaneAmount(it.qty));
        let visionInvalidReason = visionValid ? null : PARSE_REASON.IMPLAUSIBLE_VALUE;
        if(visionValid){
          const expectedTotal = (qrResult && qrResult.total != null) ? qrResult.total : visionResult.data.grandTotal;
          if(expectedTotal != null){
            const check = validateTotalsReconciliation(items.map(it => it.lineTotal), expectedTotal);
            visionValid = check.ok;
            visionInvalidReason = check.ok ? null : check.reason;
          }
        }

        const offset = scanFillOffset();
        items.forEach((item, i)=>{
          const row = getOrCreateRow(offset + i);
          fillRowFromItem(row, item);
        });
        updateBlockSubtotal();
        prefillInvoiceMetadata(blockEl, visionResult.data);
        const newCount = lineItemsEl.querySelectorAll('.inv-line-new-fields:not(.hidden)').length;
        if(visionValid){
          showToast('تم استخراج ' + items.length + (items.length===1?' صنف':' أصناف') +
            (newCount ? ' — ' + newCount + (newCount===1?' صنف جديد':' أصناف جديدة') + ' غير مسجّلة بالمخزون، راجعها' : '') +
            '. راجع الأصناف والكميات ثم احفظ');
          setInvoiceReviewBadge(blockEl, true, '🟢 متطابقة — تحقق الذكاء الاصطناعي من المجموع');
        } else {
          // still fill the rows — a human reviewing pre-filled (if
          // unverified) numbers beats retyping the whole invoice from
          // scratch — but the toast must not claim this was verified
          showToast('⚠️ الأصناف اللي قرأها الذكاء الاصطناعي ما تجمع صح مع إجمالي الفاتورة — راجع كل رقم يدويًا قبل الحفظ، لا تثق فيها كما هي');
          setInvoiceReviewBadge(blockEl, false, '🟡 تحتاج مراجعة — الأصناف ما تجمع صح مع الإجمالي');
        }
        telemetry.lineItemCount = items.length;
        telemetry.usage = visionResult.data.usage;
        telemetry.qrTotalMatch = (qrResult && qrResult.total != null && visionResult.data.grandTotal != null)
          ? Math.abs(qrResult.total - visionResult.data.grandTotal) <= 0.02 * qrResult.total : null;
        if(!visionValid) telemetry.errorMessage = 'vision items unvalidated: ' + visionInvalidReason;
        logScan('vision_gemini');
      } else if(qrResult && qrResult.total != null){
        // Vision couldn't parse items but the QR at least gives a reliable total
        const row = getOrCreateRow(scanFillOffset());
        row.querySelector('.inv-line-total').value = qrResult.total.toFixed(2);
        updateBlockSubtotal();
        showToast('ما قدرنا نميّز الأصناف بالصورة، بس قرأنا الإجمالي من رمز الفاتورة (' + qrResult.total.toFixed(2) + ' ر.س) — أدخل الأصناف يدويًا');
        setInvoiceReviewBadge(blockEl, false, '🟡 تحتاج مراجعة — أدخل الأصناف يدويًا');
        telemetry.lineItemCount = 0;
        telemetry.usage = visionResult.data && visionResult.data.usage;
        telemetry.errorMessage = visionResult.error || 'items not extracted, QR total used';
        logScan('vision_gemini');
      } else {
        telemetry.errorMessage = visionResult.error || 'no items, no QR total';
        showToast(visionResult.error || 'ما قدرنا نقرأ الفاتورة — جرّب صورة أوضح وبإضاءة أفضل، أو أدخل البيانات يدويًا');
        setInvoiceReviewBadge(blockEl, false, '🟡 تحتاج مراجعة — تعذرت القراءة الآلية');
        logScan('failed');
      }
    } catch(err){
      telemetry.errorMessage = err && err.message;
      showToast('تعذرت قراءة الفاتورة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      setInvoiceReviewBadge(blockEl, false, '🟡 تحتاج مراجعة — تعذرت القراءة الآلية، أدخل البيانات يدويًا');
      logScan('failed');
    } finally {
      overlay.classList.add('hidden');
      scanBtn.disabled = false;
    }
  });
}

function openInvoiceModal(editGroupId){
  invLineIdCounter = 0;
  invBlockIdCounter = 1;
  EDITING_GROUP_ID = editGroupId || null;
  let prefillSupplier = '', prefillLines = null, prefillDate = null;
  if(editGroupId){
    const groupRows = PURCHASE_INVOICES.filter(p => p.invoiceGroupId === editGroupId);
    if(groupRows.length){
      prefillSupplier = groupRows[0].supplier;
      prefillDate = groupRows[0].invoicedAt ? dateInputValue(new Date(groupRows[0].invoicedAt)) : null;
      prefillLines = groupRows.map(r => ({stockItemName: r.stockItem, qty: r.qty, totalCost: r.totalCost}));
    }
  }
  // Reflects this supplier's known registration status, not this specific
  // invoice — SUPPLIER_VAT_REGISTERED_BY_NAME is the live source of truth,
  // defaults to checked (true) for a brand-new supplier not seen before.
  const prefillVatRegistered = prefillSupplier ? (SUPPLIER_VAT_REGISTERED_BY_NAME[prefillSupplier] !== false) : true;
  const today = dateInputValue(new Date());
  document.getElementById('invoiceModalBody').innerHTML = `
    <div class="menu-add-field" style="margin-bottom:14px;"><label>تاريخ الفاتورة</label><input type="date" id="invDate" value="${prefillDate || today}" max="${today}"></div>
    <div id="invoiceBlocksContainer">${invBlockHtml(1)}</div>
    <button type="button" class="inv-add-block-btn" id="invAddBlockBtn">+ إضافة فاتورة من مورد آخر</button>
    <div class="cost-preview-box inv-grand-total" id="invGrandTotal"><div class="cpb-row total"><span>إجمالي كل الفواتير</span><span class="mono">0.00 ر.س</span></div></div>
  `;
  const firstBlock = document.querySelector('#invoiceBlocksContainer .inv-block');
  wireInvoiceBlock(firstBlock, prefillLines);
  if(prefillSupplier) firstBlock.querySelector('.inv-block-supplier').value = prefillSupplier;
  firstBlock.querySelector('.inv-block-vat-registered').checked = prefillVatRegistered;
  document.getElementById('invAddBlockBtn').addEventListener('click', ()=>{
    invBlockIdCounter++;
    const wrap = document.createElement('div');
    wrap.innerHTML = invBlockHtml(invBlockIdCounter);
    const block = wrap.firstElementChild;
    document.getElementById('invoiceBlocksContainer').appendChild(block);
    wireInvoiceBlock(block);
    updateInvBlockRemoveVisibility();
  });
  updateInvBlockRemoveVisibility();
  updateInvoiceGrandTotal();
  const saveBtn = document.getElementById('invoiceSaveBtn');
  if(saveBtn) saveBtn.textContent = editGroupId ? 'حفظ التعديلات' : 'حفظ الفاتورة';
  document.getElementById('invoiceModal').classList.add('show');
}
function closeInvoiceModal(){
  document.getElementById('invoiceModal').classList.remove('show');
  EDITING_GROUP_ID = null;
}
async function saveInvoice(){
  const dateVal = document.getElementById('invDate').value;
  const invoicedAt = dateVal ? new Date(dateVal + 'T12:00:00').toISOString() : new Date().toISOString();
  const blocks = document.querySelectorAll('#invoiceBlocksContainer .inv-block');

  const blockData = [];
  for(const blockEl of blocks){
    const supplier = blockEl.querySelector('.inv-block-supplier').value.trim();
    const rawLines = [];
    for(const row of blockEl.querySelectorAll('.inv-line-row')){
      const select = row.querySelector('.inv-line-item');
      const isNew = select.value === '__new__';
      const newName = isNew ? row.querySelector('.inv-line-new-name').value.trim() : '';
      const qty = parseFloat(row.querySelector('.inv-line-qty').value);
      const totalCost = parseFloat(row.querySelector('.inv-line-total').value);
      if(!qty && !totalCost && !(isNew && newName)) continue; // skip a row the user never filled in
      if(!supplier){
        const supplierInput = blockEl.querySelector('.inv-block-supplier');
        supplierInput.classList.add('field-invalid');
        supplierInput.scrollIntoView({behavior:'smooth', block:'center'});
        supplierInput.focus();
        showToast('لازم تكتب اسم المورد لكل فاتورة');
        return;
      }
      if(!(qty > 0)){
        const qtyInput = row.querySelector('.inv-line-qty');
        qtyInput.classList.add('field-invalid');
        qtyInput.scrollIntoView({behavior:'smooth', block:'center'});
        qtyInput.focus();
        showToast('لازم تدخل كمية صحيحة لكل صنف');
        return;
      }
      if(!(totalCost > 0)){
        const totalInput = row.querySelector('.inv-line-total');
        totalInput.classList.add('field-invalid');
        totalInput.scrollIntoView({behavior:'smooth', block:'center'});
        totalInput.focus();
        showToast('لازم تدخل سعر صحيح لكل صنف');
        return;
      }
      if(isNew && !newName){
        const newNameInput = row.querySelector('.inv-line-new-name');
        newNameInput.classList.add('field-invalid');
        newNameInput.scrollIntoView({behavior:'smooth', block:'center'});
        newNameInput.focus();
        showToast('لازم تكتب اسم الصنف الجديد');
        return;
      }
      rawLines.push({isNew, stockItemName: isNew ? newName : select.value, newUnit: isNew ? row.querySelector('.inv-line-new-unit').value : null,
        qty, totalCost, rawDescription: row.dataset.rawDescription || null});
    }
    if(rawLines.length === 0) continue; // an unused extra block is fine to skip silently
    const vatRegistered = blockEl.querySelector('.inv-block-vat-registered').checked;
    const invoiceNumberInput = blockEl.querySelector('.inv-block-invoice-number');
    const invoiceNumber = invoiceNumberInput && invoiceNumberInput.value.trim() ? invoiceNumberInput.value.trim() : null;
    const invoiceType = blockEl.dataset.invoiceType || null;
    blockData.push({supplier, rawLines, vatRegistered, invoiceNumber, invoiceType});
  }
  if(blockData.length === 0){ showToast('أضف صنف واحد على الأقل'); return; }

  // Nothing today catches an invoice photo getting scanned/saved twice by
  // mistake (e.g. a rushed employee). Cheap, client-side check against
  // already-loaded PURCHASE_INVOICES — same supplier, same date, and a
  // total within 1% of an existing invoice group's summed total — asks
  // once rather than blocking; a legitimate second order from the same
  // supplier on the same day for a near-identical amount is rare but real.
  if(!EDITING_GROUP_ID){
    const invoicedDateStr = invoicedAt.slice(0, 10);
    for(const bd of blockData){
      const newTotal = bd.rawLines.reduce((s, rl)=>s+rl.totalCost, 0);
      const groupTotals = {};
      PURCHASE_INVOICES.forEach(p=>{
        if(p.supplier !== bd.supplier) return;
        if(!p.invoicedAt || p.invoicedAt.slice(0,10) !== invoicedDateStr) return;
        groupTotals[p.invoiceGroupId] = (groupTotals[p.invoiceGroupId]||0) + p.totalCost;
      });
      const nearDuplicate = Object.values(groupTotals).some(t => Math.abs(t - newTotal) <= Math.max(0.5, newTotal*0.01));
      if(nearDuplicate){
        const proceed = window.confirm(
          'فيه فاتورة مسجّلة من "' + bd.supplier + '" بنفس التاريخ وبإجمالي قريب جدًا من هذي (' + newTotal.toFixed(2) + ' ر.س) — ' +
          'يمكن هذي نفس الفاتورة انسجّلت غلط مرتين. تبي تكمل الحفظ برضه؟'
        );
        if(!proceed) return;
      }
    }
  }

  const saveBtn = document.getElementById('invoiceSaveBtn');
  saveBtn.disabled = true;
  try {
    const sb = window.supabaseClient;
    if(EDITING_GROUP_ID){
      // edit = delete the old invoice (the DB trigger reverts qty_on_hand/unit_cost
      // exactly), refresh the local stock cache from that reverted truth, then fall
      // through to the normal insert flow below to record the corrected version —
      // avoids replaying weighted-average math twice by hand
      const { error: delErr } = await sb.from('purchase_invoices').delete().eq('invoice_group_id', EDITING_GROUP_ID);
      if(delErr) throw delErr;
      PURCHASE_INVOICES = PURCHASE_INVOICES.filter(p => p.invoiceGroupId !== EDITING_GROUP_ID);
      const { data: freshStock } = await sb.from('stock_items').select('*').eq('business_id', CURRENT_PROFILE.business_id);
      if(freshStock){
        freshStock.forEach(s=>{
          const existing = STOCK_ITEMS.find(x=>x.id===s.id);
          if(existing){ existing.qtyOnHand = Number(s.qty_on_hand); existing.unitCost = Number(s.unit_cost); existing.aliasNames = s.alias_names || []; }
        });
      }
      EDITING_GROUP_ID = null;
    }
    const allRowsToInsert = [];
    const allLineMeta = [];
    let grandTotalAll = 0;
    let totalLineCount = 0;
    const supplierNamesUsed = [];

    for(const bd of blockData){
      let supplierId = SUPPLIER_ID_BY_NAME[bd.supplier];
      if(!supplierId){
        const { data: newSup, error: supErr } = await sb.from('suppliers')
          .insert({business_id: CURRENT_PROFILE.business_id, name: bd.supplier, vat_registered: bd.vatRegistered}).select().single();
        if(supErr){
          // 23505 = unique_violation on (business_id, name) — two people
          // saving an invoice for the same new supplier at nearly the same
          // moment is a real race (SUPPLIER_ID_BY_NAME is a client-side
          // cache, so it can't see the other tab's in-flight insert). The
          // DB constraint correctly stops a duplicate row from being
          // created; without this, the second save would just throw and
          // fail outright instead of finding the supplier the first save
          // already created and continuing normally.
          if(supErr.code === '23505'){
            const { data: existing, error: fetchErr } = await sb.from('suppliers')
              .select('id').eq('business_id', CURRENT_PROFILE.business_id).eq('name', bd.supplier).single();
            if(fetchErr || !existing) throw supErr;
            supplierId = existing.id;
          } else {
            throw supErr;
          }
        } else {
          supplierId = newSup.id;
        }
        SUPPLIER_ID_BY_NAME[bd.supplier] = supplierId;
      } else if(SUPPLIER_VAT_REGISTERED_BY_NAME[bd.supplier] !== bd.vatRegistered){
        // keep the supplier's master record in sync with the checkbox on
        // this invoice — the owner can flip it here anytime without a
        // separate suppliers-management screen
        await sb.from('suppliers').update({vat_registered: bd.vatRegistered}).eq('id', supplierId);
      }
      SUPPLIER_VAT_REGISTERED_BY_NAME[bd.supplier] = bd.vatRegistered;
      supplierNamesUsed.push(bd.supplier);

      // create any brand-new stock items first so their ids exist before the invoice insert
      const lines = [];
      for(const rl of bd.rawLines){
        let stockItem;
        // whenever we know both the exact invoice text and which stock item it
        // was confirmed to be, remember that pairing — next scan of the same
        // brand/pack text matches instantly, no re-deciding
        const newAlias = (rl.rawDescription && rl.rawDescription !== rl.stockItemName) ? rl.rawDescription : null;
        if(rl.isNew){
          const unitCost = rl.qty > 0 ? rl.totalCost / rl.qty : 0;
          // par_level (the reorder-alert threshold) used to be set to exactly
          // this first purchase's qty — meaning a tiny/atypical first buy
          // (e.g. a small test order) permanently set the low-stock alert
          // right at "any consumption at all." computeStockPct divides by
          // par_level, so it can never be 0 (division by zero → NaN in the
          // stock bar); doubling this first purchase is a reasonable
          // bootstrap guess at a comfortable stocking level with real
          // headroom, not just "whatever happened to be bought first."
          const initialParLevel = rl.qty * 2;
          const { data: inserted, error: stockErr } = await sb.from('stock_items').insert({
            business_id: CURRENT_PROFILE.business_id, name: rl.stockItemName, unit: rl.newUnit, unit_cost: unitCost,
            category: 'raw', qty_on_hand: 0, par_level: initialParLevel, alias_names: newAlias ? [newAlias] : []
          }).select().single();
          if(stockErr) throw stockErr;
          stockItem = {id: inserted.id, name: rl.stockItemName, unit: rl.newUnit, unitCost, category: 'raw', qtyOnHand: 0, parLevel: initialParLevel, aliasNames: newAlias ? [newAlias] : []};
          STOCK_ITEMS.push(stockItem);
          STOCK_ITEM_ID_BY_NAME[rl.stockItemName] = inserted.id; STOCK_ITEM_NAME_BY_ID[inserted.id] = rl.stockItemName;
          logDashboardAudit('أضاف صنف مخزون جديد أثناء تسجيل فاتورة: ' + rl.stockItemName);
        } else {
          stockItem = STOCK_ITEMS.find(s=>s.name===rl.stockItemName);
          if(stockItem && newAlias && !(stockItem.aliasNames||[]).includes(newAlias)){
            const updatedAliases = [...(stockItem.aliasNames||[]), newAlias];
            const { error: aliasErr } = await sb.from('stock_items').update({alias_names: updatedAliases}).eq('id', stockItem.id);
            if(!aliasErr) stockItem.aliasNames = updatedAliases;
          }
        }
        lines.push({stockItemName: rl.stockItemName, qty: rl.qty, totalCost: rl.totalCost, unit: stockItem ? stockItem.unit : 'kg', stockItem, rawDescription: rl.rawDescription});
      }

      // Supplier invoices are VAT-inclusive totals, same as this
      // restaurant's own menu prices — derive each line's VAT straight from
      // its own total_cost (the exact same tax-fraction formula used for
      // sales), no manual entry needed. Only for VAT-registered suppliers;
      // an unregistered supplier's total has no VAT component to extract.
      lines.forEach(l => {
        l.vatAmount = bd.vatRegistered
          ? Math.round((l.totalCost * BUSINESS_VAT_RATE / (1 + BUSINESS_VAT_RATE) + Number.EPSILON) * 100) / 100
          : null;
      });

      const invoiceGroupId = crypto.randomUUID();
      lines.forEach(l => {
        allRowsToInsert.push({
          business_id: CURRENT_PROFILE.business_id, stock_item_id: STOCK_ITEM_ID_BY_NAME[l.stockItemName], supplier_id: supplierId,
          qty: l.qty, unit: l.unit, total_cost: l.totalCost, vat_amount: l.vatAmount, created_by: CURRENT_PROFILE.id, invoice_group_id: invoiceGroupId,
          raw_description: l.rawDescription, invoiced_at: invoicedAt, invoice_number: bd.invoiceNumber, invoice_type: bd.invoiceType
        });
        allLineMeta.push({...l, supplier: bd.supplier});
        grandTotalAll += l.totalCost;
        totalLineCount++;
      });
    }

    const { data: inserted, error } = await sb.from('purchase_invoices').insert(allRowsToInsert).select();
    if(error) throw error;

    // the database trigger already bumped qty_on_hand AND recomputed unit_cost
    // (weighted average) for real — mirror both locally too, same formula
    inserted.forEach((row, idx) => {
      const l = allLineMeta[idx];
      PURCHASE_INVOICES.unshift({id: row.id, stockItem: l.stockItemName, supplier: l.supplier, qty: l.qty, unit: l.unit, totalCost: l.totalCost, vatAmount: l.vatAmount,
        date: formatRelativeDate(row.invoiced_at), invoicedAt: row.invoiced_at, invoiceGroupId: row.invoice_group_id, stockItemId: row.stock_item_id});
      if(l.stockItem){
        const priorQty = l.stockItem.qtyOnHand;
        const combinedQty = priorQty + l.qty;
        l.stockItem.unitCost = combinedQty > 0 ? (priorQty * l.stockItem.unitCost + l.totalCost) / combinedQty : l.stockItem.unitCost;
        l.stockItem.qtyOnHand = combinedQty;
      }
    });
    const supplierSummary = [...new Set(supplierNamesUsed)].join('، ');
    logDashboardAudit('سجّل ' + blockData.length + (blockData.length===1?' فاتورة شراء':' فواتير شراء') + ' (' + totalLineCount + (totalLineCount===1?' صنف':' أصناف') + ') من ' + supplierSummary + ' بإجمالي ' + grandTotalAll.toFixed(2) + ' ر.س');
    showToast('تم حفظ ' + (blockData.length===1?'الفاتورة':blockData.length+' فواتير') + ' (' + totalLineCount + (totalLineCount===1?' صنف':' أصناف') + ') بإجمالي ' + grandTotalAll.toFixed(2) + ' ر.س');
    closeInvoiceModal();
    renderSupplierComparison();
    if(typeof renderAcctTodayStat === 'function') renderAcctTodayStat();
    if(typeof renderPurchaseHistory === 'function') renderPurchaseHistory();
    if(typeof renderStockTable === 'function') renderStockTable();
    if(typeof renderWasteAndFoodCost === 'function') renderWasteAndFoodCost();
    if(typeof renderMenuProductTable === 'function') renderMenuProductTable();
  } catch(err){
    showToast('تعذر حفظ الفاتورة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    saveBtn.disabled = false;
  }
}

/* ============ Purchase history — "what did I log today" answer, grouped by
   invoice_group_id (one card per physical invoice, not per line item), with
   edit (reopens the modal prefilled, saves as delete+reinsert) and delete
   (DB trigger reverts qty_on_hand/unit_cost automatically). Defaults to
   today so the owner isn't hunting through everything ever logged. */
let purchaseHistoryRange = 'today';

function renderAcctTodayStat(){
  const el = document.getElementById('acctTodayStat');
  if(!el) return;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayGroupIds = new Set();
  let todayTotal = 0;
  PURCHASE_INVOICES.forEach(inv=>{
    const t = inv.invoicedAt ? new Date(inv.invoicedAt) : null;
    if(t && t >= todayStart){
      todayGroupIds.add(inv.invoiceGroupId || inv.id);
      todayTotal += inv.totalCost;
    }
  });
  const count = todayGroupIds.size;
  const icon = '<path d="M4 4h16v15l-3-2-3 2-3-2-3 2-3-2-1 1z"/><path d="M8 9h8"/><path d="M8 12.5h8"/><path d="M8 16h5"/>';
  el.innerHTML = `
    <div class="purchases-today-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icon}</svg></div>
    <div class="purchases-today-body">
      <div class="purchases-today-label">مشتريات اليوم</div>
      ${count > 0
        ? `<div class="purchases-today-value mono">${count} ${count===1?'فاتورة':'فواتير'} — ${todayTotal.toFixed(2)} ر.س</div>`
        : `<div class="purchases-today-value empty">ما سجّلت أي مشتريات اليوم بعد</div>`}
    </div>`;
}

function renderPurchaseHistory(){
  const el = document.getElementById('purchaseHistoryList');
  if(!el) return;
  const now = new Date();
  let cutoff = null;
  if(purchaseHistoryRange === 'today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if(purchaseHistoryRange === 'week'){ cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); }

  const groups = {};
  PURCHASE_INVOICES.forEach(inv=>{
    const gid = inv.invoiceGroupId || ('__' + inv.id);
    const t = inv.invoicedAt ? new Date(inv.invoicedAt) : null;
    if(cutoff && (!t || t < cutoff)) return;
    if(!groups[gid]) groups[gid] = {supplier: inv.supplier, lines: [], total: 0, date: inv.date, sortTime: t ? t.getTime() : 0};
    groups[gid].lines.push(inv);
    groups[gid].total += inv.totalCost;
  });
  const groupList = Object.entries(groups).sort((a,b)=> b[1].sortTime - a[1].sortTime);

  if(groupList.length === 0){
    el.innerHTML = '<div class="orders-empty">ما فيه فواتير مسجّلة بهالفترة</div>';
    return;
  }
  // Detail (what's actually registered in the invoice) stays hidden until
  // tapped — keeps the list scannable while still answering "وش المسجل
  // فيها" one tap away, instead of always-on clutter.
  const editIcon = '<path d="M4 20h4L18.5 9.5a2.83 2.83 0 1 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>';
  const deleteIcon = '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>';
  el.innerHTML = groupList.map(([gid, g])=>`
    <div class="purchase-history-card">
      <div class="purchase-history-row" data-group-id="${gid}">
        <div class="purchase-history-info">
          <div class="purchase-history-supplier">${escapeHtml(g.supplier)}</div>
          <div class="purchase-history-meta">${g.lines.length} ${g.lines.length===1?'صنف':'أصناف'} — <span class="mono">${g.total.toFixed(2)} ر.س</span> — ${g.date}</div>
        </div>
        <div class="purchase-history-actions">
          <button type="button" class="purchase-history-edit-btn" data-group-id="${gid}" title="تعديل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${editIcon}</svg></button>
          <button type="button" class="purchase-history-delete-btn" data-group-id="${gid}" title="حذف"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${deleteIcon}</svg></button>
        </div>
      </div>
      <div class="purchase-history-detail hidden">
        ${g.lines.map(l=>`
          <div class="purchase-history-detail-line">
            <span>${l.stockItem}</span>
            <span class="mono">${l.qty} ${UNIT_LABELS[l.unit] || l.unit}</span>
            <span class="mono">${l.totalCost.toFixed(2)} ر.س</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
  el.querySelectorAll('.purchase-history-row').forEach(row=>{
    row.querySelector('.purchase-history-info').addEventListener('click', ()=>{
      row.parentElement.querySelector('.purchase-history-detail').classList.toggle('hidden');
    });
  });
  el.querySelectorAll('.purchase-history-edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openInvoiceModal(btn.dataset.groupId));
  });
  el.querySelectorAll('.purchase-history-delete-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> deletePurchaseInvoice(btn.dataset.groupId));
  });
}

async function deletePurchaseInvoice(groupId){
  const groupRows = PURCHASE_INVOICES.filter(p => p.invoiceGroupId === groupId);
  if(!groupRows.length) return;
  const supplier = groupRows[0].supplier;
  const total = groupRows.reduce((s,r)=>s+r.totalCost, 0);
  if(!window.confirm('متأكد إنك تبي تحذف فاتورة "' + supplier + '" بقيمة ' + total.toFixed(2) + ' ر.س؟ المخزون بيترجع تلقائيًا.')) return;
  try {
    const sb = window.supabaseClient;
    const { error } = await sb.from('purchase_invoices').delete().eq('invoice_group_id', groupId);
    if(error) throw error;
    PURCHASE_INVOICES = PURCHASE_INVOICES.filter(p => p.invoiceGroupId !== groupId);
    const { data: freshStock } = await sb.from('stock_items').select('*').eq('business_id', CURRENT_PROFILE.business_id);
    if(freshStock){
      freshStock.forEach(s=>{
        const existing = STOCK_ITEMS.find(x=>x.id===s.id);
        if(existing){ existing.qtyOnHand = Number(s.qty_on_hand); existing.unitCost = Number(s.unit_cost); existing.aliasNames = s.alias_names || []; }
      });
    }
    logDashboardAudit('حذف فاتورة شراء من ' + supplier + ' بقيمة ' + total.toFixed(2) + ' ر.س');
    showToast('تم حذف الفاتورة وتصحيح المخزون');
    renderAcctTodayStat();
    renderPurchaseHistory();
    renderSupplierComparison();
    if(typeof renderStockTable === 'function') renderStockTable();
    if(typeof renderWasteAndFoodCost === 'function') renderWasteAndFoodCost();
    if(typeof renderMenuProductTable === 'function') renderMenuProductTable();
  } catch(err){
    showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  }
}

/* ============ General Expenses — non-inventory spending (rent extras, maintenance, marketing...).
   Deliberately NOT linked to stock quantities or product costing — this is a simple record-keeping
   log, separate from the monthly Fixed Costs rate used for product margins (Settings). */
let GENERAL_EXPENSES = [
  {id:1, category:'صيانة', amount:450, description:'إصلاح ماكينة القهوة', date:'قبل يومين'},
  {id:2, category:'تسويق', amount:300, description:'إعلان سوشال ميديا', date:'قبل ٤ أيام'}
];
let expenseIdCounter = 3;
const EXPENSE_CATEGORIES = ['صيانة','تسويق','نقل وتوصيل','رسوم حكومية','أخرى'];

function openExpenseModal(){
  document.getElementById('expenseModalBody').innerHTML = `
    <div class="menu-add-row" style="margin-bottom:14px;">
      <div class="menu-add-field"><label>الفئة</label>
        <select id="expCategory">${EXPENSE_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div class="menu-add-field"><label>المبلغ (ر.س)</label><input type="number" id="expAmount" placeholder="0.00"></div>
    </div>
    <div class="menu-add-field"><label>وصف مختصر</label><input type="text" id="expDescription" placeholder="مثال: إصلاح تكييف"></div>
    <div class="stock-qty-helper" style="margin-top:14px;">هذا سجل للمصروف بس — ما يأثر على مخزونك ولا على تكلفة أي منتج. لو تبي تغيّر معدل مصاريفك الثابتة الشهرية (إيجار، رواتب)، روح الإعدادات → المصاريف الثابتة.</div>
  `;
  document.getElementById('expenseModal').classList.add('show');
}
function closeExpenseModal(){ document.getElementById('expenseModal').classList.remove('show'); }
async function saveExpense(){
  const category = document.getElementById('expCategory').value;
  const amount = parseFloat(document.getElementById('expAmount').value);
  const description = document.getElementById('expDescription').value.trim();
  if(!(amount > 0)){ showToast('لازم تدخل مبلغ صحيح'); return; }
  if(!description){ showToast('لازم تكتب وصف مختصر'); return; }

  const saveBtn = document.getElementById('expenseSaveBtn');
  saveBtn.disabled = true;
  try {
    const sb = window.supabaseClient;
    let categoryId = EXPENSE_CATEGORY_ID_BY_NAME[category];
    if(!categoryId){
      const { data: newCat, error: catErr } = await sb.from('expense_categories')
        .insert({business_id: CURRENT_PROFILE.business_id, name: category}).select().single();
      if(catErr) throw catErr;
      categoryId = newCat.id;
      EXPENSE_CATEGORY_ID_BY_NAME[category] = categoryId;
    }
    const { data: inserted, error } = await sb.from('general_expenses').insert({
      business_id: CURRENT_PROFILE.business_id, category_id: categoryId, amount, description, created_by: CURRENT_PROFILE.id
    }).select().single();
    if(error) throw error;
    GENERAL_EXPENSES.unshift({id: inserted.id, category, amount, description, date:'اليوم'});
    logDashboardAudit('سجّل مصروف عام: ' + description + ' (' + amount.toFixed(2) + ' ر.س)');
    showToast('تم تسجيل المصروف');
    closeExpenseModal();
    renderGeneralExpensesList();
  } catch(err){
    showToast('تعذر تسجيل المصروف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    saveBtn.disabled = false;
  }
}
function renderGeneralExpensesList(){
  const el = document.getElementById('generalExpensesList');
  if(!el) return;
  if(GENERAL_EXPENSES.length === 0){ el.innerHTML = '<div class="supcomp-empty">ما فيه مصروفات مسجّلة لسا.</div>'; return; }
  const total = GENERAL_EXPENSES.reduce((s,e)=>s+e.amount,0);
  el.innerHTML = `<div class="stock-qty-helper">إجمالي المصروفات المسجّلة: <b class="mono">${total.toFixed(2)} ر.س</b></div>` +
    [...GENERAL_EXPENSES].reverse().map(e=>`
    <div class="supcomp-row">
      <span class="mtr-mod-type-badge">${e.category}</span>
      <div style="flex:1;">
        <div class="supcomp-supplier">${e.description}</div>
        <div class="supcomp-meta">${e.date}</div>
      </div>
      <span class="supcomp-unit-price">${e.amount.toFixed(2)} ر.س</span>
    </div>
  `).join('');
}

const PARSE_REASON_LABELS = {
  arithmetic_mismatch: 'عدم تطابق حسابي (الأرقام ما تجمع صح)',
  unknown_unit: 'وحدة قياس غير معروفة',
  ocr_ambiguity: 'غموض بقراءة OCR',
  missing_total: 'الإجمالي غير موجود بالنص',
  missing_vat: 'ضريبة القيمة المضافة غير موجودة',
  missing_subtotal: 'الإجمالي قبل الضريبة غير موجود',
  unknown_package_notation: 'صيغة تعبئة غير معروفة',
  decimal_recovered: 'احتاج تصحيح فاصلة عشرية',
  no_lines_found: 'ما انلقت أصناف بالنص',
  implausible_value: 'قيمة غير منطقية من الذكاء الاصطناعي',
  api_error: 'خطأ بالاتصال بخدمة القراءة',
  rate_limited: 'تجاوز الحد المجاني المسموح (rate limit)',
  gemini_error: 'خطأ من خدمة الذكاء الاصطناعي',
};

// Production observability (Step 8) for the invoice-scan pipeline —
// deliberately reads raw invoice_scan_events rows and aggregates in the
// client rather than adding a server-side aggregation endpoint: the whole
// point right now is answering "is each optimization actually reducing
// vision_gemini usage" from real production data as it accumulates over
// the first few hundred scans, not building infrastructure ahead of need.
async function renderInvoiceScanMetrics(){
  const el = document.getElementById('invoiceScanMetricsList');
  if(!el) return;
  el.innerHTML = '<div class="supcomp-empty">جارٍ التحميل...</div>';
  const sb = window.supabaseClient;
  const { data: rows, error } = await sb.from('invoice_scan_events')
    .select('resolution_stage, duration_ms, estimated_cost_sar, local_parse_decision_reason, text_parse_escalation_reason, supplier_name, ocr_mean_confidence, ocr_line_match_rate, created_at')
    .eq('business_id', CURRENT_PROFILE.business_id)
    .order('created_at', { ascending: false })
    .limit(500);

  if(error || !rows){ el.innerHTML = '<div class="supcomp-empty">تعذر تحميل بيانات الأداء</div>'; return; }
  if(rows.length === 0){
    el.innerHTML = '<div class="supcomp-empty">ما فيه فواتير ممسوحة لسا — بتظهر هنا إحصائيات دقة القراءة والتكلفة أول ما تبدأ تمسح فواتير من زر "صوّر الفاتورة".</div>';
    return;
  }

  const total = rows.length;
  const countByStage = {};
  const durationsByStage = {};
  rows.forEach(r=>{
    countByStage[r.resolution_stage] = (countByStage[r.resolution_stage]||0)+1;
    if(r.duration_ms != null) (durationsByStage[r.resolution_stage] = durationsByStage[r.resolution_stage]||[]).push(r.duration_ms);
  });
  const avg = arr => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const pct = stage => total ? ((countByStage[stage]||0)/total*100) : 0;
  const totalCost = rows.reduce((s,r)=>s+(r.estimated_cost_sar||0),0);

  const countBy = (key)=>{
    const counts = {};
    rows.forEach(r=>{ if(r[key]) counts[r[key]] = (counts[r[key]]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  };
  const supplierEscalations = {};
  rows.forEach(r=>{
    if(r.resolution_stage !== 'local_ocr' && r.supplier_name) supplierEscalations[r.supplier_name] = (supplierEscalations[r.supplier_name]||0)+1;
  });
  const topSuppliers = Object.entries(supplierEscalations).sort((a,b)=>b[1]-a[1]).slice(0,8);

  const stageRow = (stage, label)=> `
    <div class="cpb-row"><span>${label}</span><span class="mono">${pct(stage).toFixed(0)}٪ (${countByStage[stage]||0}) — متوسط ${avg(durationsByStage[stage]) != null ? (avg(durationsByStage[stage])/1000).toFixed(1)+' ث' : '—'}</span></div>`;

  const reasonList = (entries)=> entries.length
    ? entries.slice(0,6).map(([reason,count])=>`<div class="cpb-row"><span>${PARSE_REASON_LABELS[reason]||reason}</span><span class="mono">${count}</span></div>`).join('')
    : '<div class="supcomp-empty" style="padding:14px;">لا يوجد</div>';

  const ocrConfidences = rows.map(r=>r.ocr_mean_confidence).filter(v=>v!=null);
  const ocrLineRates = rows.map(r=>r.ocr_line_match_rate).filter(v=>v!=null);
  const lowOcrCount = ocrConfidences.filter(v=>v<50).length;

  el.innerHTML = `
    <div class="stock-qty-helper">آخر ${total} عملية مسح فاتورة — كل رقم من بيانات إنتاج حقيقية، مو تقديري</div>
    <div style="margin:14px 0;">
      <div class="panel-title" style="margin-bottom:8px;">توزيع مراحل القراءة</div>
      ${stageRow('local_ocr','محليًا — بدون تكلفة ذكاء اصطناعي')}
      ${stageRow('text_gemini','ذكاء اصطناعي (نص) — تكلفة منخفضة')}
      ${stageRow('vision_gemini','ذكاء اصطناعي (صورة) — الأعلى تكلفة')}
      ${stageRow('failed','فشلت القراءة تمامًا')}
      <div class="cpb-row total"><span>متوسط التكلفة لكل فاتورة</span><span class="mono">${(totalCost/total).toFixed(4)} ر.س</span></div>
      <div class="cpb-row"><span>إجمالي التكلفة التقديرية (آخر ${total})</span><span class="mono">${totalCost.toFixed(2)} ر.س</span></div>
    </div>
    <div style="margin-bottom:14px;">
      <div class="panel-title" style="margin-bottom:8px;">جودة القراءة المحلية (OCR)</div>
      <div class="cpb-row"><span>متوسط ثقة القراءة</span><span class="mono">${avg(ocrConfidences) != null ? avg(ocrConfidences).toFixed(0)+'٪' : '—'}</span></div>
      <div class="cpb-row"><span>متوسط نسبة الأصناف المقروءة بثقة</span><span class="mono">${avg(ocrLineRates) != null ? (avg(ocrLineRates)*100).toFixed(0)+'٪' : '—'}</span></div>
      <div class="cpb-row"><span>فواتير بثقة قراءة منخفضة (أقل من 50٪)</span><span class="mono">${lowOcrCount} من ${ocrConfidences.length}</span></div>
    </div>
    <div style="margin-bottom:14px;">
      <div class="panel-title" style="margin-bottom:8px;">أكثر أسباب عدم القبول محليًا</div>
      ${reasonList(countBy('local_parse_decision_reason'))}
    </div>
    <div style="margin-bottom:14px;">
      <div class="panel-title" style="margin-bottom:8px;">أكثر أسباب رفض القراءة النصية (تصعيد للصورة)</div>
      ${reasonList(countBy('text_parse_escalation_reason'))}
    </div>
    <div>
      <div class="panel-title" style="margin-bottom:8px;">أكثر الموردين تسببًا بتصعيد للذكاء الاصطناعي</div>
      ${topSuppliers.length ? topSuppliers.map(([name,count])=>`<div class="cpb-row"><span>${escapeHtml(name)}</span><span class="mono">${count}</span></div>`).join('') : '<div class="supcomp-empty" style="padding:14px;">لا يوجد</div>'}
    </div>
  `;
}

function wireInventoryScreen(){
  document.getElementById('openAddStockBtn').addEventListener('click', ()=> openStockItemModal(null));
  document.getElementById('openBulkImportStockBtn').addEventListener('click', ()=> openBulkImportModal('stock'));
  document.getElementById('stockItemModalClose').addEventListener('click', closeStockItemModal);
  document.getElementById('stockItemModal').addEventListener('click', (e)=>{ if(e.target.id==='stockItemModal') closeStockItemModal(); });
  document.getElementById('stockItemSaveBtn').addEventListener('click', saveStockItem);
  document.getElementById('stockItemDeleteLink').addEventListener('click', deleteStockItem);
  document.getElementById('checkDuplicateStockBtn').addEventListener('click', renderDuplicateStockCheck);
  document.getElementById('stockSearchInput').addEventListener('input', (e)=>{
    stockSearchQuery = e.target.value;
    renderStockTable();
  });
  document.getElementById('stockAttentionFilter').addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-filter]'); if(!btn) return;
    document.querySelectorAll('#stockAttentionFilter button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    stockAttentionFilter = btn.dataset.filter;
    renderStockTable();
  });
}

// Periodic manual audit — every duplicate stock item traced this session
// came from a scan creating a new item instead of matching an existing
// one, and they accumulate silently until someone notices the inventory
// list looks cluttered. Pairwise bigram similarity across the whole list;
// never auto-merges anything (that's a real business decision — which
// name/cost/alias survives — the owner has to make), just surfaces
// candidates for manual review via the existing "تعديل" edit flow.
function renderDuplicateStockCheck(){
  const panel = document.getElementById('duplicateStockPanel');
  const seen = new Set();
  const pairs = [];
  for(let i=0; i<STOCK_ITEMS.length; i++){
    for(let j=i+1; j<STOCK_ITEMS.length; j++){
      const a = STOCK_ITEMS[i], b = STOCK_ITEMS[j];
      const score = stringSimilarity(a.name, b.name);
      if(score >= SIMILARITY_SUGGEST_THRESHOLD){
        pairs.push({a, b, score});
      }
    }
  }
  pairs.sort((x,y)=> y.score - x.score);
  panel.classList.remove('hidden');
  if(pairs.length === 0){
    panel.innerHTML = '<div class="panel-title">فحص الأصناف المكررة</div><p class="stock-qty-helper">ما لقينا أصناف تشبه بعضها — القائمة نظيفة.</p>';
    return;
  }
  panel.innerHTML = `
    <div class="panel-title">فحص الأصناف المكررة (${pairs.length})</div>
    <p class="stock-qty-helper" style="margin-bottom:10px;">هذي مجرد اقتراحات حسب تشابه الاسم — راجع كل زوج بنفسك قبل ما تدمج أو تعدّل أي صنف، النظام ما يدمجها تلقائيًا.</p>
    ${pairs.map(p=>`
      <div class="cpb-row" style="align-items:center;">
        <span>${p.a.name} (${p.a.qtyOnHand} ${UNIT_LABELS[p.a.unit]}) ⟷ ${p.b.name} (${p.b.qtyOnHand} ${UNIT_LABELS[p.b.unit]})</span>
        <span class="mono">${Math.round(p.score*100)}٪</span>
      </div>`).join('')}
  `;
}

/* ============ Delivery platform monthly reconciliation — real per-order
   commission/fee/compensation math using each platform's own config
   (Settings → منصات التوصيل), not a hypothetical/illustrative comparison
   (that's the separate computeDeliveryProfits() tool). Answers "what should
   platform X actually transfer me for month Y". */
function tieredDeliveryFee(orderTotal, tiers){
  const applicable = tiers.filter(t=>orderTotal >= t.min_order_value).sort((a,b)=>b.min_order_value-a.min_order_value);
  return applicable.length ? applicable[0].fee : 0;
}
// Single source of truth for "what does this one delivery order actually cost
// us on this platform" — used by today's live accounting waterfall, any
// custom-date-range report, AND the monthly reconciliation table below, so
// the three can never quietly disagree. fee_model:'tiered' platforms can
// still carry a flat_fee (e.g. HungerStation: tiered band + flat 2 SAR/order)
// — it's additive, not either/or, matching how these platforms actually bill.
function computeOrderDeliveryPlatformCost(order, platform, tiers){
  const total = Number(order.total), subtotal = Number(order.subtotal);
  const commissionBaseAmount = platform.commission_base === 'subtotal' ? subtotal : total;
  const commission = commissionBaseAmount * (Number(platform.commission_pct)/100);
  const tieredFee = platform.fee_model === 'tiered' ? tieredDeliveryFee(total, tiers||[]) : 0;
  const fee = tieredFee + Number(platform.flat_fee||0);
  const compensation = total * (Number(platform.compensation_pct)/100);
  return { commission, fee, compensation, total: commission + fee + compensation };
}
async function renderDeliveryReconciliation(){
  const monthInput = document.getElementById('deliveryReconMonth');
  if(!monthInput.value){
    const now = new Date();
    monthInput.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  }
  const summaryEl = document.getElementById('deliveryReconSummary');
  summaryEl.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">جاري التحميل...</p>';

  const [year, month] = monthInput.value.split('-').map(Number);
  const monthStart = new Date(year, month-1, 1);
  const monthEnd = new Date(year, month, 1);

  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const [{data: platforms}, {data: tiers}, {data: orders}] = await Promise.all([
    sb.from('delivery_platforms').select('*').eq('business_id', businessId),
    sb.from('delivery_platform_fee_tiers').select('*'),
    sb.from('orders').select('total, subtotal, delivery_platform_id, created_at')
      .eq('business_id', businessId).eq('channel', 'delivery').not('delivery_platform_id', 'is', null)
      .gte('created_at', monthStart.toISOString()).lt('created_at', monthEnd.toISOString())
  ]);

  const tiersByPlatform = {};
  (tiers||[]).forEach(t=>{ (tiersByPlatform[t.delivery_platform_id] ||= []).push(t); });

  const results = (platforms||[]).map(p=>{
    const platformOrders = (orders||[]).filter(o=>o.delivery_platform_id===p.id);
    let grossRevenue = 0, totalCommission = 0, totalFees = 0, totalCompensation = 0;
    platformOrders.forEach(o=>{
      const deduction = computeOrderDeliveryPlatformCost(o, p, tiersByPlatform[p.id]);
      grossRevenue += Number(o.total); totalCommission += deduction.commission; totalFees += deduction.fee; totalCompensation += deduction.compensation;
    });
    const netToRestaurant = grossRevenue - totalCommission - totalFees - totalCompensation;
    return { name:p.name, ordersCount:platformOrders.length, grossRevenue, totalCommission, totalFees, totalCompensation, netToRestaurant };
  }).filter(r=>r.ordersCount > 0);

  if(results.length === 0){
    summaryEl.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600; margin-top:12px;">ما فيه طلبات توصيل مربوطة بمنصة لهذا الشهر.</p>';
    return;
  }

  summaryEl.innerHTML = `
    <table class="report-table" style="margin-top:12px;">
      <thead><tr><th>المنصة</th><th>عدد الطلبات</th><th>إجمالي الطلبات</th><th>عمولة المنصة</th><th>رسوم التوصيل</th><th>تعويضات مفترضة</th><th>صافي المستحق من المنصة</th></tr></thead>
      <tbody>
        ${results.map(r=>`<tr>
          <td>${r.name}</td>
          <td class="mono">${r.ordersCount}</td>
          <td class="mono">${r.grossRevenue.toFixed(2)}</td>
          <td class="mono">${r.totalCommission.toFixed(2)}</td>
          <td class="mono">${r.totalFees.toFixed(2)}</td>
          <td class="mono">${r.totalCompensation.toFixed(2)}</td>
          <td class="mono" style="font-weight:800;">${r.netToRestaurant.toFixed(2)}</td>
        </tr>`).join('')}
        <tr style="font-weight:800; border-top:2px solid var(--line);">
          <td>الإجمالي</td>
          <td class="mono">${results.reduce((s,r)=>s+r.ordersCount,0)}</td>
          <td class="mono">${results.reduce((s,r)=>s+r.grossRevenue,0).toFixed(2)}</td>
          <td class="mono">${results.reduce((s,r)=>s+r.totalCommission,0).toFixed(2)}</td>
          <td class="mono">${results.reduce((s,r)=>s+r.totalFees,0).toFixed(2)}</td>
          <td class="mono">${results.reduce((s,r)=>s+r.totalCompensation,0).toFixed(2)}</td>
          <td class="mono">${results.reduce((s,r)=>s+r.netToRestaurant,0).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    <p class="stock-qty-helper" style="margin-top:10px;">"صافي المستحق من المنصة" هو المبلغ المفروض تحوّله لك المنصة عن طلبات هذا الشهر — بعد خصم عمولتها ورسوم التوصيل وأي تعويضات افترضتها. راجع كشف حساب المنصة الفعلي وقارنه بهذا الرقم.</p>
  `;
}
document.getElementById('deliveryReconMonth').addEventListener('change', renderDeliveryReconciliation);

function wireAccountingScreen(){
  document.getElementById('acctScreenTabs').addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    document.querySelectorAll('#acctScreenTabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('acctTabOverview').style.display = tab==='overview' ? 'block' : 'none';
    document.getElementById('acctTabExpenses').style.display = tab==='expenses' ? 'block' : 'none';
    document.getElementById('acctTabFixedCosts').style.display = tab==='fixedcosts' ? 'block' : 'none';
    document.getElementById('acctTabDelivery').style.display = tab==='delivery' ? 'block' : 'none';
    if(tab==='expenses'){ renderGeneralExpensesList(); }
    if(tab==='fixedcosts'){ renderFixedCostsTab(); }
    if(tab==='delivery'){ renderDeliveryReconciliation(); }
  });

  document.getElementById('openAddExpenseBtn').addEventListener('click', openExpenseModal);
  document.getElementById('expenseModalClose').addEventListener('click', closeExpenseModal);
  document.getElementById('expenseModal').addEventListener('click', (e)=>{ if(e.target.id==='expenseModal') closeExpenseModal(); });
  document.getElementById('expenseSaveBtn').addEventListener('click', saveExpense);
}

// Purchases: extracted out of Accounting into its own top-level screen
// (daily operations — supplier invoices affect stock, not financial
// reporting) — see rakeen-dashboard.css/dashboard-markup.ts screen-purchases.
function wirePurchasesScreen(){
  document.getElementById('purchaseHistoryRangeChips').addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    document.querySelectorAll('#purchaseHistoryRangeChips button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    purchaseHistoryRange = btn.dataset.range;
    renderPurchaseHistory();
  });

  document.querySelectorAll('.acct-collapsible-toggle').forEach(toggle=>{
    toggle.addEventListener('click', ()=>{
      const body = toggle.parentElement.querySelector('.acct-collapsible-body');
      const collapsing = !body.classList.contains('hidden');
      body.classList.toggle('hidden', collapsing);
      toggle.classList.toggle('open', !collapsing);
    });
  });

  document.getElementById('openAddInvoiceBtn2').addEventListener('click', ()=> openInvoiceModal());
  document.getElementById('invoiceModalClose').addEventListener('click', closeInvoiceModal);
  document.getElementById('invoiceModal').addEventListener('click', (e)=>{ if(e.target.id==='invoiceModal') closeInvoiceModal(); });
  document.getElementById('invoiceSaveBtn').addEventListener('click', saveInvoice);
}

function renderMovers(){
  const sorted = [...ALL_SELLERS].sort((a,b)=>b.qty-a.qty);
  const fast = sorted.slice(0,4);
  const slow = sorted.slice(-4).reverse();
  document.getElementById('fastMoversList').innerHTML = fast.map(p=>
    `<div class="mover-row"><div style="flex:1;"><div class="mover-name">${p.name}</div><div class="mover-meta">${p.cat}</div></div><span class="mover-badge fast">${p.qty} قطعة اليوم</span></div>`
  ).join('');
  document.getElementById('slowMoversList').innerHTML = slow.map(p=>
    `<div class="mover-row"><div style="flex:1;"><div class="mover-name">${p.name}</div><div class="mover-meta">${p.cat}</div></div><span class="mover-badge slow">${p.qty} قطعة اليوم</span></div>`
  ).join('');
}

/* ============ Accounting screen ============ */
function renderAcctHeroProfit(){
  const el = document.getElementById('acctHeroProfit');
  if(!el) return;
  const a = ACCOUNTING;
  const positive = a.netProfit >= 0;
  const marginPct = a.revenue > 0 ? Math.round((a.netProfit/a.revenue)*100) : 0;
  el.className = 'acct-hero-profit ' + (positive ? 'pos' : 'neg');
  el.innerHTML = `
    <div class="acct-hero-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${positive
          ? '<path d="M12 16v5"/><path d="M16 14.639V21"/><path d="M20 10.656V21"/><path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"/><path d="M4 18.463V21"/><path d="M8 14.656V21"/>'
          : '<path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>'}
      </svg>
    </div>
    <div class="acct-hero-body">
      <div class="acct-hero-label">صافي الربح اليوم</div>
      <div class="acct-hero-value mono">${a.netProfit.toFixed(2)} ر.س</div>
      <div class="acct-hero-sub">${a.revenue>0 ? `هامش ${marginPct}٪ من إجمالي مبيعات ${a.revenue.toFixed(2)} ر.س` : 'ما فيه مبيعات اليوم بعد'}</div>
    </div>
  `;
}

function renderWaterfall(){
  renderAcctHeroProfit();
  const a = ACCOUNTING;
  const steps = [
    {label:'الإيرادات', explain:'إجمالي المبيعات قبل أي خصم', amount:a.revenue, cls:'pos'},
    {label:'الخصومات', explain:'خصومات مطبّقة على الطلبات', amount:-a.discounts, cls:'neg'},
    {label:'صافي المبيعات', explain:'بعد الخصم — نفس رقم "الربح الحقيقي" بالرئيسية', amount:a.netSales, cls:'pos'},
    {label:'ضريبة القيمة المضافة', explain:'١٥٪ محتسبة من صافي المبيعات', amount:-a.vat, cls:'neg'},
    {label:'تكلفة البضاعة المباعة', explain:'التكلفة الحقيقية لمكونات وتغليف كل ما بيع اليوم', amount:-a.cogs, cls:'neg'},
    {label:'عمولات ورسوم تطبيقات التوصيل', explain:'عمولة كل منصة + رسوم توصيلها لطلبات اليوم عبر تطبيقات التوصيل', amount:-a.deliveryPlatformCost, cls:'neg'},
    {label:'مجمل الربح', explain:'المبيعات بعد خصم تكلفة البضاعة وعمولات التوصيل', amount:a.grossProfit, cls:'pos'},
    {label:'المصاريف التشغيلية', explain:'المصاريف الثابتة الشهرية موزّعة على اليوم + مصاريف اليوم الإضافية', amount:-a.opex, cls:'neg'},
    {label:'صافي الربح', explain:'نفس رقم "الربح الحقيقي" بالضبط — كل شي متطابق', amount:a.netProfit, cls:'final'}
  ];
  // scale reference falls back to opex when there's no revenue yet today (still
  // a real, meaningful state — fixed costs accrue whether or not anything sold)
  const max = Math.max(a.revenue, a.opex, 1);
  document.getElementById('waterfall').innerHTML = steps.map(s=>{
    const pct = Math.min(100, Math.round((Math.abs(s.amount)/max)*100));
    return `<div class="waterfall-row">
      <div class="wf-label-col"><div class="wf-label">${s.label}</div><div class="wf-explain">${s.explain}</div></div>
      <div class="wf-bar-track"><div class="wf-bar-fill ${s.cls}" style="width:${pct}%"></div></div>
      <div class="wf-amount ${s.amount<0?'neg':''} ${s.cls==='final'?'final':''} mono">${s.amount<0?'−':''}${Math.abs(s.amount).toFixed(2)}</div>
    </div>`;
  }).join('');
}

function renderOpexBreakdown(){
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
  const items = [
    {name:'الإيجار', amount: FIXED_COSTS.rent/daysInMonth},
    {name:'رواتب الموظفين', amount: FIXED_COSTS.salaries/daysInMonth},
    {name:'كهرباء وخدمات', amount: FIXED_COSTS.utilities/daysInMonth},
    {name:'مصاريف ثابتة أخرى', amount: FIXED_COSTS.other/daysInMonth},
    {name:'مصاريف اليوم الإضافية', amount: TODAY_GENERAL_EXPENSES_TOTAL}
  ].filter(o=>o.amount>0);
  if(items.length === 0){
    document.getElementById('opexBreakdown').innerHTML = '<div class="orders-empty">لسا ما حددت مصاريفك الثابتة — الإعدادات ← المصاريف الثابتة</div>';
    return;
  }
  document.getElementById('opexBreakdown').innerHTML = items.map(o=>{
    const pct = ACCOUNTING.opex > 0 ? Math.round(o.amount/ACCOUNTING.opex*100) : 0;
    return `<div class="perf-row">
      <div class="perf-top-line"><span>${o.name}</span><span class="mono">${o.amount.toFixed(2)} ر.س — ${pct}٪</span></div>
      <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderVatAndMargin(){
  document.getElementById('vatDue').textContent = ACCOUNTING.vat.toFixed(2) + ' ر.س';
  const marginPct = ACCOUNTING.netSales > 0 ? (ACCOUNTING.netProfit / ACCOUNTING.netSales * 100) : 0;
  const marginEl = document.getElementById('marginValue');
  const marginIconEl = document.querySelector('.acct-stat-icon-margin');
  marginEl.textContent = marginPct.toFixed(1) + '٪';
  marginEl.classList.toggle('neg', marginPct < 0);
  if(marginIconEl) marginIconEl.classList.toggle('neg', marginPct < 0);
  document.getElementById('marginBarFill').style.width = Math.max(0, Math.min(100, Math.round(marginPct*2))) + '%'; // scaled for visibility
}

document.getElementById('acctToggleBtn').addEventListener('click', function(){
  const panel = document.getElementById('acctDetailPanel');
  panel.classList.toggle('hidden');
  this.textContent = panel.classList.contains('hidden') ? 'عرض تفاصيل المحاسب' : 'إخفاء تفاصيل المحاسب';
});

/* ============ Employees screen — real cashiers (staff_members, same rows the
   POS staff-picker uses) with real stats computed from today's real orders
   (orders.staff_member_id). No payroll/attendance/discount/void tracking
   exists in the schema, so those fields (salary, clock-in, discounts, voids)
   from the original demo cards are dropped rather than faked. ============ */
let STAFF_STATS = [];
async function loadStaffStats(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const [{data: staff}, {data: branches}, {data: orders}] = await Promise.all([
    sb.from('staff_members').select('id, branch_id, name, active').eq('business_id', businessId).order('name'),
    sb.from('branches').select('id, name').eq('business_id', businessId),
    sb.from('orders').select('staff_member_id, total, created_at')
      .eq('business_id', businessId).gte('created_at', startOfDay.toISOString()).not('staff_member_id', 'is', null)
  ]);
  const branchNameById = {}; (branches||[]).forEach(b=>{ branchNameById[b.id] = b.name; });
  const statsByStaff = {};
  (orders||[]).forEach(o=>{
    const s = (statsByStaff[o.staff_member_id] ||= {sales:0, orders:0, lastOrderAt:null});
    s.sales += Number(o.total);
    s.orders += 1;
    if(!s.lastOrderAt || o.created_at > s.lastOrderAt) s.lastOrderAt = o.created_at;
  });
  STAFF_STATS = (staff||[]).map(s=>{
    const stat = statsByStaff[s.id] || {sales:0, orders:0, lastOrderAt:null};
    return { id:s.id, name:s.name, active:s.active, branchName: branchNameById[s.branch_id] || '—', ...stat };
  });
}

function renderEmployeeCards(){
  const el = document.getElementById('empCards');
  if(!el) return;
  if(STAFF_STATS.length === 0){
    el.innerHTML = '<p class="stock-qty-helper">ما فيه موظفو كاشير مضافين بعد — أضفهم من الإعدادات ← نقطة البيع.</p>';
    return;
  }
  const COLORS = ['var(--acc-ops)','var(--acc-res)','var(--acc-fin)','var(--acc-team)','var(--acc-ai)'];
  const COLORS_BG = ['var(--acc-ops-bg)','var(--acc-res-bg)','var(--acc-fin-bg)','var(--acc-team-bg)','var(--acc-ai-bg)'];
  const topSalesId = STAFF_STATS.reduce((top,e)=> (e.sales > (top ? top.sales : 0) && e.sales > 0) ? e : top, null)?.id;
  const crownIcon = '<path d="M12 2 15 8.5 21 9.5 16.5 14 17.7 20.5 12 17.3 6.3 20.5 7.5 14 3 9.5 9 8.5z"/>';

  el.innerHTML = STAFF_STATS.map((e,i)=>{
    const color = COLORS[i%5], bg = COLORS_BG[i%5];
    const isTop = e.id === topSalesId;
    return `<div class="emp-card${isTop?' emp-card-top':''}">
      <div class="emp-card-head">
        <div class="emp-avatar" style="background:${bg}; color:${color};">${e.name.charAt(0)}${isTop?`<span class="emp-crown"><svg viewBox="0 0 24 24" fill="currentColor">${crownIcon}</svg></span>`:''}</div>
        <div><div class="emp-name">${e.name}</div><div class="emp-role">${e.branchName}${e.active?'':' — معطّل'}</div></div>
      </div>
      <div class="emp-stats">
        <div><div class="emp-stat-label">مبيعات اليوم</div><div class="emp-stat-value mono">${e.sales.toFixed(2)}</div></div>
        <div><div class="emp-stat-label">عدد الطلبات اليوم</div><div class="emp-stat-value mono">${e.orders}</div></div>
        <div><div class="emp-stat-label">آخر طلب</div><div class="emp-stat-value mono">${e.lastOrderAt ? new Date(e.lastOrderAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) : '—'}</div></div>
      </div>
    </div>`;
  }).join('');
}

function renderAchievements(){
  const panel = document.getElementById('achievementsPanel');
  const row = document.getElementById('achievementsRow');
  if(!panel || !row) return;
  const active = STAFF_STATS.filter(s=>s.orders>0);
  if(active.length === 0){ panel.style.display = 'none'; return; }

  const starIcon = '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.123 2.123 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
  const boltIcon = '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>';

  const topSales = [...active].sort((a,b)=>b.sales-a.sales)[0];
  const topOrders = [...active].sort((a,b)=>b.orders-a.orders)[0];
  const chips = [{ icon: starIcon, text: topSales.name + ' — أعلى مبيعات اليوم (' + topSales.sales.toFixed(2) + ' ر.س)' }];
  if(topOrders.id !== topSales.id){
    chips.push({ icon: boltIcon, text: topOrders.name + ' — أكثر طلبات اليوم (' + topOrders.orders + ')' });
  }
  panel.style.display = '';
  row.innerHTML = chips.map(c=>
    `<div class="achievement-chip"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">${c.icon}</svg><span>${c.text}</span></div>`
  ).join('');
}

/* ============ Customers screen — real, from the customers table (found-or-
   created server-side at POS checkout when a phone number is captured). ============ */
async function loadCustomersReal(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const startToday = new Date(); startToday.setHours(0,0,0,0);

  const [{data: customers}, {data: orders}, {data: business}] = await Promise.all([
    sb.from('customers').select('id, name, phone, created_at, public_token, loyalty_points').eq('business_id', businessId),
    sb.from('orders').select('customer_id, total, created_at').eq('business_id', businessId).not('customer_id', 'is', null),
    sb.from('businesses').select('loyalty_points_divisor').eq('id', businessId).single()
  ]);
  const customerList = customers || [];
  const orderList = orders || [];
  if(business) LOYALTY_RATE = Number(business.loyalty_points_divisor);

  const statsById = {};
  orderList.forEach(o=>{
    const s = (statsById[o.customer_id] ||= {visits:0, spend:0, lastOrderAt:null});
    s.visits += 1;
    s.spend += Number(o.total);
    if(!s.lastOrderAt || o.created_at > s.lastOrderAt) s.lastOrderAt = o.created_at;
  });

  const now = Date.now();
  TOP_CUSTOMERS = customerList
    .map(c=>{
      const s = statsById[c.id];
      if(!s) return null; // no real order tied to this customer yet — don't show a phantom row
      const lastVisitDays = Math.floor((now - new Date(s.lastOrderAt).getTime())/86400000);
      return { id:c.id, name:c.name, phone:c.phone||null, publicToken:c.public_token, points:Number(c.loyalty_points), visits:s.visits, spend:s.spend, lastVisitDays, favorite:'—', vip: s.spend >= LOYALTY_TIERS[1].min, note:null };
    })
    .filter(Boolean)
    .sort((a,b)=>b.spend-a.spend);

  const todaysCustomerIds = new Set();
  orderList.forEach(o=>{ if(o.created_at >= startToday.toISOString()) todaysCustomerIds.add(o.customer_id); });
  let newCount = 0, returningCount = 0;
  todaysCustomerIds.forEach(id=>{
    const c = customerList.find(c=>c.id===id);
    if(c && new Date(c.created_at) >= startToday) newCount++; else returningCount++;
  });
  CUSTOMERS_TODAY = {newCount, returningCount};

  const total = newCount + returningCount;
  CUSTOMER_INSIGHT = total === 0
    ? {what:'ما فيه عملاء مسجّلين اليوم بعد.', why:'يبدأ التسجيل تلقائيًا أول ما يدخل الكاشير رقم جوال العميل عند الدفع بالكاشير.'}
    : {what:'نسبة العملاء العائدين اليوم ' + Math.round(returningCount/total*100) + '٪ من إجمالي الزوار.',
       why: returningCount + ' من أصل ' + total + ' عميل زاروك اليوم سبق وزاروا قبل كذا.'};
}

function renderCustKpis(){
  const total = CUSTOMERS_TODAY.newCount + CUSTOMERS_TODAY.returningCount;
  const returningPct = total > 0 ? (CUSTOMERS_TODAY.returningCount/total*100).toFixed(0) : '0';
  const kpis = [
    {label:'عملاء جدد اليوم', value: CUSTOMERS_TODAY.newCount},
    {label:'عملاء عائدون اليوم', value: CUSTOMERS_TODAY.returningCount},
    {label:'متوسط الإنفاق للطلب', value: TODAY.avgTicket.toFixed(2)+' ر.س'},
    {label:'نسبة العملاء العائدين', value: returningPct+'٪'}
  ];
  document.getElementById('custKpiGrid').innerHTML = kpis.map(k=>
    `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value mono">${k.value}</div></div>`
  ).join('');
}

/* ============ RFM Analysis — every score derives from TOP_CUSTOMERS' real visits/spend/lastVisitDays,
   the same fields already used by the Loyalty program. Segment logic verified against known cases
   before implementation: high-R/F/M customer -> Champions, good-history-but-gone-quiet -> At Risk,
   moderate-across-the-board -> Loyal, low-everything -> Lost. */
function rfmRScore(days){ if(days<=3) return 5; if(days<=7) return 4; if(days<=14) return 3; if(days<=21) return 2; return 1; }
function rfmFScore(visits){ if(visits>=20) return 5; if(visits>=15) return 4; if(visits>=10) return 3; if(visits>=5) return 2; return 1; }
function rfmMScore(spend){ if(spend>=1000) return 5; if(spend>=500) return 4; if(spend>=200) return 3; if(spend>=50) return 2; return 1; }
function rfmSegment(r,f,m){
  if(r>=4 && f>=4 && m>=4) return {key:'champions', label:'Champions'};
  if(r<=2 && f>=3 && m>=3) return {key:'at-risk', label:'At Risk'};
  if(f>=3 && m>=3) return {key:'loyal', label:'Loyal Customers'};
  if(r>=4 && f<=2) return {key:'new', label:'New Customers'};
  if(r>=3 && f<=3) return {key:'potential', label:'Potential Loyalist'};
  return {key:'lost', label:'Lost'};
}
function rfmScoreCustomer(c){
  const r = rfmRScore(c.lastVisitDays), f = rfmFScore(c.visits), m = rfmMScore(c.spend);
  return {r, f, m, segment: rfmSegment(r,f,m)};
}
const RFM_SEGMENT_META = {
  champions:{label:'Champions', desc:'الأفضل — زيارات حديثة ومتكررة وإنفاق عالٍ.'},
  loyal:{label:'Loyal Customers', desc:'ثابتون ويعودون بانتظام.'},
  potential:{label:'Potential Loyalist', desc:'زاروا مؤخرًا، بحاجة لتشجيع أكثر.'},
  new:{label:'New Customers', desc:'زيارات أولى — فرصة لبناء ولاء.'},
  'at-risk':{label:'At Risk', desc:'كانوا جيدين، بدأوا يبتعدون — يستاهلون تواصل.'},
  lost:{label:'Lost', desc:'ما زاروا من فترة طويلة وتفاعلهم قليل.'}
};
function renderRfmSegments(){
  const counts = {champions:0, loyal:0, potential:0, new:0, 'at-risk':0, lost:0};
  TOP_CUSTOMERS.forEach(c=>{ counts[rfmScoreCustomer(c).segment.key]++; });
  document.getElementById('rfmSegmentGrid').innerHTML = Object.entries(RFM_SEGMENT_META).map(([key,meta])=>
    `<button type="button" class="rfm-seg-card ${key}${custSegmentFilter===key?' selected':''}" data-seg="${key}">
      <div class="rfm-seg-count mono">${counts[key]}</div>
      <div class="rfm-seg-name">${meta.label}</div>
      <div class="rfm-seg-desc">${meta.desc}</div>
    </button>`
  ).join('');
  document.querySelectorAll('.rfm-seg-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const seg = btn.dataset.seg;
      custSegmentFilter = custSegmentFilter === seg ? null : seg;
      renderRfmSegments();
      renderCustList();
    });
  });
}

// Filtering by segment (click a Champions/At Risk/... tile above) is what
// actually connects "how many are at risk" to "who, specifically" — before
// this, the segment counts and the customer list below were two disconnected
// numbers with no way to go from one to the other.
let custSegmentFilter = null;
function renderCustList(){
  const el = document.getElementById('custList');
  const filterBar = document.getElementById('custListFilterBar');
  if(TOP_CUSTOMERS.length === 0){
    el.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">ما فيه عملاء مسجّلين بعد — يتسجلون تلقائيًا أول ما يدخل الكاشير رقم جوالهم بالكاشير.</p>';
    if(filterBar) filterBar.innerHTML = '';
    return;
  }
  const rows = custSegmentFilter
    ? TOP_CUSTOMERS.filter(c=>rfmScoreCustomer(c).segment.key===custSegmentFilter)
    : TOP_CUSTOMERS;

  if(filterBar){
    filterBar.innerHTML = custSegmentFilter
      ? `<span>عرض: <b>${RFM_SEGMENT_META[custSegmentFilter].label}</b> (${rows.length})</span><button type="button" id="custClearSegFilter">مسح الفلتر ✕</button>`
      : '';
    const clearBtn = document.getElementById('custClearSegFilter');
    if(clearBtn) clearBtn.addEventListener('click', ()=>{ custSegmentFilter = null; renderRfmSegments(); renderCustList(); });
  }

  if(rows.length === 0){
    el.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">ما فيه عملاء بهذا التصنيف حاليًا.</p>';
    return;
  }
  const COLORS = ['var(--acc-ops)','var(--acc-res)','var(--acc-fin)','var(--acc-team)','var(--acc-ai)'];
  const COLORS_BG = ['var(--acc-ops-bg)','var(--acc-res-bg)','var(--acc-fin-bg)','var(--acc-team-bg)','var(--acc-ai-bg)'];
  const phoneIcon = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>';
  el.innerHTML = rows.map((c,i)=>{
    const rfm = rfmScoreCustomer(c);
    return `<div class="cust-row">
      <div class="cust-avatar" style="background:${COLORS_BG[i%5]}; color:${COLORS[i%5]};">${escapeHtml(c.name.charAt(0))}</div>
      <div class="cust-info">
        <div class="cust-name">${escapeHtml(c.name)}${c.vip?'<span class="cust-vip-badge">VIP</span>':''}${c.note?'<span class="cust-note-badge">يحتاج متابعة</span>':''}<span class="cust-rfm-tag ${rfm.segment.key}">${escapeHtml(rfm.segment.label)}</span></div>
        <div class="cust-meta">${c.visits} زيارة — آخر زيارة قبل ${c.lastVisitDays} يوم${c.favorite!=='—'?' — يفضّل: '+escapeHtml(c.favorite):''}${c.note?' — '+escapeHtml(c.note):''}</div>
      </div>
      <div class="cust-end">
        <div class="cust-spend mono">${c.spend.toFixed(2)} ر.س</div>
        ${c.phone ? `<a class="cust-call-btn" href="tel:${escapeHtml(c.phone)}" title="اتصال" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${phoneIcon}</svg></a>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderCustInsight(){
  document.getElementById('custInsightCard').innerHTML =
    `<div class="decision-card"><div class="decision-what">${CUSTOMER_INSIGHT.what}</div><div class="decision-why">${CUSTOMER_INSIGHT.why}</div></div>`;
}

/* ============ Loyalty Program — every number derives from TOP_CUSTOMERS / TODAY / CUSTOMERS_TODAY,
   the same single source of truth used by the Customers and Home screens. The points-per-riyal
   rate is genuinely editable and recomputes every displayed point live (no separate stored values). */
let LOYALTY_RATE = 10; // 1 point per this many SAR — persisted on businesses.loyalty_points_divisor
const LOYALTY_TIERS = [
  {name:'Bronze', min:0, max:999, discount:5},
  {name:'Silver', min:1000, max:4999, discount:10},
  {name:'Gold', min:5000, max:9999, discount:15},
  {name:'Platinum', min:10000, max:Infinity, discount:20}
];
function loyaltyTier(spend){
  return LOYALTY_TIERS.find(t=> spend >= t.min && spend <= t.max) || LOYALTY_TIERS[0];
}
// real — 0 until the POS actually has a redemption flow (it doesn't yet: no
// "redeem points" action exists anywhere in the checkout UI)
const LOYALTY_REDEEMED_TODAY = 0;

function renderLoyaltyKpis(){
  const pointsIssuedToday = Math.round(TODAY.netSales / LOYALTY_RATE);
  const activeMembersToday = CUSTOMERS_TODAY.newCount + CUSTOMERS_TODAY.returningCount;
  const avgPoints = TOP_CUSTOMERS.length > 0
    ? Math.round(TOP_CUSTOMERS.reduce((s,c)=>s+c.points,0) / TOP_CUSTOMERS.length)
    : 0;
  const kpis = [
    {label:'نقاط مصدرة اليوم', value: pointsIssuedToday},
    {label:'نقاط مستردة اليوم', value: LOYALTY_REDEEMED_TODAY},
    {label:'أعضاء تفاعلوا اليوم', value: activeMembersToday},
    {label:'متوسط نقاط العميل', value: avgPoints}
  ];
  document.getElementById('loyaltyKpiGrid').innerHTML = kpis.map(k=>
    `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value mono">${k.value}</div></div>`
  ).join('');
  document.getElementById('loyaltyRateDisplay').textContent = LOYALTY_RATE;
}

function renderLoyaltyCards(){
  if(TOP_CUSTOMERS.length === 0){
    document.getElementById('loyaltyCardsGrid').innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">ما فيه أعضاء بعد.</p>';
    return;
  }
  document.getElementById('loyaltyCardsGrid').innerHTML = TOP_CUSTOMERS.map(c=>{
    const tier = loyaltyTier(c.spend);
    const cardUrl = location.origin + '/loyalty-card/' + c.publicToken;
    return `<div class="loyalty-card tier-${tier.name.toLowerCase()}">
      <div class="lc-top"><span class="lc-tier-label">${tier.name}</span><span class="lc-tier-label">خصم ${tier.discount}٪</span></div>
      <div class="lc-name">${c.name}</div>
      <div class="lc-points">${Math.round(c.points)}</div>
      <div class="lc-points-label">نقطة</div>
      <div class="lc-bottom">
        <div class="lc-qr"><img src="/api/qr?data=${encodeURIComponent(cardUrl)}" alt="" width="52" height="52" loading="lazy"></div>
        <button class="lc-card-link-btn" data-token="${c.publicToken}">فتح البطاقة الرقمية</button>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.lc-card-link-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> window.open('/loyalty-card/' + btn.dataset.token, '_blank'));
  });
}

function renderLoyaltyTiers(){
  document.getElementById('loyaltyTiersTable').innerHTML = `<div class="loyalty-tiers-grid">` + LOYALTY_TIERS.map(t=>
    `<div class="loyalty-tier-card ${t.name.toLowerCase()}">
      <div class="ltc-name">${t.name}</div>
      <div class="ltc-range">${t.max===Infinity ? t.min.toLocaleString()+'+ ر.س' : t.min.toLocaleString()+' – '+t.max.toLocaleString()+' ر.س'}</div>
      <div class="ltc-discount">${t.discount}٪</div>
      <div class="ltc-discount-label">خصم دائم</div>
    </div>`
  ).join('') + `</div>`;
}

/* ============ Loyalty card branding — real logo/banner/accent color/icon/
   system type, stored on businesses + uploaded to Supabase Storage
   (loyalty-branding bucket, public read). The preview below mirrors the real
   customer-facing card (app/loyalty-card/[token]/page.tsx + icons.ts) pixel
   for pixel — kept manually in sync since they're different runtimes
   (server-rendered React vs this classic script), not shared code. */
const LOYALTY_ICON_PATHS_JS = {
  generic: '<polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9 9 9"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="5"/><line x1="10" y1="2" x2="10" y2="5"/><line x1="14" y1="2" x2="14" y2="5"/>',
  burger: '<path d="M4 8c0-3 3.5-5 8-5s8 2 8 5"/><rect x="3" y="10" width="18" height="3" rx="1.5"/><line x1="4" y1="16" x2="20" y2="16"/><path d="M3 19c0 1.5 1 2 2 2h14c1 0 2-.5 2-2"/>',
  pizza: '<path d="M12 2 22 20 2 20Z"/><circle cx="9" cy="14" r="1"/><circle cx="14" cy="16" r="1"/><circle cx="12" cy="9.5" r="1"/>',
  pastry: '<path d="M3 15c2-6 6-10 9-10s7 4 9 10c-3-2-6-3-9-3s-6 1-9 3z"/><path d="M6.5 12.5c1-2 3-3.5 5.5-3.5s4.5 1.5 5.5 3.5"/>',
  dessert: '<path d="M12 2a5 5 0 0 1 5 5c0 1-.3 2-1 3H8c-.7-1-1-2-1-3a5 5 0 0 1 5-5z"/><path d="M8 10l4 12 4-12"/>',
  car: '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5"/><path d="M3 13v4a1 1 0 0 0 1 1h1"/><path d="M21 13v4a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><line x1="9" y1="18" x2="15" y2="18"/>',
  pet: '<circle cx="12" cy="15.2" r="3.2"/><circle cx="6" cy="10" r="1.6"/><circle cx="18" cy="10" r="1.6"/><circle cx="9" cy="6.3" r="1.6"/><circle cx="15" cy="6.3" r="1.6"/>',
  salon: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  gym: '<line x1="7" y1="12" x2="17" y2="12"/><rect x="2" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/><rect x="6" y="10.3" width="2" height="3.4"/><rect x="16" y="10.3" width="2" height="3.4"/>',
  retail: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  padel: '<path d="M12 2c-3 0-5.2 2.2-5.2 5.5 0 4 2.2 6.8 5.2 6.8s5.2-2.8 5.2-6.8C17.2 4.2 15 2 12 2z"/><line x1="12" y1="14.3" x2="12" y2="22"/><circle cx="9.6" cy="6.8" r="0.6"/><circle cx="14.4" cy="6.8" r="0.6"/><circle cx="12" cy="9.5" r="0.6"/>',
  sports: '<path d="M8 3h8v4a4 4 0 0 1-8 0V3z"/><path d="M8 4.2H5.2A2.8 2.8 0 0 0 8 8.5"/><path d="M16 4.2h2.8A2.8 2.8 0 0 1 16 8.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><path d="M8.5 21h7l-1-4.5h-5L8.5 21z"/>',
  spa: '<path d="M12 2.5c3.2 3.2 5.2 6.4 5.2 9.6a5.2 5.2 0 0 1-10.4 0c0-3.2 2-6.4 5.2-9.6z"/>',
  clinic: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M11.2 8h1.6v3.2H16v1.6h-3.2V16h-1.6v-3.2H8v-1.6h3.2V8z"/>'
};
const LOYALTY_ICON_LABELS_JS = {generic:'نجمة', coffee:'قهوة', burger:'برجر', pizza:'بيتزا', pastry:'معجنات', dessert:'حلا', car:'غسيل سيارات', pet:'حيوانات أليفة', salon:'صالون/حلاقة', gym:'نادي رياضي', retail:'متجر', padel:'بادل', sports:'رياضة ونوادي', spa:'مساج وسبا', clinic:'عيادات ومستشفيات', custom:'أيقونتك'};
const LOYALTY_PATTERN_LABELS_JS = {none:'بدون', dots:'نقاط', diagonal:'خطوط مائلة', waves:'أمواج', grid:'شبكة', chevron:'أسهم', rings:'حلقات', icons:'أيقونات مصغّرة'};
// The card's middle band is always a light cream backdrop — a light/bright
// accent (lots of restaurant brand colors are, e.g. lime green) stays
// invisible on it no matter the opacity. Patterns draw with a
// lightness-capped version of the accent instead of the raw color, so
// contrast holds regardless of how light the chosen accent is. Exact mirror
// of patternDrawColor() in app/loyalty-card/[token]/page.tsx.
function patternDrawColor(hex){
  const c = (hex||'#C4FF2B').replace('#','');
  let r = (parseInt(c.substring(0,2),16)||0)/255, g = (parseInt(c.substring(2,4),16)||0)/255, b = (parseInt(c.substring(4,6),16)||0)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0;
  const l = (max+min)/2;
  const d = max-min;
  const s = d===0 ? 0 : (l>0.5 ? d/(2-max-min) : d/(max+min));
  if(d!==0){
    if(max===r) h = ((g-b)/d + (g<b?6:0))/6;
    else if(max===g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  const targetL = Math.min(l, 0.38);
  const hue2rgb = (p,q,t) => { if(t<0)t+=1; if(t>1)t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
  if(s===0){ r=g=b=targetL; }
  else {
    const q = targetL<0.5 ? targetL*(1+s) : targetL+s-targetL*s;
    const p = 2*targetL-q;
    r = hue2rgb(p,q,h+1/3); g = hue2rgb(p,q,h); b = hue2rgb(p,q,h-1/3);
  }
  const toHex = v => Math.round(v*255).toString(16).padStart(2,'0');
  return '#'+toHex(r)+toHex(g)+toHex(b);
}
// Bold version — used ONLY for the small picker swatches (38px buttons), so
// the pattern actually reads at a glance. The real card never uses these
// values; see loyaltyPatternCardCss() below for the subtle, true-to-card tint.
function loyaltyPatternCss(pattern, accent, iconPath){
  const draw = patternDrawColor(accent);
  if(pattern === 'dots') return `background-image:radial-gradient(${draw}70 1.6px, transparent 1.8px); background-size:10px 10px;`;
  if(pattern === 'diagonal') return `background-image:repeating-linear-gradient(45deg, ${draw}70, ${draw}70 2px, transparent 2px, transparent 7px);`;
  if(pattern === 'waves'){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='70' height='22' viewBox='0 0 70 22'><path d='M0 11 Q8.75 2 17.5 11 T35 11 T52.5 11 T70 11' fill='none' stroke='${draw}' stroke-width='2' opacity='0.7'/></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:70px 22px;`;
  }
  if(pattern === 'grid') return `background-image:repeating-linear-gradient(0deg, ${draw}50 0, ${draw}50 1px, transparent 1px, transparent 15px), repeating-linear-gradient(90deg, ${draw}50 0, ${draw}50 1px, transparent 1px, transparent 15px);`;
  if(pattern === 'chevron'){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='17' viewBox='0 0 30 17'><path d='M0 2 L15 15 L30 2' fill='none' stroke='${draw}' stroke-width='2' opacity='0.55'/></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:30px 17px;`;
  }
  if(pattern === 'rings'){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><circle cx='13' cy='13' r='4' fill='none' stroke='${draw}' stroke-width='1.8' opacity='0.7'/><circle cx='13' cy='13' r='9' fill='none' stroke='${draw}' stroke-width='1.8' opacity='0.45'/></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:26px 26px;`;
  }
  if(pattern === 'icons'){
    const path = iconPath || LOYALTY_ICON_PATHS_JS.generic;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50' viewBox='0 0 24 24'><g transform='translate(3,3) scale(0.75)' fill='none' stroke='${draw}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' opacity='0.5'>${path}</g></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:50px 50px;`;
  }
  return '';
}
// Exact mirror of app/loyalty-card/[token]/page.tsx's patternBackground() —
// this is what the middle band of the LIVE PREVIEW uses, so "بالضبط اللي
// يشوفه عميلك" (exactly what your customer sees) is actually true, not just
// close. Kept manually in sync (same reason as everywhere else in this file:
// no shared build step between this classic script and the React card page).
function loyaltyPatternCardCss(pattern, accent, iconPath){
  const draw = patternDrawColor(accent);
  if(pattern === 'dots') return `background-image:radial-gradient(${draw}45 1.6px, transparent 1.8px); background-size:18px 18px;`;
  if(pattern === 'diagonal') return `background-image:repeating-linear-gradient(45deg, ${draw}38, ${draw}38 1.5px, transparent 1.5px, transparent 16px);`;
  if(pattern === 'waves'){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='46' viewBox='0 0 150 46'><path d='M0 23 Q18.75 6 37.5 23 T75 23 T112.5 23 T150 23' fill='none' stroke='${draw}' stroke-width='1.5' opacity='0.4'/></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:150px 46px;`;
  }
  if(pattern === 'grid') return `background-image:repeating-linear-gradient(0deg, ${draw}38 0, ${draw}38 1px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, ${draw}38 0, ${draw}38 1px, transparent 1px, transparent 18px);`;
  if(pattern === 'chevron'){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='19' viewBox='0 0 34 19'><path d='M0 2 L17 16 L34 2' fill='none' stroke='${draw}' stroke-width='1.5' opacity='0.38'/></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:34px 19px;`;
  }
  if(pattern === 'rings'){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><circle cx='30' cy='30' r='9' fill='none' stroke='${draw}' stroke-width='1.4' opacity='0.4'/><circle cx='30' cy='30' r='19' fill='none' stroke='${draw}' stroke-width='1.4' opacity='0.25'/></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:60px 60px;`;
  }
  if(pattern === 'icons'){
    const path = iconPath || LOYALTY_ICON_PATHS_JS.generic;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='54' height='54' viewBox='0 0 24 24'><g transform='translate(3.5,3.5) scale(0.7)' fill='none' stroke='${draw}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' opacity='0.32'>${path}</g></svg>`;
    return `background-image:url('data:image/svg+xml,${encodeURIComponent(svg)}'); background-size:54px 54px;`;
  }
  return '';
}
function loyaltyContrastText(hex){
  const c = (hex||'#C4FF2B').replace('#','');
  const r = parseInt(c.substring(0,2),16)||0, g = parseInt(c.substring(2,4),16)||0, b = parseInt(c.substring(4,6),16)||0;
  return (0.299*r+0.587*g+0.114*b)/255 > 0.6 ? '#171717' : '#FAFAF5';
}

let LOYALTY_BRANDING = {
  logoUrl: null, bannerUrl: null, accentColor: '#C4FF2B',
  systemType: 'points', visitsThreshold: 5, rewardLabel: 'مشروب مجاني', iconStyle: 'generic', patternStyle: 'none',
  theme: 'classic', customIconUrl: null
};
// custom-icon upload mirrors the banner-clear flag above: set the moment a
// new file is chosen so the preview switches immediately, without waiting
// for save
let LOYALTY_CUSTOM_ICON_FILE_URL = null;
let loyaltyPreviewQrDataUrl = null;
// set the moment a pattern swatch is clicked so the preview drops the saved
// banner immediately (patterns and a banner are mutually exclusive on the
// card) instead of the pattern silently having no visible effect until save
let LOYALTY_BANNER_CLEARED = false;

/* Suggests accent colors sampled straight from the owner's uploaded logo —
   canvas pixel histogram, not a real color-science library (no dependency
   needed for "a few tasteful swatches that look like the logo"). Filters out
   near-white/near-black/near-gray pixels so the suggestions are actually
   colorful, then returns up to 5 hex codes by frequency. */
function extractLogoColors(imgSrc){
  return new Promise((resolve)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const counts = {};
        for(let i=0; i<data.length; i+=4){
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if(a < 128) continue;
          const max = Math.max(r,g,b), min = Math.min(r,g,b);
          const lightness = (max+min)/2/255;
          const sat = max===min ? 0 : (max-min)/(255-Math.abs(max+min-255));
          if(lightness > 0.9 || lightness < 0.08 || sat < 0.15) continue;
          const qr = Math.round(r/20)*20, qg = Math.round(g/20)*20, qb = Math.round(b/20)*20;
          const key = qr+','+qg+','+qb;
          counts[key] = (counts[key]||0) + 1;
        }
        const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
        resolve(sorted.map(([key])=>{
          const [r,g,b] = key.split(',').map(Number);
          return '#' + [r,g,b].map(v=>Math.min(255,v).toString(16).padStart(2,'0')).join('');
        }));
      } catch { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = imgSrc;
  });
}

async function renderLoyaltySuggestedColors(imgSrc){
  const row = document.getElementById('loyaltySuggestedColorsRow');
  const el = document.getElementById('loyaltySuggestedColors');
  if(!row || !el) return;
  if(!imgSrc){ row.classList.add('hidden'); el.innerHTML = ''; return; }
  const colors = await extractLogoColors(imgSrc);
  if(!colors.length){ row.classList.add('hidden'); el.innerHTML = ''; return; }
  row.classList.remove('hidden');
  const current = document.getElementById('loyaltyAccentInput').value;
  el.innerHTML = colors.map(hex =>
    `<button type="button" class="loyalty-color-swatch${hex.toLowerCase()===current.toLowerCase()?' active':''}" data-color="${hex}" title="${hex}" style="background:${hex};"></button>`
  ).join('');
  el.querySelectorAll('.loyalty-color-swatch').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.getElementById('loyaltyAccentInput').value = btn.dataset.color;
      el.querySelectorAll('.loyalty-color-swatch').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderLoyaltyPatternPicker();
      renderLoyaltyCardPreview();
    });
  });
}

async function loadLoyaltyBranding(){
  const { data } = await window.supabaseClient.from('businesses')
    .select('loyalty_logo_url, loyalty_banner_url, loyalty_accent_color, loyalty_system_type, loyalty_visits_threshold, loyalty_reward_label, loyalty_icon_style, loyalty_pattern_style, loyalty_theme, loyalty_custom_icon_url, loyalty_enabled')
    .eq('id', CURRENT_PROFILE.business_id).single();
  if(data){
    LOYALTY_BRANDING = {
      logoUrl: data.loyalty_logo_url, bannerUrl: data.loyalty_banner_url, accentColor: data.loyalty_accent_color || '#C4FF2B',
      systemType: data.loyalty_system_type || 'points', visitsThreshold: data.loyalty_visits_threshold || 5,
      rewardLabel: data.loyalty_reward_label || 'مشروب مجاني', iconStyle: data.loyalty_icon_style || 'generic',
      patternStyle: data.loyalty_pattern_style || 'none', theme: data.loyalty_theme || 'classic',
      customIconUrl: data.loyalty_custom_icon_url || null
    };
    renderLoyaltyEnabledState(data.loyalty_enabled !== false);
  }
}

function renderLoyaltyEnabledState(enabled){
  const toggle = document.getElementById('loyaltyEnabledToggle');
  if(toggle) toggle.checked = enabled;
  const wrapper = document.getElementById('loyaltyContentWrapper');
  const notice = document.getElementById('loyaltyDisabledNotice');
  if(wrapper) wrapper.classList.toggle('hidden', !enabled);
  if(notice) notice.classList.toggle('hidden', enabled);
}

// The Loyalty screen used to be one long stack (نظرة عامة → بطاقات →
// مستويات → إعداد البرنامج → التصميم → التواصل) — a real scroll-fatigue
// problem on a phone. All the render*()/wire*() calls that fill each
// panel's content already run once when the screen loads (unchanged
// here); this only ever toggles which panel is visible — no re-fetching,
// no re-rendering, just show/hide, so switching tabs is instant.
document.getElementById('loyaltyTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.loyalty-tab'); if(!btn) return;
  const target = btn.dataset.loyaltyTab;
  document.querySelectorAll('#loyaltyTabs .loyalty-tab').forEach(b=> b.classList.toggle('active', b===btn));
  document.querySelectorAll('.loyalty-tab-panel').forEach(p=> p.classList.toggle('active', p.dataset.loyaltyPanel === target));
});

document.getElementById('loyaltyEnabledToggle').addEventListener('change', async (e)=>{
  const enabled = e.target.checked;
  renderLoyaltyEnabledState(enabled);
  const { error } = await window.supabaseClient.from('businesses').update({ loyalty_enabled: enabled }).eq('id', CURRENT_PROFILE.business_id);
  if(error){
    showToast('تعذر الحفظ: ' + error.message);
    renderLoyaltyEnabledState(!enabled);
    return;
  }
  logDashboardAudit(enabled ? 'فعّل نظام الولاء' : 'عطّل نظام الولاء');
  showToast(enabled ? 'تم تفعيل نظام الولاء' : 'تم تعطيل نظام الولاء — اختفى من شاشة الكاشير');
});

async function loadWinBackSettings(){
  const { data } = await window.supabaseClient.from('businesses')
    .select('notify_win_back, win_back_inactive_days, win_back_message')
    .eq('id', CURRENT_PROFILE.business_id).single();
  if(!data) return;
  const toggle = document.getElementById('winBackToggle');
  const days = document.getElementById('winBackDaysInput');
  const msg = document.getElementById('winBackMessageInput');
  if(toggle) toggle.checked = !!data.notify_win_back;
  if(days) days.value = data.win_back_inactive_days || 30;
  if(msg) msg.value = data.win_back_message || 'مشتقنالك! زورنا قريب — عندنا شي يسعدك 🎁';
}

document.getElementById('winBackSaveBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('winBackSaveBtn');
  btn.disabled = true;
  try {
    const updates = {
      notify_win_back: document.getElementById('winBackToggle').checked,
      win_back_inactive_days: Math.max(1, parseInt(document.getElementById('winBackDaysInput').value, 10) || 30),
      win_back_message: document.getElementById('winBackMessageInput').value.trim() || 'مشتقنالك! زورنا قريب — عندنا شي يسعدك 🎁'
    };
    const { error } = await window.supabaseClient.from('businesses').update(updates).eq('id', CURRENT_PROFILE.business_id);
    if(error) throw error;
    logDashboardAudit('حدّث إعدادات استرجاع العملاء الخاملين');
    showToast('تم حفظ إعدادات الاسترجاع');
  } catch(err){
    showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    btn.disabled = false;
  }
});

function renderLoyaltyIconPicker(){
  const el = document.getElementById('loyaltyIconPicker');
  if(!el) return;
  const isCustom = LOYALTY_BRANDING.iconStyle === 'custom';
  el.innerHTML = Object.keys(LOYALTY_ICON_PATHS_JS).map(key=>
    `<button type="button" class="loyalty-icon-choice${key===LOYALTY_BRANDING.iconStyle?' active':''}" data-icon="${key}" title="${LOYALTY_ICON_LABELS_JS[key]}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LOYALTY_ICON_PATHS_JS[key]}</svg>
    </button>`
  ).join('') + `<button type="button" class="loyalty-icon-choice${isCustom?' active':''}" data-icon="custom" title="ارفع أيقونتك الخاصة">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`;
  document.getElementById('loyaltyCustomIconRow').classList.toggle('hidden', !isCustom);
  el.querySelectorAll('.loyalty-icon-choice').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      el.querySelectorAll('.loyalty-icon-choice').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('loyaltyCustomIconRow').classList.toggle('hidden', btn.dataset.icon !== 'custom');
      renderLoyaltyPatternPicker();
      renderLoyaltyCardPreview();
    });
  });
}
document.getElementById('loyaltyCustomIconInput').addEventListener('change', ()=>{
  const file = document.getElementById('loyaltyCustomIconInput').files[0];
  LOYALTY_CUSTOM_ICON_FILE_URL = file ? URL.createObjectURL(file) : null;
  renderLoyaltyCardPreview();
});

function renderLoyaltyPatternPicker(){
  const el = document.getElementById('loyaltyPatternPicker');
  if(!el) return;
  const accent = document.getElementById('loyaltyAccentInput').value || '#C4FF2B';
  const iconChoice = document.querySelector('.loyalty-icon-choice[data-icon].active');
  const iconPath = LOYALTY_ICON_PATHS_JS[iconChoice ? iconChoice.dataset.icon : LOYALTY_BRANDING.iconStyle] || LOYALTY_ICON_PATHS_JS.generic;
  el.innerHTML = Object.keys(LOYALTY_PATTERN_LABELS_JS).map(key=>
    `<button type="button" class="loyalty-icon-choice loyalty-pattern-swatch${key===LOYALTY_BRANDING.patternStyle?' active':''}" data-pattern="${key}" title="${LOYALTY_PATTERN_LABELS_JS[key]}" style="${loyaltyPatternCss(key, accent, iconPath)}"></button>`
  ).join('');
  el.querySelectorAll('.loyalty-pattern-swatch').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      el.querySelectorAll('.loyalty-pattern-swatch').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      // a pattern and an uploaded banner are mutually exclusive on the card —
      // picking a pattern must visually drop the old banner right away, not
      // just at save time, otherwise it looks like the click did nothing
      LOYALTY_BANNER_CLEARED = true;
      renderLoyaltyCardPreview();
    });
  });
}

function loyaltySystemTypeFormValue(){
  const active = document.querySelector('#loyaltySystemTypeChips button.active');
  return active ? active.dataset.type : 'points';
}

async function renderLoyaltyCardPreview(){
  const el = document.getElementById('loyaltyCardPreview');
  if(!el) return;
  const isVisits = loyaltySystemTypeFormValue() === 'visits';
  const theme = loyaltyThemeFormValue();
  const accent = document.getElementById('loyaltyAccentInput').value || '#C4FF2B';
  const onAccent = loyaltyContrastText(accent);
  const threshold = Math.max(2, parseInt(document.getElementById('loyaltyVisitsThresholdInput').value,10) || 5);
  const rewardLabel = document.getElementById('loyaltyRewardLabelInput').value.trim() || 'مكافأة مجانية';
  const iconChoice = document.querySelector('.loyalty-icon-choice[data-icon].active');
  const iconKey = iconChoice ? iconChoice.dataset.icon : 'generic';
  const iconPath = LOYALTY_ICON_PATHS_JS[iconKey] || LOYALTY_ICON_PATHS_JS.generic;
  const customIconUrl = iconKey === 'custom' ? (LOYALTY_CUSTOM_ICON_FILE_URL || LOYALTY_BRANDING.customIconUrl) : null;
  const patternChoice = document.querySelector('.loyalty-pattern-swatch.active');
  const patternKey = patternChoice ? patternChoice.dataset.pattern : 'none';
  // re-tint swatches to the current color without rebuilding them (a rebuild
  // would reset "active" back to the saved value, losing an unsaved click)
  document.querySelectorAll('.loyalty-pattern-swatch').forEach(btn=>{
    btn.setAttribute('style', loyaltyPatternCss(btn.dataset.pattern, accent, customIconUrl ? '' : iconPath));
  });
  const businessName = RESTAURANT_INFO.name || '؟';

  const logoFile = document.getElementById('loyaltyLogoInput').files[0];
  const bannerFile = document.getElementById('loyaltyBannerInput').files[0];
  const logoUrl = logoFile ? URL.createObjectURL(logoFile) : LOYALTY_BRANDING.logoUrl;
  const bannerUrl = bannerFile ? URL.createObjectURL(bannerFile) : (LOYALTY_BANNER_CLEARED ? null : LOYALTY_BRANDING.bannerUrl);

  if(!loyaltyPreviewQrDataUrl){
    try {
      const res = await fetch('/api/qr?data=' + encodeURIComponent('معاينة'));
      loyaltyPreviewQrDataUrl = await res.text();
    } catch { loyaltyPreviewQrDataUrl = ''; }
  }

  function stampGlyph(filled, size){
    if(customIconUrl) return `<img src="${customIconUrl}" style="width:${size}px; height:${size}px; object-fit:contain; opacity:${filled?1:0.32}; filter:${filled?'none':'grayscale(70%)'};">`;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${filled?accent:'none'}" stroke="${filled?accent:'#c9c4ba'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`;
  }

  const logoHtml = (onAccentColor, bg) => logoUrl
    ? `<img src="${logoUrl}" class="loyalty-preview-logo">`
    : `<div class="loyalty-preview-logo-fallback" style="background:${bg}; color:${onAccentColor};">${businessName.trim().charAt(0)}</div>`;

  const middleBg = bannerUrl
    ? `background-image:linear-gradient(rgba(247,244,239,.8),rgba(247,244,239,.8)), url('${bannerUrl}'); background-size:cover; background-position:center;`
    : loyaltyPatternCardCss(patternKey, accent, customIconUrl ? '' : iconPath);

  const stampRowHtml = `<div class="loyalty-preview-stamp-row">${Array.from({length: threshold}).map((_,i)=> stampGlyph(i < Math.min(2, threshold-1), 24)).join('')}</div>`;
  const pointsBlockHtml = `
    <div class="loyalty-preview-points-block">
      <div class="loyalty-preview-points-halo" style="background:radial-gradient(circle, ${accent}33, transparent 70%);"></div>
      <svg class="loyalty-preview-points-sparkle" viewBox="0 0 24 24" width="18" height="18" fill="${accent}"><path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z"/></svg>
      <div class="loyalty-preview-points-label">رصيد النقاط</div>
      <div class="loyalty-preview-points-value" style="color:${accent};">240</div>
    </div>`;
  const middleHtml = isVisits ? stampRowHtml : pointsBlockHtml;

  const statsHtml = isVisits ? `
    <div class="loyalty-preview-stat"><span class="loyalty-preview-stat-label">متبقي لـ${rewardLabel}</span><span class="loyalty-preview-stat-value">${Math.max(0,threshold-2)}</span></div>
    <div class="loyalty-preview-stat"><span class="loyalty-preview-stat-label">هدايا جاهزة</span><span class="loyalty-preview-stat-value">1</span></div>
  ` : '';
  const savedBadgeHtml = (bg, color) => `<div class="loyalty-preview-saved-badge" style="background:${bg}; color:${color};"><span>💰</span><span>وفرت معنا 500 ر.س</span></div>`;
  const tenureHtml = (color) => `<div class="loyalty-preview-tenure" style="color:${color};">معنا من سنة</div>`;

  let cardHtml;
  if(theme === 'minimal'){
    cardHtml = `
    <div class="loyalty-preview-card loyalty-preview-minimal">
      <div class="loyalty-preview-minimal-bar" style="background:${accent};"></div>
      <div class="loyalty-preview-minimal-header">
        ${logoHtml(accent, '#F2F0EA')}
        <div style="flex:1; min-width:0;">
          <div class="loyalty-preview-brand" style="color:#171717;">${businessName}</div>
          <div style="font-size:10.5px; font-weight:800; color:${accent}; margin-top:2px;">🥇 Gold</div>
        </div>
      </div>
      <div style="padding:14px 18px 0;">
        <div class="loyalty-preview-customer-name" style="color:#171717; font-size:19px;">عميل تجريبي</div>
        ${tenureHtml('#8a8477')}
      </div>
      <div class="loyalty-preview-middle" style="${middleBg}">${middleHtml}</div>
      ${savedBadgeHtml(`${accent}18`, '#171717')}
      ${statsHtml ? `<div class="loyalty-preview-stats-row" style="color:#171717; padding:0 18px;">${statsHtml}</div>` : ''}
      <div class="loyalty-preview-footer" style="background:transparent; padding-top:0;">
        <div class="loyalty-preview-qr" style="box-shadow:0 4px 14px rgba(0,0,0,0.07);">${loyaltyPreviewQrDataUrl || ''}</div>
        <div class="loyalty-preview-powered" style="color:#c9c4ba;">مدعوم من ركين</div>
      </div>
    </div>`;
  } else if(theme === 'bold'){
    cardHtml = `
    <div class="loyalty-preview-card loyalty-preview-bold" style="background:${accent};">
      <div class="loyalty-preview-header-top" style="padding:16px 16px 0;">
        ${logoHtml(accent, onAccent)}
        <div class="loyalty-preview-brand" style="color:${onAccent};">${businessName}</div>
        <div class="loyalty-preview-tier-chip" style="background:${onAccent}26; color:${onAccent};">🥇 Gold</div>
      </div>
      <div class="loyalty-preview-customer-name" style="color:${onAccent}; text-align:center;">عميل تجريبي</div>
      ${tenureHtml(`${onAccent}b3`).replace('style="', 'style="text-align:center; ')}
      <div class="loyalty-preview-bold-card">
        <div class="loyalty-preview-middle" style="${middleBg}; min-height:auto; padding:12px;">${middleHtml}</div>
        ${savedBadgeHtml(`${accent}14`, '#171717')}
        ${statsHtml ? `<div class="loyalty-preview-stats-row" style="color:#171717;">${statsHtml}</div>` : ''}
      </div>
      <div class="loyalty-preview-footer" style="background:transparent;">
        <div class="loyalty-preview-qr" style="box-shadow:0 6px 16px rgba(0,0,0,0.18);">${loyaltyPreviewQrDataUrl || ''}</div>
        <div class="loyalty-preview-powered" style="color:${onAccent}59;">مدعوم من ركين</div>
      </div>
    </div>`;
  } else {
    cardHtml = `
    <div class="loyalty-preview-card">
      <div class="loyalty-preview-header" style="background:${accent}; color:${onAccent};">
        <div class="loyalty-preview-header-top">
          ${logoHtml(accent, onAccent)}
          <div class="loyalty-preview-brand">${businessName}</div>
          <div class="loyalty-preview-tier-chip" style="background:${onAccent}22;">🥇 Gold</div>
        </div>
        <div class="loyalty-preview-customer-name">عميل تجريبي</div>
        ${tenureHtml(`${onAccent}b3`)}
      </div>
      <div class="loyalty-preview-middle" style="${middleBg}">${middleHtml}</div>
      <div class="loyalty-preview-footer" style="background:${accent}; color:${onAccent};">
        ${savedBadgeHtml(`${onAccent}1f`, onAccent)}
        ${statsHtml ? `<div class="loyalty-preview-stats-row">${statsHtml}</div>` : ''}
        <div class="loyalty-preview-qr">${loyaltyPreviewQrDataUrl || ''}</div>
        <div class="loyalty-preview-powered">مدعوم من ركين</div>
      </div>
    </div>`;
  }

  el.innerHTML = cardHtml;
}

function updateLoyaltySystemTypeVisibility(){
  const isVisits = loyaltySystemTypeFormValue() === 'visits';
  document.getElementById('loyaltyPointsConfig').classList.toggle('hidden', isVisits);
  document.getElementById('loyaltyVisitsConfig').classList.toggle('hidden', !isVisits);
  document.getElementById('loyaltyIconPickerRow').classList.toggle('hidden', !isVisits);
}

document.getElementById('loyaltySystemTypeChips').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  document.querySelectorAll('#loyaltySystemTypeChips button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateLoyaltySystemTypeVisibility();
  renderLoyaltyCardPreview();
});
document.getElementById('loyaltyThemeChips').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  document.querySelectorAll('#loyaltyThemeChips button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderLoyaltyCardPreview();
});
['loyaltyAccentInput','loyaltyVisitsThresholdInput','loyaltyRewardLabelInput'].forEach(id=>{
  const inp = document.getElementById(id);
  if(inp) inp.addEventListener('input', renderLoyaltyCardPreview);
});
document.getElementById('loyaltyBannerInput').addEventListener('change', renderLoyaltyCardPreview);
document.getElementById('loyaltyLogoInput').addEventListener('change', ()=>{
  renderLoyaltyCardPreview();
  const file = document.getElementById('loyaltyLogoInput').files[0];
  if(file) renderLoyaltySuggestedColors(URL.createObjectURL(file));
});

function loyaltyThemeFormValue(){
  const active = document.querySelector('#loyaltyThemeChips button.active');
  return active ? active.dataset.theme : 'classic';
}

function renderLoyaltyBrandingPreview(){
  LOYALTY_BANNER_CLEARED = false;
  LOYALTY_CUSTOM_ICON_FILE_URL = null;
  document.getElementById('loyaltyAccentInput').value = LOYALTY_BRANDING.accentColor;
  document.getElementById('loyaltyVisitsThresholdInput').value = LOYALTY_BRANDING.visitsThreshold;
  document.getElementById('loyaltyRewardLabelInput').value = LOYALTY_BRANDING.rewardLabel;
  document.querySelectorAll('#loyaltySystemTypeChips button').forEach(b=>b.classList.toggle('active', b.dataset.type === LOYALTY_BRANDING.systemType));
  document.querySelectorAll('#loyaltyThemeChips button').forEach(b=>b.classList.toggle('active', b.dataset.theme === LOYALTY_BRANDING.theme));
  renderLoyaltyIconPicker();
  renderLoyaltyPatternPicker();
  updateLoyaltySystemTypeVisibility();
  renderLoyaltyCardPreview();
  renderLoyaltySuggestedColors(LOYALTY_BRANDING.logoUrl);
}

// Phone-camera uploads (banners, product photos) were landing in Storage at
// 10-12MB apiece, unresized — every POS/online-storefront/loyalty-card view
// re-serves those from the CDN, which is what blew up Supabase's cached-
// egress bill. Downscaling + re-encoding here, client-side, before upload
// fixes it at the source rather than after the fact. Small files (icons,
// already-optimized logos) are left alone — there's nothing to gain and
// re-encoding a small PNG can only hurt it.
async function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  if (!file || !file.type || !file.type.startsWith('image/') || file.size < 250 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width, height = bitmap.height;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    // PNGs stay PNG (logos/icons often rely on transparency); everything
    // else re-encodes as JPEG, which is what every one of the oversized
    // files actually was.
    const isPng = file.type === 'image/png';
    const outType = isPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, isPng ? undefined : quality));
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg');
    return new File([blob], newName, { type: outType });
  } catch (err) {
    console.error('compressImageFile failed, uploading original', err);
    return file;
  }
}

// Uploads to R2 via the server-side route (never straight to Storage —
// moved off Supabase Storage entirely since R2 has no egress fees, which is
// what actually blew up the bill; Storage billed every cached view of every
// image, R2 doesn't bill views at all). folder/prefix match the old bucket
// name and filename convention exactly so nothing else has to change.
async function uploadMediaFile(file, folder, prefix) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', folder);
  fd.append('prefix', prefix);
  const res = await fetch('/api/dashboard/upload-media', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (session ? session.access_token : '') },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'تعذر رفع الملف');
  return data.url;
}

document.getElementById('loyaltyBrandingSaveBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('loyaltyBrandingSaveBtn');
  btn.disabled = true;
  try {
    const logoFile = await compressImageFile(document.getElementById('loyaltyLogoInput').files[0]);
    const bannerFile = await compressImageFile(document.getElementById('loyaltyBannerInput').files[0]);
    const customIconFile = await compressImageFile(document.getElementById('loyaltyCustomIconInput').files[0]);
    const accentColor = document.getElementById('loyaltyAccentInput').value;
    const iconChoice = document.querySelector('.loyalty-icon-choice[data-icon].active');
    const patternChoice = document.querySelector('.loyalty-pattern-swatch.active');
    const updates = {
      loyalty_accent_color: accentColor,
      loyalty_icon_style: iconChoice ? iconChoice.dataset.icon : 'generic',
      loyalty_pattern_style: patternChoice ? patternChoice.dataset.pattern : 'none',
      loyalty_theme: loyaltyThemeFormValue()
    };

    if(logoFile){
      updates.loyalty_logo_url = await uploadMediaFile(logoFile, 'loyalty-branding', 'logo');
    }
    if(updates.loyalty_icon_style === 'custom' && customIconFile){
      updates.loyalty_custom_icon_url = await uploadMediaFile(customIconFile, 'loyalty-branding', 'loyalty-icon');
    }
    if(bannerFile){
      updates.loyalty_banner_url = await uploadMediaFile(bannerFile, 'loyalty-branding', 'banner');
    } else if(LOYALTY_BANNER_CLEARED){
      updates.loyalty_banner_url = null;
    }

    const { error } = await window.supabaseClient.from('businesses').update(updates).eq('id', CURRENT_PROFILE.business_id);
    if(error) throw error;
    await loadLoyaltyBranding();
    renderLoyaltyBrandingPreview();
    logDashboardAudit('حدّث تصميم بطاقة الولاء');
    showToast('تم حفظ التصميم');
  } catch(err){
    showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    btn.disabled = false;
  }
});

// Free-form push broadcast ("خصم 20% اليوم!") to every customer who opted
// into loyalty-card notifications — same VAPID pipeline as the per-order
// points-update push, just fanned out to the whole business instead of one
// customer. Genuinely free (no per-message cost, no external account), and
// has no hard send limit from our side — the only real ceiling is that it
// only reaches customers who already enabled notifications on their card.
async function loadLoyaltySubscriberCount(){
  const countEl = document.getElementById('loyaltySubCount');
  if(!countEl) return;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if(!session) return;
    const res = await fetch('/api/dashboard/send-loyalty-broadcast', {
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    const result = await res.json();
    if(res.ok) countEl.textContent = result.count;
  } catch { /* count is a nice-to-have, not worth surfacing an error for */ }
}
const loyaltyBroadcastBtn = document.getElementById('loyaltyBroadcastSendBtn');
if(loyaltyBroadcastBtn) loyaltyBroadcastBtn.addEventListener('click', async ()=>{
  const title = document.getElementById('loyaltyBroadcastTitle').value.trim();
  const body = document.getElementById('loyaltyBroadcastBody').value.trim();
  if(!title){ showToast('لازم تكتب عنوان للإشعار'); return; }
  loyaltyBroadcastBtn.disabled = true;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if(!session){ showToast('جلسة غير صالحة'); return; }
    const res = await fetch('/api/dashboard/send-loyalty-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ title, body })
    });
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || 'تعذر الإرسال');
    showToast(result.total > 0 ? `تم الإرسال لـ ${result.sent} من ${result.total} مشترك` : 'ما فيه عملاء مشتركين بالتنبيهات بعد');
    if(result.sent > 0){
      logDashboardAudit('أرسل إشعار ترويجي: ' + title);
      document.getElementById('loyaltyBroadcastTitle').value = '';
      document.getElementById('loyaltyBroadcastBody').value = '';
    }
    loadLoyaltySubscriberCount();
  } catch(err){
    showToast('تعذر الإرسال: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    loyaltyBroadcastBtn.disabled = false;
  }
});

document.getElementById('loyaltyRateSaveBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('loyaltyRateSaveBtn');
  const systemType = loyaltySystemTypeFormValue();
  const updates = { loyalty_system_type: systemType };

  if(systemType === 'visits'){
    const threshold = parseInt(document.getElementById('loyaltyVisitsThresholdInput').value,10);
    const rewardLabel = document.getElementById('loyaltyRewardLabelInput').value.trim();
    if(!(threshold >= 2)){ showToast('عدد مرات الشراء لازم يكون رقم ٢ أو أكثر'); return; }
    if(!rewardLabel){ showToast('اكتب وش المكافأة'); return; }
    updates.loyalty_visits_threshold = threshold;
    updates.loyalty_reward_label = rewardLabel;
  } else {
    const val = parseInt(document.getElementById('loyaltyRateInput').value);
    if(!(val > 0)){ showToast('أدخل رقم صحيح'); return; }
    updates.loyalty_points_divisor = val;
  }

  btn.disabled = true;
  try {
    const { error } = await window.supabaseClient.from('businesses').update(updates).eq('id', CURRENT_PROFILE.business_id);
    if(error) throw error;
    if(systemType === 'points'){
      LOYALTY_RATE = updates.loyalty_points_divisor;
      renderLoyaltyKpis();
      renderLoyaltyCards();
    }
    LOYALTY_BRANDING.systemType = systemType;
    logDashboardAudit('حدّث إعداد برنامج الولاء (' + (systemType==='visits'?'زيارات':'نقاط') + ')');
    showToast('تم حفظ إعداد البرنامج');
  } catch(err){
    showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'بس المالك يقدر يغيّر هذا الإعداد'));
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('campaignBuildBtn').addEventListener('click', ()=>{
  const tierFilter = document.getElementById('campaignTierSelect').value;
  const minDays = parseInt(document.getElementById('campaignDaysInput').value) || 0;
  const matches = TOP_CUSTOMERS.filter(c=>{
    const tier = loyaltyTier(c.spend).name;
    return (tierFilter==='all' || tier===tierFilter) && c.lastVisitDays >= minDays;
  });
  const el = document.getElementById('campaignResultList');
  if(matches.length === 0){
    el.innerHTML = '<div style="font-size:12px; color:var(--muted); font-weight:600; padding:10px 0;">ما فيه عملاء يطابقون هذي الشروط حاليًا.</div>';
  } else {
    el.innerHTML = matches.map(c=>
      `<div class="campaign-result-row"><span style="flex:1; font-weight:700;">${c.name}</span><span style="color:var(--muted);">آخر زيارة قبل ${c.lastVisitDays} يوم</span><span class="mono" style="font-weight:800;">${c.spend.toFixed(2)} ر.س</span></div>`
    ).join('') + `<button class="menu-add-btn" id="campaignExportBtn" style="margin-top:12px;">تصدير القائمة (${matches.length})</button>`;
    document.getElementById('campaignExportBtn').addEventListener('click', ()=>{
      const header = 'الاسم,الجوال,آخر زيارة (يوم),إجمالي الإنفاق\n';
      const csvRows = matches.map(c=>{
        const cust = TOP_CUSTOMERS.find(x=>x.name===c.name);
        const phone = (cust && cust.phone) ? cust.phone : '';
        return `"${c.name.replace(/"/g,'""')}","${phone}",${c.lastVisitDays},${c.spend.toFixed(2)}`;
      }).join('\n');
      const blob = new Blob(['﻿' + header + csvRows], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'عرض-مستهدف-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      logDashboardAudit('صدّر قائمة عرض مستهدف (' + matches.length + ' عميل)');
      showToast('تم تنزيل الملف');
    });
  }
  logDashboardAudit('بنى عرض مستهدف — ' + matches.length + ' عميل مطابق');
});

/* ============ Sidebar navigation ============ */
const SCREEN_TITLES = {
  home:'الرئيسية', orders:'الطلبات', purchases:'المشتريات', menu:'القائمة', services:'الخدمات', rooms:'الغرف', inventory:'المخزون',
  staff:'الموظفين', customers:'العملاء', loyalty:'نادي الولاء', accounting:'المحاسبة', delivery:'تطبيقات التوصيل',
  ai:'مستشار ركين الذكي', reports:'التقارير', settings:'الإعدادات'
};
const PLACEHOLDER_ICONS = {
  orders:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  purchases:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  inventory:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  accounting:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  staff:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  customers:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  delivery:'<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  ai:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  reports:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  settings:'<circle cx="12" cy="12" r="3"/>'
};

// Bottom-nav FAB: only screens with a real, single obvious "add" action get
// one — Orders has no order-creation flow in this dashboard (orders come
// from the POS terminal), so it deliberately has no FAB rather than forcing
// one. Reuses each screen's own existing button (openAddStockBtn/
// openAddInvoiceBtn2) instead of duplicating what it does.
const FAB_PLUS_ICON = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
const FAB_ACTIONS = {
  inventory: { label:'إضافة صنف جديد', targetId:'openAddStockBtn' },
  // Purchases deliberately has no FAB — its own in-page button is already
  // the full-width, unmissable primary action; a second floating "+" doing
  // the exact same thing would just be a duplicate to figure out between.
};
function syncBottomNav(target){
  document.querySelectorAll('.rk-bn-item').forEach(b=>b.classList.remove('active'));
  const bnMap = {home:0, orders:1, inventory:2, purchases:3};
  const bnItems = document.querySelectorAll('.rk-bn-item');
  if(target in bnMap && bnItems[bnMap[target]]) bnItems[bnMap[target]].classList.add('active');

  const fab = document.getElementById('rkFab');
  if(!fab) return;
  const action = FAB_ACTIONS[target];
  if(!action){
    fab.classList.add('hidden');
    fab.onclick = null;
    return;
  }
  fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${FAB_PLUS_ICON}</svg>`;
  fab.setAttribute('aria-label', action.label);
  fab.classList.remove('hidden');
  fab.onclick = ()=>{
    const targetBtn = document.getElementById(action.targetId);
    if(targetBtn) targetBtn.click();
  };
}

document.body.dataset.activeScreen = 'home'; // matches the markup's default active section

// Reports/Settings render instantly from already-loaded globals — only
// gate the FIRST call per session so revisits don't redo the (cheap) work.
// Customers/Loyalty share one real network load (loadCustomersReal — see
// LOYALTY_RATE/TOP_CUSTOMERS/CUSTOMERS_TODAY cross-use in the Loyalty
// render functions), so whichever of the two screens is opened first
// triggers it once for both.
let reportsScreenLoaded = false;
let settingsPanelLoaded = false;
let customersDataLoaded = false;
let loyaltyBrandingLoaded = false;
async function ensureCustomersDataLoaded(){
  if(customersDataLoaded) return;
  customersDataLoaded = true;
  await loadCustomersReal();
}

document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const target = btn.dataset.screen;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-'+target).classList.add('active');
    document.getElementById('topbarTitle').textContent = SCREEN_TITLES[target];
    document.body.dataset.activeScreen = target;
    syncBottomNav(target);

    if(target !== 'home'){
      const el = document.getElementById('screen-'+target);
      if(!el.dataset.rendered){
        el.innerHTML = `<div class="placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${PLACEHOLDER_ICONS[target]}</svg>
          <h3>${SCREEN_TITLES[target]} — جاية بالمرحلة الجاية</h3>
          <p>هذا القسم جزء من خارطة الطريق، بس ما بنيناه لسا بنفس الجودة اللي نلتزم فيها بكل شي بركين.</p>
        </div>`;
        el.dataset.rendered = '1';
      }
    }

    // Purchases moved out of Accounting's tab system into its own top-level
    // screen — re-render on every visit (same freshness the old accounting
    // "expenses" tab gave it), not just once at boot.
    if(target === 'purchases'){
      renderAcctTodayStat();
      renderPurchaseHistory();
      renderSupplierComparison();
      renderInvoiceScanMetrics();
    }

    if(target === 'reports' && !reportsScreenLoaded){
      reportsScreenLoaded = true;
      refreshReportData();
      initReportThemePicker();
      loadReportHistory();
    }

    if(target === 'settings' && !settingsPanelLoaded){
      settingsPanelLoaded = true;
      renderSettingsPanel();
    }

    if(target === 'customers'){
      await ensureCustomersDataLoaded();
      renderCustKpis();
      renderRfmSegments();
      renderCustList();
      renderCustInsight();
    }

    if(target === 'loyalty'){
      await ensureCustomersDataLoaded();
      renderLoyaltyKpis();
      renderLoyaltyCards();
      renderLoyaltyTiers();
      if(!loyaltyBrandingLoaded){
        loyaltyBrandingLoaded = true;
        await loadLoyaltyBranding();
        loadLoyaltySubscriberCount();
        loadWinBackSettings();
      }
      renderLoyaltyBrandingPreview();
    }
  });
});

/* ============ Command Bar (⌘K) ============ */
const CMDK_NAV_ITEMS = Object.keys(SCREEN_TITLES).map(key=>({
  type:'nav', key, label:SCREEN_TITLES[key],
  icon:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
}));
const CMDK_QUICK_ACTIONS = [
  {type:'action', key:'new-product', label:'إنشاء منتج جديد', icon:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'},
  {type:'action', key:'refund', label:'استرجاع طلب', icon:'<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'},
  {type:'action', key:'open-shift', label:'فتح وردية', icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'},
  {type:'action', key:'close-shift', label:'إغلاق وردية', icon:'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'},
  {type:'action', key:'new-invoice', label:'إنشاء فاتورة', icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'},
  {type:'action', key:'print-report', label:'طباعة تقرير', icon:'<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'}
];
let cmdkHighlighted = 0;

function openCmdk(){
  document.getElementById('cmdkOverlay').classList.add('show');
  const input = document.getElementById('cmdkInput');
  input.value = '';
  renderCmdkResults('');
  input.focus();
}
function closeCmdk(){ document.getElementById('cmdkOverlay').classList.remove('show'); }

function renderCmdkResults(query){
  const q = query.trim();
  const navMatches = CMDK_NAV_ITEMS.filter(i=> !q || i.label.includes(q));
  const actionMatches = CMDK_QUICK_ACTIONS.filter(i=> !q || i.label.includes(q));
  const el = document.getElementById('cmdkResults');
  cmdkHighlighted = 0;

  if(navMatches.length === 0 && actionMatches.length === 0){
    el.innerHTML = '<div class="cmdk-empty">ما فيه نتائج مطابقة</div>';
    return;
  }
  let html = '';
  if(navMatches.length){
    html += '<div class="cmdk-group-label">الأقسام</div>';
    html += navMatches.map(i=>`<button class="cmdk-item" data-type="nav" data-key="${i.key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${i.icon}</svg>${i.label}</button>`).join('');
  }
  if(actionMatches.length){
    html += '<div class="cmdk-group-label">إجراءات سريعة</div>';
    html += actionMatches.map(i=>`<button class="cmdk-item" data-type="action" data-key="${i.key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${i.icon}</svg>${i.label}</button>`).join('');
  }
  el.innerHTML = html;
  const items = el.querySelectorAll('.cmdk-item');
  if(items.length) items[0].classList.add('highlighted');
  items.forEach(btn=>{
    btn.addEventListener('click', ()=> executeCmdk(btn.dataset.type, btn.dataset.key));
  });
}

function executeCmdk(type, key){
  closeCmdk();
  if(type === 'nav'){
    const navBtn = document.querySelector('.nav-item[data-screen="'+key+'"]');
    if(navBtn) navBtn.click();
  } else {
    const action = CMDK_QUICK_ACTIONS.find(a=>a.key===key);
    console.log('[command bar] quick action triggered:', action ? action.label : key);
  }
}

document.getElementById('cmdkTrigger').addEventListener('click', openCmdk);
document.getElementById('cmdkOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'cmdkOverlay') closeCmdk(); });
document.getElementById('cmdkInput').addEventListener('input', (e)=> renderCmdkResults(e.target.value));
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    const overlay = document.getElementById('cmdkOverlay');
    overlay.classList.contains('show') ? closeCmdk() : openCmdk();
    return;
  }
  const overlay = document.getElementById('cmdkOverlay');
  if(!overlay.classList.contains('show')) return;
  if(e.key === 'Escape'){ closeCmdk(); return; }
  const items = [...document.querySelectorAll('.cmdk-item')];
  if(items.length === 0) return;
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    items[cmdkHighlighted].classList.remove('highlighted');
    cmdkHighlighted = Math.min(items.length-1, cmdkHighlighted+1);
    items[cmdkHighlighted].classList.add('highlighted');
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    items[cmdkHighlighted].classList.remove('highlighted');
    cmdkHighlighted = Math.max(0, cmdkHighlighted-1);
    items[cmdkHighlighted].classList.add('highlighted');
  } else if(e.key === 'Enter'){
    e.preventDefault();
    const btn = items[cmdkHighlighted];
    executeCmdk(btn.dataset.type, btn.dataset.key);
  }
});

/* ============ Theme toggle (both login screen and — later — in-app) ============ */
function toggleTheme(){
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
}
document.getElementById('themeToggleLogin').addEventListener('click', toggleTheme);

/* ============ Language toggle (Arabic is fully supported; English UI is future scope) ============ */
document.getElementById('langToggle').addEventListener('click', function(){
  this.textContent = this.textContent === 'EN' ? 'AR' : 'EN';
});

/* ============ Login -> Welcome -> Dashboard flow — real Supabase Auth.
   CURRENT_PROFILE/GRANTED_SCREENS replace the old demo ROLES/CURRENT_ROLE
   chip picker: owners/managers get full access, employees get exactly the
   screens their manager granted via user_permissions (screen:<slug> rows). */
let CURRENT_PROFILE = null;
let GRANTED_SCREENS = new Set();

function screenAllowed(slug){
  if(!CURRENT_PROFILE) return false;
  // Package-tier entitlement set by Rakeen admin, not a per-employee
  // permission — applies even to the owner, same as kitchen_display_enabled.
  if(slug === 'inventory' && !INVENTORY_ENABLED) return false;
  if(CURRENT_PROFILE.user_type !== 'employee') return true;
  return GRANTED_SCREENS.has('screen:' + slug);
}

/* cost/margin figures (Menu screen) are gated separately from screen access —
   an employee can have screen:menu without view_profit and still manage the
   menu, just without seeing what anything costs or how much profit it makes. */
function canViewProfit(){
  if(!CURRENT_PROFILE) return false;
  if(CURRENT_PROFILE.user_type !== 'employee') return true;
  return GRANTED_SCREENS.has('view_profit');
}

async function loadProfileAndPermissions(userId){
  const { data: profile, error: profileError } = await window.supabaseClient
    .from('profiles').select('id, business_id, full_name, user_type').eq('id', userId).single();
  if(profileError || !profile) throw profileError || new Error('تعذر تحميل بيانات المستخدم');
  CURRENT_PROFILE = profile;
  CURRENT_ROLE = profile.user_type;
  GRANTED_SCREENS = new Set();
  if(profile.user_type === 'employee'){
    const { data: perms } = await window.supabaseClient
      .from('user_permissions').select('permission_key').eq('user_id', userId);
    (perms||[]).forEach(p=> GRANTED_SCREENS.add(p.permission_key));
  }
}

/* ============ Real data hydration (Phase 1: Inventory, Menu & Modifiers,
   Accounting's Fixed Costs/Purchase Invoices/General Expenses) ============
   Rather than rewriting every render function that reads STOCK_ITEMS/
   MENU_ITEMS/etc. (dozens of them, all already correct against these exact
   shapes), this fetches real rows from Supabase once after login and
   reshapes them into the exact same in-memory shapes the existing code
   already expects (camelCase field names, ingredient-by-name recipe lines,
   etc). Every screen outside this phase's scope (orders/staff/customers/
   loyalty/delivery/ai/reports/settings) is untouched and keeps reading its
   original hardcoded constants. Save/delete handlers below additionally
   write through to Supabase, then patch these same local arrays so the UI
   updates instantly without a full refetch. */
let STOCK_ITEM_ID_BY_NAME = {};
let STOCK_ITEM_NAME_BY_ID = {};
let SUPPLIER_ID_BY_NAME = {};
let SUPPLIER_VAT_REGISTERED_BY_NAME = {}; // suppliers.vat_registered — gates auto-derived input VAT (see saveInvoice)
let EXPENSE_CATEGORY_ID_BY_NAME = {};
let MENU_CATEGORY_ID_BY_NAME = {};

function formatRelativeDate(iso){
  if(!iso) return '';
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if(days <= 0) return 'اليوم';
  if(days === 1) return 'أمس';
  if(days < 7) return 'قبل ' + days + ' أيام';
  if(days < 14) return 'قبل أسبوع';
  return 'قبل ' + Math.floor(days/7) + ' أسابيع';
}

async function loadBusinessData(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;

  const [stockRes, catRes, itemsRes, costsRes, boxEligRes,
         groupRes, optRes, itemModRes, fixedRes, supplierRes, invRes,
         expCatRes, expRes, businessRes] = await Promise.all([
    sb.from('stock_items').select('*').eq('business_id', businessId).order('id'),
    sb.from('menu_categories').select('*').eq('business_id', businessId).order('sort_order'),
    sb.from('menu_items').select('*').eq('business_id', businessId).order('id'),
    // Recipe/box-mix quantities are encrypted at rest — a bulk select on
    // those tables would only ever return ciphertext anyway, so cost
    // figures come from menu_item_costs() instead, which decrypts
    // server-side and returns just the computed number (gated by
    // view_profit, same as always). The real per-ingredient recipe is
    // fetched separately, per item, only when the owner opens that item's
    // editor (see openProductEditModal).
    sb.rpc('menu_item_costs'),
    sb.from('menu_item_box_eligible_items').select('*'),
    sb.from('modifier_groups').select('*').eq('business_id', businessId).order('id'),
    sb.from('modifier_options').select('*'),
    sb.from('menu_item_modifier_groups').select('*'),
    sb.from('fixed_costs').select('*').eq('business_id', businessId).maybeSingle(),
    sb.from('suppliers').select('*').eq('business_id', businessId),
    sb.from('purchase_invoices').select('*').eq('business_id', businessId).order('invoiced_at', {ascending:false}),
    sb.from('expense_categories').select('*').eq('business_id', businessId),
    sb.from('general_expenses').select('*').eq('business_id', businessId).order('spent_at', {ascending:false}),
    sb.from('businesses').select('name, logo_url, vat_rate, vat_number, prices_include_vat, vat_registered, notify_sound_enabled, dine_in_enabled, receipt_custom_message, online_ordering_enabled, online_menu_slug, online_theme_color, online_banner_url, online_offers_delivery, online_offers_pickup, online_delivery_fee, online_pickup_prep_minutes, online_contact_whatsapp, online_order_free_count, online_subscribed, online_order_free_limit, inventory_enabled, business_type, online_booking_enabled, geidea_connected, geidea_public_key_last4').eq('id', businessId).single(),
  ]);

  if(businessRes.data){
    RESTAURANT_INFO.name = businessRes.data.name;
    BUSINESS_LOGO_URL = businessRes.data.logo_url;
    if(businessRes.data.vat_rate != null) BUSINESS_VAT_RATE = Number(businessRes.data.vat_rate);
    BUSINESS_VAT_NUMBER = businessRes.data.vat_number || '';
    PRICES_INCLUDE_VAT = businessRes.data.prices_include_vat !== false;
    VAT_REGISTERED = businessRes.data.vat_registered !== false;
    RECEIPT_CUSTOM_MESSAGE = businessRes.data.receipt_custom_message || '';
    NOTIFY_SOUND_ENABLED = businessRes.data.notify_sound_enabled !== false;
    DINE_IN_ENABLED = businessRes.data.dine_in_enabled !== false;
    ONLINE_ORDERING_ENABLED = businessRes.data.online_ordering_enabled === true;
    ONLINE_MENU_SLUG = businessRes.data.online_menu_slug || null;
    ONLINE_THEME_COLOR = businessRes.data.online_theme_color || '#C7FF4D';
    ONLINE_BANNER_URL = businessRes.data.online_banner_url || '';
    ONLINE_OFFERS_DELIVERY = businessRes.data.online_offers_delivery !== false;
    ONLINE_OFFERS_PICKUP = businessRes.data.online_offers_pickup !== false;
    ONLINE_DELIVERY_FEE = Number(businessRes.data.online_delivery_fee) || 0;
    ONLINE_PICKUP_PREP_MINUTES = Number(businessRes.data.online_pickup_prep_minutes) || 20;
    ONLINE_CONTACT_WHATSAPP = businessRes.data.online_contact_whatsapp || '';
    ONLINE_ORDER_FREE_COUNT = Number(businessRes.data.online_order_free_count) || 0;
    ONLINE_SUBSCRIBED = businessRes.data.online_subscribed === true;
    ONLINE_ORDER_FREE_LIMIT = Number(businessRes.data.online_order_free_limit) || 350;
    GEIDEA_CONNECTED = businessRes.data.geidea_connected === true;
    GEIDEA_PUBLIC_KEY_LAST4 = businessRes.data.geidea_public_key_last4 || '';
    INVENTORY_ENABLED = businessRes.data.inventory_enabled !== false;
    BUSINESS_TYPE = businessRes.data.business_type || 'restaurant';
    ONLINE_BOOKING_ENABLED = businessRes.data.online_booking_enabled === true;
  }

  STOCK_ITEM_ID_BY_NAME = {}; STOCK_ITEM_NAME_BY_ID = {};
  (stockRes.data||[]).forEach(s=>{ STOCK_ITEM_ID_BY_NAME[s.name]=s.id; STOCK_ITEM_NAME_BY_ID[s.id]=s.name; });
  STOCK_ITEMS = (stockRes.data||[]).map(s=>({
    id:s.id, name:s.name, category:s.category, unit:s.unit,
    qtyOnHand:Number(s.qty_on_hand), parLevel:Number(s.par_level), unitCost:Number(s.unit_cost),
    duration:s.duration || '', aliasNames:s.alias_names || []
  }));

  MENU_CATEGORY_ID_BY_NAME = {};
  (catRes.data||[]).forEach(c=> MENU_CATEGORY_ID_BY_NAME[c.name]=c.id);
  MENU_CATEGORIES = (catRes.data||[]).map(c=>c.name);

  const boxEligByItem = {};
  (boxEligRes.data||[]).forEach(r=>{ (boxEligByItem[r.menu_item_id] ||= []).push(r); });
  const modGroupIdsByItem = {};
  (itemModRes.data||[]).forEach(r=>{ (modGroupIdsByItem[r.menu_item_id] ||= []).push(r.modifier_group_id); });
  const catNameById = {}; (catRes.data||[]).forEach(c=> catNameById[c.id]=c.name);

  MENU_ITEM_COST_BY_ID = {};
  (costsRes.data||[]).forEach(c=>{
    MENU_ITEM_COST_BY_ID[c.menu_item_id] = {
      variableCost: c.variable_cost != null ? Number(c.variable_cost) : null,
      variableCostMin: c.variable_cost_min != null ? Number(c.variable_cost_min) : null,
      variableCostMax: c.variable_cost_max != null ? Number(c.variable_cost_max) : null,
    };
  });

  MENU_ITEMS = (itemsRes.data||[]).map(m=>{
    // real per-ingredient recipe (qty/unit) is fetched on demand, per item,
    // only when its editor opens — see openProductEditModal. computeVariableCost
    // reads MENU_ITEM_COST_BY_ID instead of this array for cost math.
    const item = {
      id:m.id, name:m.name, price:Number(m.price), category:catNameById[m.category_id]||'', active:m.active, image:m.image_url||null,
      costMode:m.cost_mode, directCost:Number(m.direct_cost), linkInventory:m.link_inventory, linkProfit:m.link_profit,
      pointsRedeemPrice: m.points_redeem_price != null ? Number(m.points_redeem_price) : null,
      barcode: m.barcode || '',
      finishedGoodStockItemId: m.finished_good_stock_item_id || null,
      recipe: [], modifierGroupIds: modGroupIdsByItem[m.id]||[]
    };
    if(m.cost_mode === 'box'){
      item.componentSlot = {
        totalPieces: m.total_pieces || 0,
        eligibleItems: (boxEligByItem[m.id]||[]).map(r=> r.cost_mode==='simple'
          ? {name:r.name, costMode:'simple', extraCost:Number(r.extra_cost)||0}
          : {name:STOCK_ITEM_NAME_BY_ID[r.stock_item_id], costMode:'stock', extraCost:0}
        ).filter(e=>e.name),
        defaultMix: []
      };
    }
    return item;
  });

  MODIFIER_GROUPS = (groupRes.data||[]).map(g=>({
    id:g.id, name:g.name, type:g.type, max:g.max_select,
    options: (optRes.data||[]).filter(o=>o.group_id===g.id).map(o=>{
      const base = {name:o.name, priceDelta:Number(o.price_delta), costMode:o.cost_mode};
      if(o.cost_mode === 'stock'){
        base.stockLink = {ingredient:STOCK_ITEM_NAME_BY_ID[o.stock_item_id], qty:Number(o.stock_qty), unit:o.stock_unit};
        if(o.option_max != null) base.optionMax = o.option_max;
      } else {
        base.extraCost = Number(o.extra_cost)||0;
      }
      return base;
    })
  }));

  if(fixedRes.data){
    FIXED_COSTS = {rent:Number(fixedRes.data.rent), salaries:Number(fixedRes.data.salaries), utilities:Number(fixedRes.data.utilities), other:Number(fixedRes.data.other)};
  }

  SUPPLIER_ID_BY_NAME = {};
  SUPPLIER_VAT_REGISTERED_BY_NAME = {};
  (supplierRes.data||[]).forEach(s=>{ SUPPLIER_ID_BY_NAME[s.name]=s.id; SUPPLIER_VAT_REGISTERED_BY_NAME[s.name] = s.vat_registered !== false; });
  const supplierNameById = {}; (supplierRes.data||[]).forEach(s=> supplierNameById[s.id]=s.name);
  PURCHASE_INVOICES = (invRes.data||[]).map(i=>({
    id:i.id, stockItem:STOCK_ITEM_NAME_BY_ID[i.stock_item_id], supplier:supplierNameById[i.supplier_id],
    qty:Number(i.qty), unit:i.unit, totalCost:Number(i.total_cost), date:formatRelativeDate(i.invoiced_at),
    invoicedAt:i.invoiced_at, invoiceGroupId:i.invoice_group_id, stockItemId:i.stock_item_id
  }));

  EXPENSE_CATEGORY_ID_BY_NAME = {};
  (expCatRes.data||[]).forEach(c=> EXPENSE_CATEGORY_ID_BY_NAME[c.name]=c.id);
  const expCatNameById = {}; (expCatRes.data||[]).forEach(c=> expCatNameById[c.id]=c.name);
  GENERAL_EXPENSES = (expRes.data||[]).map(e=>({
    id:e.id, category:expCatNameById[e.category_id]||'', amount:Number(e.amount), description:e.description||'', date:formatRelativeDate(e.spent_at)
  }));
}

const ORDER_CHANNEL_TYPE_LABELS = {dine_in:'داخل المطعم', pickup:'سفري', delivery:'توصيل'};
const ORDER_PAYMENT_LABELS = {cash:'كاش', card:'بطاقة', split:'تقسيم دفع', delivery_platform:'مدفوع عبر التطبيق'};

async function loadOrdersAndTables(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const cutoff = orderDateRangeCutoff(orderDateRange);
  const [{data: orders}, {data: tables}, {data: sections}, {data: biz}] = await Promise.all([
    sb.from('orders').select('id, created_at, channel, total, payment_method, status, source').eq('business_id', businessId).gte('created_at', cutoff).order('created_at', {ascending:false}).limit(500),
    sb.from('restaurant_tables').select('id, number, status, active_order_id, section_id, status_changed_at').eq('business_id', businessId).order('number'),
    sb.from('table_sections').select('id, name, sort_order').eq('business_id', businessId).order('sort_order'),
    sb.from('businesses').select('tables_turn_time_minutes').eq('id', businessId).single()
  ]);
  TABLE_SECTIONS = sections || [];
  TABLES_TURN_TIME_MINUTES = (biz && biz.tables_turn_time_minutes) || 45;
  const orderIds = (orders||[]).map(o=>o.id);
  const { data: items } = orderIds.length
    ? await sb.from('order_items').select('order_id').in('order_id', orderIds)
    : { data: [] };
  const countByOrder = {};
  (items||[]).forEach(it=>{ countByOrder[it.order_id] = (countByOrder[it.order_id]||0)+1; });
  RECENT_ORDERS = (orders||[]).map(o=>({
    id: '#'+o.id,
    date: formatRelativeDate(o.created_at),
    time: new Date(o.created_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}),
    type: ORDER_CHANNEL_TYPE_LABELS[o.channel] || o.channel,
    isOnline: o.source === 'online',
    items: countByOrder[o.id] || 0,
    total: Number(o.total),
    payment: ORDER_PAYMENT_LABELS[o.payment_method] || o.payment_method,
    status: o.status
  }));
  TABLES = (tables||[]).map(t=>({ number: t.number, status: t.status, tableId: t.id, sectionId: t.section_id, orderId: t.active_order_id ? '#'+t.active_order_id : null, statusChangedAt: t.status_changed_at }));
}

/* live sync with the POS: a table status change made on a cashier's tablet
   shows up here without a manual refresh, and vice versa (POS subscribes to
   the same table independently, in rakeen-pos.js). */
function subscribeToTableChanges(){
  window.supabaseClient
    .channel('dashboard-restaurant-tables')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, async ()=>{
      await loadOrdersAndTables();
      if(document.getElementById('tablesFloorGrid')) renderTablesFloorGrid();
    })
    .subscribe();
}

/* Before this, the Home and Orders screens only ever loaded once at login —
   a sale rung up on the POS (or an online order arriving/being accepted)
   never appeared here until the owner manually changed a filter/date-range
   or reloaded the page. Mirrors subscribeToTableChanges' pattern, scoped to
   `orders` and business_id (an owner's dashboard spans every branch, unlike
   the POS/kitchen's single-branch filter) instead of restaurant_tables. */
function subscribeToOrdersLiveSync(){
  window.supabaseClient
    .channel('dashboard-orders-live-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'business_id=eq.' + CURRENT_PROFILE.business_id }, async ()=>{
      await loadOrdersAndTables();
      computeOrderStatusCounts();
      renderOrderStatusGrid();
      renderOrdersTable();
      await loadSalesRealData();
      renderStatusHero();
      renderTodayHeroes();
      renderHourGrid();
      renderSalesRangeSummary({netSales: TODAY.netSales, ordersCount: TODAY.ordersCount, avgTicket: TODAY.avgTicket, profit: TODAY.profit, salesDelta: YESTERDAY.netSales > 0 ? (TODAY.netSales - YESTERDAY.netSales) / YESTERDAY.netSales * 100 : null});
    })
    .subscribe();
}

async function renderPhase1Screens(){
  renderStockTable();
  renderWasteAndFoodCost();
  wireMenuScreen();
  // wireRoomsScreen() reads the SERVICES array wireServicesScreen() populates
  // (room types are `services` rows) — must await, or the Rooms table can
  // render before SERVICES is ready and show every room's type as "—".
  if(isServiceBusinessType(BUSINESS_TYPE)) await wireServicesScreen();
  if(isHotelBusinessType(BUSINESS_TYPE)) wireRoomsScreen();
  renderGeneralExpensesList();
  renderAcctTodayStat();
  renderPurchaseHistory();
  await loadOrdersAndTables();
  computeOrderStatusCounts();
  renderOrderStatusGrid();
  renderOrdersTable();
  renderTablesFloorGrid();
  subscribeToTableChanges();
  subscribeToOrdersLiveSync();
  await loadPaymentBreakdown();
  renderPaymentBreakdown();
  await loadStaffStats();
  renderEmployeeCards();
  renderAchievements();
  await loadSalesRealData();
  renderOrdersByType();
  renderOrdersBySource();
  recomputeAccounting();
  await loadWeekTrend();
  renderStatusHero();
  renderTodayHeroes();
  renderHourGrid();
  renderBestWorstSellers();
  renderMovers();
  renderCategoryPerf();
  renderChannelCards();
  renderSalesRangeSummary({netSales: TODAY.netSales, ordersCount: TODAY.ordersCount, avgTicket: TODAY.avgTicket, profit: TODAY.profit, salesDelta: YESTERDAY.netSales > 0 ? (TODAY.netSales - YESTERDAY.netSales) / YESTERDAY.netSales * 100 : null});
  renderWaterfall();
  renderOpexBreakdown();
  renderVatAndMargin();
  renderDeliveryPlatforms();
  // Reports, Settings, Customers and Loyalty are deferred to their nav-item's
  // first visit (see the .nav-item click handler below) instead of rendering
  // unconditionally here — none of them feed Home/Orders/Inventory/Menu/
  // Staff/Accounting's own rendering, so building them at boot for every
  // login and every page refresh was pure wasted first-paint work on a
  // screen the user hasn't necessarily opened yet.
}

document.getElementById('loginSubmitBtn').addEventListener('click', async ()=>{
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmitBtn');
  errEl.style.display = 'none';
  if(!email || !password){
    errEl.textContent = 'اكتب البريد الإلكتروني وكلمة المرور.';
    errEl.style.display = 'block';
    return;
  }
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'جاري الدخول...';
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    await loadProfileAndPermissions(data.user.id);
    await loadBusinessData();
    await renderPhase1Screens();
    goToWelcome();
  } catch {
    errEl.textContent = 'بيانات الدخول غير صحيحة. تأكد من البريد وكلمة المرور.';
    errEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await window.supabaseClient.auth.signOut();
  window.location.reload();
});

/* returning user with a still-valid session (e.g. page refresh) skips
   straight to the dashboard instead of the login/welcome screens */
(async function restoreSession(){
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if(!session) return;
  try {
    await loadProfileAndPermissions(session.user.id);
    await loadBusinessData();
    await renderPhase1Screens();
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.body.dataset.stage = 'dashboard';
    applyPermissions();
  } catch (e) {
    console.error('restoreSession failed:', e);
    await window.supabaseClient.auth.signOut();
  }
})();

function goToWelcome(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('welcomeScreen').classList.remove('hidden');
  renderWelcome();
  document.body.dataset.stage = 'welcome';

  let secondsLeft = 5;
  document.getElementById('welcomeCountdown').textContent = ' (' + secondsLeft + ')';
  const timer = setInterval(()=>{
    secondsLeft -= 1;
    document.getElementById('welcomeCountdown').textContent = secondsLeft > 0 ? ' (' + secondsLeft + ')' : '';
    if(secondsLeft <= 0){ clearInterval(timer); enterDashboard(); }
  }, 1000);
  document.getElementById('welcomeContinueBtn').addEventListener('click', ()=>{
    clearInterval(timer);
    enterDashboard();
  });
}

function formatHourLabel(hour24){
  const period = hour24 < 12 ? 'صباحاً' : 'مساءً';
  const hour12 = ((hour24 + 11) % 12) + 1;
  return hour12 + ' ' + period;
}

async function renderWelcome(){
  const hour = new Date().getHours();
  const firstName = (CURRENT_PROFILE && CURRENT_PROFILE.full_name ? CURRENT_PROFILE.full_name : '').split(' ')[0] || '';
  const timeGreeting = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  document.getElementById('welcomeGreeting').textContent = (timeGreeting + ' ' + firstName).trim() + ' 👋';

  const hasYesterdayBaseline = YESTERDAY.netSales > 0;
  const salesDelta = hasYesterdayBaseline ? ((TODAY.netSales - YESTERDAY.netSales) / YESTERDAY.netSales * 100).toFixed(0) : null;
  const salesLineText = !hasYesterdayBaseline
    ? 'ما فيه مبيعات مسجّلة بالأمس للمقارنة عليها بعد.'
    : 'مشروعك اليوم أداءه ' + (salesDelta >= 0 ? 'كويس' : 'أقل من المعتاد') + '. المبيعات ' + (salesDelta>=0?'أعلى':'أقل') + ' من أمس بنسبة <b>' + Math.abs(salesDelta) + '٪</b>.';

  const lines = [{text:salesLineText, warn:false}];

  let insights = {};
  try {
    const { data, error } = await window.supabaseClient.rpc('home_insights');
    if(!error && data) insights = data;
  } catch(e){ console.error('home_insights failed:', e); }

  if(insights.lowStockItem){
    lines.push({text:'مخزون <b>' + insights.lowStockItem.name + '</b> وصل لـ <b>' + insights.lowStockItem.pct + '٪</b> تقريبًا من مستواه المعتاد — راجعه.', warn:true});
  }

  if(insights.peakHour != null){
    lines.push({text:'ذروة الزحمة المتوقعة الساعة <b>' + formatHourLabel(insights.peakHour) + '</b> (حسب طلباتك بآخر ٣٠ يوم) — جهّز فريقك.', warn:false});
  }

  if(insights.salesTarget){
    const openTime = insights.businessOpenTime, closeTime = insights.businessCloseTime;
    let elapsedFraction;
    if(openTime && closeTime){
      const toMinutes = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
      const openMin = toMinutes(openTime), closeMin = toMinutes(closeTime), nowMin = new Date().getHours()*60 + new Date().getMinutes();
      elapsedFraction = Math.min(1, Math.max(0, (nowMin - openMin) / (closeMin - openMin)));
    } else {
      elapsedFraction = Math.min(1, (new Date().getHours()*60 + new Date().getMinutes()) / (24*60));
    }
    const expectedByNow = insights.salesTarget * elapsedFraction;
    if(expectedByNow > 0){
      const paceRatio = TODAY.netSales / expectedByNow;
      const paceText = paceRatio >= 1
        ? 'أنت حاليًا بالمسار الصحيح لتتجاوز هدف مبيعات اليوم (<b>' + insights.salesTarget.toLocaleString() + ' ر.س</b>).'
        : 'مبيعاتك حاليًا أقل من المتوقع لتحقيق هدف اليوم (<b>' + insights.salesTarget.toLocaleString() + ' ر.س</b>) بالوتيرة الحالية.';
      lines.push({text:paceText, warn:paceRatio < 1});
    }
  } else {
    lines.push({text:'ما حدّدت هدف مبيعات يومي بعد — تقدر تحدده من الإعدادات.', warn:false});
  }

  document.getElementById('welcomeLines').innerHTML = lines.map(l=>
    `<div class="ai-line ${l.warn?'warn':''}"><span class="ai-dot"></span>${l.text}</div>`
  ).join('');
}

function enterDashboard(){
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.body.dataset.stage = 'dashboard';
  applyPermissions();
}

const ALL_DASHBOARD_SCREENS = ['home','orders','purchases','menu','services','rooms','inventory','staff','customers','loyalty','accounting','delivery','ai','reports','settings'];
const USER_TYPE_LABELS = {owner:'مالك', manager:'مدير', employee:'موظف'};

function applyPermissions(){
  if(!CURRENT_PROFILE) return;

  const ownerNameEl = document.getElementById('ownerName');
  const ownerRoleEl = document.getElementById('ownerRole');
  const ownerAvatarEl = document.getElementById('ownerAvatar');
  if(ownerNameEl) ownerNameEl.textContent = CURRENT_PROFILE.full_name;
  if(ownerRoleEl) ownerRoleEl.textContent = USER_TYPE_LABELS[CURRENT_PROFILE.user_type] || CURRENT_PROFILE.user_type;
  if(ownerAvatarEl) ownerAvatarEl.textContent = (CURRENT_PROFILE.full_name || '؟').charAt(0);

  // 'services' is additionally gated by sector: only service-based business
  // types (salon/ladies_salon/car_wash/mobile_car_wash/clinic) get the nav
  // item, even if the profile's permission set would otherwise allow it —
  // features activate automatically per business_type, no manual toggle.
  const allowedScreens = ALL_DASHBOARD_SCREENS.filter(s=>screenAllowed(s))
    .filter(s=> s !== 'services' || isServiceBusinessType(BUSINESS_TYPE))
    .filter(s=> s !== 'rooms' || isHotelBusinessType(BUSINESS_TYPE));

  // an employee granted nothing at all: this dashboard has nothing to show them
  if(allowedScreens.length === 0){
    document.getElementById('appShell').innerHTML = `<div class="rbac-denied-screen" style="width:100%;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <h3>ما فيه صلاحية دخول للوحة التحكم</h3>
      <p>ما عندك أي صلاحية مفعّلة حاليًا. تواصل مع مديرك عشان يفعّل صلاحياتك.</p>
      <button class="settings-save-btn" id="rbacDeniedLogoutBtn" style="margin-top:16px; max-width:220px;">تسجيل خروج</button>
    </div>`;
    const deniedLogoutBtn = document.getElementById('rbacDeniedLogoutBtn');
    if(deniedLogoutBtn) deniedLogoutBtn.addEventListener('click', async ()=>{
      await window.supabaseClient.auth.signOut();
      window.location.reload();
    });
    return;
  }

  document.querySelectorAll('.nav-item[data-screen]').forEach(btn=>{
    btn.style.display = allowedScreens.includes(btn.dataset.screen) ? '' : 'none';
  });

  // deep-link support (e.g. an "Add to Home Screen" shortcut straight to
  // /dashboard?screen=accounting) — takes priority over the default active
  // screen, but only within whatever this profile is actually allowed to see.
  // Consumed once so it doesn't fight later in-app navigation.
  let handledDeepLink = false;
  if(!window.__rakeenDeepLinkHandled){
    window.__rakeenDeepLinkHandled = true;
    // /dashboard/quick-purchase is its own installable shortcut (see
    // quick-purchase-manifest.json) — same shell, just landing straight on
    // Purchases with the "سجّل فاتورة مشتريات" flow already open and the
    // nav chrome hidden, instead of the owner navigating there by hand
    // every time they need to log today's invoices.
    const isQuickPurchase = location.pathname === '/dashboard/quick-purchase';
    const requestedScreen = isQuickPurchase ? 'purchases' : new URLSearchParams(location.search).get('screen');
    if(requestedScreen && allowedScreens.includes(requestedScreen)){
      const target = document.querySelector('.nav-item[data-screen="'+requestedScreen+'"]');
      if(target){ target.click(); handledDeepLink = true; }
    }
    if(isQuickPurchase && handledDeepLink){
      document.body.classList.add('quickadd-mode');
      if(typeof openInvoiceModal === 'function') openInvoiceModal();
    }
  }

  if(!handledDeepLink){
    const activeBtn = document.querySelector('.nav-item.active');
    const activeScreen = activeBtn ? activeBtn.dataset.screen : 'home';
    if(!allowedScreens.includes(activeScreen)){
      const target = document.querySelector('.nav-item[data-screen="'+allowedScreens[0]+'"]');
      if(target) target.click();
    }
  }

  if(typeof renderEmployeeCards === 'function') renderEmployeeCards();
  if(typeof renderAchievements === 'function') renderAchievements();
  updateAuditFooter();
}

/* ============ Reports screen — أهم صفحة (the owner's own words). Every
   report is scoped to a real, owner-picked date range (not hardcoded
   "today") and pulled from the exact same source-of-truth queries used
   elsewhere (loadSalesRangeData for sales/products/payments/financial;
   dedicated itemized queries for the operational report types below), never
   a re-derived competing number. */
let activeReportType = 'sales';
let REPORT_RANGE = salesRangeBounds('today');
let REPORT_RANGE_LABEL = 'اليوم';
let REPORT_RANGE_DATA = null;
let REPORT_DETAIL_ROWS = null; // itemized rows for shift/purchases/expenses — fetched only when that type is active

const REPORT_TYPES_NEEDING_DETAIL = {shift:true, purchases:true, expenses:true};

// The document design (screen preview + printed/exported PDF) — remembered
// per-device since it's a display preference, not shared business data.
let REPORT_THEME = localStorage.getItem('rakeen_report_theme') || 'classic';

function initReportThemePicker(){
  const picker = document.getElementById('reportThemePicker');
  if(!picker) return;
  const syncActive = ()=> picker.querySelectorAll('.report-theme-swatch').forEach(b=>{
    b.classList.toggle('active', b.dataset.theme === REPORT_THEME);
  });
  syncActive();
  picker.addEventListener('click', (e)=>{
    const b = e.target.closest('.report-theme-swatch'); if(!b) return;
    REPORT_THEME = b.dataset.theme;
    localStorage.setItem('rakeen_report_theme', REPORT_THEME);
    syncActive();
    renderReportPreview();
  });
}

document.getElementById('reportTypeChips').addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  document.querySelectorAll('#reportTypeChips button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  activeReportType = b.dataset.report;
  const rangeCard = document.querySelector('.reports-range-card');
  if(rangeCard) rangeCard.style.display = (activeReportType === 'daily_auto' || activeReportType === 'counter') ? 'none' : '';
  if(activeReportType === 'daily_auto') loadDailyAutoReportsList();
  else if(activeReportType === 'counter') loadSalesCountersPanel();
  else refreshReportData();
});

/* ============ عدّاد المبيعات — a live, owner-defined counter: pick a product,
   pick a start point (now, or any date), and it always shows "كم انباع منه
   منذ ذلك التاريخ" — computed fresh from real orders every time (never a
   manually-incremented number that could drift from refunds/cancellations).
   "تصفير" just moves the start point to now; nothing is ever deleted. */
let SALES_COUNTERS = [];

async function computeCounterQty(counter){
  const sb = window.supabaseClient;
  if(counter.stock_item_id){
    // piece/component counter — decomposes every box/recipe that declares
    // this stock item in its contents, resolved server-side (see
    // compute_stock_item_sales_count) since box/recipe quantities are
    // encrypted at rest and can't be summed client-side anymore.
    const { data, error } = await sb.rpc('compute_stock_item_sales_count', {p_stock_item_id: counter.stock_item_id, p_since: counter.count_since});
    return error ? 0 : Number(data)||0;
  }
  const { data } = await sb.from('order_items').select('qty, orders(created_at, status, payment_status)').eq('menu_item_id', counter.menu_item_id);
  return (data||[]).filter(r=> r.orders && r.orders.created_at >= counter.count_since && (r.orders.status==='completed' || !r.orders.status) && r.orders.payment_status !== 'unpaid')
    .reduce((s,r)=>s+Number(r.qty), 0);
}

async function loadSalesCountersPanel(){
  const panel = document.getElementById('reportPreviewPanel');
  panel.className = 'report-preview-doc theme-' + REPORT_THEME;
  panel.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600; padding:20px 0; text-align:center;">جاري تحميل العدّادات...</p>';
  const sb = window.supabaseClient;
  const { data } = await sb.from('sales_counters').select('id, menu_item_id, stock_item_id, name, count_since')
    .eq('business_id', CURRENT_PROFILE.business_id).order('created_at', {ascending:false});
  SALES_COUNTERS = data || [];
  await renderSalesCountersPanel();
}

async function renderSalesCountersPanel(){
  const panel = document.getElementById('reportPreviewPanel');
  const activeProducts = MENU_ITEMS.filter(m=>m.active && !m.name.includes('(مؤرشف)'));
  const newCounterForm = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">عدّاد جديد</div>
      <div class="menu-add-field" style="max-width:320px; margin-bottom:10px;">
        <label>نوع العدّاد</label>
        <select id="newCounterType">
          <option value="product">منتج كامل (بوكس/صنف بحد ذاته)</option>
          <option value="piece">مكوّن يدخل بأكثر من منتج ${helpIcon('مثال: ورق عنب يدخل بعدة أنواع بوكسات — هذا يجمع عدد القطع من كل الأنواع مع بعض. يشتغل بس إذا كنت حدّدت "بيان محتوى" (كم قطعة من هذا الصنف بكل بوكس) بشاشة المنيو.')}</option>
        </select>
      </div>
      <div class="menu-add-row">
        <div class="menu-add-field" id="newCounterTargetField"><label>المنتج</label>
          <select id="newCounterTarget">${activeProducts.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select>
        </div>
        <div class="menu-add-field"><label>اسم العدّاد</label><input type="text" id="newCounterName" placeholder="مثال: ورق عنب — أغسطس"></div>
        <div class="menu-add-field"><label>يبدأ من</label><input type="datetime-local" id="newCounterSince"></div>
      </div>
      <button class="menu-add-btn" id="createCounterBtn" style="margin-top:8px;">+ إضافة عدّاد</button>
    </div>`;

  if(SALES_COUNTERS.length === 0){
    panel.innerHTML = newCounterForm + '<div class="orders-empty">ما فيه عدّادات بعد — أضف واحد فوق.</div>';
    wireSalesCounterHandlers();
    return;
  }

  panel.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600; padding:10px 0; text-align:center;">جاري حساب الأعداد...</p>';
  const counts = await Promise.all(SALES_COUNTERS.map(c=>computeCounterQty(c)));
  const cardsHtml = SALES_COUNTERS.map((c,i)=>{
    const targetName = c.stock_item_id
      ? (STOCK_ITEMS.find(s=>s.id===c.stock_item_id)?.name || 'صنف محذوف') + ' (مكوّن)'
      : (MENU_ITEMS.find(m=>m.id===c.menu_item_id)?.name || 'منتج محذوف');
    const since = new Date(c.count_since);
    const sinceLabel = since.toLocaleDateString('ar-SA', {year:'numeric', month:'long', day:'numeric'}) + ' — ' + since.toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
    return `
    <div class="panel sales-counter-card" style="margin-bottom:12px;" data-id="${c.id}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
        <div>
          <div class="panel-title" style="margin-bottom:2px;">${c.name}</div>
          <div class="stock-qty-helper">${targetName} — منذ ${sinceLabel}</div>
        </div>
        <div class="acct-hero-value mono" style="font-size:26px;">${counts[i]}</div>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="mtr-edit-btn counter-reset-btn" data-id="${c.id}">تصفير (يبدأ من الآن)</button>
        <button class="mtr-edit-btn counter-delete-btn" data-id="${c.id}" style="color:var(--danger, #a3402c); border-color:var(--danger, #a3402c);">حذف العدّاد</button>
      </div>
    </div>`;
  }).join('');

  panel.innerHTML = newCounterForm + '<div class="panel-title" style="margin-top:4px;">العدّادات الحالية</div>' + cardsHtml;
  wireSalesCounterHandlers();
}

function wireSalesCounterHandlers(){
  const typeSelect = document.getElementById('newCounterType');
  if(typeSelect) typeSelect.addEventListener('change', (e)=>{
    const field = document.getElementById('newCounterTargetField');
    if(e.target.value === 'piece'){
      field.innerHTML = `<label>المكوّن</label><select id="newCounterTarget">${STOCK_ITEMS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>`;
    } else {
      const activeProducts = MENU_ITEMS.filter(m=>m.active && !m.name.includes('(مؤرشف)'));
      field.innerHTML = `<label>المنتج</label><select id="newCounterTarget">${activeProducts.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select>`;
    }
  });

  const createBtn = document.getElementById('createCounterBtn');
  if(createBtn) createBtn.addEventListener('click', async ()=>{
    const isPiece = document.getElementById('newCounterType').value === 'piece';
    const targetId = parseInt(document.getElementById('newCounterTarget').value, 10);
    const nameInput = document.getElementById('newCounterName');
    const sinceInput = document.getElementById('newCounterSince');
    const targetName = isPiece ? STOCK_ITEMS.find(s=>s.id===targetId)?.name : MENU_ITEMS.find(m=>m.id===targetId)?.name;
    const name = nameInput.value.trim() || targetName || 'عدّاد جديد';
    const sinceIso = sinceInput.value ? new Date(sinceInput.value).toISOString() : new Date().toISOString();
    createBtn.disabled = true;
    const { error } = await window.supabaseClient.from('sales_counters').insert({
      business_id: CURRENT_PROFILE.business_id, name, count_since: sinceIso, created_by: CURRENT_PROFILE.id,
      menu_item_id: isPiece ? null : targetId, stock_item_id: isPiece ? targetId : null
    });
    createBtn.disabled = false;
    if(error){ showToast('تعذر إضافة العدّاد: ' + error.message); return; }
    logDashboardAudit('أضاف عدّاد مبيعات: ' + name);
    loadSalesCountersPanel();
  });

  document.querySelectorAll('.counter-reset-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('تصفير العدّاد يبدأ العدّ من الآن — الرقم الحالي ما ينحذف من سجل مبيعاتك، بس ما راح يظهر بهالعدّاد بعد التصفير. تأكيد؟')) return;
      const id = parseInt(btn.dataset.id, 10);
      const { error } = await window.supabaseClient.from('sales_counters').update({count_since: new Date().toISOString()}).eq('id', id);
      if(error){ showToast('تعذر التصفير: ' + error.message); return; }
      loadSalesCountersPanel();
    });
  });
  document.querySelectorAll('.counter-delete-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('حذف هذا العدّاد نهائياً؟')) return;
      const id = parseInt(btn.dataset.id, 10);
      const { error } = await window.supabaseClient.from('sales_counters').delete().eq('id', id);
      if(error){ showToast('تعذر الحذف: ' + error.message); return; }
      loadSalesCountersPanel();
    });
  });
}

/* ============ التقرير اليومي التلقائي — a real historical record, not a live
   query: every night at 00:00 (Asia/Riyadh) app/api/cron/daily-report computes
   and stores one immutable snapshot per business per day, using the exact
   same formulas as loadSalesRangeData/computeVariableCost/
   computeOrderDeliveryPlatformCost above (ported server-side since a Cron
   Trigger has no browser). This screen just lists and displays those saved
   snapshots — it never recomputes them, so a report always shows what
   actually happened that day even if costs/commissions change later. */
let DAILY_REPORTS_LIST = [];
let SELECTED_DAILY_REPORT = null;
const ARABIC_WEEKDAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const ARABIC_MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function formatDailyReportDate(dateStr){
  // dateStr is a plain 'YYYY-MM-DD' (Riyadh-local calendar date, as stored by
  // the cron) — parsed manually rather than `new Date(dateStr)` to avoid the
  // browser reinterpreting it in the viewer's own timezone and shifting a day.
  const [y,m,day] = dateStr.split('-').map(Number);
  const d = new Date(y, m-1, day);
  return `${ARABIC_WEEKDAY_NAMES[d.getDay()]} ${day} ${ARABIC_MONTH_NAMES[m-1]} ${y}`;
}

const DAILY_REPORT_SECTION_LABELS = {
  financial:'الملخص المالي (صافي الربح والتكاليف)', sales:'المبيعات', products:'المنتجات',
  delivery:'أرباح تطبيقات التوصيل', payments:'طرق الدفع', tax:'الضريبة'
};
let DAILY_REPORT_CONFIG = null;

async function loadDailyReportConfig(){
  const sb = window.supabaseClient;
  const { data } = await sb.from('businesses')
    .select('daily_report_sales, daily_report_products, daily_report_payments, daily_report_financial, daily_report_tax, daily_report_delivery')
    .eq('id', CURRENT_PROFILE.business_id).maybeSingle();
  DAILY_REPORT_CONFIG = data || {daily_report_sales:true, daily_report_products:true, daily_report_payments:true, daily_report_financial:true, daily_report_tax:true, daily_report_delivery:true};
}

function dailyReportConfigHtml(){
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-title">محتوى التقرير اليومي — اختر وش يظهر بالتقرير التلقائي</div>
      <div class="daily-report-config-grid" style="display:flex; flex-wrap:wrap; gap:14px; margin:10px 0;">
        ${Object.keys(DAILY_REPORT_SECTION_LABELS).map(key=>`
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600;">
            <input type="checkbox" class="daily-report-section-toggle" data-key="${key}" ${DAILY_REPORT_CONFIG['daily_report_'+key] !== false ? 'checked' : ''}>
            ${DAILY_REPORT_SECTION_LABELS[key]}
          </label>`).join('')}
      </div>
      <button class="settings-save-btn" id="dailyReportConfigSaveBtn" style="width:auto; padding:0 18px;">حفظ</button>
    </div>`;
}

function wireDailyReportConfigForm(){
  const btn = document.getElementById('dailyReportConfigSaveBtn');
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    const update = {};
    document.querySelectorAll('.daily-report-section-toggle').forEach(cb=>{
      update['daily_report_'+cb.dataset.key] = cb.checked;
    });
    btn.disabled = true;
    const { error } = await window.supabaseClient.from('businesses').update(update).eq('id', CURRENT_PROFILE.business_id);
    btn.disabled = false;
    if(error){ showToast('تعذر الحفظ: ' + error.message); return; }
    DAILY_REPORT_CONFIG = { ...DAILY_REPORT_CONFIG, ...update };
    showToast('تم الحفظ — يطبّق من أول تقرير قادم');
  });
}

async function loadDailyAutoReportsList(){
  const panel = document.getElementById('reportPreviewPanel');
  panel.className = 'report-preview-doc theme-' + REPORT_THEME;
  panel.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600; padding:20px 0; text-align:center;">جاري تحميل التقارير اليومية...</p>';
  const sb = window.supabaseClient;
  const [{ data }] = await Promise.all([
    sb.from('daily_reports').select('report_date, generated_at')
      .eq('business_id', CURRENT_PROFILE.business_id).order('report_date', {ascending:false}).limit(60),
    loadDailyReportConfig()
  ]);
  DAILY_REPORTS_LIST = data || [];
  if(DAILY_REPORTS_LIST.length === 0){
    panel.innerHTML = dailyReportConfigHtml() + `<div class="panel-title">التقرير اليومي التلقائي</div>
      <div class="orders-empty">لسا ما فيه تقرير محفوظ — أول تقرير يتولد تلقائياً الساعة ١٢ صباحاً (منتصف الليل) بعد أول يوم فيه مبيعات.</div>`;
    wireDailyReportConfigForm();
    return;
  }
  await selectDailyReport(DAILY_REPORTS_LIST[0].report_date);
}

async function selectDailyReport(reportDate){
  const sb = window.supabaseClient;
  const { data } = await sb.from('daily_reports').select('report_date, generated_at, data')
    .eq('business_id', CURRENT_PROFILE.business_id).eq('report_date', reportDate).maybeSingle();
  SELECTED_DAILY_REPORT = data || null;
  renderDailyAutoReportPanel();
}

function deliveryPlatformReportHtml(d){
  const rows = d.deliveryByPlatform || [];
  if(rows.length === 0) return '';
  return `
    <div class="panel-title">أرباح كل تطبيق توصيل على حدا</div>
    <table class="report-table">
      <thead><tr><th>المنصة</th><th>عدد الطلبات</th><th>إجمالي الطلبات</th><th>عمولة المنصة</th><th>رسوم التوصيل</th><th>صافي المستحق من المنصة</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${r.name}</td><td class="mono">${r.ordersCount}</td><td class="mono">${r.grossRevenue.toFixed(2)}</td>
          <td class="mono">${r.totalCommission.toFixed(2)}</td><td class="mono">${r.totalFees.toFixed(2)}</td>
          <td class="mono" style="font-weight:800;">${r.netToRestaurant.toFixed(2)}</td>
        </tr>`).join('')}
        <tr style="font-weight:800; border-top:2px solid var(--line);">
          <td>الإجمالي</td><td class="mono">${rows.reduce((s,r)=>s+r.ordersCount,0)}</td>
          <td class="mono">${rows.reduce((s,r)=>s+r.grossRevenue,0).toFixed(2)}</td>
          <td class="mono">${rows.reduce((s,r)=>s+r.totalCommission,0).toFixed(2)}</td>
          <td class="mono">${rows.reduce((s,r)=>s+r.totalFees,0).toFixed(2)}</td>
          <td class="mono">${rows.reduce((s,r)=>s+r.netToRestaurant,0).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderDailyAutoReportPanel(){
  const panel = document.getElementById('reportPreviewPanel');
  panel.className = 'report-preview-doc theme-' + REPORT_THEME;
  const datePicker = `
    <div class="panel" style="margin-bottom:14px;">
      <div class="menu-add-field" style="max-width:260px;">
        <label>اختر يوم</label>
        <select id="dailyAutoReportDateSelect">
          ${DAILY_REPORTS_LIST.map(r=>`<option value="${r.report_date}" ${SELECTED_DAILY_REPORT && SELECTED_DAILY_REPORT.report_date===r.report_date?'selected':''}>${formatDailyReportDate(r.report_date)}</option>`).join('')}
        </select>
      </div>
    </div>`;
  if(!SELECTED_DAILY_REPORT){ panel.innerHTML = dailyReportConfigHtml() + datePicker + '<div class="orders-empty">اختر يوماً لعرض تقريره</div>'; wireDailyReportConfigForm(); return; }

  const d = SELECTED_DAILY_REPORT.data;
  const sections = d.sections || {sales:true, products:true, payments:true, financial:true, tax:true, delivery:true};
  const dayLabel = formatDailyReportDate(SELECTED_DAILY_REPORT.report_date);
  let body = `<div class="panel-title" style="font-size:16px; font-weight:900;">التقرير اليومي — ${dayLabel}</div>`;
  if(sections.financial !== false) body += financialReportHtml(d);
  if(sections.sales !== false) body += salesReportHtml(d);
  if(sections.products !== false) body += productsReportHtml(d);
  if(sections.delivery !== false) body += deliveryPlatformReportHtml(d);
  if(sections.payments !== false) body += paymentsReportHtml(d);
  if(sections.tax !== false) body += taxReportHtml(d);

  panel.innerHTML = dailyReportConfigHtml() + datePicker + reportDocHeaderHtml() + body
    + `<div style="margin-top:16px; display:flex; justify-content:flex-end;"><button class="settings-save-btn" id="dailyAutoReportPrintBtn" style="width:auto; padding:0 20px;">طباعة / حفظ PDF</button></div>`;

  wireDailyReportConfigForm();
  document.getElementById('dailyAutoReportDateSelect').addEventListener('change', (e)=> selectDailyReport(e.target.value));
  document.getElementById('dailyAutoReportPrintBtn').addEventListener('click', ()=> printDailyAutoReport(dayLabel, body));
}

// Reuses the exact same .print-report-root letterhead/CSS as the on-demand
// report exporter (renderPrintReport) — the header/title look identical,
// this just injects the already-rendered multi-section body directly instead
// of forcing several tables into the single-table ReportPayload shape.
function printDailyAutoReport(dayLabel, bodyHtml){
  const existing = document.getElementById('printReportRoot');
  if(existing) existing.remove();
  const root = document.createElement('div');
  root.className = 'print-report-root theme-' + REPORT_THEME;
  root.id = 'printReportRoot';
  const logoHtml = BUSINESS_LOGO_URL
    ? `<img src="${escapeHtml(BUSINESS_LOGO_URL)}" class="print-report-logo" crossorigin="anonymous">`
    : `<div class="print-report-logo-fallback">${escapeHtml((RESTAURANT_INFO.name||'؟').trim().charAt(0))}</div>`;
  const now = new Date();
  const genAt = now.toLocaleDateString('ar-SA', {year:'numeric', month:'long', day:'numeric'}) + ' — ' + now.toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
  root.innerHTML = `
    <button class="print-report-close-btn" id="printReportCloseBtn">✕ إغلاق</button>
    <div class="print-report-header">
      <div class="print-report-brand">
        ${logoHtml}
        <div>
          <div class="print-report-brand-name">${escapeHtml(RESTAURANT_INFO.name||'')}</div>
          <div class="print-report-brand-sub">مصدّر بواسطة نظام ركين — تقرير يومي تلقائي</div>
        </div>
      </div>
      <div class="print-report-meta">تاريخ الإصدار<br>${escapeHtml(genAt)}</div>
    </div>
    <div class="print-report-title">التقرير اليومي — ${escapeHtml(dayLabel)}</div>
    <div class="print-report-daily-body">${bodyHtml}</div>
    <div class="print-report-footer">تقرير مُصدر من نظام ركين لإدارة المطاعم</div>
  `;
  document.body.appendChild(root);
  document.getElementById('printReportCloseBtn').addEventListener('click', ()=> root.remove());
  const img = root.querySelector('.print-report-logo');
  const doPrint = ()=> window.print();
  if(img && !img.complete){ img.addEventListener('load', doPrint, {once:true}); img.addEventListener('error', doPrint, {once:true}); }
  else setTimeout(doPrint, 50);
  const cleanup = ()=>{ if(document.body.contains(root)) root.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
}

document.getElementById('reportRangePresets').addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  document.querySelectorAll('#reportRangePresets button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  REPORT_RANGE = salesRangeBounds(b.dataset.preset);
  REPORT_RANGE_LABEL = b.textContent;
  document.getElementById('reportRangeFrom').value = '';
  document.getElementById('reportRangeTo').value = '';
  refreshReportData();
});
document.getElementById('reportRangeApplyBtn').addEventListener('click', ()=>{
  const fromVal = document.getElementById('reportRangeFrom').value;
  const toVal = document.getElementById('reportRangeTo').value;
  if(!fromVal || !toVal){ showToast('اختر تاريخ البداية والنهاية'); return; }
  const from = new Date(fromVal + 'T00:00:00');
  const to = new Date(toVal + 'T00:00:00'); to.setDate(to.getDate()+1);
  if(from >= to){ showToast('تاريخ البداية لازم يكون قبل النهاية'); return; }
  REPORT_RANGE = {from, to};
  REPORT_RANGE_LABEL = fromVal === toVal ? dateInputValue(from) : (fromVal + ' – ' + toVal);
  document.querySelectorAll('#reportRangePresets button').forEach(x=>x.classList.remove('active'));
  refreshReportData();
});

async function loadReportDetailRows(type, from, to){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  if(type === 'purchases'){
    const { data } = await sb.from('purchase_invoices')
      .select('qty, unit, total_cost, invoiced_at, stock_items(name), suppliers(name)')
      .eq('business_id', businessId).gte('invoiced_at', from.toISOString()).lt('invoiced_at', to.toISOString())
      .order('invoiced_at', {ascending:false});
    return (data||[]).map(i=>({
      stockItem: i.stock_items ? i.stock_items.name : '—', supplier: i.suppliers ? i.suppliers.name : '—',
      qty: Number(i.qty), unit: UNIT_LABELS[i.unit]||i.unit, totalCost: Number(i.total_cost), date: i.invoiced_at
    }));
  }
  if(type === 'expenses'){
    const { data } = await sb.from('general_expenses')
      .select('amount, description, spent_at, expense_categories(name)')
      .eq('business_id', businessId).gte('spent_at', from.toISOString()).lt('spent_at', to.toISOString())
      .order('spent_at', {ascending:false});
    return (data||[]).map(e=>({
      category: e.expense_categories ? e.expense_categories.name : '—', amount: Number(e.amount),
      description: e.description||'', date: e.spent_at
    }));
  }
  if(type === 'shift'){
    const { data } = await sb.from('shifts')
      .select('id, opening_cash, closing_cash, opened_at, closed_at, profiles(full_name)')
      .eq('business_id', businessId).gte('opened_at', from.toISOString()).lt('opened_at', to.toISOString())
      .order('opened_at', {ascending:false});
    const salesByShift = (REPORT_RANGE_DATA && REPORT_RANGE_DATA.salesByShift) || {};
    return (data||[]).map(s=>({
      id: s.id, cashier: s.profiles ? s.profiles.full_name : '—',
      openedAt: s.opened_at, closedAt: s.closed_at,
      openingCash: Number(s.opening_cash), closingCash: s.closing_cash!=null ? Number(s.closing_cash) : null,
      sales: salesByShift[s.id] || 0
    }));
  }
  return [];
}

// Input-VAT aggregate for the "الإقرار الضريبي" report — only purchase_invoices
// (ingredient/stock purchases), not general_expenses (which category is
// actually blocked from input-VAT recovery isn't reliably ascertainable
// here, so this pass deliberately doesn't guess at it — see the report's own
// disclaimer text). Only counts rows whose supplier is VAT-registered — an
// unregistered supplier's invoice isn't a valid tax invoice for reclaim
// purposes even if a VAT figure was typed in for it.
let VAT_RETURN_INPUT_DATA = null;
async function loadVatReturnInputData(from, to){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const { data } = await sb.from('purchase_invoices')
    .select('total_cost, vat_amount, invoiced_at, suppliers(vat_registered)')
    .eq('business_id', businessId).gte('invoiced_at', from.toISOString()).lt('invoiced_at', to.toISOString());
  const rows = data || [];
  const qualifying = rows.filter(r => r.suppliers && r.suppliers.vat_registered !== false);
  const inputVat = qualifying.reduce((s, r) => s + Number(r.vat_amount || 0), 0);
  const qualifyingPurchasesExclBase = qualifying.reduce((s, r) => s + (Number(r.total_cost||0) - Number(r.vat_amount||0)), 0);
  return { inputVat, qualifyingPurchasesExclBase };
}

function vatReturnReportHtml(d, inputData){
  const outputVat = d.vat || 0;
  const inputVat = (inputData && inputData.inputVat) || 0;
  const netVat = outputVat - inputVat;
  return `
    <div class="panel-title">الإقرار الضريبي (VAT Return) — ${REPORT_RANGE_LABEL}</div>
    <div class="report-stat-row"><span>ضريبة المخرجات (على المبيعات)</span><span class="mono">${outputVat.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>ضريبة المدخلات (على مشتريات المخزون من موردين مسجّلين بالضريبة)</span><span class="mono">${inputVat.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row total"><span>${netVat >= 0 ? 'صافي الضريبة المستحقة لهيئة الزكاة والضريبة والجمارك' : 'صافي الضريبة القابلة للاسترداد'}</span><span class="mono">${Math.abs(netVat).toFixed(2)} ر.س</span></div>
    <p class="stock-qty-helper" style="margin-top:10px;">ملاحظة: هذا الرقم لا يشمل ضريبة المدخلات على المصاريف العامة (إيجار، تسويق، رواتب...) — راجعها مع محاسبك لو تبي تحتسبها ضمن الاسترداد. المشتريات من موردين غير مسجّلين بالضريبة غير محتسبة ضمن ضريبة المدخلات لأنها غير قابلة للاسترداد نظامًا.</p>
  `;
}

async function refreshReportData(){
  const panel = document.getElementById('reportPreviewPanel');
  panel.innerHTML = '<p style="font-size:12.5px; color:var(--muted); font-weight:600; padding:20px 0; text-align:center;">جاري تحميل التقرير...</p>';
  REPORT_RANGE_DATA = await loadSalesRangeData(REPORT_RANGE.from, REPORT_RANGE.to);
  REPORT_DETAIL_ROWS = REPORT_TYPES_NEEDING_DETAIL[activeReportType]
    ? await loadReportDetailRows(activeReportType, REPORT_RANGE.from, REPORT_RANGE.to)
    : null;
  VAT_RETURN_INPUT_DATA = activeReportType === 'vat_return'
    ? await loadVatReturnInputData(REPORT_RANGE.from, REPORT_RANGE.to)
    : null;
  renderReportPreview();
}

// The on-screen preview wears the exact same letterhead as the printed/
// emailed report (logo, business name, generated-at timestamp) — not just
// for polish, but so "شوف التقرير كيف بيصير" is answered honestly: what's
// on screen really is what gets exported, not a stripped-down approximation.
function reportDocHeaderHtml(){
  const businessName = RESTAURANT_INFO.name || '';
  const logoHtml = BUSINESS_LOGO_URL
    ? `<img src="${BUSINESS_LOGO_URL}" class="report-doc-logo" crossorigin="anonymous">`
    : `<div class="report-doc-logo-fallback">${businessName.trim().charAt(0) || '؟'}</div>`;
  const now = new Date();
  const genAt = now.toLocaleDateString('ar-SA', {year:'numeric', month:'long', day:'numeric'}) + ' — ' + now.toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
  return `
    <div class="report-doc-header">
      <div class="report-doc-brand">
        ${logoHtml}
        <div>
          <div class="report-doc-brand-name">${businessName}</div>
          <div class="report-doc-brand-sub">معاينة حية — نفس الشكل بالضبط عند التصدير</div>
        </div>
      </div>
      <div class="report-doc-meta">${genAt}</div>
    </div>`;
}

function renderReportPreview(){
  const panel = document.getElementById('reportPreviewPanel');
  const d = REPORT_RANGE_DATA;
  if(!d) return;
  let body = '';
  if(activeReportType === 'sales') body = salesReportHtml(d);
  else if(activeReportType === 'products') body = productsReportHtml(d);
  else if(activeReportType === 'payments') body = paymentsReportHtml(d);
  else if(activeReportType === 'financial') body = financialReportHtml(d);
  else if(activeReportType === 'shift') body = shiftReportHtml(REPORT_DETAIL_ROWS||[]);
  else if(activeReportType === 'tax') body = taxReportHtml(d);
  else if(activeReportType === 'vat_return') body = vatReturnReportHtml(d, VAT_RETURN_INPUT_DATA);
  else if(activeReportType === 'purchases') body = purchasesReportHtml(REPORT_DETAIL_ROWS||[]);
  else if(activeReportType === 'expenses') body = expensesReportHtml(REPORT_DETAIL_ROWS||[]);
  panel.className = 'report-preview-doc theme-' + REPORT_THEME;
  panel.innerHTML = reportDocHeaderHtml() + body;
  wireReportTableViewToggle(panel);
}

// Mobile shows cards by default (.report-cards-mobile, CSS-hidden on
// desktop where the real table already fits); "عرض كجدول" is the explicit
// escape hatch for export/audit/reconciliation use cases, opening the
// *same* .report-table node — cloned verbatim, no separate table-building
// logic — in a full-screen overlay where horizontal scroll is expected.
function wireReportTableViewToggle(panel){
  const existingBtn = document.getElementById('reportViewTableBtn');
  if(existingBtn) existingBtn.remove();
  const table = panel.querySelector('.report-table');
  if(!table) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'reportViewTableBtn';
  btn.className = 'report-view-table-btn';
  btn.textContent = 'عرض كجدول';
  table.insertAdjacentElement('beforebegin', btn);
  btn.addEventListener('click', ()=> openReportTableOverlay(table));
}

function openReportTableOverlay(tableEl){
  let overlay = document.getElementById('reportTableOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'reportTableOverlay';
    overlay.className = 'report-table-overlay';
    overlay.innerHTML = `
      <div class="report-table-overlay-header">
        <span>عرض كجدول</span>
        <button type="button" class="tdp-close" id="reportTableOverlayClose">✕</button>
      </div>
      <div class="report-table-overlay-body"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#reportTableOverlayClose').addEventListener('click', ()=>{
      overlay.classList.remove('show');
    });
  }
  const body = overlay.querySelector('.report-table-overlay-body');
  body.innerHTML = '';
  body.appendChild(tableEl.cloneNode(true));
  overlay.classList.add('show');
}

function salesReportHtml(d){
  return `
    <div class="panel-title">تقرير المبيعات — ${REPORT_RANGE_LABEL}</div>
    <div class="report-stat-row"><span>صافي المبيعات</span><span class="mono">${d.netSales.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>عدد الطلبات</span><span class="mono">${d.ordersCount}</span></div>
    <div class="report-stat-row"><span>متوسط الفاتورة</span><span class="mono">${d.avgTicket.toFixed(2)} ر.س</span></div>
    <div class="report-subtitle">حسب نوع الطلب</div>
    ${d.channelPerf.length === 0 ? '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>' : d.channelPerf.map(c=>`
      <div class="report-breakdown-row">
        <span class="report-breakdown-label">${c.name}</span>
        <div class="report-breakdown-track"><div class="report-breakdown-fill" style="width:${d.netSales>0 ? (c.revenue/d.netSales*100).toFixed(1) : 0}%"></div></div>
        <span class="report-breakdown-value">${c.orders} طلب — ${c.revenue.toFixed(2)} ر.س</span>
      </div>`).join('')}
  `;
}

function productsReportCardsHtml(sorted){
  return sorted.map(p=>`
    <div class="report-item-card">
      <div class="ric-title">${p.name}</div>
      <div class="ric-row"><span class="ric-label">التصنيف</span><span>${p.cat}</span></div>
      <div class="ric-row"><span class="ric-label">الكمية</span><span class="mono">${p.qty}</span></div>
      <div class="ric-row total"><span class="ric-label">الإيرادات</span><span class="mono">${p.revenue.toFixed(2)} ر.س</span></div>
    </div>`).join('');
}
function productsReportHtml(d){
  const sorted = [...d.sellers].sort((a,b)=>b.revenue-a.revenue);
  return `
    <div class="panel-title">تقرير المنتجات — ${REPORT_RANGE_LABEL}</div>
    ${sorted.length === 0 ? '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>' : `
    <div class="report-cards-mobile">${productsReportCardsHtml(sorted)}</div>
    <table class="report-table">
      <thead><tr><th>المنتج</th><th>التصنيف</th><th>الكمية</th><th>الإيرادات</th></tr></thead>
      <tbody>
        ${sorted.map(p=>`<tr>
          <td>${p.name}</td><td>${p.cat}</td><td class="mono">${p.qty}</td><td class="mono">${p.revenue.toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`}
  `;
}

function paymentsReportHtml(d){
  return `
    <div class="panel-title">طرق الدفع — ${REPORT_RANGE_LABEL}</div>
    ${d.paymentBreakdown.length === 0 ? '<div class="orders-empty">ما فيه مبيعات بهالفترة</div>' : d.paymentBreakdown.map(p=>`
      <div class="report-breakdown-row">
        <span class="report-breakdown-label">${p.name}</span>
        <div class="report-breakdown-track"><div class="report-breakdown-fill" style="width:${d.netSales>0 ? (p.amount/d.netSales*100).toFixed(0) : 0}%"></div></div>
        <span class="report-breakdown-value">${p.amount.toFixed(2)} ر.س — ${d.netSales>0 ? (p.amount/d.netSales*100).toFixed(0) : 0}٪</span>
      </div>`).join('')}
  `;
}

function financialReportHtml(d){
  return `
    <div class="panel-title">الملخص المالي الكامل — ${REPORT_RANGE_LABEL}</div>
    <div class="report-stat-row"><span>الإيراد قبل الخصومات</span><span class="mono">${d.revenue.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>الخصومات</span><span class="mono">${d.discounts.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>صافي المبيعات (شامل الضريبة)</span><span class="mono">${d.netSales.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>ضريبة القيمة المضافة</span><span class="mono">${d.vat.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>تكلفة البضاعة المباعة</span><span class="mono">${d.cogs.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>عمولات ورسوم تطبيقات التوصيل</span><span class="mono">${(d.deliveryPlatformCost||0).toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>مجمل الربح</span><span class="mono">${d.grossProfit.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>المصاريف التشغيلية</span><span class="mono">${d.opex.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row total"><span>صافي الربح</span><span class="mono">${d.netProfit.toFixed(2)} ر.س</span></div>
  `;
}

function taxReportHtml(d){
  return `
    <div class="panel-title">تقرير الضريبة (VAT) — ${REPORT_RANGE_LABEL}</div>
    <div class="report-stat-row"><span>صافي المبيعات قبل الضريبة</span><span class="mono">${d.subtotal.toFixed(2)} ر.س</span></div>
    <div class="report-stat-row"><span>عدد الطلبات</span><span class="mono">${d.ordersCount}</span></div>
    <div class="report-stat-row total"><span>ضريبة القيمة المضافة المحصّلة (١٥٪)</span><span class="mono">${d.vat.toFixed(2)} ر.س</span></div>
    <p class="stock-qty-helper" style="margin-top:10px;">جاهز تسلّمه لمحاسبك مباشرة — يطابق نفس أرقام صافي المبيعات بالملخص المالي.</p>
  `;
}

function purchasesReportCardsHtml(rows){
  return rows.map(r=>`
    <div class="report-item-card">
      <div class="ric-title">${escapeHtml(r.stockItem)}</div>
      <div class="ric-row"><span class="ric-label">المورّد</span><span>${escapeHtml(r.supplier)}</span></div>
      <div class="ric-row"><span class="ric-label">الكمية</span><span class="mono">${r.qty} ${escapeHtml(r.unit)}</span></div>
      <div class="ric-row total"><span class="ric-label">التكلفة</span><span class="mono">${r.totalCost.toFixed(2)} ر.س</span></div>
    </div>`).join('');
}
function purchasesReportHtml(rows){
  const total = rows.reduce((s,r)=>s+r.totalCost,0);
  return `
    <div class="panel-title">تقرير المشتريات — ${REPORT_RANGE_LABEL}</div>
    ${rows.length === 0 ? '<div class="orders-empty">ما فيه فواتير شراء مسجّلة بهالفترة</div>' : `
    <div class="report-cards-mobile">${purchasesReportCardsHtml(rows)}</div>
    <table class="report-table">
      <thead><tr><th>الصنف</th><th>المورّد</th><th>الكمية</th><th>التكلفة</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${escapeHtml(r.stockItem)}</td><td>${escapeHtml(r.supplier)}</td><td class="mono">${r.qty} ${escapeHtml(r.unit)}</td><td class="mono">${r.totalCost.toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="report-stat-row total" style="margin-top:10px;"><span>إجمالي المشتريات</span><span class="mono">${total.toFixed(2)} ر.س</span></div>`}
  `;
}

function expensesReportCardsHtml(rows){
  return rows.map(r=>`
    <div class="report-item-card">
      <div class="ric-title">${r.category}</div>
      ${r.description ? `<div class="ric-row"><span class="ric-label">الوصف</span><span>${r.description}</span></div>` : ''}
      <div class="ric-row total"><span class="ric-label">المبلغ</span><span class="mono">${r.amount.toFixed(2)} ر.س</span></div>
    </div>`).join('');
}
function expensesReportHtml(rows){
  const total = rows.reduce((s,r)=>s+r.amount,0);
  return `
    <div class="panel-title">تقرير المصاريف — ${REPORT_RANGE_LABEL}</div>
    ${rows.length === 0 ? '<div class="orders-empty">ما فيه مصاريف مسجّلة بهالفترة</div>' : `
    <div class="report-cards-mobile">${expensesReportCardsHtml(rows)}</div>
    <table class="report-table">
      <thead><tr><th>التصنيف</th><th>الوصف</th><th>المبلغ</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${r.category}</td><td>${r.description||'—'}</td><td class="mono">${r.amount.toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="report-stat-row total" style="margin-top:10px;"><span>إجمالي المصاريف</span><span class="mono">${total.toFixed(2)} ر.س</span></div>`}
  `;
}

function shiftReportCardsHtml(rows){
  return rows.map(r=>{
    const expectedCash = r.openingCash + r.sales;
    const diff = r.closingCash!=null ? r.closingCash - expectedCash : null;
    const opened = new Date(r.openedAt).toLocaleString('ar-SA', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    const diffColor = diff!=null && Math.abs(diff)>0.01 ? 'color:var(--danger,#a3402c); font-weight:800;' : '';
    return `
    <div class="report-item-card">
      <div class="ric-title">${r.cashier}</div>
      <div class="ric-row"><span class="ric-label">الفتح</span><span class="mono">${opened}</span></div>
      <div class="ric-row"><span class="ric-label">المبيعات</span><span class="mono">${r.sales.toFixed(2)}</span></div>
      <div class="ric-row"><span class="ric-label">الكاش المتوقع</span><span class="mono">${expectedCash.toFixed(2)}</span></div>
      <div class="ric-row"><span class="ric-label">الكاش الفعلي</span><span class="mono">${r.closingCash!=null ? r.closingCash.toFixed(2) : '—'}</span></div>
      <div class="ric-row total"><span class="ric-label">الفرق</span><span class="mono" style="${diffColor}">${diff!=null ? diff.toFixed(2) : '—'}</span></div>
    </div>`;
  }).join('');
}
function shiftReportHtml(rows){
  return `
    <div class="panel-title">تقرير إغلاق الورديات — ${REPORT_RANGE_LABEL}</div>
    ${rows.length === 0 ? '<div class="orders-empty">ما فيه ورديات بهالفترة</div>' : `
    <div class="report-cards-mobile">${shiftReportCardsHtml(rows)}</div>
    <table class="report-table">
      <thead><tr><th>الكاشير</th><th>الفتح</th><th>المبيعات</th><th>الكاش المتوقع</th><th>الكاش الفعلي</th><th>الفرق</th></tr></thead>
      <tbody>
        ${rows.map(r=>{
          const expectedCash = r.openingCash + r.sales;
          const diff = r.closingCash!=null ? r.closingCash - expectedCash : null;
          const opened = new Date(r.openedAt).toLocaleString('ar-SA', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
          return `<tr>
            <td>${r.cashier}</td><td>${opened}</td><td class="mono">${r.sales.toFixed(2)}</td>
            <td class="mono">${expectedCash.toFixed(2)}</td>
            <td class="mono">${r.closingCash!=null ? r.closingCash.toFixed(2) : '—'}</td>
            <td class="mono" style="${diff!=null && Math.abs(diff)>0.01 ? 'color:var(--danger,#a3402c); font-weight:800;' : ''}">${diff!=null ? diff.toFixed(2) : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`}
  `;
}

/* ============ Delivery Platforms — same profit formula as the landing page's live comparison tool
   (price - commission - VAT - packaging - food cost), applied to today's real average delivery
   order value from CHANNEL_PERF and the real food-cost % from Inventory. Commission rates are the
   exact ones already shown on the landing page. */
const DELIVERY_PLATFORM_RATES = [
  {name:'هنقرستيشن', rate:0.30}, {name:'جاهز', rate:0.28}, {name:'ذا شفز', rate:0.27},
  {name:'كيتا', rate:0.25}, {name:'نينجا', rate:0.22}
];
function computeDeliveryProfits(){
  const deliveryChannel = CHANNEL_PERF.find(c=>c.name==='توصيل');
  if(!deliveryChannel || !deliveryChannel.orders) return null;
  const avgOrder = deliveryChannel.revenue / deliveryChannel.orders;
  const estCost = avgOrder * ((realFoodCostPct() ?? FOOD_COST_STATS.pct)/100);
  const packaging = 3;
  const results = DELIVERY_PLATFORM_RATES.map(p=>{
    const commission = avgOrder * p.rate;
    const vat = avgOrder * 0.15;
    const profitPerOrder = avgOrder - commission - vat - packaging - estCost;
    const monthlyProjection = profitPerOrder * deliveryChannel.orders * 30;
    return {...p, profitPerOrder, monthlyProjection};
  }).sort((a,b)=>b.profitPerOrder-a.profitPerOrder);
  return {results, avgOrder, deliveryChannel};
}
function renderDeliveryPlatforms(){
  const computed = computeDeliveryProfits();
  if(!computed){
    document.getElementById('deliveryContext').innerHTML = 'ما فيه طلبات توصيل مسجّلة اليوم بعد — المقارنة بين المنصات بتظهر أول ما يوصلك طلب توصيل حقيقي.';
    document.getElementById('platformProfitList').innerHTML = '';
    document.getElementById('deliveryDecisionCard').innerHTML = '';
    return;
  }
  const {results, avgOrder, deliveryChannel} = computed;
  document.getElementById('deliveryContext').innerHTML =
    `اليوم عندك <b>${deliveryChannel.orders}</b> طلب توصيل بمتوسط <b>${avgOrder.toFixed(2)} ر.س</b> للطلب. المقارنة تحسب ربحك الفعلي بعد العمولة والضريبة والتغليف وتكلفة الطعام لو كل الطلبات راحت على نفس المنصة.`;
  const maxProfit = Math.max(...results.map(p=>p.profitPerOrder), 0.01);
  const crownIcon = '<path d="M12 2 15 8.5 21 9.5 16.5 14 17.7 20.5 12 17.3 6.3 20.5 7.5 14 3 9.5 9 8.5z"/>';
  document.getElementById('platformProfitList').innerHTML = results.map((p,i)=>{
    const barPct = Math.max(0, Math.round((p.profitPerOrder/maxProfit)*100));
    return `
    <div class="pp-row ${i===0?'best':''}">
      <div class="pp-bar" style="width:${barPct}%"></div>
      <div class="pp-rank">${i===0?`<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">${crownIcon}</svg>`:i+1}</div>
      <div class="pp-info"><div class="pp-name">${p.name}</div><div class="pp-meta">عمولة ${(p.rate*100).toFixed(0)}٪</div></div>
      <div class="pp-figures">
        <div class="pp-per-order">${p.profitPerOrder.toFixed(2)} ر.س/طلب</div>
        <div class="pp-monthly">لو كل طلباتك عليها: ${p.monthlyProjection.toFixed(0)} ر.س/شهر</div>
      </div>
    </div>`;
  }).join('');

  const best = results[0], worst = results[results.length-1];
  const monthlyDiff = (best.profitPerOrder - worst.profitPerOrder) * deliveryChannel.orders * 30;
  document.getElementById('deliveryDecisionCard').innerHTML = `
    <div class="decision-card">
      <div class="decision-what">لو ركّزت طلبات التوصيل أكثر على ${best.name} بدل ${worst.name}، ممكن تربح حوالي <b>${monthlyDiff.toFixed(0)} ر.س إضافية شهريًا</b>.</div>
      <div class="decision-why">الفرق مبني على متوسط قيمة طلب التوصيل الحالي (${avgOrder.toFixed(2)} ر.س) وعدد طلبات اليوم (${deliveryChannel.orders}) — راجع اتفاقك الفعلي مع كل منصة قبل القرار.</div>
    </div>`;
}

/* ============ AI Advisor — every answer is computed from real, already-established data.
   No answer here invents a number that doesn't exist elsewhere in the dashboard. */

// for a low/critical stock item, finds the menu item(s) that use it and
// estimates how many more servings it can still make — real recipe-based
// coverage, not a hand-typed "يكفي X" string (that field was dropped when the
// dashboard went real: see the Phase 1 migration notes on stock_items.duration).
function stockCoverage(stockItem){
  const usedIn = MENU_ITEMS.filter(m => m.active !== false && (m.recipe||[]).some(r=>r.ingredient === stockItem.name));
  let best = null;
  usedIn.forEach(m=>{
    const line = m.recipe.find(r=>r.ingredient === stockItem.name);
    if(!line || !(line.qty > 0)) return;
    const neededInStockUnit = convertToUnit(line.qty, line.unit, stockItem.unit);
    if(!(neededInStockUnit > 0)) return;
    const servings = Math.max(0, Math.floor(stockItem.qtyOnHand / neededInStockUnit));
    if(!best || servings < best.servings) best = {name: m.name, servings};
  });
  return best;
}

const AI_QA = [
  {q:'كيف أزيد الأرباح؟', a: ()=>{
    const items = computeRealAttentionItems();
    if(items.length > 0) return items.map(i=>'• '+i.text+(i.sub?' — '+i.sub:'')).join('<br>');
    return 'ما فيه شي حرج يحتاج تصليح الحين — ركّز على زيادة متوسط الفاتورة أو تسويق أوقات الذروة.';
  }},
  {q:'كم مبيعاتي اليوم؟', a: ()=>
    TODAY.ordersCount > 0
      ? `مبيعاتك اليوم ${TODAY.netSales.toFixed(2)} ر.س من ${TODAY.ordersCount} طلب، بمتوسط فاتورة ${TODAY.avgTicket.toFixed(2)} ر.س.`
      : 'ما فيه مبيعات مسجّلة اليوم بعد.'
  },
  {q:'ليش أرباحي نزلت هالأسبوع؟', a: ()=>{
    const delta = TODAY.netSales - YESTERDAY.netSales;
    const items = computeRealAttentionItems();
    const warnText = items.length ? items[0].text + (items[0].sub ? ' — ' + items[0].sub : '') : '';
    return delta >= 0
      ? `مبيعاتك اليوم (${TODAY.netSales.toFixed(2)} ر.س) فعليًا أعلى من أمس (${YESTERDAY.netSales.toFixed(2)} ر.س) — ما فيه انخفاض حاليًا.${warnText ? ' بس عندك تنبيه يستاهل انتباه: ' + warnText : ''}`
      : `مبيعاتك اليوم أقل من أمس بـ${Math.abs(delta).toFixed(2)} ر.س.${warnText ? ' تنبيه مرتبط: ' + warnText : ''}`;
  }},
  {q:'وش أكثر منتج يحقق ربح؟', a: ()=>{
    if(!TODAY.topProducts || TODAY.topProducts.length === 0) return 'ما فيه مبيعات مسجّلة اليوم بعد.';
    const top = [...TODAY.topProducts].sort((a,b)=>b.revenue-a.revenue)[0];
    return `${top.name} — باع ${top.qty} قطعة وحقق ${top.revenue.toFixed(2)} ر.س اليوم، وهو الأعلى مبيعًا حاليًا.`;
  }},
  {q:'متى وقت الذروة عندي؟', a: ()=>{
    if(HOURLY_SALES.length === 0) return 'ما فيه مبيعات مسجّلة اليوم بعد لتحديد وقت الذروة.';
    const peak = HOURLY_SALES.reduce((a,b)=> b.revenue>a.revenue?b:a);
    return `الساعة ${peak.hour}:00 هي أعلى ساعة مبيعات اليوم — ${peak.revenue.toFixed(2)} ر.س و${peak.orders} طلب.`;
  }},
  {q:'كيف حال المخزون؟', a: ()=>{
    const critical = STOCK_ITEMS
      .map(s=>({...s, tier: computeStockTier(s.parLevel>0 ? (s.qtyOnHand/s.parLevel*100) : 100)}))
      .filter(s=> s.tier==='critical' || s.tier==='warn');
    if(critical.length === 0) return 'المخزون بحالة جيدة، ما فيه أصناف حرجة حاليًا.';
    return critical.map(s=>{
      const level = s.tier==='critical' ? 'حرج' : 'منخفض';
      const qtyText = `${s.qtyOnHand} ${UNIT_LABELS[s.unit]||s.unit}`;
      const coverage = stockCoverage(s);
      return coverage
        ? `• ${s.name}: ${level} (${qtyText}) — يكفي تقريبًا ${coverage.servings} من "${coverage.name}"`
        : `• ${s.name}: ${level} (${qtyText})`;
    }).join('<br>');
  }},
  {q:'مين أفضل موظف اليوم؟', a: ()=>{
    if(STAFF_STATS.length === 0) return 'ما فيه موظفو كاشير مضافين بعد.';
    const top = [...STAFF_STATS].sort((a,b)=>b.sales-a.sales)[0];
    return top.sales > 0
      ? `${top.name} — حقق ${top.sales.toFixed(2)} ر.س مبيعات من ${top.orders} طلب اليوم.`
      : 'ما فيه مبيعات مسجّلة اليوم بعد.';
  }}
];
function aiFindAnswer(text){
  const q = text.trim();
  if(!q) return null;
  const safeAnswer = (item)=>{
    try { return item.a(); }
    catch(err){ console.error('AI advisor answer failed', item.q, err); return 'صار خطأ وأنا أجهّز الإجابة — جرّب مرة ثانية.'; }
  };
  const exact = AI_QA.find(item=>item.q === q);
  if(exact) return safeAnswer(exact);
  const fuzzy = AI_QA.find(item=> q.includes(item.q.replace('؟','')) || item.q.includes(q));
  return fuzzy ? safeAnswer(fuzzy) : null;
}
function aiAddMessage(text, sender){
  const el = document.createElement('div');
  el.className = 'ai-msg ' + sender;
  el.innerHTML = text;
  document.getElementById('aiConversation').appendChild(el);
  document.getElementById('aiConversation').scrollTop = 9999;
}
function aiAsk(text){
  aiAddMessage(text, 'user');
  const answer = aiFindAnswer(text);
  setTimeout(()=>{
    aiAddMessage(answer || 'هذا السؤال يحتاج تطوير أكثر حاليًا — جرّب أحد الأسئلة المقترحة فوق، أو أعد صياغة سؤالك.', 'bot');
  }, 300);
}
function renderAiSuggestions(){
  document.getElementById('aiSuggestedQuestions').innerHTML = AI_QA.map(item=>
    `<button class="ai-suggest-chip" data-q="${item.q}">${item.q}</button>`
  ).join('');
  document.querySelectorAll('.ai-suggest-chip').forEach(chip=>{
    chip.addEventListener('click', ()=> aiAsk(chip.dataset.q));
  });
}
document.getElementById('aiSendBtn').addEventListener('click', ()=>{
  const input = document.getElementById('aiInput');
  if(!input.value.trim()) return;
  aiAsk(input.value.trim());
  input.value = '';
});
document.getElementById('aiInput').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') document.getElementById('aiSendBtn').click();
});

/* ============ Settings: Restaurant identity + Menu management ============ */
let activeSettingsTab = 'restaurant';
document.getElementById('settingsTabs').addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  document.querySelectorAll('#settingsTabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  activeSettingsTab = b.dataset.tab;
  renderSettingsPanel();
});

const RESTAURANT_INFO = {name:''};
let BUSINESS_LOGO_URL = null;
// Was hardcoded (KSA_STANDARD_VAT_RATE, 0.15) directly inside the invoice-
// scan arithmetic validation — if Saudi VAT ever changes, every invoice
// would fail local/text-tier reconciliation and get needlessly escalated
// to the most expensive vision tier. Loaded from businesses.vat_rate in
// loadBusinessData(); 0.15 here is only the pre-load default.
let BUSINESS_VAT_RATE = 0.15;
// businesses.prices_include_vat — default true matches the KSA legal
// requirement that displayed menu prices already include tax.
let PRICES_INCLUDE_VAT = true;
let VAT_REGISTERED = true; // businesses.vat_registered — off means no VAT anywhere, not just a hidden field
let BUSINESS_VAT_NUMBER = '';
let RECEIPT_CUSTOM_MESSAGE = '';
let DINE_IN_ENABLED = true;
let ONLINE_ORDERING_ENABLED = false;
let ONLINE_MENU_SLUG = null;
let ONLINE_THEME_COLOR = '#C7FF4D';
let ONLINE_BANNER_URL = '';
let ONLINE_OFFERS_DELIVERY = true;
let ONLINE_OFFERS_PICKUP = true;
let ONLINE_DELIVERY_FEE = 0;
let ONLINE_PICKUP_PREP_MINUTES = 20;
let ONLINE_CONTACT_WHATSAPP = '';
let ONLINE_ORDER_FREE_COUNT = 0;
let ONLINE_SUBSCRIBED = false;
let ONLINE_ORDER_FREE_LIMIT = 350;
let GEIDEA_CONNECTED = false;
let GEIDEA_PUBLIC_KEY_LAST4 = '';
let INVENTORY_ENABLED = true;
let BUSINESS_TYPE = 'restaurant';
let ONLINE_BOOKING_ENABLED = false;
// Which business types share the services/service_staff booking engine —
// mirrors SERVICE_BUSINESS_TYPES in public/pos/rakeen-pos.js exactly.
const SERVICE_BUSINESS_TYPES = ['salon', 'ladies_salon', 'car_wash', 'mobile_car_wash', 'clinic', 'tailoring', 'hotel'];
// Roadmap item 7 — room INVENTORY (individual numbered rooms) gets its own
// dashboard screen ("الغرف"), separate from room TYPES (which are just
// `services` rows and already get the shared Services screen above via
// SERVICE_BUSINESS_TYPES). Only hotel needs this one.
function isHotelBusinessType(t){ return t === 'hotel'; }
function isServiceBusinessType(t){ return SERVICE_BUSINESS_TYPES.includes(t); }

function renderSettingsPanel(){
  const panel = document.getElementById('settingsPanelBody');
  if(activeSettingsTab === 'restaurant'){ panel.innerHTML = restaurantSettingsHtml(); wireRestaurantSettings(); }
  else if(activeSettingsTab === 'branches'){ renderBranchesSettings(); }
  else if(activeSettingsTab === 'pos'){ renderPosSettings(); }
  else if(activeSettingsTab === 'delivery'){ renderDeliveryPlatformsSettings(); }
  else if(activeSettingsTab === 'notifications'){ renderNotificationsSettings(); }
  else { panel.innerHTML = permissionsSettingsHtml(); wirePermissionsSettings(); }
}

/* ============ Owner notifications — real, free Web Push (same VAPID
   pipeline as the loyalty card). Preferences live on businesses (shared by
   whoever has settings access); the push subscription itself is per-device,
   so multiple staff can each enable it on their own phone. */
async function renderNotificationsSettings(){
  const panel = document.getElementById('settingsPanelBody');
  panel.innerHTML = `
    <div class="panel">
      <div class="panel-title">تنبيهات فورية لك</div>
      <p class="stock-qty-helper">إشعارات مجانية بالكامل تصلك على جوالك أو جهازك — مافيها أي تكلفة. أول مرة، ثبّت لوحة التحكم كتطبيق (من قائمة المتصفح اختر "إضافة إلى الشاشة الرئيسية")، وبعدها فعّل الإشعارات من هنا.</p>
      <button class="settings-save-btn" id="ownerPushEnableBtn">فعّل الإشعارات على هذا الجهاز</button>
      <p class="stock-qty-helper" id="ownerPushStatus" style="margin-top:10px;"></p>
    </div>
    <div class="panel">
      <div class="panel-title">وش تبي يوصلك؟</div>
      <div class="notif-pref-row"><label><input type="checkbox" id="notifyNewOrder"> طلب جديد من الكاشير</label></div>
      <div class="notif-pref-row"><label><input type="checkbox" id="notifyRefundCancel"> عملية استرجاع أو إلغاء طلب</label></div>
      <div class="notif-pref-row">
        <label><input type="checkbox" id="notifyLowStock"> مخزون صنف ينزل عن</label>
        <input type="number" id="notifyLowStockPct" class="notif-pref-num" min="1" max="99">
        <span>٪ ${helpIcon('النسبة محسوبة من "الحد الأدنى" (par level) اللي تحدده لكل صنف بشاشة المخزون، مو من كمية ثابتة — نفس الصنف ينبهك عند كمية مختلفة حسب الحد الأدنى المحدد له.')}</span>
      </div>
      <div class="notif-pref-row">
        <label><input type="checkbox" id="notifySalesTarget"> مبيعات اليوم توصل</label>
        <input type="number" id="notifySalesTargetAmount" class="notif-pref-num" min="0">
        <span>ر.س ${helpIcon('إشعار واحد فقط أول ما مبيعات اليوم (صافي المبيعات) توصل هذا الرقم — ما يتكرر بعدها لبقية اليوم، ويرجع يشتغل تلقائيًا اليوم اللي بعده.')}</span>
      </div>
      <div class="notif-pref-row"><label><input type="checkbox" id="notifyDeliveryPrepWarning"> باقي ٥ دقائق على وقت تجهيز طلب توصيل</label></div>
      <div class="notif-pref-row"><label><input type="checkbox" id="notifyDeliveryPrepExpired"> انتهى وقت تجهيز طلب توصيل</label></div>
      <button class="settings-save-btn" id="notifyPrefsSaveBtn" style="margin-top:14px;">حفظ التفضيلات</button>
    </div>
    <div class="panel">
      <div class="panel-title">الصوت</div>
      <p class="stock-qty-helper">صوت تنبيه لطيف يشتغل تلقائيًا وأنت فاتح لوحة التحكم أو شاشة الكاشير — لو الصفحة مقفولة، صوت التنبيه الافتراضي من الجهاز نفسه هو اللي يشتغل، مو صوتنا المخصص.</p>
      <div class="notif-pref-row"><label><input type="checkbox" id="notifySoundEnabled"> تشغيل صوت التنبيهات</label></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="mtr-edit-btn" id="testSoundChimeBtn" style="flex:1;">🔊 تجربة صوت التنبيه العادي</button>
        <button class="mtr-edit-btn" id="testSoundAlarmBtn" style="flex:1;">🔊 تجربة صوت انتهاء الوقت</button>
      </div>
    </div>
    <div class="panel" id="waLinkPanel">
      <div class="panel-title">ربط واتساب</div>
      <p class="stock-qty-helper">اربط رقم واتساب حقك عشان تكلم رقم ركين وتسأله عن مبيعاتك، طلباتك، ومخزونك مباشرة — بدون فتح لوحة التحكم.</p>
      <div id="waLinkBody">جارٍ التحميل...</div>
    </div>
  `;

  const { data } = await window.supabaseClient.from('businesses')
    .select('notify_low_stock, notify_low_stock_pct, notify_new_order, notify_refund_cancel, notify_sales_target, notify_sales_target_amount, notify_delivery_prep_warning, notify_delivery_prep_expired, notify_sound_enabled, whatsapp_link_phone, whatsapp_link_verified')
    .eq('id', CURRENT_PROFILE.business_id).single();
  if(data){
    document.getElementById('notifyNewOrder').checked = data.notify_new_order;
    document.getElementById('notifyRefundCancel').checked = data.notify_refund_cancel;
    document.getElementById('notifyLowStock').checked = data.notify_low_stock;
    document.getElementById('notifyLowStockPct').value = data.notify_low_stock_pct;
    document.getElementById('notifySalesTarget').checked = data.notify_sales_target;
    document.getElementById('notifySalesTargetAmount').value = data.notify_sales_target_amount;
    document.getElementById('notifyDeliveryPrepWarning').checked = data.notify_delivery_prep_warning;
    document.getElementById('notifyDeliveryPrepExpired').checked = data.notify_delivery_prep_expired;
    document.getElementById('notifySoundEnabled').checked = data.notify_sound_enabled;
  }
  renderWaLinkPanel(data);

  document.getElementById('testSoundChimeBtn').addEventListener('click', ()=> playAlertSound('chime'));
  document.getElementById('testSoundAlarmBtn').addEventListener('click', ()=> playAlertSound('alarm'));

  const statusEl = document.getElementById('ownerPushStatus');
  if(localStorage.getItem('rakeen_owner_push_enabled') === '1'){
    statusEl.textContent = '✓ الإشعارات مفعّلة على هذا الجهاز';
  }

  document.getElementById('ownerPushEnableBtn').addEventListener('click', async ()=>{
    const btn = document.getElementById('ownerPushEnableBtn');
    btn.disabled = true;
    try {
      if(!window.enableOwnerPushNotifications) throw new Error('جاري التجهيز، أعد المحاولة بعد لحظة');
      await window.enableOwnerPushNotifications();
      localStorage.setItem('rakeen_owner_push_enabled', '1');
      statusEl.textContent = '✓ الإشعارات مفعّلة على هذا الجهاز';
      showToast('تم تفعيل الإشعارات');
    } catch(err){
      showToast('تعذر تفعيل الإشعارات: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('notifyPrefsSaveBtn').addEventListener('click', async ()=>{
    const btn = document.getElementById('notifyPrefsSaveBtn');
    btn.disabled = true;
    try {
      const updates = {
        notify_new_order: document.getElementById('notifyNewOrder').checked,
        notify_refund_cancel: document.getElementById('notifyRefundCancel').checked,
        notify_low_stock: document.getElementById('notifyLowStock').checked,
        notify_low_stock_pct: parseFloat(document.getElementById('notifyLowStockPct').value) || 20,
        notify_sales_target: document.getElementById('notifySalesTarget').checked,
        notify_sales_target_amount: parseFloat(document.getElementById('notifySalesTargetAmount').value) || 0,
        notify_delivery_prep_warning: document.getElementById('notifyDeliveryPrepWarning').checked,
        notify_delivery_prep_expired: document.getElementById('notifyDeliveryPrepExpired').checked,
        notify_sound_enabled: document.getElementById('notifySoundEnabled').checked,
      };
      const { error } = await window.supabaseClient.from('businesses').update(updates).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      NOTIFY_SOUND_ENABLED = updates.notify_sound_enabled;
      logDashboardAudit('عدّل تفضيلات الإشعارات');
      showToast('تم حفظ التفضيلات');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      btn.disabled = false;
    }
  });
}

// Same "0X → 966X" normalization the server-side route uses — shown back to
// the owner in the confirmation toast so what they see matches what got saved.
// Rakeen's WhatsApp number, shown to owners linking their own number to it —
// update once the real production number replaces the Meta test number.
const RAKEEN_WHATSAPP_DISPLAY_NUMBER = '+966 55 701 5282';
let waLinkPollTimer = null;

function renderWaLinkPanel(businessRow){
  const body = document.getElementById('waLinkBody');
  if(!body) return;
  if(waLinkPollTimer){ clearInterval(waLinkPollTimer); waLinkPollTimer = null; }

  if(businessRow.whatsapp_link_verified && businessRow.whatsapp_link_phone){
    body.innerHTML = `
      <p class="stock-qty-helper">✓ مربوط برقم <span class="mono" dir="ltr">${businessRow.whatsapp_link_phone}</span></p>
      <button class="mtr-edit-btn" id="waUnlinkBtn" style="color:var(--danger);">إلغاء الربط</button>
    `;
    document.getElementById('waUnlinkBtn').addEventListener('click', async ()=>{
      if(!window.confirm('تأكيد إلغاء ربط واتساب؟')) return;
      const ok = await waLinkApiCall('DELETE', '/api/dashboard/whatsapp-link/request-otp', null);
      if(ok){ showToast('تم إلغاء الربط'); renderSettingsPanel(); }
    });
    return;
  }

  // No phone typed up front — the code travels TO Rakeen's number as a
  // reply the owner sends, never an outbound message Rakeen sends them
  // (that would be business-initiated and need an approved WhatsApp
  // template). We learn their number from whichever number sends the code.
  body.innerHTML = `
    <button class="settings-save-btn" id="waGenerateCodeBtn">إنشاء رمز الربط</button>
    <div id="waCodeRow" class="hidden" style="margin-top:14px;">
      <p class="stock-qty-helper">من جوالك، افتح واتساب وأرسل الرمز التالي لرقم ركين <span class="mono" dir="ltr">${RAKEEN_WHATSAPP_DISPLAY_NUMBER}</span>:</p>
      <div class="mono" id="waCodeDisplay" style="font-size:26px; font-weight:800; letter-spacing:4px; text-align:center; padding:14px; margin-top:10px; background:var(--surf1); border-radius:var(--r-sm); direction:ltr;"></div>
      <p class="stock-qty-helper" style="margin-top:10px;">بنتحقق تلقائياً أول ما توصلنا رسالتك.</p>
    </div>
  `;

  document.getElementById('waGenerateCodeBtn').addEventListener('click', async ()=>{
    const btn = document.getElementById('waGenerateCodeBtn');
    btn.disabled = true;
    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const session = sessionData && sessionData.session;
      const res = await fetch('/api/dashboard/whatsapp-link/request-otp', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + (session ? session.access_token : '') }
      });
      const result = await res.json().catch(()=>({}));
      if(!res.ok){ showToast(result.error || 'حدث خطأ'); return; }
      document.getElementById('waCodeDisplay').textContent = result.code;
      document.getElementById('waCodeRow').classList.remove('hidden');
      waLinkPollTimer = setInterval(async ()=>{
        const { data } = await window.supabaseClient.from('businesses')
          .select('whatsapp_link_phone, whatsapp_link_verified').eq('id', CURRENT_PROFILE.business_id).single();
        if(data && data.whatsapp_link_verified){
          clearInterval(waLinkPollTimer); waLinkPollTimer = null;
          showToast('تم الربط بنجاح');
          renderWaLinkPanel(data);
        }
      }, 4000);
    } finally {
      btn.disabled = false;
    }
  });
}

async function waLinkApiCall(method, url, body){
  try {
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    const session = sessionData && sessionData.session;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session ? session.access_token : '') },
      body: body ? JSON.stringify(body) : undefined
    });
    const result = await res.json().catch(()=>({}));
    if(!res.ok){ showToast(result.error || 'حدث خطأ'); return false; }
    return true;
  } catch(err){
    showToast('خطأ غير متوقع');
    return false;
  }
}

/* ============ Delivery platforms — real commission/fee/VAT-base config per
   platform, used by the monthly reconciliation report (renderDeliveryReconciliation)
   to compute exactly what each platform keeps vs. owes the business. */
async function renderDeliveryPlatformsSettings(){
  const panel = document.getElementById('settingsPanelBody');
  panel.innerHTML = '<div class="panel"><p style="font-size:12.5px; color:var(--muted); font-weight:600;">جاري التحميل...</p></div>';
  const [{data: platforms}, {data: tiers}] = await Promise.all([
    window.supabaseClient.from('delivery_platforms').select('*').eq('business_id', CURRENT_PROFILE.business_id).order('id'),
    window.supabaseClient.from('delivery_platform_fee_tiers').select('*').order('min_order_value')
  ]);
  const tiersByPlatform = {};
  (tiers||[]).forEach(t=>{ (tiersByPlatform[t.delivery_platform_id] ||= []).push(t); });

  panel.innerHTML = (platforms||[]).map(p=>{
    const platformTiers = tiersByPlatform[p.id] || [];
    return `
    <div class="panel" style="margin-bottom:16px;" data-platform-panel="${p.id}">
      <div class="panel-title"><span>${p.name}${p.active?'':' — معطّلة'}</span></div>
      <div class="menu-add-row" style="margin-bottom:14px;">
        <div class="menu-add-field"><label>نسبة عمولة المنصة (٪)</label><input type="number" step="0.1" class="dp-commission" value="${p.commission_pct}"></div>
        <div class="menu-add-field"><label>تحسب العمولة من</label>
          <select class="dp-commission-base">
            <option value="total" ${p.commission_base==='total'?'selected':''}>الإجمالي شامل الضريبة</option>
            <option value="subtotal" ${p.commission_base==='subtotal'?'selected':''}>المجموع قبل الضريبة</option>
          </select>
        </div>
      </div>
      <div class="menu-add-field" style="margin-bottom:14px; max-width:260px;">
        <label>نموذج رسوم التوصيل</label>
        <select class="dp-fee-model">
          <option value="flat" ${p.fee_model==='flat'?'selected':''}>رسم ثابت لكل الطلبات</option>
          <option value="tiered" ${p.fee_model==='tiered'?'selected':''}>يتدرّج حسب قيمة الطلب</option>
        </select>
      </div>
      <div class="dp-flat-fee-field" style="margin-bottom:14px; max-width:260px;">
        <div class="menu-add-field"><label class="dp-flat-fee-label">${p.fee_model==='tiered' ? 'رسم ثابت إضافي لكل طلب (اختياري)' : 'رسم التوصيل الثابت (ر.س)'}</label><input type="number" step="0.01" class="dp-flat-fee" value="${p.flat_fee}"></div>
        ${p.fee_model==='tiered' ? `<p class="stock-qty-helper" style="margin-top:4px;">يُضاف فوق رسم الشريحة في كل طلب — مثال: هنقرستيشن تاخذ رسم شريحة + 2 ر.س ثابتة لكل طلب. سيبه صفر إذا ما فيه رسم إضافي.</p>` : ''}
      </div>
      <div class="dp-tiers-field" style="display:${p.fee_model==='tiered'?'block':'none'}; margin-bottom:14px;">
        <label style="font-size:11.5px; font-weight:700; color:var(--muted);">درجات الرسوم — الرسم يطبّق لأعلى حد أدنى تحقق قيمة الطلب</label>
        <div class="dp-tiers-list" style="margin-top:8px;">
          ${platformTiers.map((t,i)=>`
            <div class="menu-add-row dp-tier-row" data-idx="${i}" style="margin-bottom:8px; align-items:end;">
              <div class="menu-add-field"><label>الطلب من (ر.س)</label><input type="number" step="0.01" class="dp-tier-min" value="${t.min_order_value}"></div>
              <div class="menu-add-field"><label>رسم التوصيل (ر.س)</label><input type="number" step="0.01" class="dp-tier-fee" value="${t.fee}"></div>
              <button class="mtr-edit-btn dp-tier-remove" data-idx="${i}" style="align-self:end;">حذف</button>
            </div>`).join('')}
        </div>
        <button class="mtr-edit-btn dp-tier-add" style="margin-top:6px;">+ إضافة درجة</button>
      </div>
      <div class="menu-add-field" style="margin-bottom:14px; max-width:260px;">
        <label>نسبة تعويضات/استرجاعات مفترضة (٪) ${helpIcon('تقدير اختياري — لو حاب تفترض إن نسبة معينة من طلبات هذي المنصة تنتهي بتعويض أو استرجاع يخصمه منك، حط النسبة هنا وبينحسب ضمن التكلفة. سيبه صفر لو ما تبي تفترض شي.')}</label>
        <input type="number" step="0.1" class="dp-compensation" value="${p.compensation_pct}">
      </div>
      <div class="menu-add-field" style="margin-bottom:14px; max-width:260px;">
        <label>الحد الأقصى لتجهيز طلب توصيل (دقيقة) ${helpIcon('المؤقت اللي يبدأ بالكاشير فور ما يضرب طلب توصيل من هذي المنصة — تنبيه أول عند بقاء ٥ دقائق، وتنبيه ثاني إذا انتهى الوقت.')}</label>
        <input type="number" step="1" min="1" class="dp-prep-timeout" value="${p.prep_timeout_minutes}">
      </div>
      <div style="display:flex; gap:8px;">
        <button class="settings-save-btn dp-save-btn" data-id="${p.id}" style="width:auto; padding:0 18px;">حفظ إعدادات ${p.name}</button>
        <button class="mtr-edit-btn dp-toggle-active" data-id="${p.id}" data-active="${p.active}">${p.active?'تعطيل المنصة':'تفعيل المنصة'}</button>
        <button class="mtr-edit-btn dp-delete-btn" data-id="${p.id}" data-name="${p.name}" style="color:var(--danger, #a3402c); border-color:var(--danger, #a3402c);">حذف</button>
      </div>
    </div>`;
  }).join('') || '';

  panel.innerHTML += `
    <div class="panel">
      <div class="panel-title">إضافة منصة توصيل جديدة</div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="newPlatformName" placeholder="مثال: هنقرستيشن" style="flex:1;">
        <button class="settings-save-btn" id="addPlatformBtn" style="width:auto; padding:0 18px;">إضافة</button>
      </div>
    </div>`;

  panel.querySelectorAll('[data-platform-panel]').forEach(block=>{
    const feeModelSelect = block.querySelector('.dp-fee-model');
    feeModelSelect.addEventListener('change', ()=>{
      const tiered = feeModelSelect.value==='tiered';
      block.querySelector('.dp-tiers-field').style.display = tiered ? 'block' : 'none';
      const label = block.querySelector('.dp-flat-fee-label');
      if(label) label.textContent = tiered ? 'رسم ثابت إضافي لكل طلب (اختياري)' : 'رسم التوصيل الثابت (ر.س)';
    });
    block.querySelector('.dp-tier-add').addEventListener('click', ()=>{
      const list = block.querySelector('.dp-tiers-list');
      const row = document.createElement('div');
      row.className = 'menu-add-row dp-tier-row';
      row.style.cssText = 'margin-bottom:8px; align-items:end;';
      row.innerHTML = `
        <div class="menu-add-field"><label>الطلب من (ر.س)</label><input type="number" step="0.01" class="dp-tier-min" value="0"></div>
        <div class="menu-add-field"><label>رسم التوصيل (ر.س)</label><input type="number" step="0.01" class="dp-tier-fee" value="0"></div>
        <button class="mtr-edit-btn dp-tier-remove" style="align-self:end;">حذف</button>`;
      list.appendChild(row);
      row.querySelector('.dp-tier-remove').addEventListener('click', ()=> row.remove());
    });
    block.querySelectorAll('.dp-tier-remove').forEach(btn=>{
      btn.addEventListener('click', ()=> btn.closest('.dp-tier-row').remove());
    });
  });

  panel.querySelectorAll('.dp-save-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const platformId = parseInt(btn.dataset.id,10);
      const block = panel.querySelector('[data-platform-panel="'+platformId+'"]');
      const commissionPct = parseFloat(block.querySelector('.dp-commission').value) || 0;
      const commissionBase = block.querySelector('.dp-commission-base').value;
      const feeModel = block.querySelector('.dp-fee-model').value;
      const flatFee = parseFloat(block.querySelector('.dp-flat-fee').value) || 0;
      const tierRows = Array.from(block.querySelectorAll('.dp-tier-row')).map(row=>({
        delivery_platform_id: platformId,
        min_order_value: parseFloat(row.querySelector('.dp-tier-min').value) || 0,
        fee: parseFloat(row.querySelector('.dp-tier-fee').value) || 0
      }));
      const compensationPct = parseFloat(block.querySelector('.dp-compensation').value) || 0;
      const prepTimeoutMinutes = parseInt(block.querySelector('.dp-prep-timeout').value, 10) || 17;
      btn.disabled = true;
      try {
        const { error: updateError } = await window.supabaseClient.from('delivery_platforms').update({
          commission_pct: commissionPct, commission_base: commissionBase, fee_model: feeModel,
          flat_fee: flatFee, compensation_pct: compensationPct, prep_timeout_minutes: prepTimeoutMinutes
        }).eq('id', platformId);
        if(updateError) throw updateError;

        const { error: deleteTiersError } = await window.supabaseClient.from('delivery_platform_fee_tiers').delete().eq('delivery_platform_id', platformId);
        if(deleteTiersError) throw deleteTiersError;
        if(feeModel === 'tiered' && tierRows.length){
          const { error: insertTiersError } = await window.supabaseClient.from('delivery_platform_fee_tiers').insert(tierRows);
          if(insertTiersError) throw insertTiersError;
        }
        logDashboardAudit('حدّث إعدادات منصة توصيل');
        showToast('تم الحفظ');
      } catch(err){
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      } finally {
        btn.disabled = false;
      }
    });
  });

  panel.querySelectorAll('.dp-toggle-active').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const makeActive = btn.dataset.active !== 'true';
      try {
        const { error } = await window.supabaseClient.from('delivery_platforms').update({active: makeActive}).eq('id', btn.dataset.id);
        if(error) throw error;
        renderDeliveryPlatformsSettings();
      } catch(err){
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  panel.querySelectorAll('.dp-delete-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!window.confirm('متأكد إنك تبي تحذف "' + btn.dataset.name + '"؟')) return;
      try {
        const { error } = await window.supabaseClient.from('delivery_platforms').delete().eq('id', btn.dataset.id);
        if(error) throw error;
        logDashboardAudit('حذف منصة توصيل: ' + btn.dataset.name);
        renderDeliveryPlatformsSettings();
      } catch(err){
        showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  const addBtn = document.getElementById('addPlatformBtn');
  if(addBtn) addBtn.addEventListener('click', async ()=>{
    const input = document.getElementById('newPlatformName');
    const name = input.value.trim();
    if(!name){ showToast('اكتب اسم المنصة'); return; }
    try {
      const { error } = await window.supabaseClient.from('delivery_platforms')
        .insert({ business_id: CURRENT_PROFILE.business_id, name });
      if(error) throw error;
      logDashboardAudit('أضاف منصة توصيل جديدة: ' + name);
      renderDeliveryPlatformsSettings();
    } catch(err){
      showToast('تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    }
  });
}

/* ============ Branches — capped per business (branch_limit, a plan-tier
   limit Rakeen sets per subscriber, same idea as included_seats — the owner
   can't raise it themselves; enforced server-side by a trigger, not just
   this UI). Delivery-platform price lists moved to live on each product
   itself (Menu screen's product edit modal, "أسعار التوصيل" tab) instead of
   a standalone screen — pricing an item for a platform reads more naturally
   next to that item's normal price than in a separate matrix. ============ */
async function renderBranchesSettings(){
  const panel = document.getElementById('settingsPanelBody');
  panel.innerHTML = '<div class="panel"><p style="font-size:12.5px; color:var(--muted); font-weight:600;">جاري التحميل...</p></div>';
  const [{data: business}, {data: branches}] = await Promise.all([
    window.supabaseClient.from('businesses').select('branch_limit').eq('id', CURRENT_PROFILE.business_id).single(),
    window.supabaseClient.from('branches').select('id, name, address, lat, lng, opening_time, closing_time').eq('business_id', CURRENT_PROFILE.business_id).order('id')
  ]);
  const limit = business ? business.branch_limit : 1;
  const count = (branches||[]).length;
  const atLimit = count >= limit;

  panel.innerHTML = `
    <div class="panel">
      <div class="panel-title"><span>الفروع (${count} من ${limit})</span></div>
      <p class="stock-qty-helper" style="margin-top:-4px; margin-bottom:12px;">موقع كل فرع يُستخدم بالمنيو الإلكتروني — يختار العميل فرع الاستلام، وللتوصيل يتحدد أقرب فرع لموقعه تلقائيًا.</p>
      <div style="display:flex; flex-direction:column; gap:14px;">
        ${(branches||[]).map(b=>`
          <div class="branch-row" data-branch="${b.id}" style="border:1px solid var(--line, #eee); border-radius:12px; padding:12px;">
            <div style="font-weight:800; font-size:13.5px; margin-bottom:8px;">${b.name}</div>
            <div class="settings-field-row"><label>العنوان</label><input type="text" class="branch-address-input" value="${b.address||''}" placeholder="الحي، المدينة"></div>
            <div style="display:flex; gap:8px; align-items:end;">
              <div class="menu-add-field" style="flex:1;"><label>خط العرض (Lat)</label><input type="number" class="branch-lat-input" value="${b.lat??''}" step="0.000001"></div>
              <div class="menu-add-field" style="flex:1;"><label>خط الطول (Lng)</label><input type="number" class="branch-lng-input" value="${b.lng??''}" step="0.000001"></div>
              <button class="settings-save-btn branch-locate-btn" type="button" style="width:auto; padding:0 14px; margin:0; height:38px;">📍 موقعي الحالي</button>
            </div>
            <div style="display:flex; gap:8px; margin-top:10px;">
              <div class="menu-add-field" style="flex:1;"><label>وقت الفتح</label><input type="time" class="branch-open-input" value="${(b.opening_time||'').slice(0,5)}"></div>
              <div class="menu-add-field" style="flex:1;"><label>وقت الإغلاق</label><input type="time" class="branch-close-input" value="${(b.closing_time||'').slice(0,5)}"></div>
            </div>
            <p class="stock-qty-helper" style="margin-top:2px; margin-bottom:0;">تُستخدم لتحديد وقت استلام الطلبات بالمنيو الإلكتروني — سيبها فاضية لو ما تبي خيار "وقت لاحق" للاستلام.</p>
            <button class="settings-save-btn branch-save-btn" style="margin-top:10px;">حفظ موقع الفرع</button>
          </div>
        `).join('') || '<p class="stock-qty-helper">ما فيه فروع بعد.</p>'}
      </div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <input type="text" id="newBranchName" placeholder="اسم الفرع الجديد" style="flex:1;" ${atLimit?'disabled':''}>
        <button class="settings-save-btn" id="addBranchBtn" style="width:auto; padding:0 18px;" ${atLimit?'disabled':''}>إضافة فرع</button>
      </div>
      ${atLimit ? '<p class="stock-qty-helper" style="margin-top:10px;">وصلت الحد الأقصى لعدد الفروع المسموح باشتراكك الحالي. لزيادة العدد، تواصل مع ركين.</p>' : ''}
    </div>`;

  panel.querySelectorAll('.branch-row').forEach(row=>{
    const branchId = row.dataset.branch;
    row.querySelector('.branch-locate-btn').addEventListener('click', (e)=>{
      e.preventDefault();
      if(!navigator.geolocation){ showToast('المتصفح ما يدعم تحديد الموقع'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos)=>{
          row.querySelector('.branch-lat-input').value = pos.coords.latitude.toFixed(6);
          row.querySelector('.branch-lng-input').value = pos.coords.longitude.toFixed(6);
          showToast('تم تحديد الموقع — لا تنسى تحفظ');
        },
        ()=> showToast('تعذر الوصول للموقع — تأكد من إذن الموقع بالمتصفح')
      );
    });
    row.querySelector('.branch-save-btn').addEventListener('click', async ()=>{
      const address = row.querySelector('.branch-address-input').value.trim() || null;
      const latVal = row.querySelector('.branch-lat-input').value;
      const lngVal = row.querySelector('.branch-lng-input').value;
      const openVal = row.querySelector('.branch-open-input').value;
      const closeVal = row.querySelector('.branch-close-input').value;
      try {
        const { error } = await window.supabaseClient.from('branches').update({
          address, lat: latVal===''?null:parseFloat(latVal), lng: lngVal===''?null:parseFloat(lngVal),
          opening_time: openVal || null, closing_time: closeVal || null
        }).eq('id', branchId);
        if(error) throw error;
        showToast('تم حفظ موقع الفرع'); logDashboardAudit('عدّل موقع فرع');
      } catch(err){
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  const addBtn = document.getElementById('addBranchBtn');
  if(addBtn) addBtn.addEventListener('click', async ()=>{
    const input = document.getElementById('newBranchName');
    const name = input.value.trim();
    if(!name){ showToast('اكتب اسم الفرع'); return; }
    try {
      const { error } = await window.supabaseClient.from('branches')
        .insert({ business_id: CURRENT_PROFILE.business_id, name });
      if(error) throw error;
      logDashboardAudit('أضاف فرع جديد: ' + name);
      renderBranchesSettings();
    } catch(err){
      const msg = (err && err.message && err.message.includes('branch_limit_reached'))
        ? 'وصلت الحد الأقصى لعدد الفروع المسموح باشتراكك الحالي.'
        : 'تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع');
      showToast(msg);
    }
  });
}

/* ============ POS settings: one shared PIN per branch (used to unlock the
   register on a provisioned tablet) + the staff-name list cashiers pick from
   after entering it. Individual staff are labels for attributing orders, not
   separate logins — the branch PIN is the only real credential involved. ============ */
// Mirrors the exact TLV+Base64 ZATCA QR encoder in public/pos/rakeen-pos.js
// (zatcaQrBase64) — small enough that duplicating it here is cheaper than
// sharing a module across these two separate bundles, and it means this
// preview is a REAL scannable QR tied to the business's actual VAT number,
// not just a mockup image.
function zatcaQrBase64ForPreview(sellerName, vatNumber, timestampISO, totalWithVat, vatAmount){
  const enc = new TextEncoder();
  const tlv = (tag, value)=>{
    const bytes = enc.encode(String(value));
    const out = new Uint8Array(2 + bytes.length);
    out[0] = tag; out[1] = bytes.length; out.set(bytes, 2);
    return out;
  };
  const fields = [tlv(1, sellerName), tlv(2, vatNumber), tlv(3, timestampISO), tlv(4, totalWithVat), tlv(5, vatAmount)];
  const totalLen = fields.reduce((s,f)=>s+f.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  fields.forEach(f=>{ combined.set(f, offset); offset += f.length; });
  let binary = '';
  combined.forEach(b=> binary += String.fromCharCode(b));
  return btoa(binary);
}
function receiptPreviewHtml(){
  const hasVat = !!BUSINESS_VAT_NUMBER;
  const qrPayload = hasVat ? zatcaQrBase64ForPreview(RESTAURANT_INFO.name || 'ركين', BUSINESS_VAT_NUMBER, new Date().toISOString(), '113.85', '14.85') : null;
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>شكل الفاتورة</span></div>
      <p class="stock-qty-helper" style="margin-bottom:14px;">هذا شكل الفاتورتين اللي يطبعهما جهاز الكاشير — مو تعديل، بس عشان تشوفها بدون ما تروح للجهاز فعليًا.</p>
      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px; max-width:280px; background:#fff; color:#111; border-radius:10px; padding:16px; font-family:'IBM Plex Sans Arabic',sans-serif;">
          ${BUSINESS_LOGO_URL ? `<div style="text-align:center; margin-bottom:8px;"><img src="${BUSINESS_LOGO_URL}" alt="" style="width:46px; height:46px; border-radius:50%; object-fit:cover;"></div>` : ''}
          <div style="text-align:center; font-weight:800; font-size:15px;">${RESTAURANT_INFO.name || 'ركين'}</div>
          <div style="text-align:center; font-size:11px; color:#555; margin-top:4px;">١٠/٠٨/٢٠٢٦ ٥:٤٢ م</div>
          <div style="text-align:center; font-weight:800; font-size:11.5px; margin-top:6px;">رقم الطلب: #58</div>
          ${hasVat ? `<div style="text-align:center; font-weight:800; font-size:11.5px; margin-top:8px;">فاتورة ضريبية مبسطة</div>
          <div style="text-align:center; font-size:10.5px; color:#555;">الرقم الضريبي: ${BUSINESS_VAT_NUMBER}</div>` : `<div style="text-align:center; font-size:10.5px; color:#a87a1e; margin-top:8px;">⚠ بدون رقم ضريبي — ما راح يطبع رمز QR</div>`}
          <div style="border-top:1px dashed #ccc; margin:10px 0;"></div>
          <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;"><span>1 × برجر لحم مشوي</span><span style="font-family:monospace;">24.00</span></div>
          <div style="border-top:1px dashed #ccc; margin:10px 0;"></div>
          <div style="display:flex; justify-content:space-between; font-size:11.5px;"><span>المجموع الفرعي</span><span style="font-family:monospace;">99.00</span></div>
          <div style="display:flex; justify-content:space-between; font-size:11.5px;"><span>ضريبة القيمة المضافة</span><span style="font-family:monospace;">14.85</span></div>
          <div style="display:flex; justify-content:space-between; font-weight:800; font-size:14px; margin-top:4px;"><span>الإجمالي</span><span style="font-family:monospace;">113.85</span></div>
          ${qrPayload ? `<div style="text-align:center; margin-top:12px;"><img src="/api/qr?data=${encodeURIComponent(qrPayload)}" alt="QR" style="width:110px; height:110px;"></div>` : ''}
          <div style="text-align:center; font-size:10.5px; color:#555; margin-top:10px;">${RECEIPT_CUSTOM_MESSAGE || 'شكراً لزيارتكم'}</div>
          <div style="text-align:center; font-size:9.5px; color:#999; margin-top:6px;">— فاتورة العميل —</div>
        </div>
        <div style="flex:1; min-width:220px; max-width:280px; background:#fff; color:#111; border-radius:10px; padding:16px; font-family:'IBM Plex Sans Arabic',sans-serif;">
          <div style="text-align:center; font-weight:800; font-size:18px;">طلب مطبخ</div>
          <div style="text-align:center; font-size:11px; color:#555; margin-top:4px;">طاولة ٤ — طلب #58</div>
          <div style="border-top:1px dashed #ccc; margin:10px 0;"></div>
          <div style="font-weight:800; font-size:15px;">2 × برجر لحم مشوي</div>
          <div style="font-size:11px; color:#555; padding-inline-start:10px;">— حجم كبير</div>
          <div style="font-size:11px; font-weight:700; padding-inline-start:10px;">📝 بدون بصل</div>
          <div style="font-weight:800; font-size:15px; margin-top:8px;">1 × بطاطس مقلية</div>
          <div style="text-align:center; font-size:9.5px; color:#999; margin-top:14px;">— فاتورة المطبخ (بدون أسعار) —</div>
        </div>
      </div>
    </div>`;
}

async function renderPosSettings(){
  const panel = document.getElementById('settingsPanelBody');
  panel.innerHTML = '<div class="panel"><p style="font-size:12.5px; color:var(--muted); font-weight:600;">جاري التحميل...</p></div>';
  const { data: branches } = await window.supabaseClient
    .from('branches').select('id, name').eq('business_id', CURRENT_PROFILE.business_id).order('id');
  const { data: staff } = await window.supabaseClient
    .from('staff_members').select('id, branch_id, name, active, is_reservation_host').eq('active', true).order('id');
  const { data: tables } = await window.supabaseClient
    .from('restaurant_tables').select('id, branch_id, number, active_order_id, section_id').eq('business_id', CURRENT_PROFILE.business_id).order('number');
  const { data: tableSections } = await window.supabaseClient
    .from('table_sections').select('id, branch_id, name, sort_order').eq('business_id', CURRENT_PROFILE.business_id).order('sort_order');
  const { data: kitchenSettings } = await window.supabaseClient
    .from('businesses').select('kitchen_ready_mode, kitchen_auto_ready_minutes, kitchen_new_order_sound_enabled, tables_reservations_enabled, tables_reservation_deposit_enabled, tables_reservation_deposit_percent, tables_turn_time_enabled, tables_turn_time_minutes, tables_reservation_conflict_warning_enabled, dine_in_pay_timing, tables_specific_booking_enabled, auto_ready_dine_in, auto_ready_pickup, auto_ready_delivery_platform, auto_ready_delivery_online')
    .eq('id', CURRENT_PROFILE.business_id).single();
  const kMode = kitchenSettings && kitchenSettings.kitchen_ready_mode === 'auto' ? 'auto' : 'manual';
  const kMinutes = (kitchenSettings && kitchenSettings.kitchen_auto_ready_minutes) || 15;
  const kSound = !kitchenSettings || kitchenSettings.kitchen_new_order_sound_enabled !== false;
  const payTiming = (kitchenSettings && kitchenSettings.dine_in_pay_timing === 'after') ? 'after' : 'before';
  const resEnabled = !!(kitchenSettings && kitchenSettings.tables_reservations_enabled);
  const resDepositEnabled = !!(kitchenSettings && kitchenSettings.tables_reservation_deposit_enabled);
  const resDepositPercent = (kitchenSettings && kitchenSettings.tables_reservation_deposit_percent) || 20;
  const resTurnEnabled = !!(kitchenSettings && kitchenSettings.tables_turn_time_enabled);
  const resTurnMinutes = (kitchenSettings && kitchenSettings.tables_turn_time_minutes) || 45;
  const resConflictWarning = !kitchenSettings || kitchenSettings.tables_reservation_conflict_warning_enabled !== false;
  const specificBookingEnabled = !!(kitchenSettings && kitchenSettings.tables_specific_booking_enabled);
  const autoReadyDineIn = !!(kitchenSettings && kitchenSettings.auto_ready_dine_in);
  const autoReadyPickup = !!(kitchenSettings && kitchenSettings.auto_ready_pickup);
  const autoReadyDeliveryPlatform = !!(kitchenSettings && kitchenSettings.auto_ready_delivery_platform);
  const autoReadyDeliveryOnline = !!(kitchenSettings && kitchenSettings.auto_ready_delivery_online);

  const receiptMessagePanel = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>رسالة أسفل فاتورة العميل</span></div>
      <div class="settings-field-row">
        <input type="text" id="settingsReceiptMessage" value="${RECEIPT_CUSTOM_MESSAGE || ''}" placeholder="شكراً لزيارتكم" maxlength="120">
      </div>
      <p class="stock-qty-helper" style="margin-top:-6px;">تُطبع تحت رمز QR بفاتورة العميل — سيبها فاضية لتبقى "شكراً لزيارتكم" الافتراضية.</p>
      <button class="settings-save-btn" id="receiptMessageSaveBtn" style="width:auto; padding:0 18px;">حفظ الرسالة</button>
    </div>`;

  const kitchenPanel = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>آلية شاشة المطبخ</span></div>
      <div class="settings-field-row">
        <label>كيف تنتهي الطلبات من شاشة المطبخ؟</label>
        <select id="kitchenReadyModeSelect">
          <option value="manual" ${kMode==='manual'?'selected':''}>يدوي — الموظف يضغط "تم التجهيز"</option>
          <option value="auto" ${kMode==='auto'?'selected':''}>تلقائي — تختفي الفاتورة بعد وقت محدد بدون ضغط</option>
        </select>
      </div>
      <div class="settings-field-row" id="kitchenAutoMinutesRow" style="${kMode==='auto'?'':'display:none;'}">
        <label>الوقت التلقائي (بالدقائق)</label>
        <input type="number" id="kitchenAutoMinutesInput" value="${kMinutes}" min="1" max="120" style="max-width:120px;">
      </div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="kitchenSoundToggle" ${kSound?'checked':''}> صوت تنبيه بشاشة المطبخ عند وصول طلب جديد</label>
      </div>
      <button class="settings-save-btn" id="kitchenSettingsSaveBtn" style="width:auto; padding:0 18px;">حفظ إعدادات المطبخ</button>
    </div>`;

  const autoReadyPanel = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>تخطي مرحلة "جاهز" ${helpIcon('لو فعّلت هذا لقناة معينة، أي طلب جديد فيها يتسجّل جاهز مباشرة عند إنشائه — بدون ما ينتظر أحد يضغط "جاهز" بالكاشير أو شاشة المطبخ. فعّلها بس للقنوات اللي فعليًا ما تحتاج تجهيز يُنتظر (مثلاً كاونتر تسليم فوري).')}</span></div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="autoReadyDineInToggle" ${autoReadyDineIn?'checked':''}> الطاولات (Dine-in)</label>
      </div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="autoReadyPickupToggle" ${autoReadyPickup?'checked':''}> السفري (استلام)</label>
      </div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="autoReadyDeliveryPlatformToggle" ${autoReadyDeliveryPlatform?'checked':''}> توصيل عبر تطبيقات التوصيل (كيتا، جاهز...)</label>
      </div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="autoReadyDeliveryOnlineToggle" ${autoReadyDeliveryOnline?'checked':''}> توصيل عبر متجرك الإلكتروني</label>
      </div>
      <button class="settings-save-btn" id="autoReadySaveBtn" style="width:auto; padding:0 18px;">حفظ</button>
    </div>`;

  const payTimingPanel = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>توقيت الدفع للطاولات</span></div>
      <div class="settings-field-row">
        <label>متى يدفع العميل؟</label>
        <select id="dineInPayTimingSelect">
          <option value="before" ${payTiming==='before'?'selected':''}>قبل الأكل — يدفع عند تسجيل الطلب</option>
          <option value="after" ${payTiming==='after'?'selected':''}>بعد الأكل — يدفع لما يطلب الفاتورة</option>
        </select>
      </div>
      <p class="stock-qty-helper" style="margin-top:-6px;">يتحكم بحالة الطاولة بالكاشير: "بعد الأكل" تسمح بتسجيل الطلب وإرساله للمطبخ فورًا مع تأجيل الدفع لآخر الجلسة.</p>
      <button class="settings-save-btn" id="dineInPayTimingSaveBtn" style="width:auto; padding:0 18px;">حفظ</button>
    </div>`;

  const reservationsPanel = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>حجوزات الطاولات</span></div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="resEnabledToggle" ${resEnabled?'checked':''}> تفعيل الحجوزات بشاشة الطاولات بالكاشير</label>
      </div>
      <div id="resSubSettings" style="${resEnabled?'':'display:none;'}">
        <div class="settings-field-row">
          <label><input type="checkbox" id="resDepositToggle" ${resDepositEnabled?'checked':''}> إظهار عربون مقترح عند إنشاء الحجز</label>
        </div>
        <div class="settings-field-row" id="resDepositRow" style="${resDepositEnabled?'':'display:none;'}">
          <label>نسبة العربون (٪ من قيمة الطلب المتوقعة)</label>
          <input type="number" id="resDepositPercentInput" value="${resDepositPercent}" min="0" max="100" style="max-width:120px;">
          <p class="stock-qty-helper">للتوجيه فقط — يُحصّل يدويًا، ما فيه دفع أونلاين مربوط حاليًا.</p>
        </div>
        <div class="settings-field-row">
          <label><input type="checkbox" id="resTurnToggle" ${resTurnEnabled?'checked':''}> إظهار مدة الجلسة على الطاولات المشغولة</label>
        </div>
        <div class="settings-field-row" id="resTurnRow" style="${resTurnEnabled?'':'display:none;'}">
          <label>مدة الجلسة القياسية (بالدقائق)</label>
          <input type="number" id="resTurnMinutesInput" value="${resTurnMinutes}" min="1" max="600" style="max-width:120px;">
        </div>
        <div class="settings-field-row">
          <label><input type="checkbox" id="resConflictToggle" ${resConflictWarning?'checked':''}> تنبيه عند حجز طاولة قريبة من حجز آخر بنفس الوقت</label>
        </div>
        <div class="settings-field-row">
          <label><input type="checkbox" id="resSpecificBookingToggle" ${specificBookingEnabled?'checked':''}> السماح بحجز طاولة محددة مسبقًا (بالإضافة لقائمة الانتظار العادية)</label>
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px;">لو مفعّل، عند إضافة أحد لقائمة الانتظار بالكاشير يقدر يختار طاولة معينة له بدل ما ينتظر بالدور — الطاولة تعرض وقت الحجز كتذكير، وتفضل متاحة لأي زبون آخر لحد ما يوصل وقته.</p>
      </div>
      <button class="settings-save-btn" id="resSettingsSaveBtn" style="width:auto; padding:0 18px;">حفظ إعدادات الحجوزات</button>
    </div>`;

  const managerPinPanel = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>كلمة سر المدير</span></div>
      <div class="settings-field-row">
        <label>رمز اعتماد العمليات الحساسة (٤ أرقام)</label>
        <div style="display:flex; gap:8px;">
          <input type="text" maxlength="4" inputmode="numeric" id="managerPinInput" placeholder="١٢٣٤" style="max-width:120px;">
          <button class="settings-save-btn" id="managerPinSaveBtn" style="width:auto; padding:0 18px;">تعيين / تحديث</button>
        </div>
        <p class="stock-qty-helper">يطلبه جهاز الكاشير قبل إغلاق الوردية (ومطابقة الكاش) — أعطِه لك أو لمن تثق فيه فقط. غيّره في أي وقت من هنا.</p>
      </div>
    </div>`;
  panel.innerHTML = receiptPreviewHtml() + receiptMessagePanel + kitchenPanel + autoReadyPanel + payTimingPanel + reservationsPanel + managerPinPanel + (branches||[]).map(b=>{
    const branchStaff = (staff||[]).filter(s=>s.branch_id===b.id);
    const branchTables = (tables||[]).filter(t=>t.branch_id===b.id);
    const branchSections = (tableSections||[]).filter(s=>s.branch_id===b.id);
    const nextTableNumber = branchTables.reduce((max,t)=>Math.max(max,t.number),0) + 1;
    const nextSectionOrder = branchSections.reduce((max,s)=>Math.max(max,s.sort_order),0) + 1;
    const sectionOptionsHtml = (selectedId) => '<option value="">بدون قسم</option>' +
      branchSections.map(s=>`<option value="${s.id}" ${selectedId===s.id?'selected':''}>${s.name}</option>`).join('');
    return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title"><span>${b.name}</span></div>
      <div class="settings-field-row">
        <label>رمز نقطة البيع لهذا الفرع (٤ أرقام)</label>
        <div style="display:flex; gap:8px;">
          <input type="text" maxlength="4" inputmode="numeric" class="pos-pin-input" data-branch="${b.id}" placeholder="١٢٣٤" style="max-width:120px;">
          <button class="settings-save-btn pos-pin-save" data-branch="${b.id}" style="width:auto; padding:0 18px;">تعيين / تحديث</button>
        </div>
        <p class="stock-qty-helper">هذا الرمز يفتح جهاز الكاشير لهذا الفرع بس — كل الموظفين يستخدمونه، وبعده يختارون اسمهم من القائمة تحت.</p>
      </div>
      <div class="settings-field-row" style="margin-top:14px;">
        <label>موظفو الكاشير بهذا الفرع</label>
        <div class="checklist" style="margin-top:4px;">
          ${branchStaff.length ? branchStaff.map(s=>`
            <div class="check-item" style="opacity:1; transform:none;">
              <span style="flex:1;">${s.name}</span>
              <label style="display:flex; align-items:center; gap:5px; font-size:11px; font-weight:600; color:var(--muted); cursor:pointer;">
                <input type="checkbox" class="staff-host-toggle" data-id="${s.id}" ${s.is_reservation_host?'checked':''}> مخصص للحجز
              </label>
              <button class="mtr-edit-btn staff-remove-btn" data-id="${s.id}">حذف</button>
            </div>`).join('') : '<p class="stock-qty-helper">ما فيه موظفين مضافين لهذا الفرع.</p>'}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <input type="text" class="staff-name-input" data-branch="${b.id}" placeholder="اسم الموظف">
          <button class="settings-save-btn staff-add-btn" data-branch="${b.id}" style="width:auto; padding:0 18px;">إضافة</button>
        </div>
        <p class="stock-qty-helper" style="margin-top:8px;">"مخصص للحجز" تظهره أول القائمة بشاشة الحجز المستقلة تحت — ما تمنع باقي الموظفين من استخدامها.</p>
        <div style="margin-top:10px; padding:10px 12px; background:var(--surf1); border-radius:var(--r-md);">
          <p class="stock-qty-helper" style="margin:0 0 6px;">رابط شاشة الحجز والطاولات المستقلة (بدون كاشير أو دفع) — لجهاز منفصل عند مضيف الاستقبال:</p>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" readonly value="${(typeof window!=='undefined'?window.location.origin:'')}/pos/host" class="mono host-link-input" style="flex:1; font-size:11px; background:var(--card-bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:8px;">
          </div>
        </div>
      </div>
      <div class="settings-field-row" style="margin-top:14px;">
        <label>أقسام هذا الفرع <span class="stock-qty-helper" style="display:inline;">(اختياري — عائلات/شباب/داخلي...، تظهر كعناوين تجمع الطاولات بشاشة الكاشير)</span></label>
        <div class="checklist" style="margin-top:4px; flex-wrap:wrap; flex-direction:row; gap:8px;">
          ${branchSections.length ? branchSections.map(s=>`
            <div class="check-item" style="opacity:1; transform:none; width:auto; flex:0 0 auto; gap:8px;">
              <span>${s.name}</span>
              <button class="mtr-edit-btn section-remove-btn" data-id="${s.id}">حذف</button>
            </div>`).join('') : '<p class="stock-qty-helper">ما فيه أقسام — شاشة الطاولات تعرض شبكة عادية بدون تقسيم.</p>'}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <input type="text" class="section-name-input" data-branch="${b.id}" data-next="${nextSectionOrder}" placeholder="اسم القسم (مثال: عائلات)">
          <button class="settings-save-btn section-add-btn" data-branch="${b.id}" data-next="${nextSectionOrder}" style="width:auto; padding:0 18px;">إضافة</button>
        </div>
      </div>
      <div class="settings-field-row" style="margin-top:14px;">
        <label>طاولات هذا الفرع</label>
        <div class="checklist" style="margin-top:4px; flex-wrap:wrap; flex-direction:row; gap:8px;">
          ${branchTables.length ? branchTables.map(t=>`
            <div class="check-item" style="opacity:1; transform:none; width:auto; flex:0 0 auto; gap:8px;">
              <span>طاولة ${t.number}</span>
              ${branchSections.length ? `<select class="table-section-select" data-id="${t.id}" style="max-width:120px; font-size:11.5px;">${sectionOptionsHtml(t.section_id)}</select>` : ''}
              <button class="mtr-edit-btn table-remove-btn" data-id="${t.id}" data-active="${t.active_order_id ? '1' : ''}">حذف</button>
            </div>`).join('') : '<p class="stock-qty-helper">ما فيه طاولات مسجّلة لهذا الفرع.</p>'}
        </div>
        <button class="settings-save-btn table-add-btn" data-branch="${b.id}" data-next="${nextTableNumber}" style="width:auto; padding:0 18px; margin-top:10px;">+ إضافة طاولة رقم ${nextTableNumber}</button>
      </div>
    </div>`;
  }).join('') || '<div class="panel"><p>ما فيه فروع بعد.</p></div>';

  const managerPinSaveBtn = document.getElementById('managerPinSaveBtn');
  if(managerPinSaveBtn) managerPinSaveBtn.addEventListener('click', async ()=>{
    const input = document.getElementById('managerPinInput');
    const pin = input.value.trim();
    if(!/^\d{4}$/.test(pin)){ showToast('لازم يكون الرمز ٤ أرقام بالضبط'); return; }
    managerPinSaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.rpc('set_pos_manager_pin', { p_pin: pin });
      if(error) throw error;
      input.value = '';
      logDashboardAudit('حدّث كلمة سر مدير الكاشير');
      showToast('تم الحفظ — الرمز فعّال الآن');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      managerPinSaveBtn.disabled = false;
    }
  });

  const receiptMessageSaveBtn = document.getElementById('receiptMessageSaveBtn');
  if(receiptMessageSaveBtn) receiptMessageSaveBtn.addEventListener('click', async ()=>{
    const msg = document.getElementById('settingsReceiptMessage').value.trim();
    receiptMessageSaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from('businesses').update({ receipt_custom_message: msg || null }).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      RECEIPT_CUSTOM_MESSAGE = msg;
      logDashboardAudit('عدّل رسالة الفاتورة');
      showToast('تم حفظ رسالة الفاتورة');
      renderPosSettings();
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      receiptMessageSaveBtn.disabled = false;
    }
  });

  const kitchenModeSelect = document.getElementById('kitchenReadyModeSelect');
  if(kitchenModeSelect) kitchenModeSelect.addEventListener('change', ()=>{
    document.getElementById('kitchenAutoMinutesRow').style.display = kitchenModeSelect.value === 'auto' ? '' : 'none';
  });
  const kitchenSettingsSaveBtn = document.getElementById('kitchenSettingsSaveBtn');
  if(kitchenSettingsSaveBtn) kitchenSettingsSaveBtn.addEventListener('click', async ()=>{
    const mode = document.getElementById('kitchenReadyModeSelect').value;
    const minutes = parseInt(document.getElementById('kitchenAutoMinutesInput').value, 10);
    const soundEnabled = document.getElementById('kitchenSoundToggle').checked;
    if(mode === 'auto' && !(minutes >= 1 && minutes <= 120)){ showToast('الوقت التلقائي لازم يكون بين ١ و١٢٠ دقيقة'); return; }
    kitchenSettingsSaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from('businesses').update({
        kitchen_ready_mode: mode,
        kitchen_auto_ready_minutes: minutes || 15,
        kitchen_new_order_sound_enabled: soundEnabled
      }).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      logDashboardAudit('عدّل إعدادات شاشة المطبخ');
      showToast('تم حفظ إعدادات المطبخ');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      kitchenSettingsSaveBtn.disabled = false;
    }
  });

  const autoReadySaveBtn = document.getElementById('autoReadySaveBtn');
  if(autoReadySaveBtn) autoReadySaveBtn.addEventListener('click', async ()=>{
    autoReadySaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from('businesses').update({
        auto_ready_dine_in: document.getElementById('autoReadyDineInToggle').checked,
        auto_ready_pickup: document.getElementById('autoReadyPickupToggle').checked,
        auto_ready_delivery_platform: document.getElementById('autoReadyDeliveryPlatformToggle').checked,
        auto_ready_delivery_online: document.getElementById('autoReadyDeliveryOnlineToggle').checked
      }).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      logDashboardAudit('عدّل إعدادات تخطي مرحلة الجاهزية');
      showToast('تم الحفظ');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      autoReadySaveBtn.disabled = false;
    }
  });

  const dineInPayTimingSaveBtn = document.getElementById('dineInPayTimingSaveBtn');
  if(dineInPayTimingSaveBtn) dineInPayTimingSaveBtn.addEventListener('click', async ()=>{
    const timing = document.getElementById('dineInPayTimingSelect').value;
    dineInPayTimingSaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from('businesses').update({ dine_in_pay_timing: timing }).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      logDashboardAudit('عدّل توقيت الدفع للطاولات إلى ' + (timing === 'after' ? 'بعد الأكل' : 'قبل الأكل'));
      showToast('تم الحفظ');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      dineInPayTimingSaveBtn.disabled = false;
    }
  });

  const resEnabledToggle = document.getElementById('resEnabledToggle');
  if(resEnabledToggle) resEnabledToggle.addEventListener('change', ()=>{
    document.getElementById('resSubSettings').style.display = resEnabledToggle.checked ? '' : 'none';
  });
  const resDepositToggle = document.getElementById('resDepositToggle');
  if(resDepositToggle) resDepositToggle.addEventListener('change', ()=>{
    document.getElementById('resDepositRow').style.display = resDepositToggle.checked ? '' : 'none';
  });
  const resTurnToggle = document.getElementById('resTurnToggle');
  if(resTurnToggle) resTurnToggle.addEventListener('change', ()=>{
    document.getElementById('resTurnRow').style.display = resTurnToggle.checked ? '' : 'none';
  });
  const resSettingsSaveBtn = document.getElementById('resSettingsSaveBtn');
  if(resSettingsSaveBtn) resSettingsSaveBtn.addEventListener('click', async ()=>{
    const enabled = document.getElementById('resEnabledToggle').checked;
    const depositEnabled = document.getElementById('resDepositToggle').checked;
    const depositPercent = parseInt(document.getElementById('resDepositPercentInput').value, 10);
    const turnEnabled = document.getElementById('resTurnToggle').checked;
    const turnMinutes = parseInt(document.getElementById('resTurnMinutesInput').value, 10);
    const conflictWarning = document.getElementById('resConflictToggle').checked;
    const specificBooking = document.getElementById('resSpecificBookingToggle').checked;
    if(depositEnabled && !(depositPercent >= 0 && depositPercent <= 100)){ showToast('نسبة العربون لازم تكون بين ٠ و١٠٠'); return; }
    if(turnEnabled && !(turnMinutes >= 1 && turnMinutes <= 600)){ showToast('مدة الجلسة لازم تكون بين ١ و٦٠٠ دقيقة'); return; }
    resSettingsSaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from('businesses').update({
        tables_reservations_enabled: enabled,
        tables_reservation_deposit_enabled: depositEnabled,
        tables_reservation_deposit_percent: depositPercent || 20,
        tables_turn_time_enabled: turnEnabled,
        tables_turn_time_minutes: turnMinutes || 45,
        tables_reservation_conflict_warning_enabled: conflictWarning,
        tables_specific_booking_enabled: specificBooking
      }).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      logDashboardAudit('عدّل إعدادات حجوزات الطاولات');
      showToast('تم حفظ إعدادات الحجوزات');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      resSettingsSaveBtn.disabled = false;
    }
  });

  panel.querySelectorAll('.pos-pin-save').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const branchId = btn.dataset.branch;
      const input = panel.querySelector('.pos-pin-input[data-branch="'+branchId+'"]');
      const pin = input.value.trim();
      if(!/^\d{4}$/.test(pin)){ showToast('لازم يكون الرمز ٤ أرقام بالضبط'); return; }
      btn.disabled = true;
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const res = await fetch('/api/pos/provision-branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
          body: JSON.stringify({ branchId: parseInt(branchId,10), pin })
        });
        const body = await res.json();
        if(!res.ok) throw new Error(body.error || 'خطأ غير متوقع');
        input.value = '';
        logDashboardAudit('حدّث رمز نقطة البيع لفرع #' + branchId);
        showToast('تم الحفظ — الرمز فعّال الآن');
      } catch(err){
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      } finally {
        btn.disabled = false;
      }
    });
  });

  panel.querySelectorAll('.staff-add-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const branchId = parseInt(btn.dataset.branch,10);
      const input = panel.querySelector('.staff-name-input[data-branch="'+branchId+'"]');
      const name = input.value.trim();
      if(!name){ showToast('اكتب اسم الموظف'); return; }
      try {
        const { error } = await window.supabaseClient.from('staff_members')
          .insert({ business_id: CURRENT_PROFILE.business_id, branch_id: branchId, name });
        if(error) throw error;
        logDashboardAudit('أضاف موظف كاشير: ' + name);
        renderPosSettings();
      } catch(err){
        showToast('تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  panel.querySelectorAll('.staff-remove-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try {
        const { error } = await window.supabaseClient.from('staff_members').update({active:false}).eq('id', btn.dataset.id);
        if(error) throw error;
        renderPosSettings();
      } catch(err){
        showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  panel.querySelectorAll('.staff-host-toggle').forEach(cb=>{
    cb.addEventListener('change', async ()=>{
      cb.disabled = true;
      try {
        const { error } = await window.supabaseClient.from('staff_members').update({ is_reservation_host: cb.checked }).eq('id', cb.dataset.id);
        if(error) throw error;
        showToast('تم الحفظ');
      } catch(err){
        cb.checked = !cb.checked;
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      } finally {
        cb.disabled = false;
      }
    });
  });

  panel.querySelectorAll('.host-link-input').forEach(input=>{
    input.addEventListener('click', ()=> input.select());
  });

  panel.querySelectorAll('.section-add-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const branchId = parseInt(btn.dataset.branch,10);
      const input = panel.querySelector('.section-name-input[data-branch="'+branchId+'"]');
      const name = input.value.trim();
      if(!name){ showToast('اكتب اسم القسم'); return; }
      const sortOrder = parseInt(btn.dataset.next,10);
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.from('table_sections')
          .insert({ business_id: CURRENT_PROFILE.business_id, branch_id: branchId, name, sort_order: sortOrder });
        if(error) throw error;
        logDashboardAudit('أضاف قسم طاولات: ' + name);
        renderPosSettings();
      } catch(err){
        showToast('تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });

  panel.querySelectorAll('.section-remove-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!window.confirm('تأكيد حذف هذا القسم؟ الطاولات المرتبطة فيه ترجع "بدون قسم".')) return;
      try {
        const { error } = await window.supabaseClient.from('table_sections').delete().eq('id', btn.dataset.id);
        if(error) throw error;
        renderPosSettings();
      } catch(err){
        showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  panel.querySelectorAll('.table-section-select').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const sectionId = sel.value ? parseInt(sel.value,10) : null;
      try {
        const { error } = await window.supabaseClient.from('restaurant_tables')
          .update({ section_id: sectionId }).eq('id', sel.dataset.id);
        if(error) throw error;
        showToast('تم تحديث القسم');
      } catch(err){
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      }
    });
  });

  panel.querySelectorAll('.table-add-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const branchId = parseInt(btn.dataset.branch,10);
      const number = parseInt(btn.dataset.next,10);
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.from('restaurant_tables')
          .insert({ business_id: CURRENT_PROFILE.business_id, branch_id: branchId, number });
        if(error) throw error;
        logDashboardAudit('أضاف طاولة رقم ' + number);
        renderPosSettings();
      } catch(err){
        showToast('تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });

  panel.querySelectorAll('.table-remove-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(btn.dataset.active){ showToast('هذي الطاولة عليها طلب شغّال حاليًا — تقدر تحذفها بعد ما ينتهي'); return; }
      if(!window.confirm('تأكيد حذف هذي الطاولة؟')) return;
      try {
        const { error } = await window.supabaseClient.from('restaurant_tables').delete().eq('id', btn.dataset.id);
        if(error) throw error;
        renderPosSettings();
      } catch(err){
        showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'فيه حجوزات أو طلبات مرتبطة بهذي الطاولة'));
      }
    });
  });
}

// Bring-your-own-merchant Geidea connection — mirrors renderWaLinkPanel's
// connected/disconnected shape, the only existing precedent in this file
// for a panel backed by a server-held secret rather than a plain
// businesses column. The apiPassword itself never comes back to this
// client after saving — only a masked "last 4 of the public key".
function geideaPanelHtml(){
  if(GEIDEA_CONNECTED){
    return `
      <p class="stock-qty-helper">✓ متصل — مفتاح ينتهي بـ <span class="mono" dir="ltr">${GEIDEA_PUBLIC_KEY_LAST4}</span></p>
      <button class="mtr-edit-btn" id="geideaDisconnectBtn" style="color:var(--danger);">فصل الاتصال</button>
    `;
  }
  return `
    <div class="settings-field-row"><label>المفتاح العام (Merchant Public Key)</label><input type="text" id="geideaPublicKeyInput" autocomplete="off"></div>
    <div class="settings-field-row"><label>كلمة مرور الـAPI (API Password)</label><input type="password" id="geideaApiPasswordInput" autocomplete="off"></div>
    <p class="stock-qty-helper" style="margin-top:-6px;">تحصل عليهم من حساب Geidea الخاص فيك بعد التسجيل — نتحقق منهم فورًا قبل الحفظ.</p>
    <button class="settings-save-btn" id="geideaConnectBtn">حفظ وتفعيل</button>
  `;
}
function wireGeideaPanel(){
  const connectBtn = document.getElementById('geideaConnectBtn');
  if(connectBtn) connectBtn.addEventListener('click', async ()=>{
    const publicKey = document.getElementById('geideaPublicKeyInput').value.trim();
    const apiPassword = document.getElementById('geideaApiPasswordInput').value.trim();
    if(!publicKey || !apiPassword){ showToast('أدخل المفتاح وكلمة المرور'); return; }
    connectBtn.disabled = true; connectBtn.textContent = 'جاري التحقق...';
    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const session = sessionData && sessionData.session;
      const res = await fetch('/api/dashboard/geidea/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session ? session.access_token : '') },
        body: JSON.stringify({ merchant_public_key: publicKey, api_password: apiPassword }),
      });
      const result = await res.json().catch(()=>({}));
      if(!res.ok){ showToast(result.error || 'تعذر الحفظ'); return; }
      GEIDEA_CONNECTED = true;
      GEIDEA_PUBLIC_KEY_LAST4 = result.last4 || '';
      document.getElementById('geideaPanelBody').innerHTML = geideaPanelHtml();
      wireGeideaPanel();
      showToast('تم ربط بوابة الدفع'); logDashboardAudit('ربط بوابة دفع Geidea');
    } finally {
      connectBtn.disabled = false; connectBtn.textContent = 'حفظ وتفعيل';
    }
  });
  const disconnectBtn = document.getElementById('geideaDisconnectBtn');
  if(disconnectBtn) disconnectBtn.addEventListener('click', async ()=>{
    if(!window.confirm('تأكيد فصل بوابة الدفع؟ عملاؤك لن يقدروا يدفعون بالبطاقة بعدها.')) return;
    disconnectBtn.disabled = true;
    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const session = sessionData && sessionData.session;
      const res = await fetch('/api/dashboard/geidea/credentials', {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (session ? session.access_token : '') },
      });
      if(!res.ok){ showToast('تعذر الفصل'); return; }
      GEIDEA_CONNECTED = false;
      GEIDEA_PUBLIC_KEY_LAST4 = '';
      document.getElementById('geideaPanelBody').innerHTML = geideaPanelHtml();
      wireGeideaPanel();
      showToast('تم فصل بوابة الدفع'); logDashboardAudit('فصل بوابة دفع Geidea');
    } finally {
      disconnectBtn.disabled = false;
    }
  });
}
function restaurantSettingsHtml(){
  return `
    <div class="panel">
      <div class="settings-identity-preview">
        ${BUSINESS_LOGO_URL
          ? `<img src="${BUSINESS_LOGO_URL}" style="width:44px; height:44px; border-radius:50%; object-fit:cover;">`
          : `<div class="brand-avatar" style="width:44px;height:44px;font-size:19px;">${(RESTAURANT_INFO.name||'؟').trim().charAt(0)}</div>`}
        <div><div style="font-weight:800; font-size:14px;">${RESTAURANT_INFO.name}</div></div>
      </div>
      <div class="settings-field-row"><label>اسم المطعم</label><input type="text" id="settingsRestName" value="${RESTAURANT_INFO.name}"></div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="settingsVatRegistered" ${VAT_REGISTERED?'checked':''}> مسجّل في ضريبة القيمة المضافة</label>
      </div>
      <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">عطّلها فقط لو مطعمك فعليًا غير مسجّل بالضريبة (إيراد سنوي أقل من ٣٧٥,٠٠٠ ريال عادةً) — عند التعطيل ما تُحسب أي ضريبة على المبيعات أو المشتريات بكل النظام، مو بس تختفي الحقول.</p>
      <div id="vatRegisteredFields" style="${VAT_REGISTERED?'':'display:none;'}">
        <div class="settings-field-row">
          <label>نسبة ضريبة القيمة المضافة (%)</label>
          <input type="number" id="settingsVatRate" value="${(BUSINESS_VAT_RATE*100).toFixed(2)}" min="0" max="100" step="0.01" inputmode="decimal">
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">تُستخدم للتحقق من صحة أرقام فواتير المشتريات الممسوحة تلقائيًا — لو تغيّرت نسبة الضريبة رسميًا، عدّلها هنا.</p>
        <div class="settings-field-row">
          <label><input type="checkbox" id="settingsPricesIncludeVat" ${PRICES_INCLUDE_VAT?'checked':''}> أسعار المنيو شاملة الضريبة</label>
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">هذا هو المعيار القانوني بالسعودية — نظام حماية المستهلك يُلزم بعرض السعر شاملًا للضريبة. لو تسعّر منتجاتك بهذا الشكل فعليًا (الوضع الافتراضي)، اترك هذا الخيار مفعّل — الضريبة تُحسب من داخل السعر المعروض بدل ما تُضاف فوقه. عطّله بس لو أسعار منيوك مسجّلة فعلًا بدون الضريبة.</p>
        <div class="settings-field-row">
          <label>الرقم الضريبي (VAT Registration Number)</label>
          <input type="text" id="settingsVatNumber" value="${BUSINESS_VAT_NUMBER}" placeholder="٣xxxxxxxxxxxxx03" inputmode="numeric" maxlength="15">
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">مطلوب لطباعة فاتورة ضريبية مبسطة متوافقة مع هيئة الزكاة والضريبة والجمارك (رمز QR) على فواتير الكاشير — بدونه تُطبع الفاتورة بدون رمز QR.</p>
      </div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="settingsDineInEnabled" ${DINE_IN_ENABLED?'checked':''}> يقدّم طلبات "بالمطعم" (فيه صالة/طاولات)</label>
      </div>
      <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">أوقفها لو مطعمك سحابي أو توصيل/استلام بس — تختفي شاشة الطاولات وخيار "بالمطعم" من الكاشير.</p>
      <div class="menu-add-field" style="margin-top:10px;">
        <label>شعار المطعم</label>
        <input type="file" id="settingsLogoInput" accept="image/*">
        <p class="stock-qty-helper" style="margin-top:6px;">يظهر بترويسة تقارير PDF المصدّرة، وباعتماد المطعم بلوحة التحكم.</p>
      </div>
      <button class="settings-save-btn" id="settingsSaveBtn">حفظ التغييرات</button>
    </div>
    <div class="panel" style="margin-top:16px;">
      <div class="panel-title"><span class="field-label-row">المنيو الإلكتروني ${helpIcon('صفحة طلب مباشر لعملائك — يتصفحون المنيو ويطلبون توصيل أو استلام، ويوصل الطلب مباشرة لنظامك. مفعّلة تلقائيًا لكل حساب جديد.')}</span></div>
      ${ONLINE_ORDERING_ENABLED ? `
        <div class="settings-field-row" style="margin-bottom:10px;">
          <label style="color:var(--lime-deep, #7a9e1a); font-weight:800;">✓ مفعّلة لمطعمك</label>
        </div>
        ${ONLINE_SUBSCRIBED ? `
        <div class="settings-field-row" style="margin-bottom:14px;">
          <label style="color:var(--lime-deep, #7a9e1a); font-weight:800;">✓ مشترك — طلبات بلا حد</label>
        </div>
        ` : `
        <div class="settings-field-row" style="margin-bottom:14px;">
          <label>الفترة التجريبية المجانية</label>
          <div style="height:8px; background:var(--line-soft, rgba(23,23,23,.08)); border-radius:99px; overflow:hidden; margin-top:6px;">
            <div style="height:100%; width:${Math.min(100, (ONLINE_ORDER_FREE_COUNT/ONLINE_ORDER_FREE_LIMIT)*100)}%; background:${ONLINE_ORDER_FREE_COUNT>=ONLINE_ORDER_FREE_LIMIT?'#B0402C':'var(--lime-deep,#7a9e1a)'}; border-radius:99px;"></div>
          </div>
          <p class="stock-qty-helper" style="margin-top:6px;">${ONLINE_ORDER_FREE_COUNT>=ONLINE_ORDER_FREE_LIMIT
            ? `خلصت أول ${ONLINE_ORDER_FREE_LIMIT} طلب مجاني — المتجر مقفول عن العملاء لين تشترك. تواصل مع ركين لتفعيل الاشتراك.`
            : `استخدمت ${ONLINE_ORDER_FREE_COUNT} من ${ONLINE_ORDER_FREE_LIMIT} طلب مجاني على متجرك الإلكتروني. بعدها يحتاج اشتراك عشان يفضل المتجر شغال.`}</p>
        </div>
        `}
        <div class="settings-field-row">
          <label>رابط المنيو</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="onlineMenuUrlDisplay" readonly value="${window.location.origin}/order/${ONLINE_MENU_SLUG||''}" style="flex:1;">
            <button class="settings-save-btn" id="copyOnlineMenuUrlBtn" style="width:auto; padding:10px 16px; margin:0;" type="button">نسخ</button>
          </div>
        </div>
        <div class="settings-field-row">
          <label>لون هوية صفحة الطلب</label>
          <input type="color" id="settingsOnlineThemeColor" value="${ONLINE_THEME_COLOR}" style="width:64px; height:38px; padding:2px; cursor:pointer;">
          <p class="stock-qty-helper" style="margin-top:6px;">يُطبّق تلقائيًا على كل أزرار وشارات صفحة الطلب — نص أبيض أو غامق يُختار تلقائيًا حسب وضوحه فوق اللون.</p>
        </div>
        <div class="menu-add-field" style="margin-top:2px;">
          <label>صورة غلاف صفحة الطلب</label>
          ${ONLINE_BANNER_URL ? `<img src="${ONLINE_BANNER_URL}" alt="" style="width:100%; max-width:280px; height:100px; object-fit:cover; border-radius:10px; margin-bottom:8px;">` : ''}
          <input type="file" id="settingsOnlineBannerInput" accept="image/*">
          ${ONLINE_BANNER_URL ? `<label style="display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; margin-top:8px;"><input type="checkbox" id="settingsOnlineBannerClear"> إزالة صورة الغلاف الحالية</label>` : ''}
          <p class="stock-qty-helper" style="margin-top:6px;">صورة عريضة تظهر أعلى صفحة الطلب — تُبهر العميل من أول لحظة. بدونها تظهر الصفحة بلون هوية بسيط بدل الصورة.</p>
        </div>
        <div class="settings-field-row">
          <label><input type="checkbox" id="settingsOnlineDelivery" ${ONLINE_OFFERS_DELIVERY?'checked':''}> يقبل طلبات توصيل من المنيو الإلكتروني</label>
        </div>
        <div class="settings-field-row">
          <label><input type="checkbox" id="settingsOnlinePickup" ${ONLINE_OFFERS_PICKUP?'checked':''}> يقبل طلبات استلام من المنيو الإلكتروني</label>
        </div>
        <div class="settings-field-row">
          <label>رسوم التوصيل الخاصة بالمطعم (ر.س)</label>
          <input type="number" id="settingsOnlineDeliveryFee" value="${ONLINE_DELIVERY_FEE}" min="0" step="0.5" inputmode="decimal">
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">توصيل ذاتي بمندوب المطعم — رسوم ثابتة تُضاف لطلبات التوصيل من المنيو الإلكتروني (اتركها 0 للتوصيل المجاني). ربط شركة توصيل خارجية عبر API يحتاج تفعيل إضافي من فريق ركين.</p>
        <div class="settings-field-row">
          <label>مدة تجهيز طلبات الاستلام (بالدقائق)</label>
          <input type="number" id="settingsOnlinePickupPrep" value="${ONLINE_PICKUP_PREP_MINUTES}" min="1" max="180" inputmode="numeric">
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">أقل وقت يعرضه المنيو الإلكتروني كـ"أقرب وقت استلام" — حدد وقت دوام الفرع من تبويب "الفروع" عشان يقدر العميل يختار وقت استلام لاحق أيضًا.</p>
        <div class="settings-field-row">
          <label>رقم واتساب للتواصل مع العملاء</label>
          <input type="text" id="settingsOnlineWhatsapp" value="${ONLINE_CONTACT_WHATSAPP}" placeholder="05xxxxxxxx" inputmode="tel">
        </div>
        <p class="stock-qty-helper" style="margin-top:-6px; margin-bottom:10px;">يظهر كزر "تواصل معنا عبر واتساب" بصفحة تتبع الطلب — سيبه فاضي لإخفاء الزر.</p>
        <button class="settings-save-btn" id="settingsOnlineSaveBtn">حفظ إعدادات المنيو الإلكتروني</button>
      ` : `
        <p class="stock-qty-helper">هذي الميزة غير مفعّلة لمطعمك حاليًا — تواصل مع فريق ركين لتفعيلها.</p>
      `}
    </div>
    ${ONLINE_ORDERING_ENABLED ? `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-title"><span class="field-label-row">بوابة الدفع ${helpIcon('اربط حساب Geidea الخاص فيك عشان يقدر عملاؤك يدفعون بالبطاقة مباشرة من صفحة الطلب الإلكتروني. سجّل عندهم بنفسك، وهنا بس تدخل بيانات الاتصال.')}</span></div>
      <div id="geideaPanelBody">${geideaPanelHtml()}</div>
    </div>
    ` : ''}
    ${isServiceBusinessType(BUSINESS_TYPE) ? `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-title"><span class="field-label-row">الحجز الذاتي عبر الإنترنت ${helpIcon('صفحة تسمح لعملائك يحجزون موعدهم بأنفسهم مباشرة بدون اتصال — يختارون الخدمة والموظف والوقت، ويوصل الحجز فورًا لشاشة الحجوزات بالكاشير.')}</span></div>
      <div class="settings-field-row">
        <label><input type="checkbox" id="settingsOnlineBookingEnabled" ${ONLINE_BOOKING_ENABLED?'checked':''}> تفعيل صفحة الحجز الذاتي لعملائك</label>
      </div>
      <div id="onlineBookingUrlRow" class="settings-field-row" style="${ONLINE_BOOKING_ENABLED?'':'display:none;'}">
        <label>رابط صفحة الحجز</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" id="onlineBookingUrlDisplay" readonly value="${window.location.origin}/book/${ONLINE_MENU_SLUG||''}" style="flex:1;">
          <button class="settings-save-btn" id="copyOnlineBookingUrlBtn" style="width:auto; padding:10px 16px; margin:0;" type="button">نسخ</button>
        </div>
      </div>
      <button class="settings-save-btn" id="settingsOnlineBookingSaveBtn" style="width:auto; padding:0 18px;">حفظ</button>
    </div>
    ` : ''}
  `;
}
function wireRestaurantSettings(){
  wireGeideaPanel();

  const vatRegisteredCheckbox = document.getElementById('settingsVatRegistered');
  if(vatRegisteredCheckbox) vatRegisteredCheckbox.addEventListener('change', ()=>{
    const fields = document.getElementById('vatRegisteredFields');
    if(fields) fields.style.display = vatRegisteredCheckbox.checked ? '' : 'none';
  });

  const btn = document.getElementById('settingsSaveBtn');
  btn.addEventListener('click', async ()=>{
    const name = document.getElementById('settingsRestName').value.trim();
    if(!name){ showToast('اسم المطعم مطلوب'); return; }
    const vatRegistered = document.getElementById('settingsVatRegistered').checked;
    const vatPct = parseFloat(document.getElementById('settingsVatRate').value);
    if(vatRegistered && !(vatPct >= 0 && vatPct <= 100)){ showToast('نسبة الضريبة لازم تكون رقم بين 0 و100'); return; }
    const vatNumber = document.getElementById('settingsVatNumber').value.trim();
    if(vatRegistered && vatNumber && !/^\d{15}$/.test(vatNumber)){ showToast('الرقم الضريبي لازم يكون ١٥ رقم بالضبط'); return; }
    btn.disabled = true;
    try {
      const dineInEnabled = document.getElementById('settingsDineInEnabled').checked;
      const pricesIncludeVat = document.getElementById('settingsPricesIncludeVat').checked;
      const updates = {
        name, vat_registered: vatRegistered,
        vat_rate: (vatPct >= 0 && vatPct <= 100) ? vatPct / 100 : BUSINESS_VAT_RATE,
        vat_number: vatNumber || null, prices_include_vat: pricesIncludeVat, dine_in_enabled: dineInEnabled
      };
      const logoFile = await compressImageFile(document.getElementById('settingsLogoInput').files[0]);
      if(logoFile){
        updates.logo_url = await uploadMediaFile(logoFile, 'business-branding', 'logo');
      }
      const { error } = await window.supabaseClient.from('businesses').update(updates).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      RESTAURANT_INFO.name = name;
      VAT_REGISTERED = vatRegistered;
      BUSINESS_VAT_RATE = updates.vat_rate;
      BUSINESS_VAT_NUMBER = updates.vat_number || '';
      PRICES_INCLUDE_VAT = pricesIncludeVat;
      DINE_IN_ENABLED = dineInEnabled;
      if(updates.logo_url) BUSINESS_LOGO_URL = updates.logo_url;
      renderSettingsPanel();
      showToast('تم حفظ معلومات المطعم'); logDashboardAudit('عدّل معلومات المطعم');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      btn.disabled = false;
    }
  });

  const copyBtn = document.getElementById('copyOnlineMenuUrlBtn');
  if(copyBtn) copyBtn.addEventListener('click', ()=>{
    const input = document.getElementById('onlineMenuUrlDisplay');
    input.select();
    navigator.clipboard?.writeText(input.value).then(()=> showToast('تم نسخ الرابط')).catch(()=> showToast('انسخه يدويًا من الحقل'));
  });

  const onlineSaveBtn = document.getElementById('settingsOnlineSaveBtn');
  if(onlineSaveBtn) onlineSaveBtn.addEventListener('click', async ()=>{
    onlineSaveBtn.disabled = true;
    try {
      const updates = {
        online_theme_color: document.getElementById('settingsOnlineThemeColor').value,
        online_offers_delivery: document.getElementById('settingsOnlineDelivery').checked,
        online_offers_pickup: document.getElementById('settingsOnlinePickup').checked,
        online_delivery_fee: parseFloat(document.getElementById('settingsOnlineDeliveryFee').value) || 0,
        online_pickup_prep_minutes: parseInt(document.getElementById('settingsOnlinePickupPrep').value, 10) || 20,
        online_contact_whatsapp: document.getElementById('settingsOnlineWhatsapp').value.trim() || null,
      };
      const bannerFile = await compressImageFile(document.getElementById('settingsOnlineBannerInput').files[0]);
      const bannerClear = document.getElementById('settingsOnlineBannerClear');
      if(bannerFile){
        updates.online_banner_url = await uploadMediaFile(bannerFile, 'business-branding', 'online-banner');
      } else if(bannerClear && bannerClear.checked){
        updates.online_banner_url = null;
      }
      const { error } = await window.supabaseClient.from('businesses').update(updates).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      ONLINE_THEME_COLOR = updates.online_theme_color;
      if('online_banner_url' in updates) ONLINE_BANNER_URL = updates.online_banner_url || '';
      ONLINE_OFFERS_DELIVERY = updates.online_offers_delivery;
      ONLINE_OFFERS_PICKUP = updates.online_offers_pickup;
      ONLINE_DELIVERY_FEE = updates.online_delivery_fee;
      ONLINE_PICKUP_PREP_MINUTES = updates.online_pickup_prep_minutes;
      ONLINE_CONTACT_WHATSAPP = updates.online_contact_whatsapp || '';
      renderSettingsPanel();
      showToast('تم حفظ إعدادات المنيو الإلكتروني'); logDashboardAudit('عدّل إعدادات المنيو الإلكتروني');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      onlineSaveBtn.disabled = false;
    }
  });

  const bookingEnabledCheckbox = document.getElementById('settingsOnlineBookingEnabled');
  if(bookingEnabledCheckbox) bookingEnabledCheckbox.addEventListener('change', ()=>{
    const row = document.getElementById('onlineBookingUrlRow');
    if(row) row.style.display = bookingEnabledCheckbox.checked ? '' : 'none';
  });

  const copyBookingBtn = document.getElementById('copyOnlineBookingUrlBtn');
  if(copyBookingBtn) copyBookingBtn.addEventListener('click', ()=>{
    const input = document.getElementById('onlineBookingUrlDisplay');
    input.select();
    navigator.clipboard?.writeText(input.value).then(()=> showToast('تم نسخ الرابط')).catch(()=> showToast('انسخه يدويًا من الحقل'));
  });

  const bookingSaveBtn = document.getElementById('settingsOnlineBookingSaveBtn');
  if(bookingSaveBtn) bookingSaveBtn.addEventListener('click', async ()=>{
    bookingSaveBtn.disabled = true;
    try {
      const enabled = document.getElementById('settingsOnlineBookingEnabled').checked;
      const { error } = await window.supabaseClient.from('businesses').update({ online_booking_enabled: enabled }).eq('id', CURRENT_PROFILE.business_id);
      if(error) throw error;
      ONLINE_BOOKING_ENABLED = enabled;
      renderSettingsPanel();
      showToast(enabled ? 'تم تفعيل الحجز الذاتي' : 'تم إيقاف الحجز الذاتي'); logDashboardAudit('عدّل إعداد الحجز الذاتي عبر الإنترنت');
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      bookingSaveBtn.disabled = false;
    }
  });
}

function renderFixedCostsTab(){
  document.getElementById('fixedCostsPanelBody').innerHTML = fixedCostsSettingsHtml();
  wireFixedCostsSettings();
}

function fixedCostsSettingsHtml(){
  return `
    <div class="panel">
      <div class="panel-title">
        <span class="field-label-row">المصاريف الثابتة ${helpIcon('مصاريف تدفعها كل شهر بغض النظر عن مبيعاتك — إيجار، رواتب، فواتير. تختلف عن "التكلفة المتغيرة" اللي تتغيّر حسب كل منتج تبيعه (مكوّناته وتغليفه). ركين يوزّع هالمصاريف على كل منتج تلقائيًا حسب عدد القطع المباعة، عشان يطلع لك صافي ربح دقيق لكل صنف.')}</span>
      </div>
      <p style="font-size:11.5px; color:var(--muted); font-weight:600; margin-bottom:18px;">هذا الرقم هو اللي يظهر بكل منتج تحت "حصة المصاريف الثابتة" — عدّله هنا وينعكس تلقائيًا على هامش ربح كل منتج بالقائمة.</p>

      <div class="menu-add-row" style="margin-bottom:6px;">
        <div class="menu-add-field"><label class="field-label-row">الإيجار الشهري (ر.س) ${helpIcon('إيجار المحل أو الفرع شهريًا.')}</label><input type="number" id="fcRent" value="${FIXED_COSTS.rent}"></div>
        <div class="menu-add-field"><label class="field-label-row">الرواتب الشهرية (ر.س) ${helpIcon('إجمالي رواتب كل الموظفين شهريًا.')}</label><input type="number" id="fcSalaries" value="${FIXED_COSTS.salaries}"></div>
      </div>
      <div class="menu-add-row" style="margin-bottom:16px;">
        <div class="menu-add-field"><label class="field-label-row">الفواتير والخدمات (ر.س) ${helpIcon('كهرباء، ماء، إنترنت، اشتراكات — كل شي يتكرر شهريًا بغض النظر عن المبيعات.')}</label><input type="number" id="fcUtilities" value="${FIXED_COSTS.utilities}"></div>
        <div class="menu-add-field"><label class="field-label-row">مصاريف أخرى (ر.س) ${helpIcon('أي شي ثابت شهري ما يندرج تحت الفئات فوق — صيانة، تأمين، وغيرها.')}</label><input type="number" id="fcOther" value="${FIXED_COSTS.other}"></div>
      </div>

      <div class="cost-preview-box" id="fcPreviewBox"></div>
      <button class="settings-save-btn" id="fcSaveBtn" style="margin-top:14px;">حفظ المصاريف الثابتة</button>
    </div>
  `;
}
function updateFixedCostsPreview(){
  const rent = parseFloat(document.getElementById('fcRent').value)||0;
  const salaries = parseFloat(document.getElementById('fcSalaries').value)||0;
  const utilities = parseFloat(document.getElementById('fcUtilities').value)||0;
  const other = parseFloat(document.getElementById('fcOther').value)||0;
  const total = rent+salaries+utilities+other;
  const totalUnitsToday = ALL_SELLERS.reduce((s,p)=>s+p.qty, 0);
  const perUnit = totalUnitsToday>0 ? total/(totalUnitsToday*30) : 0;
  document.getElementById('fcPreviewBox').innerHTML = `
    <div class="cpb-row total"><span>إجمالي المصاريف الثابتة الشهرية</span><span class="mono">${total.toFixed(2)} ر.س</span></div>
    <div class="cpb-row"><span class="field-label-row">حصة كل قطعة مباعة ${helpIcon('الإجمالي الشهري ÷ (متوسط قطعك المباعة يوميًا × ٣٠ يوم) — هذا الرقم بالضبط اللي يظهر بتكلفة كل منتج.')}</span><span class="mono">${perUnit.toFixed(2)} ر.س</span></div>
  `;
}
function wireFixedCostsSettings(){
  ['fcRent','fcSalaries','fcUtilities','fcOther'].forEach(id=> document.getElementById(id).addEventListener('input', updateFixedCostsPreview));
  updateFixedCostsPreview();
  document.getElementById('fcSaveBtn').addEventListener('click', async ()=>{
    const rent = parseFloat(document.getElementById('fcRent').value)||0;
    const salaries = parseFloat(document.getElementById('fcSalaries').value)||0;
    const utilities = parseFloat(document.getElementById('fcUtilities').value)||0;
    const other = parseFloat(document.getElementById('fcOther').value)||0;
    const saveBtn = document.getElementById('fcSaveBtn');
    saveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from('fixed_costs')
        .upsert({business_id: CURRENT_PROFILE.business_id, rent, salaries, utilities, other, updated_at: new Date().toISOString()});
      if(error) throw error;
      FIXED_COSTS.rent = rent; FIXED_COSTS.salaries = salaries; FIXED_COSTS.utilities = utilities; FIXED_COSTS.other = other;
      logDashboardAudit('حدّث المصاريف الثابتة الشهرية إلى ' + getMonthlyFixedCostsTotal().toFixed(2) + ' ر.س');
      showToast('تم الحفظ — هامش الربح لكل منتج تحدّث تلقائيًا');
      if(typeof renderMenuProductTable === 'function') renderMenuProductTable();
      if(typeof renderOnboardingChecklist === 'function') renderOnboardingChecklist();
    } catch(err){
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      saveBtn.disabled = false;
    }
  });
}

/* ============ Menu Management — full cost accounting engine.
   Fixed-cost allocation reuses today's REAL opex (ACCOUNTING.opex) and REAL unit volume
   (ALL_SELLERS), the same figures already shown on Accounting/Sales. Recipe ingredient costs
   reuse STOCK_ITEMS.unitCost — the same source that drives the Inventory screen. Nothing here
   is a separate, disconnected number. */
let MENU_CATEGORIES = ['مشروبات ساخنة','مشروبات باردة','أطباق رئيسية','حلا','مخبوزات','ورق عنب'];
/* ============ Modifier Groups — a reusable library, created once and attached to any product.
   Migrated from what used to be inline per-product modifiers, so nothing is lost, just made reusable. */
let MODIFIER_GROUPS = [
  {id:1, name:'الحجم', type:'single', max:1, options:[
    {name:'صغير', priceDelta:-3, costMode:'simple', extraCost:0},
    {name:'وسط', priceDelta:0, costMode:'simple', extraCost:0},
    {name:'كبير', priceDelta:4, costMode:'simple', extraCost:0}
  ]},
  {id:2, name:'نوع الحليب', type:'single', max:1, options:[
    {name:'حليب عادي', priceDelta:0, costMode:'simple', extraCost:0},
    {name:'حليب شوفان', priceDelta:4, costMode:'simple', extraCost:0.35},
    {name:'حليب لوز', priceDelta:4, costMode:'simple', extraCost:0.40}
  ]},
  {id:3, name:'إضافات البرجر', type:'multiple', max:4, options:[
    {name:'جبن إضافي', priceDelta:5, costMode:'stock', stockLink:{ingredient:'جبن', qty:20, unit:'g'}},
    {name:'بدون بصل', priceDelta:0, costMode:'simple', extraCost:0},
    {name:'بيكون', priceDelta:8, costMode:'stock', stockLink:{ingredient:'بيكون', qty:20, unit:'g'}}
  ]},
  {id:4, name:'درجة النضج', type:'single', max:1, options:[
    {name:'متوسط', priceDelta:0, costMode:'simple', extraCost:0}, {name:'ويل دن', priceDelta:0, costMode:'simple', extraCost:0}
  ]},
  {id:5, name:'محتوى البوكس الصغير', type:'quantity', max:6, options:[
    {name:'سمبوسة دجاج', priceDelta:0, costMode:'stock', stockLink:{ingredient:'سمبوسة دجاج', qty:1, unit:'piece'}, optionMax:2},
    {name:'ورق عنب', priceDelta:0, costMode:'stock', stockLink:{ingredient:'ورق عنب', qty:1, unit:'piece'}, optionMax:null},
    {name:'سمبوسة لحم', priceDelta:0, costMode:'stock', stockLink:{ingredient:'سمبوسة لحم', qty:1, unit:'piece'}, optionMax:3}
  ]}
];
let modGroupIdCounter = 6;
let editingModGroupId = null;

// Server-computed cost figures (menu_item_id -> {variableCost, variableCostMin, variableCostMax}),
// decrypted and computed by menu_item_costs() — see loadBusinessData(). Recipe/box-mix
// quantities are encrypted at rest, so this is the only source computeVariableCost() uses now.
let MENU_ITEM_COST_BY_ID = {};

let MENU_ITEMS = [
  {id:1, name:'قهوة عربي', price:12, category:'مشروبات ساخنة', active:true, image:null,
    costMode:'direct', directCost:3.80, linkInventory:false, linkProfit:true, recipe:[], modifierGroupIds:[]},
  {id:2, name:'لاتيه', price:18, category:'مشروبات ساخنة', active:true, image:null,
    costMode:'recipe', directCost:0, linkInventory:true, linkProfit:true,
    recipe:[{ingredient:'حليب', qty:0.18, unit:'liter'}, {ingredient:'حبوب قهوة', qty:20, unit:'g'}, {ingredient:'كوب وغطاء (حار)', qty:1, unit:'piece'}], modifierGroupIds:[1,2]},
  {id:3, name:'لاتيه مثلج', price:20, category:'مشروبات باردة', active:true, image:null,
    costMode:'recipe', directCost:0, linkInventory:true, linkProfit:true,
    recipe:[{ingredient:'حليب', qty:0.2, unit:'liter'}, {ingredient:'حبوب قهوة', qty:20, unit:'g'}, {ingredient:'كوب وغطاء (بارد)', qty:1, unit:'piece'}], modifierGroupIds:[1]},
  {id:4, name:'برجر لحم', price:32, category:'أطباق رئيسية', active:true, image:null,
    costMode:'recipe', directCost:0, linkInventory:true, linkProfit:true,
    recipe:[{ingredient:'لحم برجر', qty:150, unit:'g'}, {ingredient:'خبز برجر', qty:1, unit:'piece'}, {ingredient:'جبن', qty:20, unit:'g'}, {ingredient:'كرتون تغليف', qty:1, unit:'piece'}, {ingredient:'كيس تغليف', qty:1, unit:'piece'}],
    modifierGroupIds:[3,4]},
  {id:5, name:'بيتزا مارجريتا', price:38, category:'أطباق رئيسية', active:true, image:null,
    costMode:'direct', directCost:12.20, linkInventory:false, linkProfit:true, recipe:[], modifierGroupIds:[1]},
  {id:6, name:'سلطة سيزر', price:24, category:'أطباق رئيسية', active:true, image:null,
    costMode:'direct', directCost:8.30, linkInventory:false, linkProfit:true, recipe:[], modifierGroupIds:[]},
  {id:7, name:'كنافة', price:20, category:'حلا', active:true, image:null,
    costMode:'direct', directCost:5.50, linkInventory:false, linkProfit:true, recipe:[], modifierGroupIds:[]},
  {id:8, name:'مياه معدنية', price:5, category:'مشروبات باردة', active:false, image:null,
    costMode:'direct', directCost:1.20, linkInventory:false, linkProfit:false, recipe:[], modifierGroupIds:[]},
  {id:9, name:'دجاج بالصوص', price:26, category:'أطباق رئيسية', active:true, image:null,
    costMode:'recipe', directCost:0, linkInventory:true, linkProfit:true,
    recipe:[{ingredient:'دجاج', qty:150, unit:'g'}, {ingredient:'طماطم', qty:50, unit:'g'}, {ingredient:'صوص', qty:20, unit:'g'},
             {ingredient:'كرتون تغليف', qty:1, unit:'piece'}, {ingredient:'كيس تغليف', qty:1, unit:'piece'}, {ingredient:'ملعقة', qty:4, unit:'piece'}],
    modifierGroupIds:[]},
  {id:10, name:'بوكس وسط', price:70, category:'ورق عنب', active:true, image:null,
    costMode:'box', directCost:0, linkInventory:true, linkProfit:true,
    recipe:[{ingredient:'كرتون تغليف', qty:1, unit:'piece'}, {ingredient:'كيس تغليف', qty:1, unit:'piece'}],
    componentSlot:{totalPieces:18, eligibleItems:['سمبوسة دجاج','سمبوسة لحم','ورق عنب'], defaultMix:[{ingredient:'سمبوسة دجاج', qty:6}, {ingredient:'سمبوسة لحم', qty:6}, {ingredient:'ورق عنب', qty:6}]},
    modifierGroupIds:[]},
  {id:11, name:'بوكس كبير', price:99, category:'ورق عنب', active:true, image:null,
    costMode:'box', directCost:0, linkInventory:true, linkProfit:true,
    recipe:[{ingredient:'كرتون تغليف كبير', qty:1, unit:'piece'}, {ingredient:'كيس تغليف', qty:1, unit:'piece'}],
    componentSlot:{totalPieces:36, eligibleItems:['سمبوسة دجاج','سمبوسة لحم','ورق عنب','مسخن'], defaultMix:[{ingredient:'سمبوسة دجاج', qty:9}, {ingredient:'سمبوسة لحم', qty:9}, {ingredient:'ورق عنب', qty:9}, {ingredient:'مسخن', qty:9}]},
    modifierGroupIds:[]}
];
let menuIdCounter = 12;
let editingProductId = null; // null = adding new, otherwise editing existing

/* ============ Fixed Costs (المصاريف الثابتة) — genuinely editable monthly amounts, used for
   product costing decisions (standard/budgeted costing). Distinct from today's already-recorded
   ACCOUNTING P&L (a historical fact) — this is your forward-looking monthly overhead rate.
   Seeded to exactly match the fixed-cost-per-unit already used throughout (5.67), verified via
   Python before implementation, so editing this is additive — it changes nothing until touched. */
let FIXED_COSTS = {rent:8294.40, salaries:21427.20, utilities:3110.40, other:1728.00};
function getMonthlyFixedCostsTotal(){
  return FIXED_COSTS.rent + FIXED_COSTS.salaries + FIXED_COSTS.utilities + FIXED_COSTS.other;
}
function computeFixedCostPerUnit(){
  const totalUnitsToday = ALL_SELLERS.reduce((s,p)=>s+p.qty, 0);
  const estimatedMonthlyUnits = totalUnitsToday * 30;
  return estimatedMonthlyUnits > 0 ? getMonthlyFixedCostsTotal() / estimatedMonthlyUnits : 0;
}
function computeVariableCost(item, mode){
  mode = mode || 'default';
  if(item.costMode === 'direct') return item.directCost || 0;
  // recipe/box costs are computed server-side by menu_item_costs() and
  // decrypted there — the client never holds real recipe quantities in bulk
  // (see loadBusinessData), only whatever this RPC already resolved to a number.
  const c = MENU_ITEM_COST_BY_ID[item.id];
  if(!c) return 0;
  if(item.costMode === 'box'){
    if(mode === 'min') return c.variableCostMin || 0;
    if(mode === 'max') return c.variableCostMax || 0;
  }
  return c.variableCost || 0;
}
function computeProductCost(item){
  const variable = computeVariableCost(item, 'default');
  const fixedAlloc = item.linkProfit ? computeFixedCostPerUnit() : 0;
  const total = variable + fixedAlloc;
  const profit = item.price - total;
  const marginPct = item.price > 0 ? (profit/item.price*100) : 0;
  const result = {variable, fixedAlloc, total, profit, marginPct};
  if(item.costMode === 'box' && item.componentSlot){
    const totalMin = computeVariableCost(item, 'min') + fixedAlloc;
    const totalMax = computeVariableCost(item, 'max') + fixedAlloc;
    result.totalMin = totalMin; result.totalMax = totalMax;
    // cheapest fill -> best margin; priciest fill -> worst margin
    result.marginBest = item.price>0 ? ((item.price-totalMin)/item.price*100) : 0;
    result.marginWorst = item.price>0 ? ((item.price-totalMax)/item.price*100) : 0;
  }
  return result;
}
/* ============ Reusable help icon — one delegated handler covers every "؟" anywhere in the app,
   including ones inside dynamically-rendered modals, so nothing needs re-wiring. */
function helpIcon(text){
  return `<span class="help-icon" data-help="${text.replace(/"/g,'&quot;')}">؟</span>`;
}
document.addEventListener('click', (e)=>{
  const icon = e.target.closest('.help-icon');
  document.querySelectorAll('.help-popover').forEach(p=> p.remove());
  document.querySelectorAll('.help-icon.open').forEach(i=> i.classList.remove('open'));
  if(icon){
    e.preventDefault(); // stop the icon's parent <label> (if any) from forwarding this click to its checkbox
    icon.classList.add('open');
    const pop = document.createElement('div');
    pop.className = 'help-popover show';
    pop.textContent = icon.dataset.help;
    icon.appendChild(pop);
    e.stopPropagation();
  }
});

function marginTier(marginPct){
  if(marginPct >= 50) return 'good';
  if(marginPct >= 30) return 'mid';
  return 'bad';
}
function computeModifierOptionCost(option){
  if(option.costMode === 'stock' && option.stockLink){
    const stockItem = STOCK_ITEMS.find(s=>s.name===option.stockLink.ingredient);
    if(!stockItem) return 0;
    const qtyInStockUnit = convertToUnit(option.stockLink.qty, option.stockLink.unit, stockItem.unit);
    return qtyInStockUnit * stockItem.unitCost;
  }
  return option.extraCost || 0;
}

function menuSettingsHtml(){
  // kept for reference but no longer used directly — Menu now lives on its own screen
  return '';
}

/* ============ Category tabs — simple, standard, renameable ============ */
let menuSearchQuery = '';
let activeMenuCategory = null; // null = show all
let renamingCategory = null;

function renderCategoryTabs(){
  const el = document.getElementById('menuCategoryTabs');
  // Same archived-ghost exclusion as renderMenuProductTable — otherwise
  // these counts don't match how many rows the table actually shows.
  const countableItems = MENU_ITEMS.filter(m=>!m.name.includes('(مؤرشف)'));
  const allCount = countableItems.length;
  let html = `<button class="menu-cat-tab ${activeMenuCategory===null?'active':''}" data-cat="__all__">كل المنتجات <span class="mct-count">${allCount}</span></button>`;
  html += MENU_CATEGORIES.map(cat=>{
    const count = countableItems.filter(m=>m.category===cat).length;
    if(renamingCategory === cat){
      return `<input type="text" class="menu-cat-tab-rename-input" id="catRenameInput" value="${cat}" data-original="${cat}">`;
    }
    return `<button class="menu-cat-tab ${activeMenuCategory===cat?'active':''}" data-cat="${cat}">
      ${cat} <span class="mct-count">${count}</span>
      <span class="mct-rename" data-rename="${cat}" title="إعادة تسمية">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      </span>
    </button>`;
  }).join('');
  el.innerHTML = html;

  el.querySelectorAll('.menu-cat-tab').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      if(e.target.closest('.mct-rename')) return;
      activeMenuCategory = btn.dataset.cat === '__all__' ? null : btn.dataset.cat;
      renderCategoryTabs();
      renderMenuProductTable();
    });
  });
  el.querySelectorAll('.mct-rename').forEach(span=>{
    span.addEventListener('click', (e)=>{
      e.stopPropagation();
      renamingCategory = span.dataset.rename;
      renderCategoryTabs();
    });
  });
  const renameInput = document.getElementById('catRenameInput');
  if(renameInput){
    renameInput.focus(); renameInput.select();
    renameInput.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter') renameInput.blur(); if(ev.key==='Escape'){ renamingCategory=null; renderCategoryTabs(); } });
    renameInput.addEventListener('blur', ()=> confirmCategoryRename(renameInput));
  }
}

function confirmCategoryRename(input){
  const oldName = input.dataset.original;
  const newName = input.value.trim();
  renamingCategory = null;
  if(!newName || newName === oldName){ renderCategoryTabs(); return; }
  if(MENU_CATEGORIES.includes(newName)){ showToast('فيه فئة بنفس هذا الاسم أصلًا'); renderCategoryTabs(); return; }

  const idx = MENU_CATEGORIES.indexOf(oldName);
  MENU_CATEGORIES[idx] = newName;
  MENU_ITEMS.forEach(m=>{ if(m.category === oldName) m.category = newName; }); // cascade to every product using it
  if(activeMenuCategory === oldName) activeMenuCategory = newName;
  logDashboardAudit('أعاد تسمية فئة "' + oldName + '" إلى "' + newName + '"');
  showToast('تم تحديث اسم الفئة');
  renderCategoryTabs();
  renderMenuProductTable();
}

/* ============ Product table — clean, scannable, one Edit entry point ============ */
function renderCostCompletionBanner(){
  const el = document.getElementById('costCompletionBanner');
  if(!el) return;
  const incomplete = MENU_ITEMS.filter(m => !m.linkProfit);
  if(incomplete.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="cost-completion-banner">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span><b>${incomplete.length}</b> منتج لسا بدون تكلفة محددة (ما يدخل بحساب الأرباح):
      ${incomplete.map(m=>`<button class="ccb-item-link" data-id="${m.id}">${m.name}</button>`).join('، ')}
    </span>
  </div>`;
  el.querySelectorAll('.ccb-item-link').forEach(btn=>{
    btn.addEventListener('click', ()=> openProductEditModal(parseInt(btn.dataset.id)));
  });
}

function renderMenuProductTable(){
  // Deleting a product that already has real order history can't hard-delete
  // the row (order_items still points at it, on purpose — see
  // deleteProductFromModal) — it gets archived instead: active:false, name
  // suffixed "(مؤرشف)". That's the right call for the data, but it used to
  // leave a permanent, un-removable ghost row sitting in this table forever
  // (an owner who "deletes" a product expects it gone from the list, not
  // renamed-and-greyed-out). Excluded here — a plain toggled-off-but-not-
  // archived item (temporarily out of stock, say) still shows normally.
  const visibleItems = MENU_ITEMS.filter(m=>!m.name.includes('(مؤرشف)'));
  const totalEl = document.getElementById('menuTotalCount');
  if(totalEl) totalEl.textContent = visibleItems.length;
  let items = activeMenuCategory === null ? visibleItems : visibleItems.filter(m=>m.category===activeMenuCategory);
  if(menuSearchQuery.trim()) items = items.filter(m=>m.name.includes(menuSearchQuery.trim()));

  const el = document.getElementById('menuProductTable');
  if(items.length === 0){ el.innerHTML = '<div class="menu-table-empty">ما فيه منتجات تطابق هذا البحث أو القسم.</div>'; return; }

  el.innerHTML = items.map(item=>{
    const cost = computeProductCost(item);
    const isBox = item.costMode === 'box' && item.componentSlot;
    // costMode isn't 'direct' but the resolved variable cost is exactly 0 —
    // no recipe/mix was ever filled in, so the "margin" below is meaningless
    // (would otherwise read as a deceptive ~100%), not a real 0-cost product.
    const uncosted = item.costMode !== 'direct' && cost.variable === 0 && item.price > 0;
    const tier = !item.linkProfit || !canViewProfit() ? 'none' : uncosted ? 'bad' : marginTier(cost.marginPct);
    const marginDisplay = !canViewProfit() ? '—'
      : !item.linkProfit ? '—'
      : uncosted ? 'غير محددة ⚠️'
      : isBox ? cost.marginWorst.toFixed(0)+'٪–'+cost.marginBest.toFixed(0)+'٪'
      : cost.marginPct.toFixed(0)+'٪';
    return `<div class="menu-table-row ${item.active?'':'inactive'}" data-id="${item.id}">
      <div class="mtr-product">
        <div class="mtr-thumb">${item.image ? `<img src="${item.image}">` : productImagePlaceholderSvg()}</div>
        <div class="mtr-name-col">
          <div class="mtr-name">${item.name}</div>
          <div class="mtr-meta">${item.category}${isBox ? ' — تركيبة متغيرة ('+item.componentSlot.totalPieces+' قطعة)' : ''}${item.modifierGroupIds.length ? ' — '+item.modifierGroupIds.length+' مجموعة خيارات' : ''}</div>
        </div>
      </div>
      <div class="mtr-price mono">${item.price.toFixed(2)}</div>
      <div class="mtr-margin"><span class="cost-margin-badge ${tier}">${marginDisplay}</span></div>
      <div class="mtr-status"><button class="menu-toggle mtr-toggle ${item.active?'active':''}" data-action="toggle" data-id="${item.id}" title="${item.active?'مفعّل — اضغط للإيقاف':'موقوف — اضغط للتفعيل'}"></button></div>
      <div class="mtr-action"><button class="mtr-edit-btn" data-id="${item.id}">تعديل</button></div>
    </div>`;
  }).join('');

  el.querySelectorAll('.menu-table-row').forEach(row=>{
    row.addEventListener('click', (e)=>{
      if(e.target.closest('.mtr-toggle')) return; // toggle handles itself, doesn't open the modal
      openProductEditModal(parseInt(row.dataset.id));
    });
  });
  el.querySelectorAll('.mtr-toggle').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const item = MENU_ITEMS.find(m=>m.id===parseInt(btn.dataset.id));
      item.active = !item.active;
      logDashboardAudit((item.active?'فعّل':'أوقف') + ' صنف ' + item.name);
      showToast(item.active ? 'تم تفعيل الصنف' : 'تم إيقاف الصنف');
      renderMenuProductTable();
    });
  });
}

function productImagePlaceholderSvg(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
}

/* ============ Unified product edit modal — one entry point, three organized internal tabs.
   All three sections stay in the DOM simultaneously (just hidden) while the modal is open,
   so switching tabs never loses anything you've already typed. */
let productModalState = {};

// Recipe/box-mix quantities are encrypted at rest (see the migration adding
// encrypt_recipe_qty) — MENU_ITEMS never carries real recipe numbers for
// this exact reason (a bulk fetch of the raw table only ever returns
// ciphertext, by design). Opening an existing item's editor is the one
// legitimate moment the OWNER needs the real numbers, so it's fetched fresh,
// per-item, through get_menu_item_recipe/get_menu_item_box_mix — the same
// permission-gated RPCs that decrypt for them and only them.
async function openProductEditModal(productId){
  editingProductId = productId || null;
  const existing = productId ? MENU_ITEMS.find(m=>m.id===productId) : null;
  const slot = existing && existing.componentSlot ? existing.componentSlot : null;

  let recipe = [], defaultMix = [];
  if(existing){
    const sb = window.supabaseClient;
    const [{data: recipeRows}, {data: mixRows}] = await Promise.all([
      sb.rpc('get_menu_item_recipe', {p_menu_item_id: productId}),
      existing.costMode === 'box' ? sb.rpc('get_menu_item_box_mix', {p_menu_item_id: productId}) : Promise.resolve({data:[]})
    ]);
    recipe = (recipeRows||[]).map(r=>({ingredient: STOCK_ITEM_NAME_BY_ID[r.stock_item_id], qty:Number(r.qty), unit:r.unit})).filter(r=>r.ingredient);
    defaultMix = (mixRows||[]).map(r=>({ingredient: STOCK_ITEM_NAME_BY_ID[r.stock_item_id], qty:Number(r.qty)})).filter(r=>r.ingredient);
  }

  productModalState = existing
    ? {name:existing.name, price:existing.price, category:existing.category, image:existing.image, imageFile:null,
       costMode:existing.costMode, directCost:existing.directCost, recipe,
       linkInventory:existing.linkInventory, linkProfit:existing.linkProfit,
       pointsRedeemPrice: existing.pointsRedeemPrice,
       barcode: existing.barcode || '',
       modifierGroupIds:[...existing.modifierGroupIds],
       totalPieces: slot ? slot.totalPieces : 0,
       eligibleItems: slot ? [...slot.eligibleItems] : [],
       defaultMix, finishedGoodStockItemId: existing.finishedGoodStockItemId}
    : {name:'', price:0, category:MENU_CATEGORIES[0]||'', image:null, imageFile:null,
       costMode:'direct', directCost:0, recipe:[], linkInventory:false, linkProfit:false, pointsRedeemPrice:null, barcode:'', modifierGroupIds:[],
       totalPieces:0, eligibleItems:[], defaultMix:[], finishedGoodStockItemId:null};

  document.getElementById('productEditModalTitle').textContent = existing ? 'تعديل: ' + existing.name : 'إضافة منتج جديد';
  document.getElementById('productDeleteLink').style.display = existing ? 'block' : 'none';
  renderProductEditBody();
  switchProductEditTab('basic');
  document.getElementById('productEditModal').classList.add('show');
}

function productEditBodyHtml(){
  return `
    <div class="pe-tab-section" data-section="basic">
      <div class="image-upload-box" id="imageUploadBox" style="margin-bottom:14px;">
        ${productModalState.image ? `<img src="${productModalState.image}">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg><span>أضف صورة</span>`}
        <input type="file" id="pfImageInput" accept="image/*">
      </div>
      <div class="menu-add-field" style="margin-bottom:12px;"><label>اسم المنتج</label><input type="text" id="pfName" value="${productModalState.name}" placeholder="مثال: موكا"></div>
      <div class="menu-add-row" style="margin-bottom:0;">
        <div class="menu-add-field"><label>السعر (ر.س)${PRICES_INCLUDE_VAT ? ' — شامل الضريبة' : ' — قبل الضريبة'}</label><input type="number" id="pfPrice" value="${productModalState.price}"></div>
        <div class="menu-add-field"><label>التصنيف</label><select id="pfCategory">${MENU_CATEGORIES.map(c=>`<option value="${c}" ${productModalState.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="menu-add-field" style="margin-top:12px; max-width:220px;">
        <label>نقاط الاسترداد (اختياري) ${helpIcon('لو حددت رقم، يقدر العميل يستبدل هذا المنتج بنقاط ولائه بدل الدفع — يظهر خيار الاستبدال بالكاشير إذا كان رصيده كافي. سيبه فاضي عشان ما يكون قابل للاستبدال بالنقاط.')}</label>
        <input type="number" id="pfPointsRedeemPrice" value="${productModalState.pointsRedeemPrice != null ? productModalState.pointsRedeemPrice : ''}" placeholder="مثال: ٥٠٠">
      </div>
      <div class="menu-add-field" style="margin-top:12px; max-width:260px;">
        <label>الباركود (اختياري) ${helpIcon('امسح أو اكتب الباركود المطبوع على المنتج — يقدر الكاشير يبحث عنه ويضيفه للسلة مباشرة بجهاز قارئ باركود بدل البحث اليدوي. سيبه فاضي لو ما عندك قارئ باركود.')}</label>
        <input type="text" id="pfBarcode" class="mono" value="${productModalState.barcode||''}" placeholder="مثال: 6281234567890">
      </div>
    </div>

    <div class="pe-tab-section" data-section="cost" style="display:none;">

      <div class="pe-step-label">١. كيف تحسب تكلفة هذا المنتج؟ ${helpIcon('تكلفة مباشرة: رقم واحد سريع، تكتبه بنفسك.  وصفة: تبني قائمة مكوّنات حقيقية من المخزون، وركين يحسب لك التكلفة.  بوكس: للمنتجات اللي محتواها يتغيّر كل طلب حسب اختيار العميل.')}</div>
      <select id="pfCostModeSelect" class="pe-select">
        <option value="direct" ${productModalState.costMode==='direct'?'selected':''}>تكلفة مباشرة — رقم واحد سريع</option>
        <option value="recipe" ${productModalState.costMode==='recipe'?'selected':''}>وصفة — من مكوّنات المخزون</option>
        <option value="box" ${productModalState.costMode==='box'?'selected':''}>بوكس / تركيبة متغيرة — العميل يختار المحتوى</option>
      </select>

      <div class="pe-step-label">٢. التفاصيل</div>
      <div id="directCostSection" style="display:${productModalState.costMode==='direct'?'block':'none'};">
        <div class="menu-add-field" style="max-width:220px;"><label>التكلفة المباشرة الكاملة (ر.س)</label><input type="number" id="pfDirectCost" value="${productModalState.directCost}"></div>
        <div class="stock-qty-helper">رقم واحد يشمل كل شي: المكوّنات + التغليف + أي كيس أو علبة. ما تحتاج تفصّلها.</div>
      </div>
      <div id="finishedGoodSection" style="display:${(productModalState.costMode==='direct' && productModalState.linkInventory)?'block':'none'}; margin-top:14px;">
        <div class="panel-subtitle" style="margin-top:0;">تتبّع المخزون كقطعة جاهزة ${helpIcon('بدون وصفة ولا مكوّنات — تربط هذا المنتج بصنف مخزون واحد يمثله هو نفسه (مثلاً "بوكس وسط مشكّل — دفعة جاهزة"). كل ما تسوي دفعة جديدة، سجّلها من شاشة المشتريات كأي عملية تخزين عادية (المورّد يقدر يكون "إنتاج ذاتي"). كل عملية بيع تخصم قطعة وحدة تلقائيًا — تعرف بالضبط كم باقي بدون ما تكتب أي مكوّن.')}</div>
        <div class="menu-add-field" style="max-width:280px;">
          <label>صنف المخزون اللي يمثل هذا المنتج</label>
          <select id="pfFinishedGoodStockItem">
            <option value="">— اختر —</option>
            ${STOCK_ITEMS.map(s=>`<option value="${s.id}" ${productModalState.finishedGoodStockItemId===s.id?'selected':''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="menu-add-row" style="margin-top:8px; align-items:end;">
          <div class="menu-add-field"><label>أو أنشئ صنف جديد باسم</label><input type="text" id="pfNewFinishedGoodName" placeholder="مثال: بوكس وسط مشكّل — دفعة جاهزة"></div>
          <button class="add-row-btn" id="createFinishedGoodStockBtn" type="button">+ إنشاء وربط</button>
        </div>
      </div>
      <div id="recipeSection" style="display:${(productModalState.costMode==='recipe'||productModalState.costMode==='box')?'block':'none'};">
        <div class="panel-subtitle" style="margin-top:0;">${productModalState.costMode==='box' ? 'التغليف الثابت (نفسه بكل طلب)' : 'مكوّنات الوصفة'}</div>
        <div class="stock-qty-helper">${productModalState.costMode==='box' ? 'الكرتون والكيس — نفس الشي بكل طلب مهما كان المحتوى بالداخل.' : 'ضيف هنا كل شي يطلع مع الطلب: الأكل، والتغليف (كيس، كرتون)، وحتى الملاعق — كلها "مكوّنات" بنفس الطريقة.'}</div>
        <div id="recipeRows"></div>
        <button class="add-row-btn" id="addRecipeRowBtn">+ أضف مكوّن</button>
      </div>
      <div id="boxComponentSection" style="display:${productModalState.costMode==='box'?'block':'none'};">
        <div class="panel-subtitle">محتوى المنتج (يتغيّر حسب اختيار العميل)</div>
        <div class="stock-qty-helper">مثال: بوكس فيه ١٨ قطعة، والعميل يقدر يوزّعها بين سمبوسة دجاج، سمبوسة لحم، وورق عنب — السعر ثابت، لكن التكلفة تختلف حسب اختياره. ركين يحسب لك أفضل حالة وأسوأ حالة، مو رقم واحد وهمي.</div>
        <div class="menu-add-field" style="max-width:200px;"><label>كم قطعة بالمنتج كامل؟</label><input type="number" id="pfTotalPieces" value="${productModalState.totalPieces||0}"></div>
        <div class="panel-subtitle">العناصر اللي يقدر يختارها العميل</div>
        <div id="eligibleItemsChecklist"></div>
        <div class="panel-subtitle">التركيبة المعتادة (تُستخدم لحساب الهامش الأساسي المعروض)</div>
        <div id="defaultMixRows"></div>
        <button class="add-row-btn" id="addDefaultMixRowBtn">+ أضف عنصر للتركيبة المعتادة</button>
        <div class="stock-qty-helper" id="defaultMixSumCheck"></div>
      </div>

      <div class="pe-step-label">٣. ربطه بالمخزون والمحاسبة</div>
      <div class="menu-toggles-row">
        <label class="field-label-row"><input type="checkbox" id="pfLinkInventory" ${productModalState.linkInventory?'checked':''}> اربط بالمخزون ${helpIcon('لو فعّلته: كل ما تنباع وحدة، النظام يخصم المكوّنات تلقائيًا من مخزونك الحقيقي، وتقدر تشوف "استهلك اليوم" بصفحة المخزون. لو ما فعّلته: التكلفة تُحسب زي العادة، بس المخزون ما يتأثر (يفيدك لمنتجات ما عندها مكوّنات متتبّعة، مثل مشروب معلّب جاهز).')}</label>
        <label class="field-label-row"><input type="checkbox" id="pfLinkProfit" ${productModalState.linkProfit?'checked':''}> احتسب ضمن المحاسبة ${helpIcon('لو فعّلته: تكلفة هذا المنتج وربحه يدخلون بحساب أرباحك الكلية وهامشه يظهر بجدول القائمة. لو ما فعّلته: المنتج يبقى موجود ويُباع عادي، بس ما يُحتسب بتحليل الربحية (يفيدك لعينات مجانية أو منتجات لسا ما حددت تكلفتها).')}</label>
      </div>

      <div class="pe-step-label">النتيجة</div>
      <div class="cost-preview-box" id="costPreviewBox"></div>
      <div class="accounting-note">هذا رقم تحليلي لمساعدتك تقرر ربحية الصنف — ما يغيّر أرقام قائمة الدخل العامة بصفحة المحاسبة.</div>
    </div>

    <div class="pe-tab-section" data-section="options" style="display:none;">
      <div class="stock-qty-helper">اختر أي مجموعات خيارات (إضافات، حجم، ...) تنطبق على هذا المنتج — أنشئتها من تبويب "الخيارات والإضافات".</div>
      <div class="attach-groups-list" id="attachGroupsList"></div>
    </div>

    <div class="pe-tab-section" data-section="delivery" style="display:none;" id="peDeliverySection">
      <div class="stock-qty-helper">جاري التحميل...</div>
    </div>
  `;
}

/* ============ Per-product delivery-platform prices — lives on the product
   itself (not a separate settings screen) since it's naturally "this item,
   priced for that platform." Platforms themselves (add/remove) are managed
   here too since there's nowhere more natural to create one for the first
   time than while pricing the first product for it. ============ */
async function renderProductDeliveryPricing(){
  const section = document.getElementById('peDeliverySection');
  if(!editingProductId){
    section.innerHTML = '<div class="stock-qty-helper">احفظ المنتج أول، وبعدها ترجع تحدد أسعاره لكل منصة توصيل.</div>';
    return;
  }
  section.innerHTML = '<div class="stock-qty-helper">جاري التحميل...</div>';
  const [{data: platforms}, {data: prices}] = await Promise.all([
    window.supabaseClient.from('delivery_platforms').select('id, name').eq('business_id', CURRENT_PROFILE.business_id).eq('active', true).order('name'),
    window.supabaseClient.from('menu_item_platform_prices').select('platform_id, price').eq('menu_item_id', editingProductId)
  ]);
  const priceByPlatform = {};
  (prices||[]).forEach(p=> priceByPlatform[p.platform_id] = p.price);

  section.innerHTML = `
    <div class="stock-qty-helper" style="margin-bottom:12px;">لو منصة توصيل تبيع هذا المنتج بسعر مختلف عن سعر القائمة (${productModalState.price.toFixed(2)} ر.س)، حدده هنا — الكاشير يطبّقه تلقائيًا لما يسجّل طلب توصيل من نفس المنصة. سيبه فاضي عشان يستخدم السعر العادي.</div>
    ${(platforms||[]).map(pl => `
      <div class="menu-add-row" style="margin-bottom:10px; align-items:end;">
        <div class="menu-add-field"><label>${pl.name}</label><input type="number" step="0.01" class="platform-price-input" data-platform="${pl.id}" value="${priceByPlatform[pl.id] != null ? priceByPlatform[pl.id] : ''}" placeholder="${productModalState.price.toFixed(2)}"></div>
      </div>`).join('') || '<div class="stock-qty-helper">ما فيه منصات توصيل مضافة بعد.</div>'}
    <div style="display:flex; gap:8px; margin-top:10px;">
      <input type="text" id="newDeliveryPlatformName" placeholder="اسم منصة جديدة (مثال: جاهز)" style="flex:1;">
      <button class="add-row-btn" id="addDeliveryPlatformBtn" style="width:auto;">+ أضف منصة</button>
    </div>
  `;

  section.querySelectorAll('.platform-price-input').forEach(input=>{
    let saveTimer;
    input.addEventListener('input', ()=>{
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async ()=>{
        const platformId = parseInt(input.dataset.platform,10);
        const val = input.value.trim();
        try {
          if(val === ''){
            await window.supabaseClient.from('menu_item_platform_prices').delete().eq('menu_item_id', editingProductId).eq('platform_id', platformId);
          } else {
            await window.supabaseClient.from('menu_item_platform_prices')
              .upsert({ menu_item_id: editingProductId, platform_id: platformId, price: parseFloat(val)||0 });
          }
        } catch { showToast('تعذر حفظ السعر'); }
      }, 500);
    });
  });

  document.getElementById('addDeliveryPlatformBtn').addEventListener('click', async ()=>{
    const input = document.getElementById('newDeliveryPlatformName');
    const name = input.value.trim();
    if(!name){ showToast('اكتب اسم المنصة'); return; }
    try {
      const { error } = await window.supabaseClient.from('delivery_platforms')
        .insert({ business_id: CURRENT_PROFILE.business_id, name });
      if(error) throw error;
      logDashboardAudit('أضاف منصة توصيل: ' + name);
      renderProductDeliveryPricing();
    } catch(err){
      showToast('تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    }
  });
}

function renderProductEditBody(){
  document.getElementById('productEditBody').innerHTML = productEditBodyHtml();
  wireImageInput();
  document.getElementById('pfName').addEventListener('input', (e)=> productModalState.name = e.target.value);
  document.getElementById('pfPrice').addEventListener('input', (e)=>{ productModalState.price = parseFloat(e.target.value)||0; updateCostPreview(); });
  document.getElementById('pfCategory').addEventListener('change', (e)=> productModalState.category = e.target.value);
  document.getElementById('pfPointsRedeemPrice').addEventListener('input', (e)=>{
    productModalState.pointsRedeemPrice = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
  });
  document.getElementById('pfBarcode').addEventListener('input', (e)=> productModalState.barcode = e.target.value.trim());

  document.getElementById('pfCostModeSelect').addEventListener('change', (e)=> setCostMode(e.target.value));
  document.getElementById('pfDirectCost').addEventListener('input', (e)=>{ productModalState.directCost = parseFloat(e.target.value)||0; updateCostPreview(); });
  document.getElementById('pfTotalPieces').addEventListener('input', (e)=>{ productModalState.totalPieces = parseInt(e.target.value)||0; updateDefaultMixSumCheck(); updateCostPreview(); });
  document.getElementById('addDefaultMixRowBtn').addEventListener('click', ()=>{
    const firstStockItem = productModalState.eligibleItems.find(e=>e.costMode==='stock');
    if(!firstStockItem){ showToast('التركيبة المعتادة تحتاج صنف واحد على الأقل مربوط بالمخزون — الأصناف بدون مخزون ما تدخل فيها'); return; }
    productModalState.defaultMix.push({ingredient: firstStockItem.name, qty:0});
    renderDefaultMixRows(); updateCostPreview();
  });
  document.getElementById('pfLinkInventory').addEventListener('change', (e)=>{
    productModalState.linkInventory = e.target.checked;
    const fg = document.getElementById('finishedGoodSection');
    if(fg) fg.style.display = (productModalState.costMode==='direct' && productModalState.linkInventory) ? 'block' : 'none';
  });
  const fgSelect = document.getElementById('pfFinishedGoodStockItem');
  if(fgSelect) fgSelect.addEventListener('change', (e)=> productModalState.finishedGoodStockItemId = e.target.value ? parseInt(e.target.value,10) : null);
  const fgCreateBtn = document.getElementById('createFinishedGoodStockBtn');
  if(fgCreateBtn) fgCreateBtn.addEventListener('click', async ()=>{
    const nameInput = document.getElementById('pfNewFinishedGoodName');
    const name = nameInput.value.trim();
    if(!name){ showToast('اكتب اسم الصنف أول'); return; }
    fgCreateBtn.disabled = true;
    const { data, error } = await window.supabaseClient.from('stock_items').insert({
      business_id: CURRENT_PROFILE.business_id, name, category:'finished_good', unit:'piece', unit_cost:0, qty_on_hand:0
    }).select().single();
    fgCreateBtn.disabled = false;
    if(error){ showToast('تعذر الإنشاء: ' + error.message); return; }
    STOCK_ITEMS.push({id:data.id, name:data.name, category:data.category, unit:data.unit, unitCost:0, qtyOnHand:0, parLevel:0});
    productModalState.finishedGoodStockItemId = data.id;
    nameInput.value = '';
    document.getElementById('pfFinishedGoodStockItem').innerHTML = `<option value="">— اختر —</option>` +
      STOCK_ITEMS.map(s=>`<option value="${s.id}" ${productModalState.finishedGoodStockItemId===s.id?'selected':''}>${s.name}</option>`).join('');
    showToast('تم إنشاء الصنف وربطه — سجّل كمية الدفعة من شاشة المخزون أو المشتريات');
  });
  document.getElementById('pfLinkProfit').addEventListener('change', (e)=>{ productModalState.linkProfit = e.target.checked; updateCostPreview(); });
  document.getElementById('addRecipeRowBtn').addEventListener('click', ()=>{
    const first = STOCK_ITEMS[0];
    const defaultUnit = (first.unit==='kg'||first.unit==='g') ? 'g' : first.unit;
    productModalState.recipe.push({ingredient: first.name, qty:0, unit: defaultUnit});
    renderRecipeRows(); updateCostPreview();
  });
  renderRecipeRows();
  if(productModalState.costMode==='box'){ renderEligibleItemsChecklist(); renderDefaultMixRows(); }
  updateCostPreview();
  renderAttachGroupsList();
}

function setCostMode(mode){
  productModalState.costMode = mode;
  document.getElementById('directCostSection').style.display = mode==='direct' ? 'block' : 'none';
  const fg = document.getElementById('finishedGoodSection');
  if(fg) fg.style.display = (mode==='direct' && productModalState.linkInventory) ? 'block' : 'none';
  document.getElementById('recipeSection').style.display = (mode==='recipe'||mode==='box') ? 'block' : 'none';
  document.getElementById('recipeSection').querySelector('.panel-subtitle').textContent = mode==='box' ? 'التغليف الثابت (نفسه بكل طلب)' : 'مكوّنات الوصفة';
  document.getElementById('boxComponentSection').style.display = mode==='box' ? 'block' : 'none';
  if(mode==='box'){ renderEligibleItemsChecklist(); renderDefaultMixRows(); }
  updateCostPreview();
}

function renderEligibleItemsChecklist(){
  const el = document.getElementById('eligibleItemsChecklist');
  if(!el) return;
  const pieceItems = STOCK_ITEMS.filter(s=>s.unit==='piece');
  const simpleItems = productModalState.eligibleItems.filter(e=>e.costMode==='simple');
  el.innerHTML = pieceItems.map(s=>{
    const checked = productModalState.eligibleItems.some(e=>e.costMode==='stock' && e.name===s.name);
    return `<label class="attach-group-item">
      <input type="checkbox" class="eligible-item-checkbox" value="${s.name}" ${checked?'checked':''}>
      <span class="ag-name">${s.name}</span>
      <span class="ag-meta">${formatUnitCost(s.unitCost)} ر.س/حبة — من المخزون</span>
    </label>`;
  }).join('')
  + (simpleItems.length ? simpleItems.map(e=>`
    <div class="attach-group-item">
      <span class="ag-name">${e.name}</span>
      <span class="ag-meta">${e.extraCost.toFixed(2)} ر.س/حبة — تكلفة يدوية</span>
      <button class="eligible-simple-remove" data-name="${e.name}" style="border:none; background:none; color:var(--muted);">✕</button>
    </div>`).join('') : '')
  + `
    <div class="menu-add-row" style="margin-top:8px; align-items:end;">
      <div class="menu-add-field"><label>صنف بدون مخزون (اسم)</label><input type="text" id="eligibleSimpleName" placeholder="مثال: ورق عنب سبايسي"></div>
      <div class="menu-add-field" style="max-width:110px;"><label>تكلفة الحبة (ر.س)</label><input type="number" id="eligibleSimpleCost" step="0.01" value="0"></div>
      <button class="mtr-edit-btn" id="addEligibleSimpleBtn">+ إضافة</button>
    </div>`;
  el.querySelectorAll('.eligible-item-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) productModalState.eligibleItems.push({name:cb.value, costMode:'stock', extraCost:0});
      else productModalState.eligibleItems = productModalState.eligibleItems.filter(e=>!(e.costMode==='stock' && e.name===cb.value));
      updateCostPreview();
    });
  });
  el.querySelectorAll('.eligible-simple-remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      productModalState.eligibleItems = productModalState.eligibleItems.filter(e=>!(e.costMode==='simple' && e.name===btn.dataset.name));
      renderEligibleItemsChecklist(); renderDefaultMixRows(); updateCostPreview();
    });
  });
  const addBtn = document.getElementById('addEligibleSimpleBtn');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    const name = document.getElementById('eligibleSimpleName').value.trim();
    const cost = parseFloat(document.getElementById('eligibleSimpleCost').value) || 0;
    if(!name){ showToast('لازم تكتب اسم الصنف'); return; }
    if(productModalState.eligibleItems.some(e=>e.name===name)){ showToast('هذا الاسم مستخدم بالفعل'); return; }
    productModalState.eligibleItems.push({name, costMode:'simple', extraCost:cost});
    renderEligibleItemsChecklist(); renderDefaultMixRows(); updateCostPreview();
  });
}
function renderDefaultMixRows(){
  const el = document.getElementById('defaultMixRows');
  if(!el) return;
  el.innerHTML = productModalState.defaultMix.map((m,i)=>`
    <div class="recipe-row" data-idx="${i}">
      <select class="mix-ing-select" data-idx="${i}">${productModalState.eligibleItems.filter(e=>e.costMode==='stock').map(e=>`<option value="${e.name}" ${m.ingredient===e.name?'selected':''}>${e.name}</option>`).join('')}</select>
      <input type="number" class="mix-qty-input" data-idx="${i}" value="${m.qty}" step="1">
      <span class="recipe-unit-label" style="width:44px; flex-shrink:0; font-size:10.5px; color:var(--muted); font-weight:700;">حبة</span>
      <button class="recipe-remove-btn" data-idx="${i}">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('.mix-ing-select').forEach(sel=> sel.addEventListener('change', ()=>{ productModalState.defaultMix[parseInt(sel.dataset.idx)].ingredient = sel.value; updateCostPreview(); }));
  el.querySelectorAll('.mix-qty-input').forEach(inp=> inp.addEventListener('input', ()=>{ productModalState.defaultMix[parseInt(inp.dataset.idx)].qty = parseInt(inp.value)||0; updateDefaultMixSumCheck(); updateCostPreview(); }));
  el.querySelectorAll('.recipe-remove-btn').forEach(btn=> btn.addEventListener('click', ()=>{ productModalState.defaultMix.splice(parseInt(btn.dataset.idx),1); renderDefaultMixRows(); updateDefaultMixSumCheck(); updateCostPreview(); }));
  updateDefaultMixSumCheck();
}
function updateDefaultMixSumCheck(){
  const el = document.getElementById('defaultMixSumCheck');
  if(!el) return;
  const sum = productModalState.defaultMix.reduce((s,m)=>s+(m.qty||0),0);
  const total = productModalState.totalPieces || 0;
  const match = sum === total;
  el.innerHTML = `مجموع التركيبة: <b class="${match?'':'mono'}" style="${match?'color:var(--success-text);':'color:var(--danger);'}">${sum}</b> من أصل ${total} قطعة${match?' ✓':' — لازم يتساوى مع إجمالي القطع'}`;
}

function renderRecipeRows(){
  const el = document.getElementById('recipeRows');
  if(!el) return;
  el.innerHTML = productModalState.recipe.map((r,i)=>{
    const stockItem = STOCK_ITEMS.find(s=>s.name===r.ingredient);
    const units = compatibleUnits(stockItem ? stockItem.unit : 'kg');
    return `<div class="recipe-row" data-idx="${i}">
      <select class="recipe-ing-select" data-idx="${i}">${STOCK_ITEMS.map(s=>`<option value="${s.name}" ${r.ingredient===s.name?'selected':''}>${s.name} (${s.unitCost} ر.س/${UNIT_LABELS[s.unit]})</option>`).join('')}</select>
      <input type="number" class="recipe-qty-input" data-idx="${i}" value="${r.qty}" step="0.01">
      <select class="recipe-unit-select" data-idx="${i}">${units.map(u=>`<option value="${u}" ${r.unit===u?'selected':''}>${UNIT_LABELS[u]}</option>`).join('')}</select>
      <button class="recipe-remove-btn" data-idx="${i}">✕</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.recipe-ing-select').forEach(sel=> sel.addEventListener('change', ()=>{
    const idx = parseInt(sel.dataset.idx);
    productModalState.recipe[idx].ingredient = sel.value;
    const stockItem = STOCK_ITEMS.find(s=>s.name===sel.value);
    // default new ingredient's unit to gram for weight items (more natural recipe precision), else its own unit
    productModalState.recipe[idx].unit = stockItem && (stockItem.unit==='kg'||stockItem.unit==='g') ? 'g' : (stockItem?stockItem.unit:'kg');
    renderRecipeRows(); updateCostPreview();
  }));
  el.querySelectorAll('.recipe-qty-input').forEach(inp=> inp.addEventListener('input', ()=>{ productModalState.recipe[parseInt(inp.dataset.idx)].qty = parseFloat(inp.value)||0; updateCostPreview(); }));
  el.querySelectorAll('.recipe-unit-select').forEach(sel=> sel.addEventListener('change', ()=>{ productModalState.recipe[parseInt(sel.dataset.idx)].unit = sel.value; updateCostPreview(); }));
  el.querySelectorAll('.recipe-remove-btn').forEach(btn=> btn.addEventListener('click', ()=>{ productModalState.recipe.splice(parseInt(btn.dataset.idx),1); renderRecipeRows(); updateCostPreview(); }));
}

function updateCostPreview(){
  const box = document.getElementById('costPreviewBox');
  if(!box) return;
  if(!canViewProfit()){
    box.innerHTML = `<div class="cpb-row"><span>التكلفة والهامش</span><span class="mono">— بدون صلاحية</span></div>`;
    return;
  }
  const tempItem = {
    costMode: productModalState.costMode, directCost: productModalState.directCost, recipe: productModalState.recipe,
    linkProfit: productModalState.linkProfit, price: productModalState.price,
    componentSlot: productModalState.costMode==='box' ? {
      totalPieces: productModalState.totalPieces, eligibleItems: productModalState.eligibleItems, defaultMix: productModalState.defaultMix
    } : null
  };
  const c = computeProductCost(tempItem);
  const tier = tempItem.price>0 ? marginTier(c.marginPct) : 'none';
  const isBox = tempItem.costMode==='box' && tempItem.componentSlot && tempItem.componentSlot.eligibleItems.length>0;
  box.innerHTML = `
    <div class="cpb-row"><span>التكلفة المتغيرة (${isBox?'محتوى معتاد + تغليف':'مكوّنات + تغليف'})</span><span class="mono">${c.variable.toFixed(2)}</span></div>
    <div class="cpb-row"><span>حصة المصاريف الثابتة${tempItem.linkProfit?'':' (غير محتسبة)'}</span><span class="mono">${c.fixedAlloc.toFixed(2)}</span></div>
    <div class="cpb-row total ${tier==='bad'?'bad':''}"><span>التكلفة المتوقعة (بالتركيبة المعتادة)</span><span class="mono">${c.total.toFixed(2)} ر.س</span></div>
    ${tempItem.price>0 ? `<div class="cpb-row"><span>الربح المتوقع</span><span class="mono">${c.profit.toFixed(2)} ر.س (هامش ${c.marginPct.toFixed(1)}٪)</span></div>` : ''}
    ${isBox && tempItem.price>0 ? `<div class="cpb-row"><span>المدى الحقيقي حسب اختيار العميل</span><span class="mono">هامش ${c.marginWorst.toFixed(1)}٪ – ${c.marginBest.toFixed(1)}٪</span></div>` : ''}
  `;
}

function renderAttachGroupsList(){
  const el = document.getElementById('attachGroupsList');
  if(!el) return;
  if(MODIFIER_GROUPS.length === 0){
    el.innerHTML = '<div class="attach-groups-empty">ما فيه مجموعات خيارات لسا — روح تبويب "الخيارات والإضافات" وأنشئ وحدة أول.</div>';
    return;
  }
  el.innerHTML = MODIFIER_GROUPS.map(g=>{
    const checked = productModalState.modifierGroupIds.includes(g.id);
    const hasCost = g.options.some(o=>computeModifierOptionCost(o)>0);
    const typeLabel = g.type==='single' ? 'اختيار واحد' : g.type==='quantity' ? 'كمية متعددة (حتى '+g.max+' قطعة)' : 'اختيار متعدد';
    return `<label class="attach-group-item">
      <input type="checkbox" class="attach-group-checkbox" data-id="${g.id}" ${checked?'checked':''}>
      <span class="ag-name">${g.name}</span>
      <span class="ag-meta">${typeLabel} — ${g.options.length} خيار</span>
    </label>
    ${checked && hasCost ? `<div class="ag-cost-breakdown">${g.options.filter(o=>computeModifierOptionCost(o)>0).map(o=>`<span class="mtr-mod-chip" style="color:var(--danger); border-color:rgba(163,64,44,0.25); background:rgba(163,64,44,0.06);">${o.name}: تكلفة حقيقية ${computeModifierOptionCost(o).toFixed(2)} ر.س (سعره للعميل ${o.priceDelta>=0?'+':''}${o.priceDelta})</span>`).join('')}</div>` : ''}`;
  }).join('');
  el.querySelectorAll('.attach-group-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const id = parseInt(cb.dataset.id);
      if(cb.checked) productModalState.modifierGroupIds.push(id);
      else productModalState.modifierGroupIds = productModalState.modifierGroupIds.filter(x=>x!==id);
      renderAttachGroupsList();
    });
  });
}

function showImagePreview(dataUrl){
  document.getElementById('imageUploadBox').innerHTML = `<img src="${dataUrl}"><input type="file" id="pfImageInput" accept="image/*">`;
  wireImageInput();
}
function wireImageInput(){
  document.getElementById('pfImageInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    productModalState.imageFile = file;
    const reader = new FileReader();
    reader.onload = (ev)=>{ productModalState.image = ev.target.result; showImagePreview(ev.target.result); };
    reader.readAsDataURL(file);
  });
}

function switchProductEditTab(tab){
  document.querySelectorAll('#productEditTabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.pe-tab-section').forEach(s=> s.style.display = s.dataset.section===tab ? 'block' : 'none');
}

function closeProductEditModal(){
  document.getElementById('productEditModal').classList.remove('show');
  editingProductId = null;
}

async function saveProductEdit(){
  const name = productModalState.name.trim();
  if(!name){ showToast('لازم تكتب اسم المنتج'); return; }
  if(!(productModalState.price >= 0)){ showToast('لازم تدخل سعر صحيح'); return; }
  if(productModalState.costMode === 'box'){
    if(!(productModalState.totalPieces > 0)){ showToast('لازم تحدد كم قطعة بالمنتج كامل'); return; }
    if(productModalState.eligibleItems.length === 0){ showToast('لازم تحدد عناصر يقدر العميل يختار منها'); return; }
    // the "typical mix" is only an estimate used for COGS reporting — it's
    // optional (e.g. boxes built entirely from simple/non-stock fillings have
    // nothing to build it from), so an empty mix is fine; only a partially
    // filled one (a real mistake) blocks save.
    const mixSum = productModalState.defaultMix.reduce((s,m)=>s+(m.qty||0),0);
    if(mixSum > 0 && mixSum !== productModalState.totalPieces){ showToast('مجموع التركيبة المعتادة لازم يساوي إجمالي القطع (أو اتركها فاضية)'); return; }
  }

  const productData = {
    name, price: productModalState.price, category: productModalState.category, image: productModalState.image,
    costMode: productModalState.costMode, directCost: productModalState.directCost,
    recipe: productModalState.recipe.filter(r=>r.qty>0),
    linkInventory: productModalState.linkInventory, linkProfit: productModalState.linkProfit,
    pointsRedeemPrice: productModalState.pointsRedeemPrice,
    barcode: productModalState.barcode || '',
    modifierGroupIds: [...productModalState.modifierGroupIds],
    componentSlot: productModalState.costMode==='box' ? {
      totalPieces: productModalState.totalPieces, eligibleItems: [...productModalState.eligibleItems],
      defaultMix: productModalState.defaultMix.filter(m=>m.qty>0)
    } : null
  };

  const saveBtn = document.getElementById('productEditSaveBtn');
  saveBtn.disabled = true;
  try {
    const sb = window.supabaseClient;
    let categoryId = MENU_CATEGORY_ID_BY_NAME[productModalState.category];
    if(!categoryId){
      const { data: newCat, error: catErr } = await sb.from('menu_categories')
        .insert({business_id: CURRENT_PROFILE.business_id, name: productModalState.category, sort_order: MENU_CATEGORIES.length}).select().single();
      if(catErr) throw catErr;
      categoryId = newCat.id;
      MENU_CATEGORY_ID_BY_NAME[productModalState.category] = categoryId;
      if(!MENU_CATEGORIES.includes(productModalState.category)) MENU_CATEGORIES.push(productModalState.category);
    }

    const row = {
      business_id: CURRENT_PROFILE.business_id, category_id: categoryId, name, price: productModalState.price,
      cost_mode: productModalState.costMode, direct_cost: productModalState.directCost,
      link_inventory: productModalState.linkInventory, link_profit: productModalState.linkProfit,
      points_redeem_price: productModalState.pointsRedeemPrice,
      barcode: productModalState.barcode || null,
      total_pieces: productModalState.costMode==='box' ? productModalState.totalPieces : null,
      finished_good_stock_item_id: (productModalState.costMode==='direct' && productModalState.linkInventory) ? (productModalState.finishedGoodStockItemId || null) : null
    };

    let menuItemId = editingProductId;
    if(editingProductId){
      const { error } = await sb.from('menu_items').update({...row, updated_at:new Date().toISOString()}).eq('id', editingProductId);
      if(error) throw error;
      const del = await Promise.all([
        sb.from('menu_item_box_eligible_items').delete().eq('menu_item_id', editingProductId),
        sb.from('menu_item_modifier_groups').delete().eq('menu_item_id', editingProductId),
      ]);
      const delFailed = del.find(r=>r.error);
      if(delFailed) throw delFailed.error;
    } else {
      const { data: inserted, error } = await sb.from('menu_items').insert({...row, active:true}).select().single();
      if(error) throw error;
      menuItemId = inserted.id;
    }

    // Recipe/box-mix quantities go through save_menu_item_recipe/
    // save_menu_item_box_mix — they encrypt on write server-side, same as
    // get_menu_item_recipe/get_menu_item_box_mix decrypt on read. This
    // client never handles the ciphertext at all, only the real numbers the
    // owner typed in, for exactly as long as it takes to send them.
    const recipeLines = productData.recipe.map(r=>({stock_item_id: STOCK_ITEM_ID_BY_NAME[r.ingredient], qty:r.qty, unit:r.unit})).filter(r=>r.stock_item_id);
    const modGroupRows = productData.modifierGroupIds.map(gid=>({menu_item_id: menuItemId, modifier_group_id: gid}));
    const childInserts = [sb.rpc('save_menu_item_recipe', {p_menu_item_id: menuItemId, p_lines: recipeLines})];
    if(modGroupRows.length) childInserts.push(sb.from('menu_item_modifier_groups').insert(modGroupRows));
    if(productData.componentSlot){
      const eligRows = productData.componentSlot.eligibleItems.map(e=> e.costMode==='simple'
        ? {menu_item_id: menuItemId, cost_mode:'simple', name:e.name, extra_cost:e.extraCost||0}
        : {menu_item_id: menuItemId, cost_mode:'stock', stock_item_id: STOCK_ITEM_ID_BY_NAME[e.name]}
      ).filter(r=> r.cost_mode==='simple' || r.stock_item_id);
      const mixLines = productData.componentSlot.defaultMix.map(m=>({stock_item_id: STOCK_ITEM_ID_BY_NAME[m.ingredient], qty:m.qty})).filter(r=>r.stock_item_id);
      if(eligRows.length) childInserts.push(sb.from('menu_item_box_eligible_items').insert(eligRows));
      childInserts.push(sb.rpc('save_menu_item_box_mix', {p_menu_item_id: menuItemId, p_mix: mixLines}));
    }
    const childResults = await Promise.all(childInserts);
    const childFailed = childResults.find(r=>r.error);
    if(childFailed) throw childFailed.error;

    if(productModalState.imageFile){
      const compressedImage = await compressImageFile(productModalState.imageFile);
      const url = await uploadMediaFile(compressedImage, 'menu-item-images', String(menuItemId));
      const { error: imgErr } = await sb.from('menu_items').update({image_url: url}).eq('id', menuItemId);
      if(imgErr) throw imgErr;
      productData.image = url;
    }

    if(editingProductId){
      Object.assign(MENU_ITEMS.find(m=>m.id===editingProductId), productData);
      logDashboardAudit('عدّل منتج ' + name);
      showToast('تم حفظ التعديلات');
    } else {
      MENU_ITEMS.push({id: menuItemId, active:true, ...productData});
      logDashboardAudit('أضاف منتج جديد: ' + name);
      showToast('تمت إضافة "' + name + '" — جاهز للمنتج اللي بعده');
    }
    // Same reasoning as the stock-item modal: setting up a whole menu means
    // adding many products back to back, so a new (not edited) product
    // reopens a fresh form immediately instead of closing.
    if(editingProductId){
      closeProductEditModal();
    } else {
      openProductEditModal(null);
      const nameInput = document.getElementById('pfName');
      if(nameInput) nameInput.focus();
    }
    renderCategoryTabs();
    renderMenuProductTable();
    renderModifierGroupsTable();
    renderCostCompletionBanner();
    if(typeof renderStockTable === 'function') renderStockTable();
    if(typeof renderOnboardingChecklist === 'function') renderOnboardingChecklist();
  } catch(err){
    if(err && err.code === '23505' && err.message && err.message.includes('barcode')){
      showToast('هذا الباركود مستخدم لمنتج ثاني عندك — تأكد قبل الحفظ');
    } else {
      showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    }
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteProductFromModal(){
  if(!editingProductId) return;
  const item = MENU_ITEMS.find(m=>m.id===editingProductId);
  const sb = window.supabaseClient;
  try {
    // capture this product's modifier groups before the link row cascades
    // away with it, so a group that's private to this product (not shared
    // with anything else) can be cleaned up too instead of being left behind
    // as permanent clutter in the options list.
    const { data: groupLinks } = await sb.from('menu_item_modifier_groups').select('modifier_group_id').eq('menu_item_id', editingProductId);
    const candidateGroupIds = (groupLinks||[]).map(l=>l.modifier_group_id);

    // child rows (recipe lines, box slots, modifier links) cascade-delete in the database
    const { error } = await sb.from('menu_items').delete().eq('id', editingProductId);
    if(error){
      // a product that's ever been sold has real order_items pointing at it
      // (no ON DELETE CASCADE there, on purpose — order history must never
      // silently disappear) — a hard delete is impossible, so fall back to
      // archiving it instead of just failing.
      if(error.code === '23503'){
        const archivedName = item.name.includes('(مؤرشف)') ? item.name : item.name + ' (مؤرشف)';
        const { error: archiveErr } = await sb.from('menu_items').update({ active:false, name:archivedName }).eq('id', editingProductId);
        if(archiveErr) throw archiveErr;
        Object.assign(item, { active:false, name:archivedName });
        logDashboardAudit('أرشف صنف له سجل طلبات حقيقي: ' + archivedName);
        closeProductEditModal();
        renderCategoryTabs();
        renderMenuProductTable();
        renderCostCompletionBanner();
        showToast('هذا الصنف له طلبات حقيقية سابقة فما ينحذف نهائيًا — تمت أرشفته وصار غير ظاهر بالكاشير');
        return;
      }
      throw error;
    }
    MENU_ITEMS = MENU_ITEMS.filter(m=>m.id!==editingProductId);

    if(candidateGroupIds.length){
      const { data: stillLinked } = await sb.from('menu_item_modifier_groups').select('modifier_group_id').in('modifier_group_id', candidateGroupIds);
      const stillUsed = new Set((stillLinked||[]).map(l=>l.modifier_group_id));
      const orphanIds = candidateGroupIds.filter(id=>!stillUsed.has(id));
      if(orphanIds.length) await sb.from('modifier_groups').delete().in('id', orphanIds);
    }

    logDashboardAudit('حذف صنف من القائمة: ' + item.name);
    closeProductEditModal();
    renderCategoryTabs();
    renderMenuProductTable();
    renderCostCompletionBanner();
    showToast('تم حذف الصنف');
  } catch(err){
    showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  }
}

/* ============ Inventory cross-reference — which menu items use each stock ingredient.
   Scans MENU_ITEMS' recipes directly; nothing hand-maintained twice. */
function getUsedInMap(){
  const map = {};
  MENU_ITEMS.forEach(item=>{
    if(item.linkInventory && item.costMode==='recipe'){
      (item.recipe||[]).forEach(r=>{
        if(!map[r.ingredient]) map[r.ingredient] = [];
        map[r.ingredient].push(item.name);
      });
    }
  });
  return map;
}

/* ============ Modifier Groups CRUD — the reusable library, same premium table+modal pattern as Products ============ */
let modGroupModalState = {name:'', type:'single', max:4, options:[]};

function renderModifierGroupsTable(){
  const el = document.getElementById('modifierGroupsTable');
  if(!el) return;
  if(MODIFIER_GROUPS.length === 0){
    el.innerHTML = '<div class="menu-table-empty">ما فيه مجموعات خيارات لسا — أنشئ أول وحدة من الزر فوق.</div>';
    return;
  }
  el.innerHTML = MODIFIER_GROUPS.map(g=>{
    const usedByProducts = MENU_ITEMS.filter(m=>m.modifierGroupIds.includes(g.id));
    return `<div class="menu-table-row" data-id="${g.id}">
      <div class="mtr-product">
        <div class="mtr-name-col">
          <div class="mtr-name">${g.name}</div>
          <div class="mtr-mod-chips">${g.options.map(o=>`<span class="mtr-mod-chip">${o.name}${o.priceDelta?' +'+o.priceDelta:''}</span>`).join('')}</div>
        </div>
      </div>
      <div class="mth-col-modtype"><span class="mtr-mod-type-badge">${g.type==='single'?'اختيار واحد':g.type==='quantity'?'كمية (حتى '+g.max+')':'اختيار متعدد'}</span></div>
      <div class="mth-col-modused"><span class="mtr-mod-used">${usedByProducts.length ? '<b>'+usedByProducts.length+'</b> منتج' : 'ما تستخدم بعد'}</span></div>
      <div class="mtr-action"><button class="mtr-edit-btn" data-id="${g.id}">تعديل</button></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.menu-table-row').forEach(row=>{
    row.addEventListener('click', ()=> openModGroupModal(parseInt(row.dataset.id)));
  });
}

function openModGroupModal(groupId){
  editingModGroupId = groupId || null;
  const existing = groupId ? MODIFIER_GROUPS.find(g=>g.id===groupId) : null;
  modGroupModalState = existing
    ? {name:existing.name, type:existing.type, max:existing.max, options: JSON.parse(JSON.stringify(existing.options))}
    : {name:'', type:'single', max:4, options:[]};

  document.getElementById('modGroupModalTitle').textContent = existing ? 'تعديل: ' + existing.name : 'مجموعة خيارات جديدة';
  document.getElementById('modGroupDeleteLink').style.display = existing ? 'block' : 'none';
  renderModGroupModalBody();
  document.getElementById('modGroupModal').classList.add('show');
}

function modGroupModalBodyHtml(){
  return `
    <div class="menu-add-field" style="margin-bottom:16px;"><label>عنوان المجموعة</label><input type="text" id="mgName" value="${modGroupModalState.name}" placeholder="مثال: الحجم"></div>

    <div class="panel-subtitle" style="margin-top:0;" class="field-label-row">نوع الاختيار ${helpIcon('اختيار واحد: العميل يختار خيار واحد بس (مثل الحجم، درجة النضج). اختيار متعدد: يقدر يحدد أكثر من خيار، كل واحد له سعره لحاله (مثل إضافات). كمية متعددة: تحدد إجمالي قطع، والعميل يوزّعها بين الخيارات بالكمية اللي يبيها (مثل بوكس ٦ قطع).')}</div>
    <select id="mgTypeSelect" class="pe-select" style="margin-bottom:4px;">
      <option value="single" ${modGroupModalState.type==='single'?'selected':''}>اختيار واحد فقط — مثال: الحجم، درجة النضج</option>
      <option value="multiple" ${modGroupModalState.type==='multiple'?'selected':''}>اختيار متعدد — مثال: إضافات، مقبلات جانبية</option>
      <option value="quantity" ${modGroupModalState.type==='quantity'?'selected':''}>كمية متعددة — مثال: بوكس ٦ قطع يوزّعها العميل</option>
    </select>
    <div class="menu-add-field" id="mgMaxField" style="max-width:220px; display:${modGroupModalState.type!=='single'?'block':'none'}; margin-bottom:16px; margin-top:12px;">
      <label>${modGroupModalState.type==='quantity' ? 'إجمالي القطع اللي يوزّعها العميل' : 'أقصى عدد يختاره العميل'}</label><input type="number" id="mgMax" value="${modGroupModalState.max}" min="1">
    </div>

    <div class="panel-subtitle">الخيارات</div>
    ${modGroupModalState.type==='quantity' ? '<div class="stock-qty-helper">لكل خيار حد أقصى خاص فيه (اختياري) — سيبه فاضي يعني مفتوح لحد الإجمالي فوق.</div>' : ''}
    <div id="mgOptionRows"></div>
    <button class="add-row-btn" id="addMgOptionBtn">+ أضف خيار</button>
  `;
}

function renderModGroupModalBody(){
  document.getElementById('modGroupModalBody').innerHTML = modGroupModalBodyHtml();
  document.getElementById('mgName').addEventListener('input', (e)=> modGroupModalState.name = e.target.value);
  document.getElementById('mgTypeSelect').addEventListener('change', (e)=> setModGroupType(e.target.value));
  document.getElementById('mgMax').addEventListener('input', (e)=> modGroupModalState.max = parseInt(e.target.value)||4);
  document.getElementById('addMgOptionBtn').addEventListener('click', ()=>{
    modGroupModalState.options.push({name:'', priceDelta:0, costMode:'simple', extraCost:0, optionMax:null});
    renderMgOptionRows();
  });
  renderMgOptionRows();
}

function setModGroupType(type){
  modGroupModalState.type = type;
  document.getElementById('mgMaxField').style.display = type!=='single' ? 'block' : 'none';
  document.getElementById('mgMaxField').querySelector('label').textContent = type==='quantity' ? 'إجمالي القطع اللي يوزّعها العميل' : 'أقصى عدد يختاره العميل';
  renderMgOptionRows();
}

function renderMgOptionRows(){
  const el = document.getElementById('mgOptionRows');
  if(!el) return;
  const isQty = modGroupModalState.type === 'quantity';
  el.innerHTML = modGroupModalState.options.map((o,i)=>{
    const isStock = o.costMode === 'stock';
    const stockItem = isStock && o.stockLink ? STOCK_ITEMS.find(s=>s.name===o.stockLink.ingredient) : null;
    const units = stockItem ? compatibleUnits(stockItem.unit) : ['piece'];
    return `
    <div class="mg-option-card" data-idx="${i}">
      <div class="mg-option-identity-row">
        <span class="mg-option-badge">${i+1}</span>
        <input type="text" class="mg-opt-name" data-idx="${i}" value="${o.name}" placeholder="اسم الخيار — مثال: جبن إضافي">
        <button class="recipe-remove-btn" data-idx="${i}" title="احذف هذا الخيار">✕</button>
      </div>

      <div class="mg-field-block">
        <label class="field-label-row">السعر الإضافي على العميل (ر.س) ${helpIcon('لو العميل اختار هذا الخيار، هذا المبلغ يُضاف على سعر المنتج الأساسي. اكتب صفر لو ما فيه سعر إضافي.')}</label>
        <input type="number" class="mg-opt-price" data-idx="${i}" value="${o.priceDelta}" placeholder="0">
      </div>
      ${isQty ? `
      <div class="mg-field-block">
        <label class="field-label-row">أقصى عدد لهذا الخيار وحده (اختياري) ${helpIcon('اسيبه فاضي يعني هذا الخيار مفتوح، محكوم بس بإجمالي المجموعة. أو حدد رقم لو تبي تمنع اختياره أكثر من مرات معيّنة.')}</label>
        <input type="number" class="mg-opt-max" data-idx="${i}" value="${o.optionMax!=null?o.optionMax:''}" placeholder="مفتوح">
      </div>` : ''}

      <div class="mg-cost-divider">
        <span class="field-label-row">تكلفتك الحقيقية (لك أنت، مو للعميل) ${helpIcon('هذا الجزء يحدد كم يكلفك فعليًا لو العميل اختار هذا الخيار — يفيد بحساب هامش ربحك، ومو شرط يطابق السعر اللي تحطه على العميل فوق.')}</span>
      </div>
      <div class="mg-cost-mode-row">
        <button class="mg-cost-mode-btn ${!isStock?'active':''}" data-idx="${i}" data-mode="simple">تكلفة بسيطة (رقم تكتبه)</button>
        <button class="mg-cost-mode-btn ${isStock?'active':''}" data-idx="${i}" data-mode="stock">من المخزون (يُحسب تلقائيًا)</button>
      </div>
      ${!isStock ? `
      <div class="mg-field-block">
        <label>مبلغ التكلفة (ر.س)</label>
        <input type="number" class="mg-opt-simple-cost" data-idx="${i}" value="${o.extraCost||0}" placeholder="0">
      </div>` : `
      <div class="mg-stock-link-row">
        <div class="mg-field-block" style="flex:1.4;"><label>الصنف من المخزون</label>
          <select class="mg-opt-stock-ing" data-idx="${i}">${STOCK_ITEMS.map(s=>`<option value="${s.name}" ${o.stockLink&&o.stockLink.ingredient===s.name?'selected':''}>${s.name} (${s.qtyOnHand} ${UNIT_LABELS[s.unit]} متوفر)</option>`).join('')}</select>
        </div>
        <div class="mg-field-block" style="flex:0.6;"><label>الكمية المستخدمة</label>
          <input type="number" class="mg-opt-stock-qty" data-idx="${i}" value="${o.stockLink?o.stockLink.qty:0}" step="0.01">
        </div>
        <div class="mg-field-block" style="flex:0.6;"><label>الوحدة</label>
          <select class="mg-opt-stock-unit" data-idx="${i}">${units.map(u=>`<option value="${u}" ${o.stockLink&&o.stockLink.unit===u?'selected':''}>${UNIT_LABELS[u]}</option>`).join('')}</select>
        </div>
      </div>
      <div class="mg-computed-cost-box">التكلفة الفعلية المحسوبة: <span class="mono">${computeModifierOptionCost(o).toFixed(2)} ر.س</span></div>
      `}
    </div>`;
  }).join('');

  el.querySelectorAll('.mg-opt-name').forEach(inp=> inp.addEventListener('input', ()=>{ modGroupModalState.options[parseInt(inp.dataset.idx)].name = inp.value; }));
  el.querySelectorAll('.mg-opt-price').forEach(inp=> inp.addEventListener('input', ()=>{ modGroupModalState.options[parseInt(inp.dataset.idx)].priceDelta = parseFloat(inp.value)||0; }));
  el.querySelectorAll('.mg-opt-max').forEach(inp=> inp.addEventListener('input', ()=>{ modGroupModalState.options[parseInt(inp.dataset.idx)].optionMax = inp.value===''?null:(parseInt(inp.value)||0); }));
  el.querySelectorAll('.mg-opt-simple-cost').forEach(inp=> inp.addEventListener('input', ()=>{ modGroupModalState.options[parseInt(inp.dataset.idx)].extraCost = parseFloat(inp.value)||0; }));
  el.querySelectorAll('.mg-opt-stock-ing').forEach(sel=> sel.addEventListener('change', ()=>{
    const idx = parseInt(sel.dataset.idx);
    if(!modGroupModalState.options[idx].stockLink) modGroupModalState.options[idx].stockLink = {qty:1, unit:'piece'};
    modGroupModalState.options[idx].stockLink.ingredient = sel.value;
    const s = STOCK_ITEMS.find(x=>x.name===sel.value);
    modGroupModalState.options[idx].stockLink.unit = s.unit==='kg'?'g':s.unit;
    renderMgOptionRows();
  }));
  el.querySelectorAll('.mg-opt-stock-qty').forEach(inp=> inp.addEventListener('input', ()=>{ modGroupModalState.options[parseInt(inp.dataset.idx)].stockLink.qty = parseFloat(inp.value)||0; renderMgOptionRows(); }));
  el.querySelectorAll('.mg-opt-stock-unit').forEach(sel=> sel.addEventListener('change', ()=>{ modGroupModalState.options[parseInt(sel.dataset.idx)].stockLink.unit = sel.value; renderMgOptionRows(); }));
  el.querySelectorAll('.mg-cost-mode-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.idx);
      const mode = btn.dataset.mode;
      modGroupModalState.options[idx].costMode = mode;
      if(mode==='stock' && !modGroupModalState.options[idx].stockLink){
        const first = STOCK_ITEMS[0];
        modGroupModalState.options[idx].stockLink = {ingredient:first.name, qty:1, unit: first.unit==='kg'?'g':first.unit};
      }
      renderMgOptionRows();
    });
  });
  el.querySelectorAll('.recipe-remove-btn').forEach(btn=> btn.addEventListener('click', ()=>{ modGroupModalState.options.splice(parseInt(btn.dataset.idx),1); renderMgOptionRows(); }));
}

function closeModGroupModal(){
  document.getElementById('modGroupModal').classList.remove('show');
  editingModGroupId = null;
}

async function saveModGroup(){
  const name = modGroupModalState.name.trim();
  if(!name){ showToast('لازم تكتب عنوان المجموعة'); return; }
  const options = modGroupModalState.options.filter(o=>o.name.trim());
  if(options.length === 0){ showToast('لازم تضيف خيار وحد على الأقل'); return; }

  const groupData = {
    name, type: modGroupModalState.type,
    max: modGroupModalState.type!=='single' ? (modGroupModalState.max||4) : 1,
    options
  };

  const saveBtn = document.getElementById('modGroupSaveBtn');
  saveBtn.disabled = true;
  try {
    const sb = window.supabaseClient;
    const groupRow = {business_id: CURRENT_PROFILE.business_id, name, type: groupData.type, max_select: groupData.max};
    let groupId = editingModGroupId;
    if(editingModGroupId){
      const { error } = await sb.from('modifier_groups').update(groupRow).eq('id', editingModGroupId);
      if(error) throw error;
      const { error: delErr } = await sb.from('modifier_options').delete().eq('group_id', editingModGroupId);
      if(delErr) throw delErr;
    } else {
      const { data: inserted, error } = await sb.from('modifier_groups').insert(groupRow).select().single();
      if(error) throw error;
      groupId = inserted.id;
    }

    const optionRows = options.map(o=>{
      const row = {group_id: groupId, name: o.name, price_delta: o.priceDelta||0, cost_mode: o.costMode};
      if(o.costMode === 'stock' && o.stockLink){
        row.stock_item_id = STOCK_ITEM_ID_BY_NAME[o.stockLink.ingredient];
        row.stock_qty = o.stockLink.qty; row.stock_unit = o.stockLink.unit;
        if(o.optionMax != null) row.option_max = o.optionMax;
      } else {
        row.extra_cost = o.extraCost || 0;
      }
      return row;
    }).filter(r=> r.cost_mode !== 'stock' || r.stock_item_id);
    if(optionRows.length){
      const { error } = await sb.from('modifier_options').insert(optionRows);
      if(error) throw error;
    }

    if(editingModGroupId){
      Object.assign(MODIFIER_GROUPS.find(g=>g.id===editingModGroupId), groupData);
      logDashboardAudit('عدّل مجموعة خيارات: ' + name);
      showToast('تم تحديث المجموعة');
    } else {
      MODIFIER_GROUPS.push({id: groupId, ...groupData});
      logDashboardAudit('أنشأ مجموعة خيارات جديدة: ' + name);
      showToast('تمت إضافة مجموعة "' + name + '"');
    }
    closeModGroupModal();
    renderModifierGroupsTable();
    renderMenuProductTable();
  } catch(err){
    showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteModGroup(){
  if(!editingModGroupId) return;
  const group = MODIFIER_GROUPS.find(g=>g.id===editingModGroupId);
  const usedBy = MENU_ITEMS.filter(m=>m.modifierGroupIds.includes(editingModGroupId));
  if(usedBy.length > 0){ showToast('ما تقدر تحذفها — مستخدمة في ' + usedBy.length + ' منتج. شيلها من المنتج أول.'); return; }
  try {
    const { error } = await window.supabaseClient.from('modifier_groups').delete().eq('id', editingModGroupId);
    if(error) throw error;
  } catch(err){
    showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    return;
  }
  MODIFIER_GROUPS = MODIFIER_GROUPS.filter(g=>g.id!==editingModGroupId);
  logDashboardAudit('حذف مجموعة خيارات: ' + group.name);
  closeModGroupModal();
  renderModifierGroupsTable();
  showToast('تم حذف المجموعة');
}

/* ============ Bulk Excel import — for setting up a new place with many
   items at once (rapid-add is for day-to-day single additions; this is for
   the initial 50-menu-item / 100-stock-item dump). One branded template per
   section, generated+parsed via the ExcelJS bridge in DashboardPage.tsx.
   Only sections with genuinely many repeated rows get a template — fixed
   costs / settings stay manual, they're a handful of fields, not a list. */
const BULK_IMPORT_CONFIGS = {
  stock: {
    title: 'استيراد المخزون بالجملة',
    fileLabel: 'قالب_المخزون_ركين',
    sheetTitle: 'قالب المخزون',
    instructions: 'عبّي صف واحد لكل صنف مخزون. عمودي "نوع الصنف" و"وحدة الشراء" فيهم قائمة منسدلة بالخلية — اختر منها بدل ما تكتب يدوي عشان ما يصير خطأ إملائي يوقف الاستيراد.',
    columns: [
      {key:'name', header:'اسم الصنف', width:28, type:'text', required:true},
      {key:'category', header:'نوع الصنف', width:20, type:'list', options:['مادة خام أساسية','تغليف ومستلزمات'], required:true},
      {key:'unit', header:'وحدة الشراء', width:16, type:'list', options:['كيلوغرام','غرام','لتر','حبة'], required:true},
      {key:'unitCost', header:'تكلفة الوحدة (ر.س)', width:20, type:'number', required:true},
      {key:'qty', header:'الكمية الحالية', width:18, type:'number', required:false},
    ],
    example: ['زيت زيتون', 'مادة خام أساسية', 'كيلوغرام', 12.5, 5],
  },
  menu: {
    title: 'استيراد قائمة المنتجات بالجملة',
    fileLabel: 'قالب_المنتجات_ركين',
    sheetTitle: 'قالب المنتجات',
    instructions: 'عبّي صف واحد لكل منتج. عمود "التصنيف" فيه قائمة بتصنيفاتك الحالية بس تقدر تكتب تصنيف جديد وبينضاف تلقائيًا. عمود "التكلفة" اختياري — لو ما تعرفها الحين اتركها فاضية وعدّلها بعدين من صفحة القائمة.',
    columns: [
      {key:'name', header:'اسم المنتج', width:28, type:'text', required:true},
      {key:'category', header:'التصنيف', width:22, type:'list', options:[], loose:true, required:true},
      {key:'price', header:'السعر (ر.س)', width:16, type:'number', required:true},
      {key:'cost', header:'التكلفة (ر.س)', width:18, type:'number', required:false},
    ],
    example: ['قهوة أمريكية', 'مشروبات ساخنة', 14, 4],
  },
  modifiers: {
    title: 'استيراد خيارات المنتجات بالجملة',
    fileLabel: 'قالب_الخيارات_ركين',
    sheetTitle: 'قالب الخيارات',
    instructions: 'كل صف = خيار وحد داخل مجموعة. الصفوف اللي عندها نفس "اسم المجموعة" تتجمع مع بعض تلقائيًا — مثال: مجموعة "الحجم" فيها 3 صفوف (صغير/وسط/كبير). كل مجموعة تنضاف باختيار واحد فقط؛ لو تبيها تسمح باختيار أكثر من خيار عدّلها يدويًا بعد الاستيراد.',
    columns: [
      {key:'group', header:'اسم المجموعة', width:24, type:'text', required:true},
      {key:'option', header:'اسم الخيار', width:24, type:'text', required:true},
      {key:'priceDelta', header:'فرق السعر (ر.س)', width:20, type:'number', required:false},
    ],
    example: ['الحجم', 'وسط', 0],
  },
};

let bulkImportState = {kind:null, parsedValid:[], parsedErrors:[]};

function openBulkImportModal(kind){
  bulkImportState = {kind, parsedValid:[], parsedErrors:[]};
  document.getElementById('bulkImportModalTitle').textContent = BULK_IMPORT_CONFIGS[kind].title;
  renderBulkImportStep1();
  document.getElementById('bulkImportModal').classList.add('show');
}
function closeBulkImportModal(){
  document.getElementById('bulkImportModal').classList.remove('show');
  bulkImportState = {kind:null, parsedValid:[], parsedErrors:[]};
}
function bulkImportColumns(kind){
  const cfg = BULK_IMPORT_CONFIGS[kind];
  if(kind !== 'menu') return cfg.columns;
  return cfg.columns.map(c=> c.key==='category' ? {...c, options: MENU_CATEGORIES.length ? MENU_CATEGORIES : ['عام']} : c);
}
function renderBulkImportStep1(){
  const kind = bulkImportState.kind;
  const cfg = BULK_IMPORT_CONFIGS[kind];
  document.getElementById('bulkImportModalBody').innerHTML = `
    <div class="bulk-import-step">
      <div class="bulk-import-step-num">١</div>
      <div class="bulk-import-step-body">
        <div class="bulk-import-step-title">نزّل القالب</div>
        <p class="stock-qty-helper">${cfg.instructions}</p>
        <button class="menu-add-btn menu-add-btn-primary" id="bulkImportDownloadBtn">تنزيل قالب Excel</button>
      </div>
    </div>
    <div class="bulk-import-step">
      <div class="bulk-import-step-num">٢</div>
      <div class="bulk-import-step-body">
        <div class="bulk-import-step-title">عبّي القالب وارفعه هنا</div>
        <p class="stock-qty-helper">يفتح ويشتغل من Excel أو Google Sheets عادي. بعد ما تعبّي بياناتك احفظ الملف وارفع نفس الملف من هنا.</p>
        <label class="bulk-import-drop" id="bulkImportDropZone">
          <input type="file" id="bulkImportFileInput" accept=".xlsx" style="display:none;">
          <span id="bulkImportDropLabel">اضغط هنا لاختيار الملف (.xlsx)</span>
        </label>
      </div>
    </div>
    <div id="bulkImportResultArea"></div>
  `;
  document.getElementById('bulkImportDownloadBtn').addEventListener('click', async ()=>{
    try {
      await window.downloadBulkImportTemplate({
        sheetTitle: cfg.sheetTitle, fileName: cfg.fileLabel, instructions: cfg.instructions,
        businessName: RESTAURANT_INFO.name || 'ركين', columns: bulkImportColumns(kind), exampleRow: cfg.example,
      });
    } catch(err){
      showToast('تعذر تجهيز القالب: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    }
  });
  document.getElementById('bulkImportFileInput').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const label = document.getElementById('bulkImportDropLabel');
    label.textContent = 'جارٍ القراءة...';
    try {
      const rows = await window.parseBulkImportFile(file, bulkImportColumns(kind));
      const {valid, errors} = validateBulkImportRows(kind, rows);
      bulkImportState.parsedValid = valid;
      bulkImportState.parsedErrors = errors;
      renderBulkImportResult();
    } catch(err){
      showToast('تعذرت قراءة الملف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    } finally {
      label.textContent = 'اضغط هنا لاختيار الملف (.xlsx)';
      e.target.value = '';
    }
  });
}
function renderBulkImportResult(){
  const area = document.getElementById('bulkImportResultArea');
  const {parsedValid, parsedErrors, kind} = bulkImportState;
  if(parsedValid.length === 0 && parsedErrors.length === 0){
    area.innerHTML = '<div class="bulk-import-result-row warn">ما لقينا ولا صف فيه بيانات بالملف — تأكد إنك عبّيت تحت صف العناوين وحفظت الملف.</div>';
    return;
  }
  area.innerHTML = `
    <div class="bulk-import-result">
      ${parsedValid.length ? `<div class="bulk-import-result-row ok">✓ <b>${parsedValid.length}</b> صف جاهز للإضافة</div>` : ''}
      ${parsedErrors.length ? `
        <div class="bulk-import-result-row warn">⚠ <b>${parsedErrors.length}</b> صف فيه مشكلة — هذي بس ما بتنضاف، والباقي بينضاف عادي</div>
        <div class="bulk-import-error-list">${parsedErrors.slice(0,60).map(er=>`<div class="bulk-import-error-item">صف ${er.row}: ${er.msg}</div>`).join('')}</div>
      ` : ''}
      ${parsedValid.length ? `<button class="menu-add-btn menu-add-btn-primary" id="bulkImportConfirmBtn">تأكيد إضافة ${parsedValid.length}</button>` : ''}
    </div>
  `;
  const confirmBtn = document.getElementById('bulkImportConfirmBtn');
  if(confirmBtn){
    confirmBtn.addEventListener('click', async ()=>{
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'جارٍ الإضافة...';
      try {
        const count = bulkImportState.parsedValid.length;
        await commitBulkImport(kind, bulkImportState.parsedValid);
        showToast('تمت إضافة ' + count + ' بنجاح');
        closeBulkImportModal();
      } catch(err){
        showToast('تعذرت الإضافة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'تأكيد إضافة ' + bulkImportState.parsedValid.length;
      }
    });
  }
}

function validateBulkImportRows(kind, rows){
  const valid = [], errors = [];
  if(kind === 'stock'){
    const catMap = {'مادة خام أساسية':'raw', 'تغليف ومستلزمات':'packaging'};
    const unitMap = {'كيلوغرام':'kg', 'غرام':'g', 'لتر':'liter', 'حبة':'piece'};
    const seen = new Set();
    rows.forEach(r=>{
      const name = String(r.name||'').trim();
      if(!name){ errors.push({row:r.__row, msg:'ناقص اسم الصنف'}); return; }
      if(STOCK_ITEM_ID_BY_NAME[name] || seen.has(name.toLowerCase())){ errors.push({row:r.__row, msg:`"${name}" موجود مسبقًا بالمخزون`}); return; }
      const category = catMap[String(r.category||'').trim()];
      if(!category){ errors.push({row:r.__row, msg:'نوع الصنف غير صحيح — اختر من القائمة المنسدلة'}); return; }
      const unit = unitMap[String(r.unit||'').trim()];
      if(!unit){ errors.push({row:r.__row, msg:'وحدة الشراء غير صحيحة — اختر من القائمة المنسدلة'}); return; }
      const unitCost = Number(r.unitCost);
      if(!(unitCost >= 0)){ errors.push({row:r.__row, msg:'تكلفة الوحدة غير صحيحة'}); return; }
      const qty = Number(r.qty) || 0;
      seen.add(name.toLowerCase());
      valid.push({name, category, unit, unitCost, qty});
    });
  } else if(kind === 'menu'){
    const seen = new Set();
    rows.forEach(r=>{
      const name = String(r.name||'').trim();
      if(!name){ errors.push({row:r.__row, msg:'ناقص اسم المنتج'}); return; }
      if(MENU_ITEMS.some(m=>m.name.trim()===name) || seen.has(name.toLowerCase())){ errors.push({row:r.__row, msg:`"${name}" موجود مسبقًا بالقائمة`}); return; }
      const category = String(r.category||'').trim();
      if(!category){ errors.push({row:r.__row, msg:'ناقص التصنيف'}); return; }
      const price = Number(r.price);
      if(!(price > 0)){ errors.push({row:r.__row, msg:'السعر غير صحيح'}); return; }
      const cost = Number(r.cost) || 0;
      seen.add(name.toLowerCase());
      valid.push({name, category, price, cost});
    });
  } else if(kind === 'modifiers'){
    const groupsMap = {};
    rows.forEach(r=>{
      const group = String(r.group||'').trim();
      const option = String(r.option||'').trim();
      if(!group || !option){ errors.push({row:r.__row, msg:'ناقص اسم المجموعة أو اسم الخيار'}); return; }
      if(MODIFIER_GROUPS.some(g=>g.name.trim()===group)){ errors.push({row:r.__row, msg:`مجموعة "${group}" موجودة مسبقًا — أضف الخيار لها يدويًا`}); return; }
      const priceDelta = Number(r.priceDelta) || 0;
      if(!groupsMap[group]) groupsMap[group] = [];
      groupsMap[group].push({name:option, priceDelta});
    });
    Object.keys(groupsMap).forEach(g=> valid.push({group:g, options:groupsMap[g]}));
  }
  return {valid, errors};
}

async function commitBulkImport(kind, validRows){
  const sb = window.supabaseClient;
  if(kind === 'stock'){
    const inserts = validRows.map(r=>({business_id:CURRENT_PROFILE.business_id, name:r.name, unit:r.unit, unit_cost:r.unitCost,
      category:r.category, qty_on_hand:r.qty, par_level:r.qty, duration:''}));
    const {data, error} = await sb.from('stock_items').insert(inserts).select();
    if(error) throw error;
    const byName = {}; data.forEach(row=> byName[row.name]=row);
    validRows.forEach(r=>{
      const row = byName[r.name]; if(!row) return;
      STOCK_ITEMS.push({id:row.id, name:row.name, unit:row.unit, unitCost:row.unit_cost, category:row.category,
        qtyOnHand:row.qty_on_hand, parLevel:row.par_level, duration:row.duration||'', aliasNames:[]});
      STOCK_ITEM_ID_BY_NAME[row.name] = row.id; STOCK_ITEM_NAME_BY_ID[row.id] = row.name;
    });
    logDashboardAudit('استورد ' + validRows.length + ' صنف مخزون بالجملة');
    renderStockTable();
    renderWasteAndFoodCost();
    if(typeof renderOnboardingChecklist === 'function') renderOnboardingChecklist();
  } else if(kind === 'menu'){
    for(const r of validRows){
      if(!MENU_CATEGORY_ID_BY_NAME[r.category]){
        const {data:newCat, error:catErr} = await sb.from('menu_categories')
          .insert({business_id:CURRENT_PROFILE.business_id, name:r.category, sort_order:MENU_CATEGORIES.length}).select().single();
        if(catErr) throw catErr;
        MENU_CATEGORY_ID_BY_NAME[r.category] = newCat.id;
        if(!MENU_CATEGORIES.includes(r.category)) MENU_CATEGORIES.push(r.category);
      }
    }
    const inserts = validRows.map(r=>({business_id:CURRENT_PROFILE.business_id, category_id:MENU_CATEGORY_ID_BY_NAME[r.category],
      name:r.name, price:r.price, cost_mode:'direct', direct_cost:r.cost, link_inventory:false, link_profit:false,
      points_redeem_price:null, active:true}));
    const {data, error} = await sb.from('menu_items').insert(inserts).select();
    if(error) throw error;
    const byName = {}; data.forEach(row=> byName[row.name]=row);
    validRows.forEach(r=>{
      const row = byName[r.name]; if(!row) return;
      MENU_ITEMS.push({id:row.id, active:true, name:row.name, price:row.price, category:r.category, image:null,
        costMode:'direct', directCost:row.direct_cost, recipe:[], linkInventory:false, linkProfit:false,
        pointsRedeemPrice:null, modifierGroupIds:[], componentSlot:null});
    });
    logDashboardAudit('استورد ' + validRows.length + ' منتج بالجملة');
    renderCategoryTabs();
    renderMenuProductTable();
    if(typeof renderCostCompletionBanner === 'function') renderCostCompletionBanner();
    if(typeof renderOnboardingChecklist === 'function') renderOnboardingChecklist();
  } else if(kind === 'modifiers'){
    for(const g of validRows){
      const groupRow = {business_id:CURRENT_PROFILE.business_id, name:g.group, type:'single', max_select:1};
      const {data:insertedGroup, error:gErr} = await sb.from('modifier_groups').insert(groupRow).select().single();
      if(gErr) throw gErr;
      const optionRows = g.options.map(o=>({group_id:insertedGroup.id, name:o.name, price_delta:o.priceDelta, cost_mode:'simple', extra_cost:0}));
      const {error:oErr} = await sb.from('modifier_options').insert(optionRows);
      if(oErr) throw oErr;
      MODIFIER_GROUPS.push({id:insertedGroup.id, name:g.group, type:'single', max:1,
        options:g.options.map(o=>({name:o.name, priceDelta:o.priceDelta, costMode:'simple', extraCost:0}))});
    }
    logDashboardAudit('استورد ' + validRows.length + ' مجموعة خيارات بالجملة');
    renderModifierGroupsTable();
    renderMenuProductTable();
  }
}

function wireBulkImportModal(){
  document.getElementById('bulkImportModalClose').addEventListener('click', closeBulkImportModal);
  document.getElementById('bulkImportModal').addEventListener('click', (e)=>{ if(e.target.id==='bulkImportModal') closeBulkImportModal(); });
}

function wireMenuScreen(){
  renderCategoryTabs();
  renderMenuProductTable();
  renderModifierGroupsTable();
  renderCostCompletionBanner();

  document.getElementById('openAddCategoryBtn').addEventListener('click', ()=>{
    document.getElementById('addCategoryInline').style.display = 'flex';
    document.getElementById('newCategoryInput').focus();
  });
  document.getElementById('confirmAddCategoryBtn').addEventListener('click', async ()=>{
    const val = document.getElementById('newCategoryInput').value.trim();
    if(!val){ showToast('لازم تكتب اسم الفئة'); return; }
    if(MENU_CATEGORIES.includes(val)){ showToast('هذي الفئة موجودة أصلًا'); return; }
    try {
      const { data: newCat, error } = await window.supabaseClient.from('menu_categories')
        .insert({business_id: CURRENT_PROFILE.business_id, name: val, sort_order: MENU_CATEGORIES.length}).select().single();
      if(error) throw error;
      MENU_CATEGORY_ID_BY_NAME[val] = newCat.id;
      MENU_CATEGORIES.push(val);
      logDashboardAudit('أضاف قسم رئيسي جديد: ' + val);
      document.getElementById('newCategoryInput').value = '';
      document.getElementById('addCategoryInline').style.display = 'none';
      renderCategoryTabs();
      showToast('تمت إضافة فئة "' + val + '"');
    } catch(err){
      showToast('تعذرت إضافة الفئة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
    }
  });
  document.getElementById('menuSearchInput').addEventListener('input', (e)=>{
    menuSearchQuery = e.target.value;
    renderMenuProductTable();
  });
  document.getElementById('openAddProductBtn').addEventListener('click', ()=> openProductEditModal(null));
  document.getElementById('openBulkImportMenuBtn').addEventListener('click', ()=> openBulkImportModal('menu'));
  document.getElementById('openAddModifierGroupBtn').addEventListener('click', ()=> openModGroupModal(null));
  document.getElementById('openBulkImportModifiersBtn').addEventListener('click', ()=> openBulkImportModal('modifiers'));
  document.getElementById('menuScreenTabs').addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    document.querySelectorAll('#menuScreenTabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('menuTabProducts').style.display = tab==='products' ? 'block' : 'none';
    document.getElementById('menuTabModifiers').style.display = tab==='modifiers' ? 'block' : 'none';
  });

  // unified product edit modal wiring
  document.getElementById('productEditModalClose').addEventListener('click', closeProductEditModal);
  document.getElementById('productEditModal').addEventListener('click', (e)=>{ if(e.target.id==='productEditModal') closeProductEditModal(); });
  document.getElementById('productEditTabs').addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    switchProductEditTab(btn.dataset.tab);
    if(btn.dataset.tab === 'delivery') renderProductDeliveryPricing();
  });
  document.getElementById('productEditSaveBtn').addEventListener('click', saveProductEdit);
  document.getElementById('productDeleteLink').addEventListener('click', deleteProductFromModal);

  // modifier group modal wiring
  document.getElementById('modGroupModalClose').addEventListener('click', closeModGroupModal);
  document.getElementById('modGroupModal').addEventListener('click', (e)=>{ if(e.target.id==='modGroupModal') closeModGroupModal(); });
  document.getElementById('modGroupSaveBtn').addEventListener('click', saveModGroup);
  document.getElementById('modGroupDeleteLink').addEventListener('click', deleteModGroup);
}

/* ============ Services screen (salon/car_wash/mobile_car_wash/clinic only) ============
   Wired conditionally from renderPhase1Screens(), gated on isServiceBusinessType(BUSINESS_TYPE)
   — a restaurant-type business never fetches or renders any of this. services.category_id
   reuses the same menu_categories table/rows as menu_items, so category creation-on-save
   below mirrors saveProductEdit()'s exact fallback instead of building new infrastructure. */
let SERVICES = [];
let SERVICE_STAFF_MEMBERS = [];
let servicesSearchQuery = '';
let serviceModalState = {};
let editingServiceId = null;

async function loadServicesData(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const [servicesRes, staffLinksRes, staffRes] = await Promise.all([
    sb.from('services').select('*').eq('business_id', businessId).order('id'),
    sb.from('service_staff').select('*'),
    sb.from('staff_members').select('id, branch_id, name, active').eq('business_id', businessId).eq('active', true).order('name'),
  ]);
  SERVICE_STAFF_MEMBERS = (staffRes.data||[]).map(s=>({id:s.id, name:s.name}));

  const staffIdsByService = {};
  (staffLinksRes.data||[]).forEach(l=>{
    (staffIdsByService[l.service_id] = staffIdsByService[l.service_id] || []).push(l.staff_member_id);
  });

  const catNameById = {};
  Object.keys(MENU_CATEGORY_ID_BY_NAME).forEach(name=> catNameById[MENU_CATEGORY_ID_BY_NAME[name]] = name);

  SERVICES = (servicesRes.data||[]).map(s=>({
    id: s.id, name: s.name, price: Number(s.price), durationMinutes: s.duration_minutes,
    categoryId: s.category_id, category: catNameById[s.category_id] || MENU_CATEGORIES[0] || 'خدمات',
    active: s.active, staffIds: staffIdsByService[s.id] || []
  }));
}

function servicesIconSvg(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
}

function renderServicesTable(){
  const el = document.getElementById('servicesTable');
  if(!el) return;
  let items = SERVICES;
  if(servicesSearchQuery.trim()) items = items.filter(s=>s.name.includes(servicesSearchQuery.trim()));

  if(items.length === 0){ el.innerHTML = '<div class="menu-table-empty">ما فيه خدمات مضافة بعد.</div>'; return; }

  el.innerHTML = items.map(s=>{
    return `<div class="menu-table-row ${s.active?'':'inactive'}" data-id="${s.id}">
      <div class="mtr-product">
        <div class="mtr-thumb">${servicesIconSvg()}</div>
        <div class="mtr-name-col">
          <div class="mtr-name">${s.name}</div>
          <div class="mtr-meta">${s.category}${s.staffIds.length ? ' — ' + s.staffIds.length + ' موظف مخصص' : ''}</div>
        </div>
      </div>
      <div class="mtr-price mono">${s.price.toFixed(2)}</div>
      <div class="mtr-margin mono">${s.durationMinutes} د</div>
      <div class="mtr-status"><button class="menu-toggle mtr-toggle ${s.active?'active':''}" data-action="toggle" data-id="${s.id}" title="${s.active?'مفعّلة — اضغط للإيقاف':'موقوفة — اضغط للتفعيل'}"></button></div>
      <div class="mtr-action"><button class="mtr-edit-btn" data-id="${s.id}">تعديل</button></div>
    </div>`;
  }).join('');

  el.querySelectorAll('.menu-table-row').forEach(row=>{
    row.addEventListener('click', (e)=>{
      if(e.target.closest('.mtr-toggle')) return;
      openServiceEditModal(parseInt(row.dataset.id));
    });
  });
  el.querySelectorAll('.mtr-toggle').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const service = SERVICES.find(s=>s.id===parseInt(btn.dataset.id));
      const nextActive = !service.active;
      const { error } = await window.supabaseClient.from('services').update({active: nextActive}).eq('id', service.id);
      if(error){ showToast('تعذر تحديث حالة الخدمة'); return; }
      service.active = nextActive;
      logDashboardAudit((service.active?'فعّل':'أوقف') + ' خدمة ' + service.name);
      showToast(service.active ? 'تم تفعيل الخدمة' : 'تم إيقاف الخدمة');
      renderServicesTable();
    });
  });
}

function openServiceEditModal(serviceId){
  editingServiceId = serviceId || null;
  const existing = serviceId ? SERVICES.find(s=>s.id===serviceId) : null;
  serviceModalState = existing
    ? {name:existing.name, price:existing.price, durationMinutes:existing.durationMinutes, category:existing.category, active:existing.active, staffIds:[...existing.staffIds]}
    : {name:'', price:0, durationMinutes:30, category:MENU_CATEGORIES[0]||'', active:true, staffIds:[]};

  document.getElementById('serviceEditModalTitle').textContent = existing ? 'تعديل: ' + existing.name : 'إضافة خدمة جديدة';
  document.getElementById('serviceDeleteLink').style.display = existing ? 'block' : 'none';
  document.getElementById('serviceEditBody').innerHTML = serviceEditBodyHtml();
  wireServiceEditBody();
  document.getElementById('serviceEditModal').classList.add('show');
}

function serviceEditBodyHtml(){
  return `
    <div class="menu-add-row">
      <label>اسم الخدمة</label>
      <input type="text" id="svcNameInput" value="${serviceModalState.name}" placeholder="مثال: قص شعر">
    </div>
    <div class="menu-add-row" style="display:flex; gap:12px;">
      <div style="flex:1;">
        <label>السعر (ر.س)</label>
        <input type="number" id="svcPriceInput" min="0" step="0.01" value="${serviceModalState.price}">
      </div>
      <div style="flex:1;">
        <label>المدة (دقيقة)</label>
        <input type="number" id="svcDurationInput" min="1" step="1" value="${serviceModalState.durationMinutes}">
      </div>
    </div>
    <div class="menu-add-row">
      <label>الفئة</label>
      <select id="svcCategoryInput">${MENU_CATEGORIES.map(c=>`<option value="${c}" ${serviceModalState.category===c?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="menu-add-row">
      <label class="attach-group-item" style="max-width:220px;">
        <input type="checkbox" id="svcActiveInput" ${serviceModalState.active?'checked':''}>
        <span class="ag-name">الخدمة مفعّلة</span>
      </label>
    </div>
    <div class="menu-add-row">
      <label>الموظفين المخصصين لهذي الخدمة</label>
      <p style="font-size:11.5px; color:var(--muted); margin:0 0 6px;">اتركها بدون تحديد عشان أي موظف نشط يقدر يسويها. حدد موظفين معينين عشان تقيّدها عليهم بس.</p>
      <div class="attach-groups-list" id="serviceStaffChecklist"></div>
    </div>
  `;
}

function wireServiceEditBody(){
  document.getElementById('svcNameInput').addEventListener('input', e=> serviceModalState.name = e.target.value);
  document.getElementById('svcPriceInput').addEventListener('input', e=> serviceModalState.price = Number(e.target.value)||0);
  document.getElementById('svcDurationInput').addEventListener('input', e=> serviceModalState.durationMinutes = Number(e.target.value)||0);
  document.getElementById('svcCategoryInput').addEventListener('change', e=> serviceModalState.category = e.target.value);
  document.getElementById('svcActiveInput').addEventListener('change', e=> serviceModalState.active = e.target.checked);
  renderServiceStaffChecklist();
}

function renderServiceStaffChecklist(){
  const el = document.getElementById('serviceStaffChecklist');
  if(!el) return;
  if(SERVICE_STAFF_MEMBERS.length === 0){
    el.innerHTML = '<div class="menu-table-empty">ما فيه موظفين نشطين مسجلين بعد.</div>';
    return;
  }
  el.innerHTML = SERVICE_STAFF_MEMBERS.map(st=>{
    const checked = serviceModalState.staffIds.includes(st.id);
    return `<label class="attach-group-item">
      <input type="checkbox" class="svc-staff-checkbox" value="${st.id}" ${checked?'checked':''}>
      <span class="ag-name">${st.name}</span>
    </label>`;
  }).join('');
  el.querySelectorAll('.svc-staff-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const id = parseInt(cb.value);
      if(cb.checked){ if(!serviceModalState.staffIds.includes(id)) serviceModalState.staffIds.push(id); }
      else { serviceModalState.staffIds = serviceModalState.staffIds.filter(x=>x!==id); }
    });
  });
}

async function saveServiceEdit(){
  const name = serviceModalState.name.trim();
  if(!name){ showToast('لازم تكتب اسم الخدمة'); return; }
  if(!(serviceModalState.price >= 0)){ showToast('لازم تدخل سعر صحيح'); return; }
  if(!(serviceModalState.durationMinutes > 0)){ showToast('لازم تدخل مدة صحيحة بالدقائق'); return; }
  const category = serviceModalState.category.trim();
  if(!category){ showToast('لازم تحدد فئة للخدمة'); return; }

  const saveBtn = document.getElementById('serviceEditSaveBtn');
  saveBtn.disabled = true;
  try {
    const sb = window.supabaseClient;
    let categoryId = MENU_CATEGORY_ID_BY_NAME[category];
    if(!categoryId){
      const { data: newCat, error: catErr } = await sb.from('menu_categories')
        .insert({business_id: CURRENT_PROFILE.business_id, name: category, sort_order: MENU_CATEGORIES.length}).select().single();
      if(catErr) throw catErr;
      categoryId = newCat.id;
      MENU_CATEGORY_ID_BY_NAME[category] = categoryId;
      if(!MENU_CATEGORIES.includes(category)) MENU_CATEGORIES.push(category);
    }

    const row = {
      business_id: CURRENT_PROFILE.business_id, category_id: categoryId, name,
      price: serviceModalState.price, duration_minutes: serviceModalState.durationMinutes,
      active: serviceModalState.active
    };

    let serviceId = editingServiceId;
    if(editingServiceId){
      const { error } = await sb.from('services').update(row).eq('id', editingServiceId);
      if(error) throw error;
      const { error: delErr } = await sb.from('service_staff').delete().eq('service_id', editingServiceId);
      if(delErr) throw delErr;
    } else {
      const { data: inserted, error } = await sb.from('services').insert(row).select().single();
      if(error) throw error;
      serviceId = inserted.id;
    }

    if(serviceModalState.staffIds.length){
      const staffRows = serviceModalState.staffIds.map(sid=>({service_id: serviceId, staff_member_id: sid}));
      const { error: staffErr } = await sb.from('service_staff').insert(staffRows);
      if(staffErr) throw staffErr;
    }

    const serviceData = {name, price: serviceModalState.price, durationMinutes: serviceModalState.durationMinutes,
      categoryId, category, active: serviceModalState.active, staffIds: [...serviceModalState.staffIds]};

    if(editingServiceId){
      Object.assign(SERVICES.find(s=>s.id===editingServiceId), serviceData);
      logDashboardAudit('عدّل خدمة ' + name);
      showToast('تم حفظ التعديلات');
    } else {
      SERVICES.push({id: serviceId, ...serviceData});
      logDashboardAudit('أضاف خدمة جديدة: ' + name);
      showToast('تمت إضافة الخدمة');
    }

    closeServiceEditModal();
    renderServicesTable();
  } catch(err){
    showToast('تعذر حفظ الخدمة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteServiceFromModal(){
  if(!editingServiceId) return;
  const service = SERVICES.find(s=>s.id===editingServiceId);
  const sb = window.supabaseClient;
  try {
    const { error } = await sb.from('services').delete().eq('id', editingServiceId);
    if(error){
      // a service that's ever been sold/booked has real order_items/table_reservations
      // rows pointing at it (no ON DELETE CASCADE there, same rule as menu_items) —
      // fall back to archiving instead of failing outright.
      if(error.code === '23503'){
        const archivedName = service.name.includes('(مؤرشف)') ? service.name : service.name + ' (مؤرشف)';
        const { error: archiveErr } = await sb.from('services').update({ active:false, name:archivedName }).eq('id', editingServiceId);
        if(archiveErr) throw archiveErr;
        Object.assign(service, { active:false, name:archivedName });
        logDashboardAudit('أرشف خدمة لها سجل طلبات حقيقي: ' + archivedName);
        closeServiceEditModal();
        renderServicesTable();
        showToast('هذي الخدمة لها طلبات حقيقية سابقة فما تنحذف نهائيًا — تمت أرشفتها وصارت غير ظاهرة بالكاشير');
        return;
      }
      throw error;
    }
    SERVICES = SERVICES.filter(s=>s.id!==editingServiceId);
    logDashboardAudit('حذف خدمة ' + service.name);
    closeServiceEditModal();
    renderServicesTable();
    showToast('تم حذف الخدمة');
  } catch(err){
    showToast('تعذر حذف الخدمة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  }
}

function closeServiceEditModal(){
  document.getElementById('serviceEditModal').classList.remove('show');
  editingServiceId = null;
}

async function wireServicesScreen(){
  await loadServicesData();
  renderServicesTable();

  document.getElementById('servicesSearchInput').addEventListener('input', (e)=>{
    servicesSearchQuery = e.target.value;
    renderServicesTable();
  });
  document.getElementById('openAddServiceBtn').addEventListener('click', ()=> openServiceEditModal(null));

  document.getElementById('serviceEditModalClose').addEventListener('click', closeServiceEditModal);
  document.getElementById('serviceEditModal').addEventListener('click', (e)=>{ if(e.target.id==='serviceEditModal') closeServiceEditModal(); });
  document.getElementById('serviceEditSaveBtn').addEventListener('click', saveServiceEdit);
  document.getElementById('serviceDeleteLink').addEventListener('click', deleteServiceFromModal);
}

/* ============ Rooms screen (hotel only) ============
   Room INVENTORY (individual numbered rooms with a live housekeeping
   status) — distinct from room TYPES, which are just `services` rows and
   already get the shared Services screen above via SERVICE_BUSINESS_TYPES.
   Mirrors the Services screen's shape closely. active=false is a soft
   delete designed in from day one (unlike Services, which had to retrofit
   an FK-conflict fallback) since a room can accumulate real booking
   history via hotel_bookings.room_id. */
let HOTEL_ROOMS = [];
let hotelRoomBranches = [];
let roomsSearchQuery = '';
let roomModalState = {};
let editingRoomId = null;

async function loadRoomsData(){
  const sb = window.supabaseClient;
  const businessId = CURRENT_PROFILE.business_id;
  const [roomsRes, branchesRes] = await Promise.all([
    sb.from('hotel_rooms').select('*').eq('business_id', businessId).eq('active', true).order('room_number'),
    sb.from('branches').select('id, name').eq('business_id', businessId).order('id'),
  ]);
  hotelRoomBranches = branchesRes.data || [];
  HOTEL_ROOMS = (roomsRes.data||[]).map(r=>({
    id: r.id, branchId: r.branch_id, roomTypeServiceId: r.room_type_service_id,
    roomNumber: r.room_number, status: r.status
  }));
}

const HOTEL_ROOM_STATUS_LABELS = { available:'متاحة', occupied:'مشغولة', cleaning:'تنظيف', maintenance:'صيانة' };

function roomTypeNameById(serviceId){
  const s = SERVICES.find(s=>s.id===serviceId);
  return s ? s.name : '—';
}

function renderRoomsTable(){
  const el = document.getElementById('roomsTable');
  if(!el) return;
  let items = HOTEL_ROOMS;
  if(roomsSearchQuery.trim()) items = items.filter(r=>r.roomNumber.includes(roomsSearchQuery.trim()));

  if(items.length === 0){ el.innerHTML = '<div class="menu-table-empty">ما فيه غرف مضافة بعد.</div>'; return; }

  el.innerHTML = items.map(r=>{
    return `<div class="menu-table-row" data-id="${r.id}">
      <div class="mtr-product">
        <div class="mtr-thumb">${servicesIconSvg()}</div>
        <div class="mtr-name-col">
          <div class="mtr-name">غرفة ${r.roomNumber}</div>
          <div class="mtr-meta">${roomTypeNameById(r.roomTypeServiceId)}</div>
        </div>
      </div>
      <div class="mtr-price mono">${HOTEL_ROOM_STATUS_LABELS[r.status] || r.status}</div>
      <div class="mtr-margin"></div>
      <div class="mtr-status"></div>
      <div class="mtr-action"><button class="mtr-edit-btn" data-id="${r.id}">تعديل</button></div>
    </div>`;
  }).join('');

  el.querySelectorAll('.menu-table-row').forEach(row=>{
    row.addEventListener('click', ()=> openRoomEditModal(parseInt(row.dataset.id)));
  });
}

function openRoomEditModal(roomId){
  editingRoomId = roomId || null;
  const existing = roomId ? HOTEL_ROOMS.find(r=>r.id===roomId) : null;
  roomModalState = existing
    ? {branchId:existing.branchId, roomTypeServiceId:existing.roomTypeServiceId, roomNumber:existing.roomNumber, status:existing.status}
    : {branchId: hotelRoomBranches[0] ? hotelRoomBranches[0].id : null, roomTypeServiceId: SERVICES[0] ? SERVICES[0].id : null, roomNumber:'', status:'available'};

  document.getElementById('roomEditModalTitle').textContent = existing ? 'تعديل: غرفة ' + existing.roomNumber : 'إضافة غرفة جديدة';
  document.getElementById('roomDeleteLink').style.display = existing ? 'block' : 'none';
  document.getElementById('roomEditBody').innerHTML = roomEditBodyHtml();
  wireRoomEditBody();
  document.getElementById('roomEditModal').classList.add('show');
}

function roomEditBodyHtml(){
  return `
    <div class="menu-add-row">
      <label>رقم الغرفة</label>
      <input type="text" id="roomNumberInput" value="${roomModalState.roomNumber}" placeholder="مثال: 101">
    </div>
    <div class="menu-add-row">
      <label>نوع الغرفة</label>
      <select id="roomTypeInput">${SERVICES.map(s=>`<option value="${s.id}" ${roomModalState.roomTypeServiceId===s.id?'selected':''}>${s.name}</option>`).join('')}</select>
    </div>
    ${hotelRoomBranches.length > 1 ? `
    <div class="menu-add-row">
      <label>الفرع</label>
      <select id="roomBranchInput">${hotelRoomBranches.map(b=>`<option value="${b.id}" ${roomModalState.branchId===b.id?'selected':''}>${b.name}</option>`).join('')}</select>
    </div>` : ''}
    <div class="menu-add-row">
      <label>الحالة</label>
      <select id="roomStatusInput">${Object.keys(HOTEL_ROOM_STATUS_LABELS).map(k=>`<option value="${k}" ${roomModalState.status===k?'selected':''}>${HOTEL_ROOM_STATUS_LABELS[k]}</option>`).join('')}</select>
    </div>
  `;
}

function wireRoomEditBody(){
  document.getElementById('roomNumberInput').addEventListener('input', e=> roomModalState.roomNumber = e.target.value);
  document.getElementById('roomTypeInput').addEventListener('change', e=> roomModalState.roomTypeServiceId = Number(e.target.value));
  const branchInput = document.getElementById('roomBranchInput');
  if(branchInput) branchInput.addEventListener('change', e=> roomModalState.branchId = Number(e.target.value));
  document.getElementById('roomStatusInput').addEventListener('change', e=> roomModalState.status = e.target.value);
}

async function saveRoomEdit(){
  const roomNumber = roomModalState.roomNumber.trim();
  if(!roomNumber){ showToast('لازم تكتب رقم الغرفة'); return; }
  if(!roomModalState.roomTypeServiceId){ showToast('لازم تضيف نوع غرفة واحد على الأقل من شاشة الخدمات أولاً'); return; }
  if(!roomModalState.branchId){ showToast('ما فيه فرع مسجّل لهذا الحساب'); return; }

  const saveBtn = document.getElementById('roomEditSaveBtn');
  saveBtn.disabled = true;
  try {
    const sb = window.supabaseClient;
    const row = {
      business_id: CURRENT_PROFILE.business_id, branch_id: roomModalState.branchId,
      room_type_service_id: roomModalState.roomTypeServiceId, room_number: roomNumber, status: roomModalState.status
    };

    let roomId = editingRoomId;
    if(editingRoomId){
      const { error } = await sb.from('hotel_rooms').update(row).eq('id', editingRoomId);
      if(error) throw error;
    } else {
      const { data: inserted, error } = await sb.from('hotel_rooms').insert({...row, active:true}).select().single();
      if(error) throw error;
      roomId = inserted.id;
    }

    const roomData = {branchId: roomModalState.branchId, roomTypeServiceId: roomModalState.roomTypeServiceId, roomNumber, status: roomModalState.status};
    if(editingRoomId){
      Object.assign(HOTEL_ROOMS.find(r=>r.id===editingRoomId), roomData);
      logDashboardAudit('عدّل غرفة ' + roomNumber);
      showToast('تم حفظ التعديلات');
    } else {
      HOTEL_ROOMS.push({id: roomId, ...roomData});
      logDashboardAudit('أضاف غرفة جديدة: ' + roomNumber);
      showToast('تمت إضافة الغرفة');
    }

    closeRoomEditModal();
    renderRoomsTable();
  } catch(err){
    showToast('تعذر حفظ الغرفة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteRoomFromModal(){
  if(!editingRoomId) return;
  const room = HOTEL_ROOMS.find(r=>r.id===editingRoomId);
  try {
    const { error } = await window.supabaseClient.from('hotel_rooms').update({active:false}).eq('id', editingRoomId);
    if(error) throw error;
    HOTEL_ROOMS = HOTEL_ROOMS.filter(r=>r.id!==editingRoomId);
    logDashboardAudit('حذف غرفة ' + room.roomNumber);
    closeRoomEditModal();
    renderRoomsTable();
    showToast('تم حذف الغرفة');
  } catch(err){
    showToast('تعذر حذف الغرفة: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  }
}

function closeRoomEditModal(){
  document.getElementById('roomEditModal').classList.remove('show');
  editingRoomId = null;
}

async function wireRoomsScreen(){
  await loadRoomsData();
  renderRoomsTable();

  document.getElementById('roomsSearchInput').addEventListener('input', (e)=>{
    roomsSearchQuery = e.target.value;
    renderRoomsTable();
  });
  document.getElementById('openAddRoomBtn').addEventListener('click', ()=> openRoomEditModal(null));

  document.getElementById('roomEditModalClose').addEventListener('click', closeRoomEditModal);
  document.getElementById('roomEditModal').addEventListener('click', (e)=>{ if(e.target.id==='roomEditModal') closeRoomEditModal(); });
  document.getElementById('roomEditSaveBtn').addEventListener('click', saveRoomEdit);
  document.getElementById('roomDeleteLink').addEventListener('click', deleteRoomFromModal);
}

/* ============ Settings: Team + real per-employee permissions ============
   Owners/managers always have full access (has_permission() shortcuts them) —
   only employees get individual screen:<slug> / view_profit rows, edited here directly
   against user_permissions (RLS: owner/manager can manage any employee's rows
   in their own business — see user_permissions_manage policy). Deactivating a
   member sets profiles.active=false, which current_business_id() now checks,
   so it's a real access cutoff, not just a hidden row in this list. */
const PERMISSION_CATEGORIES = [
  {label:'الرئيسية والمبيعات', screen:'home'},
  {label:'الطلبات', screen:'orders'},
  {label:'المشتريات', screen:'purchases'},
  {label:'القائمة', screen:'menu'},
  {label:'الخدمات', screen:'services'},
  {label:'الغرف', screen:'rooms'},
  {label:'المخزون', screen:'inventory'},
  {label:'الموظفين', screen:'staff'},
  {label:'العملاء', screen:'customers'},
  {label:'نادي الولاء', screen:'loyalty'},
  {label:'المحاسبة', screen:'accounting'},
  {label:'التقارير', screen:'reports'},
  {label:'الإعدادات', screen:'settings'}
];

function permissionsSettingsHtml(){
  return `
    <div class="panel">
      <div class="panel-title"><span class="field-label-row">فريق العمل ${helpIcon('كل "شاشة" هنا تتحكم بس بالتبويبات اللي يشوفها هذا الموظف بلوحة التحكم — ما لها علاقة بالكاشير (أي موظف عنده صلاحية pos:register من جهاز مربوط يقدر يبيع، بغض النظر عن هذي القائمة). "عرض التكلفة والهامش" صلاحية منفصلة تمامًا: حتى لو فعّلت له شاشة المحاسبة أو المنيو، يقدر يديرها بدون ما يشوف تكلفة أي منتج أو هامش ربحه إلا لو فعّلت له هذي تحديدًا.')}</span><button class="mtr-edit-btn" id="addTeamMemberBtn">+ إضافة عضو فريق</button></div>
      <div id="teamMembersList"><p style="font-size:12.5px; color:var(--muted); font-weight:600;">جاري التحميل...</p></div>
    </div>
  `;
}

let TEAM_MEMBERS = [];
let TEAM_PERMISSIONS_BY_USER = {};
async function renderTeamMembers(){
  const el = document.getElementById('teamMembersList');
  if(!el) return;
  const [{data: members}, {data: perms}] = await Promise.all([
    window.supabaseClient.from('profiles').select('id, full_name, user_type, active, branch_id')
      .eq('business_id', CURRENT_PROFILE.business_id).is('branch_id', null).order('created_at'),
    window.supabaseClient.from('user_permissions').select('user_id, permission_key')
  ]);
  const permsByUser = {};
  (perms||[]).forEach(p=>{ (permsByUser[p.user_id] ||= new Set()).add(p.permission_key); });
  TEAM_MEMBERS = members || [];
  TEAM_PERMISSIONS_BY_USER = permsByUser;

  el.innerHTML = TEAM_MEMBERS.map(m=>{
    const granted = permsByUser[m.id] || new Set();
    const isEmployee = m.user_type === 'employee';
    const permsHtml = isEmployee ? `
      <div class="checklist hidden" id="teamPerms-${m.id}" style="margin:2px 0 14px;">
        ${PERMISSION_CATEGORIES.map(cat=>`
          <label class="check-item" style="opacity:1; transform:none; cursor:pointer;">
            <input type="checkbox" class="team-perm-checkbox" data-user="${m.id}" data-key="screen:${cat.screen}" ${granted.has('screen:'+cat.screen)?'checked':''}>
            <span style="flex:1;">${cat.label}</span>
          </label>`).join('')}
        <label class="check-item" style="opacity:1; transform:none; cursor:pointer; border-top:1px solid var(--line); margin-top:6px; padding-top:8px;">
          <input type="checkbox" class="team-perm-checkbox" data-user="${m.id}" data-key="view_profit" ${granted.has('view_profit')?'checked':''}>
          <span style="flex:1;">عرض التكلفة والهامش (كل الشاشات)</span>
        </label>
      </div>` : '';
    return `
    <div class="team-member-block" style="border-bottom:1px solid var(--line); padding:2px 0;">
      <div class="users-table-row" style="border-bottom:none;">
        <span class="u-name">${m.full_name}</span>
        <span class="u-role">${USER_TYPE_LABELS[m.user_type]||m.user_type}</span>
        <span class="u-status"><span class="u-status-badge ${m.active?'active':'disabled'}">${m.active?'نشط':'معطّل'}</span></span>
        ${isEmployee ? `<button class="u-toggle-btn team-perms-toggle" data-id="${m.id}">الصلاحيات (${granted.size})</button>` : ''}
        ${m.user_type !== 'owner' ? `
          <button class="u-toggle-btn team-edit-btn" data-id="${m.id}">تعديل</button>
          <button class="u-toggle-btn team-toggle-active" data-id="${m.id}" data-active="${m.active}">${m.active?'تعطيل':'تفعيل'}</button>
          <button class="u-toggle-btn team-delete-btn" data-id="${m.id}" data-name="${m.full_name}" style="color:var(--danger, #a3402c); border-color:var(--danger, #a3402c);">حذف</button>
        ` : `<span class="stock-qty-helper" style="width:auto;">صلاحية كاملة دائمًا</span>`}
      </div>
      ${permsHtml}
    </div>`;
  }).join('') || '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">ما فيه أعضاء فريق بعد.</p>';

  el.querySelectorAll('.team-perms-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.getElementById('teamPerms-'+btn.dataset.id).classList.toggle('hidden');
    });
  });

  el.querySelectorAll('.team-perm-checkbox').forEach(cb=>{
    cb.addEventListener('change', async ()=>{
      const userId = cb.dataset.user, key = cb.dataset.key;
      cb.disabled = true;
      try {
        if(cb.checked){
          const { error } = await window.supabaseClient.from('user_permissions')
            .insert({ user_id: userId, permission_key: key, granted_by: CURRENT_PROFILE.id });
          if(error) throw error;
        } else {
          const { error } = await window.supabaseClient.from('user_permissions')
            .delete().eq('user_id', userId).eq('permission_key', key);
          if(error) throw error;
        }
        logDashboardAudit('عدّل صلاحية "' + key + '" لعضو فريق');
        const toggleBtn = el.querySelector('.team-perms-toggle[data-id="'+userId+'"]');
        if(toggleBtn){
          const count = el.querySelectorAll('#teamPerms-'+userId+' .team-perm-checkbox:checked').length;
          toggleBtn.textContent = 'الصلاحيات (' + count + ')';
        }
      } catch(err){
        cb.checked = !cb.checked;
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
      } finally {
        cb.disabled = false;
      }
    });
  });

  el.querySelectorAll('.team-toggle-active').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const makeActive = btn.dataset.active !== 'true';
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.from('profiles').update({active: makeActive}).eq('id', btn.dataset.id);
        if(error) throw error;
        logDashboardAudit((makeActive?'فعّل':'عطّل') + ' عضو فريق');
        await renderTeamMembers();
      } catch(err){
        showToast('تعذر الحفظ: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });

  el.querySelectorAll('.team-edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const member = TEAM_MEMBERS.find(m=>m.id===btn.dataset.id);
      if(member) openTeamMemberModal(member);
    });
  });

  el.querySelectorAll('.team-delete-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteTeamMember(btn.dataset.id, btn.dataset.name));
  });
}

async function deleteTeamMember(userId, name){
  if(!window.confirm('متأكد إنك تبي تحذف "' + name + '"؟ هذا يلغي دخوله نهائيًا وما يتراجع.')) return;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const res = await fetch('/api/dashboard/team-member/' + userId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    const body = await res.json();
    if(!res.ok) throw new Error(body.error || 'خطأ غير متوقع');
    logDashboardAudit('حذف عضو فريق: ' + name);
    showToast('تم حذف الحساب');
    await renderTeamMembers();
  } catch(err){
    showToast('تعذر الحذف: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  }
}

/* openTeamMemberModal(member): add mode when called with no argument, edit
   mode when passed an existing TEAM_MEMBERS row — same modal, same fields,
   just a different submit target (create-team-member vs. PATCH .../team-member/:id). */
function openTeamMemberModal(member){
  const isEdit = !!member;
  const granted = isEdit ? (TEAM_PERMISSIONS_BY_USER[member.id] || new Set()) : new Set();
  document.getElementById('teamMemberModalTitle').textContent = isEdit ? 'تعديل عضو الفريق' : 'إضافة عضو فريق';
  document.getElementById('teamMemberSaveBtn').textContent = isEdit ? 'حفظ التعديلات' : 'إنشاء الحساب';
  document.getElementById('teamMemberDeleteLink').style.display = (isEdit && member.user_type !== 'owner') ? '' : 'none';
  document.getElementById('teamMemberModalBody').innerHTML = `
    <div class="menu-add-field" style="margin-bottom:14px;"><label>الاسم الكامل</label><input type="text" id="tmName" value="${isEdit?member.full_name:''}" placeholder="مثال: سارة العتيبي"></div>
    <div class="menu-add-field" style="margin-bottom:14px;"><label>البريد الإلكتروني</label><input type="email" id="tmEmail" placeholder="name@example.com" ${isEdit ? 'disabled' : ''}></div>
    <div class="menu-add-field" style="margin-bottom:14px;"><label>${isEdit ? 'كلمة مرور جديدة (اتركه فاضي لعدم التغيير)' : 'كلمة المرور المبدئية'}</label><input type="text" id="tmPassword" placeholder="٦ أحرف على الأقل"></div>
    <div class="menu-add-field" style="margin-bottom:14px;"><label>الدور</label>
      ${isEdit
        ? `<input type="text" value="${USER_TYPE_LABELS[member.user_type]||member.user_type}" disabled>`
        : `<select id="tmUserType" class="pe-select">
             <option value="employee">موظف — صلاحيات محددة</option>
             <option value="manager">مدير — صلاحية كاملة</option>
           </select>`}
    </div>
    <div id="tmPermissionsField" style="${isEdit && member.user_type !== 'employee' ? 'display:none;' : ''}">
      <label style="font-size:11.5px; font-weight:700; color:var(--muted);">الصلاحيات الممنوحة</label>
      <div class="checklist" style="margin-top:8px;">
        ${PERMISSION_CATEGORIES.map(cat=>`
          <label class="check-item" style="opacity:1; transform:none; cursor:pointer;">
            <input type="checkbox" class="tm-new-perm" value="screen:${cat.screen}" ${granted.has('screen:'+cat.screen)?'checked':''}>
            <span style="flex:1;">${cat.label}</span>
          </label>`).join('')}
        <label class="check-item" style="opacity:1; transform:none; cursor:pointer; border-top:1px solid var(--line); margin-top:6px; padding-top:8px;">
          <input type="checkbox" class="tm-new-perm" value="view_profit" ${granted.has('view_profit')?'checked':''}>
          <span style="flex:1;">عرض التكلفة والهامش</span>
        </label>
      </div>
    </div>
    <div class="pos-auth-error" id="tmError" style="display:none; margin-top:10px;"></div>
  `;
  if(!isEdit){
    document.getElementById('tmUserType').addEventListener('change', (e)=>{
      document.getElementById('tmPermissionsField').style.display = e.target.value === 'employee' ? '' : 'none';
    });
  }
  document.getElementById('teamMemberModal').dataset.editingId = isEdit ? member.id : '';
  document.getElementById('teamMemberModal').classList.add('show');
}
document.getElementById('teamMemberModalClose').addEventListener('click', ()=>{
  document.getElementById('teamMemberModal').classList.remove('show');
});
document.getElementById('teamMemberDeleteLink').addEventListener('click', async ()=>{
  const modal = document.getElementById('teamMemberModal');
  const userId = modal.dataset.editingId;
  const member = TEAM_MEMBERS.find(m=>m.id===userId);
  if(!member) return;
  modal.classList.remove('show');
  await deleteTeamMember(userId, member.full_name);
});
document.getElementById('teamMemberSaveBtn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('tmError');
  errEl.style.display = 'none';
  const modal = document.getElementById('teamMemberModal');
  const editingId = modal.dataset.editingId;
  const fullName = document.getElementById('tmName').value.trim();
  const password = document.getElementById('tmPassword').value;
  const permissions = Array.from(document.querySelectorAll('.tm-new-perm:checked')).map(cb=>cb.value);
  const btn = document.getElementById('teamMemberSaveBtn');

  if(editingId){
    if(!fullName){ errEl.textContent = 'الاسم مطلوب.'; errEl.style.display = 'block'; return; }
    btn.disabled = true;
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      const res = await fetch('/api/dashboard/team-member/' + editingId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ fullName, password: password || undefined, permissions })
      });
      const body = await res.json();
      if(!res.ok) throw new Error(body.error || 'خطأ غير متوقع');
      modal.classList.remove('show');
      logDashboardAudit('عدّل بيانات عضو فريق: ' + fullName);
      showToast('تم الحفظ');
      await renderTeamMembers();
    } catch(err){
      errEl.textContent = err && err.message ? err.message : 'تعذر الحفظ';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
    return;
  }

  const email = document.getElementById('tmEmail').value.trim();
  const userType = document.getElementById('tmUserType').value;
  if(!fullName || !email || !password){ errEl.textContent = 'كل الحقول مطلوبة.'; errEl.style.display = 'block'; return; }
  btn.disabled = true;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const res = await fetch('/api/dashboard/create-team-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ fullName, email, password, userType, permissions })
    });
    const body = await res.json();
    if(!res.ok) throw new Error(body.error || 'خطأ غير متوقع');
    modal.classList.remove('show');
    logDashboardAudit('أضاف عضو فريق: ' + fullName);
    showToast('تم إنشاء الحساب');
    await renderTeamMembers();
  } catch(err){
    errEl.textContent = err && err.message ? err.message : 'تعذر إنشاء الحساب';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
});

function wirePermissionsSettings(){
  renderTeamMembers();
  document.getElementById('addTeamMemberBtn').addEventListener('click', ()=> openTeamMemberModal());
}

/* ============ Alert sound — pure Web Audio API tone, no external asset.
   Played when a push notification arrives while this dashboard tab is open
   (relayed by dashboard-sw.js's push handler via postMessage — see the
   navigator.serviceWorker 'message' listener below). Browsers don't support
   a custom `sound` on the Notifications API itself, so this in-tab chime is
   the only way to get a branded sound instead of just the OS default; when
   the tab is closed, only the OS's own notification sound plays. */
function playAlertSound(kind){
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    if(ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = kind === 'alarm' ? [880, 660, 880, 660] : [660, 880];
    const noteDur = kind === 'alarm' ? 0.12 : 0.16;
    notes.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'alarm' ? 'square' : 'sine';
      osc.frequency.value = freq;
      const start = now + i * noteDur;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start + noteDur);
    });
    setTimeout(()=> ctx.close(), (notes.length * noteDur + 0.3) * 1000);
  } catch { /* audio is a nice-to-have — never throw over a beep */ }
}
let NOTIFY_SOUND_ENABLED = true;
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', (e)=>{
    if(e.data && e.data.type === 'rakeen-push-received' && NOTIFY_SOUND_ENABLED) playAlertSound('chime');
  });
}

/* ============ Toast (lightweight, for export feedback) ============ */
let toastTimer;
function showToast(msg){
  let t = document.getElementById('dashToast');
  if(!t){
    t = document.createElement('div');
    t.id = 'dashToast';
    t.className = 'dash-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}

/* ============ Audit Trail — footer bar on every page + full drawer.
   Starts empty (no fake prior history) — real entries accumulate as this
   session's real owner/manager/employee takes settings/menu/order actions.
   No real client IP is obtainable from the browser without an external
   lookup service, so that field is dropped rather than faked. */
let DASHBOARD_AUDIT_LOG = [];
function logDashboardAudit(action){
  DASHBOARD_AUDIT_LOG.unshift({
    user: CURRENT_PROFILE ? CURRENT_PROFILE.full_name : 'مستخدم',
    action, time: new Date().toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})
  });
  updateAuditFooter();
}
function updateAuditFooter(){
  const el = document.getElementById('auditFooterItem1');
  if(!el || !DASHBOARD_AUDIT_LOG.length) return;
  const latest = DASHBOARD_AUDIT_LOG[0];
  el.textContent = latest.user + ' — ' + latest.action + ' — ' + latest.time;
}
function renderAuditDrawer(){
  document.getElementById('auditDrawerBody').innerHTML = DASHBOARD_AUDIT_LOG.length
    ? DASHBOARD_AUDIT_LOG.map(a=>
        `<div class="audit-log-row"><span class="audit-log-user">${a.user}</span> — ${a.action}
          <div class="audit-log-meta">${a.time}</div>
        </div>`
      ).join('')
    : '<p style="font-size:12.5px; color:var(--muted); font-weight:600;">ما فيه نشاط مسجّل بعد بهالجلسة.</p>';
}
document.getElementById('auditFooterViewAll').addEventListener('click', ()=>{
  renderAuditDrawer();
  document.getElementById('auditDrawer').classList.add('show');
  document.getElementById('auditOverlay').classList.add('show');
});
document.getElementById('closeAuditDrawer').addEventListener('click', closeAuditDrawer);
document.getElementById('auditOverlay').addEventListener('click', closeAuditDrawer);
function closeAuditDrawer(){
  document.getElementById('auditDrawer').classList.remove('show');
  document.getElementById('auditOverlay').classList.remove('show');
}
/* ============ Real report export — PDF via the browser's own print pipeline
   (guarantees correct Arabic text shaping, which a hand-rolled PDF text API
   cannot; the user picks "Save as PDF" in the native print dialog), Excel via
   a bundled exceljs bridge (window.generateReportExcel, set up in
   DashboardPage.tsx). Neither the PDF nor the Excel file is stored anywhere
   server-side — report_exports only logs who exported what, when. */
const REPORT_TYPE_LABELS = {
  sales:'تقرير المبيعات', products:'تقرير المنتجات', payments:'طرق الدفع', financial:'الملخص المالي الكامل',
  shift:'إغلاق الورديات', tax:'تقرير الضريبة', vat_return:'الإقرار الضريبي', purchases:'تقرير المشتريات', expenses:'تقرير المصاريف'
};

// pulls from the exact same REPORT_RANGE_DATA / REPORT_DETAIL_ROWS the on-
// screen preview just rendered from — the export can never show different
// numbers than what the owner is looking at.
function buildReportPayload(type){
  const now = new Date();
  const generatedAt = now.toLocaleDateString('ar-SA', {year:'numeric', month:'long', day:'numeric'}) + ' — ' + now.toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
  const base = { businessName: RESTAURANT_INFO.name || '', generatedAt, reportTitle: REPORT_TYPE_LABELS[type] + ' — ' + REPORT_RANGE_LABEL };
  const d = REPORT_RANGE_DATA || {};

  if(type === 'sales'){
    return { ...base, stats: [
      {label:'صافي المبيعات', value: (d.netSales||0).toFixed(2) + ' ر.س'},
      {label:'عدد الطلبات', value: String(d.ordersCount||0)},
      {label:'متوسط الفاتورة', value: (d.avgTicket||0).toFixed(2) + ' ر.س', total:true},
    ], table: { headers:['نوع الطلب','عدد الطلبات','الإيراد'], rows: (d.channelPerf||[]).map(c=>[c.name, c.orders, c.revenue.toFixed(2)]) } };
  }
  if(type === 'products'){
    const sorted = [...(d.sellers||[])].sort((a,b)=>b.revenue-a.revenue);
    return { ...base, stats: [], table: { headers:['المنتج','التصنيف','الكمية','الإيرادات'], rows: sorted.map(p=>[p.name, p.cat, p.qty, p.revenue.toFixed(2)]) } };
  }
  if(type === 'payments'){
    return { ...base, stats: [], table: { headers:['طريقة الدفع','المبلغ','النسبة'],
      rows: (d.paymentBreakdown||[]).map(p=>[p.name, p.amount.toFixed(2), (d.netSales>0 ? (p.amount/d.netSales*100).toFixed(0):0)+'٪']) } };
  }
  if(type === 'financial'){
    return { ...base, stats: [
      {label:'الإيراد قبل الخصومات', value:(d.revenue||0).toFixed(2)+' ر.س'},
      {label:'الخصومات', value:(d.discounts||0).toFixed(2)+' ر.س'},
      {label:'صافي المبيعات (شامل الضريبة)', value:(d.netSales||0).toFixed(2)+' ر.س'},
      {label:'ضريبة القيمة المضافة', value:(d.vat||0).toFixed(2)+' ر.س'},
      {label:'تكلفة البضاعة المباعة', value:(d.cogs||0).toFixed(2)+' ر.س'},
      {label:'عمولات ورسوم تطبيقات التوصيل', value:(d.deliveryPlatformCost||0).toFixed(2)+' ر.س'},
      {label:'مجمل الربح', value:(d.grossProfit||0).toFixed(2)+' ر.س'},
      {label:'المصاريف التشغيلية', value:(d.opex||0).toFixed(2)+' ر.س'},
      {label:'صافي الربح', value:(d.netProfit||0).toFixed(2)+' ر.س', total:true},
    ] };
  }
  if(type === 'tax'){
    return { ...base, stats: [
      {label:'صافي المبيعات قبل الضريبة', value:(d.subtotal||0).toFixed(2)+' ر.س'},
      {label:'عدد الطلبات', value: String(d.ordersCount||0)},
      {label:'ضريبة القيمة المضافة المحصّلة (١٥٪)', value:(d.vat||0).toFixed(2)+' ر.س', total:true},
    ] };
  }
  if(type === 'vat_return'){
    const outputVat = d.vat||0;
    const inputVat = (VAT_RETURN_INPUT_DATA && VAT_RETURN_INPUT_DATA.inputVat) || 0;
    const netVat = outputVat - inputVat;
    return { ...base, stats: [
      {label:'ضريبة المخرجات (على المبيعات)', value: outputVat.toFixed(2)+' ر.س'},
      {label:'ضريبة المدخلات (مشتريات مخزون من موردين مسجّلين)', value: inputVat.toFixed(2)+' ر.س'},
      {label: netVat>=0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة القابلة للاسترداد', value: Math.abs(netVat).toFixed(2)+' ر.س', total:true},
    ], table: { headers:['البند','المبلغ قبل الضريبة','الضريبة'], rows: [
      ['المبيعات', (d.subtotal||0).toFixed(2), outputVat.toFixed(2)],
      ['المشتريات (مؤهّلة)', ((VAT_RETURN_INPUT_DATA&&VAT_RETURN_INPUT_DATA.qualifyingPurchasesExclBase)||0).toFixed(2), inputVat.toFixed(2)],
    ] } };
  }
  if(type === 'purchases'){
    const rows = REPORT_DETAIL_ROWS || [];
    return { ...base, stats: [{label:'إجمالي المشتريات', value: rows.reduce((s,r)=>s+r.totalCost,0).toFixed(2)+' ر.س', total:true}],
      table: { headers:['الصنف','المورّد','الكمية','التكلفة'], rows: rows.map(r=>[r.stockItem, r.supplier, r.qty+' '+r.unit, r.totalCost.toFixed(2)]) } };
  }
  if(type === 'expenses'){
    const rows = REPORT_DETAIL_ROWS || [];
    return { ...base, stats: [{label:'إجمالي المصاريف', value: rows.reduce((s,r)=>s+r.amount,0).toFixed(2)+' ر.س', total:true}],
      table: { headers:['التصنيف','الوصف','المبلغ'], rows: rows.map(r=>[r.category, r.description||'—', r.amount.toFixed(2)]) } };
  }
  if(type === 'shift'){
    const rows = REPORT_DETAIL_ROWS || [];
    return { ...base, stats: [], table: { headers:['الكاشير','المبيعات','الكاش المتوقع','الكاش الفعلي','الفرق'],
      rows: rows.map(r=>{
        const expected = r.openingCash + r.sales;
        const diff = r.closingCash!=null ? r.closingCash - expected : null;
        return [r.cashier, r.sales.toFixed(2), expected.toFixed(2), r.closingCash!=null ? r.closingCash.toFixed(2) : '—', diff!=null ? diff.toFixed(2) : '—'];
      }) } };
  }
  return base;
}

function renderPrintReport(payload){
  const existing = document.getElementById('printReportRoot');
  if(existing) existing.remove();
  const root = document.createElement('div');
  root.className = 'print-report-root theme-' + REPORT_THEME;
  root.id = 'printReportRoot';
  const logoHtml = BUSINESS_LOGO_URL
    ? `<img src="${escapeHtml(BUSINESS_LOGO_URL)}" class="print-report-logo" crossorigin="anonymous">`
    : `<div class="print-report-logo-fallback">${escapeHtml((payload.businessName||'؟').trim().charAt(0))}</div>`;
  const statsHtml = payload.stats.map(s=>`<div class="print-report-stat${s.total?' total':''}"><span>${escapeHtml(s.label)}</span><span>${escapeHtml(s.value)}</span></div>`).join('');
  const tableHtml = payload.table ? `
    <table class="print-report-table">
      <thead><tr>${payload.table.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${payload.table.rows.length
        ? payload.table.rows.map(r=>`<tr>${r.map((c,i)=>`<td${i>0?' class="mono"':''}>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${payload.table.headers.length}" style="text-align:center; color:#999;">لا توجد بيانات</td></tr>`}</tbody>
    </table>` : '';
  root.innerHTML = `
    <button class="print-report-close-btn" id="printReportCloseBtn">✕ إغلاق</button>
    <div class="print-report-header">
      <div class="print-report-brand">
        ${logoHtml}
        <div>
          <div class="print-report-brand-name">${escapeHtml(payload.businessName)}</div>
          <div class="print-report-brand-sub">مصدّر بواسطة نظام ركين</div>
        </div>
      </div>
      <div class="print-report-meta">تاريخ الإصدار<br>${escapeHtml(payload.generatedAt)}</div>
    </div>
    <div class="print-report-title">${escapeHtml(payload.reportTitle)}</div>
    ${statsHtml ? `<div class="print-report-stats">${statsHtml}</div>` : ''}
    ${tableHtml}
    <div class="print-report-footer">تقرير مُصدر من نظام ركين لإدارة المطاعم</div>
  `;
  document.body.appendChild(root);
  document.getElementById('printReportCloseBtn').addEventListener('click', ()=> root.remove());
  return root;
}

async function logReportExport(type, format){
  try {
    await window.supabaseClient.from('report_exports').insert({
      business_id: CURRENT_PROFILE.business_id, report_type: type, format, exported_by: CURRENT_PROFILE.id
    });
    logDashboardAudit('صدّر تقرير: ' + REPORT_TYPE_LABELS[type] + ' (' + format.toUpperCase() + ')');
    loadReportHistory();
  } catch(err){ console.error('report export logging failed', err); }
}

async function loadReportHistory(){
  const listEl = document.getElementById('reportHistoryList');
  if(!listEl) return;
  const { data } = await window.supabaseClient
    .from('report_exports')
    .select('report_type, format, exported_at, profiles(full_name)')
    .eq('business_id', CURRENT_PROFILE.business_id)
    .order('exported_at', {ascending:false})
    .limit(10);
  if(!data || data.length === 0){ listEl.innerHTML = '<div class="orders-empty">ما فيه تقارير مصدّرة بعد</div>'; return; }
  listEl.innerHTML = data.map(r=>{
    const dt = new Date(r.exported_at);
    const dateStr = dt.toLocaleDateString('ar-SA', {day:'numeric', month:'short'}) + ' — ' + dt.toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
    return `<div class="report-history-row report-history-row-clickable" data-report-type="${r.report_type}" title="ارجع لهذا النوع من التقارير">
      <div><div class="report-history-main">${REPORT_TYPE_LABELS[r.report_type] || r.report_type}</div><div class="report-history-meta">${(r.profiles && r.profiles.full_name) || '—'} — ${dateStr}</div></div>
      <span class="report-history-badge">${r.format.toUpperCase()}</span>
    </div>`;
  }).join('');
  // "يقدر يرجع لها" — clicking a past export jumps back to that report type
  // (with the current date range) rather than replaying frozen old data,
  // which is never stored server-side by design (see the comment above
  // buildReportPayload)
  listEl.querySelectorAll('.report-history-row-clickable').forEach(row=>{
    row.addEventListener('click', ()=>{
      const type = row.dataset.reportType;
      const chip = document.querySelector('#reportTypeChips button[data-report="'+type+'"]');
      if(!chip) return;
      document.querySelectorAll('#reportTypeChips button').forEach(x=>x.classList.remove('active'));
      chip.classList.add('active');
      activeReportType = type;
      refreshReportData();
      document.getElementById('reportPreviewPanel').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

function exportReportPdf(){
  const payload = buildReportPayload(activeReportType);
  const root = renderPrintReport(payload);
  logReportExport(activeReportType, 'pdf');
  const img = root.querySelector('.print-report-logo');
  const doPrint = ()=> window.print();
  if(img && !img.complete){ img.addEventListener('load', doPrint, {once:true}); img.addEventListener('error', doPrint, {once:true}); }
  else setTimeout(doPrint, 50);
  const cleanup = ()=>{ if(document.body.contains(root)) root.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
}

async function exportReportExcel(btn){
  if(!window.generateReportExcel){ showToast('جاري تجهيز مصدّر Excel، أعد المحاولة بعد لحظة'); return; }
  const payload = buildReportPayload(activeReportType);
  if(btn) btn.disabled = true;
  try {
    await window.generateReportExcel(payload);
    logReportExport(activeReportType, 'excel');
  } catch(err){
    showToast('تعذر إنشاء ملف Excel: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
  } finally {
    if(btn) btn.disabled = false;
  }
}

document.querySelectorAll('.report-export-action').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const type = btn.dataset.export;
    if(type === 'pdf') exportReportPdf();
    else if(type === 'excel') exportReportExcel(btn);
  });
});

/* ============ Report emailing — sends the same structured payload the
   PDF/Excel export uses; the server (app/api/reports/send-email) renders it
   into the actual HTML email itself now (security phase 2, M4) so this
   client can only supply text values, never markup. Needs a real domain
   onboarded to Cloudflare Email Service to actually deliver — see
   wrangler.jsonc's comment above the "send_email" binding. */

document.getElementById('reportEmailToggleBtn').addEventListener('click', ()=>{
  document.getElementById('reportEmailRow').classList.toggle('hidden');
});
document.getElementById('reportEmailSendBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('reportEmailSendBtn');
  const emailInput = document.getElementById('reportEmailInput');
  const email = emailInput.value.trim();
  if(!email){ showToast('اكتب البريد الإلكتروني'); return; }
  btn.disabled = true;
  try {
    const payload = buildReportPayload(activeReportType);
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const res = await fetch('/api/reports/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session ? session.access_token : '') },
      body: JSON.stringify({ to: email, payload })
    });
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || 'تعذر الإرسال');
    logReportExport(activeReportType, 'email');
    showToast('تم إرسال التقرير للبريد');
    document.getElementById('reportEmailRow').classList.add('hidden');
    emailInput.value = '';
  } catch(err){
    showToast(err && err.message ? err.message : 'تعذر الإرسال');
  } finally {
    btn.disabled = false;
  }
});

/* ============ Init ============ */
renderStatusHero();
renderOnboardingChecklist();
renderTodayHeroes();
renderHourGrid();
renderBestWorstSellers();
renderCategoryPerf();
renderPaymentBreakdown();
renderChannelCards();
renderSalesRangeSummary({netSales: TODAY.netSales, ordersCount: TODAY.ordersCount, avgTicket: TODAY.avgTicket, profit: TODAY.profit, salesDelta: YESTERDAY.netSales > 0 ? (TODAY.netSales - YESTERDAY.netSales) / YESTERDAY.netSales * 100 : null});
renderOrderStatusGrid(); // real order rows/table statuses render post-login (renderPhase1Screens) once fetched
renderOrdersByType();
renderOrdersBySource();
renderWasteAndFoodCost();
wireInventoryScreen(); // renderStockTable() itself now runs post-login, once real data is fetched (loadBusinessData/renderPhase1Screens)
renderMovers();
renderWaterfall();
renderOpexBreakdown();
renderVatAndMargin();
wireAccountingScreen(); // renderGeneralExpensesList()/wireMenuScreen() likewise now run post-login
wirePurchasesScreen();
wireBulkImportModal();

// Mobile numeric keyboard: every type="number" field in this app is a
// price/qty/percentage value, so inputmode="decimal" gets the numeric
// keypad with a decimal point on mobile. Patched via observer rather than
// per-input markup edits since most number fields live in JS-built modal
// templates rendered on demand, not the static markup.
(function ensureNumericInputModes(){
  function apply(root){
    root.querySelectorAll('input[type="number"]:not([inputmode])').forEach(function(inp){
      inp.setAttribute('inputmode', 'decimal');
    });
  }
  apply(document);
  new MutationObserver(function(muts){
    muts.forEach(function(m){
      m.addedNodes.forEach(function(node){
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('input[type="number"]') && !node.hasAttribute('inputmode')) {
          node.setAttribute('inputmode', 'decimal');
        }
        if (node.querySelectorAll) apply(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
renderEmployeeCards();
renderAchievements();
renderDeliveryPlatforms();
renderAiSuggestions();
// Reports/Settings/Customers/Loyalty skeleton rendering deferred to their
// nav-item's first visit (see the .nav-item click handler) rather than
// running unconditionally here at script-parse time — before restoreSession()
// even resolves. loadReportHistory() in particular read CURRENT_PROFILE.
// business_id directly with no null guard at that point, throwing
// "Cannot read properties of null (reading 'business_id')" on every single
// dashboard load; it's now only called after login, from Reports' lazy
// trigger, by which point CURRENT_PROFILE is guaranteed to be set.

/* WhatsApp screen removed here — the per-restaurant customer-facing bot this
   originally built was the wrong shape entirely. The real feature (a single
   Rakeen-owned number serving registered clients as a WhatsApp control
   panel, plus a support/lead channel) lives in the webhook + admin panel
   instead; see rakeen_support_conversations. */
})();
