-- Orders, order items, shifts, the atomic checkout RPC, and RLS: new tables
-- for the POS, plus opening a read-only 'pos:register' pass on the existing
-- menu/inventory tables a cashier needs to render the POS and compute stock
-- decrements (write access to those tables stays screen:menu/screen:inventory
-- only — cashiers never write stock_items/menu_items directly, only through
-- the security-definer RPC below).

create table shifts (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  cashier_id uuid not null references profiles(id),
  opening_cash numeric not null default 0,
  closing_cash numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index shifts_business_id_idx on shifts(business_id);

create table orders (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  shift_id bigint references shifts(id),
  cashier_id uuid not null references profiles(id),
  customer_name text,
  customer_phone text,
  subtotal numeric not null,
  discount_pct numeric not null default 0,
  discount_amount numeric not null default 0,
  vat_amount numeric not null,
  total numeric not null,
  payment_method text not null check (payment_method in ('cash','card','split')),
  cash_amount numeric,
  status text not null default 'completed' check (status in ('completed','cancelled','refunded')),
  client_order_uuid uuid not null unique,
  created_at timestamptz not null default now()
);
create index orders_business_id_idx on orders(business_id);
create index orders_branch_id_idx on orders(branch_id);

create table order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  menu_item_id bigint not null references menu_items(id),
  qty numeric not null,
  unit_price numeric not null,
  modifiers_total numeric not null default 0,
  line_total numeric not null,
  note text,
  selected_modifiers jsonb
);
create index order_items_order_id_idx on order_items(order_id);

-- Atomic checkout: inserts the order + line items and applies every stock
-- delta in one transaction. stock_decrements are computed client-side
-- (recipe qty x line qty, unit-converted; box-mode uses the customer's
-- actual picks; stock-linked modifier extras) reusing the same logic the
-- dashboard already hydrates for computeVariableCost() — this function's
-- job is only to apply pre-computed deltas atomically, not re-derive
-- recipe/box logic in SQL a second time. client_order_uuid makes replaying
-- an already-synced offline order a safe no-op.
create or replace function complete_pos_order(
  p_client_order_uuid uuid,
  p_branch_id bigint,
  p_shift_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_discount_amount numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_amount numeric,
  p_items jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_business_id bigint := current_business_id();
  item jsonb;
  dec jsonb;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
    p_subtotal, p_discount_pct, p_discount_amount, p_vat_amount, p_total, p_payment_method, p_cash_amount, p_client_order_uuid)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, menu_item_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers)
    values (
      v_order_id, (item->>'menu_item_id')::bigint, (item->>'qty')::numeric, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers'
    );

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint;
    end loop;
  end loop;

  return v_order_id;
end;
$$;

-- ===== RLS: branches =====
alter table branches enable row level security;
create policy branches_select on branches for select
  using (business_id = current_business_id());
create policy branches_manage on branches for insert with check (
  business_id = current_business_id()
  and exists (select 1 from profiles where id = auth.uid() and user_type = 'owner')
);

-- ===== RLS: shifts / orders / order_items =====
alter table shifts enable row level security;
create policy shifts_select on shifts for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:staff')));
create policy shifts_cashier_manage on shifts for all
  using (business_id = current_business_id() and has_permission('pos:register') and cashier_id = auth.uid())
  with check (business_id = current_business_id() and has_permission('pos:register') and cashier_id = auth.uid());

alter table orders enable row level security;
create policy orders_select on orders for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:orders')));
-- inserts only ever happen through complete_pos_order() (security definer,
-- bypasses this) — no direct insert policy, so a compromised anon key can't
-- fabricate an order/stock-decrement outside that one audited path.

alter table order_items enable row level security;
create policy order_items_select on order_items for select
  using (exists (
    select 1 from orders o where o.id = order_items.order_id
    and o.business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:orders'))
  ));

-- ===== Open a read-only 'pos:register' pass on the tables the POS needs =====
drop policy stock_items_select on stock_items;
create policy stock_items_select on stock_items for select
  using (business_id = current_business_id() and (has_permission('screen:inventory') or has_permission('pos:register')));

drop policy menu_categories_all on menu_categories;
create policy menu_categories_select on menu_categories for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy menu_categories_write on menu_categories for insert with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy menu_categories_update on menu_categories for update
  using (business_id = current_business_id() and has_permission('screen:menu')) with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy menu_categories_delete on menu_categories for delete using (business_id = current_business_id() and has_permission('screen:menu'));

drop policy menu_items_all on menu_items;
create policy menu_items_select on menu_items for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy menu_items_write on menu_items for insert with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy menu_items_update on menu_items for update
  using (business_id = current_business_id() and has_permission('screen:menu')) with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy menu_items_delete on menu_items for delete using (business_id = current_business_id() and has_permission('screen:menu'));

drop policy menu_item_recipe_lines_all on menu_item_recipe_lines;
create policy menu_item_recipe_lines_select on menu_item_recipe_lines for select
  using (exists (select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id and m.business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register'))));
create policy menu_item_recipe_lines_write on menu_item_recipe_lines for insert with check (exists (select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_recipe_lines_update on menu_item_recipe_lines for update
  using (exists (select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')))
  with check (exists (select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_recipe_lines_delete on menu_item_recipe_lines for delete using (exists (select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));

drop policy menu_item_box_eligible_items_all on menu_item_box_eligible_items;
create policy menu_item_box_eligible_items_select on menu_item_box_eligible_items for select
  using (exists (select 1 from menu_items m where m.id = menu_item_box_eligible_items.menu_item_id and m.business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register'))));
create policy menu_item_box_eligible_items_write on menu_item_box_eligible_items for insert with check (exists (select 1 from menu_items m where m.id = menu_item_box_eligible_items.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_box_eligible_items_delete on menu_item_box_eligible_items for delete using (exists (select 1 from menu_items m where m.id = menu_item_box_eligible_items.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));

drop policy menu_item_box_default_mix_all on menu_item_box_default_mix;
create policy menu_item_box_default_mix_select on menu_item_box_default_mix for select
  using (exists (select 1 from menu_items m where m.id = menu_item_box_default_mix.menu_item_id and m.business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register'))));
create policy menu_item_box_default_mix_write on menu_item_box_default_mix for insert with check (exists (select 1 from menu_items m where m.id = menu_item_box_default_mix.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_box_default_mix_delete on menu_item_box_default_mix for delete using (exists (select 1 from menu_items m where m.id = menu_item_box_default_mix.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));

drop policy modifier_groups_all on modifier_groups;
create policy modifier_groups_select on modifier_groups for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy modifier_groups_write on modifier_groups for insert with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy modifier_groups_update on modifier_groups for update
  using (business_id = current_business_id() and has_permission('screen:menu')) with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy modifier_groups_delete on modifier_groups for delete using (business_id = current_business_id() and has_permission('screen:menu'));

drop policy modifier_options_all on modifier_options;
create policy modifier_options_select on modifier_options for select
  using (exists (select 1 from modifier_groups g where g.id = modifier_options.group_id and g.business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register'))));
create policy modifier_options_write on modifier_options for insert with check (exists (select 1 from modifier_groups g where g.id = modifier_options.group_id and g.business_id = current_business_id() and has_permission('screen:menu')));
create policy modifier_options_delete on modifier_options for delete using (exists (select 1 from modifier_groups g where g.id = modifier_options.group_id and g.business_id = current_business_id() and has_permission('screen:menu')));

drop policy menu_item_modifier_groups_all on menu_item_modifier_groups;
create policy menu_item_modifier_groups_select on menu_item_modifier_groups for select
  using (exists (select 1 from menu_items m where m.id = menu_item_modifier_groups.menu_item_id and m.business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register'))));
create policy menu_item_modifier_groups_write on menu_item_modifier_groups for insert with check (exists (select 1 from menu_items m where m.id = menu_item_modifier_groups.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_modifier_groups_delete on menu_item_modifier_groups for delete using (exists (select 1 from menu_items m where m.id = menu_item_modifier_groups.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
