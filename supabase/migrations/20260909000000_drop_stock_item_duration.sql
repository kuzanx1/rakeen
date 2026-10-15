-- The stock_items.duration field ("وصف المدة المتبقية" — a free-text "lasts ~2 days"
-- note) was removed from the dashboard UI entirely: nothing read it, it only wrote a
-- junk default ("يكفي فترة كافية") on every new item, and the computed % bar plus the
-- "استهلك اليوم X" line already cover what it was meant to show. Added in
-- 20260801155332_add_stock_item_duration.sql; dropping the now-unused column.
alter table stock_items drop column if exists duration;
