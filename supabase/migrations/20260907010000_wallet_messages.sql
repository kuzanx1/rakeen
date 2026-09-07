-- رسائل البطاقة: أربعة أنواع، وآليةٌ واحدة.
--
-- آبل لا تسمح برسالةٍ ترويجية تُرسل إلى البطاقة. الذي تسمح به أن
-- تتغيّر قيمةُ حقلٍ عليها، فتعرض نصّه على الشاشة المقفلة (changeMessage).
-- فالأنواع الأربعة -- عمليات، تسويق، جودة، ترجيع -- ليست أربعة أنظمة:
-- هي حقلٌ واحد تُكتب فيه نصوصٌ مختلفة بمُطلِقاتٍ مختلفة.
--
-- والحقل يظهر حين يُكتب ويختفي حين يُمحى، فلا يشغل مكاناً على بطاقةٍ
-- أربعةُ حقولها محسوبة.

alter table businesses
  add column if not exists wallet_msg_quality_on boolean not null default false,
  add column if not exists wallet_msg_quality_text text not null default 'رأيك يفرق — كيف كانت زيارتك؟',
  add column if not exists wallet_msg_quality_hours int not null default 3
    check (wallet_msg_quality_hours between 1 and 72);

alter table customers
  add column if not exists wallet_message text,
  add column if not exists wallet_message_at timestamptz,
  add column if not exists wallet_quality_asked_at timestamptz;

-- الرسالة تُكتب ويُحرَّك معها ختمُ التحديث في جملةٍ واحدة.
--
-- ولو فُصلا لأمكن أن تُكتب رسالةٌ لا يُوقَظ لها أحد -- فتنتظر على
-- البطاقة حتى يشتري صاحبها، وقد فات وقتُها.
create or replace function set_wallet_message(p_customer_ids bigint[], p_text text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  update customers
  set wallet_message = nullif(btrim(coalesce(p_text, '')), ''),
      wallet_message_at = case when nullif(btrim(coalesce(p_text, '')), '') is null then null else now() end,
      wallet_pass_updated_at = now()
  where id = any(p_customer_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function set_wallet_message(bigint[], text) from public, anon, authenticated;

-- بثُّ صاحب المطعم: على عملاء منشأته وحدهم، ومن أضاف بطاقته وحده.
--
-- ومن لم يضف البطاقة لا يُكتب له شيء: الرسالة لا تصله، وكتابتُها تعني
-- أنها تنتظره على بطاقةٍ لا يملكها فتظهر له قديمةً إن أضافها بعد شهر.
create or replace function wallet_broadcast_message(p_text text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_business_id bigint; v_count int;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return 0;
  end if;
  update customers c
  set wallet_message = nullif(btrim(coalesce(p_text, '')), ''),
      wallet_message_at = case when nullif(btrim(coalesce(p_text, '')), '') is null then null else now() end,
      wallet_pass_updated_at = now()
  where c.business_id = v_business_id
    and exists (select 1 from wallet_pass_registrations r where r.customer_id = c.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function wallet_broadcast_message(text) from public, anon;
grant execute on function wallet_broadcast_message(text) to authenticated;

-- من زار قبل ساعاتٍ ولم يُسأل عن رأيه بعد.
--
-- والنافذة لها طرفان: بعد المدّة المضبوطة، وقبل ضعفها. فمن مرّ عليه
-- يومان لا يُسأل عن زيارةٍ نسيها -- والسؤال المتأخّر أسوأ من لا سؤال.
create or replace function wallet_quality_targets()
returns table (customer_id bigint, msg text)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, b.wallet_msg_quality_text
  from customers c
  join businesses b on b.id = c.business_id
  where b.wallet_msg_quality_on = true
    and exists (select 1 from wallet_pass_registrations r where r.customer_id = c.id)
    and exists (
      select 1 from orders o
      where o.customer_id = c.id and o.status = 'completed'
        and o.created_at < now() - make_interval(hours => b.wallet_msg_quality_hours)
        and o.created_at > now() - make_interval(hours => b.wallet_msg_quality_hours * 2)
        and (c.wallet_quality_asked_at is null or c.wallet_quality_asked_at < o.created_at)
    )
  limit 500;
$$;
revoke all on function wallet_quality_targets() from public, anon, authenticated;

create or replace function wallet_quality_mark(p_customer_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update customers set wallet_quality_asked_at = now() where id = any(p_customer_ids);
$$;
revoke all on function wallet_quality_mark(bigint[]) from public, anon, authenticated;

-- ترجيع غير النشطين -- عبر المحفظة لا عبر إشعارات المتصفّح.
--
-- المنطق موجودٌ منذ زمن (get_win_back_targets) لكنه يشترط اشتراكاً في
-- push_subscriptions، وذاك نظامٌ لا يصل أحداً عملياً: Web Push على
-- iOS لا يعمل إلا لمن أضاف الصفحة إلى شاشته الرئيسية، ولا أحد يفعل.
-- فالشرط نفسه على تسجيل المحفظة، وهو موجودٌ عند كل من أضاف بطاقته.
create or replace function wallet_winback_targets()
returns table (customer_id bigint, msg text)
language sql
security definer
stable
set search_path = public
as $$
  select distinct c.id, b.win_back_message
  from customers c
  join businesses b on b.id = c.business_id
  join wallet_pass_registrations r on r.customer_id = c.id
  where b.notify_win_back = true
    and (c.last_win_back_sent_at is null
         or c.last_win_back_sent_at < now() - make_interval(days => b.win_back_inactive_days))
    and coalesce(
      (select max(o.created_at) from orders o where o.customer_id = c.id and o.status = 'completed'),
      c.created_at
    ) < now() - make_interval(days => b.win_back_inactive_days)
  limit 500;
$$;
revoke all on function wallet_winback_targets() from public, anon, authenticated;

create or replace function wallet_winback_mark(p_customer_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update customers set last_win_back_sent_at = now() where id = any(p_customer_ids);
$$;
revoke all on function wallet_winback_mark(bigint[]) from public, anon, authenticated;

-- وتُضاف الرسالة الحيّة إلى ما تقرأه البطاقة.
--
-- تُقرأ من صفّ الزبون لا من المنشأة: البثُّ يكتبها للجميع، والجودةُ
-- والترجيعُ يكتبانها لواحدٍ بعينه -- فموضعُها عنده.
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
    'walletMessage', c.wallet_message,
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
