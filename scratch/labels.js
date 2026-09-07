
/* ============ تسميات البطاقة ============

   حقول البطاقة تسمياتها مفاتيح تُترجَم بلغة جهاز الزبون. وهذا افتراضٌ
   صحيح ولزومٌ خاطئ: مقهىً يسمّي زياراته "كوباتك"، ونادٍ يسمّي مستواه
   "رتبتك"، ومطعمٌ لا يريد أن يُدعى زبونُه "العميل".

   فمن كتب تسميته أخذها كما كتبها -- وخسر ترجمتها، وهو يعرف ما يخسر:
   كتبها بلغته لأنه يعرف بأي لغةٍ يخاطب زبائنه. والفراغ يُبقي المترجَم،
   فمن لم يقرّر لم يُقرَّر عنه. */

const RKW_LABEL_FIELDS = [
  ['progress', 'عدّاد الزيارات/الأكواب', 'زياراتك'],
  ['left',     'كم باقي له',             'باقي على مكافأتك'],
  ['ready',    'لما تجهز مكافأته',       'مكافأتك جاهزة 🎉'],
  ['customer', 'اسم العميل',             'العميل'],
  ['reward',   'المكافأة',               'مكافأتك'],
  ['tier',     'المستوى',                'مستواك'],
  ['saved',    'كم وفّر معك',            'وفّرت معنا'],
  ['since',    'تاريخ انضمامه',          'عميلنا منذ'],
  ['how',      'عنوان الشرح (ظهر البطاقة)', 'كيف تستخدمها'],
];

const RKW_LABEL_TOGGLES = [
  ['hideTier',  'أخفِ المستوى (Bronze / Gold …)'],
  ['hideSaved', 'أخفِ "وفّرت معنا"'],
  ['hideSince', 'أخفِ "عميلنا منذ"'],
];

function walletLabelsHtml(){
  const L = WALLET_ASSETS.labels || {};
  const rows = RKW_LABEL_FIELDS.map(([k, what, def]) => `
    <div class="rk-lblrow">
      <span class="rk-lblrow-what">${what}</span>
      <input type="text" class="rk-lblrow-in" data-lbl="${k}" maxlength="40"
             value="${escapeHtml(L[k] || '')}" placeholder="${escapeHtml(def)}">
    </div>`).join('');

  return `
    <details class="rk-dgroup rk-dadv" id="walletLabelsBlock">
      <summary>
        <span class="rk-dgroup-title">تسميات البطاقة</span>
        <span class="rk-dgroup-sub">غيّرها بكيفك — أو اتركها وتترجم نفسها حسب لغة جوال عميلك.</span>
      </summary>
      <p class="stock-qty-helper" style="margin-top:12px;">
        الفاضي = التسمية الافتراضية المترجمة. واللي تكتبه <b>يظهر كما كتبته</b> لكل عميل —
        يعني تخسر الترجمة التلقائية لذاك الحقل.
      </p>
      <div class="rk-lbltable">${rows}</div>

      <div class="rk-lblrow-head">حقول تقدر تخفيها</div>
      ${RKW_LABEL_TOGGLES.map(([k, label]) => `
        <label class="rk-check" style="margin-top:8px;">
          <input type="checkbox" data-lblflag="${k}" ${L[k] ? 'checked' : ''}>
          <span class="rk-check-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
          <span>${label}</span>
        </label>`).join('')}

      <div class="rk-field" style="margin-top:14px;">
        <label>نصّ "كيف تستخدمها" (ظهر البطاقة)</label>
        <textarea id="walletHowText" rows="3" maxlength="300"
          placeholder="اعرض هذه البطاقة عند الكاشير. وحين تجهز مكافأتك اطلبها منه…">${escapeHtml(L.howText || '')}</textarea>
      </div>
    </details>`;
}

function mountWalletLabels(){
  const g3 = [...document.querySelectorAll('.rk-dgroup')]
    .find(g => (g.querySelector('.rk-dgroup-title') || {}).textContent === 'النصوص');
  if(!g3 || document.getElementById('walletLabelsBlock')) return;
  g3.insertAdjacentElement('afterend', (()=>{
    const d = document.createElement('div');
    d.innerHTML = walletLabelsHtml();
    return d.firstElementChild;
  })());
}

/**
 * ما كُتب فقط يُحفظ.
 *
 * حقلٌ فارغ ليس تسميةً فارغة -- هو "لم أقرّر"، والمترجَم يبقى. ولو
 * حُفظ الفراغ لخرجت البطاقة بحقلٍ بلا تسمية، وهو أسوأ من تسميةٍ
 * بلغةٍ أخرى.
 */
function collectWalletLabels(){
  const out = {};
  document.querySelectorAll('[data-lbl]').forEach(el => {
    const v = (el.value || '').trim();
    if(v) out[el.dataset.lbl] = v;
  });
  document.querySelectorAll('[data-lblflag]').forEach(el => {
    if(el.checked) out[el.dataset.lblflag] = true;
  });
  const how = document.getElementById('walletHowText');
  if(how && how.value.trim()) out.howText = how.value.trim();
  return out;
}
