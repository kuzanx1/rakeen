(function(){
  if (window.__rakeenPosBooted) return;
  window.__rakeenPosBooted = true;

// A dedicated reservation-host stand at the entrance (or the cashier
// stepping over to it) — same login and the exact same live
// restaurant_tables/table_reservations data as the real POS, just scoped
// down to seating/waitlist management with no cash drawer, no cart, no
// payment. Detected purely by route (/pos/host) so it's one codebase, not
// a parallel app to keep in sync.
const HOST_MODE = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/pos/host';

// Every innerHTML template in this file that interpolates customer/guest-
// supplied text (online order names/addresses, public reservation names,
// hotel guest names, WhatsApp-derived text) MUST run it through this first —
// none of that data is trusted, and it renders inside an authenticated
// cashier/owner session. Covers the 5 HTML metacharacters; safe to apply
// even to values that also get used inside an attribute (href="...") since
// it escapes quotes too.
function escapeHtml(value){
  if(value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============ DATA — seed literals below are the pre-Supabase demo values;
   loadPosData() (near the auth section) replaces CATEGORIES/PRODUCTS/
   MODIFIER_PRODUCTS with real fetched data after a cashier logs in. Kept as
   `let` (not `const`) for that reassignment; nothing reads them before
   bootPos() runs. ============ */
let CATEGORIES = [
  {id:'hot', name:'ساخنة', icon:'☕'}, {id:'cold', name:'باردة', icon:'🧊'},
  {id:'bakery', name:'مخبوزات', icon:'🥐'}, {id:'mains', name:'رئيسية', icon:'🍔'}, {id:'desserts', name:'حلا', icon:'🍰'}
];
let PRODUCTS = [
  {id:1, cat:'hot', name:'قهوة عربي', price:12, icon:'cupHot', fav:true, pop:98},
  {id:2, cat:'hot', name:'لاتيه', price:18, icon:'cupHot', fav:true, pop:95},
  {id:3, cat:'hot', name:'كابتشينو', price:18, icon:'cupHot', fav:false, pop:70},
  {id:4, cat:'hot', name:'إسبريسو', price:14, icon:'cupHot', fav:false, pop:55},
  {id:5, cat:'hot', name:'شاي كرك', price:10, icon:'cupHot', fav:false, pop:60},
  {id:6, cat:'hot', name:'موكا', price:20, icon:'cupHot', fav:false, pop:40},
  {id:7, cat:'cold', name:'لاتيه مثلج', price:20, icon:'cupCold', fav:true, pop:90},
  {id:8, cat:'cold', name:'آيس كوفي', price:18, icon:'cupCold', fav:false, pop:65},
  {id:9, cat:'cold', name:'عصير برتقال', price:15, icon:'cupCold', fav:false, pop:45},
  {id:10, cat:'cold', name:'ليموناضة نعناع', price:16, icon:'cupCold', fav:false, pop:50},
  {id:11, cat:'cold', name:'مياه معدنية', price:5, icon:'water', fav:false, pop:75},
  {id:12, cat:'bakery', name:'كرواسون', price:12, icon:'pastry', fav:false, pop:58},
  {id:13, cat:'bakery', name:'مافن شوكولاتة', price:14, icon:'pastry', fav:false, pop:42},
  {id:14, cat:'bakery', name:'كوكيز', price:9, icon:'pastry', fav:false, pop:38},
  {id:15, cat:'mains', name:'برجر لحم', price:32, icon:'burger', fav:true, pop:88},
  {id:16, cat:'mains', name:'ساندويش دجاج', price:28, icon:'burger', fav:false, pop:62},
  {id:17, cat:'mains', name:'بيتزا مارجريتا', price:38, icon:'pizza', fav:false, pop:48},
  {id:18, cat:'mains', name:'سلطة سيزر', price:24, icon:'bowl', fav:false, pop:35},
  {id:19, cat:'desserts', name:'تشيز كيك', price:22, icon:'cake', fav:false, pop:52},
  {id:20, cat:'desserts', name:'كنافة', price:20, icon:'cake', fav:false, pop:44},
  {id:21, cat:'mains', name:'بوكس دجاج ١٢ قطعة', price:65, icon:'burger', fav:false, pop:32},
  {id:22, cat:'mains', name:'وجبة برجر', price:42, icon:'burger', fav:true, pop:80}
];

/* ============ MODIFIER SYSTEM ============
   Products not listed here are simple — always fast-path, one tap, instant add.
   Products listed here fast-path using their defaults UNLESS alwaysCustomize is set
   (box/meal builders can't have a sensible default). Long-press always opens customization. */
let MODIFIER_PRODUCTS = {
  15: { // برجر لحم
    groups: [
      {id:'bread', name:'نوع الخبز', type:'single', required:true, options:[
        {id:'classic', name:'كلاسيك', price:0, default:true},
        {id:'sesame', name:'سمسم', price:0},
        {id:'brioche', name:'بريوش', price:3}
      ]},
      {id:'doneness', name:'درجة النضج', type:'single', required:true, options:[
        {id:'medium', name:'متوسط', price:0, default:true},
        {id:'welldone', name:'ويل دن', price:0, critical:true}
      ]},
      {id:'extras', name:'إضافات', type:'multiple', required:false, max:4, options:[
        {id:'cheese', name:'جبن إضافي', price:5},
        {id:'bacon', name:'بيكون تركي', price:8},
        {id:'egg', name:'بيضة', price:4},
        {id:'jalapeno', name:'هالبينو', price:3}
      ]},
      {id:'remove', name:'إزالة مكونات', type:'multiple', required:false, max:4, options:[
        {id:'onion', name:'بدون بصل', price:0, critical:true},
        {id:'pickle', name:'بدون مخلل', price:0, critical:true},
        {id:'sauce', name:'بدون صوص', price:0, critical:true},
        {id:'tomato', name:'بدون طماطم', price:0, critical:true}
      ]}
    ]
  },
  16: { // ساندويش دجاج
    groups: [
      {id:'sauce', name:'نوع الصوص', type:'single', required:true, options:[
        {id:'garlic', name:'ثوم', price:0, default:true},
        {id:'bbq', name:'باربكيو', price:0},
        {id:'spicy', name:'حار', price:0, critical:true}
      ]},
      {id:'remove', name:'إزالة مكونات', type:'multiple', required:false, max:3, options:[
        {id:'onion', name:'بدون بصل', price:0, critical:true},
        {id:'pickle', name:'بدون مخلل', price:0, critical:true}
      ]}
    ]
  },
  17: { // بيتزا مارجريتا
    groups: [
      {id:'size', name:'الحجم', type:'single', required:true, options:[
        {id:'small', name:'صغير', price:-8},
        {id:'medium', name:'وسط', price:0, default:true},
        {id:'large', name:'كبير', price:10}
      ]},
      {id:'crust', name:'نوع العجين', type:'single', required:true, options:[
        {id:'thin', name:'رفيع', price:0, default:true},
        {id:'thick', name:'سميك', price:0},
        {id:'cheesecrust', name:'حواف جبن', price:6}
      ]},
      {id:'toppings', name:'إضافات', type:'multiple', required:false, max:5, options:[
        {id:'mushroom', name:'مشروم', price:4},
        {id:'olives', name:'زيتون', price:3},
        {id:'extracheese', name:'جبن إضافي', price:5}
      ]}
    ]
  },
  2: { // لاتيه
    groups: [
      {id:'size', name:'الحجم', type:'single', required:true, options:[
        {id:'small', name:'صغير', price:-3},
        {id:'medium', name:'وسط', price:0, default:true},
        {id:'large', name:'كبير', price:4}
      ]},
      {id:'milk', name:'نوع الحليب', type:'single', required:false, options:[
        {id:'regular', name:'حليب عادي', price:0, default:true},
        {id:'oat', name:'حليب شوفان', price:4},
        {id:'almond', name:'حليب لوز', price:4}
      ]},
      {id:'sugar', name:'مستوى السكر', type:'single', required:false, options:[
        {id:'normal', name:'عادي', price:0, default:true},
        {id:'less', name:'سكر أقل', price:0},
        {id:'none', name:'بدون سكر', price:0}
      ]}
    ]
  },
  22: { // وجبة برجر — meal builder: flat price, no per-option deltas
    isMeal: true, alwaysCustomize: true,
    groups: [
      {id:'burger', name:'اختر البرجر', type:'single', required:true, options:[
        {id:'classic', name:'برجر كلاسيك', price:0},
        {id:'cheese', name:'برجر تشيز', price:0},
        {id:'spicy', name:'برجر حار', price:0, critical:true}
      ]},
      {id:'side', name:'اختر الجانب', type:'single', required:true, options:[
        {id:'fries', name:'بطاطس', price:0, default:true},
        {id:'salad', name:'سلطة', price:0},
        {id:'onionrings', name:'حلقات بصل', price:0}
      ]},
      {id:'drink', name:'اختر المشروب', type:'single', required:true, options:[
        {id:'pepsi', name:'بيبسي', price:0, default:true},
        {id:'sevenup', name:'سفن أب', price:0},
        {id:'water', name:'مياه', price:0}
      ]}
    ]
  },
  21: { // بوكس دجاج ١٢ قطعة — box builder: flat price, fill exactly N slots
    isBox: true, alwaysCustomize: true, slots: 12,
    items: [
      {id:'wing', name:'ونش'}, {id:'tender', name:'تندر'}, {id:'nugget', name:'ناجت'}, {id:'strips', name:'ستريبس'}
    ]
  }
};

/* Smart upselling — configured per trigger product, max 2 suggestions, never blocking */
const UPSELL_RULES = {
  15: [ {productId:11, label:'مياه'}, {productId:9, label:'عصير برتقال'} ], // burger -> water/juice
  22: [ {productId:19, label:'تشيز كيك'} ], // meal -> dessert
  17: [ {productId:11, label:'مياه'}, {productId:18, label:'سلطة سيزر'} ] // pizza -> water/salad
};

const ICONS = {
  cupHot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2"/></svg>',
  cupCold:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/><path d="M4 8h16l-1.5-4h-13z"/><line x1="14" y1="3" x2="10" y2="10"/></svg>',
  pastry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15c2-6 6-10 9-10s3 2 1 3c3 0 5 2 5 4 0 4-6 9-11 9-2 0-4-2-4-6z"/></svg>',
  burger:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 4 0 0 1 16 0z"/><line x1="3" y1="13" x2="21" y2="13"/><path d="M4 16h16"/><path d="M5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/></svg>',
  pizza:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 18-18 0z"/><circle cx="12" cy="12" r="1"/><circle cx="10" cy="16" r="1"/><circle cx="14" cy="16" r="1"/></svg>',
  bowl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18a9 6 0 0 1-18 0z"/><line x1="12" y1="12" x2="12" y2="4"/></svg>',
  cake:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V11l8-7 8 7v9z"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="12" y1="4" x2="12" y2="11"/></svg>',
  water:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6v3l2 2v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7l2-2z"/><line x1="7" y1="11" x2="17" y2="11"/></svg>'
};
const DELIVERY_PLATFORMS = ['هنقرستيشن','جاهز','ذا شفز','ToYou','مرسول','كيتا'];

/* ============ STATE ============ */
let state = {
  activeCat: 'popular', searchQuery: '', showFavOnly:false,
  cart: [], customer: null, discountPct: 0,
  heldOrders: [], activePaymentMethod: 'cash', cashAmount: 0,
  friendsSplitOpen: false, friendsSplitCount: null,
  pinEntry: '', pinTargetLength: 4,
  orderChannel: 'dine_in', deliveryPlatformId: null, selectedTableId: null, selectedOrderId: null, resumingOrder: null, platformInvoiceLast4: ''
};

/* ============ Alert sounds ============
   All three (new order / 5-min warning / prep time expired) play the real
   recorded sounds the owner provided (self-hosted under public/pos/sounds/,
   same-origin — no external asset fetch). Any kind not in this map falls
   back to a synthesized tone in playAlertSound(). */
const ALERT_SOUND_FILES = {
  new_order: '/pos/sounds/notify-general.mp3',
  warning: '/pos/sounds/notify-prep-warning.mp3',
  alarm: '/pos/sounds/notify-prep-expired.mp3',
  order_ready: '/pos/sounds/notify-general.mp3', // no dedicated "kitchen marked ready" asset yet — reuses the same general chime
  incoming_order: '/pos/sounds/notify-general.mp3' // no dedicated asset yet either — repeated on a timer by startIncomingOrderSound() instead, since this one demands an action, not just an FYI
};
const alertAudioCache = {};
function playAlertSound(kind){
  try {
    const src = ALERT_SOUND_FILES[kind];
    if(src){
      let audio = alertAudioCache[kind];
      if(!audio){ audio = new Audio(src); alertAudioCache[kind] = audio; }
      audio.currentTime = 0;
      audio.play().catch(()=>{}); // autoplay can be blocked before any user gesture — never throw over a sound
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    if(ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = [880, 660, 880, 660];
    const noteDur = 0.12;
    notes.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = now + i * noteDur;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start + noteDur);
    });
    setTimeout(()=> ctx.close(), (notes.length * noteDur + 0.3) * 1000);
  } catch (e) { /* audio is a nice-to-have — never throw over a beep */ }
}

/* ============ UI tap sound ============
   A soft, very short "tick" on every button press across the whole app —
   pure feedback that the tap registered, not an alert. One shared
   AudioContext reused for every tap (never a new one per press, unlike the
   alarm fallback above) — this fires constantly during normal cashiering
   (every product-card tap), and the Sunmi hardware from earlier this build
   is weak enough that per-tap AudioContext churn would be real overhead. */
let tapAudioCtx = null;
function playTapSound(){
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    if(!tapAudioCtx) tapAudioCtx = new Ctx();
    if(tapAudioCtx.state === 'suspended') tapAudioCtx.resume();
    const now = tapAudioCtx.currentTime;
    const osc = tapAudioCtx.createOscillator();
    const gain = tapAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    osc.connect(gain); gain.connect(tapAudioCtx.destination);
    osc.start(now); osc.stop(now + 0.035);
  } catch (e) { /* tap feedback is a nice-to-have — never throw over it */ }
}
// Capture phase (not bubble) so this always fires even when the target's own
// handler calls stopPropagation() (e.g. .dorder-ready-btn does, to stop its
// click from also opening the order-detail modal) — capture runs top-down
// before the target is reached, so a later stopPropagation() during bubble
// can't suppress it. Selector also covers clickable divs that aren't real
// <button> elements (.dorder-card, completed/cancelled .order-row).
document.addEventListener('click', (e)=>{
  const el = e.target.closest('button, .dorder-card, .order-row[data-order]');
  if(el && !el.disabled) playTapSound();
}, true);

/* ============ Toast (replaces alert()) ============ */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toastText').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}

/* ============ Clock ============ */
function updateClock(){
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
}
updateClock(); setInterval(updateClock, 30000);

/* ============ Real connection status — orders queue locally and sync when back online ============ */
/* ============ Theme toggle (independent light/dark modes) ============ */
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
});

function updateConnStatus(){
  const pill = document.getElementById('connStatus');
  const isOnline = navigator.onLine;
  pill.classList.toggle('online', isOnline);
  pill.classList.toggle('offline', !isOnline);
  pill.innerHTML = '<span class="status-dot"></span>' + (isOnline ? 'متصل' : 'غير متصل — يحفظ محليًا');
}
updateConnStatus();
window.addEventListener('online', ()=>{ updateConnStatus(); showToast('رجع الاتصال — تتم مزامنة الطلبات'); });
window.addEventListener('offline', ()=>{ updateConnStatus(); showToast('انقطع الاتصال — الطلبات تُحفظ وتتزامن تلقائيًا'); });

/* ============ Bottom nav / screen switching ============ */
document.getElementById('bottomNav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.nav-tab');
  if(!btn) return;
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+btn.dataset.screen).classList.add('active');
  // refresh live data whenever a screen is (re)entered — never show stale state
  if(btn.dataset.screen === 'orders') renderOrdersList();
  if(btn.dataset.screen === 'tables'){ if(isHotelBusiness()) renderHotelActiveTab(); else renderTables(); }
  // "Scan-first" mode (roadmap item 2): a retail cashier's default action is
  // scanning, not browsing — keep the barcode/search field focused so a
  // hardware scanner's keystrokes land there immediately, no tap needed.
  if(btn.dataset.screen === 'home' && isRetailBusiness()) document.getElementById('searchInput').focus();
});

/* ============ Order channel + delivery platform — changes the base price
   used everywhere (productBasePrice()) since each platform can have its own
   price list, configured on the dashboard. ============ */
// Channel/platform selection UI now lives inside the payment popup's first
// step (renderChannelStep(), below the order-panel section) — this only
// keeps state.deliveryPlatformId defaulted from loaded data, and (re)fills
// the branded button row when that step's markup actually exists in the DOM.
// Each button shows the platform's uploaded logo (Settings → منصات التوصيل)
// or, until one's uploaded, a colored-initial badge using its brand color —
// looks intentional either way, becomes the real logo the moment it's set.
function renderPlatformButtons(){
  if(!state.deliveryPlatformId && DELIVERY_PLATFORMS_LIST.length) state.deliveryPlatformId = DELIVERY_PLATFORMS_LIST[0].id;
  const row = document.getElementById('channelPlatformRow');
  if(!row) return;
  row.innerHTML = DELIVERY_PLATFORMS_LIST.map(p=>{
    const active = p.id === state.deliveryPlatformId;
    const badge = p.logo_url
      ? `<img src="${p.logo_url}" alt="">`
      : `<span class="platform-btn-initial" style="background:${p.brand_color || 'var(--surf2)'}">${(p.name||'؟').charAt(0)}</span>`;
    return `<button type="button" class="platform-btn ${active?'active':''}" data-platform="${p.id}" style="${p.brand_color ? `--platform-color:${p.brand_color};` : ''}">${badge}<span>${p.name}</span></button>`;
  }).join('');
  row.querySelectorAll('.platform-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.deliveryPlatformId = parseInt(btn.dataset.platform, 10);
      renderPlatformButtons();
      renderProductGrid();
      renderOrder();
    });
  });
}

/* ============ Categories ============ */
function renderCatRail(){
  const el = document.getElementById('catRail');
  const cats = [{id:'popular', name:'الأكثر طلبًا', icon:'★'}, {id:'all', name:'الكل', icon:'▦'}, ...CATEGORIES];
  el.innerHTML = cats.map(c=>
    `<button class="cat-btn ${state.activeCat===c.id?'active':''}" data-cat="${c.id}"><span class="ci">${ICONS[c.icon] || c.icon}</span>${c.name}</button>`
  ).join('');
  el.querySelectorAll('.cat-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ state.activeCat = btn.dataset.cat; renderCatRail(); renderProductGrid(); });
  });
}

/* ============ Product grid ============ */
function renderProductGrid(){
  const el = document.getElementById('productGrid');
  let items = PRODUCTS;
  if(state.activeCat === 'popular') items = [...items].sort((a,b)=> b.pop - a.pop).slice(0,8);
  else if(state.activeCat !== 'all') items = items.filter(p=>p.cat===state.activeCat);
  if(state.showFavOnly) items = items.filter(p=>p.fav);
  if(state.searchQuery.trim()) items = items.filter(p=>p.name.includes(state.searchQuery.trim()));

  if(items.length === 0){ el.innerHTML = '<div class="grid-empty">ما فيه نتائج مطابقة</div>'; return; }

  el.innerHTML = items.map(p=>{
    const hasMods = !!MODIFIER_PRODUCTS[p.id];
    const cat = CATEGORIES.find(c=>c.id===p.cat);
    return `<button class="product-card" data-id="${p.id}">
      <span class="fav-star ${p.fav?'on':''}" data-fav="${p.id}">★</span>
      ${hasMods ? '<span class="customize-dot" title="اضغط مطولًا للتخصيص"></span>' : ''}
      <div class="product-icon">${p.image ? `<img src="${p.image}" alt="">` : ICONS[p.icon]}<span class="product-price mono">${productBasePrice(p.id).toFixed(2)}</span></div>
      <div class="product-name">${p.name}</div>
      ${p.isService ? `<div class="product-cat">${p.durationMinutes} د${cat ? ' · ' + cat.name : ''}</div>` : (cat ? `<div class="product-cat">${cat.name}</div>` : '')}
    </button>`;
  }).join('');

  el.querySelectorAll('.product-card').forEach(card=>{
    const productId = parseInt(card.dataset.id);
    let pressTimer = null, longPressFired = false;

    const startPress = (e)=>{
      if(e.target.closest('.fav-star')) return;
      longPressFired = false;
      pressTimer = setTimeout(()=>{
        longPressFired = true;
        openProductFlow(productId, true);
      }, 480);
    };
    const cancelPress = ()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };

    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress, {passive:true});
    card.addEventListener('mouseup', cancelPress);
    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('touchend', cancelPress);
    card.addEventListener('touchmove', cancelPress);

    card.addEventListener('click', (e)=>{
      if(e.target.closest('.fav-star')){
        const id = parseInt(e.target.closest('.fav-star').dataset.fav);
        const p = PRODUCTS.find(x=>x.id===id);
        p.fav = !p.fav;
        renderProductGrid();
        return;
      }
      if(longPressFired){ longPressFired = false; return; } // long-press already handled this interaction
      openProductFlow(productId, false);
      card.classList.add('flash');
      setTimeout(()=> card.classList.remove('flash'), 200);
    });
  });
}
document.getElementById('favToggle').addEventListener('click', function(){
  state.showFavOnly = !state.showFavOnly;
  this.classList.toggle('active', state.showFavOnly);
  renderProductGrid();
});
let searchDebounceTimer;
document.getElementById('searchInput').addEventListener('input', (e)=>{
  state.searchQuery = e.target.value;
  clearTimeout(searchDebounceTimer);
  // full grid re-render is real work on weak hardware (every card repaints
  // its shadow/gradient) — debounce so it happens once per typing pause
  // instead of once per keystroke
  searchDebounceTimer = setTimeout(renderProductGrid, 200);
});
// Roadmap item 2: a USB/Bluetooth barcode scanner acts as a keyboard —
// types the code into whatever field is focused, then sends Enter. The
// search box already promises "ابحث أو امسح باركود..." in its placeholder;
// this is what actually backs that promise. Falls through to the normal
// text-search behavior (already live via the 'input' listener above) when
// the typed text isn't a known barcode.
document.getElementById('searchInput').addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter') return;
  const raw = e.target.value.trim();
  if(!raw) return;
  const productId = BARCODE_TO_PRODUCT_ID[raw];
  if(productId){
    e.preventDefault();
    openProductFlow(productId, false);
    e.target.value = '';
    state.searchQuery = '';
    renderProductGrid();
    const product = PRODUCTS.find(p=>p.id===productId);
    showToast('أُضيف: ' + (product ? product.name : ''));
  } else if(isRetailBusiness()){
    showToast('ما فيه منتج بهذا الباركود');
  }
});

/* ============ Cart logic (config-aware) ============ */
let lineIdCounter = 1;
function configsEqual(a, b){ return JSON.stringify(a||null) === JSON.stringify(b||null); }

function buildDefaultConfig(modDef){
  if(!modDef || modDef.isBox) return null;
  const config = {};
  modDef.groups.forEach(g=>{
    if(g.type === 'single'){
      const def = g.options.find(o=>o.default) || g.options[0];
      config[g.id] = def.id;
    } else {
      config[g.id] = g.options.filter(o=>o.default).map(o=>o.id);
    }
  });
  return config;
}

/* delivery-channel base price override — each platform can have its own
   price list per item (menu_item_platform_prices), configured on the
   dashboard; falls back to the normal price when no override exists or
   the order isn't tagged to a platform. */
function productBasePrice(productId){
  if(state.orderChannel === 'delivery' && state.deliveryPlatformId){
    const override = (PLATFORM_PRICES[state.deliveryPlatformId]||{})[productId];
    if(override != null) return override;
  }
  const p = PRODUCTS.find(x=>x.id===productId);
  return p ? p.price : 0;
}

function lineUnitPrice(item){
  if(item.isPointsRedemption) return 0;
  const modDef = MODIFIER_PRODUCTS[item.productId];
  if(!modDef || modDef.isBox || modDef.isMeal || !item.config) return productBasePrice(item.productId);
  let price = productBasePrice(item.productId);
  modDef.groups.forEach(g=>{
    const sel = item.config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId=>{
      const opt = g.options.find(o=>o.id===optId);
      if(opt) price += (opt.price||0);
    });
  });
  return price;
}

/* simple products (no modifier definition) always fast-add instantly */
function addToCart(productId){
  const product = PRODUCTS.find(p=>p.id===productId);
  addToCartWithConfig(product, null, 1);
}

function addToCartWithConfig(product, config, qty){
  const existing = state.cart.find(i=> i.productId===product.id && configsEqual(i.config, config));
  if(existing){ existing.qty += qty; }
  else { state.cart.push({lineId: lineIdCounter++, productId: product.id, qty, note:'', config}); }
  renderOrder();
}

function changeQty(lineId, delta){
  const item = state.cart.find(i=>i.lineId===lineId);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) state.cart = state.cart.filter(i=>i.lineId!==lineId);
  renderOrder();
}
function removeFromCart(lineId){ state.cart = state.cart.filter(i=>i.lineId!==lineId); renderOrder(); }
function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }
// Saudi Ministry of Commerce requires displayed menu prices to be VAT-
// inclusive — the tax is already baked into menu_items.price, not added on
// top at checkout. PRICES_INCLUDE_VAT (loaded from businesses.
// prices_include_vat, default true) branches this: inclusive mode derives
// the VAT portion FROM the discounted sticker amount instead of adding VAT
// on top of it, matching submit_online_order's server-side math exactly.
function cartTotals(){
  // Closing out an already-registered dine-in tab (state.resumingOrder) has
  // no cart at all — the real totals were already computed and stored on
  // the order row back when it was registered; this just surfaces them.
  if(state.resumingOrder){
    const r = state.resumingOrder;
    return {subtotal: Number(r.subtotal), discount: Number(r.discount_amount), vat: Number(r.vat_amount), total: Number(r.total)};
  }
  const subtotal = state.cart.reduce((s,i)=> s + lineUnitPrice(i)*i.qty, 0);
  const discount = subtotal * (state.discountPct/100);
  const afterDiscount = subtotal - discount;
  const rate = VAT_REGISTERED ? BUSINESS_VAT_RATE : 0;
  let vat, total;
  if(PRICES_INCLUDE_VAT){
    vat = round2(afterDiscount * rate / (1 + rate));
    total = afterDiscount;
  } else {
    vat = round2(afterDiscount * rate);
    total = afterDiscount + vat;
  }
  return {subtotal, discount, vat, total};
}

/* ============ Product flow router: fast path vs custom path ============ */
function openProductFlow(productId, forceCustomize){
  const product = PRODUCTS.find(p=>p.id===productId);
  const modDef = MODIFIER_PRODUCTS[productId];
  if(!modDef){
    addToCartWithConfig(product, null, 1); // simple product — always instant
    return;
  }
  if(modDef.alwaysCustomize || forceCustomize){
    openModifierModal(product, modDef);
  } else {
    const defaultConfig = buildDefaultConfig(modDef);
    addToCartWithConfig(product, defaultConfig, 1);
    maybeShowUpsell(productId);
  }
}

function computeConfigPrice(product, config){
  const modDef = MODIFIER_PRODUCTS[product.id];
  if(!modDef || modDef.isBox || modDef.isMeal || !config) return productBasePrice(product.id);
  let price = productBasePrice(product.id);
  modDef.groups.forEach(g=>{
    const sel = config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId=>{
      const opt = g.options.find(o=>o.id===optId);
      if(opt) price += (opt.price||0);
    });
  });
  return price;
}

/* ============ Modifier modal ============ */
let modifierState = {product:null, modDef:null, config:null, qty:1};
const modifierModal = document.getElementById('modifierModal');

function openModifierModal(product, modDef){
  modifierState = {
    product, modDef,
    config: modDef.isBox ? {selections:{}} : buildDefaultConfig(modDef),
    qty: 1
  };
  document.getElementById('modifierProductName').textContent = product.name;
  if(modDef.isBox) renderBoxBuilder();
  else renderGroupModifiers();
  modifierModal.classList.add('show');
}
document.getElementById('closeModifierModal').addEventListener('click', ()=> modifierModal.classList.remove('show'));
modifierModal.addEventListener('click', (e)=>{ if(e.target===modifierModal) modifierModal.classList.remove('show'); });

function renderGroupModifiers(){
  const {modDef, config, product, qty} = modifierState;
  let html = '';
  modDef.groups.forEach(g=>{
    const selected = config[g.id];
    const selectedArr = Array.isArray(selected) ? selected : [selected];
    const badge = g.required ? 'مطلوب' : (g.type==='multiple' ? 'اختياري · حتى ' + g.max : 'اختياري');
    html += `<div class="mod-group">
      <div class="mod-group-head"><span class="mod-group-name">${g.name}</span><span class="mod-group-badge ${g.required?'required':'optional'}">${badge}</span></div>
      <div class="mod-options">`;
    g.options.forEach(o=>{
      const isSel = selectedArr.includes(o.id);
      html += `<button class="mod-chip ${isSel?'selected':''} ${o.critical?'critical':''}" data-group="${g.id}" data-opt="${o.id}" data-type="${g.type}">
        ${o.name}${o.price?`<span class="mod-chip-price">${o.price>0?'+':''}${o.price}</span>`:''}
      </button>`;
    });
    html += `</div></div>`;
  });
  const unitPrice = computeConfigPrice(product, config);
  html += `<div class="modifier-footer">
    <div class="modifier-qty"><button class="mqty-btn" data-qdelta="-1">−</button><span class="mono" id="modifierQtyVal">${qty}</span><button class="mqty-btn" data-qdelta="1">+</button></div>
    <button class="modifier-add-btn" id="modifierAddBtn">أضف — <span class="mono">${(unitPrice*qty).toFixed(2)}</span> ر.س</button>
  </div>`;
  document.getElementById('modifierBody').innerHTML = html;
  wireGroupModifierEvents();
}

function wireGroupModifierEvents(){
  document.querySelectorAll('.mod-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const groupId = chip.dataset.group, optId = chip.dataset.opt, type = chip.dataset.type;
      const group = modifierState.modDef.groups.find(g=>g.id===groupId);
      if(type === 'single'){
        modifierState.config[groupId] = optId;
      } else {
        let arr = modifierState.config[groupId] || [];
        if(arr.includes(optId)) arr = arr.filter(x=>x!==optId);
        else {
          if(arr.length >= (group.max||99)){ showToast('وصلت للحد الأقصى: ' + group.max); return; }
          arr = [...arr, optId];
        }
        modifierState.config[groupId] = arr;
      }
      renderGroupModifiers();
    });
  });
  document.querySelectorAll('.mqty-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modifierState.qty = Math.max(1, modifierState.qty + parseInt(btn.dataset.qdelta));
      renderGroupModifiers();
    });
  });
  document.getElementById('modifierAddBtn').addEventListener('click', ()=>{
    addToCartWithConfig(modifierState.product, modifierState.config, modifierState.qty);
    modifierModal.classList.remove('show');
    maybeShowUpsell(modifierState.product.id);
  });
}

function renderBoxBuilder(){
  const {modDef, config, product} = modifierState;
  if(modDef.items.length === 0){
    document.getElementById('modifierBody').innerHTML = `
      <div class="box-empty-state">
        <p>هذا البوكس ما له أصناف محددة بعد — لازم تحدد الأصناف اللي يقدر العميل يختار منها الأول.</p>
        <p class="box-empty-hint">من لوحة التحكم: القائمة ← عدّل هذا المنتج ← تبويب "التكلفة والمخزون" ← حدد الأصناف المؤهلة (يحتاج أصناف مخزون مضافة الأول).</p>
      </div>`;
    return;
  }
  modDef.items.forEach(it=>{ if(!(it.id in config.selections)) config.selections[it.id] = 0; });
  const total = Object.values(config.selections).reduce((a,b)=>a+b,0);
  const pct = Math.min(100, Math.round(total/modDef.slots*100));
  let html = `<div class="box-progress-label">${total} / ${modDef.slots} اختيار</div>
    <div class="box-progress"><div class="box-progress-bar" style="width:${pct}%"></div></div>
    <div class="box-items-grid">`;
  modDef.items.forEach(it=>{
    const qty = config.selections[it.id];
    html += `<div class="box-item">
      <span class="box-item-name">${it.name}</span>
      <div class="box-item-qty">
        <button class="qty-btn" data-boxdec="${it.id}">−</button>
        <span class="qty-val mono">${qty}</span>
        <button class="qty-btn" data-boxinc="${it.id}">+</button>
      </div>
    </div>`;
  });
  html += `</div>`;
  const canAdd = total === modDef.slots;
  html += canAdd
    ? `<button class="modifier-add-btn" id="modifierAddBtn">أضف — <span class="mono">${productBasePrice(product.id).toFixed(2)}</span> ر.س</button>`
    : `<button class="modifier-add-btn" id="modifierAddBtn" disabled>اكمل باقي الاختيارات (${modDef.slots-total} متبقي)</button>`;
  document.getElementById('modifierBody').innerHTML = html;

  document.querySelectorAll('[data-boxinc]').forEach(btn=>btn.addEventListener('click', ()=>{
    if(total >= modDef.slots){ showToast('البوكس مكتمل — ' + modDef.slots + ' اختيار'); return; }
    config.selections[btn.dataset.boxinc]++;
    renderBoxBuilder();
  }));
  document.querySelectorAll('[data-boxdec]').forEach(btn=>btn.addEventListener('click', ()=>{
    if(config.selections[btn.dataset.boxdec] > 0){ config.selections[btn.dataset.boxdec]--; renderBoxBuilder(); }
  }));
  if(canAdd){
    document.getElementById('modifierAddBtn').addEventListener('click', ()=>{
      addToCartWithConfig(product, config, 1);
      modifierModal.classList.remove('show');
    });
  }
}

/* ============ Kitchen-aware config labels for the order panel ============ */
function formatConfigLabels(productId, config){
  const modDef = MODIFIER_PRODUCTS[productId];
  if(!modDef || !config) return [];
  if(modDef.isBox){
    return Object.entries(config.selections||{})
      .filter(([k,v])=>v>0)
      .map(([k,v])=>{ const item = modDef.items.find(i=>i.id===k); return {text: item.name + ' ×' + v, critical:false}; });
  }
  const labels = [];
  modDef.groups.forEach(g=>{
    const sel = config[g.id];
    const arr = Array.isArray(sel) ? sel : [sel];
    arr.forEach(optId=>{
      if(!optId) return;
      const opt = g.options.find(o=>o.id===optId);
      if(!opt) return;
      labels.push({text: opt.name, critical: !!opt.critical});
    });
  });
  return labels;
}

/* ============ Smart upselling — configurable, max 2, one-tap, never blocking ============ */
function maybeShowUpsell(productId){
  const rules = UPSELL_RULES[productId];
  if(!rules || rules.length === 0) return;
  const strip = document.getElementById('upsellStrip');
  strip.innerHTML = `<span class="upsell-label">يكمل الطلب:</span>` +
    rules.slice(0,2).map(r=>`<button class="upsell-chip" data-upsell="${r.productId}">+ ${r.label}</button>`).join('') +
    `<button class="upsell-dismiss" id="upsellDismiss">✕</button>`;
  strip.classList.add('show');
  strip.querySelectorAll('[data-upsell]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      addToCart(parseInt(btn.dataset.upsell));
      strip.classList.remove('show');
    });
  });
  document.getElementById('upsellDismiss').addEventListener('click', ()=> strip.classList.remove('show'));
  clearTimeout(state.upsellTimer);
  state.upsellTimer = setTimeout(()=> strip.classList.remove('show'), 6000);
}

/* ============ Render order panel ============ */
// Keeps the order panel itself honest about which table (if any) it's being
// built for — without this, a cashier who claimed table 5 from the Tables
// screen has zero visual confirmation on the Home screen that they're not
// accidentally building a walk-in order instead.
function updateTableBadge(){
  const badge = document.getElementById('opTableBadge');
  const cancelBtn = document.getElementById('opCancelTableBtn');
  if(!badge) return;
  const attached = state.orderChannel === 'dine_in' && state.selectedTableId;
  if(attached){
    const t = (TABLES_CACHE || []).find(x => x.id === state.selectedTableId);
    badge.textContent = 'طاولة ' + (t ? t.number : '');
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
  if(cancelBtn) cancelBtn.style.display = attached ? '' : 'none';
}

// Reachable straight from Home, not just the Tables screen's sheets — a
// cashier mid-order who decides to abandon a table shouldn't have to
// navigate away to do it. Mirrors the exact same two rules used everywhere
// else in this file: nothing registered yet = a plain local release, a
// real order already exists = manager-PIN-gated cancel_dine_in_order.
document.getElementById('opCancelTableBtn').addEventListener('click', async ()=>{
  const table = (TABLES_CACHE || []).find(x => x.id === state.selectedTableId);
  const tableLabel = table ? ('طاولة ' + table.number) : 'الطاولة';
  if(state.selectedOrderId){
    if(!window.confirm('تأكيد إلغاء طلب ' + tableLabel + '؟')) return;
    // Cancelling a just-registered order doesn't always mean the guests
    // left — often it just means "hold off a bit", and the table should
    // stay put waiting for a real order, not get marked for cleaning.
    const stillOccupied = window.confirm('هل الزبائن لسا قاعدين على ' + tableLabel + ' ويحتاجون وقت أطول؟\nموافق = نعم لسا قاعدين — إلغاء = لا، غادروا');
    const orderIdToCancel = state.selectedOrderId;
    openPinModal(async () => {
      const { error } = await window.supabaseClient.rpc('cancel_dine_in_order', { p_order_id: orderIdToCancel, p_still_occupied: stillOccupied });
      if(error){ showToast('تعذر الإلغاء'); return; }
      state.cart = []; state.selectedTableId = null; state.selectedOrderId = null;
      renderOrder();
      showToast(stillOccupied ? ('تراجعنا عن طلب ' + tableLabel + ' — بانتظار الطلب') : ('تم إلغاء طلب ' + tableLabel + ' — بحاجة تنظيف'));
    });
  } else {
    if(!window.confirm('تأكيد التراجع عن ' + tableLabel + '؟')) return;
    const stillOccupied = window.confirm('هل الزبائن لسا قاعدين على ' + tableLabel + '؟\nموافق = نعم لسا قاعدين — إلغاء = لا، غادروا');
    const tableIdToRelease = state.selectedTableId;
    if(tableIdToRelease && !stillOccupied){
      await window.supabaseClient.from('restaurant_tables').update({status:'cleaning'}).eq('id', tableIdToRelease).eq('status','awaiting_order');
    }
    state.cart = []; state.selectedTableId = null; state.selectedOrderId = null;
    renderOrder();
    showToast(stillOccupied ? ('تراجعنا — ' + tableLabel + ' بانتظار الطلب') : ('تم إفراغ ' + tableLabel));
  }
});
function renderOrder(){
  updateTableBadge();
  const itemsEl = document.getElementById('orderItems');
  const payBtn = document.getElementById('payBtn');

  if(state.cart.length === 0){
    const lastTxHtml = state.lastTransaction
      ? `<div class="last-tx-card">
          <div class="last-tx-info"><span>آخر عملية</span><span class="mono">${state.lastTransaction.total.toFixed(2)} ر.س — ${state.lastTransaction.time}</span></div>
          <button class="last-tx-reprint" id="lastTxReprint">إعادة طباعة</button>
        </div>`
      : '';
    itemsEl.innerHTML = `<div class="order-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <p>اضغط منتج عشان يضاف</p>${lastTxHtml}</div>`;
    const reprintBtn = document.getElementById('lastTxReprint');
    if(reprintBtn) reprintBtn.addEventListener('click', ()=> showToast('تمت إعادة الطباعة'));
  } else {
    itemsEl.innerHTML = state.cart.map(i=>{
      const p = PRODUCTS.find(x=>x.id===i.productId);
      const unitPrice = lineUnitPrice(i);
      const configLabels = formatConfigLabels(i.productId, i.config);
      const configHtml = configLabels.length
        ? `<div class="oi-config">${configLabels.map(l=>`<span class="oi-config-tag ${l.critical?'critical':''}">${l.text}</span>`).join('')}</div>`
        : '';
      return `<div class="order-item">
        <div class="oi-row">
          <div class="oi-qty">
            <button class="qty-btn" data-action="dec" data-line="${i.lineId}">−</button>
            <span class="qty-val">${i.qty}</span>
            <button class="qty-btn" data-action="inc" data-line="${i.lineId}">+</button>
          </div>
          <div class="oi-info">
            <div class="oi-name">${escapeHtml(p.name)}${i.isPointsRedemption?' 🎁':''}</div>
            ${i.qty > 1 && !i.isPointsRedemption ? `<div class="oi-unit mono">${unitPrice.toFixed(2)} ر.س / حبة</div>` : ''}
          </div>
          <div class="oi-total mono">${i.isPointsRedemption ? 'نقاط' : (unitPrice*i.qty).toFixed(2)}</div>
          <button class="oi-remove" data-action="remove" data-line="${i.lineId}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        ${configHtml}
        ${i.note
          ? `<div class="oi-note-text">📝 ${escapeHtml(i.note)}</div>`
          : `<button class="oi-note-link" data-action="note-open" data-line="${i.lineId}">+ ملاحظة</button>`}
        <input type="text" class="oi-note-input" data-line="${i.lineId}" placeholder="بدون بصل، إضافي صوص..." value="${escapeHtml(i.note||'')}">
      </div>`;
    }).join('');

    itemsEl.querySelectorAll('[data-action]').forEach(btn=>{
      const lineId = parseInt(btn.dataset.line);
      const action = btn.dataset.action;
      btn.addEventListener('click', ()=>{
        if(action==='inc') changeQty(lineId, 1);
        if(action==='dec') changeQty(lineId, -1);
        if(action==='remove') removeFromCart(lineId);
        if(action==='note-open'){
          const input = itemsEl.querySelector(`.oi-note-input[data-line="${lineId}"]`);
          input.classList.add('open');
          input.focus();
        }
      });
    });
    itemsEl.querySelectorAll('.oi-note-input').forEach(input=>{
      input.addEventListener('blur', ()=>{
        const lineId = parseInt(input.dataset.line);
        const item = state.cart.find(i=>i.lineId===lineId);
        if(item){ item.note = input.value.trim(); renderOrder(); }
      });
    });
  }

  const {subtotal, discount, vat, total} = cartTotals();
  let summaryHtml = `<div class="sum-row"><span>عدد الأصناف</span><span class="mono">${state.cart.reduce((s,i)=>s+i.qty,0)}</span></div>
    <div class="sum-row"><span>المجموع الفرعي</span><span class="mono">${subtotal.toFixed(2)}</span></div>`;
  if(discount > 0) summaryHtml += `<div class="sum-row discount"><span>خصم (${state.discountPct}٪)</span><span class="mono">−${discount.toFixed(2)}</span></div>`;
  summaryHtml += `<div class="sum-row"><span>ضريبة القيمة المضافة${PRICES_INCLUDE_VAT ? ' (شاملة ضمن الإجمالي)' : ''}</span><span class="mono">${vat.toFixed(2)}</span></div>
    <div class="sum-row total"><span>الإجمالي</span><span class="mono">${total.toFixed(2)} ر.س</span></div>`;
  document.getElementById('orderSummary').innerHTML = summaryHtml;
  document.getElementById('payBtnAmount').textContent = total.toFixed(2);
  const registerMode = state.selectedTableId && state.orderChannel === 'dine_in' && DINE_IN_PAY_TIMING === 'after';
  document.getElementById('payBtnLabel').textContent = registerMode ? (state.selectedOrderId ? 'إضافة للطلب' : 'تسجيل الطلب') : 'ادفع';
  payBtn.disabled = state.cart.length === 0;
}

/* ============ Discount panel ============ */
document.getElementById('discountToggle').addEventListener('click', ()=>{
  document.getElementById('discountPanel').classList.toggle('open');
});
document.getElementById('discountPanel').addEventListener('click', (e)=>{
  const btn = e.target.closest('.disc-btn');
  if(!btn) return;
  state.discountPct = parseInt(btn.dataset.pct);
  document.querySelectorAll('.disc-btn').forEach(b=>b.classList.remove('active'));
  if(state.discountPct > 0) btn.classList.add('active');
  renderOrder();
  document.getElementById('discountPanel').classList.remove('open');
  document.getElementById('discountToggle').textContent = state.discountPct > 0 ? `خصم ${state.discountPct}٪ مفعّل` : '+ خصم';
});

/* ============ Customer — step 2 of the payment popup (between channel and
   payment method), not the order panel. Order panel stays pure "build the
   cart"; attaching a customer only ever exists to enable loyalty here, so
   it lives entirely inside the checkout flow now. Search/suggestion logic
   itself (debounced ilike on customers, rich avatar/points rows, "+ إضافة
   عميل جديد" fallback) is unchanged from the original order-panel version —
   just relocated and auto-advancing on selection. */
function setCustomer(customer){
  state.customer = customer;
  updatePointsRedeemStrip();
}

/* Registering a brand-new customer needs BOTH name and phone — complete_pos_order()
   only creates a real customers row when a phone is present (find-or-create by
   phone), and without one this "customer" would just be free text on the order,
   never actually become a loyalty member, and never be found again on a repeat
   visit. Whichever field the cashier already typed in the search box is
   pre-filled here; the other is required before continuing. */
function renderNewCustomerStep(prefill){
  document.getElementById('paymentModalTitle').textContent = 'عميل جديد';
  paymentModalBody.innerHTML = `
    <div class="pos-auth-field">
      <label>الاسم</label>
      <input type="text" id="newCustNameInput" placeholder="اسم العميل" value="${prefill.name || ''}">
    </div>
    <div class="pos-auth-field">
      <label>رقم الجوال</label>
      <input type="text" id="newCustPhoneInput" placeholder="05xxxxxxxx" inputmode="tel" value="${prefill.phone || ''}">
    </div>
    <button class="confirm-pay-btn" id="newCustSaveBtn" disabled>متابعة</button>
  `;
  const nameInput = document.getElementById('newCustNameInput');
  const phoneInput = document.getElementById('newCustPhoneInput');
  const saveBtn = document.getElementById('newCustSaveBtn');
  const validate = ()=>{ saveBtn.disabled = !(nameInput.value.trim() && phoneInput.value.trim()); };
  nameInput.addEventListener('input', validate);
  phoneInput.addEventListener('input', validate);
  validate();
  (prefill.phone ? nameInput : phoneInput).focus();
  saveBtn.addEventListener('click', ()=>{
    setCustomer({name: nameInput.value.trim(), phone: phoneInput.value.trim()});
    proceedFromCustomerStep();
  });
}

function renderCustomerStep(){
  if(!LOYALTY_ENABLED){ proceedFromCustomerStep(); return; }
  document.getElementById('paymentModalTitle').textContent = 'العميل';
  const c = state.customer;
  paymentModalBody.innerHTML = c ? `
    <div class="customer-suggest" style="pointer-events:none;">
      <span class="customer-suggest-avatar">${(c.name||c.phone||'؟').charAt(0)}</span>
      <span class="customer-suggest-info"><span class="customer-suggest-name">${c.name||c.phone}</span>${c.phone && c.name ? `<span class="customer-suggest-phone mono">${c.phone}</span>` : ''}</span>
    </div>
    <button type="button" class="loyalty-otp-back" id="pmCustomerClearBtn" style="margin-top:8px;">تغيير</button>
    <button class="confirm-pay-btn" id="pmCustomerNextBtn" style="margin-top:16px;">متابعة</button>
  ` : `
    <div style="display:flex; gap:8px;">
      <input type="text" id="pmCustomerInput" placeholder="اكتب اسم أو جوال..." style="flex:1;">
      <button class="customer-suggest" id="pmScanCustomerCardBtn" title="مسح بطاقة العميل" type="button" style="flex:0 0 auto; width:44px; justify-content:center;">📷</button>
    </div>
    <div class="customer-panel-row" id="pmCustomerSuggestions"></div>
    <button class="confirm-pay-btn" id="pmCustomerNextBtn" style="margin-top:16px;">تخطي</button>
  `;

  const clearBtn = document.getElementById('pmCustomerClearBtn');
  if(clearBtn) clearBtn.addEventListener('click', ()=>{ setCustomer(null); renderCustomerStep(); });

  const input = document.getElementById('pmCustomerInput');
  if(input){
    input.focus();
    let pmCustomerSearchTimer;
    const suggestEl = document.getElementById('pmCustomerSuggestions');
    input.addEventListener('input', (e)=>{
      clearTimeout(pmCustomerSearchTimer);
      const q = e.target.value.trim();
      if(q.length < 2){ suggestEl.innerHTML = ''; return; }
      suggestEl.innerHTML = `<div class="customer-suggest-loading">جارٍ البحث...</div>`;
      pmCustomerSearchTimer = setTimeout(async ()=>{
        const { data } = await window.supabaseClient.from('customers')
          .select('id, name, phone, loyalty_points').eq('business_id', DEVICE.businessId)
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(6);
        const rows = (data||[]).map(cust=>{
          const initial = (cust.name || cust.phone || '؟').charAt(0);
          const pointsBadge = cust.loyalty_points > 0 ? `<span class="customer-suggest-points">${cust.loyalty_points} نقطة</span>` : '';
          return `<button class="customer-suggest" data-id="${cust.id}" data-name="${escapeHtml(cust.name)}" data-phone="${escapeHtml(cust.phone||'')}" data-points="${cust.loyalty_points}">
            <span class="customer-suggest-avatar">${escapeHtml(initial)}</span>
            <span class="customer-suggest-info"><span class="customer-suggest-name">${escapeHtml(cust.name)}</span>${cust.phone ? `<span class="customer-suggest-phone mono">${escapeHtml(cust.phone)}</span>` : ''}</span>
            ${pointsBadge}
          </button>`;
        }).join('');
        // no exact match found — surface adding this typed text as a new
        // customer as a real, visible row instead of a hidden Enter-key shortcut
        const isPhone = /^[0-9+\s-]{6,}$/.test(q);
        const newRow = `<button class="customer-suggest customer-suggest-new" id="pmAddNewCustomerRow">
          <span class="customer-suggest-avatar customer-suggest-avatar-new">+</span>
          <span class="customer-suggest-info"><span class="customer-suggest-name">إضافة عميل جديد</span><span class="customer-suggest-phone">${isPhone ? q : 'باسم "' + q + '"'}</span></span>
        </button>`;
        suggestEl.innerHTML = rows + newRow;
        const addBtn = document.getElementById('pmAddNewCustomerRow');
        if(addBtn) addBtn.addEventListener('click', ()=>{
          openModalStep(()=> renderNewCustomerStep(isPhone ? {name: null, phone: q} : {name: q, phone: null}));
        });
      }, 250);
    });
    input.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && e.target.value.trim()){
        const val = e.target.value.trim();
        const isPhone = /^[0-9+\s-]{6,}$/.test(val);
        openModalStep(()=> renderNewCustomerStep(isPhone ? {name: null, phone: val} : {name: val, phone: null}));
      }
    });
    suggestEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('.customer-suggest:not(.customer-suggest-new)');
      if(!btn) return;
      setCustomer({id: parseInt(btn.dataset.id,10), name: btn.dataset.name, phone: btn.dataset.phone || null, points: Number(btn.dataset.points)});
      proceedFromCustomerStep();
    });
    document.getElementById('pmScanCustomerCardBtn').addEventListener('click', async ()=>{
      const decoded = await scanCustomerCard();
      // false means the cashier cancelled (× / back) — the modal is already
      // closed in that case, so re-showing it here would undo their tap.
      if(decoded){
        paymentModal.classList.add('show');
        renderCustomerStep();
      }
    });
  }

  document.getElementById('pmCustomerNextBtn').addEventListener('click', proceedFromCustomerStep);
}

function proceedFromCustomerStep(){
  const {total} = cartTotals();
  document.getElementById('paymentModalTitle').textContent = 'الدفع';
  state.friendsSplitOpen = false; state.friendsSplitCount = null;
  if(state.orderChannel === 'delivery'){
    state.activePaymentMethod = 'delivery_platform';
  } else {
    state.activePaymentMethod = 'cash'; state.cashAmount = total;
  }
  openModalStep(renderPaymentStep);
}

/* ============ Loyalty points redemption — only possible for an existing
   customer selected from real suggestions (state.customer.id is set), since
   a brand-new customer typed at checkout has no real balance to redeem yet. ============ */
// Redemption now only starts from the OTP-gated "🎁 الولاء" payment pill
// inside the payment modal (renderLoyaltyRedeemStep) — this strip used to
// let a cashier open the redeem picker with one tap and no real cardholder
// consent. Kept as a no-op (not deleted) since setCustomer() still calls it.
function updatePointsRedeemStrip(){
  document.getElementById('pointsRedeemStrip').style.display = 'none';
}
function openPointsRedeemModal(){
  const redeemable = Object.entries(MENU_ITEM_META).filter(([,meta])=> meta.pointsRedeemPrice != null);
  document.getElementById('paymentModalTitle').textContent = 'استبدال منتج بالنقاط';
  paymentModalBody.innerHTML = redeemable.length === 0
    ? '<p class="pos-auth-sub">ما فيه منتجات قابلة للاستبدال بالنقاط حاليًا.</p>'
    : `<div class="pos-staff-list">` + redeemable.map(([id, meta])=>{
        const product = PRODUCTS.find(p=>p.id===Number(id));
        if(!product) return '';
        const affordable = state.customer.points >= meta.pointsRedeemPrice;
        return `<button class="pos-staff-btn" data-id="${id}" ${affordable?'':'disabled'} style="${affordable?'':'opacity:.4;'}">${product.name} — ${meta.pointsRedeemPrice} نقطة</button>`;
      }).join('') + `</div>`;
  document.getElementById('paymentModal').classList.add('show');
  paymentModalBody.querySelectorAll('.pos-staff-btn[data-id]:not([disabled])').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      addPointsRedemptionToCart(Number(btn.dataset.id));
      closePaymentModalNow();
    });
  });
}
function addPointsRedemptionToCart(productId){
  state.cart.push({lineId: lineIdCounter++, productId, qty:1, note:'', config:null, isPointsRedemption:true});
  renderOrder();
  showToast('تمت إضافة المنتج مقابل نقاط الولاء');
}

/* ============ Loyalty card barcode scan — reads the real QR code already
   printed on the digital loyalty card (see /loyalty-card/[token]) via the
   browser's native BarcodeDetector (Chrome/Edge/Android — no external
   scanning library). Decoded value is the card's full URL; the customer's
   public_token is the last path segment, looked up directly against the
   real customers table.

   Returns a real Promise that resolves only once scanning actually
   concludes — true if a code was decoded and processed, false if the
   cashier cancelled (× / back). This used to resolve as soon as the camera
   started (the async function body just kicked off a fire-and-forget
   requestAnimationFrame loop and returned), so callers' `await` woke up
   instantly instead of waiting for a real result — the scanner UI would
   render for a single frame and then immediately get overwritten by
   whatever the caller did next, making the camera view functionally
   unusable even though detection kept running invisibly underneath. */
async function openBarcodeScanner(onDecode){
  if(!('BarcodeDetector' in window)){
    showToast('جهازك ما يدعم قراءة الباركود من الكاميرا (متاحة على Chrome/Edge بأجهزة أندرويد بس حاليًا) — استخدم البحث بالاسم أو الجوال بدالها.');
    return false;
  }
  document.getElementById('paymentModalTitle').textContent = 'مسح بطاقة العميل';
  paymentModalBody.innerHTML = `
    <video id="scannerVideo" autoplay playsinline muted style="width:100%; border-radius:12px; background:#000;"></video>
    <p class="pos-auth-sub" style="text-align:center; margin-top:10px;">قرّب باركود البطاقة من الكاميرا</p>
  `;
  document.getElementById('paymentModal').classList.add('show');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    showToast('تعذر الوصول للكاميرا.');
    document.getElementById('paymentModal').classList.remove('show');
    return false;
  }
  const video = document.getElementById('scannerVideo');
  video.srcObject = stream;

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  let stopped = false;
  const stopScanning = ()=>{
    if(stopped) return;
    stopped = true;
    stream.getTracks().forEach(t=>t.stop());
  };

  return new Promise((resolve)=>{
    const cancel = ()=>{ stopScanning(); resolve(false); };
    document.getElementById('closePaymentModal').addEventListener('click', cancel, { once:true });
    document.getElementById('paymentModalBackBtn').addEventListener('click', cancel, { once:true });

    const tick = async ()=>{
      if(stopped) return;
      try {
        const codes = await detector.detect(video);
        if(codes.length > 0){
          stopScanning();
          await onDecode(codes[0].rawValue);
          resolve(true);
          return;
        }
      } catch (e) { /* a failed detection on a single frame is normal — keep scanning */ }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function scanCustomerCard(){
  return await openBarcodeScanner(async (decoded)=>{
    // the QR encodes the full card URL (…/loyalty-card/<token>), not the bare token
    const token = decoded.split('/').filter(Boolean).pop();
    const { data } = await window.supabaseClient.from('customers')
      .select('id, name, phone, loyalty_points').eq('business_id', DEVICE.businessId).eq('public_token', token).maybeSingle();
    if(!data){ showToast('ما فيه عميل مربوط بهذا الباركود.'); return; }
    setCustomer({id:data.id, name:data.name, phone:data.phone, points:Number(data.loyalty_points)});
    showToast('تم التعرف على ' + data.name);
  });
}

/* ============ Clear order — two-tap arm/confirm, no blocking dialog ============ */
let clearArmed = false, clearArmTimer;
document.getElementById('clearOrderBtn').addEventListener('click', function(){
  if(state.cart.length === 0) return;
  if(!clearArmed){
    clearArmed = true;
    this.classList.add('armed');
    this.textContent = 'اضغط مرة ثانية للتأكيد';
    clearArmTimer = setTimeout(()=>{ clearArmed=false; this.classList.remove('armed'); this.textContent='إفراغ الطلب'; }, 3000);
  } else {
    clearTimeout(clearArmTimer);
    clearArmed = false;
    this.classList.remove('armed');
    this.textContent = 'إفراغ الطلب';
    state.cart = []; state.discountPct = 0;
    renderOrder();
    showToast('تم إفراغ الطلب');
  }
});

/* ============ Hold order ============ */
document.getElementById('holdOrderBtn').addEventListener('click', ()=>{
  if(state.cart.length === 0) return;
  const {total} = cartTotals();
  state.heldOrders.push({id:Date.now(), cart:JSON.parse(JSON.stringify(state.cart)), total, time:new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})});
  state.cart = []; state.discountPct = 0;
  renderOrder();
  showToast('تم تعليق الطلب — تقدر تسترجعه من "الطلبات"');
});

/* ============ Payment modal ============ */
const paymentModal = document.getElementById('paymentModal');
const paymentModalBody = document.getElementById('paymentModalBody');

/* ============ Modal step stack — powers the back button ============
   paymentModal is one generic shell reused for many different flows
   (channel -> customer -> payment during checkout, barcode scanner, points
   redeem, order detail, settings, shift summary/closing...). Genuine
   forward-navigation calls go through openModalStep()/resetModalStack() so
   the back button can pop to whatever rendered before; in-place refreshes
   within a single step (tab switches, input changes) keep calling their
   render function directly and never touch this stack. For a single-view
   modal (nothing pushed before it) the back button just closes, same as ×. */
let modalStepStack = [];
function resetModalStack(fn){ modalStepStack = [fn]; fn(); }
function openModalStep(fn){ modalStepStack.push(fn); fn(); }
function closePaymentModalNow(){
  paymentModal.classList.remove('show');
  modalStepStack = [];
  if(activeAutoResetTimer) clearInterval(activeAutoResetTimer);
  if(loyaltyPollTimer) clearInterval(loyaltyPollTimer);
}
function modalGoBack(){
  if(modalStepStack.length > 1){
    modalStepStack.pop();
    modalStepStack[modalStepStack.length - 1]();
  } else {
    closePaymentModalNow();
  }
}
document.getElementById('paymentModalBackBtn').addEventListener('click', modalGoBack);

document.getElementById('payBtn').addEventListener('click', ()=>{
  if(state.cart.length === 0) return;
  // Pay-after-eating dine-in: this cart is a real kitchen order the moment
  // it's confirmed, but the bill isn't being closed out right now — register
  // it and stay on Home, don't open the payment popup at all.
  if(state.selectedTableId && state.orderChannel === 'dine_in' && DINE_IN_PAY_TIMING === 'after'){
    submitTableOrderRegistration();
    return;
  }
  resetModalStack(renderChannelStep);
  paymentModal.classList.add('show');
});

async function submitTableOrderRegistration(){
  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;
  const table = TABLES_CACHE.find(t => t.id === state.selectedTableId);
  const isAppend = !!state.selectedOrderId;
  try {
    const orderId = await registerTableOrder();
    if(DEVICE.printKitchenTicket === true){
      sendKitchenTicketToPrinter(buildKitchenReceiptData({channel:'dine_in', orderId, tableNumber: table ? table.number : null}));
    }
    showToast((isAppend ? 'تمت إضافة الأصناف للطلب' : 'تم تسجيل الطلب') + (table ? ' — طاولة ' + table.number : ''));
    state.cart = []; state.customer = null; state.discountPct = 0;
    document.getElementById('discountToggle').textContent = '+ خصم';
    state.selectedTableId = null;
    state.selectedOrderId = null;
    updatePointsRedeemStrip();
    renderOrder();
    document.querySelector('.nav-tab[data-screen="tables"]').click();
  } catch(err){
    showToast('تعذر تسجيل الطلب — تحقق من الاتصال');
    payBtn.disabled = false;
  }
}
document.getElementById('closePaymentModal').addEventListener('click', closePaymentModalNow);
paymentModal.addEventListener('click', (e)=>{ if(e.target===paymentModal) closePaymentModalNow(); });

/* ============ Step 1: order type — moved out of the order panel entirely,
   now the first thing the cashier sees after tapping "دفع" rather than a
   toggle sitting quietly at the top of the cart the whole time it's built.
   Channel/platform selection logic itself (state.orderChannel/deliveryPlatformId,
   live price recompute via renderProductGrid/renderOrder) is unchanged —
   only when and where the choice is made moved. ============ */
function renderChannelStep(){
  document.getElementById('paymentModalTitle').textContent = 'نوع الطلب';
  const channels = [
    {id:'dine_in', label:'🍽️ بالمطعم'},
    {id:'pickup', label:'📦 استلام'},
    {id:'delivery', label:'🛵 توصيل'}
  ].filter(c => c.id !== 'dine_in' || DINE_IN_ENABLED);
  let html = `<div class="channel-row" id="pmChannelRow">` + channels.map(c=>
    `<button class="channel-btn ${state.orderChannel===c.id?'active':''}" data-channel="${c.id}">${c.label}</button>`
  ).join('') + `</div>`;
  html += `<div class="platform-btn-row ${state.orderChannel==='delivery' && DELIVERY_PLATFORMS_LIST.length ? '' : 'hidden'}" id="channelPlatformRow"></div>`;
  html += `<button class="confirm-pay-btn" id="channelNextBtn" style="margin-top:18px;">التالي</button>`;
  paymentModalBody.innerHTML = html;
  renderPlatformButtons();

  document.getElementById('pmChannelRow').addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#pmChannelRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.orderChannel = btn.dataset.channel;
    const platformRow = document.getElementById('channelPlatformRow');
    if(state.orderChannel === 'delivery'){
      if(DELIVERY_PLATFORMS_LIST.length){
        platformRow.classList.remove('hidden');
        if(!state.deliveryPlatformId) state.deliveryPlatformId = DELIVERY_PLATFORMS_LIST[0].id;
        renderPlatformButtons();
      }
    } else {
      platformRow.classList.add('hidden');
      state.platformInvoiceLast4 = '';
    }
    renderProductGrid();
    renderOrder();
  });
  document.getElementById('channelNextBtn').addEventListener('click', ()=>{
    // Most dine-in orders already carry a table by this point (started by
    // tapping a table on the Tables screen) — this step only appears for
    // the remaining case: cashier built the cart straight from Home, then
    // picked "بالمطعم" here for the first time.
    if(state.orderChannel === 'dine_in' && !state.selectedTableId) openModalStep(renderTablePickerStep);
    else openModalStep(renderCustomerStep);
  });
}

function renderTablePickerStep(){
  document.getElementById('paymentModalTitle').textContent = 'اختر الطاولة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('restaurant_tables').select('*')
    .eq('branch_id', DEVICE.branchId).eq('status', 'available').order('number')
    .then(({data}) => {
      const tables = data || [];
      TABLES_CACHE = tables.length ? tables : TABLES_CACHE;
      if(!tables.length){
        paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه طاولات متاحة الحين.</p>
          <button class="confirm-pay-btn" id="tablePickerSkipBtn">متابعة بدون طاولة</button>`;
        document.getElementById('tablePickerSkipBtn').addEventListener('click', ()=> openModalStep(renderCustomerStep));
        return;
      }
      const groups = groupTablesForDisplay(tables);
      let html = `<div class="table-picker-grid" id="tablePickerGrid">`;
      groups.forEach(g => {
        if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}</span></div>`;
        html += g.tables.map(t => `<button type="button" class="table-picker-btn" data-id="${t.id}" data-number="${t.number}">${t.number}</button>`).join('');
      });
      html += `</div><button class="loyalty-otp-back" id="tablePickerSkipBtn">متابعة بدون طاولة</button>`;
      paymentModalBody.innerHTML = html;
      document.getElementById('tablePickerSkipBtn').addEventListener('click', ()=> openModalStep(renderCustomerStep));
      document.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async ()=>{
          const tableId = Number(btn.dataset.id);
          const { data: claimed, error } = await window.supabaseClient.from('restaurant_tables')
            .update({status: 'awaiting_order'}).eq('id', tableId).eq('status', 'available').select('id');
          if(error || !claimed || !claimed.length){ showToast('طاولة ' + btn.dataset.number + ' انشغلت للتو'); renderTablePickerStep(); return; }
          state.selectedTableId = tableId;
          updateTableBadge();
          openModalStep(renderCustomerStep);
        });
      });
    });
}

function renderPaymentStep(){
  const {total} = cartTotals();

  // delivery orders are already paid by the customer inside the platform's
  // own app — no cash/card tabs, just a confirmation before we log the order
  if(state.orderChannel === 'delivery'){
    const last4Valid = /^\d{4}$/.test(state.platformInvoiceLast4);
    let html = `<div class="due-display"><div class="due-label">إجمالي الطلب — مدفوع مسبقًا عبر التطبيق</div><div class="due-amount mono">${total.toFixed(2)}</div></div>`;
    html += `<div class="pos-auth-field" style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">آخر ٤ أرقام من فاتورة تطبيق التوصيل</label>
      <input type="text" id="deliveryInvoiceLast4Input" maxlength="4" inputmode="numeric" placeholder="٠٠٠٠" value="${state.platformInvoiceLast4}" style="width:100%; text-align:center; font-family:'IBM Plex Mono',monospace; font-weight:800; font-size:16px;">
    </div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn" ${last4Valid?'':'disabled'}>تأكيد الطلب</button>`;
    paymentModalBody.innerHTML = html;
    document.getElementById('confirmPayBtn').addEventListener('click', completePayment);
    document.getElementById('deliveryInvoiceLast4Input').addEventListener('input', (e)=>{
      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = digits;
      state.platformInvoiceLast4 = digits;
      document.getElementById('confirmPayBtn').disabled = !/^\d{4}$/.test(digits);
    });
    return;
  }

  const methods = [
    {id:'cash', label:'كاش', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>'},
    {id:'card', label:'بطاقة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'},
    {id:'split', label:'تقسيم', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'}
  ];
  // only surfaced once a real, existing customer with a redeemable balance is
  // attached — same gate updatePointsRedeemStrip() used to check
  if(state.customer && state.customer.id && state.customer.points > 0){
    methods.push({id:'loyalty', label:'الولاء', icon:'🎁'});
  }
  let html = `<div class="pm-tabs">` + methods.map(m=>`<button class="pm-tab ${state.activePaymentMethod===m.id?'active':''}" data-method="${m.id}">${m.icon}<span>${m.label}</span></button>`).join('') + `</div>`;
  html += `<div class="due-display"><div class="due-label">المبلغ المطلوب</div><div class="due-amount mono">${total.toFixed(2)}</div></div>`;
  // Purely informational per-person calculator — doesn't touch payment_method
  // or any order data, just tells the cashier how much to collect from each
  // friend. Collapsed by default so it never gets in the way of a normal
  // single-payer checkout; only shows once tapped.
  if(state.activePaymentMethod !== 'loyalty'){
    html += `<div class="friends-split">
      <button type="button" class="friends-split-toggle" id="friendsSplitToggle">÷ قسّم بين الأصحاب</button>
      ${state.friendsSplitOpen ? `<div class="friends-split-body">
        <div class="friends-split-counts">
          ${[2,3,4,5,6].map(n=>`<button type="button" class="fsc-btn ${state.friendsSplitCount===n?'active':''}" data-n="${n}">${n}</button>`).join('')}
        </div>
        ${state.friendsSplitCount ? `<div class="friends-split-result"><span>كل واحد يدفع</span><span class="mono">${(total/state.friendsSplitCount).toFixed(2)} ر.س</span></div>` : ''}
      </div>` : ''}
    </div>`;
  }

  if(state.activePaymentMethod === 'cash'){
    const opts = [...new Set([total, Math.ceil(total/10)*10, Math.ceil(total/50)*50, Math.ceil(total/100)*100].map(n=>n.toFixed(2)))].slice(0,4);
    html += `<div class="quick-amounts">` + opts.map(v=>`<button class="qa-btn" data-amount="${v}">${v}</button>`).join('') + `</div>`;
    html += `<div class="cash-input-row"><input type="number" id="cashInput" placeholder="0.00" value="${state.cashAmount||''}"></div>`;
    const change = Math.max(0, (state.cashAmount||0)-total);
    html += `<div class="change-row"><span>الباقي</span><span class="mono" id="cashChangeAmount">${change.toFixed(2)} ر.س</span></div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn" ${(state.cashAmount||0)>=total?'':'disabled'}>تأكيد الدفع</button>`;
  } else if(state.activePaymentMethod === 'split'){
    // Two linked inputs, either direction — the cashier types whichever
    // amount they were actually handed first (cash or network), and the
    // other side auto-fills the remainder. state.splitCardAmount stays the
    // single source of truth; the cash field is always just total-card.
    const cardAmt = Math.min(total, state.splitCardAmount || 0);
    const cashAmt = Math.max(0, Number((total - cardAmt).toFixed(2)));
    const validSplit = cardAmt > 0 && cashAmt > 0;
    html += `<div class="split-inputs">
      <label>المبلغ كاش</label>
      <input type="number" id="splitCashInput" placeholder="0.00" value="${cashAmt||''}">
      <label>المبلغ عبر الشبكة (بطاقة)</label>
      <input type="number" id="splitCardInput" placeholder="0.00" value="${cardAmt||''}">
    </div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn" ${validSplit?'':'disabled'}>تأكيد الدفع المقسّم</button>`;
  } else if(state.activePaymentMethod === 'loyalty'){
    renderLoyaltyWaitStep();
    return;
  } else {
    html += `<div class="card-tap-state">
      <div class="card-tap-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>
      <p>مرّر أو قرّب البطاقة على الجهاز</p>
    </div>`;
    html += `<button class="confirm-pay-btn" id="confirmPayBtn">تأكيد الدفع</button>`;
  }
  paymentModalBody.innerHTML = html;
  paymentModalBody.querySelectorAll('.pm-tab').forEach(tab=>tab.addEventListener('click', ()=>{
    state.activePaymentMethod = tab.dataset.method; state.cashAmount=0; state.splitCardAmount=0; renderPaymentStep();
  }));
  paymentModalBody.querySelectorAll('.qa-btn[data-amount]').forEach(btn=>btn.addEventListener('click', ()=>{ state.cashAmount = parseFloat(btn.dataset.amount); renderPaymentStep(); }));
  // Cash/split inputs update state + the small bits of surrounding UI (change
  // amount, sibling input, confirm-button enabled state) DIRECTLY rather than
  // re-rendering the whole step on every keystroke — a full innerHTML rebuild
  // mid-edit destroys and recreates the input, which made it effectively
  // impossible to backspace a typed value down to empty (focus/cursor state
  // is lost every keystroke).
  const cashInput = document.getElementById('cashInput');
  if(cashInput) cashInput.addEventListener('input', (e)=>{
    state.cashAmount = parseFloat(e.target.value)||0;
    const changeEl = document.getElementById('cashChangeAmount');
    if(changeEl) changeEl.textContent = Math.max(0, state.cashAmount - total).toFixed(2) + ' ر.س';
    const btn = document.getElementById('confirmPayBtn');
    if(btn) btn.disabled = !(state.cashAmount >= total);
  });
  const splitCardInput = document.getElementById('splitCardInput');
  const splitCashInput = document.getElementById('splitCashInput');
  function syncSplitConfirmBtn(cardAmt, cashAmt){
    const btn = document.getElementById('confirmPayBtn');
    if(btn) btn.disabled = !(cardAmt > 0 && cashAmt > 0);
  }
  if(splitCardInput) splitCardInput.addEventListener('input', (e)=>{
    const v = Math.max(0, Math.min(total, parseFloat(e.target.value)||0));
    state.splitCardAmount = v;
    const cashAmt = Math.max(0, Number((total - v).toFixed(2)));
    if(splitCashInput) splitCashInput.value = cashAmt || '';
    syncSplitConfirmBtn(v, cashAmt);
  });
  if(splitCashInput) splitCashInput.addEventListener('input', (e)=>{
    const v = Math.max(0, Math.min(total, parseFloat(e.target.value)||0));
    const cardAmt = Math.max(0, Number((total - v).toFixed(2)));
    state.splitCardAmount = cardAmt;
    if(splitCardInput) splitCardInput.value = cardAmt || '';
    syncSplitConfirmBtn(cardAmt, v);
  });
  const confirmBtn = document.getElementById('confirmPayBtn');
  if(confirmBtn) confirmBtn.addEventListener('click', completePayment);
  const friendsSplitToggle = document.getElementById('friendsSplitToggle');
  if(friendsSplitToggle) friendsSplitToggle.addEventListener('click', ()=>{
    state.friendsSplitOpen = !state.friendsSplitOpen;
    renderPaymentStep();
  });
  paymentModalBody.querySelectorAll('.fsc-btn[data-n]').forEach(btn=>btn.addEventListener('click', ()=>{
    const n = parseInt(btn.dataset.n, 10);
    state.friendsSplitCount = state.friendsSplitCount === n ? null : n;
    renderPaymentStep();
  }));
}

/* ============ Loyalty redemption gate — tapping "🎁 الولاء" creates a pending
   request the customer confirms THEMSELVES on their own loyalty-card page
   (real-time poll there — app/loyalty-card/[token]/CardActions.tsx). No code
   to read aloud, no push dependency (push is just a best-effort nudge sent
   server-side). The security boundary is device possession: only whoever has
   that card page open can act on the request at all. */
function resetToCashFallback(){
  state.activePaymentMethod = 'cash';
  state.cashAmount = cartTotals().total;
  renderPaymentStep();
}
async function renderLoyaltyWaitStep(){
  document.getElementById('paymentModalTitle').textContent = 'الدفع بنقاط الولاء';
  paymentModalBody.innerHTML = `
    <div class="loyalty-wait-step">
      <div class="loyalty-wait-spinner"></div>
      <div class="loyalty-wait-text">بانتظار تأكيد ${state.customer.name || 'العميل'}...</div>
      <div class="loyalty-wait-sub">اطلب منه يفتح بطاقة الولاء ويضغط تأكيد</div>
      <div class="loyalty-wait-timer" id="loyaltyWaitTimer"></div>
      <button type="button" class="loyalty-otp-back" id="loyaltyCancelBtn">إلغاء</button>
    </div>`;
  document.getElementById('loyaltyCancelBtn').addEventListener('click', ()=>{
    if(loyaltyPollTimer) clearInterval(loyaltyPollTimer);
    resetToCashFallback();
  });

  let requestId;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const resp = await fetch('/api/pos/request-loyalty-redemption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ customerId: state.customer.id })
    });
    const data = await resp.json();
    if(!resp.ok){
      showToast(data.error || 'تعذر بدء عملية الاستبدال');
      resetToCashFallback();
      return;
    }
    requestId = data.requestId;
  } catch (e) {
    showToast('تعذر الاتصال بالخادم');
    resetToCashFallback();
    return;
  }

  const expiresAt = Date.now() + 2 * 60 * 1000;
  const updateTimer = ()=>{
    const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const el = document.getElementById('loyaltyWaitTimer');
    if(el) el.textContent = left + ' ثانية متبقية';
    return left;
  };
  updateTimer();
  const displayTimer = setInterval(()=>{ if(updateTimer() <= 0) clearInterval(displayTimer); }, 1000);

  if(loyaltyPollTimer) clearInterval(loyaltyPollTimer);
  loyaltyPollTimer = setInterval(async ()=>{
    if(Date.now() > expiresAt){
      clearInterval(loyaltyPollTimer); clearInterval(displayTimer);
      showToast('انتهت مهلة التأكيد — حاول مرة ثانية');
      resetToCashFallback();
      return;
    }
    const { data } = await window.supabaseClient
      .from('loyalty_redemption_requests').select('status').eq('id', requestId).single();
    if(!data || data.status === 'pending') return;
    clearInterval(loyaltyPollTimer); clearInterval(displayTimer);
    if(data.status === 'confirmed'){
      openModalStep(openPointsRedeemModal);
    } else {
      showToast('العميل رفض عملية الاستبدال');
      resetToCashFallback();
    }
  }, 2000);
}

/* ============ IndexedDB offline order queue ============
   completePayment() always writes here first, then tries an immediate
   server call if online. client_order_uuid is the idempotency key: replaying
   an order that already made it to the server (e.g. the sync response was
   lost but the insert succeeded) is a safe no-op — complete_pos_order()
   just returns the existing order id instead of inserting a duplicate. */
const POS_DB_NAME = 'rakeen_pos', POS_DB_VERSION = 1, POS_STORE = 'pending_orders';
function openPosDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(POS_DB_NAME, POS_DB_VERSION);
    req.onupgradeneeded = ()=>{
      if(!req.result.objectStoreNames.contains(POS_STORE)) req.result.createObjectStore(POS_STORE, {keyPath:'client_order_uuid'});
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function queueOrder(payload){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(POS_STORE, 'readwrite');
    tx.objectStore(POS_STORE).put(payload);
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}
async function removeQueuedOrder(uuid){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(POS_STORE, 'readwrite');
    tx.objectStore(POS_STORE).delete(uuid);
    tx.oncomplete = resolve; tx.onerror = ()=> reject(tx.error);
  });
}
async function getQueuedOrders(){
  const db = await openPosDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(POS_STORE, 'readonly');
    const req = tx.objectStore(POS_STORE).getAll();
    req.onsuccess = ()=> resolve(req.result||[]);
    req.onerror = ()=> reject(req.error);
  });
}
async function sendOrderToServer(payload){
  const { data, error } = await window.supabaseClient.rpc('complete_pos_order', {
    p_client_order_uuid: payload.client_order_uuid, p_branch_id: payload.branch_id, p_shift_id: payload.shift_id,
    p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone,
    p_subtotal: payload.subtotal, p_discount_pct: payload.discount_pct, p_discount_amount: payload.discount_amount,
    p_vat_amount: payload.vat_amount, p_total: payload.total,
    p_payment_method: payload.payment_method, p_cash_amount: payload.cash_amount, p_items: payload.items,
    p_channel: payload.channel, p_delivery_platform_id: payload.delivery_platform_id,
    p_table_id: payload.table_id, p_staff_member_id: payload.staff_member_id,
    p_platform_invoice_last4: payload.platform_invoice_last4
  });
  if(error) throw error;
  return data;
}
let syncing = false;
async function syncQueue(){
  if(!navigator.onLine || syncing) return;
  syncing = true;
  try {
    const queued = await getQueuedOrders();
    for(const payload of queued){
      try {
        const orderId = await sendOrderToServer(payload);
        await removeQueuedOrder(payload.client_order_uuid);
        if(payload.channel === 'delivery' && orderId) registerActiveDeliveryOrder(orderId, payload);
      } catch (e) {
        break; // stop on first failure this pass (likely still offline/RLS issue) — retry next pass instead of hammering
      }
    }
  } catch (e) { /* IndexedDB unavailable — nothing to sync */ }
  syncing = false;
}
window.addEventListener('online', syncQueue);
setInterval(syncQueue, 30000);

/* Recipe-line and box-pick stock decrements are resolved SERVER-SIDE now
   (resolve_menu_item_recipe_decrements / resolve_box_selection_decrements in
   complete_pos_order/register_dine_in_order) from the menu item's own stored
   recipe — the cashier session never needs to read ingredient names,
   quantities, or unit costs to ring up a sale. This function now only
   computes stock-linked MODIFIER extras (e.g. "extra cheese") — a smaller,
   already customer-facing surface left client-side for now. See the
   server-side migration's header comment for the full reasoning. */
function computeLineStockDecrements(item){
  const meta = MENU_ITEM_META[item.productId];
  const decrements = [];
  if(!meta || meta.componentSlot || !item.config) return decrements;
  const modDef = MODIFIER_PRODUCTS[item.productId];
  if(modDef && modDef.groups){
    modDef.groups.forEach(g=>{
      const sel = item.config[g.id];
      const arr = Array.isArray(sel) ? sel : [sel];
      arr.forEach(optId=>{
        const link = MODIFIER_OPTION_STOCK[g.id+'_'+optId];
        if(link){
          const qtyInStockUnit = convertToUnit(link.qty, link.unit, STOCK_UNIT_BY_ID[link.stockItemId] || link.unit);
          decrements.push({stock_item_id: link.stockItemId, qty: qtyInStockUnit * item.qty});
        }
      });
    });
  }
  return decrements;
}

// The customer's actual box picks this order — just which eligible-item ROW
// the customer chose and how many pieces (both already shown to the
// customer at checkout, not secret). The server looks up what each pick
// actually decrements from its own recipe data; this never sends a
// stock_item_id, unit cost, or ingredient name.
function computeLineBoxSelections(item){
  const meta = MENU_ITEM_META[item.productId];
  if(!meta || !meta.componentSlot || !item.config || !item.config.selections) return [];
  return Object.entries(item.config.selections)
    .filter(([,pieceQty])=>pieceQty > 0)
    .map(([eligibleId, pieceQty])=>({eligible_item_id: parseInt(eligibleId,10), qty: pieceQty}));
}

function buildOrderPayload(totals){
  const clientOrderUuid = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2)));
  const items = state.cart.map(item=>({
    // Roadmap item 4: per-line, not per-cart — a mixed cart (service +
    // retail product) is now possible, so this can't just check the whole
    // business's type anymore. A service's virtual PRODUCTS id is always
    // negative (see loadPosData); real menu_items ids are always positive.
    menu_item_id: item.productId < 0 ? null : item.productId,
    service_id: item.productId < 0 ? -item.productId : null,
    qty: item.qty,
    unit_price: lineUnitPrice(item),
    modifiers_total: 0,
    line_total: lineUnitPrice(item) * item.qty,
    note: item.note || null,
    selected_modifiers: formatConfigLabels(item.productId, item.config).map(l=>({text:l.text})),
    stock_decrements: computeLineStockDecrements(item),
    box_selections: computeLineBoxSelections(item),
    is_points_redemption: !!item.isPointsRedemption,
    points_cost: item.isPointsRedemption ? (MENU_ITEM_META[item.productId].pointsRedeemPrice || 0) : 0
  }));
  return {
    client_order_uuid: clientOrderUuid,
    branch_id: DEVICE.branchId,
    shift_id: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    staff_member_id: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.id : null,
    customer_name: state.customer ? state.customer.name : null,
    customer_phone: state.customer ? state.customer.phone : null,
    subtotal: totals.subtotal, discount_pct: state.discountPct, discount_amount: totals.discount,
    vat_amount: totals.vat, total: totals.total,
    payment_method: state.activePaymentMethod,
    // split's cash half is whatever's left after the cashier-entered card
    // amount — persisting it here is what lets the shift close/cash
    // breakdown correctly count it as real cash in the drawer, instead of
    // the whole split total silently going uncounted as cash.
    cash_amount: state.activePaymentMethod === 'cash' ? (state.cashAmount||0)
      : state.activePaymentMethod === 'split' ? Math.max(0, Number((totals.total - (state.splitCardAmount||0)).toFixed(2)))
      : null,
    channel: state.orderChannel || 'dine_in',
    delivery_platform_id: state.orderChannel === 'delivery' ? (state.deliveryPlatformId || null) : null,
    platform_invoice_last4: state.orderChannel === 'delivery' ? (state.platformInvoiceLast4 || null) : null,
    table_id: state.orderChannel === 'dine_in' ? (state.selectedTableId || null) : null,
    items
  };
}

// Builds the items[] + subtotal from state.cart and either creates a new
// dine-in order for state.selectedTableId, or — when state.selectedOrderId
// is set (the table already has a still-open, unpaid order, e.g. a "إضافة
// أصناف" round) — appends to it instead. Used by both the pay-after
// register-only CTA and the pay-before register-then-pay flow below, so a
// table's order math is computed in exactly one place regardless of timing.
async function registerTableOrder(){
  const items = state.cart.map(item=>({
    // Roadmap item 4: per-line, not per-cart — a mixed cart (service +
    // retail product) is now possible, so this can't just check the whole
    // business's type anymore. A service's virtual PRODUCTS id is always
    // negative (see loadPosData); real menu_items ids are always positive.
    menu_item_id: item.productId < 0 ? null : item.productId,
    service_id: item.productId < 0 ? -item.productId : null,
    qty: item.qty, unit_price: lineUnitPrice(item),
    modifiers_total: 0, line_total: lineUnitPrice(item) * item.qty, note: item.note || null,
    selected_modifiers: formatConfigLabels(item.productId, item.config).map(l=>({text:l.text})),
    stock_decrements: computeLineStockDecrements(item),
    box_selections: computeLineBoxSelections(item)
  }));
  const {subtotal} = cartTotals();
  const clientOrderUuid = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2)));
  const { data: orderId, error } = await window.supabaseClient.rpc('register_dine_in_order', {
    p_client_order_uuid: clientOrderUuid,
    p_branch_id: DEVICE.branchId,
    p_shift_id: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    p_customer_name: state.customer ? state.customer.name : null,
    p_customer_phone: state.customer ? state.customer.phone : null,
    p_subtotal: subtotal,
    p_discount_pct: state.discountPct,
    p_items: items,
    p_table_id: state.selectedTableId,
    p_staff_member_id: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.id : null,
    p_existing_order_id: state.selectedOrderId || null
  });
  if(error) throw error;
  return orderId;
}

async function submitOrder(totals){
  if(state.resumingOrder){
    // Flow D: closing out an already-registered, already-kitchen-printed
    // tab — no items to send, just the payment method against the order's
    // stored total. Deliberately not routed through the offline IndexedDB
    // queue (see the note on the table-attached branch below) — both
    // table-order paths are online-only for now.
    const payload = {
      channel: 'dine_in', table_id: state.resumingOrder.table_id,
      payment_method: state.activePaymentMethod,
      cash_amount: state.activePaymentMethod === 'cash' ? (state.cashAmount||0)
        : state.activePaymentMethod === 'split' ? Math.max(0, Number((totals.total - (state.splitCardAmount||0)).toFixed(2)))
        : null,
      customer_name: state.customer ? state.customer.name : null,
      customer_phone: state.customer ? state.customer.phone : null,
      orderId: null
    };
    try {
      const { error } = await window.supabaseClient.rpc('pay_dine_in_order', {
        p_order_id: state.resumingOrder.id, p_payment_method: payload.payment_method, p_cash_amount: payload.cash_amount,
        p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone
      });
      if(error) throw error;
      payload.orderId = state.resumingOrder.id;
    } catch(e){
      showToast('تعذر إتمام الدفع — تحقق من الاتصال');
    }
    return payload;
  }

  const payload = buildOrderPayload(totals);

  if(payload.channel === 'dine_in' && payload.table_id){
    // Flow A: pay-before-eating with a table — register the order (kitchen
    // gets it, stock decrements) and immediately pay it in the same tap, so
    // the table's status ladder (serving -> awaiting_payment -> cleaning)
    // stays accurate even though the business collects payment right away.
    // Deliberately NOT queued through the offline IndexedDB path like the
    // block below — that queue's retry model is built around one
    // self-contained payload per sale; safely extending it to a two-call
    // register+pay sequence is separate work. A network drop here surfaces
    // as a clear error to retry rather than a silent queue.
    try {
      const orderId = await registerTableOrder();
      const { error } = await window.supabaseClient.rpc('pay_dine_in_order', {
        p_order_id: orderId, p_payment_method: payload.payment_method, p_cash_amount: payload.cash_amount,
        p_customer_name: payload.customer_name, p_customer_phone: payload.customer_phone
      });
      if(error) throw error;
      payload.orderId = orderId;
    } catch(e){
      payload.orderId = null;
      showToast('تعذر إتمام الطلب — تحقق من الاتصال');
    }
    return payload;
  }

  try { await queueOrder(payload); } catch (e) { /* IndexedDB unavailable — still attempt a direct send below */ }
  let orderId = null;
  if(navigator.onLine){
    try {
      orderId = await sendOrderToServer(payload);
      await removeQueuedOrder(payload.client_order_uuid);
    } catch (e) {
      // insert failed (network blip, RLS, etc) — stays queued, syncQueue() retries it
    }
  }
  payload.orderId = orderId;
  return payload;
}

/* ============ Owner notifications — real, free Web Push to whoever (owner/
   manager) enabled it on their own device from Settings → الإشعارات. Whether
   each type actually fires is the server's call (/api/send-owner-push checks
   the business's saved preference); this file only decides WHEN to ask —
   after a new order, after a refund, and after checking whether this order's
   stock/sales-total crossed a configured threshold. */
const UNIT_LABELS_POS = {kg:'كجم', g:'غرام', liter:'لتر', piece:'حبة'};

async function sendOwnerPush(type, title, body){
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if(!session) return;
    await fetch('/api/send-owner-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ type, title, body })
    });
  } catch (e) { /* owner alert is a nice-to-have — never block the real action */ }
}

// fires only the instant a decremented item crosses BELOW the configured
// threshold this order — not on every later order while it stays low,
// which would just spam the owner with the same fact repeatedly.
//
// Known narrowed scope since recipe/box decrements moved server-side (see
// the migration adding resolve_menu_item_recipe_decrements): this only sees
// stock touched via payload.items[].stock_decrements, which is now just
// stock-linked MODIFIER extras — a plain recipe or box-pick sale no longer
// tells the client which stock_item_ids it affected, on purpose (the whole
// point was the cashier session no longer reading recipe data at all). A
// recipe/box item running low won't push-alert until something else (a
// modifier sale, or the Inventory screen itself) surfaces it. Fully closing
// that gap means having the checkout RPC report back which stock rows it
// touched — a reasonable follow-up, not folded into this change.
async function checkLowStockAfterOrder(payload, thresholdPct){
  const decrementByItem = {};
  payload.items.forEach(it=>{
    (it.stock_decrements||[]).forEach(d=>{
      decrementByItem[d.stock_item_id] = (decrementByItem[d.stock_item_id]||0) + d.qty;
    });
  });
  const stockItemIds = Object.keys(decrementByItem).map(Number);
  if(stockItemIds.length === 0) return;
  const { data: stockRows } = await window.supabaseClient.from('stock_items')
    .select('id, name, qty_on_hand, par_level, unit').in('id', stockItemIds);
  (stockRows||[]).forEach(row=>{
    if(!(row.par_level > 0)) return;
    const decremented = decrementByItem[row.id] || 0;
    const after = Number(row.qty_on_hand);
    const before = after + decremented;
    const afterPct = (after / row.par_level) * 100;
    const beforePct = (before / row.par_level) * 100;
    if(afterPct <= thresholdPct && beforePct > thresholdPct){
      sendOwnerPush('low_stock', 'مخزون منخفض',
        `مخزون ${row.name} نزل عن ${thresholdPct}٪ — باقي ${Math.max(0,after)} ${UNIT_LABELS_POS[row.unit]||row.unit}.`);
    }
  });
}

// once-per-day (per device) so hitting the target doesn't re-notify on every
// order for the rest of the day
async function checkSalesTargetAfterOrder(targetAmount){
  const todayKey = 'rakeen_sales_target_notified_' + new Date().toISOString().slice(0,10);
  if(localStorage.getItem(todayKey) === '1') return;
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const { data: orders } = await window.supabaseClient.from('orders').select('total')
    .eq('business_id', DEVICE.businessId).gte('created_at', startToday.toISOString());
  const total = (orders||[]).reduce((s,o)=>s+Number(o.total),0);
  if(total >= targetAmount){
    localStorage.setItem(todayKey, '1');
    sendOwnerPush('sales_target', 'وصلت هدف المبيعات! 🎉', `مبيعات اليوم وصلت ${total.toFixed(2)} ر.س.`);
  }
}

async function runOwnerNotificationChecks(payload){
  try {
    const { data: business } = await window.supabaseClient.from('businesses')
      .select('notify_new_order, notify_low_stock, notify_low_stock_pct, notify_sales_target, notify_sales_target_amount')
      .eq('id', DEVICE.businessId).single();
    if(!business) return;
    if(business.notify_new_order){
      sendOwnerPush('new_order', 'طلب جديد', `طلب جديد بقيمة ${Number(payload.total).toFixed(2)} ر.س.`);
    }
    if(business.notify_low_stock){
      checkLowStockAfterOrder(payload, Number(business.notify_low_stock_pct) || 20);
    }
    if(business.notify_sales_target && Number(business.notify_sales_target_amount) > 0){
      checkSalesTargetAfterOrder(Number(business.notify_sales_target_amount));
    }
  } catch(err){ console.error('owner notification checks failed', err); }
}

/* ============ Receipt printing — real ESC/POS via the Android wrapper app's
   PrintBridge (window.AndroidPrint), reachable only when this page runs
   inside that thin native shell (not a plain browser tab — browsers can't
   open a raw socket to a LAN printer, and our Cloudflare-hosted backend has
   no route to the restaurant's local network either). The receipt renders
   as a rasterized image rather than raw ESC/POS text bytes — this sidesteps
   Arabic code-page/shaping support, which varies wildly between cheap
   thermal printers; the browser's own text engine already shapes Arabic
   correctly, so only pixels get sent, and it works regardless of printer
   brand. When no bridge/printer is configured (plain browser, e.g. testing
   on a desktop or an unwrapped phone), falls back to the original simulated
   "تمت الطباعة" flow — unchanged from before this feature existed. */
function printerBridgeAvailable(){
  return !!(window.AndroidPrint && typeof window.AndroidPrint.isAvailable === 'function' && window.AndroidPrint.isAvailable());
}

// this pill used to be static markup that always claimed "الطابعة جاهزة"
// regardless of whether a printer bridge or IP was actually configured —
// now reflects the real state.
function updatePrinterStatusPill(){
  const pill = document.getElementById('printerStatus');
  if(!pill) return;
  const icon = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  const ready = printerBridgeAvailable() && !!DEVICE.printerIp;
  pill.classList.toggle('online', ready);
  pill.innerHTML = icon + (ready ? 'الطابعة جاهزة' : printerBridgeAvailable() ? 'الطابعة غير معدّة' : 'بدون طابعة شبكة');
}

function renderReceiptCanvas(receipt, qrImage, logoImage){
  const width = DEVICE.printerPaperWidth || 576; // 80mm≈576px, 58mm≈384px at ~203dpi
  const pad = 16, lineH = 32;
  const qrSize = Math.min(220, width - pad * 2);
  const logoSize = logoImage ? Math.min(90, Math.round(width * 0.18)) : 0;
  const maxHeight = 2400 + receipt.items.length * 200 + (qrImage ? qrSize + 120 : 0) + (logoImage ? logoSize + 40 : 0);
  const scratch = document.createElement('canvas');
  scratch.width = width; scratch.height = maxHeight;
  const ctx = scratch.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, maxHeight);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let y = pad + lineH / 2;

  const contentWidth = width - pad * 2;
  const wrapLine = (text, font)=>{
    ctx.font = font;
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w=>{
      const test = cur ? cur + ' ' + w : w;
      if(ctx.measureText(test).width > contentWidth && cur){ lines.push(cur); cur = w; }
      else cur = test;
    });
    if(cur) lines.push(cur);
    return lines;
  };
  const centerText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    y += lineH * (size > 22 ? 1.3 : 1);
  };
  const rowText = (leftMono, rightArabic, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(rightArabic, width - pad, y);
    ctx.font = '500 ' + size + 'px "IBM Plex Mono", monospace';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillText(leftMono, pad, y);
    y += lineH;
  };
  const divider = ()=>{
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    y += lineH * 0.6;
  };

  if(logoImage){
    ctx.drawImage(logoImage, (width - logoSize) / 2, y - logoSize / 2, logoSize, logoSize);
    y += logoSize + lineH * 0.3;
  }
  centerText(receipt.businessName || 'ركين', 30, true);
  if(receipt.branchName) centerText(receipt.branchName, 19, false);
  centerText(receipt.dateLabel, 16, false);
  // its own clearly-labeled line, always present — this used to be folded
  // into metaLabel ("بالمطعم — طلب #58") and silently disappeared whenever
  // orderId wasn't available yet (e.g. printed while the order was still
  // offline-queued, before the real server id existed) — a customer with no
  // order number has no way to ask about their order at all.
  centerText('رقم الطلب: ' + receipt.orderNumber, 18, true);
  if(receipt.metaLabel) centerText(receipt.metaLabel, 15, false);
  if(receipt.vatNumber){
    centerText('فاتورة ضريبية مبسطة', 17, true);
    centerText('الرقم الضريبي: ' + receipt.vatNumber, 15, false);
  }
  divider();

  receipt.items.forEach(it=>{
    wrapLine(it.name, '700 21px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
      ctx.font = '700 21px "IBM Plex Sans Arabic", sans-serif';
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillText(line, width - pad, y);
      y += lineH * 0.85;
    });
    (it.mods || []).forEach(modText=>{
      wrapLine(modText, '500 15px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
        ctx.fillStyle = '#333';
        ctx.font = '500 15px "IBM Plex Sans Arabic", sans-serif';
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad, y);
        ctx.fillStyle = '#000';
        y += lineH * 0.7;
      });
    });
    rowText(it.lineTotal.toFixed(2), it.qty + ' × ' + it.unitPrice.toFixed(2), 18, false);
  });
  divider();
  rowText(receipt.subtotal.toFixed(2), 'المجموع الفرعي', 18, false);
  if(receipt.discount > 0) rowText('-' + receipt.discount.toFixed(2), 'الخصم', 18, false);
  rowText(receipt.vat.toFixed(2), 'ضريبة القيمة المضافة', 18, false);
  rowText(receipt.total.toFixed(2), 'الإجمالي', 24, true);
  divider();
  rowText('', receipt.paymentMethodLabel, 17, false);
  if(receipt.change > 0) rowText(receipt.change.toFixed(2), 'الباقي', 17, false);
  if(qrImage){
    y += lineH * 0.5;
    // Centered, deliberately — x = (width - qrSize) / 2 lands it dead-center
    // on the paper regardless of width, never pinned to either edge.
    ctx.drawImage(qrImage, (width - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + lineH * 0.3;
  }
  y += lineH * 0.4;
  wrapLine(receipt.customMessage || 'شكراً لزيارتكم', '600 18px "IBM Plex Sans Arabic", sans-serif').forEach(line=> centerText(line, 18, false));
  y += pad;

  const finalHeight = Math.min(Math.ceil(y), maxHeight);
  const out = document.createElement('canvas');
  out.width = width; out.height = finalHeight;
  out.getContext('2d').drawImage(scratch, 0, 0, width, finalHeight, 0, 0, width, finalHeight);
  return out;
}

/* ============ Kitchen ticket — items only, no prices/VAT/payment ============
   A completely separate print target from the customer receipt: bigger
   fonts (read fast, often under pressure), qty+name+modifiers+the cashier's
   free-text note per line (state.cart's item.note — e.g. "بدون بصل، إضافي
   صوص" — which the customer receipt never printed either), nothing about
   money. Independently toggleable in POS settings from the customer
   receipt, since some kitchens want both printed, some just one. */
function renderKitchenTicketCanvas(receipt){
  const width = DEVICE.printerPaperWidth || 576;
  const pad = 16, lineH = 36;
  const maxHeight = 1200 + receipt.items.length * 260;
  const scratch = document.createElement('canvas');
  scratch.width = width; scratch.height = maxHeight;
  const ctx = scratch.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, maxHeight);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let y = pad + lineH / 2;

  const contentWidth = width - pad * 2;
  const wrapLine = (text, font)=>{
    ctx.font = font;
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w=>{
      const test = cur ? cur + ' ' + w : w;
      if(ctx.measureText(test).width > contentWidth && cur){ lines.push(cur); cur = w; }
      else cur = test;
    });
    if(cur) lines.push(cur);
    return lines;
  };
  const centerText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    y += lineH * (size > 22 ? 1.3 : 1);
  };
  const divider = ()=>{
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    y += lineH * 0.6;
  };

  centerText('طلب مطبخ', 32, true);
  if(receipt.branchName) centerText(receipt.branchName, 18, false);
  centerText(receipt.dateLabel, 16, false);
  centerText(receipt.metaLabel, 20, true);
  divider();

  receipt.items.forEach(it=>{
    wrapLine(it.qty + ' × ' + it.name, '800 26px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
      ctx.font = '800 26px "IBM Plex Sans Arabic", sans-serif';
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillText(line, width - pad, y);
      y += lineH * 0.9;
    });
    (it.mods || []).forEach(modText=>{
      wrapLine('— ' + modText, '600 18px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
        ctx.font = '600 18px "IBM Plex Sans Arabic", sans-serif';
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad - 14, y);
        y += lineH * 0.7;
      });
    });
    if(it.note){
      wrapLine('📝 ' + it.note, '700 18px "IBM Plex Sans Arabic", sans-serif').forEach(line=>{
        ctx.font = '700 18px "IBM Plex Sans Arabic", sans-serif';
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillText(line, width - pad - 14, y);
        y += lineH * 0.7;
      });
    }
    y += lineH * 0.3;
  });
  divider();
  y += pad;

  const finalHeight = Math.min(Math.ceil(y), maxHeight);
  const out = document.createElement('canvas');
  out.width = width; out.height = finalHeight;
  out.getContext('2d').drawImage(scratch, 0, 0, width, finalHeight, 0, 0, width, finalHeight);
  return out;
}

function canvasToEscPosRaster(canvas){
  const w = canvas.width, h = canvas.height;
  const imgData = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const bytesPerRow = Math.ceil(w / 8);
  const raster = new Uint8Array(bytesPerRow * h);
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const idx = (y * w + x) * 4;
      const luminance = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;
      if(imgData[idx + 3] > 10 && luminance < 160){
        raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }
  const header = new Uint8Array([0x1D, 0x76, 0x30, 0x00, bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF, h & 0xFF, (h >> 8) & 0xFF]);
  const out = new Uint8Array(header.length + raster.length);
  out.set(header, 0);
  out.set(raster, header.length);
  return out;
}

function buildReceiptEscPosBytes(receipt, qrImage, logoImage){
  const image = canvasToEscPosRaster(renderReceiptCanvas(receipt, qrImage, logoImage));
  const init = new Uint8Array([0x1B, 0x40]); // ESC @ — initialize printer
  const feedCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]); // feed 3 lines + full cut
  const out = new Uint8Array(init.length + image.length + feedCut.length);
  out.set(init, 0);
  out.set(image, init.length);
  out.set(feedCut, init.length + image.length);
  return out;
}

function buildKitchenTicketEscPosBytes(receipt){
  const image = canvasToEscPosRaster(renderKitchenTicketCanvas(receipt));
  const init = new Uint8Array([0x1B, 0x40]);
  const feedCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]);
  const out = new Uint8Array(init.length + image.length + feedCut.length);
  out.set(init, 0);
  out.set(image, init.length);
  out.set(feedCut, init.length + image.length);
  return out;
}

/* ============ ZATCA Simplified Tax Invoice QR (Phase 1) ============
   Base64-encoded TLV (Tag-Length-Value): 5 mandatory fields — seller name,
   VAT registration number, invoice timestamp, invoice total (incl. VAT),
   VAT amount. Every field is a real thing a ZATCA-compliant scanner reads
   off the printed receipt; this is not decorative. Skipped entirely (no
   QR drawn) when the owner hasn't set a VAT number yet — a QR encoding an
   empty VAT number would be actively wrong, not just incomplete. */
function zatcaQrBase64(sellerName, vatNumber, timestampISO, totalWithVat, vatAmount){
  const enc = new TextEncoder();
  const tlv = (tag, value)=>{
    const bytes = enc.encode(String(value));
    const out = new Uint8Array(2 + bytes.length);
    out[0] = tag; out[1] = bytes.length; out.set(bytes, 2);
    return out;
  };
  const fields = [
    tlv(1, sellerName), tlv(2, vatNumber), tlv(3, timestampISO), tlv(4, totalWithVat), tlv(5, vatAmount)
  ];
  const totalLen = fields.reduce((s,f)=>s+f.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  fields.forEach(f=>{ combined.set(f, offset); offset += f.length; });
  let binary = '';
  combined.forEach(b=> binary += String.fromCharCode(b));
  return btoa(binary);
}

// Fetches the same /api/qr SVG endpoint the loyalty card already uses (real
// dep, same-origin, no third-party QR service) and loads it as a drawable
// Image. Returns null (never throws) on any failure — a receipt must still
// print without its QR rather than fail outright over a network hiccup.
async function loadZatcaQrImage(receipt){
  if(!receipt.vatNumber) return null;
  try {
    const payload = zatcaQrBase64(receipt.businessName || '', receipt.vatNumber, receipt.timestampISO, receipt.total.toFixed(2), receipt.vat.toFixed(2));
    const resp = await fetch('/api/qr?data=' + encodeURIComponent(payload));
    if(!resp.ok) return null;
    const svgText = await resp.text();
    const blob = new Blob([svgText], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject)=>{ img.onload = resolve; img.onerror = reject; img.src = url; });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) { return null; }
}

// Same "never throw, just skip" contract as loadZatcaQrImage — a missing/
// slow logo must never be the reason a receipt fails to print. crossOrigin
// is required here (unlike the QR, which is same-origin) since the logo
// comes from Supabase Storage's public bucket; without it, drawing the
// image onto the canvas would taint it and getImageData() (used later to
// build the ESC/POS raster) would throw a SecurityError.
async function loadLogoImage(url){
  if(!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject)=>{ img.onload = resolve; img.onerror = reject; img.src = url; });
    return img;
  } catch (e) { return null; }
}

function bytesToBase64(bytes){
  let binary = '';
  const chunk = 0x8000;
  for(let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

let printCallbackCounter = 0;
const printCallbacks = {};
window.__androidPrintCallback = function(id, result){
  const cb = printCallbacks[id];
  if(cb){ delete printCallbacks[id]; cb(result); }
};

// ip/port let a caller target a SPECIFIC printer (e.g. the kitchen ticket's
// own printer, DEVICE.kitchenPrinterIp) instead of the default one — falls
// back to DEVICE.printerIp/printerPort when omitted, so anything that
// doesn't care which printer (a plain reprint, the shift report) keeps
// working exactly as before.
function sendBytesToPrinter(bytes, ip, port){
  return new Promise((resolve)=>{
    if(!printerBridgeAvailable()){ resolve({ok:false, error:'bridge_unavailable'}); return; }
    const targetIp = ip || DEVICE.printerIp;
    if(!targetIp){ resolve({ok:false, error:'no_printer_configured'}); return; }
    const base64 = bytesToBase64(bytes);
    const callbackId = 'p' + (++printCallbackCounter);
    printCallbacks[callbackId] = resolve;
    window.AndroidPrint.printRaw(base64, targetIp, port || DEVICE.printerPort || 9100, callbackId);
    setTimeout(()=>{
      if(printCallbacks[callbackId]){ delete printCallbacks[callbackId]; resolve({ok:false, error:'timeout'}); }
    }, 8000);
  });
}

function sendKitchenTicketToPrinter(receipt){
  let bytes;
  try { bytes = buildKitchenTicketEscPosBytes(receipt); }
  catch (e) { return Promise.resolve({ok:false, error:'render_failed'}); }
  // A separate physical printer for the kitchen (e.g. downstairs) is
  // optional — falls back to the main counter printer when not set, so a
  // one-printer restaurant needs no extra configuration at all.
  return sendBytesToPrinter(bytes, DEVICE.kitchenPrinterIp || null, DEVICE.kitchenPrinterPort || null);
}

async function sendToPrinter(receipt){
  let bytes;
  try {
    const [qrImage, logoImage] = await Promise.all([
      loadZatcaQrImage(receipt),
      receipt.showLogo ? loadLogoImage(receipt.logoUrl) : Promise.resolve(null)
    ]);
    bytes = buildReceiptEscPosBytes(receipt, qrImage, logoImage);
  } catch (e) { return {ok:false, error:'render_failed'}; }
  return sendBytesToPrinter(bytes);
}

function buildLiveReceiptData(orderPayload, totals){
  // Closing out an already-registered tab (state.resumingOrder) has no cart
  // — the real line items were fetched from order_items when the payment
  // step opened (see openResumePaymentStep) and stashed there.
  const items = (state.resumingOrder && state.resumingOrder.items) ? state.resumingOrder.items : state.cart.map(item=>{
    const p = PRODUCTS.find(x=>x.id===item.productId);
    const unitPrice = lineUnitPrice(item);
    return {
      name: p ? p.name : '', qty: item.qty, unitPrice, lineTotal: unitPrice * item.qty,
      mods: formatConfigLabels(item.productId, item.config).map(l=>l.text)
    };
  });
  const liveTable = orderPayload.table_id ? (TABLES_CACHE || []).find(t => t.id === orderPayload.table_id) : null;
  const liveTableLabel = liveTable ? ' — طاولة ' + liveTable.number : '';
  return {
    businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
    dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    timestampISO: new Date().toISOString(), vatNumber: BUSINESS_VAT_NUMBER,
    // orderId can genuinely be missing here — still offline-queued, real id
    // not assigned by the server yet. Printing nothing would leave the
    // customer with zero way to reference this order; say so honestly
    // instead of silently dropping the line.
    orderNumber: orderPayload.orderId ? ('#' + orderPayload.orderId) : 'سيُحدَّد عند الاتصال',
    metaLabel: (CHANNEL_LABELS[orderPayload.channel] || orderPayload.channel) + liveTableLabel,
    showLogo: DEVICE.printReceiptLogo !== false && !!BUSINESS_LOGO_URL, logoUrl: BUSINESS_LOGO_URL,
    customMessage: RECEIPT_CUSTOM_MESSAGE,
    items, subtotal: totals.subtotal, discount: totals.discount, vat: totals.vat, total: totals.total,
    paymentMethodLabel: PAYMENT_METHOD_LABELS_POS[orderPayload.payment_method] || orderPayload.payment_method,
    change: orderPayload.payment_method === 'cash' ? Math.max(0, (state.cashAmount || 0) - totals.total) : 0
  };
}

// Mirrors buildLiveReceiptData's item mapping but adds the cashier's free-text
// note per line — never printed on the priced customer receipt, but exactly
// what the kitchen needs ("بدون بصل، إضافي صوص") and money never belongs here.
function buildKitchenReceiptData(orderPayload){
  const items = state.cart.map(item=>{
    const p = PRODUCTS.find(x=>x.id===item.productId);
    return {
      name: p ? p.name : '', qty: item.qty, note: item.note || '',
      mods: formatConfigLabels(item.productId, item.config).map(l=>l.text)
    };
  });
  const tableLabel = orderPayload.tableNumber ? ' — طاولة ' + orderPayload.tableNumber : '';
  return {
    branchName: DEVICE.branchName || '',
    dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    metaLabel: (CHANNEL_LABELS[orderPayload.channel] || orderPayload.channel) + tableLabel + ' — ' + (orderPayload.orderId ? '#' + orderPayload.orderId : 'سيُحدَّد عند الاتصال'),
    items
  };
}

// order.restaurant_tables comes from the join in openOrderDetail's select —
// deliberately not resolved via TABLES_CACHE like the live-receipt version,
// since a reprint can happen for an old order before the cashier has ever
// opened the Tables screen this session (TABLES_CACHE would still be empty).
function buildHistoricalReceiptData(order, items){
  const lineItems = (items || []).map(it=>{
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    return {
      name: product ? product.name : ('منتج #' + it.menu_item_id), qty: it.qty,
      unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total),
      mods: (it.selected_modifiers || []).map(m=>m.text)
    };
  });
  const histTableLabel = order.restaurant_tables ? ' — طاولة ' + order.restaurant_tables.number : '';
  return {
    businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
    dateLabel: new Date(order.created_at).toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    timestampISO: order.created_at, vatNumber: BUSINESS_VAT_NUMBER,
    orderNumber: '#' + order.id,
    metaLabel: (CHANNEL_LABELS[order.channel] || order.channel) + histTableLabel,
    showLogo: DEVICE.printReceiptLogo !== false && !!BUSINESS_LOGO_URL, logoUrl: BUSINESS_LOGO_URL,
    customMessage: RECEIPT_CUSTOM_MESSAGE,
    items: lineItems, subtotal: Number(order.subtotal), discount: Number(order.discount_amount || 0),
    vat: Number(order.vat_amount), total: Number(order.total),
    paymentMethodLabel: PAYMENT_METHOD_LABELS_POS[order.payment_method] || order.payment_method,
    change: 0
  };
}

// Kitchen-ticket equivalent of buildHistoricalReceiptData, for the accept-online-order
// flow — buildKitchenReceiptData above reads the live state.cart, which is wrong here
// (would print whatever's in the cashier's current cart, not the accepted online
// order), so this reads from DB-fetched order_items instead, same source as
// buildHistoricalReceiptData.
function buildDbKitchenReceiptData(order, items){
  const mapped = (items || []).map(it=>{
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    return {
      name: product ? product.name : ('منتج #' + it.menu_item_id), qty: it.qty,
      note: it.note || '',
      mods: (it.selected_modifiers || []).map(m=>m.text)
    };
  });
  return {
    branchName: DEVICE.branchName || '',
    dateLabel: new Date(order.created_at).toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    metaLabel: (CHANNEL_LABELS[order.channel] || order.channel) + ' — #' + order.id,
    items: mapped
  };
}

/* ============ End-of-shift reconciliation report — printable ============
   Nothing like this existed before (the closing wizard only ever showed
   these numbers in the modal, once, then discarded them). Reuses the same
   canvas -> 1-bit raster -> ESC/POS pipeline as order receipts, but with its
   own simple row layout since a shift report has no product line items. */
function renderShiftReportCanvas(report){
  const width = DEVICE.printerPaperWidth || 576;
  const pad = 16, lineH = 32;
  const scratch = document.createElement('canvas');
  scratch.width = width; scratch.height = 1400;
  const ctx = scratch.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, 1400);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  let y = pad + lineH / 2;

  const centerText = (text, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    y += lineH * (size > 22 ? 1.3 : 1);
  };
  const rowText = (leftMono, rightArabic, size, bold)=>{
    ctx.font = (bold ? '800 ' : '600 ') + size + 'px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(rightArabic, width - pad, y);
    ctx.font = '500 ' + size + 'px "IBM Plex Mono", monospace';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillText(leftMono, pad, y);
    y += lineH;
  };
  const divider = ()=>{
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    y += lineH * 0.6;
  };

  centerText(report.businessName || 'ركين', 30, true);
  if(report.branchName) centerText(report.branchName, 19, false);
  centerText('تقرير إغلاق الوردية', 20, true);
  centerText(report.dateLabel, 16, false);
  centerText('الكاشير: ' + report.staffName, 16, false);
  divider();
  rowText(String(report.ordersCount), 'عدد الطلبات', 18, false);
  rowText(report.salesTotal.toFixed(2), 'إجمالي المبيعات', 18, false);
  rowText(report.cardTotal.toFixed(2), 'بطاقة', 18, false);
  rowText(report.deliveryPlatformTotal.toFixed(2), 'توصيل — مدفوع عبر التطبيق', 18, false);
  divider();
  rowText(report.cashExpected.toFixed(2), 'الكاش المتوقع', 18, false);
  rowText(report.cashCounted.toFixed(2), 'الكاش المعدود', 18, false);
  rowText((report.cashVariance >= 0 ? '+' : '') + report.cashVariance.toFixed(2), 'الفرق', 22, true);
  divider();
  centerText('معتمد من المدير', 15, false);
  y += pad;

  const out = document.createElement('canvas');
  out.width = width; out.height = Math.ceil(y);
  out.getContext('2d').drawImage(scratch, 0, 0, width, out.height, 0, 0, width, out.height);
  return out;
}
function buildShiftReportEscPosBytes(report){
  const image = canvasToEscPosRaster(renderShiftReportCanvas(report));
  const init = new Uint8Array([0x1B, 0x40]);
  const feedCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]);
  const out = new Uint8Array(init.length + image.length + feedCut.length);
  out.set(init, 0);
  out.set(image, init.length);
  out.set(feedCut, init.length + image.length);
  return out;
}
function sendShiftReportToPrinter(report){
  let bytes;
  try { bytes = buildShiftReportEscPosBytes(report); }
  catch (e) { return Promise.resolve({ok:false, error:'render_failed'}); }
  return sendBytesToPrinter(bytes);
}

async function attemptPrint(receiptData){
  const row = document.getElementById('printStatusRow');
  if(row) row.querySelector('.print-status-label').innerHTML = '<span class="print-spinner"></span>جاري الطباعة...';
  const result = await sendToPrinter(receiptData);
  if(!row) return;
  if(result.ok){
    row.querySelector('.print-status-label').innerHTML = '<span class="print-check">✓</span>تمت الطباعة';
  } else if(result.error === 'bridge_unavailable' || result.error === 'no_printer_configured'){
    // no real printer configured yet (plain browser, or app not set up with
    // an IP) — keep the original simulated flow so testing looks the same
    // as it always has, rather than surfacing a scary error for a non-issue
    setTimeout(()=>{
      if(row) row.querySelector('.print-status-label').innerHTML = '<span class="print-check">✓</span>تمت الطباعة';
    }, 700);
  } else {
    row.querySelector('.print-status-label').innerHTML = '<span style="color:var(--danger)">⚠</span>تعذرت الطباعة — تحقق من الطابعة';
  }
}

// Checkout auto-print — respects the two independent POS-settings toggles
// (customer receipt / kitchen ticket, either or both). The customer receipt
// stays the one visible status row (attemptPrint(), unchanged, also reused
// by the manual "إعادة طباعة" button); the kitchen ticket has no dedicated
// UI of its own and just prints silently alongside, same as the loyalty QR/
// push notification above it.
async function autoPrintOnCheckout(orderPayload, receiptData, wasResumingOrder){
  const printCustomer = DEVICE.printCustomerReceipt !== false; // default on
  // Closing out an already-registered dine-in tab (wasResumingOrder) has no
  // new items — the kitchen ticket already went out when the order was
  // registered (see submitTableOrderRegistration), so it never reprints
  // here. Passed in explicitly rather than read live off state.resumingOrder
  // — that flag is already cleared by the time this runs (see completePayment,
  // which resets cart/table state immediately on success, before this call).
  const printKitchen = DEVICE.printKitchenTicket === true && !wasResumingOrder; // default off
  if(printKitchen) sendKitchenTicketToPrinter(buildKitchenReceiptData(orderPayload));
  if(printCustomer) attemptPrint(receiptData);
  else {
    const row = document.getElementById('printStatusRow');
    if(row) row.style.display = 'none';
  }
}

let activeAutoResetTimer = null;
let loyaltyPollTimer = null;
// Guards against the exact bug a hung device produces: the confirm button
// stayed clickable for the whole submitOrder() await, so a device that lagged
// for even a second let 5 rapid taps fire 5 concurrent completePayment() calls
// — each building its own fresh client_order_uuid, so complete_pos_order's
// existing dedup-by-uuid check (see supabase/migrations/20260808010000)
// couldn't catch any of them, and 5 real duplicate orders got created. Reset
// right after the await, not at the end of the function — that's the actual
// vulnerable window; after it, the DOM below is replaced with the receipt
// screen and confirmPayBtn no longer exists to be re-clicked anyway.
let completingPayment = false;
async function completePayment(){
  if(completingPayment) return;
  completingPayment = true;
  const confirmBtn = document.getElementById('confirmPayBtn');
  if(confirmBtn) confirmBtn.disabled = true;
  const {total} = cartTotals();
  const totals = cartTotals();
  const change = state.activePaymentMethod==='cash' ? Math.max(0,(state.cashAmount||0)-total) : 0;
  const customerPhone = state.customer ? state.customer.phone : null;
  const willShowLoyaltyQr = !!customerPhone;
  const orderPayload = await submitOrder(totals);
  completingPayment = false;
  // Table-order paths (Flow A/D above) aren't queued offline like a normal
  // sale — a null orderId there means the register/pay call genuinely
  // failed, nothing was persisted. Showing the usual success receipt would
  // tell the cashier money was collected when it wasn't; surface a plain
  // retry state instead. (Non-table channels keep today's behavior: a null
  // orderId there just means "still queued, will sync" and still shows
  // success — that's the existing, correct offline-first contract.)
  if(orderPayload.channel === 'dine_in' && orderPayload.table_id != null && !orderPayload.orderId){
    if(confirmBtn) confirmBtn.disabled = false;
    return;
  }
  if(navigator.onLine) runOwnerNotificationChecks(orderPayload);
  if(orderPayload.channel === 'delivery' && orderPayload.orderId) registerActiveDeliveryOrder(orderPayload.orderId, orderPayload);
  // Hotel checkout hook (roadmap item 7) — startHotelCheckout() loaded the
  // booking's room-type service into this exact cart before sending the
  // cashier here; if that order actually landed (orderId set — offline
  // queueing means it might not have yet, a known MVP limitation), link
  // the booking to it and flip its room to 'cleaning'. No new payment code.
  if(pendingHotelCheckoutBookingId && orderPayload.orderId){
    window.supabaseClient.rpc('finalize_hotel_checkout', { p_booking_id: pendingHotelCheckoutBookingId, p_order_id: orderPayload.orderId })
      .then(({error}) => { if(error) showToast('تنبيه: تعذر ربط الطلب بحجز الفندق — راجع الحجز يدويًا'); })
      .finally(() => { pendingHotelCheckoutBookingId = null; });
  }
  state.lastTransaction = {total, time: new Date().toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})};
  // Snapshot everything the receipt still needs from the live cart/table
  // state, THEN clear that state and re-render the Home screen underneath
  // right now — not deferred to the 4s auto-timer or a "طلب جديد الآن" tap.
  // Previously, closing this modal any other way (✕, back, or just
  // switching screens) skipped that reset entirely, leaving the old
  // items/table badge sitting on Home looking like the order never
  // finished even though it had already been paid.
  const receiptData = buildLiveReceiptData(orderPayload, totals);
  const wasResumingOrder = !!state.resumingOrder;
  state.cart = []; state.customer = null; state.discountPct = 0;
  state.selectedTableId = null; state.selectedOrderId = null; state.resumingOrder = null;
  document.getElementById('discountToggle').textContent = '+ خصم';
  updatePointsRedeemStrip();
  renderOrder();
  paymentModalBody.innerHTML = `<div class="receipt-success">
    <div class="success-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h3>تمت العملية بنجاح</h3>
    <div class="receipt-total mono">${total.toFixed(2)} ر.س</div>
    <div class="receipt-detail-row"><span>المدفوع</span><span class="mono">${(state.activePaymentMethod==='cash' ? (state.cashAmount||0) : total).toFixed(2)} ر.س</span></div>
    ${state.activePaymentMethod==='cash' ? `<div class="receipt-detail-row"><span>الباقي</span><span class="mono">${change.toFixed(2)} ر.س</span></div>` : ''}
    <div class="receipt-detail-row print-status" id="printStatusRow"><span>الطابعة</span><span class="print-status-label"><span class="print-spinner"></span>جاري الطباعة...</span></div>
    <div id="loyaltyQrBox"></div>
    <div class="receipt-actions">
      <button class="receipt-action-btn" id="printBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>طباعة</button>
      <button class="receipt-action-btn" id="waBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>واتساب</button>
    </div>
    <button class="new-order-btn" id="newOrderBtn">طلب جديد الآن</button>
    ${willShowLoyaltyQr ? '' : `<div class="auto-reset-note" id="autoResetNote">يبدأ طلب جديد تلقائيًا خلال <span class="mono" id="autoResetCount">4</span></div>`}
  </div>`;
  document.getElementById('printBtn').addEventListener('click', ()=> attemptPrint(receiptData));
  document.getElementById('waBtn').addEventListener('click', ()=> showToast('تم الإرسال'));

  // real "scan to save your loyalty card" QR — only shown when a customer
  // phone was captured on this order (skipped entirely if the customer
  // declined, matching how some customers just don't want to join)
  if(customerPhone){
    window.supabaseClient.from('customers').select('id, public_token, loyalty_points')
      .eq('business_id', DEVICE.businessId).eq('phone', customerPhone).maybeSingle()
      .then(async ({data})=>{
        if(!data) return;
        const cardUrl = window.location.origin + '/loyalty-card/' + data.public_token;
        const box = document.getElementById('loyaltyQrBox');
        if(box){
          box.innerHTML = `
            <div style="text-align:center; margin:14px 0; padding:14px; background:#fff; border-radius:12px;">
              <img src="/api/qr?data=${encodeURIComponent(cardUrl)}" alt="QR بطاقة الولاء" style="width:120px; height:120px;">
              <p style="font-size:11.5px; font-weight:700; color:var(--muted, #666); margin-top:8px;">امسح لإضافة بطاقة الولاء لجوالك</p>
            </div>`;
        }
        // real push notification (free, VAPID) — does nothing visible to the
        // customer if they never enabled notifications on their card, but
        // logs/toasts any failure so it's debuggable from the cashier device
        try {
          const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
          const session = sessionData && sessionData.session;
          if(sessionError){ console.error('push: getSession error', sessionError); showToast('تنبيه: جلسة الدخول غير صالحة'); return; }
          if(!session){ console.error('push: no session'); showToast('تنبيه: ما فيه جلسة دخول لإرسال التنبيه'); return; }
          const res = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({
              customerId: data.id,
              title: 'نقاطك تحدّثت',
              body: 'رصيدك الحين ' + Math.round(Number(data.loyalty_points)) + ' نقطة.'
            })
          });
          if(!res.ok){
            const errText = await res.text().catch(()=> '');
            console.error('push: send-push failed', res.status, errText);
            showToast('تنبيه: فشل الإرسال (' + res.status + ')');
          } else {
            const result = await res.json().catch(()=> null);
            console.log('push: sent', result);
            if(result && result.total > 0) showToast('تم إرسال تنبيه (' + result.sent + '/' + result.total + ')');
          }
        } catch (err) {
          console.error('push: unexpected error', err);
          showToast('تنبيه: خطأ غير متوقع بالإرسال');
        }
      });
  }

  autoPrintOnCheckout(orderPayload, receiptData, wasResumingOrder);

  // Cart/table/customer state is already cleared above (right after
  // success) — this just closes the modal, whether that happens via the
  // timer or an explicit tap.
  const startNewOrder = ()=> closePaymentModalNow();

  // auto-reset for the next customer — visible countdown, cashier can skip by tapping "New Order" or paying again.
  // Skipped entirely when a loyalty QR is shown — 4 seconds isn't enough time
  // for the customer to get their phone out and scan it; the cashier taps
  // "طلب جديد الآن" whenever they're actually ready to move on instead.
  if(!willShowLoyaltyQr){
    let secondsLeft = 4;
    const countEl = document.getElementById('autoResetCount');
    activeAutoResetTimer = setInterval(()=>{
      secondsLeft -= 1;
      if(countEl) countEl.textContent = secondsLeft;
      if(secondsLeft <= 0){
        clearInterval(activeAutoResetTimer);
        startNewOrder();
      }
    }, 1000);
  }

  document.getElementById('newOrderBtn').addEventListener('click', ()=>{
    clearInterval(activeAutoResetTimer);
    startNewOrder();
  });
}

/* ============ ORDERS screen ============ */
let ordersActiveTab = 'running';
document.getElementById('ordersTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.seg-tab'); if(!btn) return;
  document.querySelectorAll('#ordersTabs .seg-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  ordersActiveTab = btn.dataset.tab;
  renderOrdersList();
});
async function renderOrdersList(){
  const el = document.getElementById('ordersList');
  if(ordersActiveTab === 'running'){
    // merged with what used to be the separate "التوصيل" screen — a held
    // order and an active delivery order are both "جارية" in the same real
    // sense, and the countdown ring already communicates delivery urgency
    // without needing its own tab/screen.
    const held = state.heldOrders.map(h=>({id:'معلّق', meta:'علّق الساعة '+h.time, total:h.total, heldId:h.id}));
    // Not-ready orders (still racing the prep-timeout countdown) sort by
    // urgency; ready-but-undelivered orders come after, oldest-waiting-first
    // — those are two different questions ("what's about to be late?" vs
    // "what's been sitting the longest waiting for a delivered confirmation?")
    // so they don't share a sort key.
    const notReadyRows = ACTIVE_DELIVERY_ORDERS.filter(o=>!o.readyAt)
      .map(o=>({order:o, remaining: deliveryOrderRemainingSeconds(o)}))
      .sort((a,b)=> a.remaining - b.remaining);
    const readyRows = ACTIVE_DELIVERY_ORDERS.filter(o=>o.readyAt)
      .sort((a,b)=> a.readyAt - b.readyAt)
      .map(o=>({order:o, remaining: null}));
    const deliveryRows = [...notReadyRows, ...readyRows];
    if(held.length === 0 && deliveryRows.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه طلبات جارية حاليًا</div>'; return; }
    el.innerHTML =
      (deliveryRows.length ? `<div class="dorder-grid">${deliveryRows.map(({order, remaining})=> renderDeliveryCard(order, remaining)).join('')}</div>` : '') +
      held.map(o=>
        `<div class="order-row"><span class="order-row-badge running"></span>
          <div class="order-row-info"><div class="order-row-title">${o.id}</div><div class="order-row-meta">${o.meta}</div></div>
          <div class="order-row-total mono">${o.total.toFixed(2)}</div>
          <button class="order-row-action" data-held="${o.heldId}">استرجاع</button>
        </div>`
      ).join('');
    el.querySelectorAll('.dorder-card').forEach(card=>{
      card.addEventListener('click', (e)=>{
        if(e.target.closest('.dorder-ready-btn')) return;
        resetModalStack(()=> openOrderDetail(parseInt(card.dataset.order, 10)));
      });
    });
    el.querySelectorAll('.dorder-ready-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markDeliveryOrderReady(parseInt(btn.dataset.orderId, 10)); });
    });
    el.querySelectorAll('.dorder-delivered-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); markDeliveryOrderDelivered(parseInt(btn.dataset.orderId, 10)); });
    });
    el.querySelectorAll('[data-held]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = parseInt(btn.dataset.held);
        const heldOrder = state.heldOrders.find(h=>h.id===id);
        if(!heldOrder) return;
        state.cart = heldOrder.cart;
        state.heldOrders = state.heldOrders.filter(h=>h.id!==id);
        renderOrder();
        document.querySelector('.nav-tab[data-screen="home"]').click();
        showToast('تم استرجاع الطلب');
      });
    });
    return;
  }

  // مكتملة / ملغاة — real rows across every channel, unchanged query except
  // delivery-specific fields so those rows can additionally show their
  // "جهز خلال mm:ss" badge (this tab already pulled delivery orders before
  // the merge, just without that extra context).
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient
    .from('orders').select('id, total, created_at, customer_name, channel, ready_at, prep_duration_seconds, platform_invoice_last4, scheduled_for, delivery_platforms(name)')
    .eq('branch_id', DEVICE.branchId).eq('status', ordersActiveTab)
    .order('created_at', {ascending:false}).limit(30);
  const real = (data||[]).map(o=>{
    let extra = '';
    if(o.channel === 'delivery'){
      extra = ' — ' + (o.ready_at ? `جهز خلال ${formatMmSs(o.prep_duration_seconds||0)}` : (o.delivery_platforms ? o.delivery_platforms.name : 'توصيل'));
    } else if(o.channel === 'pickup' && o.scheduled_for){
      extra = ' — استلام ' + new Date(o.scheduled_for).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
    }
    return {
      id: '#' + o.id, orderId: o.id,
      meta: new Date(o.created_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) + (o.customer_name ? ' — ' + escapeHtml(o.customer_name) : '') + escapeHtml(extra),
      total: Number(o.total)
    };
  });
  if(real.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه طلبات هنا حاليًا</div>'; return; }
  el.innerHTML = real.map(o=>
    `<div class="order-row" data-order="${o.orderId}">
      <span class="order-row-badge ${ordersActiveTab}"></span>
      <div class="order-row-info"><div class="order-row-title">${o.id}</div><div class="order-row-meta">${o.meta}</div></div>
      <div class="order-row-total mono">${o.total.toFixed(2)}</div>
    </div>`
  ).join('');
  el.querySelectorAll('[data-order]').forEach(row=>{
    row.addEventListener('click', ()=> resetModalStack(()=> openOrderDetail(parseInt(row.dataset.order,10))));
  });
}

/* ============ Delivery countdown ring — SVG stroke-dashoffset driven by
   remaining-time fraction. Always the 3-level urgency scheme (green/orange/
   red) regardless of platform brand — the ring's whole job is communicating
   urgency at a glance, and mixing in brand color would defeat that; the
   platform's brand identity is carried by the logo/initial badge instead. */
function deliveryUrgency(remaining){
  return remaining <= 0 ? 'urgent' : remaining <= 300 ? 'warn' : 'ok';
}
function deliveryRingSvg(remaining, timeoutMin, urgency){
  const totalSec = Math.max(1, timeoutMin * 60);
  const pct = Math.max(0, Math.min(1, remaining / totalSec));
  const color = urgency === 'urgent' ? 'var(--danger)' : urgency === 'warn' ? 'var(--amber)' : 'var(--lime-deep)';
  const r = 19, circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);
  return `<svg class="dorder-ring" viewBox="0 0 44 44" width="44" height="44">
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--surf2)" stroke-width="4"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 22 22)"/>
  </svg>`;
}

/* Compact card for the "جارية" grid — the warn/urgent classes below drive a
   pulsing border/glow (see .dorder-card.warn/.urgent in the CSS) so an order
   that's crossed the 5-min-warning or fully-expired threshold stands out at
   a glance even when there are many cards packed tightly together. */
function renderDeliveryCard(order, remaining){
  const platform = DELIVERY_PLATFORMS_LIST.find(p=>p.id === order.platformId);
  const brandColor = platform && platform.brand_color;
  const badge = order.isOnline
    ? `<span class="dorder-logo-initial" style="background:var(--lime);">🌐</span>`
    : platform && platform.logo_url
    ? `<img src="${platform.logo_url}" alt="" class="dorder-logo">`
    : `<span class="dorder-logo-initial" style="background:${brandColor || 'var(--surf2)'}">${(order.platformName||'؟').charAt(0)}</span>`;

  // Ready and waiting on the delivery rep to confirm drop-off — no more
  // countdown ring (the kitchen-prep deadline this order was racing against
  // no longer applies), just how long it's been waiting + a delivered button.
  if(order.readyAt){
    const waitingSec = Math.round((Date.now() - order.readyAt.getTime()) / 1000);
    return `<div class="dorder-card out-for-delivery" data-order="${order.id}">
      <div class="dorder-out-icon">🛵</div>
      <div class="dorder-info">${badge}<span class="dorder-id">#${order.id}</span></div>
      <div class="dorder-platform">${order.platformName}${order.invoiceLast4 ? ' — ...' + order.invoiceLast4 : ''}</div>
      <div class="dorder-out-waiting mono">بانتظار التسليم — ${formatMmSs(waitingSec)}</div>
      <div class="dorder-total mono">${order.total.toFixed(2)}</div>
      <button class="dorder-delivered-btn" data-order-id="${order.id}">تم توصيله ✅</button>
    </div>`;
  }

  const timeoutMin = PREP_TIMEOUT_MINUTES_BY_PLATFORM[order.platformId] || 17;
  const urgency = deliveryUrgency(remaining);
  const ring = deliveryRingSvg(remaining, timeoutMin, urgency);
  return `<div class="dorder-card ${urgency !== 'ok' ? urgency : ''}" data-order="${order.id}">
    <div class="dorder-ring-wrap">${ring}<span class="dorder-ring-time mono">${formatMmSs(remaining)}</span></div>
    <div class="dorder-info">${badge}<span class="dorder-id">#${order.id}</span></div>
    <div class="dorder-platform">${order.platformName}${order.invoiceLast4 ? ' — ...' + order.invoiceLast4 : ''}</div>
    <div class="dorder-total mono">${order.total.toFixed(2)}</div>
    <button class="dorder-ready-btn" data-order-id="${order.id}">جاهز</button>
  </div>`;
}

/* ============ Order detail + reprint — reuses the payment modal shell
   (paymentModal/paymentModalBody) since it's already the app's generic
   receipt-style modal, just filled with a historical order instead of the
   just-completed one. ============ */
async function openOrderDetail(orderId){
  const modal = document.getElementById('paymentModal');
  const body = document.getElementById('paymentModalBody');
  document.getElementById('paymentModalTitle').textContent = 'تفاصيل الطلب #' + orderId;
  body.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  modal.classList.add('show');

  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*, delivery_platforms(name), restaurant_tables!orders_table_id_fkey(number)').eq('id', orderId).single(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  if(!order){ body.innerHTML = '<p class="pos-auth-sub">تعذر تحميل الطلب.</p>'; return; }

  const itemsHtml = (items||[]).map(it=>{
    const mods = (it.selected_modifiers||[]).map(m=>escapeHtml(m.text)).join('، ');
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    const name = escapeHtml(product ? product.name : ('منتج #' + it.menu_item_id));
    return `<div class="receipt-detail-row"><span>${it.qty} × ${name}${mods ? ' (' + mods + ')' : ''}${it.note ? ' — ' + escapeHtml(it.note) : ''}</span><span class="mono">${Number(it.line_total).toFixed(2)}</span></div>`;
  }).join('');

  const isOnline = order.source === 'online';
  const hasLocation = order.channel === 'delivery' && order.customer_lat != null && order.customer_lng != null;
  const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${order.customer_lat},${order.customer_lng}` : null;
  const waPhone = (order.customer_phone || '').replace(/\D/g, '');
  const waMessage = `مرحبًا ${order.customer_name || ''}! طلبك رقم #${order.id} جاري تجهيزه وراح يوصلك بأقرب وقت 🚴`;
  const waUrl = waPhone ? `https://wa.me/${waPhone.startsWith('966') ? waPhone : '966' + waPhone.replace(/^0/, '')}?text=${encodeURIComponent(waMessage)}` : null;

  body.innerHTML = `
    <div class="receipt-success">
      ${isOnline ? `<div class="receipt-detail-row" style="border-bottom:none; font-weight:800; color:var(--lime-deep);"><span>🌐 طلب إلكتروني — من متجر المطعم</span><span></span></div>` : ''}
      <h3>${escapeHtml(CHANNEL_LABELS[order.channel] || order.channel)}${order.customer_name ? ' — ' + escapeHtml(order.customer_name) : ''}</h3>
      <div class="receipt-total mono">${Number(order.total).toFixed(2)} ر.س</div>
      ${order.channel === 'pickup' && order.scheduled_for ? `<div class="receipt-detail-row" style="font-weight:800; color:var(--lime-deep);"><span>⏰ وقت الاستلام المطلوب</span><span class="mono">${new Date(order.scheduled_for).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})}</span></div>` : ''}
      ${order.channel === 'dine_in' && order.restaurant_tables ? `<div class="receipt-detail-row"><span>الطاولة</span><span class="mono">طاولة ${order.restaurant_tables.number}</span></div>` : ''}
      ${itemsHtml}
      <div class="receipt-detail-row"><span>المجموع الفرعي</span><span class="mono">${Number(order.subtotal).toFixed(2)}</span></div>
      ${order.delivery_fee > 0 ? `<div class="receipt-detail-row"><span>رسوم التوصيل</span><span class="mono">${Number(order.delivery_fee).toFixed(2)}</span></div>` : ''}
      ${order.discount_amount > 0 ? `<div class="receipt-detail-row"><span>الخصم</span><span class="mono">-${Number(order.discount_amount).toFixed(2)}</span></div>` : ''}
      <div class="receipt-detail-row"><span>الضريبة</span><span class="mono">${Number(order.vat_amount).toFixed(2)}</span></div>
      <div class="receipt-detail-row"><span>طريقة الدفع</span><span class="mono">${PAYMENT_METHOD_LABELS_POS[order.payment_method] || order.payment_method}</span></div>
      <div class="receipt-detail-row"><span>الحالة</span><span class="mono">${ORDER_STATUS_LABELS_POS[order.status] || order.status}</span></div>
      ${order.customer_phone ? `<div class="receipt-detail-row"><span>جوال العميل</span><span class="mono">${escapeHtml(order.customer_phone)}</span></div>` : ''}
      ${order.delivery_address ? `<div class="receipt-detail-row"><span>عنوان التوصيل</span><span>${escapeHtml(order.delivery_address)}</span></div>` : ''}
      ${order.channel === 'delivery' ? `
        <div class="receipt-detail-row"><span>منصة التوصيل</span><span>${isOnline ? 'متجر المطعم' : escapeHtml(order.delivery_platforms ? order.delivery_platforms.name : '—')}</span></div>
        ${order.platform_invoice_last4 ? `<div class="receipt-detail-row"><span>آخر ٤ أرقام الفاتورة</span><span class="mono">${escapeHtml(order.platform_invoice_last4)}</span></div>` : ''}
        <div class="receipt-detail-row"><span>وقت التجهيز</span><span class="mono">${order.ready_at ? formatMmSs(order.prep_duration_seconds||0) : 'لم يُسجَّل جاهز بعد'}</span></div>
      ` : ''}
      ${hasLocation ? `
        <div style="text-align:center; margin-top:14px; padding-top:14px; border-top:1px solid var(--line);">
          <div style="font-weight:800; font-size:12.5px; margin-bottom:10px;">📍 موقع العميل — للمندوب</div>
          <img src="/api/qr?data=${encodeURIComponent(mapsUrl)}" alt="" style="width:110px; height:110px; margin:0 auto 10px; display:block;">
          <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="receipt-action-btn" style="text-decoration:none; margin-bottom:8px; display:flex;">فتح بخرائط جوجل</a>
          ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="dorder-ready-btn" style="text-decoration:none; display:block; background:#25D366;">📱 إرسال تحديث عبر واتساب</a>` : ''}
        </div>
      ` : ''}
      <div class="receipt-actions">
        <button class="receipt-action-btn" id="reprintBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>إعادة طباعة</button>
        ${order.status === 'completed' ? `<button class="receipt-action-btn" id="refundOrderBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>استرجاع مبلغ</button>` : ''}
      </div>
    </div>
  `;
  document.getElementById('reprintBtn').addEventListener('click', async ()=>{
    showToast('جاري الطباعة...');
    const result = await sendToPrinter(buildHistoricalReceiptData(order, items));
    if(result.ok) showToast('تمت الطباعة');
    else if(result.error === 'bridge_unavailable' || result.error === 'no_printer_configured') showToast('تمت إعادة الطباعة');
    else showToast('تعذرت الطباعة — تحقق من الطابعة');
  });
  const refundBtn = document.getElementById('refundOrderBtn');
  if(refundBtn){
    refundBtn.addEventListener('click', async ()=>{
      if(!window.confirm('متأكد إنك تبي تسترجع مبلغ هذا الطلب؟')) return;
      refundBtn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('refund_pos_order', { p_order_id: orderId });
        if(error) throw error;
        showToast('تم استرجاع مبلغ الطلب');
        sendOwnerPush('refund_cancel', 'استرجاع طلب', `تم استرجاع مبلغ ${Number(order.total).toFixed(2)} ر.س (طلب #${orderId}).`);
        openOrderDetail(orderId);
        renderOrdersList();
      } catch(err){
        showToast('تعذر الاسترجاع: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        refundBtn.disabled = false;
      }
    });
  }
}
const ORDER_STATUS_LABELS_POS = {pending:'بانتظار القبول', completed:'مكتمل', cancelled:'ملغى', refunded:'مسترجع', rejected:'مرفوض'};
const CHANNEL_LABELS = {dine_in:'بالمطعم', pickup:'استلام', delivery:'توصيل'};
const PAYMENT_METHOD_LABELS_POS = {cash:'كاش', card:'بطاقة', split:'تقسيم دفع', delivery_platform:'مدفوع عبر التطبيق'};

/* ============ TABLES screen — real restaurant_tables, grouped by owner-
   configurable sections. A table's life now has a real ladder, and every
   status has exactly one meaning when tapped — a busy captain never has to
   guess, and never has to open a table to know what's going on with it:
   available        -> seats the guest right here (no product screen yet)
   awaiting_order    -> "بانتظار الطلب" — guest is seated, order not taken
                        yet; tap opens the product screen to register it
   serving           -> "قيد التقديم" — order registered (kitchen has it),
                        not yet paid; tap opens إضافة أصناف / الدفع
   awaiting_payment  -> "بانتظار الدفع" — closing out the bill; tap resumes
                        the payment step
   cleaning          -> single "تم التنظيف" tap, back to available
   reserved          -> legacy manual state from before this redesign, kept
                        as a start-session/release escape hatch
   Walk-in waitlist entries (table_reservations, no table_id until seated)
   live in the "قائمة الانتظار" tab below, not on any individual card. ============ */
const TABLE_STATUS_LABELS = {available:'متاحة', awaiting_order:'بانتظار الطلب', serving:'قيد التقديم', awaiting_payment:'بانتظار الدفع', cleaning:'تنظيف', reserved:'محجوزة'};
function reservationTimeLabel(iso){
  return new Date(iso).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
}
function elapsedMinutesLabel(iso){
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return mins < 1 ? 'الآن' : 'منذ ' + mins + ' د';
}
// Traffic-light severity for how long a table's been sitting in its current
// state — green up to the owner's configured turn-time, amber up to 1.5x
// that, red beyond it. Same threshold drives both "hasn't been touched yet"
// waits (awaiting_order/cleaning) and "order's been open too long" waits
// (serving/awaiting_payment) — one number the owner already controls in
// Settings, not a second one to configure.
function turnTimerSeverityClass(mins){
  if(mins > TABLES_TURN_TIME_MINUTES * 1.5) return ' over';
  if(mins > TABLES_TURN_TIME_MINUTES) return ' warn';
  return ' ok';
}
function waPhoneUrl(phone, message){
  if(!phone) return null;
  const normalized = phone.startsWith('966') ? phone : '966' + phone.replace(/^0/, '');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
// Groups tables under their table_sections in configured sort_order; a
// section with zero tables today is skipped rather than shown empty, and
// unsectioned tables land in a trailing "بدون قسم" group only if any exist.
// When the branch has never created a section, returns one unlabeled group
// (no header rendered) — the flat grid stays exactly as it always has.
function groupTablesForDisplay(tables){
  if(!TABLE_SECTIONS_LIST.length) return [{section: null, tables}];
  const bySection = {};
  tables.forEach(t => { const key = t.section_id || 'none'; (bySection[key] = bySection[key] || []).push(t); });
  const groups = TABLE_SECTIONS_LIST
    .map(s => ({section: s, tables: bySection[s.id] || []}))
    .filter(g => g.tables.length);
  if(bySection.none && bySection.none.length) groups.push({section: {id: null, name: 'بدون قسم'}, tables: bySection.none});
  return groups;
}

/* ---- Tables / قائمة الانتظار sub-tabs ---- */
let tablesActiveTab = 'floor';
document.getElementById('tablesTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.seg-tab'); if(!btn) return;
  document.querySelectorAll('#tablesTabs .seg-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  tablesActiveTab = btn.dataset.tab;
  document.getElementById('tablesFloorPane').classList.toggle('hidden', tablesActiveTab !== 'floor');
  document.getElementById('tablesWaitlistPane').classList.toggle('hidden', tablesActiveTab !== 'waitlist');
  document.getElementById('tablesRemindersPane').classList.toggle('hidden', tablesActiveTab !== 'reminders');
  if(isHotelBusiness()) renderHotelActiveTab();
  else if(tablesActiveTab === 'waitlist') renderWaitlist();
  else if(tablesActiveTab === 'reminders') renderReminders();
  else renderTables();
});
document.getElementById('waitlistAddBtn').addEventListener('click', ()=>{
  if(isHotelBusiness()){ openNewHotelBookingModal(); return; }
  resetModalStack(renderAddToWaitlistStep);
  paymentModal.classList.add('show');
});

async function renderTables(){
  const el = document.getElementById('tablesGrid');
  // switching into this screen used to sit frozen (nothing shown at all)
  // until the fetch resolved — on a slow connection that reads as the whole
  // app hanging, not just this one screen loading
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient
    .from('restaurant_tables').select('*').eq('branch_id', DEVICE.branchId).order('number');
  const tables = data || [];
  TABLES_CACHE = tables;
  if(tables.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه طاولات مسجّلة لهذا الفرع.</div>'; return; }

  // Specific-table bookings (owner-opt-in, separate from the general FIFO
  // waitlist) show as a small time badge on the table they're actually
  // bound to — the table itself stays fully usable for a walk-in until
  // that reservation is actually seated; this is purely a heads-up.
  const boundResByTable = {};
  if(TABLES_SPECIFIC_BOOKING_ENABLED){
    const horizon = new Date(Date.now() + 18*60*60*1000).toISOString();
    const { data: resData } = await window.supabaseClient.from('table_reservations')
      .select('id, table_id, customer_name, customer_phone, party_size, reserved_for')
      .eq('branch_id', DEVICE.branchId).eq('status', 'upcoming')
      .not('table_id', 'is', null).lte('reserved_for', horizon).order('reserved_for');
    (resData || []).forEach(r => { if(!boundResByTable[r.table_id]) boundResByTable[r.table_id] = r; });
  }

  // Turn-time reuses the active order's own created_at — no seated_at
  // column needed, the order already carries that timestamp. Applies to
  // both "serving" and "awaiting_payment" — the order's been taken either way.
  const orderStartByTable = {};
  if(TABLES_TURN_TIME_ENABLED){
    const activeOrderIds = tables.filter(t => (t.status === 'serving' || t.status === 'awaiting_payment') && t.active_order_id).map(t => t.active_order_id);
    if(activeOrderIds.length){
      const { data: ordersData } = await window.supabaseClient.from('orders').select('id, created_at').in('id', activeOrderIds);
      const createdById = {};
      (ordersData || []).forEach(o => { createdById[o.id] = o.created_at; });
      tables.forEach(t => { if(t.active_order_id && createdById[t.active_order_id]) orderStartByTable[t.id] = createdById[t.active_order_id]; });
    }
  }

  const cardHtml = (t) => {
    let subBadge = '';
    if(t.status === 'awaiting_order' || t.status === 'cleaning'){
      const mins = Math.floor((Date.now() - new Date(t.status_changed_at).getTime()) / 60000);
      subBadge = `<span class="table-turn-timer${turnTimerSeverityClass(mins)}">${elapsedMinutesLabel(t.status_changed_at)}</span>`;
    } else if((t.status === 'serving' || t.status === 'awaiting_payment') && TABLES_TURN_TIME_ENABLED && orderStartByTable[t.id]){
      const mins = Math.floor((Date.now() - new Date(orderStartByTable[t.id]).getTime()) / 60000);
      subBadge = `<span class="table-turn-timer${turnTimerSeverityClass(mins)}">${mins} د</span>`;
    }
    const res = boundResByTable[t.id];
    const resBadge = res ? `<button class="table-reservation-badge" data-res-id="${res.id}" type="button">🕐 ${reservationTimeLabel(res.reserved_for)}</button>` : '';
    return `<div class="table-card ${t.status}" data-id="${t.id}" data-status="${t.status}" role="button" tabindex="0">
      <span class="table-num">${t.number}</span>
      <span class="table-status">${TABLE_STATUS_LABELS[t.status]}</span>
      ${subBadge}
      ${resBadge}
    </div>`;
  };

  const groups = groupTablesForDisplay(tables);
  el.innerHTML = groups.map(g => {
    let html = '';
    if(g.section){
      const availCount = g.tables.filter(t => t.status === 'available').length;
      html += `<div class="tables-section-header"><span>${g.section.name}</span><span class="tables-section-count">${availCount} متاحة من ${g.tables.length}</span></div>`;
    }
    return html + g.tables.map(cardHtml).join('');
  }).join('');

  el.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('.table-reservation-badge')) return;
      const table = tables.find(t => String(t.id) === card.dataset.id);
      if(table) routeTableTap(table);
    });
  });
  el.querySelectorAll('.table-reservation-badge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const table = tables.find(t => String(t.id) === btn.closest('.table-card').dataset.id);
      const res = table && boundResByTable[table.id];
      if(!table || !res) return;
      openBoundReservationSheet(table, res);
    });
  });
}

// A specific-table booking's badge opens straight to "seat now"/"cancel" —
// the table itself is already known, no picker needed (unlike the general
// waitlist's seat flow, which has to ask which now-free table to use).
function openBoundReservationSheet(table, res){
  resetModalStack(() => renderBoundReservationSheet(table, res));
  paymentModal.classList.add('show');
}

function renderBoundReservationSheet(table, res){
  document.getElementById('paymentModalTitle').textContent = 'حجز طاولة ' + table.number;
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">${escapeHtml(res.customer_name)} — ${res.party_size} أشخاص — ${reservationTimeLabel(res.reserved_for)}</p>
    ${res.customer_phone ? `<p class="pos-modal-hint">الجوال: <span class="mono">${escapeHtml(res.customer_phone)}</span></p>` : ''}
    ${table.status === 'cleaning' ? `<p class="pos-modal-hint" style="color:var(--amber);">🧹 هذي الطاولة تحتاج تنظيف</p>` : ''}
    <button class="confirm-pay-btn" id="brSeatBtn">بدء الجلسة الآن</button>
    <button class="loyalty-otp-back" id="brCancelBtn">إلغاء الحجز</button>
  `;
  document.getElementById('brSeatBtn').addEventListener('click', async () => {
    if(table.status === 'cleaning' && !window.confirm('طاولة ' + table.number + ' تحتاج تنظيف — تأكيد الجلوس فيها؟')) return;
    const { error } = await window.supabaseClient.rpc('seat_waitlist_entry', { p_reservation_id: res.id, p_table_id: table.id });
    if(error){ showToast('تعذر بدء الجلسة — تحقق من حالة الطاولة'); closePaymentModalNow(); renderTables(); return; }
    showToast('طاولة ' + table.number + ' — بانتظار الطلب');
    closePaymentModalNow();
    renderTables();
  });
  document.getElementById('brCancelBtn').addEventListener('click', async () => {
    if(!window.confirm('تأكيد إلغاء الحجز؟')) return;
    await window.supabaseClient.from('table_reservations').update({status: 'cancelled'}).eq('id', res.id);
    showToast('تم إلغاء الحجز');
    closePaymentModalNow();
    renderTables();
  });
}

/* ============ Table tap-router — one meaning per status, no blind cycling.
   All state-changing updates are guarded (.eq('status', expectedCurrent))
   so two devices tapping the same table within the same instant can't both
   "win" — the loser gets a clear toast instead of a silently wrong state. ============ */
async function routeTableTap(table){
  if(table.status === 'available') return seatWalkInAtTable(table);
  if(table.status === 'awaiting_order') return openAwaitingOrderSheet(table);
  if(table.status === 'serving') return openServingSheet(table);
  if(table.status === 'awaiting_payment') return openAwaitingPaymentSheet(table);
  if(table.status === 'reserved') return openManualReservedSheet(table);
  if(table.status === 'cleaning') return markTableCleaned(table);
}

// Seating is its own moment, separate from taking the order — the guest
// sits down and looks at the menu before anyone's ready to register
// anything. Stays on the Tables screen; a second tap (now "بانتظار الطلب")
// is what actually opens the product screen.
async function seatWalkInAtTable(table){
  const { data, error } = await window.supabaseClient.from('restaurant_tables')
    .update({status: 'awaiting_order'}).eq('id', table.id).eq('status', 'available').select('id');
  if(error || !data || !data.length){ showToast('طاولة ' + table.number + ' انشغلت للتو'); renderTables(); return; }
  showToast('طاولة ' + table.number + ' — بانتظار الطلب');
  renderTables();
}

function beginOrderForTable(table){
  state.selectedTableId = table.id;
  state.selectedOrderId = null;
  updateTableBadge();
  closePaymentModalNow();
  showToast('تسجيل طلب — طاولة ' + table.number);
  document.querySelector('.nav-tab[data-screen="home"]').click();
}

// No order exists yet at this stage, so the only real edge case is "seated
// by mistake / guest left before ordering" — a plain release, no money and
// nothing to move.
function openAwaitingOrderSheet(table){
  resetModalStack(() => renderAwaitingOrderSheet(table));
  paymentModal.classList.add('show');
}

function renderAwaitingOrderSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — بانتظار الطلب';
  // Host mode manages seating only — actual order-taking happens later on
  // the real cashier POS, once they check the table themselves.
  paymentModalBody.innerHTML = `
    ${HOST_MODE ? '' : '<button class="confirm-pay-btn" id="aoTakeOrderBtn">تسجيل الطلب</button>'}
    <button class="${HOST_MODE ? 'confirm-pay-btn' : 'loyalty-otp-back'}" id="aoReleaseBtn">إفراغ الطاولة</button>
  `;
  const takeOrderBtn = document.getElementById('aoTakeOrderBtn');
  if(takeOrderBtn) takeOrderBtn.addEventListener('click', () => beginOrderForTable(table));
  document.getElementById('aoReleaseBtn').addEventListener('click', async () => {
    if(!window.confirm('تأكيد إفراغ طاولة ' + table.number + '؟')) return;
    const { data, error } = await window.supabaseClient.from('restaurant_tables')
      .update({status: 'cleaning'}).eq('id', table.id).eq('status', 'awaiting_order').select('id');
    if(error || !data || !data.length){ showToast('تعذر التحديث'); return; }
    showToast('طاولة ' + table.number + ' — تحتاج تنظيف');
    closePaymentModalNow();
    renderTables();
  });
}

// A "serving" table already has a real, kitchen-printed order — tapping it
// never jumps straight into a fresh cart (that would silently create a
// second, disconnected order for the same table). Offers everything that
// makes sense once an order is genuinely in flight: add more, pay, move the
// party to a different table, or void the whole thing if it walked out.
async function openServingSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — قيد التقديم';
  paymentModalBody.innerHTML = `<p class="pos-modal-hint">جارٍ التحميل...</p>`;
  paymentModal.classList.add('show');
  const { data: order } = await window.supabaseClient.from('orders')
    .select('id, total').eq('id', table.active_order_id).maybeSingle();
  if(!order){ showToast('تعذر تحميل الطلب'); closePaymentModalNow(); renderTables(); return; }
  resetModalStack(() => renderServingSheet(table, order));
}

function renderServingSheet(table, order){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — قيد التقديم';
  paymentModalBody.innerHTML = `
    <div class="due-display"><div class="due-label">إجمالي الطلب حتى الآن</div><div class="due-amount mono">${Number(order.total).toFixed(2)}</div></div>
    ${HOST_MODE ? '' : `
    <button class="confirm-pay-btn" id="servingAddItemsBtn">+ إضافة أصناف</button>
    <button class="loyalty-otp-back" id="servingPayBtn">الدفع</button>`}
    <button class="loyalty-otp-back" id="servingMoveBtn">تغيير الطاولة</button>
    <button class="loyalty-otp-back" id="servingCancelBtn" style="color:var(--danger);">إلغاء الطلب</button>
  `;
  const addItemsBtn = document.getElementById('servingAddItemsBtn');
  if(addItemsBtn) addItemsBtn.addEventListener('click', () => {
    state.selectedTableId = table.id;
    state.selectedOrderId = table.active_order_id;
    updateTableBadge();
    closePaymentModalNow();
    document.querySelector('.nav-tab[data-screen="home"]').click();
  });
  const payBtnEl = document.getElementById('servingPayBtn');
  if(payBtnEl) payBtnEl.addEventListener('click', () => {
    closePaymentModalNow();
    resumePaymentForTable(table);
  });
  document.getElementById('servingMoveBtn').addEventListener('click', () => openModalStep(() => renderMoveTableStep(table, order.id)));
  document.getElementById('servingCancelBtn').addEventListener('click', () => confirmCancelOrder(table, order.id));
}

// A table waiting to close out its bill gets the same escape hatches as
// "serving" — a party doesn't stop being movable/cancellable just because
// the cashier already opened the payment step once.
async function openAwaitingPaymentSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — بانتظار الدفع';
  paymentModalBody.innerHTML = `<p class="pos-modal-hint">جارٍ التحميل...</p>`;
  paymentModal.classList.add('show');
  const { data: order } = await window.supabaseClient.from('orders')
    .select('id, total').eq('id', table.active_order_id).maybeSingle();
  if(!order){ showToast('تعذر تحميل الطلب'); closePaymentModalNow(); renderTables(); return; }
  resetModalStack(() => renderAwaitingPaymentSheet(table, order));
}

function renderAwaitingPaymentSheet(table, order){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — بانتظار الدفع';
  paymentModalBody.innerHTML = `
    <div class="due-display"><div class="due-label">إجمالي الطلب</div><div class="due-amount mono">${Number(order.total).toFixed(2)}</div></div>
    ${HOST_MODE ? '' : '<button class="confirm-pay-btn" id="apContinueBtn">متابعة الدفع</button>'}
    <button class="loyalty-otp-back" id="apMoveBtn">تغيير الطاولة</button>
    <button class="loyalty-otp-back" id="apCancelBtn" style="color:var(--danger);">إلغاء الطلب</button>
  `;
  const continueBtn = document.getElementById('apContinueBtn');
  if(continueBtn) continueBtn.addEventListener('click', () => resumePaymentForTable(table));
  document.getElementById('apMoveBtn').addEventListener('click', () => openModalStep(() => renderMoveTableStep(table, order.id)));
  document.getElementById('apCancelBtn').addEventListener('click', () => confirmCancelOrder(table, order.id));
}

// Shared by both "serving" and "بانتظار الدفع" sheets — carries the order to
// a different table via move_table_order (server-side, keeps the old
// table's live status instead of guessing) rather than two separate client
// writes that could land half-done on a network blip.
function renderMoveTableStep(fromTable, orderId){
  document.getElementById('paymentModalTitle').textContent = 'نقل طاولة ' + fromTable.number + ' — اختر الوجهة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('restaurant_tables').select('*')
    .eq('branch_id', DEVICE.branchId).eq('status', 'available').order('number')
    .then(({data}) => {
      const tables = data || [];
      if(!tables.length){ paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه طاولات متاحة الحين.</p>`; return; }
      const groups = groupTablesForDisplay(tables);
      let html = `<div class="table-picker-grid">`;
      groups.forEach(g => {
        if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}</span></div>`;
        html += g.tables.map(t => `<button type="button" class="table-picker-btn" data-id="${t.id}" data-number="${t.number}">${t.number}</button>`).join('');
      });
      html += `</div>`;
      paymentModalBody.innerHTML = html;
      document.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const newTableId = Number(btn.dataset.id);
          const { error } = await window.supabaseClient.rpc('move_table_order', { p_order_id: orderId, p_new_table_id: newTableId });
          if(error){ showToast('تعذر النقل — تحقق من حالة الطاولة'); return; }
          showToast('تم النقل لطاولة ' + btn.dataset.number);
          closePaymentModalNow();
          renderTables();
        });
      });
    });
}

// Voiding a real, unpaid order (walked out, mistake) is manager-PIN gated —
// same convention as shift close and refunds — since it's the one action
// here with real money written off. Never reverses stock (see the RPC's
// own comment for why).
function confirmCancelOrder(table, orderId){
  if(!window.confirm('تأكيد إلغاء طلب طاولة ' + table.number + '؟')) return;
  // Same distinction as the Home-screen cancel button: "hold off a bit"
  // should leave the table waiting for a real order, not send it to cleaning.
  const stillOccupied = window.confirm('هل الزبائن لسا قاعدين على طاولة ' + table.number + ' ويحتاجون وقت أطول؟\nموافق = نعم لسا قاعدين — إلغاء = لا، غادروا');
  openPinModal(async () => {
    const { error } = await window.supabaseClient.rpc('cancel_dine_in_order', { p_order_id: orderId, p_still_occupied: stillOccupied });
    if(error){ showToast('تعذر الإلغاء'); return; }
    showToast(stillOccupied ? 'تراجعنا عن الطلب — بانتظار الطلب' : 'تم إلغاء الطلب — الطاولة بحاجة تنظيف');
    closePaymentModalNow();
    renderTables();
  });
}

async function resumePaymentForTable(table){
  const { error: flipError } = await window.supabaseClient.from('restaurant_tables')
    .update({status: 'awaiting_payment'}).eq('id', table.id).in('status', ['serving','awaiting_payment']);
  const orderId = table.active_order_id;
  if(flipError || !orderId){ showToast('تعذر فتح الدفع لهذي الطاولة'); renderTables(); return; }

  const [{ data: order }, { data: items }] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).maybeSingle(),
    window.supabaseClient.from('order_items').select('menu_item_id, qty, unit_price, line_total, selected_modifiers').eq('order_id', orderId)
  ]);
  if(!order){ showToast('تعذر تحميل تفاصيل الطلب'); renderTables(); return; }

  state.resumingOrder = {
    id: order.id, table_id: order.table_id,
    subtotal: order.subtotal, discount_amount: order.discount_amount, vat_amount: order.vat_amount, total: order.total,
    items: (items||[]).map(it => {
      const p = PRODUCTS.find(x=>x.id===it.menu_item_id);
      return { name: p ? p.name : ('منتج #' + it.menu_item_id), qty: it.qty, unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total), mods: (it.selected_modifiers||[]).map(m=>m.text) };
    })
  };
  state.activePaymentMethod = 'cash';
  state.cashAmount = 0;
  state.splitCardAmount = 0;
  resetModalStack(renderPaymentStep);
  document.getElementById('paymentModalTitle').textContent = 'الدفع — طاولة ' + table.number;
  paymentModal.classList.add('show');
}

async function markTableCleaned(table){
  const { data, error } = await window.supabaseClient.from('restaurant_tables')
    .update({status: 'available'}).eq('id', table.id).eq('status', 'cleaning').select('id');
  if(error || !data || !data.length){ showToast('تعذر تحديث حالة الطاولة'); return; }
  showToast('طاولة ' + table.number + ' — جاهزة الآن');
  renderTables();
}

// A table sitting at status='reserved' today only got there through the old
// pre-redesign blind status-cycle (real bookings live entirely in the
// waitlist below and never touch .status) — kept as a two-way escape hatch
// so any table already in that state isn't stranded.
function openManualReservedSheet(table){
  resetModalStack(() => renderManualReservedSheet(table));
  paymentModal.classList.add('show');
}

function renderManualReservedSheet(table){
  document.getElementById('paymentModalTitle').textContent = 'طاولة ' + table.number + ' — محجوزة';
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">هذي الطاولة محجوزة يدويًا (حالة قديمة).</p>
    <button class="confirm-pay-btn" id="manualSeatBtn">بدء الجلسة</button>
    <button class="loyalty-otp-back" id="manualFreeBtn">إلغاء الحجز</button>
  `;
  document.getElementById('manualSeatBtn').addEventListener('click', async () => {
    const { data, error } = await window.supabaseClient.from('restaurant_tables')
      .update({status: 'awaiting_order'}).eq('id', table.id).eq('status', 'reserved').select('id');
    if(error || !data || !data.length){ showToast('تعذر بدء الجلسة'); closePaymentModalNow(); renderTables(); return; }
    showToast('طاولة ' + table.number + ' — بانتظار الطلب');
    closePaymentModalNow();
    renderTables();
  });
  document.getElementById('manualFreeBtn').addEventListener('click', async () => {
    await window.supabaseClient.from('restaurant_tables').update({status: 'available'}).eq('id', table.id).eq('status', 'reserved');
    showToast('تم إلغاء الحجز — الطاولة متاحة');
    closePaymentModalNow();
    renderTables();
  });
}

/* ============ قائمة الانتظار — walk-in waitlist ============
   A waitlist entry is NOT bound to a table at creation (that's the whole
   point — first-come, first-served for whichever table frees up next, not
   a claim on one particular table). reserved_for defaults to "now" for a
   walk-in and can be pushed later for a genuine advance phone booking —
   either way the list sorts by it, so both cases interleave correctly in
   one queue instead of needing two separate systems. ============ */
const WAITLIST_PARTY_PRESETS = [2, 3, 4, 5, 6, 8];

let WAITLIST_CACHE = [];
let REMINDERS_CACHE = [];
async function renderWaitlist(){
  const el = document.getElementById('waitlistList');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  // A busy night's queue realistically resolves throughout the day (seated,
  // no-show, cancelled all leave 'upcoming'), so this is never expected to
  // approach the cap — it's a backstop against a truly degenerate case
  // (months of unresolved test data), not a real ceiling on how many
  // people the queue can genuinely hold at once. Findability at real scale
  // comes from the search box below, not from hiding rows.
  // Every other business type's waitlist is purely "who's waiting to be
  // seated" — a row resolves (seated/no_show/cancelled) and leaves the list
  // for good. تفصيل orders need to stay visible through two more real
  // stages (seated == in progress, ready_for_pickup == done) so staff don't
  // lose track of a garment mid-shop; other types never produce those
  // statuses in the first place, so this widened filter is a no-op for them.
  const waitlistStatuses = isTailoringBusiness() ? ['upcoming', 'seated', 'ready_for_pickup'] : ['upcoming'];
  const { data } = await window.supabaseClient.from('table_reservations')
    .select('id, customer_name, customer_phone, party_size, reserved_for, preferred_section_id, created_at, customer_lat, customer_lng, customer_address_text, status')
    .eq('branch_id', DEVICE.branchId).in('status', waitlistStatuses).order('reserved_for').limit(1000);
  WAITLIST_CACHE = data || [];
  const searchInput = document.getElementById('waitlistSearchInput');
  if(searchInput) searchInput.value = '';
  renderWaitlistList(WAITLIST_CACHE);
}

// Filtering client-side (not a fresh query) — the whole point is instant,
// no-network feedback while typing, and 200 rows is trivial to filter in
// the browser. Re-run any time the search box changes.
document.getElementById('waitlistSearchInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim();
  if(!q){ renderWaitlistList(WAITLIST_CACHE); return; }
  const filtered = WAITLIST_CACHE.filter(r =>
    r.customer_name.includes(q) || (r.customer_phone && r.customer_phone.includes(q))
  );
  renderWaitlistList(filtered, q);
});

function renderWaitlistList(list, activeQuery){
  const el = document.getElementById('waitlistList');
  const countBadge = document.getElementById('waitlistCount');
  countBadge.style.display = WAITLIST_CACHE.length ? '' : 'none';
  countBadge.textContent = WAITLIST_CACHE.length;
  if(!WAITLIST_CACHE.length){ el.innerHTML = '<div class="list-empty">ما فيه أحد بقائمة الانتظار الآن.</div>'; return; }
  if(!list.length){ el.innerHTML = `<div class="list-empty">ما فيه نتائج لـ"${escapeHtml(activeQuery)}".</div>`; return; }

  el.innerHTML = list.map((r) => {
    const i = WAITLIST_CACHE.indexOf(r);
    const section = TABLE_SECTIONS_LIST.find(s => s.id === r.preferred_section_id);
    const isLate = (Date.now() - new Date(r.reserved_for).getTime()) > 20 * 60000;
    // A future booking's reserved_for sits meaningfully later than when it
    // was added — a walk-in's is the same moment. Show whichever fact is
    // actually informative instead of always repeating "الآن".
    const isAdvanceBooking = (new Date(r.reserved_for).getTime() - new Date(r.created_at).getTime()) > 5 * 60000;
    const telUrl = r.customer_phone ? `tel:${r.customer_phone}` : null;
    const waUrl = r.customer_phone ? waPhoneUrl(r.customer_phone, `مرحبا ${r.customer_name}، طاولتك جاهزة الآن في ${DEVICE.branchName || ''}`) : null;
    // mobile_car_wash bookings have no physical resource to seat into
    // (hasNoPhysicalResource()) — a "الموقع" map link replaces the section
    // pill, and "بدء الخدمة" replaces "جلّسه" (dispatches the team via
    // start_mobile_service() instead of opening the table picker).
    const hasLocation = r.customer_lat != null && r.customer_lng != null;
    const mapUrl = hasLocation ? `https://maps.google.com/?q=${r.customer_lat},${r.customer_lng}` : null;
    const noResource = hasNoPhysicalResource();
    const tailoring = isTailoringBusiness();
    // Only tailoring ever produces a 'seated'/'ready_for_pickup' row here
    // (see the widened waitlistStatuses filter above) — every other
    // business type's rows are always 'upcoming', so this whole branch is
    // dead weight for them, same as the noResource check already is.
    let actionBtnHtml;
    if(tailoring && r.status === 'seated'){
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-mark-ready-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">جاهز للاستلام</button>`;
    } else if(tailoring && r.status === 'ready_for_pickup'){
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-complete-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تسليم للعميل</button>`;
    } else if(noResource){
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-start-service-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">${tailoring ? 'بدء التفصيل' : 'بدء الخدمة'}</button>`;
    } else {
      actionBtnHtml = `<button type="button" class="confirm-pay-btn wl-seat-btn" data-id="${r.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">جلّسه</button>`;
    }
    return `<div class="waitlist-card ${isLate ? 'late' : ''}" data-id="${r.id}">
      <div class="wl-card-top">
        <span class="wl-rank">${i+1}</span>
        <div class="wl-name-block">
          <div class="wl-name">${escapeHtml(r.customer_name)}</div>
          ${r.customer_phone ? `<div class="wl-phone mono">${escapeHtml(r.customer_phone)}</div>` : ''}
        </div>
        <span class="wl-wait-badge ${isLate ? 'late' : ''}">${isAdvanceBooking ? reservationTimeLabel(r.reserved_for) : elapsedMinutesLabel(r.created_at)}</span>
      </div>
      <div class="wl-card-meta">
        ${tailoring ? `<span class="wl-pill${r.status==='ready_for_pickup'?' ready':''}">${escapeHtml(TAILORING_STATUS_LABELS[r.status] || r.status)}</span>` : ''}
        ${noResource ? '' : `<span class="wl-pill">${r.party_size} أشخاص</span>`}
        ${section ? `<span class="wl-pill">يفضل ${escapeHtml(section.name)}</span>` : ''}
        ${r.customer_address_text ? `<span class="wl-pill">${escapeHtml(r.customer_address_text)}</span>` : ''}
        ${isAdvanceBooking ? `<span class="wl-pill">حجز مسبق</span>` : ''}
        ${isLate ? `<span class="wl-pill late">متأخر</span>` : ''}
      </div>
      <div class="wl-actions">
        ${telUrl ? `<a href="${escapeHtml(telUrl)}" class="wl-contact-btn" title="اتصال">📞</a>` : ''}
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="واتساب">💬</a>` : ''}
        ${mapUrl ? `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="الموقع">📍</a>` : ''}
        ${actionBtnHtml}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.wl-seat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = list.find(r => String(r.id) === btn.dataset.id);
      if(entry) openWaitlistSeatPicker(entry);
    });
  });
  el.querySelectorAll('.wl-start-service-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('start_mobile_service', { p_reservation_id: parseInt(btn.dataset.id, 10) });
        if(error) throw error;
        showToast(isTailoringBusiness() ? 'تم بدء التفصيل' : 'تم بدء الخدمة — الفريق في الطريق');
        renderWaitlist();
      } catch(err){
        showToast('تعذر البدء: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('.wl-mark-ready-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('mark_reservation_ready', { p_reservation_id: parseInt(btn.dataset.id, 10) });
        if(error) throw error;
        showToast('تم تجهيز الطلب — جاهز للاستلام');
        renderWaitlist();
      } catch(err){
        showToast('تعذر التحديث: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('.wl-complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { error } = await window.supabaseClient.rpc('complete_reservation', { p_reservation_id: parseInt(btn.dataset.id, 10) });
        if(error) throw error;
        showToast('تم تسليم الطلب للعميل');
        renderWaitlist();
      } catch(err){
        showToast('تعذر التحديث: ' + (err && err.message ? err.message : 'خطأ غير متوقع'));
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll('.waitlist-card').forEach(row => {
    row.addEventListener('click', (e) => {
      if(e.target.closest('.wl-seat-btn') || e.target.closest('.wl-contact-btn') || e.target.closest('.wl-start-service-btn')
        || e.target.closest('.wl-mark-ready-btn') || e.target.closest('.wl-complete-btn')) return;
      const entry = list.find(r => String(r.id) === row.dataset.id);
      if(entry) renderWaitlistDetailStep(entry);
    });
  });
}

// Free WhatsApp reminders (see approved plan) — no Business API send, since
// that's metered per-message (Meta's July 2025 pricing change) and would
// bill Rakeen's own shared number, not the individual business. Instead:
// two windows (day-before, 2-hours-before) computed live from
// table_reservations; staff taps a wa.me link that opens THEIR OWN
// WhatsApp app — zero cost, ordinary person-to-person message — then marks
// that specific reminder handled so it stops reappearing.
async function renderReminders(){
  const el = document.getElementById('remindersList');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient.from('table_reservations')
    .select('id, customer_name, customer_phone, reserved_for, service_id, reminder_day_before_sent, reminder_hours_before_sent')
    .eq('branch_id', DEVICE.branchId).eq('status', 'upcoming')
    .gt('reserved_for', new Date().toISOString())
    .order('reserved_for').limit(1000);

  const now = Date.now();
  const tomorrowStr = new Date(now + 24 * 60 * 60000).toDateString();
  const items = [];
  (data || []).forEach(r => {
    const t = new Date(r.reserved_for).getTime();
    if(!r.reminder_day_before_sent && new Date(r.reserved_for).toDateString() === tomorrowStr){
      items.push({...r, kind: 'day_before', label: 'تذكير قبل يوم'});
    }
    if(!r.reminder_hours_before_sent && t > now && t - now <= 2 * 60 * 60000){
      items.push({...r, kind: 'hours_before', label: 'تذكير قبل ساعتين'});
    }
  });
  REMINDERS_CACHE = items;

  const countBadge = document.getElementById('remindersCount');
  countBadge.style.display = items.length ? '' : 'none';
  countBadge.textContent = items.length;
  if(!items.length){ el.innerHTML = '<div class="list-empty">ما فيه أحد يحتاج تذكير الآن.</div>'; return; }

  el.innerHTML = items.map((r, i) => {
    const service = PRODUCTS.find(p => p.id === r.service_id);
    const waMessage = `مرحبا ${r.customer_name}، تذكير بموعدك${service ? ' (' + service.name + ')' : ''} الساعة ${reservationTimeLabel(r.reserved_for)}${DEVICE.branchName ? ' في ' + DEVICE.branchName : ''}.`;
    const waUrl = r.customer_phone ? waPhoneUrl(r.customer_phone, waMessage) : null;
    return `<div class="waitlist-card" data-idx="${i}">
      <div class="wl-card-top">
        <div class="wl-name-block">
          <div class="wl-name">${escapeHtml(r.customer_name)}</div>
          ${r.customer_phone ? `<div class="wl-phone mono">${escapeHtml(r.customer_phone)}</div>` : ''}
        </div>
        <span class="wl-wait-badge">${reservationTimeLabel(r.reserved_for)}</span>
      </div>
      <div class="wl-card-meta">
        <span class="wl-pill">${escapeHtml(r.label)}</span>
        ${service ? `<span class="wl-pill">${escapeHtml(service.name)}</span>` : ''}
      </div>
      <div class="wl-actions">
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="واتساب">💬</a>` : '<span></span>'}
        <button type="button" class="confirm-pay-btn reminder-sent-btn" data-idx="${i}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تم التذكير ✓</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.reminder-sent-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = items[parseInt(btn.dataset.idx, 10)];
      const field = r.kind === 'day_before' ? 'reminder_day_before_sent' : 'reminder_hours_before_sent';
      await window.supabaseClient.from('table_reservations').update({ [field]: true }).eq('id', r.id);
      showToast('تم تسجيل التذكير');
      renderReminders();
    });
  });
}

function renderWaitlistDetailStep(entry){
  document.getElementById('paymentModalTitle').textContent = entry.customer_name;
  const section = TABLE_SECTIONS_LIST.find(s => s.id === entry.preferred_section_id);
  const noResource = hasNoPhysicalResource();
  const tailoring = isTailoringBusiness();
  const mapUrl = (entry.customer_lat != null && entry.customer_lng != null) ? `https://maps.google.com/?q=${entry.customer_lat},${entry.customer_lng}` : null;
  // A tailoring order past 'upcoming' is already in progress — "لم يحضر"
  // (no-show) only makes sense while still waiting to be started.
  const showNoShow = entry.status === 'upcoming';
  let primaryLabel, primaryAction;
  if(tailoring && entry.status === 'seated'){
    primaryLabel = 'جاهز للاستلام';
    primaryAction = 'mark_reservation_ready';
  } else if(tailoring && entry.status === 'ready_for_pickup'){
    primaryLabel = 'تسليم للعميل';
    primaryAction = 'complete_reservation';
  } else if(noResource){
    primaryLabel = tailoring ? 'بدء التفصيل' : 'بدء الخدمة';
    primaryAction = 'start_mobile_service';
  } else {
    primaryLabel = 'جلّسه';
    primaryAction = null; // opens the table picker instead of an RPC call
  }
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">${tailoring ? escapeHtml(TAILORING_STATUS_LABELS[entry.status] || '') + ' — ' : (noResource ? '' : entry.party_size + ' أشخاص')}${section ? ' — يفضل ' + escapeHtml(section.name) : ''} — ${reservationTimeLabel(entry.reserved_for)}</p>
    ${entry.customer_phone ? `<p class="pos-modal-hint">الجوال: <span class="mono">${escapeHtml(entry.customer_phone)}</span></p>` : ''}
    ${entry.customer_address_text ? `<p class="pos-modal-hint">العنوان: ${escapeHtml(entry.customer_address_text)}</p>` : ''}
    ${mapUrl ? `<p class="pos-modal-hint"><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">📍 فتح الموقع على الخريطة</a></p>` : ''}
    <button class="confirm-pay-btn" id="wlDetailSeatBtn">${primaryLabel}</button>
    ${showNoShow ? `<button class="loyalty-otp-back" id="wlDetailNoShowBtn">لم يحضر</button>` : ''}
  `;
  document.getElementById('wlDetailSeatBtn').addEventListener('click', async () => {
    if(primaryAction){
      const { error } = await window.supabaseClient.rpc(primaryAction, { p_reservation_id: entry.id });
      if(error){ showToast('تعذر التحديث: ' + error.message); return; }
      showToast('تم التحديث');
      closePaymentModalNow();
      renderWaitlist();
    } else {
      openWaitlistSeatPicker(entry);
    }
  });
  const noShowBtn = document.getElementById('wlDetailNoShowBtn');
  if(noShowBtn) noShowBtn.addEventListener('click', async () => {
    if(!window.confirm('تأكيد إن العميل ما حضر؟')) return;
    await window.supabaseClient.from('table_reservations').update({status: 'no_show'}).eq('id', entry.id);
    showToast('تم تسجيل عدم الحضور');
    closePaymentModalNow();
    renderWaitlist();
  });
}

/* ============ Hotel (roadmap item 7) — الاستقبال ============
   Reuses the exact #tablesFloorPane/#tablesWaitlistPane containers
   restaurant floor/waitlist rendering uses (relabeled "الغرف"/"الحجوزات"
   above), but with two brand-new render functions and two new tables
   (hotel_rooms/hotel_bookings) — table_reservations/restaurant_tables are
   timestamptz/dine-in-order-specific and don't fit a multi-night date-range
   stay. Room TYPES are ordinary `services` rows (isServiceBusiness()
   already includes 'hotel'), so they already show up in PRODUCTS/SERVICES
   with zero extra code — this block only deals with physical rooms and
   bookings. Checkout reuses the entire existing cart/payment/
   complete_pos_order pipeline unmodified (see the completePayment() hook
   below) — no new payment code anywhere in this feature. */
let hotelRealtimeChannel = null;

function renderHotelActiveTab(){
  if(tablesActiveTab === 'waitlist') renderHotelBookingsList();
  else renderHotelRoomsGrid();
}

function hotelRoomTypeName(serviceId){
  const p = PRODUCTS.find(p => p.isService && -p.id === serviceId);
  return p ? p.name : 'نوع غير معروف';
}

async function renderHotelRoomsGrid(){
  const el = document.getElementById('tablesGrid');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient
    .from('hotel_rooms').select('*').eq('branch_id', DEVICE.branchId).eq('active', true).order('room_number');
  const rooms = data || [];
  HOTEL_ROOMS_CACHE = rooms;
  if(rooms.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه غرف مسجّلة لهذا الفرع — أضفها من لوحة التحكم.</div>'; return; }

  const legendHtml = `<div class="table-legend">
    <div class="legend-item"><span class="legend-dot" style="background:var(--surf2);"></span>متاحة</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--lime);"></span>مشغولة</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--muted);"></span>تنظيف</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--danger);"></span>صيانة</div>
  </div>`;

  el.innerHTML = legendHtml + rooms.map(r => {
    const mins = Math.floor((Date.now() - new Date(r.status_changed_at).getTime()) / 60000);
    const subBadge = (r.status === 'cleaning' || r.status === 'maintenance')
      ? `<span class="table-turn-timer${turnTimerSeverityClass(mins)}">${elapsedMinutesLabel(r.status_changed_at)}</span>` : '';
    return `<div class="table-card ${r.status}" data-id="${r.id}" data-status="${r.status}" role="button" tabindex="0">
      <span class="table-num">${r.room_number}</span>
      <span class="table-status">${HOTEL_ROOM_STATUS_LABELS[r.status] || r.status}</span>
      ${subBadge}
      <span class="table-reservation-badge" style="pointer-events:none;">${hotelRoomTypeName(r.room_type_service_id)}</span>
    </div>`;
  }).join('');

  el.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', () => {
      const room = rooms.find(r => String(r.id) === card.dataset.id);
      if(room) openHotelRoomActionSheet(room);
    });
  });
}

function openHotelRoomActionSheet(room){
  resetModalStack(() => renderHotelRoomActionSheet(room));
  paymentModal.classList.add('show');
}

function renderHotelRoomActionSheet(room){
  document.getElementById('paymentModalTitle').textContent = 'غرفة ' + room.room_number;
  const actions = [];
  if(room.status === 'cleaning' || room.status === 'maintenance'){
    actions.push({label:'وضعها متاحة', next:'available'});
  }
  if(room.status === 'available'){
    actions.push({label:'وضعها تحت الصيانة', next:'maintenance'});
  }
  paymentModalBody.innerHTML = `
    <p class="pos-modal-hint">${hotelRoomTypeName(room.room_type_service_id)} — ${HOTEL_ROOM_STATUS_LABELS[room.status] || room.status}</p>
    ${actions.map(a => `<button class="confirm-pay-btn" data-next="${a.next}" style="margin-top:8px;">${a.label}</button>`).join('')}
  `;
  paymentModalBody.querySelectorAll('button[data-next]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await window.supabaseClient.from('hotel_rooms').update({ status: btn.dataset.next }).eq('id', room.id);
      if(error){ showToast('تعذر التحديث'); btn.disabled = false; return; }
      showToast('تم التحديث');
      closePaymentModalNow();
      renderHotelRoomsGrid();
    });
  });
}

async function renderHotelBookingsList(){
  const el = document.getElementById('waitlistList');
  const countBadge = document.getElementById('waitlistCount');
  el.innerHTML = '<div class="list-empty">جارٍ التحميل...</div>';
  const { data } = await window.supabaseClient.from('hotel_bookings')
    .select('id, room_type_service_id, guest_name, guest_phone, check_in_date, check_out_date, nights, rate_per_night, status, created_at')
    .eq('branch_id', DEVICE.branchId).in('status', ['upcoming','checked_in']).order('check_in_date');
  const bookings = data || [];
  HOTEL_BOOKINGS_CACHE = bookings;
  countBadge.style.display = bookings.length ? '' : 'none';
  countBadge.textContent = bookings.length;
  if(bookings.length === 0){ el.innerHTML = '<div class="list-empty">ما فيه حجوزات حالياً.</div>'; return; }

  el.innerHTML = bookings.map(b => {
    const telUrl = b.guest_phone ? `tel:${b.guest_phone}` : null;
    const waUrl = b.guest_phone ? waPhoneUrl(b.guest_phone, `مرحبا ${b.guest_name}، بخصوص حجزكم في ${DEVICE.branchName || ''}`) : null;
    const actionBtn = b.status === 'upcoming'
      ? `<button type="button" class="confirm-pay-btn wl-hotel-checkin-btn" data-id="${b.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تسجيل الوصول</button>`
      : `<button type="button" class="confirm-pay-btn wl-hotel-checkout-btn" data-id="${b.id}" style="width:auto; padding:8px 16px; font-size:12px; margin-inline-start:auto;">تسجيل المغادرة</button>`;
    return `<div class="waitlist-card" data-id="${b.id}">
      <div class="wl-card-top">
        <div class="wl-name-block">
          <div class="wl-name">${escapeHtml(b.guest_name)}</div>
          ${b.guest_phone ? `<div class="wl-phone mono">${escapeHtml(b.guest_phone)}</div>` : ''}
        </div>
        <span class="wl-wait-badge">${escapeHtml(HOTEL_BOOKING_STATUS_LABELS[b.status] || b.status)}</span>
      </div>
      <div class="wl-card-meta">
        <span class="wl-pill">${escapeHtml(hotelRoomTypeName(b.room_type_service_id))}</span>
        <span class="wl-pill">${b.check_in_date} → ${b.check_out_date} (${b.nights} ليالي)</span>
      </div>
      <div class="wl-actions">
        ${telUrl ? `<a href="${escapeHtml(telUrl)}" class="wl-contact-btn" title="اتصال">📞</a>` : ''}
        ${waUrl ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" class="wl-contact-btn" title="واتساب">💬</a>` : ''}
        ${actionBtn}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.wl-hotel-checkin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const booking = bookings.find(b => String(b.id) === btn.dataset.id);
      if(booking) openHotelCheckinRoomPicker(booking);
    });
  });
  el.querySelectorAll('.wl-hotel-checkout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const booking = bookings.find(b => String(b.id) === btn.dataset.id);
      if(booking) startHotelCheckout(booking);
    });
  });
}

function openHotelCheckinRoomPicker(booking){
  resetModalStack(() => renderHotelCheckinRoomPickerStep(booking));
  paymentModal.classList.add('show');
}

function renderHotelCheckinRoomPickerStep(booking){
  document.getElementById('paymentModalTitle').textContent = 'تسجيل وصول ' + booking.guest_name + ' — اختر غرفة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('hotel_rooms').select('*')
    .eq('branch_id', DEVICE.branchId).eq('room_type_service_id', booking.room_type_service_id)
    .eq('status', 'available').eq('active', true).order('room_number')
    .then(({data}) => {
      const rooms = data || [];
      if(!rooms.length){
        paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه غرف متاحة من هذا النوع الحين.</p>`;
        return;
      }
      paymentModalBody.innerHTML = `<div class="table-picker-grid">${rooms.map(r =>
        `<button type="button" class="table-picker-btn" data-id="${r.id}" data-number="${r.room_number}">${r.room_number}</button>`
      ).join('')}</div>`;
      paymentModalBody.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const { error } = await window.supabaseClient.rpc('checkin_hotel_booking', { p_booking_id: booking.id, p_room_id: Number(btn.dataset.id) });
          if(error){ showToast('تعذر تسجيل الوصول: ' + error.message); renderHotelCheckinRoomPickerStep(booking); return; }
          showToast('تم تسجيل الوصول — غرفة ' + btn.dataset.number);
          closePaymentModalNow();
          renderHotelBookingsList();
        });
      });
    });
}

// Loads the booking's room-type service into the cart at qty=nights, then
// sends the cashier to Home to complete the EXISTING payment flow — no new
// payment code. completePayment() checks pendingHotelCheckoutBookingId
// after a successful order and calls finalize_hotel_checkout to link the
// order back to the booking and flip the room to 'cleaning'.
function startHotelCheckout(booking){
  const product = PRODUCTS.find(p => p.isService && -p.id === booking.room_type_service_id);
  if(!product){ showToast('تعذر إيجاد نوع الغرفة بقائمة المنتجات'); return; }
  addToCartWithConfig(product, null, booking.nights);
  pendingHotelCheckoutBookingId = booking.id;
  showToast('تمت إضافة الإقامة للسلة — أكمل الدفع من الرئيسية');
  const homeBtn = document.querySelector('.nav-tab[data-screen="home"]');
  if(homeBtn) homeBtn.click();
}

function openNewHotelBookingModal(){
  resetModalStack(renderNewHotelBookingStep);
  paymentModal.classList.add('show');
}

function renderNewHotelBookingStep(){
  document.getElementById('paymentModalTitle').textContent = 'حجز جديد';
  const roomTypes = PRODUCTS.filter(p => p.isService);
  if(!roomTypes.length){
    paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه أنواع غرف مضافة بعد — أضفها من "الخدمات" باللوحة أولاً.</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  paymentModalBody.innerHTML = `
    <div class="pos-auth-field">
      <label>نوع الغرفة</label>
      <select id="hbRoomType">${roomTypes.map(p => `<option value="${-p.id}">${p.name} — ${p.price.toFixed(2)} ر.س/ليلة</option>`).join('')}</select>
    </div>
    <div class="pos-auth-field" style="display:flex; gap:10px;">
      <div style="flex:1;">
        <label>تاريخ الوصول</label>
        <input type="date" id="hbCheckIn" min="${today}" value="${today}">
      </div>
      <div style="flex:1;">
        <label>تاريخ المغادرة</label>
        <input type="date" id="hbCheckOut" min="${today}">
      </div>
    </div>
    <button type="button" class="confirm-pay-btn" id="hbCheckAvailBtn" style="background:var(--surf2); color:var(--text);">تحقق من التوفر</button>
    <p class="pos-modal-hint" id="hbAvailResult"></p>
    <div class="pos-auth-field">
      <label>اسم النزيل</label>
      <input type="text" id="hbGuestName" placeholder="اسم النزيل">
    </div>
    <div class="pos-auth-field">
      <label>رقم الجوال (اختياري)</label>
      <input type="text" id="hbGuestPhone" placeholder="05xxxxxxxx" inputmode="tel">
    </div>
    <button type="button" class="confirm-pay-btn" id="hbConfirmBtn" disabled>تأكيد الحجز</button>
  `;
  let lastCheckedAvailable = false;
  document.getElementById('hbCheckAvailBtn').addEventListener('click', async () => {
    const roomTypeServiceId = Number(document.getElementById('hbRoomType').value);
    const checkIn = document.getElementById('hbCheckIn').value;
    const checkOut = document.getElementById('hbCheckOut').value;
    const resultEl = document.getElementById('hbAvailResult');
    const confirmBtn = document.getElementById('hbConfirmBtn');
    if(!checkIn || !checkOut || checkOut <= checkIn){
      resultEl.textContent = 'تأكد إن تاريخ المغادرة بعد تاريخ الوصول.';
      confirmBtn.disabled = true; lastCheckedAvailable = false;
      return;
    }
    resultEl.textContent = 'جارٍ التحقق...';
    const { data, error } = await window.supabaseClient.rpc('hotel_room_availability', { p_room_type_service_id: roomTypeServiceId, p_check_in: checkIn, p_check_out: checkOut });
    if(error){ resultEl.textContent = 'تعذر التحقق من التوفر.'; confirmBtn.disabled = true; lastCheckedAvailable = false; return; }
    lastCheckedAvailable = data > 0;
    resultEl.textContent = data > 0 ? ('متاح ' + data + ' غرفة بهذي التواريخ.') : 'ما فيه غرف متاحة بهذي التواريخ.';
    confirmBtn.disabled = !lastCheckedAvailable;
  });
  document.getElementById('hbConfirmBtn').addEventListener('click', async () => {
    if(!lastCheckedAvailable) return;
    const guestName = document.getElementById('hbGuestName').value.trim();
    if(!guestName){ showToast('لازم تكتب اسم النزيل'); return; }
    const confirmBtn = document.getElementById('hbConfirmBtn');
    confirmBtn.disabled = true;
    const { error } = await window.supabaseClient.rpc('create_hotel_booking', {
      p_branch_id: DEVICE.branchId,
      p_room_type_service_id: Number(document.getElementById('hbRoomType').value),
      p_guest_name: guestName,
      p_guest_phone: document.getElementById('hbGuestPhone').value.trim() || null,
      p_check_in: document.getElementById('hbCheckIn').value,
      p_check_out: document.getElementById('hbCheckOut').value,
    });
    if(error){ showToast('تعذر إنشاء الحجز: ' + error.message); confirmBtn.disabled = false; return; }
    showToast('تم إنشاء الحجز');
    closePaymentModalNow();
    renderHotelBookingsList();
  });
}

function subscribeToHotelChanges(){
  if(hotelRealtimeChannel) return;
  hotelRealtimeChannel = window.supabaseClient
    .channel('pos-hotel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_rooms' }, ()=>{
      if(document.getElementById('screen-tables').classList.contains('active')) renderHotelActiveTab();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_bookings' }, ()=>{
      if(document.getElementById('screen-tables').classList.contains('active')) renderHotelActiveTab();
    })
    .subscribe();
}

function openWaitlistSeatPicker(entry){
  resetModalStack(() => renderWaitlistSeatPickerStep(entry));
  paymentModal.classList.add('show');
}

// Includes 'cleaning' tables (not just 'available') — a table that needs
// bussing is still a real, bookable table, the cashier just needs to see
// that plainly and confirm before seating someone on it. seat_waitlist_entry
// itself accepts either status server-side.
function renderWaitlistSeatPickerStep(entry){
  document.getElementById('paymentModalTitle').textContent = 'جلّس ' + entry.customer_name + ' — اختر طاولة';
  paymentModalBody.innerHTML = `<div class="list-empty">جارٍ التحميل...</div>`;
  window.supabaseClient.from('restaurant_tables').select('*')
    .eq('branch_id', DEVICE.branchId).in('status', ['available','cleaning']).order('number')
    .then(({data}) => {
      const tables = data || [];
      if(!tables.length){
        paymentModalBody.innerHTML = `<p class="pos-modal-hint">ما فيه طاولات متاحة الحين.</p>`;
        return;
      }
      const groups = groupTablesForDisplay(tables);
      let html = `<div class="table-picker-grid">`;
      groups.forEach(g => {
        if(g.section) html += `<div class="tables-section-header"><span>${g.section.name}${g.section.id === entry.preferred_section_id ? ' ★' : ''}</span></div>`;
        html += g.tables.map(t => `<button type="button" class="table-picker-btn${t.status==='cleaning'?' needs-cleaning':''}" data-id="${t.id}" data-number="${t.number}" data-status="${t.status}">${t.number}${t.status==='cleaning'?'<span class="tpb-clean-flag">🧹</span>':''}</button>`).join('');
      });
      html += `</div>`;
      paymentModalBody.innerHTML = html;
      document.querySelectorAll('.table-picker-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if(btn.dataset.status === 'cleaning' && !window.confirm('طاولة ' + btn.dataset.number + ' تحتاج تنظيف — تأكيد الجلوس فيها؟')) return;
          const tableId = Number(btn.dataset.id);
          const { error } = await window.supabaseClient.rpc('seat_waitlist_entry', { p_reservation_id: entry.id, p_table_id: tableId });
          if(error){ showToast('تعذر تجليس الطاولة — تحقق من حالتها'); renderWaitlistSeatPickerStep(entry); return; }
          showToast('طاولة ' + btn.dataset.number + ' — بانتظار الطلب');
          closePaymentModalNow();
          document.querySelector('.nav-tab[data-screen="tables"]').click();
        });
      });
    });
}

function defaultWaitlistTime(){
  return new Date().toTimeString().slice(0, 5);
}

function renderAddToWaitlistStep(){
  document.getElementById('paymentModalTitle').textContent = 'إضافة لقائمة الانتظار';
  const depositLine = TABLES_RESERVATION_DEPOSIT_ENABLED
    ? `<p class="pos-modal-hint">عربون مقترح: ${TABLES_RESERVATION_DEPOSIT_PERCENT}٪ من قيمة الطلب المتوقعة — يُحصّل يدويًا، ما فيه دفع أونلاين مربوط حاليًا.</p>` : '';
  const sectionOptions = TABLE_SECTIONS_LIST.length ? `
    <div class="pos-auth-field" id="wlSectionField">
      <label>يفضّل قسم (اختياري)</label>
      <div class="channel-row" id="wlSectionRow">
        <button type="button" class="channel-btn active" data-section="">بدون تفضيل</button>
        ${TABLE_SECTIONS_LIST.map(s=>`<button type="button" class="channel-btn" data-section="${s.id}">${s.name}</button>`).join('')}
      </div>
    </div>` : '';
  // Specific-table advance booking is an owner-opt-in layer on top of the
  // general FIFO queue, not a replacement — most restaurants just want the
  // walk-in queue, so this whole block only exists when explicitly enabled.
  const specificBookingToggle = TABLES_SPECIFIC_BOOKING_ENABLED ? `
    <div class="pos-auth-field">
      <label>حجز طاولة محددة؟</label>
      <div class="channel-row" id="wlSpecificRow">
        <button type="button" class="channel-btn active" data-specific="no">لا — قائمة انتظار عادية</button>
        <button type="button" class="channel-btn" data-specific="yes">نعم — طاولة معينة</button>
      </div>
    </div>
    <div class="pos-auth-field hidden" id="wlTableField">
      <label>اختر الطاولة</label>
      <div class="table-picker-grid" id="wlTableGrid"><div class="list-empty">جارٍ التحميل...</div></div>
    </div>` : '';
  paymentModalBody.innerHTML = `
    <div class="pos-auth-field">
      <label>اسم العميل</label>
      <input type="text" id="wlNameInput" placeholder="اسم العميل">
    </div>
    <div class="pos-auth-field">
      <label>رقم الجوال (اختياري — للتواصل عند توفر طاولة)</label>
      <input type="text" id="wlPhoneInput" placeholder="05xxxxxxxx" inputmode="tel">
    </div>
    <div class="pos-auth-field">
      <label>عدد الأشخاص</label>
      <div class="channel-row" id="wlPartyRow">
        ${WAITLIST_PARTY_PRESETS.map((n,i)=>`<button type="button" class="channel-btn ${i===0?'active':''}" data-party="${n}">${n}</button>`).join('')}
      </div>
    </div>
    ${specificBookingToggle}
    ${sectionOptions}
    <div class="pos-auth-field">
      <label>حجز فوري أو لوقت لاحق؟</label>
      <div class="channel-row" id="wlTimingRow">
        <button type="button" class="channel-btn active" data-timing="now">الآن</button>
        <button type="button" class="channel-btn" data-timing="later">وقت لاحق</button>
      </div>
    </div>
    <div class="pos-auth-field hidden" id="wlTimeField">
      <label>الوقت</label>
      <input type="time" id="wlTimeInput" value="${defaultWaitlistTime()}">
    </div>
    ${depositLine}
    <button class="confirm-pay-btn" id="wlSaveBtn" disabled>إضافة للقائمة</button>
  `;
  let selectedParty = WAITLIST_PARTY_PRESETS[0];
  let selectedSection = '';
  let selectedTiming = 'now';
  let selectedTableId = null;

  const nameInput = document.getElementById('wlNameInput');
  const saveBtn = document.getElementById('wlSaveBtn');
  const validate = () => { saveBtn.disabled = !nameInput.value.trim(); };
  nameInput.addEventListener('input', validate);
  nameInput.focus();

  document.getElementById('wlPartyRow').addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#wlPartyRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    selectedParty = Number(btn.dataset.party);
  });
  const sectionRow = document.getElementById('wlSectionRow');
  if(sectionRow) sectionRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#wlSectionRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    selectedSection = btn.dataset.section;
  });
  const specificRow = document.getElementById('wlSpecificRow');
  if(specificRow){
    let tablesLoaded = false;
    specificRow.addEventListener('click', (e)=>{
      const btn = e.target.closest('.channel-btn'); if(!btn) return;
      document.querySelectorAll('#wlSpecificRow .channel-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const isSpecific = btn.dataset.specific === 'yes';
      document.getElementById('wlTableField').classList.toggle('hidden', !isSpecific);
      const sectionField = document.getElementById('wlSectionField');
      if(sectionField) sectionField.classList.toggle('hidden', isSpecific);
      if(!isSpecific){ selectedTableId = null; return; }
      if(tablesLoaded) return;
      tablesLoaded = true;
      // Booking for a future time — show every table regardless of its
      // current live status, not just what's free right this second.
      window.supabaseClient.from('restaurant_tables').select('*')
        .eq('branch_id', DEVICE.branchId).order('number')
        .then(({data}) => {
          const tables = data || [];
          const groups = groupTablesForDisplay(tables);
          document.getElementById('wlTableGrid').innerHTML = groups.map(g => {
            let html = g.section ? `<div class="tables-section-header"><span>${g.section.name}</span></div>` : '';
            return html + g.tables.map(t => `<button type="button" class="table-picker-btn" data-id="${t.id}">${t.number}</button>`).join('');
          }).join('');
          document.querySelectorAll('#wlTableGrid .table-picker-btn').forEach(tb => {
            tb.addEventListener('click', () => {
              document.querySelectorAll('#wlTableGrid .table-picker-btn').forEach(b=>b.classList.remove('active'));
              tb.classList.add('active');
              selectedTableId = Number(tb.dataset.id);
            });
          });
        });
    });
  }
  document.getElementById('wlTimingRow').addEventListener('click', (e)=>{
    const btn = e.target.closest('.channel-btn'); if(!btn) return;
    document.querySelectorAll('#wlTimingRow .channel-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    selectedTiming = btn.dataset.timing;
    document.getElementById('wlTimeField').classList.toggle('hidden', selectedTiming !== 'later');
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'جارٍ الحفظ...';

    let reservedFor = new Date();
    if(selectedTiming === 'later'){
      const [hh, mm] = document.getElementById('wlTimeInput').value.split(':').map(Number);
      reservedFor.setHours(hh, mm, 0, 0);
      if(reservedFor < new Date()) reservedFor.setDate(reservedFor.getDate() + 1);
    }

    const { error } = await window.supabaseClient.from('table_reservations').insert({
      business_id: DEVICE.businessId, branch_id: DEVICE.branchId, table_id: selectedTableId,
      customer_name: nameInput.value.trim(),
      customer_phone: document.getElementById('wlPhoneInput').value.trim() || null,
      party_size: selectedParty,
      preferred_section_id: selectedTableId ? null : (selectedSection ? Number(selectedSection) : null),
      reserved_for: reservedFor.toISOString(),
    });
    if(error){ showToast('تعذر الحفظ'); saveBtn.disabled = false; saveBtn.textContent = 'إضافة للقائمة'; return; }
    showToast(selectedTableId ? 'تم حجز الطاولة' : 'تمت الإضافة لقائمة الانتظار');
    closePaymentModalNow();
    renderWaitlist();
  });
}

/* ============ DELIVERY screen — prep-time countdown ============
   Every delivery order gets a max-prep-time countdown (platform's own
   prep_timeout_minutes, Settings → منصات التوصيل) starting from created_at.
   "جاهز" is a separate signal from payment status — the sale is already
   financially complete the instant it was rung up (complete_pos_order always
   inserts status:'completed'), so today's sales/VAT figures never wait on
   the kitchen. Active orders here are split by urgency across the "جديدة"/
   "قيد التجهيز" tabs (same underlying list, filtered by remaining time) so
   the tab bar doubles as a triage view instead of an artificial pipeline
   stage that doesn't exist in the schema. */
let deliveryActiveTab = 'new';
// readyAt is null while still in prep (racing the countdown), set once the
// cashier taps "جاهز" — the order STAYS in this array after that (it used to
// be removed here, which is exactly why an order handed to the delivery rep
// used to vanish from "الطلبات الجارية" with no way to confirm it actually
// got delivered) until markDeliveryOrderDelivered() removes it for real.
let ACTIVE_DELIVERY_ORDERS = []; // [{id, createdAt, platformId, platformName, total, invoiceLast4, warnedAt5min, alertedExpired, readyAt}]

function deliveryOrderRemainingSeconds(order){
  const timeoutMin = PREP_TIMEOUT_MINUTES_BY_PLATFORM[order.platformId] || 17;
  const elapsedSec = (Date.now() - order.createdAt.getTime()) / 1000;
  return Math.round(timeoutMin * 60 - elapsedSec);
}

// Real, not decorative: lit only while at least one delivery order is
// within 5 minutes of (or past) its prep deadline — the same threshold
// that drives the "قيد التجهيز" tab and the warning/expired alerts.
function updateNotifBell(){
  const dot = document.getElementById('notifBellDot');
  // Only the not-yet-ready orders race a prep deadline — a ready order's
  // "remaining" time is meaningless (and would just count further and
  // further negative forever), so it must never factor into "urgent".
  const urgent = ACTIVE_DELIVERY_ORDERS.some(o => !o.readyAt && deliveryOrderRemainingSeconds(o) <= 300);
  dot.style.display = urgent ? 'block' : 'none';
}
document.getElementById('notifBellBtn').addEventListener('click', ()=>{
  document.querySelector('.nav-tab[data-screen="orders"]').click();
  document.querySelector('#ordersTabs .seg-tab[data-tab="running"]').click();
});

function registerActiveDeliveryOrder(orderId, payload){
  const platform = DELIVERY_PLATFORMS_LIST.find(p=>p.id === payload.delivery_platform_id);
  ACTIVE_DELIVERY_ORDERS.push({
    id: orderId, createdAt: new Date(), platformId: payload.delivery_platform_id,
    platformName: platform ? platform.name : 'توصيل', total: payload.total, isOnline: false,
    invoiceLast4: payload.platform_invoice_last4, warnedAt5min: false, alertedExpired: false, readyAt: null
  });
  if(NOTIFY_SOUND_ENABLED) playAlertSound('new_order');
  updateNotifBell();
  if(document.getElementById('screen-orders').classList.contains('active') && ordersActiveTab === 'running') renderOrdersList();
}

async function seedActiveDeliveryOrders(){
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  // is('delivered_at', null) — not is('ready_at', null) — since a ready order
  // still belongs on this list (awaiting a delivered confirmation); only a
  // genuinely delivered order is done and should drop off.
  const { data } = await window.supabaseClient
    .from('orders').select('id, total, created_at, ready_at, delivery_platform_id, platform_invoice_last4, source, delivery_platforms(name)')
    .eq('branch_id', DEVICE.branchId).eq('channel', 'delivery').is('delivered_at', null)
    .gte('created_at', startToday.toISOString()).order('created_at', {ascending:true});
  ACTIVE_DELIVERY_ORDERS = (data||[]).map(o=>({
    id: o.id, createdAt: new Date(o.created_at), platformId: o.delivery_platform_id,
    platformName: o.source === 'online' ? 'متجر المطعم' : (o.delivery_platforms ? o.delivery_platforms.name : 'توصيل'),
    total: Number(o.total), isOnline: o.source === 'online',
    invoiceLast4: o.platform_invoice_last4, warnedAt5min: false, alertedExpired: false,
    readyAt: o.ready_at ? new Date(o.ready_at) : null
  }));
}

function pad2(n){ return n < 10 ? '0' + n : String(n); }
function formatMmSs(totalSeconds){
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs/60), s = abs%60;
  return sign + pad2(m) + ':' + pad2(s);
}

async function markDeliveryOrderReady(orderId){
  // this device is the one marking it ready — skip the "kitchen marked it
  // ready" realtime alert below for this order so the cashier doesn't get
  // notified about their own action a moment later
  selfMarkedReadyOrderIds.add(orderId);
  const { data, error } = await window.supabaseClient.rpc('mark_delivery_order_ready', { p_order_id: orderId });
  if(error){ showToast('تعذر تسجيل الطلب جاهز'); return; }
  const row = Array.isArray(data) ? data[0] : data;
  const tracked = ACTIVE_DELIVERY_ORDERS.find(o=>o.id === orderId);
  if(tracked && tracked.isOnline){
    // Only the restaurant's own online orders get a real ready → delivered
    // handoff — a delivery-platform rider's drop-off is invisible to us, so
    // the RPC already auto-completed those (see mark_delivery_order_ready);
    // this just mirrors that by dropping it off the active list right away.
    tracked.readyAt = (row && row.ready_at) ? new Date(row.ready_at) : new Date();
  } else if(tracked){
    ACTIVE_DELIVERY_ORDERS = ACTIVE_DELIVERY_ORDERS.filter(o=>o.id !== orderId);
  }
  const secs = row ? row.prep_duration_seconds : null;
  showToast(secs != null ? `جاهز — استغرق ${formatMmSs(secs)}` : 'تم تسجيل الطلب جاهز');
  updateNotifBell();
  renderOrdersList();
}

async function markDeliveryOrderDelivered(orderId){
  const { error } = await window.supabaseClient.rpc('mark_delivery_order_delivered', { p_order_id: orderId });
  if(error){ showToast('تعذر تسجيل الطلب مُسلَّم'); return; }
  ACTIVE_DELIVERY_ORDERS = ACTIVE_DELIVERY_ORDERS.filter(o=>o.id !== orderId);
  showToast('تم تسليم الطلب #' + orderId);
  updateNotifBell();
  renderOrdersList();
}

// Ticks every second regardless of which POS screen is focused — the
// warning/expired alert must fire even if the cashier is busy on the order
// screen, not only while they happen to be looking at "التوصيل". The visual
// list only re-renders when the delivery screen is actually visible.
setInterval(()=>{
  if(ACTIVE_DELIVERY_ORDERS.length === 0) return;
  ACTIVE_DELIVERY_ORDERS.forEach(order=>{
    if(order.readyAt) return; // already handed to the delivery rep — the prep deadline this was racing no longer applies
    const remaining = deliveryOrderRemainingSeconds(order);
    if(!order.warnedAt5min && remaining <= 300 && remaining > 0){
      order.warnedAt5min = true;
      if(NOTIFY_DELIVERY_PREP_WARNING){
        if(NOTIFY_SOUND_ENABLED) playAlertSound('warning');
        showToast('طلب #' + order.id + ' — باقي ٥ دقائق على وقت التجهيز');
      }
    }
    if(!order.alertedExpired && remaining <= 0){
      order.alertedExpired = true;
      if(NOTIFY_DELIVERY_PREP_EXPIRED){
        if(NOTIFY_SOUND_ENABLED) playAlertSound('alarm');
        showToast('طلب #' + order.id + ' — انتهى وقت التجهيز المحدد');
      }
    }
  });
  // re-render every tick (not just on threshold crossings) so the visible
  // mm:ss actually counts down live — cheap since it's a small list and only
  // happens while the delivery screen is the one on screen.
  updateNotifBell();
  if(document.getElementById('screen-orders').classList.contains('active') && ordersActiveTab === 'running') renderOrdersList();
}, 1000);

/* ============ MORE screen ============ */
const QUICK_ACTIONS = [
  {id:'drawer', label:'فتح الدرج', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 7l4-4h12l4 4"/><line x1="12" y1="12" x2="12" y2="16"/></svg>'},
  {id:'refund', label:'استرجاع مبلغ', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>'},
  {id:'manager', label:'موافقة مدير', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'},
  {id:'reprint', label:'إعادة طباعة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'},
  {id:'scan', label:'مسح باركود', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>'},
  {id:'customers', label:'العملاء', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'},
  {id:'void', label:'إلغاء صنف/طلب', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>'}
];
const SHIFT_ACTIONS = [
  {id:'shiftSummary', label:'ملخص الوردية', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>'},
  {id:'closeShift', label:'إغلاق الوردية', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'},
  {id:'reprintClosing', label:'طباعة آخر موازنة', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'},
  {id:'settings', label:'الإعدادات', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'}
];
document.getElementById('moreGridQuick').innerHTML = QUICK_ACTIONS.map(a=>`<button class="more-item" data-action="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('');
document.getElementById('moreGridShift').innerHTML = SHIFT_ACTIONS.map(a=>`<button class="more-item" data-action="${a.id}">${a.icon}<span>${a.label}</span></button>`).join('');

function handleMoreAction(e){
  const btn = e.target.closest('.more-item'); if(!btn) return;
  const id = btn.dataset.action;
  if(id === 'drawer') showToast('تم فتح الدرج');
  else if(id === 'manager') openPinModal();
  else if(id === 'scan') resetModalStack(scanCustomerCard);
  else if(id === 'reprint') showToast('اختر طلب من "الطلبات" لإعادة طباعته');
  else if(id === 'refund') showToast('اختر طلب مكتمل من "الطلبات" لاسترجاعه');
  else if(id === 'customers') showToast('سجل العملاء والولاء — جاي بالنسخة الجاية');
  else if(id === 'void') showToast('احذف الصنف مباشرة من لوحة الطلب بزر ✕');
  else if(id === 'settings') resetModalStack(openPosSettingsModal);
  else if(id === 'shiftSummary') resetModalStack(openShiftSummary);
  else if(id === 'closeShift') resetModalStack(openClosingWizard);
  else if(id === 'reprintClosing') reprintLastClosingReport();
}
document.getElementById('moreGridQuick').addEventListener('click', handleMoreAction);
document.getElementById('moreGridShift').addEventListener('click', handleMoreAction);

/* ============ Settings — real device/branch/session info, no fake config options ============ */
function openPosSettingsModal(){
  document.getElementById('paymentModalTitle').textContent = 'الإعدادات';
  const bridgeOn = printerBridgeAvailable();
  paymentModalBody.innerHTML = `
    <div class="shift-stat-row"><span>النشاط</span><span class="mono">${DEVICE.businessName || '—'}</span></div>
    <div class="shift-stat-row"><span>الفرع</span><span class="mono">${DEVICE.branchName || '—'}</span></div>
    <div class="shift-stat-row"><span>الموظف الحالي</span><span class="mono">${CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : 'بدون اسم'}</span></div>
    <div class="shift-stat-row"><span>حالة الاتصال</span><span class="mono">${navigator.onLine ? 'متصل' : 'غير متصل'}</span></div>

    <div class="shift-stat-row" style="margin-top:14px;"><span>طابعة الفواتير</span><span class="mono">${bridgeOn ? '✓ تطبيق الطباعة متاح' : '⚠ افتح من تطبيق الكاشير المثبّت للطباعة'}</span></div>
    <div class="pos-auth-field" style="margin-top:8px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">عنوان IP للطابعة (على نفس شبكة الواي فاي)</label>
      <input type="text" id="printerIpInput" placeholder="مثال: 192.168.1.50" value="${DEVICE.printerIp || ''}" style="width:100%;">
    </div>
    <div class="pos-auth-field" style="margin-top:10px; display:flex; gap:10px;">
      <div style="flex:1;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">المنفذ (Port)</label>
        <input type="number" id="printerPortInput" placeholder="9100" value="${DEVICE.printerPort || 9100}" style="width:100%;">
      </div>
      <div style="flex:1;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">عرض الورق</label>
        <select id="printerWidthInput" style="width:100%;">
          <option value="576" ${(DEVICE.printerPaperWidth||576)===576?'selected':''}>80مم (الأشيع)</option>
          <option value="384" ${DEVICE.printerPaperWidth===384?'selected':''}>58مم</option>
        </select>
      </div>
    </div>
    <div class="pos-auth-field" style="margin-top:10px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">شكل الفاتورة عند الدفع</label>
      <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; margin-bottom:8px;">
        <input type="checkbox" id="printCustomerReceiptToggle" ${DEVICE.printCustomerReceipt !== false ? 'checked' : ''}>
        فاتورة العميل (مع السعر والضريبة ورمز QR)
      </label>
      <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700;">
        <input type="checkbox" id="printKitchenTicketToggle" ${DEVICE.printKitchenTicket === true ? 'checked' : ''}>
        فاتورة المطبخ (الأصناف والملاحظات فقط، بدون أسعار)
      </label>
      ${BUSINESS_LOGO_URL ? `<label style="display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; margin-top:8px;">
        <input type="checkbox" id="printReceiptLogoToggle" ${DEVICE.printReceiptLogo !== false ? 'checked' : ''}>
        طباعة شعار المطعم أعلى فاتورة العميل
      </label>` : ''}
    </div>
    <div class="pos-auth-field" style="margin-top:10px;">
      <label style="display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">طابعة مطبخ منفصلة (اختياري)</label>
      <div style="display:flex; gap:8px;">
        <input type="text" id="kitchenPrinterIpInput" placeholder="عنوان IP — مثال: 192.168.1.51" value="${DEVICE.kitchenPrinterIp || ''}" style="flex:2;">
        <input type="number" id="kitchenPrinterPortInput" placeholder="9100" value="${DEVICE.kitchenPrinterPort || ''}" style="flex:1;">
      </div>
      <p class="stock-qty-helper" style="margin-top:6px;">اتركه فارغ لو نفس طابعة الكاشير تطبع فاتورة المطبخ برضو. عبّيه فقط لو عندكم طابعة ثانية منفصلة (مثلاً بالمطبخ بالدور الأول وطابعة الكاشير بالدور الثاني) — لازم تكون على نفس شبكة الواي فاي.</p>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="confirm-pay-btn" id="printerSaveBtn" style="flex:1;">حفظ إعدادات الطابعة</button>
      <button class="receipt-action-btn" id="printerTestBtn" style="flex:1;">طباعة اختبار</button>
    </div>

    <button class="confirm-pay-btn" id="posSettingsReprovisionBtn" style="margin-top:16px;">إعادة تجهيز هذا الجهاز</button>
  `;
  document.getElementById('paymentModal').classList.add('show');
  document.getElementById('posSettingsReprovisionBtn').addEventListener('click', ()=>{
    closePaymentModalNow();
    document.getElementById('reprovisionLink').click();
  });
  document.getElementById('printerSaveBtn').addEventListener('click', ()=>{
    DEVICE.printerIp = document.getElementById('printerIpInput').value.trim() || null;
    DEVICE.printerPort = parseInt(document.getElementById('printerPortInput').value, 10) || 9100;
    DEVICE.printerPaperWidth = parseInt(document.getElementById('printerWidthInput').value, 10) || 576;
    DEVICE.printCustomerReceipt = document.getElementById('printCustomerReceiptToggle').checked;
    DEVICE.printKitchenTicket = document.getElementById('printKitchenTicketToggle').checked;
    const logoToggle = document.getElementById('printReceiptLogoToggle');
    if(logoToggle) DEVICE.printReceiptLogo = logoToggle.checked;
    DEVICE.kitchenPrinterIp = document.getElementById('kitchenPrinterIpInput').value.trim() || null;
    DEVICE.kitchenPrinterPort = parseInt(document.getElementById('kitchenPrinterPortInput').value, 10) || null;
    saveDeviceConfig();
    updatePrinterStatusPill();
    showToast('تم حفظ إعدادات الطابعة');
  });
  document.getElementById('printerTestBtn').addEventListener('click', async ()=>{
    showToast('جاري إرسال طباعة اختبار...');
    const result = await sendToPrinter({
      businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
      dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
      timestampISO: new Date().toISOString(), vatNumber: BUSINESS_VAT_NUMBER,
      orderNumber: '#0', metaLabel: 'طباعة اختبار',
      showLogo: DEVICE.printReceiptLogo !== false && !!BUSINESS_LOGO_URL, logoUrl: BUSINESS_LOGO_URL,
      customMessage: RECEIPT_CUSTOM_MESSAGE,
      items: [{name:'صنف تجريبي', qty:1, unitPrice:10, lineTotal:10, mods:[]}],
      subtotal:10, discount:0, vat:1.5, total:11.5, paymentMethodLabel:'اختبار', change:0
    });
    if(result.ok) showToast('تمت طباعة الاختبار بنجاح');
    else if(result.error === 'bridge_unavailable') showToast('افتح الكاشير من تطبيق APK المثبّت أولاً');
    else if(result.error === 'no_printer_configured') showToast('احفظ عنوان IP للطابعة أولاً');
    else showToast('تعذر الاتصال بالطابعة — تحقق من العنوان والشبكة');
  });
}

/* ============ Shift Summary ============ */
/* ============ Shift data — real, computed from orders tagged with the
   currently-open shift's id (see CURRENT_SHIFT / afterStaffReady near the
   auth flow below). cashTotal starts from the shift's real opening_cash so
   the closing wizard's "expected in drawer" figure accounts for the float,
   not just the day's cash sales. ============ */
async function loadShiftData(){
  if(!CURRENT_SHIFT) return {ordersCount:0, salesTotal:0, cashTotal:0, cardTotal:0, startTime:'--:--'};
  // payment_status='paid' excludes a pay-after dine-in table that's still
  // mid-meal (order registered, nothing collected yet) — without this an
  // open tab's total would land in the drawer count before any money
  // actually changed hands.
  const { data } = await window.supabaseClient
    .from('orders').select('total, payment_method, cash_amount').eq('shift_id', CURRENT_SHIFT.id).eq('payment_status', 'paid');
  const orders = data || [];
  // a split order's cash half belongs in the drawer count too — only the
  // remainder is card, not the whole order total (that used to be double
  // counted as "card" while the real cash portion went uncounted entirely).
  let cashSales = 0, cardSales = 0, deliveryPlatformSales = 0;
  orders.forEach(o=>{
    const total = Number(o.total);
    if(o.payment_method === 'cash') cashSales += total;
    else if(o.payment_method === 'split'){
      const cashPart = Number(o.cash_amount||0);
      cashSales += cashPart;
      cardSales += total - cashPart;
    } else if(o.payment_method === 'delivery_platform') deliveryPlatformSales += total;
    else cardSales += total;
  });
  return {
    ordersCount: orders.length,
    salesTotal: cashSales + cardSales + deliveryPlatformSales,
    cashTotal: Number(CURRENT_SHIFT.opening_cash) + cashSales,
    cardTotal: cardSales,
    deliveryPlatformTotal: deliveryPlatformSales,
    startTime: new Date(CURRENT_SHIFT.opened_at).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})
  };
}

async function openShiftSummary(){
  document.getElementById('paymentModalTitle').textContent = 'ملخص الوردية';
  paymentModalBody.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  document.getElementById('paymentModal').classList.add('show');
  const data = await loadShiftData();
  paymentModalBody.innerHTML = `
    <div style="text-align:center; margin-bottom:16px;"><div style="font-size:11px; font-weight:700; color:var(--muted);">من بداية الوردية — ${data.startTime}</div></div>
    <div class="shift-stat-row"><span>عدد الطلبات</span><span class="mono">${data.ordersCount}</span></div>
    <div class="shift-stat-row"><span>إجمالي المبيعات</span><span class="mono">${data.salesTotal.toFixed(2)} ر.س</span></div>
    <div class="shift-stat-row"><span>كاش (شامل الرصيد الافتتاحي)</span><span class="mono">${data.cashTotal.toFixed(2)} ر.س</span></div>
    <div class="shift-stat-row"><span>بطاقة / Apple Pay</span><span class="mono">${data.cardTotal.toFixed(2)} ر.س</span></div>
    <div class="shift-stat-row total"><span>توصيل — مدفوع عبر التطبيق</span><span class="mono">${data.deliveryPlatformTotal.toFixed(2)} ر.س</span></div>
  `;
}

/* ============ Closing Wizard ============ */
let closingStep = 1, countedCash = '', closingShiftData = null;
// Backup reprint — shift_closing_reports persists every closing report, but
// until now the only time it ever printed was once, automatically, at the
// moment of closing. If the printer jammed/was out of paper right then, the
// cashier had no way back to it once logged out (a closed shift has no
// "open" session to return to). Reprints the most recent one for this
// branch, whenever, no manager PIN needed — it's just re-outputting data
// that was already produced and approved, not a new sensitive action.
async function reprintLastClosingReport(){
  showToast('جاري البحث عن آخر موازنة...');
  const { data, error } = await window.supabaseClient
    .from('shift_closing_reports').select('*')
    .eq('branch_id', DEVICE.branchId).order('created_at', {ascending:false}).limit(1).maybeSingle();
  if(error || !data){ showToast('ما فيه موازنة سابقة مسجلة لهذا الفرع'); return; }
  const report = {
    businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
    dateLabel: new Date(data.created_at).toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
    staffName: '—',
    ordersCount: data.orders_count, salesTotal: Number(data.sales_total),
    cardTotal: Number(data.card_total), deliveryPlatformTotal: Number(data.delivery_platform_total),
    cashExpected: Number(data.cash_expected), cashCounted: Number(data.cash_counted), cashVariance: Number(data.cash_variance)
  };
  showToast('جاري الطباعة...');
  const result = await sendShiftReportToPrinter(report);
  if(result.ok) showToast('تمت طباعة آخر موازنة');
  else if(result.error === 'bridge_unavailable') showToast('افتح الكاشير من تطبيق APK المثبّت أولاً');
  else if(result.error === 'no_printer_configured') showToast('احفظ عنوان IP للطابعة أولاً');
  else showToast('تعذر الاتصال بالطابعة — تحقق من العنوان والشبكة');
}

async function openClosingWizard(){
  if(!CURRENT_SHIFT){ showToast('ما فيه وردية مفتوحة'); return; }
  closingStep = 1; countedCash = '';
  document.getElementById('paymentModalTitle').textContent = 'إغلاق الوردية — عدّ الكاش';
  paymentModalBody.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  document.getElementById('paymentModal').classList.add('show');
  closingShiftData = await loadShiftData();
  renderClosingWizard();
}
function renderClosingWizard(){
  document.getElementById('paymentModalTitle').textContent = closingStep === 1 ? 'إغلاق الوردية — عدّ الكاش' : 'إغلاق الوردية — المطابقة';
  if(closingStep === 1){
    paymentModalBody.innerHTML = `
      <div class="due-display"><div class="due-label">الكاش المتوقع بالدرج</div><div class="due-amount mono">${closingShiftData.cashTotal.toFixed(2)}</div></div>
      <div class="pin-dots" style="margin-bottom:10px;"><span style="font-size:12px; font-weight:700; color:var(--muted);">أدخل المبلغ اللي عدّيته فعليًا</span></div>
      <div class="cash-input-row"><input type="number" id="countedCashInput" placeholder="0.00" value="${countedCash}"></div>
      <button class="confirm-pay-btn" id="closingNextBtn" ${countedCash?'':'disabled'}>التالي</button>
    `;
    const input = document.getElementById('countedCashInput');
    input.addEventListener('input', (e)=>{ countedCash = e.target.value; document.getElementById('closingNextBtn').disabled = !countedCash; });
    document.getElementById('closingNextBtn').addEventListener('click', ()=>{ closingStep = 2; renderClosingWizard(); });
  } else {
    const counted = parseFloat(countedCash) || 0;
    const variance = counted - closingShiftData.cashTotal;
    const varClass = variance === 0 ? 'ok' : (Math.abs(variance) <= 5 ? 'warn' : 'urgent');
    const varLabel = variance === 0 ? 'مطابق تمامًا' : (variance > 0 ? 'زيادة ' + variance.toFixed(2) : 'عجز ' + Math.abs(variance).toFixed(2));
    paymentModalBody.innerHTML = `
      <div class="shift-stat-row"><span>المتوقع</span><span class="mono">${closingShiftData.cashTotal.toFixed(2)}</span></div>
      <div class="shift-stat-row"><span>المعدود فعليًا</span><span class="mono">${counted.toFixed(2)}</span></div>
      <div class="shift-stat-row total"><span>الفرق</span><span class="mono urgency-badge ${varClass}">${varLabel}</span></div>
      <div class="pos-auth-error" id="closingWizardError" style="display:none;"></div>
      <button class="confirm-pay-btn" id="confirmCloseBtn" style="margin-top:16px;">تأكيد إغلاق الوردية</button>
    `;
    // Closing the drawer needs the owner's manager PIN — this used to be a
    // cashier-only action with no approval at all, and the counted-vs-
    // expected mismatch was shown but never enforced or recorded anywhere.
    document.getElementById('confirmCloseBtn').addEventListener('click', ()=>{
      openPinModal(async ()=>{
        const btn = document.getElementById('confirmCloseBtn');
        const errEl = document.getElementById('closingWizardError');
        if(btn) btn.disabled = true;
        try {
          const { error } = await window.supabaseClient.from('shifts')
            .update({ closing_cash: counted, closed_at: new Date().toISOString() }).eq('id', CURRENT_SHIFT.id);
          if(error) throw error;

          const report = {
            businessName: DEVICE.businessName || 'ركين', branchName: DEVICE.branchName || '',
            dateLabel: new Date().toLocaleString('ar-SA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}),
            staffName: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.name : 'بدون اسم',
            ordersCount: closingShiftData.ordersCount, salesTotal: closingShiftData.salesTotal,
            cardTotal: closingShiftData.cardTotal, deliveryPlatformTotal: closingShiftData.deliveryPlatformTotal,
            cashExpected: closingShiftData.cashTotal, cashCounted: counted, cashVariance: variance
          };
          const { data: { user } } = await window.supabaseClient.auth.getUser();
          await window.supabaseClient.from('shift_closing_reports').insert({
            shift_id: CURRENT_SHIFT.id, business_id: DEVICE.businessId, branch_id: DEVICE.branchId,
            closed_by: user.id, orders_count: report.ordersCount, sales_total: report.salesTotal,
            cash_expected: report.cashExpected, cash_counted: report.cashCounted, cash_variance: report.cashVariance,
            card_total: report.cardTotal, delivery_platform_total: report.deliveryPlatformTotal
          });
          sendShiftReportToPrinter(report).then(result=>{
            if(result.ok) showToast('تمت طباعة تقرير الإغلاق');
          });

          document.getElementById('paymentModal').classList.remove('show');
          CURRENT_SHIFT = null;
          sessionStorage.removeItem('rakeen_pos_staff');
          await window.supabaseClient.auth.signOut();
          window.location.reload();
        } catch(err){
          if(errEl){
            errEl.textContent = err && err.message ? err.message : 'تعذر إغلاق الوردية.';
            errEl.style.display = 'block';
          }
          if(btn) btn.disabled = false;
        }
      });
    });
  }
}

/* ============ PIN modal (manager approval) ============ */
const pinModal = document.getElementById('pinModal');
/* ============ Manager PIN — real verification ============
   Checked against businesses.pos_manager_pin_hash via the verify_pos_manager_pin
   RPC (set only by the owner from the dashboard, screen:settings). Used both
   as a standalone "موافقة مدير" check and, with onApprove, as a real gate in
   front of a specific sensitive action (closing a shift). */
let pinModalOnApprove = null;
function openPinModal(onApprove){
  state.pinEntry = '';
  pinModalOnApprove = onApprove || null;
  setPinError('');
  renderPin();
  pinModal.classList.add('show');
}
document.getElementById('closePinModal').addEventListener('click', ()=> pinModal.classList.remove('show'));
pinModal.addEventListener('click', (e)=>{ if(e.target===pinModal) pinModal.classList.remove('show'); });
function setPinError(msg){
  let errEl = document.getElementById('pinModalError');
  if(!errEl){
    errEl = document.createElement('div');
    errEl.id = 'pinModalError';
    errEl.className = 'pos-auth-error';
    errEl.style.textAlign = 'center';
    document.getElementById('pinDots').insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = msg;
  errEl.style.display = msg ? 'block' : 'none';
}
function renderPin(){
  document.getElementById('pinDots').innerHTML = Array.from({length:state.pinTargetLength}).map((_,i)=>
    `<span class="pin-dot ${i < state.pinEntry.length ? 'filled':''}"></span>`
  ).join('');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  document.getElementById('pinPad').innerHTML = keys.map(k=> k ? `<button class="pin-key" data-key="${k}">${k}</button>` : `<span></span>`).join('');
  document.getElementById('pinPad').querySelectorAll('.pin-key').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const k = btn.dataset.key;
      if(k === '⌫') state.pinEntry = state.pinEntry.slice(0,-1);
      else if(state.pinEntry.length < state.pinTargetLength) state.pinEntry += k;
      renderPin();
      if(state.pinEntry.length !== state.pinTargetLength) return;

      const pin = state.pinEntry;
      document.querySelectorAll('#pinPad .pin-key').forEach(b=> b.disabled = true);
      const { data, error } = await window.supabaseClient.rpc('verify_pos_manager_pin', { p_pin: pin });
      state.pinEntry = '';
      if(error){
        setPinError('تعذر التحقق من الرمز — تحقق من الاتصال');
        renderPin();
        return;
      }
      if(data === null){
        setPinError('ما تم تعيين كلمة سر مدير بعد — من لوحة التحكم: الإعدادات ← نقطة البيع');
        renderPin();
        return;
      }
      if(data === true){
        pinModal.classList.remove('show');
        showToast('تمت موافقة المدير');
        if(pinModalOnApprove) pinModalOnApprove();
      } else {
        setPinError('رمز خاطئ');
        renderPin();
      }
    });
  });
}

/* ============ Real data hydration — replaces CATEGORIES/PRODUCTS/
   MODIFIER_PRODUCTS with real menu_categories/menu_items/modifier_groups/
   modifier_options/menu_item_box_* fetched from Supabase, reshaped into the
   exact same render-facing shapes so renderCatRail/renderProductGrid/
   renderGroupModifiers/renderBoxBuilder above are untouched. Two side maps
   (MENU_ITEM_META, MODIFIER_OPTION_STOCK) carry the real stock_item_id/qty/
   unit info those render-facing shapes deliberately don't need, used only
   by checkout's stock-decrement computation. ============ */
let MENU_ITEM_META = {};       // menuItemId -> {costMode, recipe:[{stockItemId,qty,unit}], componentSlot:{totalPieces, eligibleItems:[{id,stockItemId,name,costMode}], defaultMix}}
let BARCODE_TO_PRODUCT_ID = {}; // barcode string -> menu_items.id, for retail scan-to-add (empty for service businesses, which have no barcodes)
let BOX_ELIGIBLE_META = {};    // box_eligible_item row id -> {stockItemId, costMode} — 'simple' choices have stockItemId:null and decrement nothing
let MODIFIER_OPTION_STOCK = {}; // "groupId_optionId" -> {stockItemId, qty, unit}
let STOCK_UNIT_BY_ID = {};      // stockItemId -> the stock item's own tracking unit (kg/g/liter/piece)
let DELIVERY_PLATFORMS_LIST = []; // [{id, name}] — real delivery_platforms for this branch's business
let SERVICE_STAFF_BY_SERVICE = {}; // serviceId -> [staffMemberId,...] — empty array means "any active staff eligible" (see service_staff table comment)
let LOYALTY_ENABLED = true;     // businesses.loyalty_enabled — hides the whole customer/points UI when off
let DINE_IN_ENABLED = true;     // businesses.dine_in_enabled — hides "بالمطعم" + Tables for delivery-only kitchens
let BUSINESS_VAT_NUMBER = '';   // businesses.vat_number — required for the ZATCA QR code on printed receipts; blank until the owner sets it in dashboard Settings
let BUSINESS_VAT_RATE = 0.15;   // businesses.vat_rate — real per-business rate, replaces the old hardcoded VAT_RATE constant
let PRICES_INCLUDE_VAT = true;  // businesses.prices_include_vat — default true matches the KSA legal requirement (menu prices already include tax)
let VAT_REGISTERED = true;      // businesses.vat_registered — off means zero VAT everywhere, not just an inclusive/exclusive question
let BUSINESS_LOGO_URL = '';     // businesses.logo_url — same logo already used on reports/dashboard; printed at the top of the customer receipt when DEVICE.printReceiptLogo is on
let RECEIPT_CUSTOM_MESSAGE = ''; // businesses.receipt_custom_message — owner-editable line printed near the receipt footer
let PLATFORM_PRICES = {};       // platformId -> {menuItemId: price} — real menu_item_platform_prices, each platform's own price list
let PREP_TIMEOUT_MINUTES_BY_PLATFORM = {}; // platformId -> delivery_platforms.prep_timeout_minutes
let NOTIFY_DELIVERY_PREP_WARNING = true;
let NOTIFY_DELIVERY_PREP_EXPIRED = true;
let NOTIFY_SOUND_ENABLED = true;
let KITCHEN_DISPLAY_ENABLED = false; // businesses.kitchen_display_enabled — Rakeen-admin-only flag (never shown in the owner dashboard); gates the "kitchen marked an order ready" realtime alert below
let TABLES_RESERVATIONS_ENABLED = false; // businesses.tables_reservations_enabled — hides the whole reservation UI on the Tables screen when off
let TABLES_RESERVATION_DEPOSIT_ENABLED = false; // businesses.tables_reservation_deposit_enabled — shown as guidance for staff, no payment gateway behind it yet
let TABLES_RESERVATION_DEPOSIT_PERCENT = 20; // businesses.tables_reservation_deposit_percent
let TABLES_TURN_TIME_ENABLED = false; // businesses.tables_turn_time_enabled — shows an elapsed-time badge on occupied tables
let TABLES_TURN_TIME_MINUTES = 45; // businesses.tables_turn_time_minutes
let TABLES_RESERVATION_CONFLICT_WARNING_ENABLED = true; // businesses.tables_reservation_conflict_warning_enabled
let TABLE_SECTIONS_LIST = []; // table_sections for this branch — empty means "no sections configured", Tables screen stays a flat grid
let TABLES_CACHE = []; // last-loaded restaurant_tables — lets the order-panel table badge resolve a number from state.selectedTableId without a round trip
let DINE_IN_PAY_TIMING = 'before'; // businesses.dine_in_pay_timing — whether a table's order is paid the moment it's registered, or later when the guest asks for the bill
let TABLES_SPECIFIC_BOOKING_ENABLED = false; // businesses.tables_specific_booking_enabled — lets the add-to-waitlist form book an exact table in advance, separate from the general FIFO queue
let BUSINESS_TYPE = 'restaurant'; // businesses.business_type — service-based types (see SERVICE_BUSINESS_TYPES below) source PRODUCTS from services instead of menu_items (see loadPosData); quick_service/cafe/cloud_kitchen are 'restaurant' under the hood with different default settings, no code branches on them
// Every one of these shares the exact services/service_staff/table_reservations
// engine built for salon — a car wash bay or a clinic treatment room is the
// same "resource booked for a timed service" shape as a salon chair. Only
// the label copy differs (RESOURCE_LABELS below); the data/checkout path is identical.
const SERVICE_BUSINESS_TYPES = ['salon', 'ladies_salon', 'car_wash', 'mobile_car_wash', 'clinic', 'tailoring', 'hotel'];
function isServiceBusiness(){ return SERVICE_BUSINESS_TYPES.includes(BUSINESS_TYPE); }
// Copy per service-business type — "chair" for a salon reads wrong for a
// car wash ("bay") or clinic ("room"); "service" likewise becomes "wash"/"session".
// mobile_car_wash and tailoring both have resource:null on purpose — neither
// has a physical bay/chair/room to book or seat into (mobile_car_wash: the
// team travels to the customer; tailoring: an order sits on a rack, not a
// seat) — see hasNoPhysicalResource() below, which branches the Tables
// screen away from the floor grid for both types.
const RESOURCE_LABELS = {
  salon: { resource: 'كرسي', resourcePlural: 'كراسي', service: 'خدمة', bookingScreen: 'الحجوزات' },
  ladies_salon: { resource: 'كرسي', resourcePlural: 'كراسي', service: 'خدمة', bookingScreen: 'الحجوزات' },
  car_wash: { resource: 'باي', resourcePlural: 'باياء', service: 'خدمة غسيل', bookingScreen: 'الحجوزات' },
  mobile_car_wash: { resource: null, resourcePlural: null, service: 'خدمة غسيل', bookingScreen: 'الحجوزات' },
  clinic: { resource: 'غرفة', resourcePlural: 'غرف', service: 'جلسة', bookingScreen: 'المواعيد' },
  tailoring: { resource: null, resourcePlural: null, service: 'طلب تفصيل', bookingScreen: 'الطلبات' },
  hotel: { resource: 'غرفة', resourcePlural: 'غرف', service: 'نوع غرفة', bookingScreen: 'الاستقبال' },
};
function resourceLabels(){ return RESOURCE_LABELS[BUSINESS_TYPE] || RESOURCE_LABELS.salon; }
function hasNoPhysicalResource(){ return resourceLabels().resource === null; }
// Roadmap item 5 — تفصيل orders need a genuine 3-stage tracker
// (upcoming/waiting -> seated/in progress -> ready_for_pickup), unlike
// mobile_car_wash which only ever needed upcoming->seated. Gates the
// widened waitlist query and the extra status pill/action buttons below.
function isTailoringBusiness(){ return BUSINESS_TYPE === 'tailoring'; }
const TAILORING_STATUS_LABELS = { upcoming: 'قيد الانتظار', seated: 'قيد التفصيل', ready_for_pickup: 'جاهز للاستلام' };
// Roadmap item 7 — a hotel HAS a physical resource (rooms), unlike
// mobile_car_wash/tailoring, so it doesn't take the hasNoPhysicalResource()
// waitlist-only branch below. It gets its own dedicated pair of renderers
// (renderHotelRoomsGrid/renderHotelBookingsList) reusing the same
// #tablesFloorPane/#tablesWaitlistPane containers instead.
function isHotelBusiness(){ return BUSINESS_TYPE === 'hotel'; }
const HOTEL_ROOM_STATUS_LABELS = { available: 'متاحة', occupied: 'مشغولة', cleaning: 'تنظيف', maintenance: 'صيانة' };
const HOTEL_BOOKING_STATUS_LABELS = { upcoming: 'قادم', checked_in: 'مسجّل دخول', checked_out: 'غادر' };
let HOTEL_ROOMS_CACHE = [];
let HOTEL_BOOKINGS_CACHE = [];
// Set right before "تسجيل المغادرة" loads a booking's room-type service
// into the cart and sends the cashier to Home to pay — completePayment()
// checks this after a successful order and calls finalize_hotel_checkout,
// then clears it. No new payment code: this just hooks the existing flow.
let pendingHotelCheckoutBookingId = null;
// Roadmap item 2 — retail/grocery businesses check out by scanning a
// barcode instead of tapping the grid. Same PRODUCTS/menu_items data path
// as a restaurant (cost_mode='direct' items), just a different default
// input mode — no schema branching needed beyond menu_items.barcode.
const RETAIL_BUSINESS_TYPES = ['retail'];
function isRetailBusiness(){ return RETAIL_BUSINESS_TYPES.includes(BUSINESS_TYPE); }

function convertToUnit(qty, fromUnit, toUnit){
  if(fromUnit === toUnit) return qty;
  if(fromUnit==='g' && toUnit==='kg') return qty/1000;
  if(fromUnit==='kg' && toUnit==='g') return qty*1000;
  return qty;
}

function iconForCategory(name){
  if(!name) return 'bowl';
  if(name.includes('ساخن') || name.includes('قهوة')) return 'cupHot';
  if(name.includes('بارد')) return 'cupCold';
  if(name.includes('حلا') || name.includes('كيك')) return 'cake';
  if(name.includes('مخبوز')) return 'pastry';
  if(name.includes('رئيسي') || name.includes('برجر')) return 'burger';
  if(name.includes('بيتزا')) return 'pizza';
  if(name.includes('ماء') || name.includes('مياه')) return 'water';
  return 'bowl';
}

async function loadPosData(){
  const sb = window.supabaseClient;
  const businessId = DEVICE.businessId;

  // menu_item_recipe_lines/menu_item_box_default_mix are never fetched here
  // on purpose — checkout resolves recipe/box-pick stock decrements
  // server-side now (resolve_menu_item_recipe_decrements /
  // resolve_box_selection_decrements), and the quantities are encrypted at
  // rest besides. The cashier terminal has no legitimate use for either
  // table and, before this change, was downloading the business's real
  // recipe into every POS session whether it needed it or not.
  const [catRes, itemsRes, boxEligRes, groupRes, optRes, itemModRes, stockRes, platformRes, platformPriceRes, loyaltyRes, tableSectionsRes, servicesRes, serviceStaffRes] = await Promise.all([
    sb.from('menu_categories').select('*').eq('business_id', businessId).order('sort_order'),
    sb.from('menu_items').select('*').eq('business_id', businessId).eq('active', true).order('id'),
    sb.from('menu_item_box_eligible_items').select('*'),
    sb.from('modifier_groups').select('*').eq('business_id', businessId).order('id'),
    sb.from('modifier_options').select('*'),
    sb.from('menu_item_modifier_groups').select('*'),
    sb.from('stock_items').select('id, name, unit'),
    sb.from('delivery_platforms').select('id, name, prep_timeout_minutes, logo_url, brand_color').eq('business_id', businessId).eq('active', true).order('name'),
    sb.from('menu_item_platform_prices').select('*'),
    sb.from('businesses').select('business_type, loyalty_enabled, notify_delivery_prep_warning, notify_delivery_prep_expired, notify_sound_enabled, dine_in_enabled, vat_number, vat_rate, prices_include_vat, vat_registered, logo_url, receipt_custom_message, kitchen_display_enabled, tables_reservations_enabled, tables_reservation_deposit_enabled, tables_reservation_deposit_percent, tables_turn_time_enabled, tables_turn_time_minutes, tables_reservation_conflict_warning_enabled, dine_in_pay_timing, tables_specific_booking_enabled').eq('id', businessId).single(),
    sb.from('table_sections').select('id, name, sort_order').eq('branch_id', DEVICE.branchId).order('sort_order'),
    // Only ever non-empty for a business_type='salon' business — a
    // restaurant's services table is always empty (RLS-scoped by
    // business_id), so this fetch is harmless dead weight for restaurants
    // rather than something worth branching out of the boot query.
    sb.from('services').select('*').eq('business_id', businessId).eq('active', true).order('id'),
    sb.from('service_staff').select('*'),
  ]);
  TABLE_SECTIONS_LIST = tableSectionsRes.data || [];
  BUSINESS_TYPE = loyaltyRes.data ? (loyaltyRes.data.business_type || 'restaurant') : 'restaurant';

  // some restaurants genuinely don't want to run a loyalty program — when
  // off, the whole customer/points UI disappears from the cashier rather
  // than sitting there disabled, since "customer" in this POS only ever
  // exists to attach loyalty (nothing else reads state.customer)
  LOYALTY_ENABLED = loyaltyRes.data ? loyaltyRes.data.loyalty_enabled !== false : true;

  // cloud/delivery-only kitchens have no dining room — "بالمطعم" and the
  // whole Tables screen are dead weight on their cashier. renderChannelStep()
  // (rendered dynamically inside the payment popup, not present in the DOM
  // at boot time) reads this flag itself to leave the button out entirely.
  DINE_IN_ENABLED = loyaltyRes.data ? loyaltyRes.data.dine_in_enabled !== false : true;
  BUSINESS_VAT_NUMBER = loyaltyRes.data ? (loyaltyRes.data.vat_number || '') : '';
  BUSINESS_VAT_RATE = loyaltyRes.data && loyaltyRes.data.vat_rate != null ? Number(loyaltyRes.data.vat_rate) : 0.15;
  PRICES_INCLUDE_VAT = loyaltyRes.data ? loyaltyRes.data.prices_include_vat !== false : true;
  VAT_REGISTERED = loyaltyRes.data ? loyaltyRes.data.vat_registered !== false : true;
  BUSINESS_LOGO_URL = loyaltyRes.data ? (loyaltyRes.data.logo_url || '') : '';
  RECEIPT_CUSTOM_MESSAGE = loyaltyRes.data ? (loyaltyRes.data.receipt_custom_message || '') : '';
  const tablesNavBtn = document.querySelector('.nav-tab[data-screen="tables"]');
  if(!DINE_IN_ENABLED){
    if(tablesNavBtn) tablesNavBtn.remove();
    if(state.orderChannel === 'dine_in') state.orderChannel = 'pickup';
  } else if(isServiceBusiness() && tablesNavBtn){
    // "طاولات" reads wrong for a car wash bay or clinic room — relabel the
    // nav tab text node in place rather than touching the markup file
    // (same DOM-surgery pattern already used above for hiding it entirely).
    const label = tablesNavBtn.querySelector('span') || tablesNavBtn;
    label.textContent = resourceLabels().bookingScreen;
    const screenHeading = document.getElementById('tablesScreenHeading');
    if(screenHeading) screenHeading.textContent = resourceLabels().bookingScreen;
    if(hasNoPhysicalResource()){
      const floorTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="floor"]');
      if(floorTabBtn) floorTabBtn.remove();
      tablesActiveTab = 'waitlist';
      document.querySelectorAll('#tablesTabs .seg-tab').forEach(t=>t.classList.remove('active'));
      const waitlistTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="waitlist"]');
      if(waitlistTabBtn) waitlistTabBtn.classList.add('active');
      document.getElementById('tablesFloorPane').classList.add('hidden');
      document.getElementById('tablesWaitlistPane').classList.remove('hidden');
    } else if(isHotelBusiness()){
      // Hotel keeps both tabs (rooms grid + bookings list are both real,
      // distinct views) — just relabels them and drops the reminders tab
      // entirely, since hotel never writes table_reservations.
      const floorTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="floor"]');
      if(floorTabBtn) floorTabBtn.textContent = 'الغرف';
      const waitlistTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="waitlist"]');
      if(waitlistTabBtn){
        for(const node of waitlistTabBtn.childNodes){ if(node.nodeType === 3){ node.nodeValue = 'الحجوزات'; break; } }
        waitlistTabBtn.classList.remove('hidden');
      }
      const remindersTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="reminders"]');
      if(remindersTabBtn) remindersTabBtn.remove();
      const legendEl = document.getElementById('tablesLegend');
      if(legendEl) legendEl.classList.add('hidden');
    }
  }
  if(loyaltyRes.data){
    NOTIFY_DELIVERY_PREP_WARNING = loyaltyRes.data.notify_delivery_prep_warning !== false;
    NOTIFY_DELIVERY_PREP_EXPIRED = loyaltyRes.data.notify_delivery_prep_expired !== false;
    NOTIFY_SOUND_ENABLED = loyaltyRes.data.notify_sound_enabled !== false;
    KITCHEN_DISPLAY_ENABLED = loyaltyRes.data.kitchen_display_enabled === true;
    TABLES_RESERVATIONS_ENABLED = loyaltyRes.data.tables_reservations_enabled === true;
    TABLES_RESERVATION_DEPOSIT_ENABLED = loyaltyRes.data.tables_reservation_deposit_enabled === true;
    TABLES_RESERVATION_DEPOSIT_PERCENT = loyaltyRes.data.tables_reservation_deposit_percent != null ? Number(loyaltyRes.data.tables_reservation_deposit_percent) : 20;
    TABLES_TURN_TIME_ENABLED = loyaltyRes.data.tables_turn_time_enabled === true;
    TABLES_TURN_TIME_MINUTES = loyaltyRes.data.tables_turn_time_minutes != null ? Number(loyaltyRes.data.tables_turn_time_minutes) : 45;
    TABLES_RESERVATION_CONFLICT_WARNING_ENABLED = loyaltyRes.data.tables_reservation_conflict_warning_enabled !== false;
    DINE_IN_PAY_TIMING = loyaltyRes.data.dine_in_pay_timing === 'after' ? 'after' : 'before';
    TABLES_SPECIFIC_BOOKING_ENABLED = loyaltyRes.data.tables_specific_booking_enabled === true;
  }
  const waitlistTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="waitlist"]');
  // tables_reservations_enabled is a restaurant-specific waitlist setting —
  // irrelevant to hotel, whose "الحجوزات" tab (bookings list) must always show.
  if(waitlistTabBtn && !isHotelBusiness()) waitlistTabBtn.classList.toggle('hidden', !TABLES_RESERVATIONS_ENABLED);
  const remindersTabBtn = document.querySelector('#tablesTabs .seg-tab[data-tab="reminders"]');
  if(remindersTabBtn) remindersTabBtn.classList.toggle('hidden', !TABLES_RESERVATIONS_ENABLED);

  const stockNameById = {};
  STOCK_UNIT_BY_ID = {};
  (stockRes.data||[]).forEach(s=>{ stockNameById[s.id] = s.name; STOCK_UNIT_BY_ID[s.id] = s.unit; });

  DELIVERY_PLATFORMS_LIST = platformRes.data || [];
  PREP_TIMEOUT_MINUTES_BY_PLATFORM = {};
  DELIVERY_PLATFORMS_LIST.forEach(p=>{ PREP_TIMEOUT_MINUTES_BY_PLATFORM[p.id] = Number(p.prep_timeout_minutes) || 17; });
  PLATFORM_PRICES = {};
  (platformPriceRes.data||[]).forEach(pp=>{
    if(!PLATFORM_PRICES[pp.platform_id]) PLATFORM_PRICES[pp.platform_id] = {};
    PLATFORM_PRICES[pp.platform_id][pp.menu_item_id] = Number(pp.price);
  });

  CATEGORIES = (catRes.data||[]).map(c=>({id: String(c.id), name: c.name, icon: iconForCategory(c.name)}));

  SERVICE_STAFF_BY_SERVICE = {};
  (serviceStaffRes.data||[]).forEach(r=>{ (SERVICE_STAFF_BY_SERVICE[r.service_id] ||= []).push(r.staff_member_id); });

  // Roadmap item 4 (unified checkout) — a service business (salon/car_wash/
  // clinic/mobile_car_wash) can now sell a physical retail product (shampoo,
  // air freshener) in the SAME cart as a service booking. services.id and
  // menu_items.id are independent sequences that can collide, so a
  // service's virtual PRODUCTS id is its real id negated (-s.id) — real
  // menu_items ids are always positive bigints, so this is collision-proof
  // with zero schema change. Every place that turns a cart line back into
  // an order_items row branches on the sign of productId (see
  // buildOrderPayload/registerTableOrder below) instead of the old
  // whole-cart isServiceBusiness() check. A service has no recipe/box/
  // modifiers, so it simply never gets a MENU_ITEM_META/MODIFIER_PRODUCTS
  // entry — computeLineStockDecrements() already no-ops gracefully when a
  // line's productId has no meta (unchanged behavior), and openProductFlow()
  // already takes the "simple product, add straight to cart" path when
  // MODIFIER_PRODUCTS[productId] is undefined.
  const serviceProducts = isServiceBusiness() ? (servicesRes.data||[]).map(s=>({
    id: -s.id, cat: String(s.category_id), name: s.name, price: Number(s.price),
    icon: 'bowl', image: null, fav: false, pop: 0,
    isService: true, durationMinutes: s.duration_minutes
  })) : [];

  const boxEligByItem = {}; (boxEligRes.data||[]).forEach(r=>{ if(!boxEligByItem[r.menu_item_id]) boxEligByItem[r.menu_item_id] = []; boxEligByItem[r.menu_item_id].push(r); });
  const groupIdsByItem = {}; (itemModRes.data||[]).forEach(r=>{ if(!groupIdsByItem[r.menu_item_id]) groupIdsByItem[r.menu_item_id] = []; groupIdsByItem[r.menu_item_id].push(r.modifier_group_id); });
  const catById = {}; (catRes.data||[]).forEach(c=> catById[c.id] = c);

  const menuItemProducts = (itemsRes.data||[]).map(m=>({
    id: m.id, cat: String(m.category_id), name: m.name, price: Number(m.price),
    icon: iconForCategory(catById[m.category_id] ? catById[m.category_id].name : ''),
    image: m.image_url || null,
    barcode: m.barcode || null,
    isService: false, fav: false, pop: 0
  }));
  PRODUCTS = [...serviceProducts, ...menuItemProducts];

  BARCODE_TO_PRODUCT_ID = {};
  menuItemProducts.forEach(p=>{ if(p.barcode) BARCODE_TO_PRODUCT_ID[p.barcode] = p.id; });

  MENU_ITEM_META = {};
  MODIFIER_PRODUCTS = {};
  BOX_ELIGIBLE_META = {};
  (itemsRes.data||[]).forEach(m=>{
    // recipe/defaultMix stay empty here on purpose — checkout resolves them
    // server-side now (see the comment above loadPosData's Promise.all).
    MENU_ITEM_META[m.id] = { costMode: m.cost_mode, recipe: [], pointsRedeemPrice: m.points_redeem_price != null ? Number(m.points_redeem_price) : null };

    if(m.cost_mode === 'box'){
      // eligible items key off their own row id now, not the stock item id —
      // a 'simple' choice (no inventory tracking) has no stock_item_id at
      // all, so the selection key can't be the stock id anymore. BOX_ELIGIBLE_META
      // is the reverse lookup computeLineBoxSelections uses to build the
      // customer's picks the server then resolves against real stock.
      const eligibleItems = (boxEligByItem[m.id]||[]).map(r=>({
        id: r.id,
        name: r.cost_mode==='simple' ? r.name : (stockNameById[r.stock_item_id] || '—'),
        costMode: r.cost_mode, stockItemId: r.stock_item_id
      }));
      eligibleItems.forEach(e=>{ BOX_ELIGIBLE_META[e.id] = {stockItemId: e.stockItemId, costMode: e.costMode}; });
      MENU_ITEM_META[m.id].componentSlot = {
        totalPieces: m.total_pieces || 0,
        eligibleItems,
        defaultMix: []
      };
      MODIFIER_PRODUCTS[m.id] = {
        isBox: true, alwaysCustomize: true, slots: m.total_pieces || 0,
        items: eligibleItems.map(e=>({id: String(e.id), name: e.name})) // string id: matches how Object.entries(config.selections) keys come back out in formatConfigLabels/renderBoxBuilder (untouched, original code)
      };
      return;
    }

    const groupIds = groupIdsByItem[m.id] || [];
    if(groupIds.length === 0) return; // no modifier groups -> simple product, always fast-add

    const groups = groupIds.map(gid=>{
      const g = (groupRes.data||[]).find(x=>x.id===gid);
      if(!g) return null;
      const options = (optRes.data||[]).filter(o=>o.group_id===gid).map((o,i)=>{
        if(o.cost_mode === 'stock' && o.stock_item_id){
          MODIFIER_OPTION_STOCK[gid+'_'+o.id] = {stockItemId: o.stock_item_id, qty: Number(o.stock_qty), unit: o.stock_unit};
        }
        return {id: String(o.id), name: o.name, price: Number(o.price_delta)||0, default: i===0 && g.type==='single'};
      });
      return {id: String(g.id), name: g.name, type: g.type, required: g.type === 'single', max: g.max_select, options};
    }).filter(Boolean);

    if(groups.length > 0) MODIFIER_PRODUCTS[m.id] = { groups, alwaysCustomize: groups.some(g=>g.required) };
  });
}

/* ============ Real auth: one-time device provisioning (real manager/owner
   login, picks a branch, never used again) + cashier PIN login (username +
   4-digit PIN only, reusing the same synthetic-email trick documented in
   the migration: password = pin + '-pos', a fixed padding satisfying
   Supabase Auth's 6-char minimum without the cashier ever knowing it). */
let CURRENT_PROFILE = null;
let DEVICE = { businessId: null, branchId: null, branchName: null };

function loadDeviceConfig(){
  try {
    const raw = localStorage.getItem('rakeen_pos_device');
    if(raw) DEVICE = JSON.parse(raw);
  } catch (e) { /* ignore malformed/blocked storage — falls through to provisioning */ }
}
function saveDeviceConfig(){
  try { localStorage.setItem('rakeen_pos_device', JSON.stringify(DEVICE)); } catch (e) { /* storage may be unavailable (e.g. private mode) */ }
}
function showAuthScreen(id){
  document.querySelectorAll('.pos-auth-screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('posApp').classList.add('hidden');
  if(id) document.getElementById(id).classList.remove('hidden');
  else document.getElementById('posApp').classList.remove('hidden');
}

document.getElementById('provSubmitBtn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('provError');
  const branchField = document.getElementById('provBranchField');
  const branchSelect = document.getElementById('provBranchSelect');
  errEl.style.display = 'none';

  if(!branchField.classList.contains('hidden')){
    if(!branchSelect.value) return;
    DEVICE.branchId = parseInt(branchSelect.value, 10);
    DEVICE.branchName = branchSelect.options[branchSelect.selectedIndex].text;
    saveDeviceConfig();
    await window.supabaseClient.auth.signOut();
    showCashierLogin();
    return;
  }

  const email = document.getElementById('provEmail').value.trim();
  const password = document.getElementById('provPassword').value;
  if(!email || !password){ errEl.textContent = 'اكتب البريد وكلمة المرور.'; errEl.style.display='block'; return; }
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    const { data: profile, error: profErr } = await window.supabaseClient
      .from('profiles').select('business_id, user_type').eq('id', data.user.id).single();
    if(profErr || !profile) throw profErr || new Error('تعذر تحميل الحساب');
    if(profile.user_type === 'employee'){ await window.supabaseClient.auth.signOut(); throw new Error('لازم تسجّل دخول كمدير أو مالك عشان تجهّز الجهاز.'); }
    DEVICE.businessId = profile.business_id;
    const { data: business } = await window.supabaseClient
      .from('businesses').select('name').eq('id', profile.business_id).single();
    DEVICE.businessName = business ? business.name : '';
    const { data: branches, error: brErr } = await window.supabaseClient
      .from('branches').select('id, name').eq('business_id', profile.business_id);
    if(brErr) throw brErr;
    if(!branches || branches.length === 0){ throw new Error('ما فيه فروع مسجّلة لهذا المشروع.'); }
    if(branches.length === 1){
      DEVICE.branchId = branches[0].id; DEVICE.branchName = branches[0].name;
      saveDeviceConfig();
      await window.supabaseClient.auth.signOut();
      showCashierLogin();
      return;
    }
    branchSelect.innerHTML = branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    branchField.classList.remove('hidden');
    document.getElementById('provSubmitBtn').textContent = 'تأكيد الفرع';
  } catch(err){
    errEl.textContent = err && err.message ? err.message : 'تعذر تسجيل الدخول.';
    errEl.style.display = 'block';
  }
});

let loginPinEntry = '';
function renderLoginPin(){
  document.getElementById('loginPinDots').innerHTML = Array.from({length:4}).map((_,i)=>
    `<span class="pin-dot ${i < loginPinEntry.length ? 'filled':''}"></span>`
  ).join('');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  document.getElementById('loginPinPad').innerHTML = keys.map(k=> k ? `<button class="pin-key" data-key="${k}">${k}</button>` : `<span></span>`).join('');
  document.getElementById('loginPinPad').querySelectorAll('.pin-key').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.dataset.key;
      if(k === '⌫') loginPinEntry = loginPinEntry.slice(0,-1);
      else if(loginPinEntry.length < 4) loginPinEntry += k;
      renderLoginPin();
      if(loginPinEntry.length === 4) attemptCashierLogin();
    });
  });
}
function showCashierLogin(){
  loginPinEntry = '';
  document.getElementById('posLoginError').style.display = 'none';
  document.getElementById('posLoginBranchLabel').textContent = DEVICE.branchName ? ('أدخل رمز فرع: ' + DEVICE.branchName) : 'أدخل رمز نقطة البيع لهذا الفرع';
  renderLoginPin();
  showAuthScreen('posLoginScreen');
}
// Proxies through /api/pos/login instead of calling
// supabaseClient.auth.signInWithPassword() directly — a direct call never
// touches Rakeen's own server at all, so a PIN brute force couldn't be
// rate-limited or locked out no matter how few combinations the PIN has.
// See that route for the actual per-branch lockout logic.
async function attemptCashierLogin(){
  const errEl = document.getElementById('posLoginError');
  errEl.style.display = 'none';
  try {
    const res = await fetch('/api/pos/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: DEVICE.branchId, pin: loginPinEntry }),
    });
    const result = await res.json();
    if(!res.ok || !result.session) throw new Error(result.error || 'رمز الفرع غلط.');
    const { error: sessionError } = await window.supabaseClient.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if(sessionError) throw sessionError;
    await loadCashierProfile(result.userId);
    await showStaffPick();
  } catch (e) {
    errEl.textContent = (e && e.message) || 'رمز الفرع غلط.';
    errEl.style.display = 'block';
    loginPinEntry = '';
    renderLoginPin();
  }
}
document.getElementById('reprovisionLink').addEventListener('click', ()=>{
  localStorage.removeItem('rakeen_pos_device');
  DEVICE = { businessId: null, branchId: null, branchName: null };
  window.location.reload();
});
document.getElementById('posLogoutBtn').addEventListener('click', async ()=>{
  sessionStorage.removeItem('rakeen_pos_staff');
  await window.supabaseClient.auth.signOut();
  window.location.reload();
});
document.getElementById('posSwitchStaffBtn').addEventListener('click', ()=>{
  sessionStorage.removeItem('rakeen_pos_staff');
  showStaffPick();
});

async function loadCashierProfile(userId){
  const { data: profile, error } = await window.supabaseClient
    .from('profiles').select('id, business_id, branch_id, full_name, user_type').eq('id', userId).single();
  if(error || !profile) throw error || new Error('تعذر تحميل بيانات الجهاز');
  CURRENT_PROFILE = profile;
  document.getElementById('posBusinessName').textContent = DEVICE.businessName || '';
  document.getElementById('posBranchName').textContent = DEVICE.branchName || '';
}

/* ============ Staff picker — who's on duty, purely for attributing orders
   (not a login of its own; the branch PIN above is the real credential) ============ */
let CURRENT_STAFF_MEMBER = null;
function applyStaffMember(member){
  CURRENT_STAFF_MEMBER = member;
  document.getElementById('posCashierName').textContent = 'مرحبًا، ' + (member ? member.name : 'بدون اسم');
  document.getElementById('posCashierAvatar').textContent = member ? member.name.charAt(0) : '؟';
  try { sessionStorage.setItem('rakeen_pos_staff', JSON.stringify(member)); } catch (e) { /* ignore */ }
}
async function showStaffPick(){
  const el = document.getElementById('posStaffList');
  el.innerHTML = '<p class="pos-auth-sub">جاري التحميل...</p>';
  showAuthScreen('posStaffPickScreen');
  const { data } = await window.supabaseClient
    .from('staff_members').select('id, name, is_reservation_host').eq('branch_id', DEVICE.branchId).eq('active', true).order('name');
  // On the host stand, whoever's flagged as the dedicated reservation host
  // shows first — a small convenience, not a restriction (any staff member
  // can still pick their own name either way).
  const staff = HOST_MODE ? [...(data||[])].sort((a,b)=> (b.is_reservation_host===true) - (a.is_reservation_host===true)) : (data || []);
  if(staff.length === 0){
    el.innerHTML = '<p class="pos-auth-sub">ما فيه موظفين مضافين لهذا الفرع بعد — أضفهم من الإعدادات بالداشبورد.</p><button class="confirm-pay-btn" id="staffSkipBtn">متابعة بدون اسم</button>';
    document.getElementById('staffSkipBtn').addEventListener('click', async ()=>{ applyStaffMember(null); await afterStaffReady(); });
    return;
  }
  el.innerHTML = staff.map(s=>`<button class="pos-staff-btn" data-id="${s.id}" data-name="${s.name}">${s.name}</button>`).join('');
  el.querySelectorAll('.pos-staff-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      applyStaffMember({ id: parseInt(btn.dataset.id,10), name: btn.dataset.name });
      await afterStaffReady();
    });
  });
}

/* ============ Shifts — a shift is scoped to the branch's shared PIN account
   (the only real auth identity here; see shifts_cashier_manage RLS: cashier_id
   = auth.uid()), so there's at most one open shift per branch at a time. Which
   staff member opened it is recorded via staff_member_id, purely for the
   dashboard's shift log — it doesn't grant any extra access. ============ */
let CURRENT_SHIFT = null;

async function findOpenShift(){
  const { data } = await window.supabaseClient
    .from('shifts').select('*').eq('cashier_id', CURRENT_PROFILE.id).is('closed_at', null)
    .order('opened_at', {ascending:false}).limit(1);
  return (data && data[0]) || null;
}

async function afterStaffReady(){
  // A host stand doesn't run a cash drawer — no shift concept applies, skip
  // straight to the app regardless of whether the branch's real POS
  // terminal happens to have one open right now.
  if(HOST_MODE){ await bootPos(); return; }
  CURRENT_SHIFT = await findOpenShift();
  if(CURRENT_SHIFT) await bootPos();
  else showOpenShiftScreen();
}

function showOpenShiftScreen(){
  document.getElementById('openShiftCashInput').value = '';
  document.getElementById('openShiftError').style.display = 'none';
  showAuthScreen('posOpenShiftScreen');
}

document.getElementById('openShiftSubmitBtn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('openShiftError');
  const input = document.getElementById('openShiftCashInput');
  const openingCash = parseFloat(input.value);
  errEl.style.display = 'none';
  if(!(openingCash >= 0)){ errEl.textContent = 'اكتب رصيد افتتاحي صحيح.'; errEl.style.display = 'block'; return; }
  try {
    const { data, error } = await window.supabaseClient.from('shifts').insert({
      business_id: CURRENT_PROFILE.business_id,
      branch_id: DEVICE.branchId,
      cashier_id: CURRENT_PROFILE.id,
      staff_member_id: CURRENT_STAFF_MEMBER ? CURRENT_STAFF_MEMBER.id : null,
      opening_cash: openingCash
    }).select().single();
    if(error) throw error;
    CURRENT_SHIFT = data;
    await bootPos();
  } catch(err){
    errEl.textContent = err && err.message ? err.message : 'تعذر بدء الوردية.';
    errEl.style.display = 'block';
  }
});

let tablesRealtimeChannel = null;
function subscribeToTableChanges(){
  if(tablesRealtimeChannel) return; // one subscription per boot is enough — a re-login always reloads the whole page first
  tablesRealtimeChannel = window.supabaseClient
    .channel('pos-restaurant-tables')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, ()=>{
      if(document.getElementById('screen-tables').classList.contains('active')) renderTables();
    })
    .subscribe();
}

/* ============ Kitchen "order ready" alert — only for restaurants Rakeen
   has turned KITCHEN_DISPLAY_ENABLED on for. The kitchen device marks an
   order ready via mark_order_ready (any channel) or mark_delivery_order_ready
   (delivery only, also used by this very POS's own "جاهز" button) — both
   just set orders.ready_at, so listening for that column going non-null on
   this branch's orders covers either RPC without needing to special-case
   channels. selfMarkedReadyOrderIds skips alerting the cashier about their
   own action a moment after they take it. ============ */
let ordersReadyRealtimeChannel = null;
const selfMarkedReadyOrderIds = new Set();
function subscribeToOrderReadyAlerts(){
  if(!KITCHEN_DISPLAY_ENABLED || ordersReadyRealtimeChannel) return;
  ordersReadyRealtimeChannel = window.supabaseClient
    .channel('pos-order-ready-alerts')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, (payload)=>{
      const order = payload.new;
      if(!order || !order.ready_at) return;
      if(selfMarkedReadyOrderIds.has(order.id)){ selfMarkedReadyOrderIds.delete(order.id); return; }
      if(NOTIFY_SOUND_ENABLED) playAlertSound('order_ready');
      showToast('✅ طلب #' + order.id + ' جاهز — سلّمه للعميل');
    })
    .subscribe();
}

/* ============ Incoming online-order accept/reject popup ============
   Every online order now lands as status='pending' (see submit_online_order)
   and must be explicitly accepted or rejected by the cashier here before it
   becomes a real, kitchen-visible order. This is a genuinely new modal
   pattern for this file: every other modal (paymentModal/pinModal/
   modifierModal) is backdrop-click-dismissible — this one has no close
   button and no backdrop listener, since the only valid way out is an
   explicit Accept or Reject. A FIFO queue (not a single slot) means a
   second order arriving mid-review of the first is never lost or silently
   overwritten — it just waits its turn. ============ */
let incomingOrderQueue = [];
let incomingOrderModalBusy = false;
let incomingOrderSoundTimer = null;
let incomingOrderCurrent = null; // {order, items} for the order currently shown, so the reject-reason sub-view can go "back" without a re-fetch

function enqueueIncomingOrder(orderId){
  if(incomingOrderQueue.includes(orderId)) return;
  incomingOrderQueue.push(orderId);
  if(!incomingOrderModalBusy) showNextIncomingOrder();
}

async function showNextIncomingOrder(){
  if(incomingOrderQueue.length === 0){ stopIncomingOrderSound(); return; }
  incomingOrderModalBusy = true;
  const orderId = incomingOrderQueue[0];
  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).maybeSingle(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  if(!order || order.status !== 'pending'){
    // already handled from another device (or the order vanished) — drop and move on
    incomingOrderQueue.shift();
    return showNextIncomingOrder();
  }
  incomingOrderCurrent = { order, items: items || [] };
  renderIncomingOrderModal(order, items || []);
  document.getElementById('incomingOrderModal').classList.add('show');
  startIncomingOrderSound();
}

function startIncomingOrderSound(){
  stopIncomingOrderSound();
  if(!NOTIFY_SOUND_ENABLED) return;
  playAlertSound('incoming_order');
  incomingOrderSoundTimer = setInterval(()=> playAlertSound('incoming_order'), 4000);
}
function stopIncomingOrderSound(){
  if(incomingOrderSoundTimer){ clearInterval(incomingOrderSoundTimer); incomingOrderSoundTimer = null; }
}

function advanceIncomingQueue(orderId){
  incomingOrderQueue = incomingOrderQueue.filter(id => id !== orderId);
  document.getElementById('incomingOrderModal').classList.remove('show');
  incomingOrderModalBusy = false;
  incomingOrderCurrent = null;
  stopIncomingOrderSound();
  if(incomingOrderQueue.length) showNextIncomingOrder();
}

async function acceptIncomingOrder(orderId){
  const acceptBtn = document.getElementById('incomingAcceptBtn');
  const rejectBtn = document.getElementById('incomingRejectBtn');
  if(acceptBtn) acceptBtn.disabled = true;
  if(rejectBtn) rejectBtn.disabled = true;
  const { error } = await window.supabaseClient.rpc('accept_online_order', { p_order_id: orderId });
  if(error){ showToast('تعذر قبول الطلب: ' + error.message); return advanceIncomingQueue(orderId); }

  const [{data: order}, {data: items}] = await Promise.all([
    window.supabaseClient.from('orders').select('*').eq('id', orderId).single(),
    window.supabaseClient.from('order_items').select('*').eq('order_id', orderId)
  ]);
  // Kitchen ticket FIRST, then customer receipt SECOND — always, unconditionally
  // (not gated by the per-device DEVICE.printKitchenTicket/printCustomerReceipt
  // toggles that govern normal POS checkout auto-print). Awaited in sequence so
  // the kitchen ticket is genuinely dispatched to the printer before the
  // customer receipt starts, matching the owner's explicit ordering requirement.
  await sendKitchenTicketToPrinter(buildDbKitchenReceiptData(order, items || []));
  await sendToPrinter(buildHistoricalReceiptData(order, items || []));
  // Without this, an accepted delivery order only appears in the "جارية"
  // (running) list after the next page reload — seedActiveDeliveryOrders()
  // would eventually pick it up, but nothing repopulates ACTIVE_DELIVERY_ORDERS
  // live when an order is accepted mid-session, so the cashier sees it on the
  // kitchen board but not here until they reload. Mirrors registerActiveDeliveryOrder's
  // shape (called for POS-native delivery orders) but with the online-order fields
  // seedActiveDeliveryOrders already uses for source==='online' rows.
  if(order && order.channel === 'delivery'){
    ACTIVE_DELIVERY_ORDERS.push({
      id: order.id, createdAt: new Date(order.created_at), platformId: order.delivery_platform_id,
      platformName: 'متجر المطعم', total: Number(order.total), isOnline: true,
      invoiceLast4: order.platform_invoice_last4, warnedAt5min: false, alertedExpired: false, readyAt: null
    });
    updateNotifBell();
  }
  showToast('تم قبول الطلب #' + orderId);
  if(document.getElementById('screen-orders').classList.contains('active')) renderOrdersList();
  advanceIncomingQueue(orderId);
}

async function rejectIncomingOrder(orderId, reason){
  const { error } = await window.supabaseClient.rpc('reject_online_order', { p_order_id: orderId, p_reason: reason });
  if(error){ showToast('تعذر رفض الطلب: ' + error.message); return advanceIncomingQueue(orderId); }
  showToast('تم رفض الطلب #' + orderId);
  advanceIncomingQueue(orderId);
}

const INCOMING_ORDER_REJECT_REASONS = ['عدم توفر الصنف', 'المطعم مشغول', 'خارج نطاق التوصيل', 'الفرع مغلق الآن'];

function renderIncomingOrderModal(order, items){
  const itemsHtml = items.map(it=>{
    const mods = (it.selected_modifiers||[]).map(m=>escapeHtml(m.text)).join('، ');
    const product = PRODUCTS.find(p=>p.id===it.menu_item_id);
    const name = escapeHtml(product ? product.name : ('منتج #' + it.menu_item_id));
    return `<div class="receipt-detail-row"><span>${it.qty} × ${name}${mods ? ' (' + mods + ')' : ''}${it.note ? ' — ' + escapeHtml(it.note) : ''}</span><span class="mono">${Number(it.line_total).toFixed(2)}</span></div>`;
  }).join('');
  const phoneDigits = (order.customer_phone || '').replace(/\D/g, '');
  const body = document.getElementById('incomingOrderModalBody');
  body.innerHTML = `
    <div class="receipt-detail-row" style="border-bottom:none; font-weight:800;"><span>${escapeHtml(CHANNEL_LABELS[order.channel] || order.channel)}${order.customer_name ? ' — ' + escapeHtml(order.customer_name) : ''}</span><span></span></div>
    ${order.customer_phone ? `<a class="incoming-order-call" href="tel:${escapeHtml(phoneDigits)}">📞 ${escapeHtml(order.customer_phone)}</a>` : ''}
    <div class="receipt-detail-row"><span>طريقة الدفع</span><span class="mono">${escapeHtml(PAYMENT_METHOD_LABELS_POS[order.payment_method] || order.payment_method)}${order.payment_method === 'cash' ? ' — يُدفع عند الاستلام' : ''}</span></div>
    ${order.channel === 'pickup' && order.scheduled_for ? `<div class="receipt-detail-row"><span>⏰ وقت الاستلام المطلوب</span><span class="mono">${new Date(order.scheduled_for).toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'})}</span></div>` : ''}
    ${order.delivery_address ? `<div class="receipt-detail-row"><span>عنوان التوصيل</span><span>${escapeHtml(order.delivery_address)}</span></div>` : ''}
    ${itemsHtml}
    <div class="receipt-total mono">${Number(order.total).toFixed(2)} ر.س</div>
    <div class="incoming-order-actions">
      <button class="confirm-pay-btn" id="incomingAcceptBtn">قبول ✅</button>
      <button class="clear-btn armed" id="incomingRejectBtn">رفض ❌</button>
    </div>
  `;
  document.getElementById('incomingAcceptBtn').addEventListener('click', ()=> acceptIncomingOrder(order.id));
  document.getElementById('incomingRejectBtn').addEventListener('click', ()=> renderRejectReasonView(order.id));
}

function renderRejectReasonView(orderId){
  const body = document.getElementById('incomingOrderModalBody');
  body.innerHTML = `
    <p class="pos-auth-sub">اختر سبب الرفض</p>
    <div class="reject-reason-chips">
      ${INCOMING_ORDER_REJECT_REASONS.map(r=>`<button class="reject-reason-chip" data-reason="${r}">${r}</button>`).join('')}
      <button class="reject-reason-chip" data-reason="__other__">سبب آخر</button>
    </div>
    <div class="pos-auth-field" id="rejectOtherField" style="display:none;"><input type="text" id="rejectOtherInput" placeholder="اكتب السبب..."></div>
    <div class="incoming-order-actions">
      <button class="clear-btn" id="rejectBackBtn">رجوع</button>
      <button class="confirm-pay-btn" id="rejectConfirmBtn" disabled>تأكيد الرفض</button>
    </div>
  `;
  let selectedReason = null;
  const confirmBtn = document.getElementById('rejectConfirmBtn');
  const otherField = document.getElementById('rejectOtherField');
  const otherInput = document.getElementById('rejectOtherInput');
  body.querySelectorAll('.reject-reason-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      body.querySelectorAll('.reject-reason-chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      if(chip.dataset.reason === '__other__'){
        otherField.style.display = 'block';
        selectedReason = otherInput.value.trim() || null;
      } else {
        otherField.style.display = 'none';
        selectedReason = chip.dataset.reason;
      }
      confirmBtn.disabled = !selectedReason;
    });
  });
  otherInput.addEventListener('input', (e)=>{
    selectedReason = e.target.value.trim() || null;
    confirmBtn.disabled = !selectedReason;
  });
  document.getElementById('rejectBackBtn').addEventListener('click', ()=>{
    if(incomingOrderCurrent) renderIncomingOrderModal(incomingOrderCurrent.order, incomingOrderCurrent.items);
  });
  confirmBtn.addEventListener('click', ()=>{
    confirmBtn.disabled = true;
    rejectIncomingOrder(orderId, selectedReason);
  });
}

let incomingOrdersRealtimeChannel = null;
function subscribeToIncomingOnlineOrders(){
  if(incomingOrdersRealtimeChannel) return;
  incomingOrdersRealtimeChannel = window.supabaseClient
    .channel('pos-incoming-online-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, (payload)=>{
      const order = payload.new;
      if(!order || order.status !== 'pending') return;
      enqueueIncomingOrder(order.id);
    })
    .subscribe();
}

/* ============ General "الطلبات" screen live sync ============
   Before this, the Orders screen only ever refreshed on this device's OWN
   actions (checkout, refund, accept, mark-ready) or a manual tab click — a
   sale rung up on a SECOND register, or an online order accepted/rejected
   from elsewhere, sat stale here until the cashier happened to click a tab or
   reload the page. Deliberately a separate, always-on channel rather than
   piggybacking on pos-order-ready-alerts, since that one only subscribes at
   all when KITCHEN_DISPLAY_ENABLED is on (most businesses don't have it) —
   this needs to work for every business regardless of that flag. */
function syncActiveDeliveryOrderFromRow(order){
  if(!order || order.channel !== 'delivery' || order.status !== 'completed') return;
  const tracked = ACTIVE_DELIVERY_ORDERS.find(o=>o.id===order.id);
  if(order.delivered_at != null){
    // delivered from another device (or this device's own action, already
    // removed locally by markDeliveryOrderDelivered — this is then a no-op)
    if(tracked){ ACTIVE_DELIVERY_ORDERS = ACTIVE_DELIVERY_ORDERS.filter(o=>o.id!==order.id); updateNotifBell(); }
    return;
  }
  if(tracked){
    // already tracked — the only thing that can meaningfully change while it
    // stays on this list is ready_at flipping from null to set (another
    // device tapped "جاهز")
    if(order.ready_at && !tracked.readyAt){ tracked.readyAt = new Date(order.ready_at); updateNotifBell(); }
    return;
  }
  const platform = DELIVERY_PLATFORMS_LIST.find(p=>p.id === order.delivery_platform_id);
  ACTIVE_DELIVERY_ORDERS.push({
    id: order.id, createdAt: new Date(order.created_at), platformId: order.delivery_platform_id,
    platformName: order.source === 'online' ? 'متجر المطعم' : (platform ? platform.name : 'توصيل'),
    total: Number(order.total), isOnline: order.source === 'online',
    invoiceLast4: order.platform_invoice_last4, warnedAt5min: false, alertedExpired: false,
    readyAt: order.ready_at ? new Date(order.ready_at) : null
  });
  updateNotifBell();
}

let ordersLiveSyncChannel = null;
function subscribeToOrdersLiveSync(){
  if(ordersLiveSyncChannel) return;
  const onOrdersChange = (payload)=>{
    syncActiveDeliveryOrderFromRow(payload.new);
    if(document.getElementById('screen-orders').classList.contains('active')) renderOrdersList();
  };
  ordersLiveSyncChannel = window.supabaseClient
    .channel('pos-orders-live-sync')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, onOrdersChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, onOrdersChange)
    .subscribe();
}

// Catches orders that arrived while this device was offline/asleep/reloading —
// the realtime INSERT subscription alone only sees orders from this point on.
async function loadPendingOnlineOrdersOnBoot(){
  const { data } = await window.supabaseClient
    .from('orders').select('id')
    .eq('branch_id', DEVICE.branchId).eq('status', 'pending')
    .order('created_at', { ascending: true });
  (data || []).forEach(o => enqueueIncomingOrder(o.id));
}

async function bootPos(){
  await loadPosData();
  if(HOST_MODE){
    document.getElementById('posApp').classList.add('host-mode');
    document.getElementById('posCashierRole').textContent = 'الحجز والطاولات';
    renderTables();
    subscribeToTableChanges();
    showAuthScreen(null);
    // Order-taking/payment stay entirely off this device (see the sheet
    // buttons hidden below in HOST_MODE) — a real cashier registers the
    // order later from the actual POS once they check the table — so the
    // product grid / cart never needs to load here at all.
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelector('.nav-tab[data-screen="tables"]').classList.add('active');
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-tables').classList.add('active');
    return;
  }
  renderPlatformButtons();
  renderCatRail();
  renderProductGrid();
  renderOrder();
  await seedActiveDeliveryOrders();
  updateNotifBell();
  renderOrdersList();
  // mobile_car_wash lands on the waitlist pane by default (no floor grid —
  // see hasNoPhysicalResource() above), so populate that instead of the grid.
  if(isHotelBusiness()){ renderHotelActiveTab(); subscribeToHotelChanges(); }
  else {
    if(tablesActiveTab === 'waitlist') renderWaitlist();
    else renderTables();
    subscribeToTableChanges();
  }
  subscribeToOrderReadyAlerts();
  subscribeToIncomingOnlineOrders();
  subscribeToOrdersLiveSync();
  await loadPendingOnlineOrdersOnBoot();
  showAuthScreen(null);
  if(isRetailBusiness()) document.getElementById('searchInput').focus();
}

/* ============ Init ============ */
loadDeviceConfig();
updatePrinterStatusPill();
(async function initAuth(){
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if(session){
    try {
      await loadCashierProfile(session.user.id);
      if(CURRENT_PROFILE.user_type !== 'employee' || !CURRENT_PROFILE.branch_id){
        await window.supabaseClient.auth.signOut();
        CURRENT_PROFILE = null;
      }
    } catch (e) { CURRENT_PROFILE = null; }
  }
  if(!DEVICE.businessId || !DEVICE.branchId){
    showAuthScreen('posProvisionScreen');
  } else if(CURRENT_PROFILE){
    try {
      const savedStaff = JSON.parse(sessionStorage.getItem('rakeen_pos_staff') || 'null');
      if(savedStaff){ applyStaffMember(savedStaff); await afterStaffReady(); }
      else await showStaffPick();
    } catch (e) { await showStaffPick(); }
  } else {
    showCashierLogin();
  }
})();

})();
