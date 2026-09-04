-- Editable/hideable storefront taglines. Null/empty means hidden — the
-- storefront JS checks for a non-empty string before rendering either.
alter table businesses add column if not exists online_tagline_header text;
alter table businesses add column if not exists online_tagline_hero text;
grant select (online_tagline_header, online_tagline_hero) on businesses to anon;

-- One level of category nesting for the online storefront only. POS/product
-- editor code never reads this column, so cashier-side category tabs are
-- completely unaffected — this is purely a display-grouping hint consumed
-- by rakeen-order.js. ON DELETE SET NULL: deleting a parent category just
-- promotes its former children back to top-level, never orphans them.
-- No anon grant needed: menu_categories already carries a table-level anon
-- SELECT grant (verified via information_schema before writing this — unlike
-- businesses, which is column-restricted), so a new column is automatically
-- covered; verify this assumption with a live anon-client query before relying on it.
alter table menu_categories add column if not exists online_parent_category_id bigint references menu_categories(id) on delete set null;
create index if not exists idx_menu_categories_parent on menu_categories(online_parent_category_id);
