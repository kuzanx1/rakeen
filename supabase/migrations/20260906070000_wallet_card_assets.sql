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
--
-- والختم كذلك: مطعمٌ يبيع برجر لا تعنيه أكوابٌ نرسمها له.

alter table businesses
  add column if not exists wallet_icon_url text,
  add column if not exists wallet_logo_url text,
  add column if not exists wallet_strip_url text,
  add column if not exists wallet_stamp_url text;

comment on column businesses.wallet_icon_url is
  'أيقونة البطاقة في الإشعارات وقائمة المحفظة. 116×116 على الأقل، مربّعة.';
comment on column businesses.wallet_logo_url is
  'شعار أعلى البطاقة. حتى 480×150، بخلفية شفافة.';
comment on column businesses.wallet_strip_url is
  'خلفية شريط الأختام. 750×246. حين تُترك، يُرسم الشريط تلقائياً بلون العلامة.';
comment on column businesses.wallet_stamp_url is
  'شكل الختم الواحد. مربّع صغير بخلفية شفافة. حين يُترك، يُرسم كوب.';

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
-- والناقص كان الإحداثيات وحدها.
alter table branches
  add column if not exists latitude double precision
  check (latitude is null or (latitude between -90 and 90)),
  add column if not exists longitude double precision
  check (longitude is null or (longitude between -180 and 180));

comment on column branches.latitude is
  'خط العرض. مع longitude يصير الفرع موقعاً في بطاقة المحفظة، فيُنبَّه من يقترب منه.';

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
create or replace function get_wallet_pass_data(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $wallet$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'customerId', c.id,
    'businessId', b.id,
    'customerName', coalesce(c.name, ''),
    'businessName', coalesce(b.name, 'ركين'),
    'systemType', b.loyalty_system_type,
    'points', c.loyalty_points,
    'visits', c.loyalty_visits,
    'units', c.loyalty_units,
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
    'bgColor', b.wallet_bg_color,
    'nearbyText', b.wallet_nearby_text,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('latitude', br.latitude, 'longitude', br.longitude))
      from branches br
      where br.business_id = b.id
        and br.latitude is not null and br.longitude is not null
    ), '[]'::jsonb)
  ) into v_out
  from customers c
  join businesses b on b.id = c.business_id
  where c.public_token = p_token;

  return v_out;
end;
$wallet$;

revoke all on function get_wallet_pass_data(uuid) from public, anon;
