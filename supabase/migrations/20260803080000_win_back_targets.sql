-- Feeds the win-back cron (app/api/cron/win-back/route.ts): every customer
-- who (a) belongs to a business with notify_win_back enabled, (b) has a real
-- push subscription to actually reach, (c) hasn't ordered in at least the
-- business's configured win_back_inactive_days, and (d) hasn't already been
-- win-back'd within that same window (so this fires roughly once per
-- inactivity cycle, not every single day the cron runs).
create or replace function get_win_back_targets()
returns table(
  customer_id bigint, customer_name text, business_id bigint,
  business_name text, win_back_message text
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct c.id, c.name, b.id, b.name, b.win_back_message
  from customers c
  join businesses b on b.id = c.business_id
  join push_subscriptions ps on ps.customer_id = c.id
  where b.notify_win_back = true
    and (c.last_win_back_sent_at is null or c.last_win_back_sent_at < now() - make_interval(days => b.win_back_inactive_days))
    and coalesce(
      (select max(o.created_at) from orders o where o.customer_id = c.id and o.status = 'completed'),
      c.created_at
    ) < now() - make_interval(days => b.win_back_inactive_days);
$$;
