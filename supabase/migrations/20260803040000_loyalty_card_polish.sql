-- Decorative pattern presets (owner picks one for the visits-mode middle
-- band, no upload needed) + real tier badge on the card (reuses the exact
-- Bronze/Silver/Gold/Platinum boundaries already shown in the dashboard's
-- "مستويات العضوية" panel — same numbers, now also on the customer's own card).
alter table businesses add column loyalty_pattern_style text not null default 'none'
  check (loyalty_pattern_style in ('none','dots','diagonal','waves'));

drop function if exists get_loyalty_card(uuid);

create function get_loyalty_card(p_token uuid)
returns table(
  customer_name text, loyalty_points numeric, business_name text,
  logo_url text, banner_url text, accent_color text,
  loyalty_system_type text, loyalty_visits int, loyalty_visits_threshold int,
  loyalty_reward_label text, loyalty_icon_style text, loyalty_free_rewards int,
  loyalty_pattern_style text, loyalty_tier text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_spend numeric;
begin
  select coalesce(sum(o.total), 0) into v_spend
  from orders o join customers c on c.id = o.customer_id
  where c.public_token = p_token and o.status = 'completed';

  return query
  select c.name, c.loyalty_points, b.name, b.loyalty_logo_url, b.loyalty_banner_url, b.loyalty_accent_color,
    b.loyalty_system_type, c.loyalty_visits, b.loyalty_visits_threshold, b.loyalty_reward_label, b.loyalty_icon_style, c.loyalty_free_rewards,
    b.loyalty_pattern_style,
    case
      when v_spend >= 10000 then 'Platinum'
      when v_spend >= 5000 then 'Gold'
      when v_spend >= 1000 then 'Silver'
      else 'Bronze'
    end
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
end;
$$;
