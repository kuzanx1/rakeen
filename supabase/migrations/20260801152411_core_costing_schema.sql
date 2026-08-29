-- Core costing engine: stock, menu (three cost modes), modifiers, fixed costs,
-- purchase invoices (with an atomic stock-increment trigger), general expenses.

create table stock_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  category text not null check (category in ('raw','packaging')),
  unit text not null check (unit in ('kg','g','liter','piece')),
  qty_on_hand numeric not null default 0,
  par_level numeric not null default 0,
  unit_cost numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stock_items_business_id_idx on stock_items(business_id);

create table menu_categories (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  sort_order int not null default 0
);
create index menu_categories_business_id_idx on menu_categories(business_id);

create table menu_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  category_id bigint references menu_categories(id),
  name text not null,
  price numeric not null,
  active boolean not null default true,
  cost_mode text not null check (cost_mode in ('direct','recipe','box')),
  direct_cost numeric not null default 0,
  link_inventory boolean not null default false,
  link_profit boolean not null default false,
  total_pieces int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_business_id_idx on menu_items(business_id);

create table menu_item_recipe_lines (
  id bigint generated always as identity primary key,
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  stock_item_id bigint not null references stock_items(id),
  qty numeric not null,
  unit text not null check (unit in ('kg','g','liter','piece'))
);
create index menu_item_recipe_lines_menu_item_id_idx on menu_item_recipe_lines(menu_item_id);

create table menu_item_box_eligible_items (
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  stock_item_id bigint not null references stock_items(id),
  primary key (menu_item_id, stock_item_id)
);

create table menu_item_box_default_mix (
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  stock_item_id bigint not null references stock_items(id),
  qty numeric not null,
  primary key (menu_item_id, stock_item_id)
);

create table modifier_groups (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  type text not null check (type in ('single','multiple','quantity')),
  max_select int not null default 1
);
create index modifier_groups_business_id_idx on modifier_groups(business_id);

create table modifier_options (
  id bigint generated always as identity primary key,
  group_id bigint not null references modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric not null default 0,
  cost_mode text not null check (cost_mode in ('simple','stock')),
  extra_cost numeric,
  stock_item_id bigint references stock_items(id),
  stock_qty numeric,
  stock_unit text check (stock_unit in ('kg','g','liter','piece')),
  option_max int,
  constraint modifier_option_cost_shape check (
    (cost_mode = 'simple') or (cost_mode = 'stock' and stock_item_id is not null and stock_qty is not null and stock_unit is not null)
  )
);
create index modifier_options_group_id_idx on modifier_options(group_id);

create table menu_item_modifier_groups (
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  modifier_group_id bigint not null references modifier_groups(id) on delete cascade,
  primary key (menu_item_id, modifier_group_id)
);

create table fixed_costs (
  business_id bigint primary key references businesses(id),
  rent numeric not null default 0,
  salaries numeric not null default 0,
  utilities numeric not null default 0,
  other numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table suppliers (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  unique (business_id, name)
);
create index suppliers_business_id_idx on suppliers(business_id);

create table purchase_invoices (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  stock_item_id bigint not null references stock_items(id),
  supplier_id bigint not null references suppliers(id),
  qty numeric not null check (qty > 0),
  unit text not null check (unit in ('kg','g','liter','piece')),
  total_cost numeric not null check (total_cost > 0),
  invoiced_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);
create index purchase_invoices_business_id_idx on purchase_invoices(business_id);

-- The invoice log and real stock on hand must never drift apart, so the
-- increment happens atomically as part of the same transaction as the insert,
-- at the database layer, instead of two separate application-level writes.
create or replace function bump_stock_on_purchase_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update stock_items
  set qty_on_hand = qty_on_hand + new.qty,
      updated_at = now()
  where id = new.stock_item_id;
  return new;
end;
$$;

create trigger purchase_invoice_bumps_stock
  after insert on purchase_invoices
  for each row execute function bump_stock_on_purchase_invoice();

create table expense_categories (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  unique (business_id, name)
);
create index expense_categories_business_id_idx on expense_categories(business_id);

create table general_expenses (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  category_id bigint references expense_categories(id),
  amount numeric not null check (amount > 0),
  description text,
  spent_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);
create index general_expenses_business_id_idx on general_expenses(business_id);
