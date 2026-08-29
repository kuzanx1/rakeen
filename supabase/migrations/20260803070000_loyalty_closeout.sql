-- Final closeout batch for the loyalty card system:
-- 1) customer tenure + real "value saved via points" on the card
-- 2) 4 new business-type icons + a custom-uploaded icon option
-- 3) card themes (owner picks a visual layout, not just colors)
-- 4) automatic win-back push settings (inactive-customer re-engagement)

-- ---------- 1) tenure + saved value ----------
-- "saved" = the current menu price of everything this customer has ever
-- redeemed with points (unit_price on a redeemed order_item is stored as 0,
-- since that's what the customer actually paid — the real "value" has to
-- come from the item's price, not the transaction amount).
drop function if exists get_loyalty_card(uuid);

create function get_loyalty_card(p_token uuid)
returns table(
  customer_name text, loyalty_points numeric, business_name text,
  logo_url text, banner_url text, accent_color text,
  loyalty_system_type text, loyalty_visits int, loyalty_visits_threshold int,
  loyalty_reward_label text, loyalty_icon_style text, loyalty_free_rewards int,
  loyalty_pattern_style text, loyalty_tier text, loyalty_theme text,
  loyalty_custom_icon_url text, customer_since timestamptz, total_saved numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_spend numeric;
  v_saved numeric;
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

-- ---------- 2) icons ----------
alter table businesses drop constraint if exists businesses_loyalty_icon_style_check;
alter table businesses add constraint businesses_loyalty_icon_style_check
  check (loyalty_icon_style in ('generic','coffee','burger','pizza','pastry','dessert','car','pet','salon','gym','retail','padel','sports','spa','clinic','custom'));

alter table businesses add column if not exists loyalty_custom_icon_url text;

-- ---------- 3) themes ----------
alter table businesses add column if not exists loyalty_theme text not null default 'classic'
  check (loyalty_theme in ('classic','minimal','bold'));

-- ---------- 4) win-back automation ----------
alter table businesses add column if not exists notify_win_back boolean not null default false;
alter table businesses add column if not exists win_back_inactive_days int not null default 30 check (win_back_inactive_days > 0);
alter table businesses add column if not exists win_back_message text not null default 'مشتقنالك! زورنا قريب — عندنا شي يسعدك 🎁';
alter table customers add column if not exists last_win_back_sent_at timestamptz;
