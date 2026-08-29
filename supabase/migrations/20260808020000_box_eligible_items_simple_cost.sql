-- Box eligible-items currently require a real stock_item (NOT NULL FK) —
-- there was no way to add a "choice" to a build-your-own box without first
-- setting up full inventory tracking for it. Brings this table to parity
-- with modifier_options, which already supports both 'stock' (decrements
-- real inventory) and 'simple' (flat, manually-entered cost, no inventory
-- required) modes.
alter table menu_item_box_eligible_items drop constraint menu_item_box_eligible_items_pkey;
alter table menu_item_box_eligible_items add column id bigint generated always as identity;
alter table menu_item_box_eligible_items add column name text;
alter table menu_item_box_eligible_items add column cost_mode text not null default 'stock' check (cost_mode in ('stock', 'simple'));
alter table menu_item_box_eligible_items add column extra_cost numeric not null default 0;
alter table menu_item_box_eligible_items alter column stock_item_id drop not null;
alter table menu_item_box_eligible_items add constraint box_eligible_item_shape check (
  (cost_mode = 'stock' and stock_item_id is not null) or
  (cost_mode = 'simple' and name is not null)
);
alter table menu_item_box_eligible_items add primary key (id);
-- Keep the old table's real guarantee (a given stock item can only appear
-- once per box) without requiring it double as the primary key anymore.
create unique index menu_item_box_eligible_items_stock_uidx
  on menu_item_box_eligible_items(menu_item_id, stock_item_id) where stock_item_id is not null;
