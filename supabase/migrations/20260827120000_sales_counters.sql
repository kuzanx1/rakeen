-- Sales counter: "how many of this one product have sold since [a date I
-- pick]" — the owner names it, points it at a menu item, and sets a start
-- point (now, or any past/future date); resetting it is just moving that
-- start point forward, never deleting order history. The count itself is
-- never stored/incremented — it's derived live from order_items joined to
-- orders (same source of truth as every other report), so there's no risk
-- of it drifting from real sales the way a manually incremented counter
-- could (a refund, a cancelled order, a correction — all just fall out of
-- the same live query automatically).
create table sales_counters (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  name text not null,
  count_since timestamptz not null default now(),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index sales_counters_business_id_idx on sales_counters(business_id);

alter table sales_counters enable row level security;
create policy sales_counters_select on sales_counters for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('screen:accounting')));
create policy sales_counters_insert on sales_counters for insert
  with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy sales_counters_update on sales_counters for update
  using (business_id = current_business_id() and has_permission('screen:menu'))
  with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy sales_counters_delete on sales_counters for delete
  using (business_id = current_business_id() and has_permission('screen:menu'));
