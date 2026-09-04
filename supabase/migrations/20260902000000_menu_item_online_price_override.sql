-- Optional per-product price override for the online storefront — most
-- products should just charge the same price everywhere (the normal case),
-- so this is nullable and left empty by default; the storefront falls back
-- to the regular `price` column whenever it's null. Lets a merchant charge
-- differently online (e.g. absorbing a delivery/packaging cost) without
-- needing a second product row, matching the "one product, one row" model
-- the rest of the channel-visibility work already moved to.
alter table menu_items add column if not exists online_price numeric;
