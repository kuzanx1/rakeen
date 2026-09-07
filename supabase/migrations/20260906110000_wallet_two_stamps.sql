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
    'bgColor', b.wallet_bg_color,
    'nearbyText', b.wallet_nearby_text,
    'iconStyle', coalesce(b.loyalty_icon_style, 'generic'),
    'customStampUrl', case when b.loyalty_icon_style = 'custom'
                           then b.loyalty_custom_icon_url else null end,
    'emptyStampUrl', case when b.loyalty_icon_style = 'custom'
                           then b.wallet_stamp_empty_url else null end,
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
