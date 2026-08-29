-- Lets a stock item remember every brand/vendor-specific text seen for it
-- ("دجاج ساديا", "دجاج المراعي 1 كيلو") so the invoice-scan matcher recognizes
-- it instantly next time instead of asking the owner to decide again on every
-- purchase of the same product from the same brand. No new table — a plain
-- array column is enough for "does this exact text map to an item" lookups.
alter table stock_items add column alias_names text[] not null default '{}';
create index stock_items_alias_names_idx on stock_items using gin(alias_names);
