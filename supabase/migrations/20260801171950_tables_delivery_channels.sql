-- Dine-in table tracking, delivery-platform price lists, and order channel.
-- Delivery here means "the cashier tags this order as coming from platform X
-- and it prices using that platform's configured list" — not a real
-- third-party API integration (explicitly out of scope, would need real
-- developer partnerships with each platform).

create table restaurant_tables (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  number int not null,
  status text not null default 'available' check (status in ('available','occupied','reserved','cleaning')),
  active_order_id bigint,
  unique (branch_id, number)
);
create index restaurant_tables_business_id_idx on restaurant_tables(business_id);

create table delivery_platforms (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  active boolean not null default true,
  unique (business_id, name)
);
create index delivery_platforms_business_id_idx on delivery_platforms(business_id);

create table menu_item_platform_prices (
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  platform_id bigint not null references delivery_platforms(id) on delete cascade,
  price numeric not null check (price >= 0),
  primary key (menu_item_id, platform_id)
);

alter table orders add column channel text not null default 'dine_in' check (channel in ('dine_in','pickup','delivery'));
alter table orders add column delivery_platform_id bigint references delivery_platforms(id);
alter table orders add column table_id bigint references restaurant_tables(id);
alter table orders add constraint orders_delivery_platform_requires_channel
  check (delivery_platform_id is null or channel = 'delivery');

alter table restaurant_tables add constraint restaurant_tables_active_order_fk
  foreign key (active_order_id) references orders(id);

-- ===== RLS =====
alter table restaurant_tables enable row level security;
create policy restaurant_tables_all on restaurant_tables for all
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:operations')))
  with check (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:operations')));

alter table delivery_platforms enable row level security;
create policy delivery_platforms_select on delivery_platforms for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:menu')));
create policy delivery_platforms_write on delivery_platforms for insert with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy delivery_platforms_update on delivery_platforms for update
  using (business_id = current_business_id() and has_permission('screen:menu')) with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy delivery_platforms_delete on delivery_platforms for delete using (business_id = current_business_id() and has_permission('screen:menu'));

alter table menu_item_platform_prices enable row level security;
create policy menu_item_platform_prices_select on menu_item_platform_prices for select
  using (exists (select 1 from menu_items m where m.id = menu_item_platform_prices.menu_item_id and m.business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:menu'))));
create policy menu_item_platform_prices_write on menu_item_platform_prices for insert with check (exists (select 1 from menu_items m where m.id = menu_item_platform_prices.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_platform_prices_update on menu_item_platform_prices for update
  using (exists (select 1 from menu_items m where m.id = menu_item_platform_prices.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')))
  with check (exists (select 1 from menu_items m where m.id = menu_item_platform_prices.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
create policy menu_item_platform_prices_delete on menu_item_platform_prices for delete using (exists (select 1 from menu_items m where m.id = menu_item_platform_prices.menu_item_id and m.business_id = current_business_id() and has_permission('screen:menu')));
