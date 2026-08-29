-- Bug fix: the public_booking migration granted anon a column-scoped SELECT
-- on businesses(online_booking_enabled, business_type) but never added a
-- row-level RLS policy permitting anon to see the row at all. The existing
-- anon policy on businesses ("public business branding read for online
-- ordering") is gated on online_ordering_enabled = true, which a
-- booking-only business (salon/car_wash/etc, online_ordering_enabled left
-- false) never satisfies. That silently broke two things: (1) anon reading
-- businesses directly, and (2) the EXISTS (select 1 from businesses ...)
-- subqueries inside services_public_read / service_staff_public_read /
-- staff_members_public_read, since RLS is enforced on businesses even
-- inside those subqueries — so every service on a booking-enabled business
-- was invisible to anon. Caught via live anon-client verification.
create policy "public business branding read for online booking" on businesses for select
  using (online_booking_enabled = true);
