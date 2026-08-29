// Same pattern as order-markup.ts: a plain HTML template rendered via
// innerHTML, driven by public/book/rakeen-book.js. Booking is a short
// linear flow (service -> staff/time -> details -> confirm), unlike the
// order page's multi-item cart, so this stays a single scrolling shell with
// step-swapped content rather than sheets/overlays.
export const bookMarkup = `
<div class="bk-shell" id="bkShell">
  <div class="bk-app" id="bkApp">
    <header class="bk-header" id="bkHeader">
      <div class="bk-header-inner">
        <div class="bk-logo" id="bkLogo">ر</div>
        <div class="bk-brand-text">
          <span class="bk-brand-name" id="bkBrandName">—</span>
          <span class="bk-brand-tag">احجز موعدك مباشرة</span>
        </div>
      </div>
    </header>

    <div class="bk-hero" id="bkHero">
      <div class="bk-hero-card">
        <div class="bk-hero-logo" id="bkHeroLogo">ر</div>
        <div class="bk-hero-info">
          <div class="bk-hero-name" id="bkHeroName">—</div>
          <span class="bk-hero-chip">حجز فوري بدون اتصال</span>
        </div>
      </div>
    </div>

    <div class="bk-steps" id="bkSteps">
      <div class="bk-step-dot" data-step="1"></div>
      <div class="bk-step-dot" data-step="2"></div>
      <div class="bk-step-dot" data-step="3"></div>
    </div>

    <main class="bk-main" id="bkMain">
      <div class="bk-loading" id="bkLoading"><div class="bk-spinner"></div></div>
    </main>
  </div>
</div>

<div class="bk-toast" id="bkToast"><span id="bkToastText"></span></div>
`;
