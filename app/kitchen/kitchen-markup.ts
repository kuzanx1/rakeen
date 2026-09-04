// Body markup for the Kitchen Display System — a lean sibling of app/pos,
// reusing the exact same auth pattern (owner/manager provisions the device
// once, then the branch's shared 4-digit PIN unlocks it every time after)
// so there's no new credential system to build or explain. No staff picker,
// no shift gate — the kitchen never touches payment, so neither concept
// applies here.
export const kitchenMarkup = `<body>

<div class="pos-auth-screen" id="kdsProvisionScreen">
  <div class="pos-auth-card">
    <img class="brand-avatar" src="/brand/rakeen-wordmark.png" alt="ركين" style="height:28px;width:auto;margin-bottom:14px;">
    <h2 class="pos-auth-title">تجهيز شاشة المطبخ</h2>
    <p class="pos-auth-sub">سجّل دخولك كمدير أو مالك مرة وحدة بس، عشان نربط هذه الشاشة بفرعك.</p>
    <div class="pos-auth-field"><input type="email" id="kdsProvEmail" placeholder="البريد الإلكتروني" autocomplete="username"></div>
    <div class="pos-auth-field"><input type="password" id="kdsProvPassword" placeholder="كلمة المرور" autocomplete="current-password"></div>
    <div class="pos-auth-error" id="kdsProvError" style="display:none;"></div>
    <div class="pos-auth-field hidden" id="kdsProvBranchField"><select id="kdsProvBranchSelect"></select></div>
    <button class="confirm-pay-btn" id="kdsProvSubmitBtn">ربط الشاشة</button>
  </div>
</div>

<div class="pos-auth-screen hidden" id="kdsLoginScreen">
  <div class="pos-auth-card">
    <img class="brand-avatar" src="/brand/rakeen-wordmark.png" alt="ركين" style="height:28px;width:auto;margin-bottom:14px;">
    <h2 class="pos-auth-title">رمز الفرع</h2>
    <p class="pos-auth-sub" id="kdsLoginBranchLabel">أدخل رمز نقطة البيع لهذا الفرع</p>
    <div class="pin-dots" id="kdsLoginPinDots"></div>
    <div class="pin-pad" id="kdsLoginPinPad"></div>
    <div class="pos-auth-error" id="kdsLoginError" style="display:none;"></div>
    <a class="pos-auth-reprovision" id="kdsReprovisionLink">إعادة تجهيز الشاشة</a>
  </div>
</div>

<div class="kds-app hidden" id="kdsApp">
  <div class="kds-topbar">
    <div class="kds-identity">
      <img class="brand-avatar" src="/brand/rakeen-wordmark.png" alt="ركين" style="height:22px;width:auto;">
      <div class="kds-identity-text">
        <div class="kds-identity-name" id="kdsBusinessName"></div>
        <div class="kds-identity-branch" id="kdsBranchName"></div>
      </div>
    </div>
    <div class="kds-tb-spacer"></div>
    <div class="kds-count-pill"><span id="kdsOrderCount">0</span> طلب جاري</div>
    <div class="kds-clock" id="kdsClock"></div>
    <button class="auth-util-btn" id="kdsLogoutBtn" title="تسجيل خروج">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>
  </div>
  <div class="kds-board" id="kdsBoard"></div>
</div>

</body>`;
