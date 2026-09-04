import "./rakeen-help.css";
import HelpSearch from "./HelpSearch";

export default function HelpPage() {
  return (
    <div className="help-root">
      <header className="help-masthead">
        <div className="help-wrap">
          <span className="help-eyebrow">🎧 مركز المساعدة</span>
          <h1>أسئلة حقيقية يسألها أصحاب المطاعم</h1>
          <p>مو جولة بكل زر — بس الأسئلة اللي فعلاً تحتاج جواب: كيف تفعّل ميزة، وين تحصلها بالضبط، ووش أثر كل خيار. كل جواب مأخوذ من نفس شاشات ركين.</p>

          <HelpSearch />

          <nav className="help-nav">
            <a href="#pos">🧾 نقطة البيع</a>
            <a href="#kitchen">🍳 المطبخ</a>
            <a href="#branches">🏬 الفروع والموظفين</a>
            <a href="#storefront">🛒 المتجر الإلكتروني</a>
            <a href="#inventory">📦 المخزون</a>
            <a href="#products">🍔 المنتجات</a>
            <a href="#accounting">💰 الأرباح والضريبة</a>
            <a href="#loyalty">🎁 الولاء</a>
          </nav>
        </div>
      </header>

      <div className="help-wrap">
        <section className="help-feat" id="pos">
          <span className="help-feat-kicker">نقطة البيع</span>
          <h2>كيف يدخل الكاشير النظام أول مرة؟</h2>
          <p className="sub">كل فرع له رمز خاص من ٤ أرقام. أول جهاز بالفرع يحتاج المالك أو المدير يسجّل دخول بإيميله مرة وحدة عشان يربطه، وبعدها أي كاشير يدخل بالرمز بس — بدون إيميل ولا كلمة مرور.</p>

          <div className="device-frame compact">
            <div className="device-cam" />
            <div className="frame-view"><iframe src="/help/previews/pos-login.html" title="شاشة رمز الفرع" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من نفس شاشة الكاشير — مو رسم توضيحي</div>

          <ul className="help-steps">
            <li><span className="n">01</span><div><b>تجهيز الجهاز أول مرة</b> — <span className="d">المالك أو المدير يسجّل دخول بإيميله مرة وحدة بس، عشان يربط هذا التابلت بالفرع.</span></div></li>
            <li><span className="n">02</span><div><b>بعدها، رمز فقط</b> — <span className="d">أي كاشير يدخل بالرمز المكوّن من ٤ أرقام، بدون ما يحتاج إيميل ولا كلمة مرور.</span></div></li>
            <li><span className="n">03</span><div><b>نسيت الجهاز مُجهّز لفرع ثاني؟</b> — <span className="d">اضغط "إعادة تجهيز الجهاز" أسفل الشاشة وابدأ من جديد.</span></div></li>
          </ul>
        </section>

        <section className="help-feat" id="pos-offline">
          <span className="help-feat-kicker">نقطة البيع</span>
          <h2>وش يصير لو انقطعت الشبكة وأنا أبيع؟</h2>
          <p className="sub">الكاشير يكمل يبيع عادي — الطلب يُحفظ على الجهاز نفسه. لما يرجع النت، يرفع كل الطلبات المعلّقة ويزامنها تلقائيًا، بدون ما تسوي شي ولا تعيد إدخال شي.</p>

          <div className="device-frame tablet">
            <div className="device-cam" />
            <div className="frame-view"><iframe src="/help/previews/pos-home.html" title="الشاشة الرئيسية لنقطة البيع" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة بمنتجات مطعم عنوب الحقيقية — نفس الشاشة اللي يشتغل عليها الكاشير</div>
        </section>

        <section className="help-feat" id="pos-pager">
          <span className="help-feat-kicker">نقطة البيع</span>
          <h2>كيف أفعّل أجهزة النداء (الباجر) وأربطها بالكاشير؟</h2>
          <p className="sub">من إعدادات الكاشير ← تبويب "أنواع الطلبات"، فعّل "نستخدم أجهزة نداء". الجهاز نفسه مستقل تمامًا عن النظام — ما فيه ربط تقني بينهم. اللي يصير: الكاشير يسجّل رقم الجهاز اللي أعطيته للعميل مع طلبه، ويطبعه على فاتورة المطبخ عشان يعرفون أي جهاز يرن لما يجهز.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/pos-settings-pager.html" title="أجهزة النداء" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من إعدادات الكاشير ← أنواع الطلبات</div>
        </section>

        <section className="help-feat" id="pos-dine-in-mode">
          <span className="help-feat-kicker">نقطة البيع</span>
          <h2>كيف أختار بين وضع الطاولات الكامل ووضع الطلب المحلي البسيط؟</h2>
          <p className="sub">من إعدادات الكاشير ← أنواع الطلبات ← الطلب المحلي. لو مطعمك بسيط وما تحتاج حجز طاولات، اختر "محلي بسيط" وما يبين نظام أرقام طاولات أصلاً. لو عندك خدمة طاولات، اختر "خدمة طاولات كاملة" — يفعّل شاشة الطاولات، الأقسام، والحجوزات دفعة وحدة.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/dine-in-mode-settings.html" title="الطلب المحلي" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من إعدادات الكاشير ← أنواع الطلبات</div>
        </section>

        <section className="help-feat" id="pos-refund">
          <span className="help-feat-kicker">نقطة البيع</span>
          <h2>كيف أسترجع مبلغ طلب سابق؟</h2>
          <p className="sub">من تفاصيل الطلب بقائمة الطلبات، زر "استرجاع مبلغ" يفتح طلب موافقة برمز المدير — أي كاشير عادي ما يقدر يسويها لحاله. الاسترجاع كامل مو جزئي، والمالك يوصله إشعار فوري بكل عملية.</p>

          <div className="device-frame compact">
            <div className="device-cam" />
            <div className="frame-view"><iframe src="/help/previews/refund-flow.html" title="استرجاع مبلغ" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من تفاصيل طلب سابق — نافذة موافقة المدير</div>
        </section>

        <section className="help-feat" id="pos-manager-pin">
          <span className="help-feat-kicker">نقطة البيع</span>
          <h2>رمز الموافقة اللي يطلبه الاسترجاع، وين أضبطه؟ وهل هو نفس رمز الفرع؟</h2>
          <p className="sub">لا — رمزين مختلفين تمامًا. رمز الفرع يفتح الجهاز لأي كاشير، أما "كلمة سر المدير" رمز عام واحد لكل المطعم يُطلب بس بالعمليات الحساسة: الاسترجاع وإلغاء الطلبات دائمًا، وإغلاق الوردية اختياريًا لو حبيت. تضبطه من نفس تبويب "الفروع والأمان".</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/manager-pin-settings.html" title="كلمة سر المدير" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من إعدادات الكاشير ← الفروع والأمان</div>
        </section>

        <section className="help-feat" id="kitchen">
          <span className="help-feat-kicker">المطبخ</span>
          <h2>وش الفرق بين حالات الطلبات اللي أشوفها بشاشة المطبخ؟</h2>
          <p className="sub">الطلب يوصل هذي الشاشة أول ما يُدفع بالكاشير أو يجي من التوصيل — بدون ما حد يكتبه يدويًا. يتحوّل كهرماني قبل الوقت المتوقع بخمس دقايق، وأحمر لو تجاوزه.</p>

          <p className="sub" style={{ marginTop: 8, fontSize: 13.5 }}>الدخول لهذي الشاشة نفس نظام رمز الفرع اللي فوق بالضبط — <a href="#pos" style={{ color: "var(--lime-deep)", fontWeight: 600 }}>رجوع لفوق</a>.</p>

          <div className="help-states">
            <div className="state-chip"><span className="glyph">🍽️</span><div><b>نظام الطاولات</b><span>طلب من داخل المطعم — البطاقة تعرض رقم الطاولة مباشرة.</span></div></div>
            <div className="state-chip"><span className="glyph">🛵</span><div><b>تطبيقات التوصيل</b><span>هنقرستيشن، جاهز، وغيرها — البطاقة تعرض اسم المنصة ورقم طلبها.</span></div></div>
            <div className="state-chip"><span className="glyph">🥡</span><div><b>الاستلام (سفري)</b><span>العميل يجي ياخذه بنفسه من الفرع — البطاقة تعرض "استلام" مع اسمه إن وُجد.</span></div></div>
          </div>
          <p className="help-note">طلبات المتجر الإلكتروني توصل أول شي كإشعار "طلب إلكتروني 🌐" على شاشة الكاشير للقبول، وبعد القبول تنضم لنفس القائمة فوق حسب نوعها (توصيل أو استلام) — بدون علامة "إلكتروني" منفصلة على شاشة المطبخ نفسها حاليًا.</p>

          <div className="device-frame tablet">
            <div className="device-cam" />
            <div className="frame-view"><iframe src="/help/previews/kitchen-board.html" title="شاشة المطبخ" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة بثلاث حالات واقعية — نفس الشاشة اللي معلّقة بالمطبخ</div>

          <div className="help-callouts">
            <div className="callout"><b>إنهاء التحضير</b>زر "تم التجهيز" يشيل البطاقة فورًا — أو تختفي تلقائيًا وحدها حسب إعداد الفرع (يدوي/تلقائي).</div>
          </div>
        </section>

        <section className="help-feat" id="kitchen-ready-mode">
          <span className="help-feat-kicker">المطبخ</span>
          <h2>وين أبدّل بطاقة المطبخ من "يدوي" إلى "تختفي تلقائيًا"؟</h2>
          <p className="sub">من إعدادات الكاشير ← شاشة المطبخ. باليدوي، الموظف يضغط "تم التجهيز" بنفسه. بالتلقائي، تحدد عدد دقايق وتختفي البطاقة وحدها بعدها بدون ضغط — يفيد لو مطبخك سريع وما تبي حد يضيّع وقت يضغط زر.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/kitchen-ready-mode.html" title="آلية شاشة المطبخ" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من إعدادات الكاشير ← شاشة المطبخ</div>
        </section>

        <section className="help-feat" id="branches">
          <span className="help-feat-kicker">الفروع والموظفين</span>
          <h2>كيف أضيف موظف وأربطه برمز دخول الكاشير؟</h2>
          <p className="sub">من الموظفون ← إضافة موظف، عبّي بياناته، وفعّل "تفعيل الكاشير لهذا الموظف" — يظهر اسمه بقائمة اختيار الموظف اللي تطلع بعد رمز الفرع مباشرة، بدون ما يحتاج رمز دخول منفصل له.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/employee-cashier-toggle.html" title="تفعيل الكاشير لموظف" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من نموذج إضافة/تعديل موظف</div>

          <div className="help-callouts">
            <div className="callout"><b>ربط باسم كاشير قديم</b>لو عندك اسم كاشير سجّلته قبل هالشاشة، اربطه هنا بدل ما تسوي اسم مكرر.</div>
            <div className="callout"><b>الراتب</b>يبان بس لمن عنده صلاحية الاطّلاع عليه — مو كل من يفتح صفحة الموظفين.</div>
          </div>
        </section>

        <section className="help-feat" id="employee-compliance">
          <span className="help-feat-kicker">الفروع والموظفين</span>
          <h2>كيف أضيف تنبيه لانتهاء إقامة أو وثيقة موظف؟</h2>
          <p className="sub">من الموظفون ← الامتثال والوثائق ← إضافة وثيقة. تسجّل أي نوع (إقامة، عقد عمل، شهادة صحية، تأمين...) لكل موظف على حدة، وتحدد كم يوم قبل الانتهاء تبي التنبيه — رقم قابل للتغيير لكل وثيقة، مو ثابت للكل.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/compliance-panel.html" title="الامتثال والوثائق" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من الموظفون ← الامتثال والوثائق</div>
        </section>

        <section className="help-feat" id="storefront">
          <span className="help-feat-kicker">المتجر الإلكتروني</span>
          <h2>كيف أفعّل المتجر الإلكتروني؟</h2>
          <p className="sub">الخطوة الأولى تحتاج تواصل مع فريق ركين يفعّلها لحسابك — بعدها كل الإعدادات (الشعار، الألوان، التوصيل والاستلام) تديرها بنفسك من نفس الشاشة، بدون ما تحتاج تتواصل معهم مرة ثانية.</p>

          <div className="device-frame compact wide-compact">
            <div className="device-cam" />
            <div className="frame-view"><iframe src="/help/previews/storefront-menu.html" title="المتجر الإلكتروني" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من متجر مطعم عنوب الحقيقي — anoob.rakeenapp.com</div>

          <ul className="help-steps">
            <li><span className="n">01</span><div><b>فعّلها فريق ركين</b> — <span className="d">تواصل معهم مرة وحدة — ما فيه تفعيل ذاتي من عندك لهذي الخطوة تحديدًا.</span></div></li>
            <li><span className="n">02</span><div><b>بعدها، الإعدادات كلها بيدك</b> — <span className="d">الشعار، الألوان، هل تقدّم توصيل أو استلام أو الاثنين — من نفس صفحة المتجر الإلكتروني.</span></div></li>
            <li><span className="n">03</span><div><b>رابطك جاهز فورًا</b> — <span className="d">بصيغة {"{اسم-متجرك}"}.rakeenapp.com، تقدر تحطه بالبايو أو تشاركه واتساب.</span></div></li>
          </ul>

          <div className="help-callouts">
            <div className="callout"><b>أقرب فرع تلقائيًا</b>للتوصيل، النظام يحدد أقرب فرع لموقع العميل من بين فروعك المفعّلة — بشرط تكون حددت موقع كل فرع (قسم الفروع فوق).</div>
          </div>
        </section>

        <section className="help-feat" id="storefront-geidea">
          <span className="help-feat-kicker">المتجر الإلكتروني</span>
          <h2>كيف أخلي عملاء متجري يدفعون بالبطاقة أونلاين؟</h2>
          <p className="sub">سجّل حساب Geidea بنفسك (خارج ركين)، وبعدها الصق المفتاح العام وكلمة مرور الـAPI من إعدادات المتجر. هذا الربط يخص دفع البطاقة بالمتجر الإلكتروني بس — ما له علاقة بجهاز الدفع الفعلي بالكاشير.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/geidea-panel.html" title="بوابة الدفع" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من إعدادات المتجر ← بوابة الدفع</div>
        </section>

        <section className="help-feat" id="inventory">
          <span className="help-feat-kicker">المخزون</span>
          <h2>كيف يوصل المخزون بوصفة المنتج تلقائيًا؟</h2>
          <p className="sub">تربط كل صنف مخزون (زي الأرز أو اللحم) بمنتج عن طريق وصفة — كم كمية يدخل بكل تحضيرة. بعدها كل عملية بيع تخصم الكمية المستخدمة من المخزون أوتوماتيك، بدون جرد يدوي. نفس نظام الألوان اللي بالمطبخ يتكرر هنا: أخضر بمستوى جيد، كهرماني قرّب يخلص، أحمر يحتاج طلب فوري.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/inventory-panel.html" title="المخزون" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من المخزون والمشتريات ← المخزون</div>

          <div className="help-callouts">
            <div className="callout"><b>نسبة تكلفة الطعام</b>تكلفة المكونات مقابل المبيعات الفعلية — المعدل الصحي لمطاعم الكوفي بين ٢٨-٣٣٪.</div>
          </div>
        </section>

        <section className="help-feat" id="inventory-invoice-scan">
          <span className="help-feat-kicker">المخزون</span>
          <h2>أقدر أسجّل فاتورة مورّد بالكاميرا بدل ما أكتبها يدويًا؟</h2>
          <p className="sub">إي — زر "صوّر الفاتورة" بشاشة المشتريات يقرأ الصورة تلقائيًا ويعبّي المورّد والأصناف والكميات والأسعار لك. بس القراءة الذكية سريعة مو معصومة — راجع الأرقام قبل الحفظ، خصوصًا لو الصورة مو واضحة أو الخط صغير.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/invoice-scan.html" title="مسح فاتورة مورّد" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من المخزون والمشتريات ← تسجيل فاتورة مورّد</div>
        </section>

        <section className="help-feat" id="products">
          <span className="help-feat-kicker">المنتجات</span>
          <h2>عندي منتج زي "البوكس" محتواه يتغيّر كل طلب — كيف أحسب تكلفته؟</h2>
          <p className="sub">فيه وضع تسعير مخصص لهذا بالضبط: تحدد إجمالي عدد القطع (مثلاً ١٨)، تختار أي أصناف مخزون يقدر العميل يوزّعها بينها، وتضبط "التركيبة المعتادة" الافتراضية. السعر يظل ثابت للعميل، لكن ركين يحسب لك أفضل حالة وأسوأ حالة للتكلفة الفعلية — مو رقم وهمي واحد.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/box-product-setup.html" title="إعداد منتج بوكس" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من نموذج إضافة منتج — نفس بوكس وسط مشكّل الحقيقي</div>
        </section>

        <section className="help-feat" id="products-modifiers">
          <span className="help-feat-kicker">المنتجات</span>
          <h2>كيف أضيف إضافات (زي جبن إضافي) بسعر مختلف عن تكلفتها الحقيقية؟</h2>
          <p className="sub">من مجموعات الخيارات — تسوي مجموعة "اختيار متعدد"، وكل خيار فيها له سعران منفصلان: كم تحسب على العميل، وكم يكلفك فعليًا (رقم تكتبه يدويًا أو مربوط بصنف مخزون يُحسب تلقائيًا). المجموعة الواحدة تقدر تربطها بأكثر من منتج.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/modifier-group-setup.html" title="مجموعة خيارات" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من نموذج مجموعة خيارات بشاشة المنتجات</div>
        </section>

        <section className="help-feat" id="accounting">
          <span className="help-feat-kicker">الأرباح والضريبة</span>
          <h2>من وين تجي أرقام الربح والضريبة اللي أشوفها؟</h2>
          <p className="sub">كلها محسوبة لحظة بلحظة من بياناتك الحقيقية — مو تقدير. المبيعات من الكاشير، تكلفة البضاعة من وصفات المخزون فوق، عمولات التوصيل من منصاتك، والضريبة ١٥٪ من صافي المبيعات. لو رقم الربح يبان ناقص أو غريب، الاحتمال إن وصفة منتج أو منصة توصيل ناقصة الإعداد.</p>

          <div className="device-frame browser wide">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/accounting-panel.html" title="الأرباح والضريبة" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من الأرباح ← نظرة عامة</div>

          <div className="help-callouts">
            <div className="callout"><b>ضريبة القيمة المضافة المستحقة</b>تتجمّع تلقائيًا يوم بيوم — جاهزة لتقرير الزكاة والضريبة بدون حساب يدوي.</div>
            <div className="callout"><b>تكلفة البضاعة وعمولات التوصيل تُخصم قبل "مجمل الربح"</b>لازم تكون ضبطت وصفات المخزون وأضفت منصات التوصيل، وإلا الرقم ناقص.</div>
          </div>
        </section>

        <section className="help-feat" id="accounting-delivery-platform">
          <span className="help-feat-kicker">الأرباح والضريبة</span>
          <h2>كيف أضيف منصة توصيل وأربط عمولتها بأرباحي؟</h2>
          <p className="sub">من الأرباح ← تسوية منصات التوصيل ← أضف اسم المنصة. تحدد نسبة عمولتها، هل تُحسب من الإجمالي أو قبل الضريبة، ونموذج رسوم التوصيل (ثابت أو متدرّج حسب قيمة الطلب). نفس الشاشة فيها "أقصى وقت تجهيز" — وهذا الرقم بالضبط هو اللي يحدد متى تتحول بطاقة طلب هالمنصة لكهرماني ثم أحمر بشاشة المطبخ.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/delivery-platform-settings.html" title="منصات التوصيل" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من الأرباح ← تسوية منصات التوصيل</div>
        </section>

        <section className="help-feat" id="accounting-daily-report">
          <span className="help-feat-kicker">الأرباح والضريبة</span>
          <h2>فيه تقرير يومي يتولّد لي وحده؟ كيف أتحكم بمحتواه؟</h2>
          <p className="sub">إي — كل ليلة الساعة ١٢ يتولّد تقرير كامل عن يومك تلقائيًا (ملخص مالي، مبيعات، منتجات، ضريبة...) ويُحفظ بأرشيف تقدر ترجع له بأي وقت. تقدر تختار أي أقسام تظهر فيه من نفس شاشة التقارير، وتطبع أو تحفظ أي يوم PDF.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/daily-report-config.html" title="التقرير اليومي التلقائي" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من التقارير ← التقرير اليومي التلقائي</div>
        </section>

        <section className="help-feat" id="accounting-vat-return">
          <span className="help-feat-kicker">الأرباح والضريبة</span>
          <h2>وش الفرق بين "تقرير الضريبة" و"الإقرار الضريبي"؟</h2>
          <p className="sub">"تقرير الضريبة" يعرض ضريبة مبيعاتك بس. "الإقرار الضريبي" أدق — يطرح منه ضريبة المدخلات (اللي دفعتها لموردين مسجّلين بالضريبة على مشترياتك) عشان يطلع لك صافي المستحق الفعلي لهيئة الزكاة والضريبة. مهم: ما يشمل ضريبة مدخلات المصاريف العامة (إيجار، تسويق) — راجعها مع محاسبك.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/vat-return-report.html" title="الإقرار الضريبي" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من التقارير ← الإقرار الضريبي</div>
        </section>

        <section className="help-feat" id="accounting-whatsapp">
          <span className="help-feat-kicker">الأرباح والضريبة</span>
          <h2>أقدر أسأل عن مبيعاتي بواتساب بدل ما أفتح لوحة التحكم؟</h2>
          <p className="sub">إي — اربط رقمك مرة وحدة (تنشئ رمز من لوحة التحكم وترسله من واتساب حقك لرقم ركين نفسه، مو العكس)، وبعدها تقدر تكلم نفس الرقم وتسأله عن مبيعاتك وطلباتك ومخزونك مباشرة من جوالك.</p>

          <div className="device-frame browser">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/whatsapp-link.html" title="ربط واتساب" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من الإشعارات ← ربط واتساب</div>
        </section>

        <section className="help-feat" id="loyalty">
          <span className="help-feat-kicker">الولاء</span>
          <h2>كيف أفعّل نظام الولاء وأعدّل نسب الخصم؟</h2>
          <p className="sub">مفتاح تشغيل/إيقاف واحد أعلى شاشة الولاء. لما يكون مفعّل، كل عملية بيع تضيف نقاط تلقائيًا لرقم جوال العميل (نقطة كل ١٠ ر.س افتراضيًا)، وكل ما زاد صرفه ترقّى لمستوى أعلى. أسماء المستويات وترتيبها ثابت (Bronze إلى Platinum)، بس حد كل مستوى ونسبة خصمه تتحكم فيها أنت من تبويب "المستويات".</p>

          <div className="device-frame browser wide">
            <div className="browser-bar"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
            <div className="frame-view"><iframe src="/help/previews/loyalty-panel.html" title="الولاء" loading="lazy" /></div>
          </div>
          <div className="device-caption"><span className="dot" />معاينة حيّة من الولاء ← نظرة عامة</div>
        </section>
      </div>
    </div>
  );
}
