-- Loyalty card design controls: banner overlay opacity, stamp icon size, and
-- an optional tagline under the business name. All additive/nullable-or-
-- defaulted so every existing card keeps rendering exactly as before.
alter table businesses add column loyalty_banner_overlay smallint not null default 80 check (loyalty_banner_overlay between 0 and 100);
alter table businesses add column loyalty_icon_size smallint not null default 30 check (loyalty_icon_size between 16 and 60);
alter table businesses add column loyalty_tagline text;

drop function if exists get_loyalty_card(uuid);
create or replace function public.get_loyalty_card(p_token uuid)
 returns table(customer_name text, loyalty_points numeric, business_name text, logo_url text, banner_url text, accent_color text, loyalty_system_type text, loyalty_visits integer, loyalty_visits_threshold integer, loyalty_reward_label text, loyalty_icon_style text, loyalty_free_rewards integer, loyalty_pattern_style text, loyalty_tier text, loyalty_theme text, loyalty_custom_icon_url text, customer_since timestamp with time zone, total_saved numeric, loyalty_banner_overlay smallint, loyalty_icon_size smallint, loyalty_tagline text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_spend numeric;
  v_saved numeric;
begin
  if not check_rate_limit('loyalty_card_ip:' || client_ip(), 60, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  if not check_rate_limit('loyalty_card_token:' || p_token, 30, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  select coalesce(sum(o.total), 0) into v_spend
  from orders o join customers c on c.id = o.customer_id
  where c.public_token = p_token and o.status = 'completed';

  select coalesce(sum(mi.price * oi.qty), 0) into v_saved
  from order_items oi
  join orders o on o.id = oi.order_id
  join customers c on c.id = o.customer_id
  join menu_items mi on mi.id = oi.menu_item_id
  where c.public_token = p_token and oi.is_points_redemption = true;

  return query
  select c.name, c.loyalty_points, b.name, b.loyalty_logo_url, b.loyalty_banner_url, b.loyalty_accent_color,
    b.loyalty_system_type, c.loyalty_visits, b.loyalty_visits_threshold, b.loyalty_reward_label, b.loyalty_icon_style, c.loyalty_free_rewards,
    b.loyalty_pattern_style,
    case
      when v_spend >= 10000 then 'Platinum'
      when v_spend >= 5000 then 'Gold'
      when v_spend >= 1000 then 'Silver'
      else 'Bronze'
    end,
    b.loyalty_theme, b.loyalty_custom_icon_url, c.created_at, v_saved,
    b.loyalty_banner_overlay, b.loyalty_icon_size, b.loyalty_tagline
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
end;
$function$
