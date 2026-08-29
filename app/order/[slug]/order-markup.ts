// Same pattern as pos-markup.ts / DashboardPage: a plain HTML template
// rendered via innerHTML, driven by public/order/rakeen-order.js.
export const orderMarkup = `
<div class="om-shell" id="omShell">
  <div class="om-app" id="omApp">
    <header class="om-header" id="omHeader">
      <div class="om-header-inner">
        <div class="om-brand">
          <div class="om-logo" id="omLogo">ر</div>
          <div class="om-brand-text">
            <span class="om-brand-name" id="omBrandName">—</span>
            <span class="om-brand-tag">اطلب مباشرة من المطعم</span>
          </div>
        </div>
      </div>
    </header>

    <div class="om-hero" id="omHero">
      <div class="om-hero-banner" id="omHeroBanner"></div>
      <div class="om-hero-card">
        <div class="om-hero-logo" id="omHeroLogo">ر</div>
        <div class="om-hero-info">
          <div class="om-hero-name" id="omHeroName">—</div>
          <div class="om-hero-chips">
            <span class="om-hero-chip">طلب مباشر بدون عمولة تطبيقات</span>
          </div>
        </div>
      </div>
    </div>

    <div class="om-toolbar">
      <div class="om-channel-row" id="omChannelRow">
        <button class="om-channel-btn active" data-channel="delivery">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          توصيل
        </button>
        <button class="om-channel-btn" data-channel="pickup">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          استلام
        </button>
      </div>
      <div class="om-branch-note" id="omBranchNote" style="display:none;"></div>
      <div class="om-search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="omSearchInput" placeholder="ابحث بالمنيو..." autocomplete="off">
      </div>
    </div>

    <nav class="om-cat-rail" id="omCatRail"></nav>

    <main class="om-menu" id="omMenu"></main>
  </div>

  <aside class="om-desktop-cart" id="omDesktopCart">
    <div class="om-desktop-cart-head">سلتك</div>
    <div class="om-desktop-cart-body" id="omDesktopCartBody">
      <div class="om-cart-empty">سلتك فاضية — اختر شي من المنيو يبدأ يظهر هنا.</div>
    </div>
  </aside>
</div>

<button class="om-cart-bar" id="omCartBar" style="display:none;">
  <span class="om-cart-count" id="omCartCount">0</span>
  <span class="om-cart-label">عرض السلة</span>
  <span class="om-cart-total mono" id="omCartTotal">0.00 ر.س</span>
</button>

<div class="om-sheet-overlay" id="omModifierOverlay">
  <div class="om-sheet">
    <div class="om-sheet-head">
      <h3 id="omModifierTitle">تخصيص المنتج</h3>
      <button class="om-sheet-close" id="omModifierClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="om-sheet-body" id="omModifierBody"></div>
  </div>
</div>

<div class="om-sheet-overlay" id="omCartOverlay">
  <div class="om-sheet">
    <div class="om-sheet-head">
      <h3>سلتك</h3>
      <button class="om-sheet-close" id="omCartClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="om-sheet-body" id="omCartBody"></div>
  </div>
</div>

<div class="om-sheet-overlay" id="omCheckoutOverlay">
  <div class="om-sheet">
    <div class="om-sheet-head">
      <h3 id="omCheckoutTitle">إتمام الطلب</h3>
      <button class="om-sheet-close" id="omCheckoutClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="om-sheet-body" id="omCheckoutBody"></div>
  </div>
</div>

<div class="om-toast" id="omToast"><span class="om-toast-dot"></span><span id="omToastText"></span></div>
`;
