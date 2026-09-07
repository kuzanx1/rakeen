-- نصوص البطاقة بيد صاحبها.
--
-- كانت تسميات الحقول مترجمةً بمفاتيح: "زياراتك" للعربي و"Visits"
-- للإنجليزي، تختارها المحفظة بلغة الجهاز. وهذا صحيحٌ افتراضاً وخطأٌ
-- إلزاماً: مقهىً يسمّي زياراته "كوباتك"، ونادٍ يسمّي مستواه "رتبتك"،
-- ومطعمٌ لا يريد أن يُدعى زبونُه "العميل".
--
-- فمن كتب تسميته أخذها كما كتبها -- وخسر ترجمتها، وهو يعرف ما يخسر:
-- كتبها بلغته لأنه يعرف بأي لغةٍ يخاطب زبائنه.
--
-- وjsonb لا عمودٌ لكل تسمية: تسعُ تسمياتٍ وثلاثُ رايات تعني اثني عشر
-- عموداً، وكلُّها نصوصٌ اختيارية بلا قيدٍ يخصّ واحدةً دون أخرى.
alter table businesses
  add column if not exists wallet_labels jsonb not null default '{}'::jsonb;

comment on column businesses.wallet_labels is
  'تسميات حقول البطاقة ورايات إظهارها. المفاتيح: progress/left/ready/customer/reward/tier/saved/since/how/howText، وhideTier/hideSaved/hideSince.';

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
    'labels', coalesce(b.wallet_labels, '{}'::jsonb),
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
