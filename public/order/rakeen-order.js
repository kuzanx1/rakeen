/* Rakeen public online-ordering menu — one restaurant's storefront at
   /order/[slug]. Mirrors the real POS menu exactly (same products, same
   choices, same build-your-own boxes) — no separate "online menu" concept
   to keep in sync. No login beyond a remembered phone number (no SMS/OTP —
   keeps this free to run); browsing needs no identity at all, only
   checkout does. Every price is re-verified server-side by
   submit_online_order() — nothing here is trusted for the real charge. */
if (!window.__rakeenOrderBooted) {
  window.__rakeenOrderBooted = true;

  const sb = window.supabaseClient;
  const SLUG = window.RAKEEN_ORDER_SLUG;
  const LS_IDENTITY = 'rakeen_order_identity_' + SLUG;
  const LS_DISPLAY_MODE = 'rakeen_order_display_mode_' + SLUG;
  const LS_LAST_ORDER_TOKEN = 'rakeen_order_last_token_' + SLUG;

  // "Display mode" — a per-device, staff-only setting (stored on this
  // browser only, never touches the business's real settings) for a
  // restaurant that mounts this same page on a screen at the counter purely
  // to show the menu, with no ordering. Persists across reloads on that one
  // device via localStorage; every other customer's own phone is unaffected.
  let DISPLAY_MODE = false;

  // Real reported bug: the phone field's digit-strip used /\D/g, which in
  // JS only matches ASCII 0-9 — a customer typing on an Arabic keyboard
  // (Arabic-Indic ٠-٩, common default in this market) got every character
  // of their number silently wiped instead of converted, since \D treats
  // them as "non-digit" too. Convert both Arabic-Indic and Eastern
  // Arabic-Indic (Persian) digits to Western digits FIRST.
  function toWesternDigits(str){
    return String(str).replace(/[٠-٩۰-۹]/g, ch=>{
      const code = ch.charCodeAt(0);
      return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
    });
  }

  let BUSINESS = null;
  let CATEGORIES = []; // top-level category names only — drives the quick-jump rail
  let CATEGORY_ROWS = []; // {id, name, parentId} for every category, top-level and sub
  let PRODUCTS = [];
  let MODIFIER_PRODUCTS = {}; // menu_item_id -> {groups:[{id,name,type,options:[{id,name,price}]}]}
  let BOX_PRODUCTS = {}; // menu_item_id -> {slots, items:[{id,name}]}
  let BRANCHES = []; // [{id,name,address,lat,lng}]
  let WEEKLY_HOURS = []; // branch_weekly_hours rows; empty = every day uses the branch default
  let CART = []; // [{lineId, productId, qty, config|boxSelections, unitPrice, label}]
  let lineIdCounter = 1;
  let state = {
    channel: 'delivery', branchId: null, branchAutoPicked: false, search: '', customerLat: null, customerLng: null,
    pickupTimeMode: 'asap', scheduledForTimeValue: null,
  };
  let PICKUP_PREP_MINUTES = 20;

  // Haversine distance in km — good enough for "which branch is closest",
  // not real driving-distance routing (which would need a paid maps API).
  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function pickNearestBranch(userLat, userLng) {
    const withCoords = BRANCHES.filter(b => b.lat != null && b.lng != null);
    if (!withCoords.length) return null;
    return withCoords.reduce((best, b) => {
      const d = distanceKm(userLat, userLng, b.lat, b.lng);
      return (!best || d < best.d) ? { branch: b, d } : best;
    }, null)?.branch || null;
  }
  function locateNearestBranch() {
    if (state.channel !== 'delivery' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // same permission grant answers two questions at once: which branch
        // is closest, and where the driver needs to go — no separate ask.
        state.customerLat = pos.coords.latitude;
        state.customerLng = pos.coords.longitude;
        if (BRANCHES.length > 1) {
          const nearest = pickNearestBranch(pos.coords.latitude, pos.coords.longitude);
          if (nearest) { state.branchId = nearest.id; state.branchAutoPicked = true; renderBranchNote(); }
        }
      },
      () => { /* denied/unavailable — silently keep the default branch, address stays typed-only */ }
    );
  }
  function renderBranchNote() {
    const note = document.getElementById('omBranchNote');
    if (!note) return;
    const branch = BRANCHES.find(b => b.id === state.branchId);
    if (!branch || BRANCHES.length <= 1) { note.style.display = 'none'; return; }
    note.style.display = 'flex';
    const label = state.channel === 'delivery'
      ? (state.branchAutoPicked ? `أقرب فرع — ${branch.name}` : `التجهيز من — ${branch.name}`)
      : `الاستلام من — ${branch.name}`;
    note.innerHTML = `<span>${label}</span>${BRANCHES.length > 1 ? `<button id="omChangeBranchBtn" type="button">تغيير</button>` : ''}`;
    const changeBtn = document.getElementById('omChangeBranchBtn');
    if (changeBtn) changeBtn.addEventListener('click', openBranchPicker);
  }
  // Pickup only — a delivery order's branch is just internal routing info,
  // not somewhere the customer needs to go themselves. Shows every branch
  // that has a location set (not just the currently selected one) — this is
  // "where are you" info for the whole business, not tied to one order.
  // The embed uses Google's plain iframe form (?output=embed) rather than
  // the JS Maps API, which needs a billed API key this project has none of.
  function renderFooterLocation() {
    const container = document.getElementById('omFooterLocations');
    if (!container) return;
    // A staff-mounted kiosk screen has no reason to show directions to
    // itself — same reasoning as hiding the channel row / cart in display
    // mode.
    if (DISPLAY_MODE) { container.style.display = 'none'; return; }
    if (state.channel !== 'pickup') { container.style.display = 'none'; return; }
    const branches = BRANCHES.filter(b => b.lat != null || b.address);
    if (!branches.length) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    container.innerHTML = branches.map(b => {
      const mapQuery = b.lat != null && b.lng != null ? `${b.lat},${b.lng}` : b.address;
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
      const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
      return `
        <div class="om-footer-location-card">
          <a class="om-footer-location-head" href="${mapsLink}" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span class="om-footer-location-name">${b.name}</span>
          </a>
          ${b.address ? `<div class="om-footer-location-address">${b.address}</div>` : ''}
          <iframe class="om-footer-location-map" src="${embedSrc}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      `;
    }).join('');
  }
  function openBranchPicker() {
    const overlay = document.getElementById('omModifierOverlay');
    document.getElementById('omModifierTitle').textContent = 'اختر الفرع';
    document.getElementById('omModifierBody').innerHTML = `
      <div class="om-branch-list">
        ${BRANCHES.map(b => `<button class="om-branch-item ${b.id === state.branchId ? 'selected' : ''}" data-id="${b.id}">
          <span class="om-branch-name">${b.name}</span>
          ${b.address ? `<span class="om-branch-address">${b.address}</span>` : ''}
        </button>`).join('')}
      </div>
    `;
    document.querySelectorAll('.om-branch-item').forEach(btn => {
      btn.addEventListener('click', () => {
        state.branchId = parseInt(btn.dataset.id, 10);
        state.branchAutoPicked = false;
        overlay.classList.remove('show');
        renderBranchNote();
        renderFooterLocation();
        if (CART.length > 0) openCheckout();
      });
    });
    overlay.classList.add('show');
  }

  function showToast(msg) {
    const t = document.getElementById('omToast');
    document.getElementById('omToastText').textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function formatPrice(n) {
    let s = Number(n || 0).toFixed(2);
    s = s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return s + ' SAR';
  }

  // ============ Display mode (staff-only, per-device, view-only menu) ============
  function loadDisplayMode() {
    try { DISPLAY_MODE = localStorage.getItem(LS_DISPLAY_MODE) === '1'; } catch { DISPLAY_MODE = false; }
  }
  // Used to swap in fixed kiosk labels ("المنيو"/"تصفح قائمة الطعام") whenever
  // DISPLAY_MODE was on, on the theory that the ordering-specific taglines
  // stop making sense once nobody can actually order from this screen. The
  // merchant explicitly asked for the opposite: their own header/hero
  // tagline is their brand identity and must stay put regardless of display
  // mode, not flip to generic kiosk text every time this runs (boot() calls
  // it unconditionally, so any device that had display mode toggled on even
  // once — the setting persists in localStorage — would show the real
  // tagline for an instant and then visibly snap to the kiosk one on every
  // single load). Kept as its own function (called from setDisplayMode() and
  // boot()) since it's still the single place that (re)applies the tagline
  // whenever either of those change, just without the mode branch anymore.
  function updateTaglinesForDisplayMode() {
    if (!BUSINESS) return;
    applyTagline('omBrandTag', BUSINESS.online_tagline_header, DEFAULT_TAGLINE_HEADER);
    applyTagline('omHeroChip', BUSINESS.online_tagline_hero, DEFAULT_TAGLINE_HERO);
  }
  function updateChannelRowVisibility() {
    const channelRow = document.getElementById('omChannelRow');
    if (!channelRow) return;
    const hasChannelChoice = channelRow.children.length > 1;
    channelRow.style.display = (DISPLAY_MODE || !hasChannelChoice) ? 'none' : '';
  }
  function updateCartVisibilityForDisplayMode() {
    const desktopCart = document.getElementById('omDesktopCart');
    if (DISPLAY_MODE) {
      document.getElementById('omCartBar').style.display = 'none';
      if (desktopCart) desktopCart.style.display = 'none';
    } else {
      if (desktopCart) desktopCart.style.display = '';
      renderCartBar();
    }
  }
  function renderDisplayModeToggle() {
    const el = document.getElementById('omDisplayModeToggle');
    if (!el) return;
    el.innerHTML = DISPLAY_MODE
      ? `<button type="button" class="om-display-mode-link" id="omExitDisplayModeBtn">إنهاء وضع العرض</button>`
      : `<button type="button" class="om-display-mode-link" id="omEnterDisplayModeBtn">وضع العرض فقط</button>`;
    const enterBtn = document.getElementById('omEnterDisplayModeBtn');
    if (enterBtn) enterBtn.addEventListener('click', () => setDisplayMode(true));
    const exitBtn = document.getElementById('omExitDisplayModeBtn');
    if (exitBtn) exitBtn.addEventListener('click', () => setDisplayMode(false));
  }
  function setDisplayMode(on) {
    DISPLAY_MODE = on;
    try { localStorage.setItem(LS_DISPLAY_MODE, on ? '1' : '0'); } catch {}
    updateChannelRowVisibility();
    updateCartVisibilityForDisplayMode();
    updateTaglinesForDisplayMode();
    renderFooterLocation();
    renderMenu();
    renderDisplayModeToggle();
  }

  // ============ Pickup time ============
  // Frozen once per checkout attempt (state.asapTargetTime, set in
  // openCheckout()) rather than recomputed fresh on every call — otherwise
  // the live countdown shown to the customer would silently drift from the
  // actual scheduled_for value submitted at confirm time (a few minutes
  // could pass while they fill in phone/name/notes).
  function pickupEarliestEstimate() { return state.asapTargetTime || new Date(Date.now() + PICKUP_PREP_MINUTES * 60000); }
  function timeStrToMinutes(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
  function formatTimeStrLabel(t) {
    const [h, m] = String(t).split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }
  // Business hours were only ever used to bound the "later" time picker —
  // nothing stopped an "ASAP" pickup order from being placed while the
  // branch is already closed (e.g. ordering at 3am against 15:00–02:00
  // hours). Handles the overnight-span case (closing time earlier than
  // opening time) the same way pickupWindow() does.
  // Today's effective hours for a branch: the weekday override if there is
  // one, otherwise the branch's normal pair. Returns null when the branch
  // is shut today, and {open, close} otherwise -- callers must tell those
  // apart, since "closed today" and "no hours configured" mean opposite
  // things (the latter has always meant "always open" here).
  function branchHoursToday(branch, when) {
    if (!branch) return { open: null, close: null };
    const day = (when || new Date()).getDay();
    const o = WEEKLY_HOURS.find(r => String(r.branch_id) === String(branch.id) && Number(r.weekday) === day);
    if (o) {
      if (o.is_closed) return null;
      if (o.opening_time && o.closing_time) return { open: o.opening_time, close: o.closing_time };
    }
    return { open: branch.opening_time, close: branch.closing_time };
  }

  function isBranchOpenNow(branch) {
    if (!branch) return true;
    const hours = branchHoursToday(branch);
    if (hours === null) return false; // shut today
    if (!hours.open || !hours.close) return true;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const openMin = timeStrToMinutes(hours.open);
    const closeMin = timeStrToMinutes(hours.close);
    if (closeMin > openMin) return nowMin >= openMin && nowMin < closeMin;
    return nowMin >= openMin || nowMin < closeMin;
  }
  function toTimeValue(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  // Returns {earliest, closesAt} bounding the pickup-time picker, or null if
  // the branch has no operating hours configured — in that case the page
  // never fabricates a closing time, it just skips the picker entirely and
  // shows the ASAP estimate as informational text only.
  function pickupWindow() {
    const branch = BRANCHES.find(b => b.id === state.branchId) || (BRANCHES.length === 1 ? BRANCHES[0] : null);
    if (!branch) return null;
    const todayHours = branchHoursToday(branch);
    // Shut today, or no hours at all: no window to offer. The picker is
    // skipped entirely rather than fabricating one.
    if (!todayHours || !todayHours.open || !todayHours.close) return null;
    const now = new Date();
    const earliest = pickupEarliestEstimate();
    const openMin = timeStrToMinutes(todayHours.open);
    const closeMin = timeStrToMinutes(todayHours.close);
    const closesAt = new Date(now);
    closesAt.setHours(Math.floor(closeMin / 60), closeMin % 60, 0, 0);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (closeMin < openMin && nowMin >= openMin) closesAt.setDate(closesAt.getDate() + 1);
    return { earliest, closesAt };
  }
  // The Date the order will actually be submitted with — either the ASAP
  // estimate, or the customer's chosen later time clamped into the window.
  function resolveScheduledFor() {
    if (state.channel !== 'pickup') return null;
    const win = pickupWindow();
    if (state.pickupTimeMode === 'later' && state.scheduledForTimeValue && win) {
      const [h, m] = state.scheduledForTimeValue.split(':').map(Number);
      let d = new Date();
      d.setHours(h, m, 0, 0);
      if (d < win.earliest) d = new Date(win.earliest);
      if (d > win.closesAt) d = new Date(win.closesAt);
      return d;
    }
    return pickupEarliestEstimate();
  }
  function pickupTimeBlockHtml() {
    const win = pickupWindow();
    const earliestLabel = pickupEarliestEstimate().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    if (!win) {
      return `<div class="om-field"><label>وقت التجهيز</label><p class="om-pickup-estimate">⏱ وقت التجهيز المتوقع: تقريبًا الساعة ${earliestLabel}</p></div>`;
    }
    const closesLabel = win.closesAt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="om-field">
        <label>وقت الاستلام</label>
        <div class="om-time-toggle">
          <button type="button" class="om-time-chip ${state.pickupTimeMode !== 'later' ? 'active' : ''}" data-mode="asap">الآن</button>
          <button type="button" class="om-time-chip ${state.pickupTimeMode === 'later' ? 'active' : ''}" data-mode="later">وقت لاحق</button>
        </div>
        ${state.pickupTimeMode === 'later' ? `<div class="om-time-picker-row"><input type="time" id="omPickupTimeInput" value="${state.scheduledForTimeValue || toTimeValue(win.earliest)}" min="${toTimeValue(win.earliest)}" max="${toTimeValue(win.closesAt)}"></div>` : ''}
        <p class="om-pickup-estimate">دوام الفرع إلى الساعة ${closesLabel}</p>
      </div>
    `;
  }
  // No ticking countdown here on purpose — a live "جاهزة خلال ٠٠:٠٠" clock
  // before the order is even confirmed implies a promise that hasn't been
  // made yet. The real countdown only starts once the order is placed and
  // accepted, tied to the actual scheduled_for stored on the row — see the
  // "قيد التجهيز" step on the order-status page.
  function renderPickupTimeBlock() {
    const container = document.getElementById('omPickupTimeBlock');
    if (!container) return;
    container.innerHTML = pickupTimeBlockHtml();
    container.querySelectorAll('.om-time-chip').forEach(chip => {
      chip.addEventListener('click', () => { state.pickupTimeMode = chip.dataset.mode; renderPickupTimeBlock(); });
    });
    const timeInput = document.getElementById('omPickupTimeInput');
    if (timeInput) timeInput.addEventListener('change', () => { state.scheduledForTimeValue = timeInput.value; });
  }

  // Lets the owner pick literally any accent color from Settings and still
  // get readable text/icons on top of it — perceived-luminance check (the
  // same YIQ-style formula browsers' own contrast tools use), not a fixed
  // dark-green ink that only happened to work for the lime default.
  function inkColorFor(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return '#16281B';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? '#16281B' : '#FDFCF7';
  }

  const DEFAULT_TAGLINE_HEADER = 'اطلب مباشرة من المطعم';
  const DEFAULT_TAGLINE_HERO = 'طلب مباشر بدون عمولة تطبيقات';
  // null = never customized (show the built-in default), '' = merchant
  // explicitly cleared it to hide it, any other string = custom text.
  function resolveTagline(value, fallback) {
    if (value === '') return '';
    return value || fallback;
  }
  function applyTagline(elId, value, fallback) {
    const el = document.getElementById(elId);
    const resolved = resolveTagline(value, fallback);
    if (!resolved) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = resolved;
  }

  const SOCIAL_ICONS = {
    whatsapp: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm5.8 14.24c-.24.68-1.4 1.3-1.93 1.34-.5.05-.98.24-3.3-.7-2.8-1.13-4.6-3.97-4.74-4.15-.14-.19-1.13-1.5-1.13-2.86s.71-2.03.96-2.3c.24-.28.53-.35.71-.35h.5c.16 0 .38-.03.58.44.24.56.8 1.94.87 2.08.07.14.12.3.02.49-.1.19-.15.3-.29.47-.14.16-.3.36-.43.48-.14.14-.29.29-.13.57.17.28.75 1.24 1.62 2.01 1.12.99 2.05 1.3 2.34 1.44.29.14.46.12.63-.07.17-.2.72-.83.91-1.12.19-.28.38-.23.63-.14.26.1 1.63.77 1.91.91.29.14.48.21.55.33.07.12.07.68-.17 1.36z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M16.6 2h-3.3v13.9c0 1.6-1.3 2.9-2.9 2.9a2.9 2.9 0 0 1-2.9-2.9 2.9 2.9 0 0 1 2.9-2.9c.3 0 .6.05.9.13v-3.35a6.25 6.25 0 0 0-.9-.07 6.25 6.25 0 0 0-6.25 6.25 6.25 6.25 0 0 0 6.25 6.25 6.25 6.25 0 0 0 6.25-6.25V8.6a8.1 8.1 0 0 0 4.65 1.47V6.75a4.85 4.85 0 0 1-4.65-4.75z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M18.9 3H22l-7.35 8.4L23 21h-6.8l-5.3-6.9L4.7 21H1.6l7.85-8.98L1 3h6.95l4.8 6.35zM17.7 19h1.9L7.4 4.9H5.4z"/></svg>',
  };
  function renderSocialLinks(biz) {
    const links = [
      biz.online_contact_whatsapp ? { key: 'whatsapp', url: 'https://wa.me/' + biz.online_contact_whatsapp.replace(/[^0-9]/g, '') } : null,
      biz.online_social_instagram ? { key: 'instagram', url: biz.online_social_instagram } : null,
      biz.online_social_tiktok ? { key: 'tiktok', url: biz.online_social_tiktok } : null,
      biz.online_social_twitter ? { key: 'twitter', url: biz.online_social_twitter } : null,
    ].filter(Boolean);
    const el = document.getElementById('omHeroSocial');
    if (!links.length) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = links.map(l => `<a class="om-social-link" href="${l.url}" target="_blank" rel="noopener noreferrer">${SOCIAL_ICONS[l.key]}</a>`).join('');
  }

  // ============ Persistent order tracking (return-visit shortcut) ============
  // Set once at successful checkout (submitOrder(), LS_LAST_ORDER_TOKEN
  // writes above) — never read back until now. This USED to hard-redirect a
  // returning customer straight to /order-status, stranding them there with
  // no way back to the menu — owner feedback: "الفاتورة تقعد معلقة بالجوال،
  // الغيها". Now it just shows a small floating "طلبك" shortcut over the
  // normal menu, so the customer sees the shop first and taps through only
  // if they want to. The shortcut disappears half an hour past whatever time
  // is actually relevant to the customer: the scheduled pickup/delivery time
  // if they chose one, otherwise half an hour after the order was placed —
  // by then it's either been handled or checking back here won't help.
  const ACTIVE_ORDER_TERMINAL_STATUSES = ['cancelled', 'rejected', 'refunded'];
  const TRACK_FAB_WINDOW_MS = 30 * 60 * 1000;
  async function checkTrackOrderFab() {
    const fab = document.getElementById('omTrackOrderFab');
    let token;
    try { token = localStorage.getItem(LS_LAST_ORDER_TOKEN); } catch { return; }
    if (!token) { fab.style.display = 'none'; return; }
    try {
      const { data, error } = await sb.rpc('get_order_status', { p_token: token }).maybeSingle();
      if (error || !data) { try { localStorage.removeItem(LS_LAST_ORDER_TOKEN); } catch {} fab.style.display = 'none'; return; }
      const isTerminal = ACTIVE_ORDER_TERMINAL_STATUSES.includes(data.status);
      // delivered_at is the real "customer has it in hand" signal — once
      // that's set there's nothing left to track, regardless of the window.
      const isDone = isTerminal || data.delivered_at != null;
      // scheduled_for is populated even for an ASAP order (it's also used as
      // the internal ready-time estimate) — scheduled_by_customer is the
      // real signal for "the customer picked this time on purpose", which is
      // the only case that should anchor the window to it instead of when
      // the order was placed.
      const relevantTimeMs = (data.scheduled_by_customer && data.scheduled_for)
        ? new Date(data.scheduled_for).getTime()
        : new Date(data.created_at).getTime();
      const expired = Date.now() >= relevantTimeMs + TRACK_FAB_WINDOW_MS;
      if (isDone || expired) {
        try { localStorage.removeItem(LS_LAST_ORDER_TOKEN); } catch {}
        fab.style.display = 'none';
        return;
      }
      fab.style.display = 'flex';
      fab.onclick = () => { window.location.href = '/order-status/' + token; };
    } catch {
      fab.style.display = 'none';
    }
  }

  async function boot() {
    checkTrackOrderFab();
    document.getElementById('omMenu').innerHTML = `<div class="om-loading"><div class="om-spinner"></div></div>`;

    let biz, error;
    try {
      const res = await sb.from('businesses')
        .select('id, name, logo_url, online_banner_url, online_theme_color, online_theme_style, online_font_family, online_color_surf, online_color_card, online_color_ink, online_color_muted, online_offers_delivery, online_offers_pickup, online_delivery_fee, online_pickup_prep_minutes, vat_rate, prices_include_vat, vat_registered, online_order_free_count, online_subscribed, online_order_free_limit, is_active, geidea_connected, verification_status, online_contact_whatsapp, online_social_instagram, online_social_tiktok, online_social_twitter, online_tagline_header, online_tagline_hero')
        .eq('online_menu_slug', SLUG).eq('online_ordering_enabled', true).maybeSingle();
      biz = res.data; error = res.error;
    } catch (e) { error = e; }

    if (error || !biz || !biz.is_active) {
      document.getElementById('omApp').style.display = 'none';
      document.body.insertAdjacentHTML('beforeend', `<div class="om-unavailable"><p>هذا المطعم مو متاح للطلب الإلكتروني حاليًا.</p></div>`);
      return;
    }
    if (biz.verification_status === 'pending') {
      document.getElementById('omApp').style.display = 'none';
      document.body.insertAdjacentHTML('beforeend', `<div class="om-unavailable"><p>هذا المتجر قيد المراجعة من فريق ركين حالياً — يتفعّل قريباً.</p></div>`);
      return;
    }
    if (biz.verification_status === 'rejected') {
      document.getElementById('omApp').style.display = 'none';
      document.body.insertAdjacentHTML('beforeend', `<div class="om-unavailable"><p>هذا المطعم مو متاح للطلب الإلكتروني حاليًا.</p></div>`);
      return;
    }
    if (!biz.online_subscribed && Number(biz.online_order_free_count) >= Number(biz.online_order_free_limit || 350)) {
      document.getElementById('omApp').style.display = 'none';
      document.body.insertAdjacentHTML('beforeend', `<div class="om-unavailable"><p>انتهت الفترة التجريبية المجانية لهذا المتجر — تواصل مع صاحب المطعم.</p></div>`);
      return;
    }
    BUSINESS = biz;
    PICKUP_PREP_MINUTES = Number(biz.online_pickup_prep_minutes) || 20;
    const titleTagline = resolveTagline(biz.online_tagline_hero, DEFAULT_TAGLINE_HERO);
    document.title = titleTagline ? `${biz.name} - ${titleTagline}` : biz.name;
    if (biz.logo_url) {
      let favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon); }
      favicon.href = biz.logo_url;
    }
    const omShell = document.getElementById('omShell');
    const themeName = biz.online_theme_style === 'luxury' ? 'luxury' : 'classic';
    omShell.setAttribute('data-theme', themeName);
    // ALSO on <html> — the cart bar and every bottom sheet (cart/checkout/
    // modifier/branch-picker) are siblings of #omShell in order-markup.ts,
    // not descendants of it, so a `.om-shell[data-theme=...] .om-cart-bar`
    // selector can never match them no matter how it's written. This was a
    // real, previously-undetected bug (the bottom cart bar was showing
    // alongside the desktop sidebar cart whenever the cart had items) — CSS
    // now targets those specific siblings via `html[data-theme=...]` instead.
    document.documentElement.setAttribute('data-theme', themeName);
    // Applied on #omShell itself (not just documentElement) — the luxury
    // theme's own CSS sets --surf/--card/--ink/--muted on this exact
    // selector, and a property set higher up (documentElement) only reaches
    // #omShell's descendants by INHERITANCE, which any rule actually
    // matching #omShell (including that theme rule) wins over regardless of
    // specificity. Setting it here too means a merchant's custom color
    // always wins over the theme default inside #omShell, in every theme.
    //
    // It's ALSO applied on documentElement, because the cart bar and every
    // bottom sheet (cart/checkout/modifier/branch-picker) are siblings of
    // #omShell in order-markup.ts, not descendants of it — an override set
    // only on #omShell never reaches them via inheritance at all, so without
    // this they silently keep Rakeen's own default colors instead of the
    // merchant's. No theme-scoped rule targets those sibling elements (the
    // luxury selector above only ever matches things under #omShell), so
    // there's no cascade fight to worry about for them.
    const themeColor = biz.online_theme_color || '#C7FF4D';
    const themeInk = inkColorFor(themeColor);
    document.documentElement.style.setProperty('--brand', themeColor);
    document.documentElement.style.setProperty('--brand-ink', themeInk);
    omShell.style.setProperty('--brand', themeColor);
    omShell.style.setProperty('--brand-ink', themeInk);
    if (biz.online_color_surf) { document.documentElement.style.setProperty('--surf', biz.online_color_surf); omShell.style.setProperty('--surf', biz.online_color_surf); }
    if (biz.online_color_card) { document.documentElement.style.setProperty('--card', biz.online_color_card); omShell.style.setProperty('--card', biz.online_color_card); }
    if (biz.online_color_ink) { document.documentElement.style.setProperty('--ink', biz.online_color_ink); omShell.style.setProperty('--ink', biz.online_color_ink); }
    if (biz.online_color_muted) { document.documentElement.style.setProperty('--muted', biz.online_color_muted); omShell.style.setProperty('--muted', biz.online_color_muted); }
    document.documentElement.setAttribute('data-font', biz.online_font_family === 'thmanyah' ? 'thmanyah' : 'rakeen');

    document.getElementById('omBrandName').textContent = biz.name;
    if (biz.logo_url) {
      document.getElementById('omLogo').innerHTML = `<img src="${biz.logo_url}" alt="">`;
      document.getElementById('omHeroLogo').innerHTML = `<img src="${biz.logo_url}" alt="">`;
    } else {
      document.getElementById('omLogo').textContent = (biz.name || '؟').trim().charAt(0);
      document.getElementById('omHeroLogo').textContent = (biz.name || '؟').trim().charAt(0);
    }
    document.getElementById('omHeroName').textContent = biz.name;
    if (biz.online_banner_url) {
      const heroEl = document.getElementById('omHero');
      heroEl.classList.add('has-banner');
      document.getElementById('omHeroBanner').style.backgroundImage = `url("${biz.online_banner_url}")`;
    }
    renderSocialLinks(biz);
    applyTagline('omBrandTag', biz.online_tagline_header, DEFAULT_TAGLINE_HEADER);
    applyTagline('omHeroChip', biz.online_tagline_hero, DEFAULT_TAGLINE_HERO);
    // Only reveal the shell once its real theme/branding is in place — see
    // the .om-shell{opacity:0} comment in rakeen-order.css for why.
    omShell.classList.add('om-ready');

    const channelRow = document.getElementById('omChannelRow');
    if (!biz.online_offers_delivery) channelRow.querySelector('[data-channel="delivery"]').remove();
    if (!biz.online_offers_pickup) channelRow.querySelector('[data-channel="pickup"]').remove();
    if (!biz.online_offers_delivery && biz.online_offers_pickup) {
      state.channel = 'pickup';
      channelRow.querySelector('[data-channel="pickup"]')?.classList.add('active');
    }
    if (channelRow.children.length <= 1) channelRow.style.display = 'none';

    try {
      const { data: branches } = await sb.from('branches').select('id, name, address, lat, lng, opening_time, closing_time').eq('business_id', biz.id).order('id');
      BRANCHES = branches || [];
      // Per-weekday overrides. Its own request, and a failure here leaves
      // WEEKLY_HOURS empty, which means every branch falls back to its
      // normal hours -- the behaviour before overrides existed.
      try {
        const { data: wh } = await sb.from('branch_weekly_hours')
          .select('branch_id, weekday, opening_time, closing_time, is_closed')
          .eq('business_id', biz.id);
        WEEKLY_HOURS = wh || [];
      } catch { WEEKLY_HOURS = []; }
      state.branchId = BRANCHES.length === 1 ? BRANCHES[0].id : null;
    } catch { BRANCHES = []; }

    try {
      await loadMenu(biz.id);
    } catch {
      document.getElementById('omMenu').innerHTML = `<div class="om-menu-empty">تعذر تحميل المنيو — حدّث الصفحة وحاول مرة ثانية.</div>`;
      return;
    }
    loadDisplayMode();
    renderCatRail();
    renderMenu();
    loadCartFromStorage();
    renderCartBar();
    renderDesktopCart();
    updateChannelRowVisibility();
    updateCartVisibilityForDisplayMode();
    updateTaglinesForDisplayMode();
    renderDisplayModeToggle();
    wireEvents();
    renderBranchNote();
    renderFooterLocation();
    if (state.channel === 'delivery') locateNearestBranch();
  }

  async function loadMenu(businessId) {
    // Only these three are actually scoped by business_id server-side (RLS
    // on modifier_options/menu_item_modifier_groups/menu_item_box_eligible_items
    // only checks "belongs to *some* online-ordering business", not *this*
    // one, since those tables have no direct business_id column to filter
    // on) — so this business's items/groups are fetched first, then used to
    // .in()-scope the rest below instead of pulling the whole platform's
    // modifier/box data on every single storefront page load.
    const [catRes, itemsRes, groupRes] = await Promise.all([
      sb.from('menu_categories').select('*').eq('business_id', businessId).order('sort_order'),
      sb.from('menu_items').select('id, category_id, name, name_en, price, online_price, image_url, cost_mode, total_pieces, online_tag_label, online_tag_color').eq('business_id', businessId).eq('active', true).eq('visible_online', true).or(`hidden_until.is.null,hidden_until.lt.${new Date().toISOString()}`).order('sort_order').order('id'),
      sb.from('modifier_groups').select('*').eq('business_id', businessId),
    ]);
    CATEGORY_ROWS = (catRes.data || []).map(c => ({ id: c.id, name: c.name, parentId: c.online_parent_category_id || null }));
    // Only top-level categories get a rail chip/anchor — a sub-category
    // renders as a heading nested inside its parent's section instead (see
    // renderMenu), so it doesn't need its own top-level jump target.
    CATEGORIES = CATEGORY_ROWS.filter(c => !c.parentId).map(c => c.name);

    PRODUCTS = (itemsRes.data || []).map(m => ({
      id: m.id, name: m.name, nameEn: m.name_en || '', price: Number(m.online_price != null ? m.online_price : m.price), categoryId: m.category_id,
      image: m.image_url || null, costMode: m.cost_mode, totalPieces: m.total_pieces || 0,
      tagLabel: m.online_tag_label || '', tagColor: m.online_tag_color || '#3E7BFA',
    }));

    const itemIds = PRODUCTS.map(p => p.id);
    const groupIds = (groupRes.data || []).map(g => g.id);
    const [optRes, linkRes, boxEligRes] = await Promise.all([
      groupIds.length ? sb.from('modifier_options').select('*').in('group_id', groupIds) : Promise.resolve({ data: [] }),
      itemIds.length ? sb.from('menu_item_modifier_groups').select('*').in('menu_item_id', itemIds) : Promise.resolve({ data: [] }),
      itemIds.length ? sb.from('menu_item_box_eligible_items').select('*').in('menu_item_id', itemIds) : Promise.resolve({ data: [] }),
    ]);

    BOX_PRODUCTS = {};
    const eligByItem = {};
    (boxEligRes.data || []).forEach(e => { (eligByItem[e.menu_item_id] ||= []).push(e); });
    PRODUCTS.forEach(p => {
      if (p.costMode !== 'box') return;
      const items = (eligByItem[p.id] || []).map(e => ({ id: e.id, name: e.name }));
      BOX_PRODUCTS[p.id] = { slots: p.totalPieces, items };
    });

    const groupIdsByItem = {};
    (linkRes.data || []).forEach(l => { (groupIdsByItem[l.menu_item_id] ||= []).push(l.modifier_group_id); });
    MODIFIER_PRODUCTS = {};
    PRODUCTS.forEach(p => {
      if (p.costMode === 'box') return;
      const groupIds = groupIdsByItem[p.id] || [];
      if (!groupIds.length) return;
      const groups = groupIds.map(gid => {
        const g = (groupRes.data || []).find(x => x.id === gid);
        if (!g) return null;
        const options = (optRes.data || []).filter(o => o.group_id === gid).map((o, i) => ({
          id: String(o.id), name: o.name, price: Number(o.price_delta) || 0, default: i === 0 && g.type === 'single',
        }));
        return { id: String(g.id), name: g.name, type: g.type, options };
      }).filter(Boolean);
      if (groups.length) MODIFIER_PRODUCTS[p.id] = { groups };
    });
  }

  function renderCatRail() {
    const el = document.getElementById('omCatRail');
    if (CATEGORIES.length <= 1) { el.style.display = 'none'; return; }
    el.innerHTML = CATEGORIES.map((c, i) =>
      `<button class="om-cat-chip ${i === 0 ? 'active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
    el.querySelectorAll('.om-cat-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.om-cat-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('cat-' + CSS.escape(btn.dataset.cat))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  const PLACEHOLDER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 2l1.5 20h15L21 2"/><path d="M3 2h18"/><path d="M9 2v6a3 3 0 0 0 6 0V2"/></svg>`;

  function visibleProducts() {
    const q = state.search.trim().toLowerCase();
    if (!q) return PRODUCTS;
    return PRODUCTS.filter(p => p.name.toLowerCase().includes(q));
  }

  function productCardHtml(p) {
    const qtyInCart = CART.filter(l => l.productId === p.id).reduce((s, l) => s + l.qty, 0);
    const isBoxIncomplete = p.costMode === 'box' && BOX_PRODUCTS[p.id] && BOX_PRODUCTS[p.id].items.length === 0;
    return `<button class="om-product-card" data-id="${p.id}" ${isBoxIncomplete ? 'disabled' : ''}>
      <div class="om-product-photo">
        ${p.image ? `<img src="${p.image}" alt="" loading="lazy" decoding="async">` : PLACEHOLDER_SVG}
        ${p.tagLabel ? `<span class="om-product-tag" style="background:${p.tagColor}">${p.tagLabel}</span>` : ''}
        ${qtyInCart > 0 && !DISPLAY_MODE ? `<span class="om-product-qty-badge">${qtyInCart}</span>` : ''}
        ${!DISPLAY_MODE ? `<span class="om-product-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>` : ''}
      </div>
      <div class="om-product-info">
        <div class="om-product-name">
          ${p.nameEn ? `<span class="om-product-name-en">${p.nameEn}</span>` : ''}
          <span class="om-product-name-ar ${p.nameEn ? 'om-name-sub' : ''}">${p.name}</span>
        </div>
        ${p.costMode === 'box' ? `<div class="om-product-badge">تركيبة حرة — ${p.totalPieces} قطعة</div>` : ''}
        <div class="om-product-price">${formatPrice(p.price)}</div>
      </div>
    </button>`;
  }

  function renderMenu() {
    const el = document.getElementById('omMenu');
    const products = visibleProducts();
    if (!products.length) {
      el.innerHTML = `<div class="om-menu-empty">${state.search ? 'ما فيه نتائج مطابقة' : 'المنيو غير متاح حاليًا'}.</div>`;
      return;
    }
    const byCatId = {};
    products.forEach(p => { (byCatId[p.categoryId] ||= []).push(p); });
    // A category counts as top-level either because it has no parent, or its
    // parent no longer exists (defensive — shouldn't happen with the FK's ON
    // DELETE SET NULL, but never silently drop a whole section over it).
    const idExists = id => CATEGORY_ROWS.some(c => c.id === id);
    const topCats = CATEGORY_ROWS.filter(c => !c.parentId || !idExists(c.parentId));
    const childrenByParent = {};
    CATEGORY_ROWS.forEach(c => { if (c.parentId && idExists(c.parentId)) (childrenByParent[c.parentId] ||= []).push(c); });
    const uncategorized = products.filter(p => !CATEGORY_ROWS.some(c => c.id === p.categoryId));

    el.innerHTML = topCats.map(top => {
      const direct = byCatId[top.id] || [];
      const kids = (childrenByParent[top.id] || []).filter(k => (byCatId[k.id] || []).length);
      if (!direct.length && !kids.length) return '';

      if (!kids.length) {
        return `
          <section class="om-cat-section" id="cat-${CSS.escape(top.name)}" data-cat="${top.name}">
            <div class="om-cat-title">${top.name}</div>
            <div class="om-product-list">${direct.map(productCardHtml).join('')}</div>
          </section>
        `;
      }

      // Has subcategories — an editorial title plus an underline-tab row to
      // switch between "الكل" and each one, instead of a long scroll of
      // stacked sub-headings (see the .has-subcats CSS for the visual).
      const views = [
        { id: '__all', name: 'الكل', items: [...direct, ...kids.flatMap(k => byCatId[k.id] || [])] },
        ...kids.map(k => ({ id: String(k.id), name: k.name, items: byCatId[k.id] || [] })),
      ];
      return `
        <section class="om-cat-section has-subcats" id="cat-${CSS.escape(top.name)}" data-cat="${top.name}">
          <div class="om-cat-title">${top.name}</div>
          <div class="om-subcat-tabs">
            ${views.map((v, i) => `<button class="om-subcat-tab ${i === 0 ? 'active' : ''}" data-view="${v.id}">${v.name}</button>`).join('')}
          </div>
          ${views.map((v, i) => `<div class="om-subcat-view" data-view="${v.id}" ${i === 0 ? '' : 'style="display:none;"'}><div class="om-product-list">${v.items.map(productCardHtml).join('')}</div></div>`).join('')}
        </section>
      `;
    }).join('') + (uncategorized.length ? `
      <section class="om-cat-section" id="cat-أخرى">
        <div class="om-cat-title">أخرى</div>
        <div class="om-product-list">${uncategorized.map(productCardHtml).join('')}</div>
      </section>
    ` : '');

    el.querySelectorAll('.om-product-card:not([disabled])').forEach(card => {
      card.addEventListener('click', () => openProduct(parseInt(card.dataset.id, 10)));
    });
    el.querySelectorAll('.om-cat-section.has-subcats').forEach(section => {
      section.querySelectorAll('.om-subcat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          section.querySelectorAll('.om-subcat-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          section.querySelectorAll('.om-subcat-view').forEach(v => { v.style.display = v.dataset.view === tab.dataset.view ? '' : 'none'; });
        });
      });
    });
    setupCatRailScrollSpy();
  }

  // Keeps the rail chip in sync with whichever section is actually in view
  // while scrolling, not just right after a chip is clicked — a band near
  // the top of the viewport (not the dead center) reads as "this is the
  // section you're currently looking at" the way a sticky-nav should.
  let catRailObserver = null;
  function setupCatRailScrollSpy() {
    if (catRailObserver) catRailObserver.disconnect();
    const sections = document.querySelectorAll('.om-cat-section[data-cat]');
    if (!sections.length) return;
    catRailObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const cat = entry.target.dataset.cat;
        document.querySelectorAll('.om-cat-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.cat === cat));
      });
    }, { rootMargin: '-15% 0px -75% 0px', threshold: 0 });
    sections.forEach(sec => catRailObserver.observe(sec));
  }

  // ============ Modifier / box sheet ============
  let modifierState = null;
  let boxState = null;
  function openProduct(productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (product.costMode === 'box') { openBoxBuilder(product); return; }
    const modDef = MODIFIER_PRODUCTS[productId];
    if (!modDef) {
      if (DISPLAY_MODE) { openDisplayQuickView(product); return; }
      addToCart(product, null, 1); showToast('أُضيف — ' + product.name); return;
    }
    const config = {};
    modDef.groups.forEach(g => {
      const def = g.options.find(o => o.default) || g.options[0];
      config[g.id] = def.id;
    });
    modifierState = { product, modDef, config, qty: 1 };
    document.getElementById('omModifierTitle').textContent = 'خصّص طلبك';
    renderModifierSheet();
    document.getElementById('omModifierOverlay').classList.add('show');
  }
  // Display-only screens (a TV/tablet menu with no ordering) have nothing
  // else to show for a plain product with no modifiers — reuses the same
  // sheet/close/backdrop machinery as the customize sheet, just with a
  // bigger photo and no cart controls, purely to browse.
  function openDisplayQuickView(product) {
    document.getElementById('omModifierTitle').textContent = 'تفاصيل المنتج';
    document.getElementById('omModifierBody').innerHTML = `
      <div class="om-quickview">
        <div class="om-quickview-photo">${product.image ? `<img src="${product.image}" alt="">` : PLACEHOLDER_SVG}</div>
        <div class="om-quickview-name">
          ${product.nameEn ? `<span class="om-product-name-en">${product.nameEn}</span>` : ''}
          <span class="om-product-name-ar ${product.nameEn ? 'om-name-sub' : ''}">${product.name}</span>
        </div>
        <div class="om-quickview-price">${formatPrice(product.price)}</div>
      </div>
    `;
    document.getElementById('omModifierOverlay').classList.add('show');
  }
  function computeConfigPrice(product, config, modDef) {
    let price = product.price;
    modDef.groups.forEach(g => {
      const opt = g.options.find(o => o.id === config[g.id]);
      if (opt) price += opt.price;
    });
    return price;
  }
  function sheetHeroHtml(product, subtitle) {
    return `
      <div class="om-sheet-hero">
        <div class="om-sheet-hero-photo">${product.image ? `<img src="${product.image}" alt="">` : PLACEHOLDER_SVG}</div>
        <div class="om-sheet-hero-name">
          ${product.nameEn ? `<span class="om-product-name-en">${product.nameEn}</span>` : ''}
          <span class="om-product-name-ar ${product.nameEn ? 'om-name-sub' : ''}">${product.name}</span>
        </div>
        ${subtitle ? `<div class="om-sheet-hero-sub">${subtitle}</div>` : ''}
      </div>
    `;
  }
  function renderModifierSheet() {
    const { product, modDef, config, qty } = modifierState;
    let html = sheetHeroHtml(product);
    html += modDef.groups.map((g, gi) => `
      <div class="om-mod-group">
        <div class="om-mod-group-name"><span class="om-mod-step">${gi + 1}</span>${g.name}</div>
        <div class="om-mod-options ${g.options.length > 5 ? 'compact' : ''}">
          ${g.options.map(o => `<button class="om-mod-chip ${config[g.id] === o.id ? 'selected' : ''}" data-group="${g.id}" data-opt="${o.id}">
            <span class="om-mod-radio"></span>
            <span class="om-mod-chip-name">${o.name}</span>
            ${o.price ? `<span class="om-mod-chip-price mono">${o.price > 0 ? '+' : ''}${formatPrice(o.price)}</span>` : ''}
          </button>`).join('')}
        </div>
      </div>
    `).join('');
    const unitPrice = computeConfigPrice(product, config, modDef);
    if (!DISPLAY_MODE) {
      html += `
        <div class="om-mod-qty-row">
          <button class="om-mod-qty-btn" id="omModQtyDec">−</button>
          <span class="om-mod-qty-val">${qty}</span>
          <button class="om-mod-qty-btn" id="omModQtyInc">+</button>
        </div>
        <button class="om-mod-confirm" id="omModConfirm">أضف للسلة — <span class="mono">${formatPrice(unitPrice * qty)}</span></button>
      `;
    }
    document.getElementById('omModifierBody').innerHTML = html;
    document.querySelectorAll('.om-mod-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        modifierState.config[chip.dataset.group] = chip.dataset.opt;
        renderModifierSheet();
      });
    });
    const qtyDec = document.getElementById('omModQtyDec');
    if (qtyDec) qtyDec.addEventListener('click', () => { modifierState.qty = Math.max(1, modifierState.qty - 1); renderModifierSheet(); });
    const qtyInc = document.getElementById('omModQtyInc');
    if (qtyInc) qtyInc.addEventListener('click', () => { modifierState.qty += 1; renderModifierSheet(); });
    const confirmBtn = document.getElementById('omModConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
      const label = modDef.groups.map(g => g.options.find(o => o.id === config[g.id])?.name).filter(Boolean).join('، ');
      addToCart(product, { ...config }, qty, label);
      document.getElementById('omModifierOverlay').classList.remove('show');
      showToast('أُضيف — ' + product.name);
    });
  }

  function openBoxBuilder(product) {
    const boxDef = BOX_PRODUCTS[product.id];
    boxState = { product, boxDef, selections: {} };
    boxDef.items.forEach(it => { boxState.selections[it.id] = 0; });
    document.getElementById('omModifierTitle').textContent = 'كوّن بوكسك';
    renderBoxSheet();
    document.getElementById('omModifierOverlay').classList.add('show');
  }
  function renderBoxSheet() {
    const { product, boxDef, selections } = boxState;
    const total = Object.values(selections).reduce((a, b) => a + b, 0);
    const pct = boxDef.slots ? Math.min(100, Math.round((total / boxDef.slots) * 100)) : 0;
    let html = sheetHeroHtml(product, `اختر ${boxDef.slots} قطعة لتكوّن بوكسك`);
    html += `
      <div class="om-box-progress-wrap">
        <div class="om-box-progress-label"><span class="mono">${total} / ${boxDef.slots}</span> قطعة مختارة</div>
        <div class="om-box-progress"><div class="om-box-progress-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="om-box-items ${boxDef.items.length > 5 ? 'compact' : ''}">
        ${boxDef.items.map(it => `
          <div class="om-box-item ${selections[it.id] > 0 ? 'has-qty' : ''}">
            <span class="om-box-item-name">${it.name}</span>
            <div class="om-box-item-qty">
              <button data-dec="${it.id}" ${selections[it.id] === 0 ? 'disabled' : ''}>−</button>
              <span>${selections[it.id]}</span>
              <button data-inc="${it.id}">+</button>
            </div>
          </div>
        `).join('')}
      </div>
      ${!DISPLAY_MODE ? `
        <button class="om-mod-confirm" id="omBoxConfirm" ${total === boxDef.slots ? '' : 'disabled'}>
          ${total === boxDef.slots ? `أضف للسلة — <span class="mono">${formatPrice(product.price)}</span>` : `اختر ${boxDef.slots - total} قطعة كمان`}
        </button>
      ` : ''}
    `;
    document.getElementById('omModifierBody').innerHTML = html;
    document.querySelectorAll('[data-inc]').forEach(btn => btn.addEventListener('click', () => {
      if (total >= boxDef.slots) { showToast('البوكس مكتمل — ' + boxDef.slots + ' قطعة'); return; }
      selections[btn.dataset.inc]++; renderBoxSheet();
    }));
    document.querySelectorAll('[data-dec]').forEach(btn => btn.addEventListener('click', () => {
      if (selections[btn.dataset.dec] > 0) { selections[btn.dataset.dec]--; renderBoxSheet(); }
    }));
    const confirmBtn = document.getElementById('omBoxConfirm');
    if (confirmBtn && total === boxDef.slots) {
      confirmBtn.addEventListener('click', () => {
        const label = boxDef.items.filter(it => selections[it.id] > 0).map(it => `${it.name} ×${selections[it.id]}`).join('، ');
        addToCart(product, null, 1, label, { ...selections });
        document.getElementById('omModifierOverlay').classList.remove('show');
        showToast('أُضيف — ' + product.name);
      });
    }
  }

  // ============ Cart ============
  function addToCart(product, config, qty, label, boxSelections) {
    const modDef = MODIFIER_PRODUCTS[product.id];
    const unitPrice = modDef && config ? computeConfigPrice(product, config, modDef) : product.price;
    const key = product.id + '_' + JSON.stringify(config || boxSelections || {});
    const existing = CART.find(l => l.key === key);
    if (existing) existing.qty += qty;
    else CART.push({ lineId: lineIdCounter++, key, productId: product.id, name: product.name, nameEn: product.nameEn || '', qty, config, boxSelections, unitPrice, label: label || null });
    saveCartToStorage();
    renderCartBar();
    renderDesktopCart();
    renderMenu();
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  // Mirrors submit_online_order's server-side math exactly (same branch,
  // same rounding) so this pre-submit preview never disagrees with what the
  // RPC actually charges. Menu prices are VAT-inclusive by default (KSA
  // legal requirement) — the tax is derived from the sticker price, not
  // added on top of it.
  function cartTotals() {
    const subtotal = CART.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const deliveryFee = state.channel === 'delivery' ? Number(BUSINESS?.online_delivery_fee) || 0 : 0;
    const vatRegistered = BUSINESS?.vat_registered !== false;
    const rate = vatRegistered ? (Number(BUSINESS?.vat_rate) || 0.15) : 0;
    const includeVat = BUSINESS?.prices_include_vat !== false;
    let vat, total;
    if (includeVat) {
      vat = round2((subtotal + deliveryFee) * rate / (1 + rate));
      total = subtotal + deliveryFee;
    } else {
      vat = round2((subtotal + deliveryFee) * rate);
      total = subtotal + deliveryFee + vat;
    }
    return { subtotal, deliveryFee, vat, total };
  }
  function renderCartBar() {
    const bar = document.getElementById('omCartBar');
    const count = CART.reduce((s, l) => s + l.qty, 0);
    if (count === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    document.getElementById('omCartCount').textContent = count;
    document.getElementById('omCartTotal').textContent = formatPrice(cartTotals().total);
  }
  function cartRowsHtml() {
    const { subtotal, deliveryFee, vat, total } = cartTotals();
    return CART.map(l => `
      <div class="om-cart-item" data-line="${l.lineId}">
        <div class="om-cart-item-info">
          <div class="om-cart-item-name">${l.nameEn ? `<span class="om-product-name-en">${l.nameEn}</span>` : ''}<span class="om-product-name-ar ${l.nameEn ? 'om-name-sub' : ''}">${l.name}</span></div>
          ${l.label ? `<div class="om-cart-item-mods">${l.label}</div>` : ''}
          <div class="om-cart-item-price mono">${formatPrice(l.unitPrice)}</div>
        </div>
        <div class="om-cart-qty">
          <button data-action="dec" data-line="${l.lineId}">−</button>
          <span>${l.qty}</span>
          <button data-action="inc" data-line="${l.lineId}">+</button>
        </div>
      </div>
    `).join('') + `
      <div class="om-cart-summary">
        <div class="om-cart-sum-row"><span>المجموع الفرعي</span><span class="mono">${formatPrice(subtotal)}</span></div>
        ${deliveryFee > 0 ? `<div class="om-cart-sum-row"><span>رسوم التوصيل</span><span class="mono">${formatPrice(deliveryFee)}</span></div>` : ''}
        <div class="om-cart-sum-row"><span>ضريبة القيمة المضافة</span><span class="mono">${formatPrice(vat)}</span></div>
        <div class="om-cart-sum-row total"><span>الإجمالي</span><span class="mono">${formatPrice(total)}</span></div>
      </div>
    `;
  }
  function wireCartRows(container) {
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const line = CART.find(l => l.lineId === parseInt(btn.dataset.line, 10));
        if (!line) return;
        if (btn.dataset.action === 'inc') line.qty += 1;
        else { line.qty -= 1; if (line.qty <= 0) CART = CART.filter(l => l.lineId !== line.lineId); }
        saveCartToStorage();
        renderCartSheet();
        renderDesktopCart();
        renderCartBar();
        renderMenu();
      });
    });
  }
  function renderCartSheet() {
    const body = document.getElementById('omCartBody');
    if (CART.length === 0) { body.innerHTML = '<div class="om-cart-empty">سلتك فاضية — رجّع اختر شي من المنيو.</div>'; return; }
    body.innerHTML = cartRowsHtml() + `<button class="om-cart-checkout-btn" id="omGoCheckoutBtn">متابعة الطلب</button>`;
    wireCartRows(body);
    const goBtn = document.getElementById('omGoCheckoutBtn');
    if (goBtn) goBtn.addEventListener('click', openCheckout);
  }
  function renderDesktopCart() {
    const panel = document.getElementById('omDesktopCartBody');
    if (!panel) return;
    if (CART.length === 0) { panel.innerHTML = '<div class="om-cart-empty">سلتك فاضية — اختر شي من المنيو يبدأ يظهر هنا.</div>'; return; }
    panel.innerHTML = cartRowsHtml() + `<button class="om-cart-checkout-btn" id="omGoCheckoutBtnDesktop">متابعة الطلب</button>`;
    wireCartRows(panel);
    const goBtn = document.getElementById('omGoCheckoutBtnDesktop');
    if (goBtn) goBtn.addEventListener('click', openCheckout);
  }
  function saveCartToStorage() { try { localStorage.setItem('rakeen_order_cart_' + SLUG, JSON.stringify(CART)); } catch {} }
  function loadCartFromStorage() {
    try {
      const raw = localStorage.getItem('rakeen_order_cart_' + SLUG);
      if (raw) { CART = JSON.parse(raw); lineIdCounter = Math.max(1, ...CART.map(l => l.lineId + 1)); }
    } catch {}
  }

  // ============ Checkout ============
  function getIdentity() {
    try { return JSON.parse(localStorage.getItem(LS_IDENTITY) || 'null'); } catch { return null; }
  }
  function saveIdentity(name, phone) {
    try { localStorage.setItem(LS_IDENTITY, JSON.stringify({ name, phone })); } catch {}
  }

  // 'card' enablement is computed fresh each render (not a static literal)
  // since it depends on BUSINESS.geidea_connected, which isn't known until
  // boot() resolves — a business that hasn't connected Geidea always sees
  // this as disabled, byte-for-byte identical to before this feature
  // existed. 'applepay' stays disabled/out of scope for this pass.
  // businesses.online_cod_enabled, fetched on its own rather than added to
  // boot()'s column list: PostgREST fails an entire select over one unknown
  // column, and putting it there would take the whole public storefront
  // down on any deploy that landed before the migration. Null means "not
  // asked yet"; anything but an explicit false leaves cash on, so a failed
  // fetch degrades to exactly today's behaviour instead of blocking orders.
  let COD_ENABLED = null;
  let CARD_ENABLED = null;

  async function loadCodEnabled() {
    if (COD_ENABLED !== null) return COD_ENABLED;
    try {
      const { data, error } = await sb
        .from('businesses').select('online_cod_enabled, online_card_enabled').eq('id', BUSINESS.id).single();
      COD_ENABLED = (error || !data) ? true : data.online_cod_enabled !== false;
      CARD_ENABLED = (error || !data) ? true : data.online_card_enabled !== false;
    } catch { COD_ENABLED = true; CARD_ENABLED = true; }
    return COD_ENABLED;
  }

  function getPaymentMethods() {
    return [
      { id: 'cash', label: 'نقدًا عند الاستلام', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>', enabled: COD_ENABLED !== false },
      { id: 'applepay', label: 'Apple Pay', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.5c-4 0-7-3.5-7-8 0-2.5 1.2-4.5 3-5.5"/><path d="M12 6.5c1 0 2 .5 2.5 1.5"/></svg>', enabled: false },
      { id: 'card', label: 'بطاقة', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>', enabled: BUSINESS && BUSINESS.geidea_connected === true && CARD_ENABLED !== false },
    ];
  }
  let checkoutPaymentMethod = 'cash';

  async function openCheckout() {
    document.getElementById('omCartOverlay').classList.remove('show');
    await loadCodEnabled();
    // A store that turned cash off must not leave it preselected.
    const usable = getPaymentMethods().filter(m => m.enabled);
    if (usable.length === 0) {
      // The dashboard refuses to save this combination, so reaching it means
      // something changed underneath -- a gateway disconnected, say. Say so
      // plainly instead of showing a sheet with nothing selectable.
      showToast('الطلب غير متاح حاليًا — تواصل مع المطعم');
      return;
    }
    if (!usable.some(m => m.id === checkoutPaymentMethod)) {
      checkoutPaymentMethod = usable[0].id;
    }
    if (BRANCHES.length > 1 && !state.branchId) { openBranchPicker(); return; }
    const openBranch = BRANCHES.find(b => b.id === state.branchId) || (BRANCHES.length === 1 ? BRANCHES[0] : null);
    if (state.channel === 'pickup' && openBranch && !isBranchOpenNow(openBranch)) {
      showToast('الفرع مغلق حاليًا — يفتح الساعة ' + formatTimeStrLabel(openBranch.opening_time));
      return;
    }
    checkoutPaymentMethod = 'cash';
    state.pickupTimeMode = 'asap';
    state.scheduledForTimeValue = null;
    state.asapTargetTime = new Date(Date.now() + PICKUP_PREP_MINUTES * 60000);
    const identity = getIdentity() || {};
    const { total } = cartTotals();
    const branch = BRANCHES.find(b => b.id === state.branchId);
    document.getElementById('omCheckoutTitle').textContent = 'إتمام الطلب';
    document.getElementById('omCheckoutBody').innerHTML = `
      <div class="om-checkout-total">
        <div class="om-checkout-total-label">الإجمالي${branch ? ' — ' + (state.channel === 'delivery' ? 'من فرع ' : 'استلام من ') + branch.name : ''}</div>
        <div class="om-checkout-total-amount mono">${formatPrice(total)}</div>
      </div>
      ${BRANCHES.length > 1 ? `<button class="om-branch-switch-link" id="omSwitchBranchBtn" type="button">${state.channel === 'pickup' ? 'تغيير فرع الاستلام' : 'تغيير الفرع'}</button>` : ''}
      <div class="om-field"><label>رقم الجوال</label><input type="tel" id="omPhone" inputmode="tel" placeholder="05xxxxxxxx" maxlength="10" value="${identity.phone || ''}"></div>
      <div class="om-field"><label>الاسم</label><input type="text" id="omName" placeholder="اسمك" value="${identity.name || ''}"></div>
      ${state.channel === 'pickup' ? `<div id="omPickupTimeBlock"></div>` : ''}
      ${state.channel === 'delivery' && state.customerLat != null ? `
        <div class="om-field">
          <label>موقعك على الخريطة</label>
          <div class="om-pin-block" id="omPinBlock">
            <div class="om-pin-viewport" id="omPinViewport">
              <div class="om-pin-tiles" id="omPinTiles"></div>
              <svg class="om-pin-crosshair" viewBox="0 0 28 28" fill="none">
                <path d="M14 27c6-7 9-11.5 9-16A9 9 0 1 0 5 11c0 4.5 3 9 9 16z" fill="var(--brand)" stroke="var(--brand-ink)" stroke-width="1.5"/>
                <circle cx="14" cy="11" r="3.2" fill="var(--brand-ink)"/>
              </svg>
            </div>
            <p class="om-pin-address" id="omPinAddress">🔎 جاري تحديد العنوان...</p>
            <p class="om-pin-hint">مو دقيق؟ حرّك الخريطة لتعديل موقعك</p>
          </div>
        </div>
      ` : ''}
      ${state.channel === 'delivery' ? `<div class="om-field"><label>وجّه المندوب لموقعك (اختياري)</label><textarea id="omAddress" placeholder="مثال: بجانب صيدلية النهدي، عمارة بيضاء، الدور ٢"></textarea></div>` : ''}
      <div class="om-field"><label>ملاحظات (اختياري)</label><textarea id="omNote" placeholder="أي طلب خاص..."></textarea></div>
      <div class="om-field">
        <label>طريقة الدفع</label>
        <div class="om-payment-methods">
          ${getPaymentMethods().map(m => `<button class="om-payment-chip ${m.id === checkoutPaymentMethod ? 'selected' : ''} ${m.enabled ? '' : 'disabled'}" data-method="${m.id}" ${m.enabled ? '' : 'disabled'}>
            ${m.icon}<span>${m.label}</span>${!m.enabled ? '<span class="om-soon-badge">قريبًا</span>' : ''}
          </button>`).join('')}
        </div>
      </div>
      <button class="om-confirm-order-btn" id="omConfirmOrderBtn">${confirmButtonLabel()}</button>
    `;
    if (state.channel === 'pickup') renderPickupTimeBlock();
    if (state.channel === 'delivery' && state.customerLat != null) renderPinBlock();
    document.getElementById('omConfirmOrderBtn').addEventListener('click', proceedToPhoneConfirm);
    document.getElementById('omPhone').addEventListener('input', (e) => {
      e.target.value = toWesternDigits(e.target.value).replace(/\D/g, '').slice(0, 10);
    });
    const switchBtn = document.getElementById('omSwitchBranchBtn');
    if (switchBtn) switchBtn.addEventListener('click', openBranchPicker);
    document.querySelectorAll('.om-payment-chip:not(.disabled)').forEach(chip => {
      chip.addEventListener('click', () => {
        checkoutPaymentMethod = chip.dataset.method;
        document.querySelectorAll('.om-payment-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const confirmBtn = document.getElementById('omConfirmOrderBtn');
        if (confirmBtn) confirmBtn.textContent = confirmButtonLabel();
      });
    });
    document.getElementById('omCheckoutOverlay').classList.add('show');
  }

  function confirmButtonLabel() {
    if (checkoutPaymentMethod === 'card') return 'الدفع بالبطاقة الآن';
    return 'تأكيد الطلب — دفع نقدي عند ' + (state.channel === 'delivery' ? 'التوصيل' : 'الاستلام');
  }

  // ============ Phone-confirm step ============
  let pendingOrder = null;
  function proceedToPhoneConfirm() {
    const phone = document.getElementById('omPhone').value.trim();
    const name = document.getElementById('omName').value.trim();
    if (!/^05\d{8}$/.test(phone)) { showToast('اكتب رقم جوال سعودي صحيح (05xxxxxxxx)'); return; }
    if (!name) { showToast('اكتب اسمك'); return; }
    pendingOrder = {
      phone, name,
      address: document.getElementById('omAddress')?.value.trim() || null,
      note: document.getElementById('omNote').value.trim() || null,
      scheduledFor: resolveScheduledFor(),
      // Generated once per checkout attempt, reused across submitOrder()
      // retries (network retry, double-tap) so the server can recognize a
      // repeat and return the original order instead of creating a second
      // one. A fresh uuid only happens when the customer restarts checkout.
      clientUuid: crypto.randomUUID(),
    };
    renderPhoneConfirmStep();
  }
  function renderPhoneConfirmStep() {
    document.getElementById('omCheckoutTitle').textContent = 'تأكيد رقم الجوال';
    document.getElementById('omCheckoutBody').innerHTML = `
      <div class="om-confirm-phone-box">
        <p class="om-confirm-phone-note">راح يتم التواصل معك على هذا الرقم لتسليمك الطلب — تأكد إنه صحيح.</p>
        <div class="om-confirm-phone-row" id="omConfirmPhoneRow">
          <span class="mono" id="omConfirmPhoneDisplay">${pendingOrder.phone}</span>
          <button type="button" id="omChangePhoneBtn">تغيير الرقم</button>
        </div>
      </div>
      <button class="om-confirm-order-btn" id="omFinalConfirmBtn">تأكيد وإرسال الطلب</button>
      <button class="om-confirm-back-btn" id="omBackToFormBtn" type="button">رجوع</button>
    `;
    document.getElementById('omChangePhoneBtn').addEventListener('click', () => {
      const row = document.getElementById('omConfirmPhoneRow');
      row.innerHTML = `<input type="tel" id="omEditPhoneInput" inputmode="tel" maxlength="10" value="${pendingOrder.phone}"><button type="button" id="omSavePhoneBtn">حفظ</button>`;
      document.getElementById('omEditPhoneInput').addEventListener('input', (e) => {
        e.target.value = toWesternDigits(e.target.value).replace(/\D/g, '').slice(0, 10);
      });
      document.getElementById('omSavePhoneBtn').addEventListener('click', () => {
        const val = document.getElementById('omEditPhoneInput').value.trim();
        if (!/^05\d{8}$/.test(val)) { showToast('اكتب رقم جوال سعودي صحيح (05xxxxxxxx)'); return; }
        pendingOrder.phone = val;
        renderPhoneConfirmStep();
      });
    });
    document.getElementById('omFinalConfirmBtn').addEventListener('click', submitOrder);
    document.getElementById('omBackToFormBtn').addEventListener('click', openCheckout);
  }

  async function submitOrder() {
    const btn = document.getElementById('omFinalConfirmBtn');
    btn.disabled = true; btn.textContent = 'جاري إرسال الطلب...';

    const items = CART.map(l => ({
      menu_item_id: l.productId, qty: l.qty, note: null,
      selected_options: l.config ? Object.entries(l.config).map(([groupId, optionId]) => ({ group_id: parseInt(groupId, 10), option_id: parseInt(optionId, 10) })) : [],
      box_selections: l.boxSelections ? Object.entries(l.boxSelections).map(([eligibleId, qty]) => ({ eligible_item_id: parseInt(eligibleId, 10), qty })) : [],
    }));

    const { data, error } = await sb.rpc('submit_online_order', {
      p_business_slug: SLUG, p_customer_name: pendingOrder.name, p_customer_phone: pendingOrder.phone,
      p_channel: state.channel, p_delivery_address: pendingOrder.address, p_note: pendingOrder.note, p_items: items,
      p_branch_id: state.branchId || null,
      p_customer_lat: state.channel === 'delivery' ? state.customerLat : null,
      p_customer_lng: state.channel === 'delivery' ? state.customerLng : null,
      p_scheduled_for: pendingOrder.scheduledFor ? pendingOrder.scheduledFor.toISOString() : null,
      p_client_order_uuid: pendingOrder.clientUuid,
      p_payment_method: checkoutPaymentMethod,
      p_scheduled_by_customer: state.channel === 'pickup' && state.pickupTimeMode === 'later',
    });

    if (error) {
      showToast(error.message || 'تعذر إرسال الطلب');
      btn.disabled = false; btn.textContent = 'تأكيد وإرسال الطلب';
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;

    if (checkoutPaymentMethod === 'card') {
      btn.textContent = 'جاري تحويلك لصفحة الدفع...';
      let sessionRes, sessionPayload;
      try {
        sessionRes = await fetch('/api/payments/geidea/create-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: result.order_id, tracking_token: result.tracking_token }),
        });
        sessionPayload = await sessionRes.json().catch(() => ({}));
      } catch {
        sessionPayload = {};
      }
      if (!sessionRes || !sessionRes.ok || !sessionPayload.redirectUrl) {
        // The order row already exists (awaiting_payment/unpaid) — a retry
        // re-invokes submit_online_order with the same clientUuid and gets
        // the same row back, so simply re-enabling the button is safe.
        showToast((sessionPayload && sessionPayload.error) || 'تعذر بدء عملية الدفع، حاول مرة ثانية');
        btn.disabled = false; btn.textContent = confirmButtonLabel();
        return;
      }
      saveIdentity(pendingOrder.name, pendingOrder.phone);
      try { localStorage.setItem(LS_LAST_ORDER_TOKEN, result.tracking_token); } catch {}
      CART = [];
      saveCartToStorage();
      window.location.href = sessionPayload.redirectUrl; // Geidea's hosted checkout page
      return;
    }

    saveIdentity(pendingOrder.name, pendingOrder.phone);
    try { localStorage.setItem(LS_LAST_ORDER_TOKEN, result.tracking_token); } catch {}
    CART = [];
    saveCartToStorage();
    // Straight to the tracking page — no "تتبع طلبك" tap required. The
    // order's already placed and paid (cash-on-delivery/pickup), so there's
    // nothing left for the customer to decide here; showing them their
    // live status immediately is strictly more useful than an interstitial
    // success screen they'd have to tap through anyway.
    window.location.href = '/order-status/' + result.tracking_token;
  }

  // ============ Location pin correction ============
  // A small draggable-crosshair widget over real composited OpenStreetMap
  // tiles — not a full map library (nothing else in this app pulls one in).
  // Standard slippy-map tile math at a fixed zoom; tiles are proxied through
  // /api/map-tile/[z]/[x]/[y] (never hotlinked from the browser, per OSM's
  // tile-usage policy).
  const PIN_ZOOM = 17;
  const PIN_TILE_SIZE = 256;
  let pinDrag = null; // {startX, startY, dragX, dragY}
  let pinGeo = null; // {tileX, tileY} — exact (fractional) tile coords of the current pin location
  let addressFetchToken = 0; // guards against a stale reverse-geocode reply overwriting a newer one

  function lonToTileX(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function latToTileY(lat, z) {
    const latRad = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function tileXToLon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function tileYToLat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // Renders inline (no button, no modal) the moment the checkout sheet opens
  // with a delivery channel and a captured location — the customer sees the
  // map and a real resolved address immediately, and only has to touch
  // anything if it's wrong.
  function renderPinBlock() {
    pinGeo = { tileX: lonToTileX(state.customerLng, PIN_ZOOM), tileY: latToTileY(state.customerLat, PIN_ZOOM) };
    renderPinTiles();
    wirePinDrag();
    resolveAddress(state.customerLat, state.customerLng);
  }

  function renderPinTiles() {
    const centerTileX = Math.floor(pinGeo.tileX);
    const centerTileY = Math.floor(pinGeo.tileY);
    const viewport = document.getElementById('omPinViewport');
    const tilesEl = document.getElementById('omPinTiles');
    if (!viewport || !tilesEl) return;
    const imgs = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTileX + dx, ty = centerTileY + dy;
        const left = (dx + 1) * PIN_TILE_SIZE, top = (dy + 1) * PIN_TILE_SIZE;
        imgs.push(`<img src="/api/map-tile/${PIN_ZOOM}/${tx}/${ty}" style="left:${left}px; top:${top}px;" alt="" onerror="this.style.background='var(--surf)'; this.removeAttribute('src');">`);
      }
    }
    tilesEl.innerHTML = imgs.join('');

    // Position the 3x3 tile grid so the exact (fractional) target point
    // lands under the fixed crosshair at viewport center — measured against
    // the viewport's real rendered size (it's fluid-width, not a fixed
    // constant) so centering stays correct at any screen width.
    const halfW = viewport.clientWidth / 2, halfH = viewport.clientHeight / 2;
    const worldPxX = pinGeo.tileX * PIN_TILE_SIZE, worldPxY = pinGeo.tileY * PIN_TILE_SIZE;
    const gridOriginX = (centerTileX - 1) * PIN_TILE_SIZE, gridOriginY = (centerTileY - 1) * PIN_TILE_SIZE;
    tilesEl.style.left = (halfW - (worldPxX - gridOriginX)) + 'px';
    tilesEl.style.top = (halfH - (worldPxY - gridOriginY)) + 'px';
    tilesEl.style.transform = 'translate(0, 0)';
    tilesEl.dataset.dragX = 0;
    tilesEl.dataset.dragY = 0;
  }

  function wirePinDrag() {
    const viewport = document.getElementById('omPinViewport');
    const tilesEl = document.getElementById('omPinTiles');
    if (!viewport || !tilesEl) return;
    let dragX = 0, dragY = 0;

    const onDown = (e) => {
      const point = e.touches ? e.touches[0] : e;
      pinDrag = { startX: point.clientX, startY: point.clientY, dragX, dragY };
      viewport.classList.add('dragging');
    };
    const onMove = (e) => {
      if (!pinDrag) return;
      const point = e.touches ? e.touches[0] : e;
      dragX = pinDrag.dragX + (point.clientX - pinDrag.startX);
      dragY = pinDrag.dragY + (point.clientY - pinDrag.startY);
      tilesEl.style.transform = `translate(${dragX}px, ${dragY}px)`;
      tilesEl.dataset.dragX = dragX;
      tilesEl.dataset.dragY = dragY;
    };
    // Releasing the drag IS the correction — no separate confirm button.
    // The new position is saved into state immediately and the address
    // re-resolved for it.
    const onUp = () => {
      if (!pinDrag) return;
      pinDrag = null;
      viewport.classList.remove('dragging');
      if (dragX === 0 && dragY === 0) return;
      const newTileX = pinGeo.tileX - dragX / PIN_TILE_SIZE;
      const newTileY = pinGeo.tileY - dragY / PIN_TILE_SIZE;
      state.customerLat = tileYToLat(newTileY, PIN_ZOOM);
      state.customerLng = tileXToLon(newTileX, PIN_ZOOM);
      pinGeo = { tileX: newTileX, tileY: newTileY };
      renderPinTiles();
      dragX = 0; dragY = 0;
      resolveAddress(state.customerLat, state.customerLng);
    };

    viewport.onpointerdown = onDown;
    viewport.onpointermove = onMove;
    viewport.onpointerup = onUp;
    viewport.onpointerleave = onUp;
  }

  async function resolveAddress(lat, lng) {
    const label = document.getElementById('omPinAddress');
    if (!label) return;
    label.textContent = '🔎 جاري تحديد العنوان...';
    const myToken = ++addressFetchToken;
    try {
      const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (myToken !== addressFetchToken) return; // a newer drag already superseded this request
      const currentLabel = document.getElementById('omPinAddress');
      if (!currentLabel) return;
      currentLabel.textContent = data.address ? '📍 ' + data.address : 'تعذر تحديد العنوان تلقائيًا — تأكد من الدبوس أو أضف تفاصيل بالملاحظات';
    } catch {
      if (myToken !== addressFetchToken) return;
      const currentLabel = document.getElementById('omPinAddress');
      if (currentLabel) currentLabel.textContent = 'تعذر تحديد العنوان تلقائيًا — تأكد من الدبوس أو أضف تفاصيل بالملاحظات';
    }
  }

  // ============ Wiring ============
  function wireEvents() {
    document.getElementById('omChannelRow').addEventListener('click', (e) => {
      const btn = e.target.closest('.om-channel-btn'); if (!btn) return;
      document.querySelectorAll('.om-channel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.channel = btn.dataset.channel;
      state.branchAutoPicked = false;
      renderCartBar(); renderDesktopCart();
      if (state.channel === 'delivery') locateNearestBranch();
      else renderBranchNote();
      renderFooterLocation();
    });
    document.getElementById('omCartBar').addEventListener('click', () => { renderCartSheet(); document.getElementById('omCartOverlay').classList.add('show'); });
    document.getElementById('omCartClose').addEventListener('click', () => document.getElementById('omCartOverlay').classList.remove('show'));
    document.getElementById('omCartOverlay').addEventListener('click', (e) => { if (e.target.id === 'omCartOverlay') e.currentTarget.classList.remove('show'); });
    document.getElementById('omModifierClose').addEventListener('click', () => document.getElementById('omModifierOverlay').classList.remove('show'));
    document.getElementById('omModifierOverlay').addEventListener('click', (e) => { if (e.target.id === 'omModifierOverlay') e.currentTarget.classList.remove('show'); });
    document.getElementById('omCheckoutClose').addEventListener('click', () => document.getElementById('omCheckoutOverlay').classList.remove('show'));
    document.getElementById('omCheckoutOverlay').addEventListener('click', (e) => { if (e.target.id === 'omCheckoutOverlay') e.currentTarget.classList.remove('show'); });
    const searchInput = document.getElementById('omSearchInput');
    if (searchInput) searchInput.addEventListener('input', (e) => { state.search = e.target.value; renderMenu(); });

    const header = document.getElementById('omHeader');
    let headerScrolled = false;
    const updateHeaderScroll = () => {
      const scrolled = window.scrollY > 12;
      if (scrolled === headerScrolled) return;
      headerScrolled = scrolled;
      header.classList.toggle('scrolled', scrolled);
    };
    window.addEventListener('scroll', updateHeaderScroll, { passive: true });
    updateHeaderScroll();
  }

  boot();
}
