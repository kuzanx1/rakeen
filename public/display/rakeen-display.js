/**
 * لوح باركود الولاء على شاشة العميل.
 *
 * يظهر حين يضغط الكاشير بعد إتمام الطلب، ويختفي بأحد ثلاثة: أن يمسحه
 * العميل -- وهو الغالب -- أو أن تنتهي المهلة، أو أن يغلقه الكاشير بيده.
 *
 * والثالث ليس زينة: شبكةٌ تتقطّع أو بثٌّ لا يصل يتركان اللوح على وجه
 * الشاشة، والزبون التالي واقف. فزرٌّ يغلقه بلا انتظار.
 *
 * والقناة مقفلة على هذه الشاشة وحدها: اسمها مشتقٌّ من سرّ الجهاز، فمن
 * فتح الرابط على جهاز آخر لم ينضمّ إلى قناتها ولم يرَ ما يمرّ فيها.
 */
(function () {
  'use strict';
  if (window.__rakeenDisplayBooted) return;
  window.__rakeenDisplayBooted = true;

  var LS_SECRET = 'rakeen_display_secret';
  var TOTAL_MS = 90 * 1000;   // دقيقة ونصف
  var overlay = null, timerId = null, endsAt = 0;

  function secret() {
    try { return localStorage.getItem(LS_SECRET) || ''; } catch (_) { return ''; }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'rk-disp-overlay';
    overlay.setAttribute('hidden', '');
    overlay.innerHTML =
      '<div class="rk-disp-card">' +
        '<button type="button" class="rk-disp-x" aria-label="إغلاق">&times;</button>' +
        '<div class="rk-disp-msg" id="rkDispMsg"></div>' +
        '<div class="rk-disp-qr" id="rkDispQr"></div>' +
        '<div class="rk-disp-timer" id="rkDispTimer"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.rk-disp-x').addEventListener('click', hide);
    return overlay;
  }

  function hide() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (overlay) overlay.setAttribute('hidden', '');
  }

  function tick() {
    var left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    var el = document.getElementById('rkDispTimer');
    if (el) {
      var m = Math.floor(left / 60), s = left % 60;
      el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : left + ' ثانية';
    }
    // شريط يتقلّص: الرقم يُقرأ، والشريط يُلمح. والعميل ينظر إلى جواله
    // لا إلى الشاشة، فيحتاج ما يُدرَك بطرف العين.
    var bar = overlay && overlay.querySelector('.rk-disp-card');
    if (bar) bar.style.setProperty('--rk-disp-progress', (left / (TOTAL_MS / 1000)) * 100 + '%');
    if (left <= 0) hide();
  }

  /** يرسم رمز QR من نفس نقطة الخدمة التي ترسم رمز ZATCA على الفاتورة. */
  function show(url, message) {
    ensureOverlay();
    var msg = document.getElementById('rkDispMsg');
    if (msg) msg.textContent = message || 'بالعافية عليك — امسح الباركود وصير من خلّان المكان';
    var qr = document.getElementById('rkDispQr');
    if (qr) {
      qr.innerHTML = '';
      var img = document.createElement('img');
      img.alt = 'باركود بطاقة الولاء';
      img.src = '/api/qr?data=' + encodeURIComponent(url);
      qr.appendChild(img);
    }
    endsAt = Date.now() + TOTAL_MS;
    overlay.removeAttribute('hidden');
    tick();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  /**
   * شاشة الاقتران، حين لا سرّ محفوظ.
   *
   * ولا نقطة خدمة تتحقق من الرمز: الشاشة تحفظه وتستمع إلى قناته، فإن
   * كان خطأً لم يصلها شيء أبداً. ونقطةُ تحققٍ تعني بابَ تخمينٍ يُطرق،
   * وغيابها يعني ألا باب.
   */
  function askForPairing() {
    var box = document.createElement('div');
    box.className = 'rk-disp-overlay';
    box.innerHTML =
      '<div class="rk-disp-card">' +
        '<div class="rk-disp-msg">اربط هذه الشاشة بالمطعم</div>' +
        '<div class="rk-disp-pair-hint">من لوحة التحكم: المتجر الإلكتروني ← إعدادات المتجر ← شاشة العميل ← أنشئ رمز اقتران. الرمز صالح عشر دقائق.</div>' +
        '<input type="text" id="rkDispPairInput" class="rk-disp-pair-input" placeholder="XXX-XXX" autocomplete="off" spellcheck="false" inputmode="latin" maxlength="7" dir="ltr">' +
        '<div id="rkDispPairErr" class="rk-disp-pair-err"></div>' +
        '<button type="button" id="rkDispPairBtn" class="rk-disp-pair-btn">اربط الشاشة</button>' +
      '</div>';
    document.body.appendChild(box);
    var input = box.querySelector('#rkDispPairInput');
    var btn = box.querySelector('#rkDispPairBtn');
    var err = box.querySelector('#rkDispPairErr');

    // الشرطة تُكتب وحدها: من ينقل K7MP4Q لا يُطالَب بتذكّر مكانها.
    input.addEventListener('input', function () {
      var raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      input.value = raw.length > 3 ? raw.slice(0, 3) + '-' + raw.slice(3) : raw;
      if (err) err.textContent = '';
    });

    function submit() {
      var code = (input.value || '').trim().toUpperCase();
      if (code.replace('-', '').length !== 6) { if (err) err.textContent = 'الرمز ست خانات'; return; }
      btn.disabled = true;
      btn.textContent = 'جارٍ الربط...';
      window.supabaseClient.rpc('redeem_display_pairing_code', {
        p_code: code, p_user_agent: navigator.userAgent
      }).then(function (r) {
        var d = r && r.data;
        if (!d || !d.ok) {
          if (err) err.textContent = 'الرمز غير صحيح أو انتهت صلاحيته — اطلب رمزاً جديداً';
          btn.disabled = false; btn.textContent = 'اربط الشاشة';
          return;
        }
        try { localStorage.setItem(LS_SECRET, d.secret); } catch (_) {}
        box.remove();
        listen();
      }).catch(function () {
        if (err) err.textContent = 'تعذر الاتصال — تأكد من الشبكة';
        btn.disabled = false; btn.textContent = 'اربط الشاشة';
      });
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    input.focus();
  }

  function listen() {
    var sb = window.supabaseClient;
    var s = secret();
    if (!sb) return;
    // بلا اقتران لا استماع: شاشةٌ لم تُقترن لا تعرض باركود أحد.
    if (!s) { askForPairing(); return; }

    sb.channel('display-secret:' + s)
      .on('broadcast', { event: 'show_barcode' }, function (m) {
        var p = (m && m.payload) || {};
        if (p.url) show(p.url, p.message);
      })
      .on('broadcast', { event: 'hide_barcode' }, hide)
      .subscribe();

    /**
     * نبضةٌ كل خمس دقائق.
     *
     * لا لتُبقي الاتصال -- ذاك يُبقيه Realtime -- بل ليعرف المالك أي
     * شاشة حيّة وأيها انقطع. وشاشةٌ لم تُرَ منذ يومين خبرٌ يستحق أن
     * يُعرف قبل أن يقف زبون أمامها فارغة.
     */
    var beat = function () { try { sb.rpc('touch_display_device', { p_secret: s }); } catch (_) {} };
    beat();
    setInterval(beat, 5 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', listen);
  } else {
    listen();
  }

  // يُستدعى من صفحة الاقتران بعد حفظ السرّ، فلا يحتاج الجهاز إعادة تحميل.
  window.rakeenDisplayReconnect = listen;
})();
