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
