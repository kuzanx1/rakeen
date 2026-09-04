-- Manual product ordering within a category (dashboard "up/down" arrows).
-- Backfilled from id, which already reflects creation order — every existing
-- business keeps its current on-screen order unchanged the moment this ships.
alter table menu_items add column if not exists sort_order integer;
update menu_items set sort_order = id where sort_order is null;
