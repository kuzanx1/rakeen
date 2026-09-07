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
    'stripMode', coalesce(b.wallet_strip_mode, 'behind'),
    'bgColor', b.wallet_bg_color,
    'nearbyText', b.wallet_nearby_text,
    'iconStyle', coalesce(b.loyalty_icon_style, 'generic'),
    'customStampUrl', case when b.loyalty_icon_style = 'custom'
                           then b.loyalty_custom_icon_url else null end,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('latitude', br.lat, 'longitude', br.lng))
      from branches br
      where br.business_id = b.id
        and br.lat is not null and br.lng is not null
    ), '[]'::jsonb)
  ) into v_out
  from customers c
  join businesses b on b.id = c.business_id
  where c.public_token = p_token;

  return v_out;
end;
$wallet$;

revoke all on function get_wallet_pass_data(uuid) from public, anon;
