/* Rakeen public self-service booking page — /book/[slug] for salon/
   ladies_salon/car_wash/clinic-type businesses. Mirrors rakeen-order.js's
   boot pattern exactly, but the flow is a short linear wizard (service ->
   staff+time -> details -> confirm) instead of a cart, since a booking is
   always exactly one line item. No availability calendar is fetched client
   side (anon has no read access to table_reservations — staff-only by
   design) — time slots are offered on a fixed grid and the real conflict
   check happens server-side in submit_public_reservation(), same trust
   boundary as every other public write in this codebase. */
if (!window.__rakeenBookBooted) {
  window.__rakeenBookBooted = true;

  const sb = window.supabaseClient;
  const SLUG = window.RAKEEN_BOOK_SLUG;
  const LS_IDENTITY = 'rakeen_book_identity_' + SLUG;

  // Real reported bug: the phone field's digit-strip used /\D/g, which in
  // JS only matches ASCII 0-9 — a customer typing on an Arabic keyboard
  // (Arabic-Indic ٠-٩, common default in this market) got every character
  // of their number silently wiped instead of converted. Convert both
  // Arabic-Indic and Eastern Arabic-Indic (Persian) digits to Western
  // digits FIRST, before any \D stripping.
  function toWesternDigits(str){
    return String(str).replace(/[٠-٩۰-۹]/g, ch=>{
      const code = ch.charCodeAt(0);
      return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
    });
  }

  const RESOURCE_LABELS = {
    salon: { service: 'خدمة', staff: 'الكوافير' },
    ladies_salon: { service: 'خدمة', staff: 'الكوافيرة' },
    car_wash: { service: 'خدمة غسيل', staff: 'الفني' },
    mobile_car_wash: { service: 'خدمة غسيل', staff: 'الفني' },
    clinic: { service: 'جلسة', staff: 'الطبيب' },
  };
  function isMobileCarWash() { return BUSINESS?.business_type === 'mobile_car_wash'; }
  function labels() {
    return RESOURCE_LABELS[BUSINESS?.business_type] || RESOURCE_LABELS.salon;
  }

  let BUSINESS = null;
  let SERVICES = []; // [{id,name,price,duration_minutes,category_name}]
  let STAFF = []; // active staff eligible for the selected service
  let step = 1;
  let sel = {
    service: null,
    staffId: null, // null = "أي موظف متاح"
    date: null, // Date (day-level, local)
    time: null, // 'HH:MM'
    name: '',
    phone: '',
    customerLat: null, // mobile_car_wash only — where the team needs to go
    customerLng: null,
    addressText: '',
  };
  let submitting = false;

  function $(id) { return document.getElementById(id); }

  function showToast(msg) {
    const t = $('bkToast');
    if (!t) return;
    $('bkToastText').textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._h);
    showToast._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function fullState(iconSvg, title, sub) {
    $('bkMain').innerHTML = `
      <div class="bk-full-state">
        <div class="bk-full-icon">${iconSvg}</div>
        <div class="bk-full-title">${title}</div>
        <div class="bk-full-sub">${sub}</div>
      </div>`;
    $('bkSteps').style.display = 'none';
  }

  const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  async function loadIdentity() {
    try {
      const raw = localStorage.getItem(LS_IDENTITY);
      if (!raw) return;
      const id = JSON.parse(raw);
      sel.name = id.name || '';
      sel.phone = id.phone || '';
    } catch (e) { /* ignore malformed local identity */ }
  }
  function saveIdentity() {
    try { localStorage.setItem(LS_IDENTITY, JSON.stringify({ name: sel.name, phone: sel.phone })); } catch (e) { /* storage may be unavailable (private mode) */ }
  }

  async function boot() {
    await loadIdentity();

    const { data: biz } = await sb
      .from('businesses')
      .select('id, name, logo_url, business_type, online_booking_enabled')
      .eq('online_menu_slug', SLUG)
      .eq('online_booking_enabled', true)
      .maybeSingle();

    if (!biz) {
      fullState(ICON_CLOCK, 'الحجز غير متاح', 'هذا الرابط غير متاح للحجز حالياً — تواصل مع المنشأة مباشرة.');
      return;
    }
    BUSINESS = biz;

    $('bkBrandName').textContent = biz.name;
    $('bkHeroName').textContent = biz.name;
    document.querySelector('.bk-hero-chip').textContent = `احجز موعدك عند ${biz.name}`;
    if (biz.logo_url) {
      $('bkLogo').innerHTML = `<img src="${biz.logo_url}" alt="">`;
      $('bkHeroLogo').innerHTML = `<img src="${biz.logo_url}" alt="">`;
    } else {
      $('bkLogo').textContent = biz.name?.[0] || 'ر';
      $('bkHeroLogo').textContent = biz.name?.[0] || 'ر';
    }

    const { data: services } = await sb
      .from('services')
      .select('id, name, price, duration_minutes, category_id, menu_categories(name)')
      .eq('business_id', biz.id)
      .eq('active', true)
      .order('category_id')
      .order('name');
    SERVICES = (services || []).map(s => ({
      id: s.id, name: s.name, price: s.price, duration_minutes: s.duration_minutes,
      category_name: s.menu_categories?.name || null,
    }));

    if (!SERVICES.length) {
      fullState(ICON_CLOCK, 'لا توجد خدمات متاحة', 'لم تتم إضافة خدمات للحجز بعد — تواصل مع المنشأة مباشرة.');
      return;
    }

    // Ask early (mirrors rakeen-order.js's locateNearestBranch() timing) so
    // the pin is already resolved by the time the customer reaches step 3 —
    // silently no-ops on denial, same as the online-order page (the address
    // textarea stays the fallback either way).
    if (isMobileCarWash()) locateCustomer();

    renderStep();
  }

  // ===== Location capture (mobile_car_wash only) — ported near-verbatim
  // from public/order/rakeen-order.js's pin-correction widget, since a
  // "team travels to customer" booking needs exactly the same "where do we
  // go" data a delivery order needs. =====
  function locateCustomer() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sel.customerLat = pos.coords.latitude;
        sel.customerLng = pos.coords.longitude;
        if (step === 3) renderDetailsStep();
      },
      () => { /* denied/unavailable — customer falls back to the address textarea */ }
    );
  }

  const PIN_ZOOM = 17;
  const PIN_TILE_SIZE = 256;
  let pinDrag = null;
  let pinGeo = null;
  let addressFetchToken = 0;

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

  function renderPinBlock() {
    pinGeo = { tileX: lonToTileX(sel.customerLng, PIN_ZOOM), tileY: latToTileY(sel.customerLat, PIN_ZOOM) };
    renderPinTiles();
    wirePinDrag();
    resolveAddress(sel.customerLat, sel.customerLng);
  }

  function renderPinTiles() {
    const centerTileX = Math.floor(pinGeo.tileX);
    const centerTileY = Math.floor(pinGeo.tileY);
    const viewport = $('bkPinViewport');
    const tilesEl = $('bkPinTiles');
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
    const viewport = $('bkPinViewport');
    const tilesEl = $('bkPinTiles');
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
    const onUp = () => {
      if (!pinDrag) return;
      pinDrag = null;
      viewport.classList.remove('dragging');
      if (dragX === 0 && dragY === 0) return;
      const newTileX = pinGeo.tileX - dragX / PIN_TILE_SIZE;
      const newTileY = pinGeo.tileY - dragY / PIN_TILE_SIZE;
      sel.customerLat = tileYToLat(newTileY, PIN_ZOOM);
      sel.customerLng = tileXToLon(newTileX, PIN_ZOOM);
      pinGeo = { tileX: newTileX, tileY: newTileY };
      renderPinTiles();
      dragX = 0; dragY = 0;
      resolveAddress(sel.customerLat, sel.customerLng);
    };

    viewport.onpointerdown = onDown;
    viewport.onpointermove = onMove;
    viewport.onpointerup = onUp;
    viewport.onpointerleave = onUp;
  }

  async function resolveAddress(lat, lng) {
    const label = $('bkPinAddress');
    if (!label) return;
    label.textContent = '🔎 جاري تحديد العنوان...';
    const myToken = ++addressFetchToken;
    try {
      const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (myToken !== addressFetchToken) return;
      const currentLabel = $('bkPinAddress');
      if (!currentLabel) return;
      currentLabel.textContent = data.address ? '📍 ' + data.address : 'تعذر تحديد العنوان تلقائيًا — تأكد من الدبوس أو أضف تفاصيل بالعنوان';
    } catch {
      if (myToken !== addressFetchToken) return;
      const currentLabel = $('bkPinAddress');
      if (currentLabel) currentLabel.textContent = 'تعذر تحديد العنوان تلقائيًا — تأكد من الدبوس أو أضف تفاصيل بالعنوان';
    }
  }

  function renderSteps() {
    document.querySelectorAll('.bk-step-dot').forEach(dot => {
      const n = Number(dot.dataset.step);
      dot.classList.toggle('done', n < step);
      dot.classList.toggle('active', n === step);
    });
  }

  function renderStep() {
    renderSteps();
    if (step === 1) renderServiceStep();
    else if (step === 2) renderStaffTimeStep();
    else if (step === 3) renderDetailsStep();
  }

  // ===== Step 1: service picker =====
  function renderServiceStep() {
    const L = labels();
    const groups = new Map();
    SERVICES.forEach(s => {
      const key = s.category_name || 'الخدمات';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });

    let html = `<div class="bk-section-title">اختر ${L.service}</div><div class="bk-section-sub">اختر الخدمة اللي تبيها لتكمل حجزك</div>`;
    groups.forEach((list, catName) => {
      html += `<div class="bk-cat-title">${catName}</div><div class="bk-svc-list">`;
      list.forEach(s => {
        const selected = sel.service?.id === s.id;
        html += `
          <button class="bk-svc-card ${selected ? 'selected' : ''}" data-svc="${s.id}">
            <div class="bk-svc-info">
              <div class="bk-svc-name">${s.name}</div>
              <div class="bk-svc-meta">${s.duration_minutes} دقيقة</div>
            </div>
            <div class="bk-svc-price mono">${Number(s.price).toFixed(0)} ر.س</div>
          </button>`;
      });
      html += `</div>`;
    });
    $('bkMain').innerHTML = html;

    document.querySelectorAll('[data-svc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const svc = SERVICES.find(s => s.id === Number(btn.dataset.svc));
        sel.service = svc;
        sel.staffId = null;
        sel.time = null;
        goToStaffTime();
      });
    });
    renderBottomBar(null);
  }

  // ===== Step 2: staff + date + time =====
  async function goToStaffTime() {
    step = 2;
    renderSteps();
    $('bkMain').innerHTML = `<div class="bk-loading"><div class="bk-spinner"></div></div>`;

    const { data: mapped } = await sb
      .from('service_staff')
      .select('staff_member_id')
      .eq('service_id', sel.service.id);

    if (mapped && mapped.length) {
      const ids = mapped.map(m => m.staff_member_id);
      const { data: staff } = await sb.from('staff_members').select('id, name').in('id', ids).eq('active', true);
      STAFF = staff || [];
    } else {
      const { data: staff } = await sb.from('staff_members').select('id, name').eq('business_id', BUSINESS.id).eq('active', true);
      STAFF = staff || [];
    }

    if (!sel.date) sel.date = new Date();
    renderStaffTimeStep();
  }

  function dateChipsHtml() {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    const dow = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    return days.map(d => {
      const selected = sel.date && d.toDateString() === sel.date.toDateString();
      return `<button class="bk-date-chip ${selected ? 'selected' : ''}" data-date="${d.toISOString()}">
        <div class="bk-date-dow">${dow[d.getDay()]}</div>
        <div class="bk-date-num mono">${d.getDate()}</div>
      </button>`;
    }).join('');
  }

  function timeSlots() {
    const slots = [];
    const isToday = sel.date && sel.date.toDateString() === new Date().toDateString();
    const now = new Date();
    for (let h = 9; h < 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes() + 30))) continue;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return slots;
  }

  function renderStaffTimeStep() {
    const L = labels();
    let html = `<div class="bk-section-title">${sel.service.name}</div>
      <div class="bk-section-sub">${sel.service.duration_minutes} دقيقة · ${Number(sel.service.price).toFixed(0)} ر.س</div>`;

    if (STAFF.length) {
      html += `<div class="bk-cat-title">اختر ${L.staff}</div><div class="bk-staff-list">
        <button class="bk-staff-chip ${sel.staffId === null ? 'selected' : ''}" data-staff="any">أي موظف متاح</button>
        ${STAFF.map(s => `<button class="bk-staff-chip ${sel.staffId === s.id ? 'selected' : ''}" data-staff="${s.id}">${s.name}</button>`).join('')}
      </div>`;
    }

    html += `<div class="bk-cat-title">اختر اليوم</div><div class="bk-date-strip">${dateChipsHtml()}</div>`;

    const slots = timeSlots();
    html += `<div class="bk-cat-title">اختر الوقت</div>`;
    if (!slots.length) {
      html += `<div class="bk-time-empty">لا توجد أوقات متاحة اليوم — اختر يوم آخر</div>`;
    } else {
      html += `<div class="bk-time-grid">${slots.map(t => `<button class="bk-time-slot mono ${sel.time === t ? 'selected' : ''}" data-time="${t}">${t}</button>`).join('')}</div>`;
    }

    $('bkMain').innerHTML = html;

    document.querySelectorAll('[data-staff]').forEach(btn => {
      btn.addEventListener('click', () => {
        sel.staffId = btn.dataset.staff === 'any' ? null : Number(btn.dataset.staff);
        renderStaffTimeStep();
      });
    });
    document.querySelectorAll('[data-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        sel.date = new Date(btn.dataset.date);
        sel.time = null;
        renderStaffTimeStep();
      });
    });
    document.querySelectorAll('[data-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        sel.time = btn.dataset.time;
        renderStaffTimeStep();
      });
    });

    renderBottomBar(sel.time ? () => { step = 3; renderStep(); } : null, () => { step = 1; renderStep(); });
  }

  // ===== Step 3: details + confirm =====
  function renderDetailsStep() {
    const [hh, mm] = sel.time.split(':').map(Number);
    const reservedFor = new Date(sel.date);
    reservedFor.setHours(hh, mm, 0, 0);
    const dow = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    $('bkMain').innerHTML = `
      <div class="bk-section-title">أكمل بياناتك</div>
      <div class="bk-section-sub">آخر خطوة قبل تأكيد الحجز</div>
      <div class="bk-summary">
        <div class="bk-summary-row"><span class="bk-summary-label">الخدمة</span><span class="bk-summary-value">${sel.service.name}</span></div>
        <div class="bk-summary-row"><span class="bk-summary-label">الموعد</span><span class="bk-summary-value">${dow[reservedFor.getDay()]} ${reservedFor.getDate()} — ${sel.time}</span></div>
        <div class="bk-summary-row"><span class="bk-summary-label">السعر</span><span class="bk-summary-value mono">${Number(sel.service.price).toFixed(0)} ر.س</span></div>
      </div>
      <div class="bk-error" id="bkFormError"></div>
      <div class="bk-field"><label>الاسم</label><input type="text" id="bkNameInput" placeholder="اسمك" value="${sel.name.replace(/"/g, '&quot;')}"></div>
      <div class="bk-field"><label>رقم الجوال</label><input type="tel" inputmode="numeric" class="mono" id="bkPhoneInput" placeholder="05xxxxxxxx" maxlength="10" value="${sel.phone}"></div>
      ${isMobileCarWash() ? `
        ${sel.customerLat != null ? `
        <div class="bk-field">
          <label>موقعك على الخريطة</label>
          <div class="bk-pin-block" id="bkPinBlock">
            <div class="bk-pin-viewport" id="bkPinViewport">
              <div class="bk-pin-tiles" id="bkPinTiles"></div>
              <svg class="bk-pin-crosshair" viewBox="0 0 28 28" fill="none">
                <path d="M14 27c6-7 9-11.5 9-16A9 9 0 1 0 5 11c0 4.5 3 9 9 16z" fill="var(--brand)" stroke="var(--brand-ink)" stroke-width="1.5"/>
                <circle cx="14" cy="11" r="3.2" fill="var(--brand-ink)"/>
              </svg>
            </div>
            <p class="bk-pin-address" id="bkPinAddress">🔎 جاري تحديد العنوان...</p>
            <p class="bk-pin-hint">مو دقيق؟ حرّك الخريطة لتعديل موقعك</p>
          </div>
        </div>
        ` : `<div class="bk-error show">فعّل خدمة الموقع من المتصفح لتحديد موقعك على الخريطة، أو اكتب عنوانك بالأسفل</div>`}
        <div class="bk-field"><label>تفاصيل العنوان (اختياري)</label><input type="text" id="bkAddressInput" placeholder="مثال: فيلا رقم ٥، بجانب مسجد..." value="${(sel.addressText || '').replace(/"/g, '&quot;')}"></div>
      ` : ''}
    `;
    if (isMobileCarWash() && sel.customerLat != null) renderPinBlock();
    // Only enforced a minimum length before (>=9 digits, no cap) — same
    // maxlength+strip pattern as the online-order checkout's #omPhone field.
    const bkPhoneEl = $('bkPhoneInput');
    if (bkPhoneEl) bkPhoneEl.addEventListener('input', (e) => {
      e.target.value = toWesternDigits(e.target.value).replace(/\D/g, '').slice(0, 10);
    });
    renderBottomBar(() => submitBooking(), () => { step = 2; renderStep(); }, 'تأكيد الحجز');
  }

  async function submitBooking() {
    if (submitting) return;
    const name = $('bkNameInput').value.trim();
    const phone = toWesternDigits($('bkPhoneInput').value.trim());
    const errEl = $('bkFormError');
    errEl.classList.remove('show');

    if (!name) { errEl.textContent = 'اكتب اسمك'; errEl.classList.add('show'); return; }
    if (!/^05\d{8}$/.test(phone.replace(/\D/g, ''))) { errEl.textContent = 'اكتب رقم جوال سعودي صحيح (05xxxxxxxx)'; errEl.classList.add('show'); return; }

    const addressInput = $('bkAddressInput');
    if (addressInput) sel.addressText = addressInput.value.trim();
    if (isMobileCarWash() && sel.customerLat == null && !sel.addressText) {
      errEl.textContent = 'حدد موقعك على الخريطة أو اكتب عنوانك عشان يوصلك الفريق';
      errEl.classList.add('show');
      return;
    }

    sel.name = name;
    sel.phone = phone;
    saveIdentity();

    const [hh, mm] = sel.time.split(':').map(Number);
    const reservedFor = new Date(sel.date);
    reservedFor.setHours(hh, mm, 0, 0);

    submitting = true;
    const btn = document.getElementById('bkPrimaryBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="bk-spinner" style="width:18px;height:18px;border-width:2.5px;"></div>`; }

    const { data, error } = await sb.rpc('submit_public_reservation', {
      p_business_slug: SLUG,
      p_customer_name: name,
      p_customer_phone: phone,
      p_service_id: sel.service.id,
      p_reserved_for: reservedFor.toISOString(),
      p_staff_member_id: sel.staffId,
      p_customer_lat: isMobileCarWash() ? sel.customerLat : null,
      p_customer_lng: isMobileCarWash() ? sel.customerLng : null,
      p_customer_address_text: isMobileCarWash() ? (sel.addressText || null) : null,
    });

    submitting = false;
    if (error) {
      errEl.textContent = error.message || 'صار خطأ، حاول مرة ثانية';
      errEl.classList.add('show');
      if (btn) { btn.disabled = false; btn.textContent = 'تأكيد الحجز'; }
      return;
    }

    renderSuccess(data && data[0] ? data[0] : null, reservedFor);
  }

  function renderSuccess(result, reservedFor) {
    $('bkSteps').style.display = 'none';
    const dow = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    $('bkMain').innerHTML = `
      <div class="bk-full-state">
        <div class="bk-full-icon">${ICON_CHECK}</div>
        <div class="bk-full-title">تم تأكيد حجزك</div>
        <div class="bk-full-sub">راح نكون بانتظارك — احتفظ بتفاصيل حجزك بالأسفل</div>
        <div class="bk-success-card">
          <div class="bk-summary-row"><span class="bk-summary-label">الخدمة</span><span class="bk-summary-value">${result?.service_name || sel.service.name}</span></div>
          <div class="bk-summary-row"><span class="bk-summary-label">الموعد</span><span class="bk-summary-value">${dow[reservedFor.getDay()]} ${reservedFor.getDate()} — ${sel.time}</span></div>
          <div class="bk-summary-row"><span class="bk-summary-label">السعر</span><span class="bk-summary-value mono">${Number(result?.service_price ?? sel.service.price).toFixed(0)} ر.س</span></div>
        </div>
      </div>`;
  }

  // ===== Bottom bar =====
  function renderBottomBar(onPrimary, onBack, primaryLabel) {
    const existing = document.getElementById('bkBottomBar');
    if (existing) existing.remove();
    if (!onPrimary && !onBack) return;

    const bar = document.createElement('div');
    bar.className = 'bk-bottom-bar';
    bar.id = 'bkBottomBar';
    if (onBack) {
      const backBtn = document.createElement('button');
      backBtn.className = 'bk-btn-back';
      backBtn.textContent = 'رجوع';
      backBtn.addEventListener('click', onBack);
      bar.appendChild(backBtn);
    }
    const primaryBtn = document.createElement('button');
    primaryBtn.className = 'bk-btn-primary';
    primaryBtn.id = 'bkPrimaryBtn';
    primaryBtn.textContent = primaryLabel || 'التالي';
    primaryBtn.disabled = !onPrimary;
    if (onPrimary) primaryBtn.addEventListener('click', onPrimary);
    bar.appendChild(primaryBtn);
    document.body.appendChild(bar);
  }

  boot();
}
