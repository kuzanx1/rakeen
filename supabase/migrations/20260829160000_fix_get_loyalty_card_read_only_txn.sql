-- get_loyalty_card was marked STABLE, but it calls check_rate_limit() which
-- does a real INSERT/UPDATE/DELETE (rate_limit_hits bookkeeping). PostgREST
-- runs STABLE-declared RPCs in a read-only transaction, so every single call
-- to this function was failing in production with "cannot execute INSERT in
-- a read-only transaction" — the public loyalty card page has been fully
-- broken for every business with loyalty_enabled=true, including the one
-- real paying customer today.
--
-- The live function's actual return columns had already drifted from this
-- migration's signature (found live, 2026-09-03, while finally applying
-- this migration: `create or replace` refused with "cannot change return
-- type of existing function" / SQLSTATE 42P13). Postgres can't widen a
-- function's OUT-parameter row type in place -- drop and recreate is the
-- only way, same as any other return-type change.
drop function if exists get_loyalty_card(uuid);
create or replace function get_loyalty_card(p_token uuid)
returns table(customer_name text, loyalty_points numeric, business_name text, logo_url text, banner_url text, accent_color text, loyalty_system_type text, loyalty_visits integer, loyalty_visits_threshold integer, loyalty_reward_label text, loyalty_icon_style text, loyalty_free_rewards integer, loyalty_pattern_style text, loyalty_tier text, loyalty_theme text, loyalty_custom_icon_url text, customer_since timestamp with time zone, total_saved numeric)
language plpgsql
security definer
set search_path = public
as $$
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
    b.loyalty_theme, b.loyalty_custom_icon_url, c.created_at, v_saved
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
end;
$$;
