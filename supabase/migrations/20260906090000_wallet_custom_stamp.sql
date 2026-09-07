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
    'iconStyle', coalesce(b.loyalty_icon_style, 'generic'),
    -- تُرسل حين تُختار وحدها: صورةٌ مرفوعةٌ ثم عُدل عنها إلى شكلٍ
    -- مرسوم ينبغي أن تُنسى، لا أن تبقى تُجلب في كل بناء.
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
