-- 'duration' is a real user-entered field ("وصف المدة المتبقية" in the stock item
-- modal), not a computed/stale narrative as first assumed — restoring it.
alter table stock_items add column duration text;
