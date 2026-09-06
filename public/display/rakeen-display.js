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

  function listen() {
    var sb = window.supabaseClient;
    var s = secret();
    // بلا اقتران لا استماع: شاشةٌ لم تُقترن لا تعرض باركود أحد.
    if (!sb || !s) return;

    sb.channel('display-secret:' + s)
      .on('broadcast', { event: 'show_barcode' }, function (m) {
        var p = (m && m.payload) || {};
        if (p.url) show(p.url, p.message);
      })
      .on('broadcast', { event: 'hide_barcode' }, hide)
      .subscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', listen);
  } else {
    listen();
  }

  // يُستدعى من صفحة الاقتران بعد حفظ السرّ، فلا يحتاج الجهاز إعادة تحميل.
  window.rakeenDisplayReconnect = listen;
})();
