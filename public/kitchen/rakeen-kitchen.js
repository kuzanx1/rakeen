(function(){
'use strict';

// Customer-supplied text (order names/notes) MUST run through this before
// hitting innerHTML — this screen is often shared/unattended, and orders
// arrive from the fully public online-ordering flow with no auth.
function escapeHtml(value){
  if(value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============ Device / auth — a lean mirror of public/pos/rakeen-pos.js's
   provisioning + branch-PIN flow (same synthetic pos+<branchId>@rakeen.internal
   account, same password=pin+'-pos' trick), just with no staff picker and no
   shift gate — the kitchen board never touches payment, so neither concept
   applies. Kept in its own localStorage key so provisioning the kitchen
   screen never touches (or is touched by) a POS tablet's own device config. ============ */
let DEVICE = { businessId: null, branchId: null, branchName: null, businessName: null };
function loadDeviceConfig(){
  try {
    const raw = localStorage.getItem('rakeen_kds_device');
    if(raw) DEVICE = JSON.parse(raw);
  } catch (e) { /* ignore — falls through to provisioning */ }
}
function saveDeviceConfig(){
  try { localStorage.setItem('rakeen_kds_device', JSON.stringify(DEVICE)); } catch (e) { /* storage may be unavailable */ }
}
function showAuthScreen(id){
  document.querySelectorAll('.pos-auth-screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('kdsApp').classList.add('hidden');
  if(id) document.getElementById(id).classList.remove('hidden');
  else document.getElementById('kdsApp').classList.remove('hidden');
}

document.getElementById('kdsProvSubmitBtn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('kdsProvError');
  const branchField = document.getElementById('kdsProvBranchField');
  const branchSelect = document.getElementById('kdsProvBranchSelect');
  errEl.style.display = 'none';

  if(!branchField.classList.contains('hidden')){
    if(!branchSelect.value) return;
    DEVICE.branchId = parseInt(branchSelect.value, 10);
    DEVICE.branchName = branchSelect.options[branchSelect.selectedIndex].text;
    saveDeviceConfig();
    await window.supabaseClient.auth.signOut();
    showLoginScreen();
    return;
  }

  const email = document.getElementById('kdsProvEmail').value.trim();
  const password = document.getElementById('kdsProvPassword').value;
  if(!email || !password){ errEl.textContent = 'اكتب البريد وكلمة المرور.'; errEl.style.display='block'; return; }
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    const { data: profile, error: profErr } = await window.supabaseClient
      .from('profiles').select('business_id, user_type').eq('id', data.user.id).single();
    if(profErr || !profile) throw profErr || new Error('تعذر تحميل الحساب');
    if(profile.user_type === 'employee'){ await window.supabaseClient.auth.signOut(); throw new Error('لازم تسجّل دخول كمدير أو مالك عشان تجهّز الشاشة.'); }
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
      showLoginScreen();
      return;
    }
    branchSelect.innerHTML = branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    branchField.classList.remove('hidden');
    document.getElementById('kdsProvSubmitBtn').textContent = 'تأكيد الفرع';
  } catch(err){
    errEl.textContent = err && err.message ? err.message : 'تعذر تسجيل الدخول.';
    errEl.style.display = 'block';
  }
});

let loginPinEntry = '';
function renderLoginPin(){
  document.getElementById('kdsLoginPinDots').innerHTML = Array.from({length:4}).map((_,i)=>
    `<span class="pin-dot ${i < loginPinEntry.length ? 'filled':''}"></span>`
  ).join('');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  document.getElementById('kdsLoginPinPad').innerHTML = keys.map(k=> k ? `<button class="pin-key" data-key="${k}">${k}</button>` : `<span></span>`).join('');
  document.getElementById('kdsLoginPinPad').querySelectorAll('.pin-key').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.dataset.key;
      if(k === '⌫') loginPinEntry = loginPinEntry.slice(0,-1);
      else if(loginPinEntry.length < 4) loginPinEntry += k;
      renderLoginPin();
      if(loginPinEntry.length === 4) attemptLogin();
    });
  });
}
function showLoginScreen(){
  loginPinEntry = '';
  document.getElementById('kdsLoginError').style.display = 'none';
  document.getElementById('kdsLoginBranchLabel').textContent = DEVICE.branchName ? ('أدخل رمز فرع: ' + DEVICE.branchName) : 'أدخل رمز نقطة البيع لهذا الفرع';
  renderLoginPin();
  showAuthScreen('kdsLoginScreen');
}
async function attemptLogin(){
  const errEl = document.getElementById('kdsLoginError');
  errEl.style.display = 'none';
  const email = 'pos+' + DEVICE.branchId + '@rakeen.internal';
  const password = loginPinEntry + '-pos';
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    await bootKitchen();
  } catch (e) {
    errEl.textContent = 'رمز الفرع غلط.';
    errEl.style.display = 'block';
    loginPinEntry = '';
    renderLoginPin();
  }
}
document.getElementById('kdsReprovisionLink').addEventListener('click', ()=>{
  localStorage.removeItem('rakeen_kds_device');
  DEVICE = { businessId: null, branchId: null, branchName: null, businessName: null };
  window.location.reload();
});
document.getElementById('kdsLogoutBtn').addEventListener('click', async ()=>{
  await window.supabaseClient.auth.signOut();
  window.location.reload();
});

/* ============ Kitchen board ============
   Shows every active order (any channel — dine-in, pickup, delivery) that
   hasn't been marked ready yet, live. A held-in-cart order at the POS never
   appears here at all (nothing's been rung up), matching how the kitchen
   should only ever see orders that were actually confirmed. */
const CHANNEL_LABELS = {dine_in:'بالمطعم', pickup:'استلام', delivery:'توصيل'};
let ACTIVE_ORDERS = [];
let tickTimer = null;

// Owner-configured from the dashboard (الإعدادات ← الكاشير) — loaded once at
// boot in bootKitchen(). 'manual' (default) needs a real tap per order;
// 'auto' clears each order off the board by itself once
// KITCHEN_AUTO_READY_MINUTES have passed, no button at all.
let KITCHEN_READY_MODE = 'manual';
let KITCHEN_AUTO_READY_MINUTES = 15;
let KITCHEN_NEW_ORDER_SOUND_ENABLED = true;

const newOrderAudio = new Audio('/pos/sounds/notify-general.mp3');
function playNewOrderSound(){
  try { newOrderAudio.currentTime = 0; newOrderAudio.play().catch(()=>{}); } catch (e) { /* sound is a nice-to-have */ }
}

function pad2(n){ return n < 10 ? '0' + n : String(n); }
function formatMmSs(totalSeconds){
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.round(Math.abs(totalSeconds));
  return sign + pad2(Math.floor(abs/60)) + ':' + pad2(abs%60);
}
function orderUrgency(order){
  const elapsedSec = (Date.now() - new Date(order.created_at).getTime()) / 1000;
  // In auto mode the ring HAS to represent the single configured auto-clear
  // time (whatever channel), since that's the real deadline about to fire —
  // showing a different number would be actively misleading. In manual mode
  // there's no fixed deadline, so delivery orders keep using their own
  // platform's timeout (same as the POS's own countdown) and everything
  // else falls back to a generic 15-minute kitchen expectation.
  const timeoutMin = KITCHEN_READY_MODE === 'auto'
    ? KITCHEN_AUTO_READY_MINUTES
    : (order.channel === 'delivery' && order.delivery_platforms && order.delivery_platforms.prep_timeout_minutes)
      ? order.delivery_platforms.prep_timeout_minutes : 15;
  const remaining = timeoutMin * 60 - elapsedSec;
  return { elapsedSec, remaining, urgency: remaining <= 0 ? 'urgent' : remaining <= 300 ? 'warn' : 'ok' };
}

function cardTitle(order){
  if(order.channel === 'dine_in') return order.restaurant_tables ? 'طاولة ' + order.restaurant_tables.number : 'بالمطعم';
  if(order.channel === 'delivery') return order.delivery_platforms ? escapeHtml(order.delivery_platforms.name) : 'توصيل';
  return 'استلام';
}
function cardBadge(order){
  if(order.channel !== 'delivery') return `<span>${escapeHtml(CHANNEL_LABELS[order.channel] || order.channel)}${order.customer_name ? ' — ' + escapeHtml(order.customer_name) : ''}</span>`;
  const p = order.delivery_platforms;
  const badge = p && p.logo_url
    ? `<img src="${escapeHtml(p.logo_url)}" alt="" class="kds-card-logo">`
    : `<span class="kds-card-logo-initial" style="background:${(p && p.brand_color) || 'var(--surf2)'}">${escapeHtml(((p && p.name) || '؟').charAt(0))}</span>`;
  return badge + `<span>#${order.id}${order.platform_invoice_last4 ? ' — ...' + escapeHtml(order.platform_invoice_last4) : ''}</span>`;
}
function renderCard(order){
  const { elapsedSec, remaining, urgency } = orderUrgency(order);
  const itemsHtml = (order.order_items || []).map(it=>{
    const modsHtml = (it.selected_modifiers || []).map(m=>`<div class="kds-item-mod">— ${escapeHtml(m.text)}</div>`).join('');
    const noteHtml = it.note ? `<div class="kds-item-note">📝 ${escapeHtml(it.note)}</div>` : '';
    const name = escapeHtml(it.menu_items ? it.menu_items.name : 'صنف');
    return `<div class="kds-item-row"><div class="kds-item-main">${it.qty} × ${name}</div>${modsHtml}${noteHtml}</div>`;
  }).join('');
  const footer = KITCHEN_READY_MODE === 'manual'
    ? `<button class="kds-ready-btn" data-order-id="${order.id}">تم التجهيز</button>`
    : `<div class="kds-auto-note" data-auto-remaining>يختفي تلقائيًا خلال ${formatMmSs(Math.max(0, remaining))}</div>`;
  return `<div class="kds-card ${urgency !== 'ok' ? urgency : ''}" data-order="${order.id}">
    <div class="kds-card-head">
      <div class="kds-card-title">${cardTitle(order)}</div>
      <div class="kds-card-time mono ${urgency !== 'ok' ? urgency : ''}" data-elapsed>${formatMmSs(elapsedSec)}</div>
    </div>
    <div class="kds-card-badge">${cardBadge(order)}</div>
    <div class="kds-items">${itemsHtml || '<div class="kds-item-row">—</div>'}</div>
    ${footer}
  </div>`;
}

function renderBoard(){
  const board = document.getElementById('kdsBoard');
  document.getElementById('kdsOrderCount').textContent = ACTIVE_ORDERS.length;
  if(ACTIVE_ORDERS.length === 0){
    board.innerHTML = '<div class="kds-empty">ما فيه طلبات جارية الحين 👍</div>';
    return;
  }
  board.innerHTML = ACTIVE_ORDERS.map(renderCard).join('');
  board.querySelectorAll('.kds-ready-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const orderId = parseInt(btn.dataset.orderId, 10);
      btn.disabled = true;
      const { error } = await window.supabaseClient.rpc('mark_order_ready', { p_order_id: orderId });
      if(error){ btn.disabled = false; return; }
      ACTIVE_ORDERS = ACTIVE_ORDERS.filter(o=>o.id !== orderId);
      renderBoard();
    });
  });
}

// Auto mode's silent equivalent of tapping "تم التجهيز" — fires from the 1s
// tick once an order's configured time is up. autoReadyInFlight guards
// against calling the RPC twice for the same order across back-to-back ticks
// while the first call is still in flight.
const autoReadyInFlight = new Set();
async function autoMarkReady(orderId){
  if(autoReadyInFlight.has(orderId)) return;
  autoReadyInFlight.add(orderId);
  const { error } = await window.supabaseClient.rpc('mark_order_ready', { p_order_id: orderId });
  autoReadyInFlight.delete(orderId);
  if(error) return;
  ACTIVE_ORDERS = ACTIVE_ORDERS.filter(o=>o.id !== orderId);
  renderBoard();
}

async function loadActiveOrders(){
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const { data } = await window.supabaseClient
    .from('orders')
    .select('id, channel, created_at, customer_name, table_id, delivery_platform_id, platform_invoice_last4, ' +
      'restaurant_tables!orders_table_id_fkey(number), delivery_platforms(name, logo_url, brand_color, prep_timeout_minutes), ' +
      'order_items(qty, note, selected_modifiers, menu_items(name))')
    .eq('branch_id', DEVICE.branchId).eq('status', 'completed').is('ready_at', null)
    .gte('created_at', startToday.toISOString())
    .order('created_at', { ascending: true });
  ACTIVE_ORDERS = data || [];
  renderBoard();
}

let ordersRealtimeChannel = null;
function subscribeToOrders(){
  if(ordersRealtimeChannel) return;
  // INSERT and UPDATE are split so the new-order sound only ever fires for
  // an actually-new order — an UPDATE (e.g. another device marking an order
  // ready) still needs to refresh the board, but silently.
  ordersRealtimeChannel = window.supabaseClient
    .channel('kds-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, ()=>{
      if(KITCHEN_NEW_ORDER_SOUND_ENABLED) playNewOrderSound();
      loadActiveOrders();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'branch_id=eq.' + DEVICE.branchId }, ()=>{
      loadActiveOrders();
    })
    .subscribe();
}

function tickClock(){
  const el = document.getElementById('kdsClock');
  if(el) el.textContent = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

async function loadKitchenSettings(){
  const { data } = await window.supabaseClient
    .from('businesses').select('kitchen_ready_mode, kitchen_auto_ready_minutes, kitchen_new_order_sound_enabled')
    .eq('id', DEVICE.businessId).single();
  if(data){
    KITCHEN_READY_MODE = data.kitchen_ready_mode === 'auto' ? 'auto' : 'manual';
    KITCHEN_AUTO_READY_MINUTES = Number(data.kitchen_auto_ready_minutes) || 15;
    KITCHEN_NEW_ORDER_SOUND_ENABLED = data.kitchen_new_order_sound_enabled !== false;
  }
}

async function bootKitchen(){
  document.getElementById('kdsBusinessName').textContent = DEVICE.businessName || '';
  document.getElementById('kdsBranchName').textContent = DEVICE.branchName || '';
  await loadKitchenSettings();
  await loadActiveOrders();
  subscribeToOrders();
  tickClock();
  if(tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(()=>{
    tickClock();
    if(KITCHEN_READY_MODE === 'auto'){
      ACTIVE_ORDERS.forEach(order=>{
        const { remaining } = orderUrgency(order);
        if(remaining <= 0) autoMarkReady(order.id);
      });
    }
    // re-stamp just the time badges every second — cheap (no re-fetch, no
    // full re-render of item lists), same reasoning as the POS's own
    // 1-second delivery-timer tick.
    document.querySelectorAll('.kds-card').forEach(card=>{
      const order = ACTIVE_ORDERS.find(o=>o.id === parseInt(card.dataset.order, 10));
      if(!order) return;
      const { elapsedSec, remaining, urgency } = orderUrgency(order);
      const timeEl = card.querySelector('[data-elapsed]');
      if(timeEl){
        timeEl.textContent = formatMmSs(elapsedSec);
        timeEl.className = 'kds-card-time mono' + (urgency !== 'ok' ? ' ' + urgency : '');
      }
      const autoEl = card.querySelector('[data-auto-remaining]');
      if(autoEl) autoEl.textContent = 'يختفي تلقائيًا خلال ' + formatMmSs(Math.max(0, remaining));
      card.className = 'kds-card' + (urgency !== 'ok' ? ' ' + urgency : '');
    });
  }, 1000);
  showAuthScreen(null);
}

/* ============ Init ============ */
loadDeviceConfig();
(async function initAuth(){
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if(!DEVICE.businessId || !DEVICE.branchId){
    showAuthScreen('kdsProvisionScreen');
    return;
  }
  if(session){
    try {
      const { data: profile, error } = await window.supabaseClient
        .from('profiles').select('id, business_id, branch_id, user_type').eq('id', session.user.id).single();
      if(error || !profile || profile.user_type !== 'employee' || !profile.branch_id){
        await window.supabaseClient.auth.signOut();
        showLoginScreen();
        return;
      }
      await bootKitchen();
    } catch (e) { showLoginScreen(); }
  } else {
    showLoginScreen();
  }
})();

})();
