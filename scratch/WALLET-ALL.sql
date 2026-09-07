-- ============================================================
--  بطاقة المحفظة -- كل ما ينقص القاعدة، في ملفٍ واحد
-- ============================================================
--
-- جُمِع من سبع مهاجرات كُتبت تباعاً. وجمعُها ليس تبسيطاً: كلٌّ منها
-- كانت تُرسَل وحدها فتُشغَّل واحدةٌ وتُنسى أخرى، ويُردّ الحفظ برسالةٍ
-- عن عمودٍ مفقود لا تدلّ على أيّها نُسي.
--
-- وكلّه يُعاد تشغيله بأمان: الأعمدة بـif not exists، والقيود تُسقَط
-- قبل أن تُضاف، والدالّة create or replace. فمن شغّل بعضها من قبل لا
-- يضرّه أن يشغّل الكلّ الآن.
-- ============================================================

-- أصول بطاقة المحفظة: ما يرفعه صاحب المطعم بنفسه.
--
-- البطاقة كانت تأخذ لون العلامة وشعار الولاء وكفى. وهي واجهةُ المطعم
-- في جيب زبونه، تُفتح أكثر مما يُفتح أي شيء بنيناه -- فينبغي أن تُشبهه
-- هو لا أن تُشبه قالبنا.
--
-- وثلاثة مواضع لا موضع واحد، لأن آبل تعاملها ثلاثة:
--
--   الأيقونة  -- تظهر في الإشعارات وفي قائمة المحفظة. مربّعة صغيرة،
--                وهي أول ما يُرى وآخر ما يُتذكَّر.
--   الشعار    -- في أعلى البطاقة إلى جانب اسم المطعم. عريضٌ لا مربّع.
--   الشريط    -- خلف الأختام، عرض البطاقة كله. وهو أكبر مساحة بصرية
--                فيها، ومن تركه أخذ ما نرسمه نحن.

alter table businesses
  add column if not exists wallet_icon_url text,
  add column if not exists wallet_logo_url text,
  add column if not exists wallet_strip_url text;

comment on column businesses.wallet_icon_url is
  'أيقونة البطاقة في الإشعارات وقائمة المحفظة. 116×116 على الأقل، مربّعة.';
comment on column businesses.wallet_logo_url is
  'شعار أعلى البطاقة. حتى 480×150، بخلفية شفافة.';
comment on column businesses.wallet_strip_url is
  'خلفية شريط الأختام. 750×246. حين تُترك، يُرسم الشريط تلقائياً بلون العلامة.';
-- والختم لا يُرفع صورةً: يُختار شكله من منتقي أيقونات الولاء الموجود
-- أصلاً (loyalty_icon_style)، ويُرسم في الشريط بالحساب. صورةٌ مرفوعة
-- تحتاج فكّ ترميز PNG داخل الـWorker، وهذا ثمنٌ كبير لما يُنجزه اختيارٌ
-- من قائمة -- والقائمة عنده من قبل.

/**
 * لون الخلفية مستقلٌّ عن لون بطاقة الولاء القديمة.
 *
 * loyalty_accent_color كان لتلك الصفحة، ولونُ خلفيةِ بطاقةٍ في المحفظة
 * قرارٌ آخر: هي تُرى بجوار بطاقات بنوكٍ ومطاعم، لا وحدها في صفحة.
 */
alter table businesses
  add column if not exists wallet_bg_color text
  check (wallet_bg_color is null or wallet_bg_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column businesses.wallet_bg_color is
  'خلفية بطاقة المحفظة. حين تُترك، يُشتقّ من loyalty_accent_color.';

-- ============ مواقع الفروع: الإشعار حين يقترب ============
--
-- محفظة آبل تحمل في البطاقة حتى عشرة مواقع، وتعرض تنبيهاً على شاشة
-- القفل حين يقترب صاحبها من أحدها. بلا خادم، وبلا تتبّعٍ يصلنا، وبلا
-- استهلاك بطارية -- iOS يتولّاها كلها.
--
-- ولا عمودَ جديد هنا: branches.lat/lng موجودان منذ الطلب الإلكتروني،
-- ولوحةُ الفروع تحرّرهما أصلاً. عمودان آخران بالمعنى نفسه يعنيان مصدرَي
-- حقيقةٍ لموقعٍ واحد، وأحدهما سيتخلّف عن الآخر يوماً ما.

alter table businesses
  add column if not exists wallet_nearby_text text
  not null default 'وحشتنا 🤍 قهوتك بانتظارك';

comment on column businesses.wallet_nearby_text is
  'ما يظهر على شاشة قفل الزبون حين يقترب من الفرع. عشرون حرفاً تُقرأ في لمحة خيرٌ من جملة.';


-- ============ وتُرجَع مع بيانات البطاقة ============
--
-- المواقع تُجمع في المصفوفة نفسها: نداءٌ واحد يبني بطاقةً كاملة، لا
-- نداءٌ للبيانات وآخر للفروع -- والبطاقة تُبنى عند كل تحديث، فرحلةٌ
-- زائدة فيها رحلةٌ زائدة في كل مرة.

-- ختم صاحب المطعم صورةً يرفعها.
--
-- الأشكال المرسومة تغطّي المألوف -- كوبٌ وبرجرٌ وكفٌّ وثقل -- ولا
-- تغطّي علامةً بعينها. ومقهىً له فنجانه المرسوم بيد مصمّمه لا يريد
-- فنجاننا، وإن كان فنجاناً.
--
-- ولا عمود جديد: loyalty_custom_icon_url موجود منذ بطاقة الويب، وهو
-- الصورة نفسها للغرض نفسه -- ومن أضاف عموداً ثانياً بالمعنى نفسه أضاف
-- سؤالاً: أيّهما الصحيح حين يختلفان؟ الناقص كان أن تصل الصورة إلى
-- دالّة البطاقة، لا أن تُخزَّن.

-- الصورة المرفوعة: خلفيةٌ للأختام، أم بديلٌ عنها؟
--
-- كانت تحلّ محلّها دائماً -- وهذا قيدٌ فرضناه نحن لا آبل. فشريط
-- البطاقة صورةٌ واحدة نولّدها، ومن ملك توليدها ملك أن يرسم فيها
-- طبقةً فوق طبقة: خلفيةً ثم أختاماً فوقها، كما تفعل البطاقات التي
-- يُحتذى بها.
--
-- والخياران ليسا واحداً: من رفع نسيجاً أو صورةً لمحلّه أرادها خلفية،
-- ومن صمّم الشريط كاملاً عند مصمّمه أراده كما هو. والافتراضي خلفية،
-- لأن الأختام هي التي تُرجع الزبون.
alter table businesses
  add column if not exists wallet_strip_mode text not null default 'behind'
  check (wallet_strip_mode in ('behind', 'replace'));

comment on column businesses.wallet_strip_mode is
  'behind: الصورة خلفية والأختام فوقها. replace: الصورة وحدها بلا أختام.';

-- ختمان لا ختم: ما قبل الزيارة، وما بعدها.
--
-- كان الفارغ يُشتقّ من الممتلئ: تُطفأ ألوانه ويُخفَّف. وهذا يكفي شكلاً
-- بسيطاً، ولا يكفي تصميماً -- فالبطاقات المحترفة ترسم الحالتين رسمين
-- مختلفين: كوبٌ فارغ بحدٍّ رفيع، وكوبٌ ممتلئ بلونٍ وظلّ. والفرق بينهما
-- ليس شفافيةً، إنما شكلان.
--
-- والصورة موجودة أصلاً للممتلئ (loyalty_custom_icon_url)، فالناقص
-- صورةٌ ثانية للفارغ. ومن تركها أخذ الاشتقاق كما كان.
alter table businesses
  add column if not exists wallet_stamp_empty_url text;

comment on column businesses.wallet_stamp_empty_url is
  'ختم ما قبل الزيارة. حين يُترك، يُشتقّ من الممتلئ بإطفاء لونه.';

-- حقولٌ أكثر في البطاقة، ببياناتٍ محسوبةٍ أصلاً.
--
-- آبل تسمح لبطاقة المتجر بثلاثة حقولٍ في الترويسة وأربعةٍ تحتها. وكنّا
-- نستعمل واحداً وحقلين -- فنصف البطاقة فارغ، والزبون يفتحها فلا يجد
-- فيها إلا ما يعرفه.
--
-- والمعروض ليس جديداً يُحسب: المستوى وتاريخ الانضمام وما وفّره كلها
-- تُحسب منذ بطاقة الويب في get_loyalty_card_data. فتُرفع إلى بطاقة
-- المحفظة بالمنطق نفسه -- ورقمان مختلفان لشيءٍ واحد في مكانين أسوأ من
-- رقمٍ واحدٍ في مكان.

-- خلفية الشريط وترتيب أختامه: قرارُ صاحب المطعم لا اشتقاقُنا.
--
-- الخلفية كانت تُشتقّ دائماً -- قاتمٌ من لون البطاقة بنسبةٍ ثابتة. وهو
-- افتراضيٌّ صحيح: يعطي بطاقةً متّسقة بلا أن يُطلب قرار. لكنه ليس
-- القرار الوحيد: من هويّته لونان أراد الاثنين، ومن أراد أسود صافياً
-- خلف أختامه الذهبية أراده هو -- ولا سبيل له إليه.
--
-- والترتيب كذلك: صفٌّ مستقيم أوضح ما يُعدّ وليس أجمل ما يُرى. والبطاقات
-- التي يُحتذى بها فيها ما يعلو وما ينزل وما ينحني، والعين تقرأ الميل
-- قبل أن تعدّ.
alter table businesses
  add column if not exists wallet_strip_bg_mode text not null default 'auto'
    check (wallet_strip_bg_mode in ('auto', 'solid', 'gradient', 'image')),
  add column if not exists wallet_strip_bg1 text
    check (wallet_strip_bg1 is null or wallet_strip_bg1 ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists wallet_strip_bg2 text
    check (wallet_strip_bg2 is null or wallet_strip_bg2 ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists wallet_stamp_layout text not null default 'grid'
    check (wallet_stamp_layout in ('grid', 'stagger', 'arch', 'wave'));

comment on column businesses.wallet_strip_bg_mode is
  'auto: يُشتقّ من لون البطاقة. solid: لون واحد. gradient: تدرّج بين لونين. image: صورة مرفوعة.';
comment on column businesses.wallet_stamp_layout is
  'grid: صف مستقيم. stagger: واحد يعلو وواحد ينزل. arch: قوس. wave: موجة.';

-- ثلاثة: قيدٌ يُصحَّح، وحجابٌ يُضبط، ومقاسٌ يُختار.

-- ============ ١) القيد ============
--
-- أُضيف خيار "صورة" إلى مبدّل الخلفية بعد أن كُتب القيد بثلاثة، فمن
-- شغّل المهاجرة قبل التعديل بقي قيدُه بثلاثة -- ويردّ الحفظ برسالةٍ
-- عن قيدٍ لا يعرفها من يقرؤها. ويُصحَّح هنا لا هناك: مهاجرةٌ شُغّلت لا
-- تُشغَّل مرتين.
alter table businesses drop constraint if exists businesses_wallet_strip_bg_mode_check;
alter table businesses add constraint businesses_wallet_strip_bg_mode_check
  check (wallet_strip_bg_mode in ('auto', 'solid', 'gradient', 'image'));

-- ============ ٢) الحجاب ============
--
-- الصورة المرفوعة يُمرَّر عليها سوادٌ خفيف لتُقرأ الأختام فوقها. وكان
-- ثابتاً عند 34% -- رقمٌ اخترناه لصورةٍ متوسّطة الازدحام. وصورةٌ داكنة
-- أصلاً لا تحتاجه، وصورةٌ فيها بياضٌ وتفاصيل تحتاج ضعفه.
--
-- والقرار بصريّ يراه صاحبها في معاينته، فيُترك له.
alter table businesses
  add column if not exists wallet_strip_scrim smallint not null default 34
  check (wallet_strip_scrim between 0 and 75);

comment on column businesses.wallet_strip_scrim is
  'شدّة التعتيم فوق صورة الخلفية، صفر إلى 75 بالمئة. صفر = بلا حجاب.';

-- ============ ٣) مقاس الختم ============
--
-- المقاس محسوبٌ من عرض الشريط وعدد الأختام -- وهو حسابٌ صحيح لا أكثر.
-- ومقهىً بستّة أختام قد يريدها كبيرةً تملأ الشريط، وآخر يريدها صغيرةً
-- تترك فراغاً حول علامته. وآبل تحدّد مساحة الشريط، لا ما نرسم فيها.
--
-- ونسبةٌ لا بكسلات: الأصل يتغيّر بعدد الأختام وبكثافة الشاشة، والنسبة
-- تتبعه. وبكسلاتٌ ثابتة تخرج مقبولةً بستّة أختام ومتراكبةً بأربعة عشر.
alter table businesses
  add column if not exists wallet_stamp_size smallint not null default 100
  check (wallet_stamp_size between 50 and 200);

comment on column businesses.wallet_stamp_size is
  'مقاس الختم نسبةً إلى المحسوب تلقائياً: 50 إلى 200 بالمئة.';


-- ============ وتُرجَع مع بيانات البطاقة ============

-- ============ الدالّة، بصيغتها النهائية ============
create or replace function get_wallet_pass_data(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $wallet$
declare
  v_out jsonb; v_spend numeric; v_saved numeric;
begin
  select coalesce(sum(o.total), 0) into v_spend
  from orders o join customers c on c.id = o.customer_id
  where c.public_token = p_token and o.status = 'completed';

  select coalesce(sum(mi.price * oi.qty), 0) into v_saved
  from order_items oi
  join orders o on o.id = oi.order_id
  join customers c on c.id = o.customer_id
  join menu_items mi on mi.id = oi.menu_item_id
  where c.public_token = p_token and oi.is_points_redemption = true;

  select jsonb_build_object(
    'customerId', c.id, 'businessId', b.id,
    'customerName', coalesce(c.name, ''),
    'businessName', coalesce(b.name, 'ركين'),
    'systemType', b.loyalty_system_type,
    'points', c.loyalty_points, 'visits', c.loyalty_visits, 'units', c.loyalty_units,
    'freeRewards', c.loyalty_free_rewards,
    'visitsThreshold', b.loyalty_visits_threshold,
    'unitsThreshold', b.loyalty_unit_threshold,
    'rewardLabel', coalesce(b.loyalty_reward_label, 'مكافأة مجانية'),
    'accentColor', coalesce(b.loyalty_accent_color, '#C4FF2B'),
    'tagline', coalesce(b.loyalty_tagline, ''),
    'logoUrl', coalesce(b.loyalty_logo_url, b.logo_url, ''),
    'updatedAt', c.wallet_pass_updated_at,
    'enabled', coalesce(b.loyalty_enabled, true),
    'iconUrl', b.wallet_icon_url,
    'walletLogoUrl', b.wallet_logo_url,
    'stripUrl', b.wallet_strip_url,
    'stripMode', coalesce(b.wallet_strip_mode, 'behind'),
    'stripBgMode', coalesce(b.wallet_strip_bg_mode, 'auto'),
    'stripBg1', b.wallet_strip_bg1,
    'stripBg2', b.wallet_strip_bg2,
    'stampLayout', coalesce(b.wallet_stamp_layout, 'grid'),
    'stripScrim', coalesce(b.wallet_strip_scrim, 34),
    'stampSize', coalesce(b.wallet_stamp_size, 100),
    'bgColor', b.wallet_bg_color,
    'nearbyText', b.wallet_nearby_text,
    'iconStyle', coalesce(b.loyalty_icon_style, 'generic'),
    'customStampUrl', case when b.loyalty_icon_style = 'custom'
                           then b.loyalty_custom_icon_url else null end,
    'emptyStampUrl', case when b.loyalty_icon_style = 'custom'
                           then b.wallet_stamp_empty_url else null end,
    'tier', case
      when v_spend >= 10000 then 'Platinum'
      when v_spend >= 5000  then 'Gold'
      when v_spend >= 1000  then 'Silver'
      else 'Bronze' end,
    'customerSince', c.created_at,
    'totalSaved', v_saved,
    'storeSlug', b.online_menu_slug,
    'whatsapp', b.online_contact_whatsapp,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('latitude', br.lat, 'longitude', br.lng))
      from branches br
      where br.business_id = b.id and br.lat is not null and br.lng is not null
    ), '[]'::jsonb)
  ) into v_out
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
  return v_out;
end;
$wallet$;

revoke all on function get_wallet_pass_data(uuid) from public, anon;
