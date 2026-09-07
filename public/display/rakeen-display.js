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
  var BAD_TOKEN = false;
  var TOTAL_MS = 90 * 1000;   // دقيقة ونصف
  var overlay = null, timerId = null, endsAt = 0;

  function secret() {
    try { return localStorage.getItem(LS_SECRET) || ''; } catch (_) { return ''; }
  }

  /** ويُكتب في المرساتين معاً: ما يُمحى من إحداهما تُعيده الأخرى. */
  function saveSecret(v) {
    try { localStorage.setItem(LS_SECRET, v); } catch (_) {}
    try {
      fetch('/api/display/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: v }),
      }).catch(function () {});
    } catch (_) {}
  }

  /**
   * ويُلتمس من الكعكة قبل أن يُطلب من الإنسان.
   *
   * وطلبُ التثبيت معه: كروم يعدّ تخزين الأصل "أفضل جهد" فيُخليه عند
   * ضيق القرص، وطلبةٌ واحدة تنقله إلى "دائم" فلا يُخلى. تُرفض أحياناً
   * -- ولا ضرر: الكعكة قائمة.
   */
  /**
   * السرُّ من العنوان أوّلاً -- وهو المرساة التي لا تُمحى.
   *
   * ما يحفظه المتصفّح يُمحى: متصفّحُ كشكٍ ينظّف عند الإغلاق، وسفاري
   * تمسح ما تكتبه النصوص بعد سبعة أيام بلا لمس -- وهذي شاشةٌ لا
   * يلمسها أحد. فأيُّ حلٍّ يُبنى على التخزين يسقط يوماً.
   *
   * والعنوان يبقى: يُحفظ صفحةً رئيسية للكشك، فيُعاد الاقتران في كل
   * فتحة بلا رمزٍ ولا خطوة. ولا يُنزع من العنوان بعد قراءته -- نزعُه
   * يعيدنا إلى الاعتماد على ما يُمحى.
   *
   * ويُقرأ من الجزء بعد # لا من الاستعلام: ما بعد # لا يُرسل إلى
   * الخادم أصلاً، فلا يظهر في سجلّاته.
   */
  function secretFromUrl() {
    try {
      var m = /[#&]s=([0-9a-f]{32,128})/i.exec(location.hash || '');
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }

  /**
   * والرمزُ القصير في العنوان: ثمانيةُ أحرفٍ تُكتب باليد.
   *
   * السرُّ الكامل دائمٌ لا يُمحى، لكنّه ستّون حرفاً -- ولوحةُ التحكم
   * على جهاز المالك وهذي شاشةٌ أخرى: لا نسخَ بينهما، إنما نقلٌ بالعين
   * واليد. فيُنقل رمزٌ من ثمانية، ويُبدَّل هنا بالسرّ في كل فتحة.
   *
   * ولا يُبطَل بالاستعمال ولا ينتهي بوقت -- وذانك كانا علّة الرمز
   * القديم، لا قِصَره.
   */
  function tokenFromUrl() {
    try {
      var h = (location.hash || '').replace(/^#/, '').trim().toUpperCase();
      return /^[A-Z0-9]{8}$/.test(h) ? h : '';
    } catch (_) { return ''; }
  }

  function recoverSecret() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
    var fromUrl = secretFromUrl();
    if (fromUrl) { saveSecret(fromUrl); return Promise.resolve(fromUrl); }

    var tok = tokenFromUrl();
    if (tok && window.supabaseClient) {
      return window.supabaseClient
        .rpc('resolve_display_link_token', { p_token: tok, p_user_agent: navigator.userAgent })
        .then(function (r) {
          var d = r && r.data;
          if (d && d.ok && d.secret) { saveSecret(d.secret); return d.secret; }
          // ورمزٌ لا تعرفه القاعدة يُقال فيه ذلك صراحةً: الصمتُ هنا
          // يُقرأ عطلَ شبكة، فيُعاد الكتابة مرّةً بعد مرّة.
          BAD_TOKEN = true;
          return secret();
        })
        .catch(function () { return secret(); });
    }

    var s = secret();
    if (s) { saveSecret(s); return Promise.resolve(s); }
    return fetch('/api/display/session', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.secret) { try { localStorage.setItem(LS_SECRET, d.secret); } catch (_) {} return d.secret; }
        return '';
      })
      .catch(function () { return ''; });
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
   * حين لا اقتران: يُقال ما يُفعل، ولا يُطلب رمز.
   *
   * كان هنا حقلٌ يُكتب فيه رمزٌ من ست خانات. وطريقُ الرمز كلُّه مبنيٌّ
   * على ما يحفظه المتصفّح: متصفّحُ الكشك ينظّف عند كل إغلاق، وسفاري
   * تمسح تخزين المواقع بعد سبعة أيام بلا لمس -- وهذي شاشةٌ لا يلمسها
   * أحد بطبعها. فتعود تطلب رمزاً كل بضعة أيام، ويقف صاحب المطعم
   * يولّد ويكتب ويعيد.
   *
   * فطريقٌ واحد بقي: رابطٌ يحمل السرّ في عنوانه. يُفتح مرّة ويُحفظ
   * صفحةً رئيسية، فيُعاد الاقتران في كل فتحة بلا خطوة. وحذفُ الحقل
   * جزءٌ من الحلّ لا زينة: حقلٌ معروض يُملأ، وامتلاؤه يعيد الاعتماد
   * على ما يُمحى.
   */
  function askForPairing(why) {
    if (document.getElementById('rkDispPairBox')) return;
    var box = document.createElement('div');
    box.id = 'rkDispPairBox';
    box.className = 'rk-disp-overlay';
    box.innerHTML =
      '<div class="rk-disp-card">' +
        '<div class="rk-disp-msg">هذي الشاشة مو مربوطة</div>' +
        (why ? '<div class="rk-disp-pair-why">' + why + '</div>' : '') +
        '<div class="rk-disp-pair-hint">' +
          'من لوحة التحكم على جهازك: <b>المتجر الإلكتروني ← إعدادات المتجر ← شاشة العميل</b>' +
          ' ← اضغط <b>«أضف شاشة»</b>. بيطلع لك رمز من ٨ حروف — اكتبه بعد علامة # في عنوان هذي الصفحة،' +
          ' ثم ثبّت الصفحة على الشاشة الرئيسية. مرّة وحدة وخلاص.' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);
  }

  function listen() {
    var sb = window.supabaseClient;
    var s = secretFromUrl() || secret();
    if (!sb) return;
    // بلا اقتران لا استماع: شاشةٌ لم تُقترن لا تعرض باركود أحد.
    if (!s) {
      askForPairing(BAD_TOKEN
        ? 'الرمز اللي كتبته مو صحيح — راجعه في لوحة التحكم.'
        : 'ما انكتب رمز هذي الشاشة بعد.');
      return;
    }

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
    /**
     * والنبضة تتحقّق كذلك.
     *
     * سرٌّ محفوظٌ في المتصفّح لا يعني اقتراناً قائماً: المالك يحذف
     * الاقتران من لوحته -- يستبدل جهازاً أو ينظّف قائمةً -- فيبقى
     * السرّ هنا، وتتخطّى الشاشةُ طلبَ الاقتران وتستمع إلى قناةٍ لا
     * يبثّ فيها أحد.
     *
     * وأسوأ ما فيه أنه يبدو سليماً: المنيو يُعرض، فيُظنّ أن كل شيء
     * بخير، ويُكتشف العطل حين يقف زبونٌ ينتظر باركوداً لا يجيء.
     *
     * فتُقرأ نتيجة النبضة: إن لم تعد معروفةً مُسح السرّ وطُلب اقتران.
     * ولا يُمسح على خطأ شبكة -- الردّ false وحده يعني الحذف، والخطأ
     * يعني أننا لم نسأل.
     */
    /**
     * والسرّ لا يُمحى من أول ردّ.
     *
     * ردٌّ واحد يقول "لا أعرفها" قد يكون قاعدةً تتحدّث، أو دالّةً
     * تُستبدل، أو ترحيلاً يجري -- فتُمحى شاشةٌ مقترنةٌ صحيحة ويقف
     * أمامها من يعيد اقترانها بلا سبب. وذلك أسوأ من تأخّرٍ ست دقائق
     * في اكتشاف اقترانٍ حُذف فعلاً.
     *
     * فثلاثةُ ردودٍ متتالية، ثم تُطلب من جديد -- والسرّ يبقى محفوظاً:
     * إن عاد الخادم يعرفها استأنفت بلا أن يلمسها أحد.
     */
    var misses = 0;
    var beat = function () {
      try {
        var r = sb.rpc('touch_display_device', { p_secret: s });
        if (r && r.then) r.then(function (out) {
          if (out && !out.error && out.data === false) {
            if (++misses >= 3) {
              hide();
              console.warn('[شاشة العميل] الخادم لا يعرف هذا السرّ — الاقتران محذوف من اللوحة.');
              askForPairing('انحذف ربط هذي الشاشة من لوحة التحكم.');
            }
          } else if (!out || !out.error) {
            misses = 0;
          }
        }).catch(function () {});
      } catch (_) {}
    };
    beat();
    setInterval(beat, 5 * 60 * 1000);
  }

  /**
   * ويُلتمس السرّ من مرساته الثانية قبل أن يُطلب من إنسان.
   *
   * (كُتبت recoverSecret ولم تُنادَ -- فبقيت الكعكة تُكتب ولا تُقرأ،
   * وبقيت الشاشة تطلب رمزاً كلّما مُسح تخزين المتصفّح. ودالّةٌ صحيحة
   * لا يناديها أحد كدالّةٍ لا وجود لها.)
   */
  function boot() {
    recoverSecret().then(listen, listen);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /**
   * ورابطٌ يُلصق فوق الصفحة المفتوحة يُلتقط بلا إعادة تحميل.
   *
   * فتحُ رابطٍ لا يختلف عن المفتوح إلا فيما بعد # ليس تنقّلاً عند
   * المتصفّح: يبدّل العنوان ولا يعيد تحميل شيء. فالشاشةُ الواقفة على
   * صفحة "مو مربوطة" يلصق فيها المالك الرابط، فلا يتغيّر شيء ولا
   * يُقال لماذا -- وهو أوّل ما سيفعله: الصفحة مفتوحةٌ أمامه.
   *
   * (ظهرت في التجربة لا في المراجعة: لُصق الرابط فبقي اللوح قائماً،
   * والسرُّ لم يُحفظ.)
   */
  window.addEventListener('hashchange', function () {
    if (!secretFromUrl() && !tokenFromUrl()) return;
    BAD_TOKEN = false;
    var box = document.getElementById('rkDispPairBox');
    if (box) box.remove();
    boot();
  });

  window.rakeenDisplayReconnect = listen;
})();
