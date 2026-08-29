-- The booking page groups services by category (mirrors how the online
-- menu groups menu_items) — needs anon read on menu_categories, but the
-- existing anon policy on menu_categories ("public categories read for
-- online ordering") is gated on online_ordering_enabled, which a
-- booking-only business never sets. Same shape as the businesses RLS gap
-- fixed in 20260819010000, just for menu_categories.
create policy "public categories read for online booking" on menu_categories for select
  using (exists (select 1 from businesses b where b.id = menu_categories.business_id and b.online_booking_enabled = true));
