-- Owner-reported: the loyalty tier ladder (Bronze/Silver/Gold/Platinum,
-- each with a fixed spend threshold and discount %) was a hardcoded
-- constant in three independent places (public/dashboard/rakeen-dashboard.js
-- LOYALTY_TIERS, this file's old get_loyalty_card() CASE block, and
-- app/loyalty-card/[token]/page.tsx TIER_META) -- a restaurant that wants
-- different thresholds/discounts, or none at all, had no way to change
-- them. Tier NAMES stay fixed (Bronze/Silver/Gold/Platinum) in this pass --
-- only each tier's spend threshold and discount % become owner-editable --
-- so the public card page's TIER_META (keyed by those 4 exact names) needs
-- no change.
--
-- One JSONB column on businesses rather than a new table: this is a small,
-- single-owner list (always exactly 4 rows) with no anon-access needs of
-- its own (get_loyalty_card() is already SECURITY DEFINER and reads it
-- server-side), so a new table + RLS policies would be pure overhead. A
-- table default + backfill means every existing business keeps today's
-- exact numbers unless they explicitly change them -- zero behavior change
-- for anyone who never opens the new settings tab.
alter table businesses add column if not exists loyalty_tiers jsonb
  default '[{"name":"Bronze","min":0,"discount":5},{"name":"Silver","min":1000,"discount":10},{"name":"Gold","min":5000,"discount":15},{"name":"Platinum","min":10000,"discount":20}]'::jsonb;

update businesses set loyalty_tiers = '[{"name":"Bronze","min":0,"discount":5},{"name":"Silver","min":1000,"discount":10},{"name":"Gold","min":5000,"discount":15},{"name":"Platinum","min":10000,"discount":20}]'::jsonb
  where loyalty_tiers is null;

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
    coalesce(
      (select tier->>'name' from jsonb_array_elements(coalesce(b.loyalty_tiers, '[]'::jsonb)) as tier
       where (tier->>'min')::numeric <= v_spend
       order by (tier->>'min')::numeric desc
       limit 1),
      'Bronze'
    ),
    b.loyalty_theme, b.loyalty_custom_icon_url, c.created_at, v_saved
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
end;
$$;
