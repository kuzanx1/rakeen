-- Roadmap item 2 (retail/grocery barcode POS mode) — see the approved
-- roadmap. menu_items already supports cost_mode='direct' (a flat-price
-- item with no recipe/box breakdown), which is exactly a retail product —
-- the only missing piece is a barcode to scan at checkout instead of
-- tapping the grid. Nullable: only retail-type businesses will ever fill
-- this in, everyone else leaves it unset.
alter table menu_items add column barcode text;

-- Scoped per business (not globally unique) — two different restaurants/
-- shops legitimately might scan the same manufacturer barcode on a
-- wholesale item. Partial index (where not null) so the common case of
-- "no barcode set" never collides.
create unique index menu_items_business_barcode_idx on menu_items(business_id, barcode) where barcode is not null;
