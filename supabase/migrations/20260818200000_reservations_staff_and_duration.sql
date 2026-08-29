-- Salon MVP (see approved plan): appointments need a staff member, a
-- service, and an explicit duration — none of which a restaurant
-- reservation needed (duration lived only in the business-level
-- tables_turn_time_minutes setting). All columns nullable and purely
-- additive: existing restaurant reservation rows are unaffected.
alter table table_reservations add column staff_member_id bigint references staff_members(id);
alter table table_reservations add column service_id bigint references services(id);
-- Snapshotted from services.duration_minutes at booking time — same
-- principle as order_items.unit_price snapshotting menu price, so a later
-- edit to a service's default duration doesn't retroactively shift an
-- already-booked appointment's end time.
alter table table_reservations add column duration_minutes int;
-- Not a generated column: Postgres rejects `timestamptz + interval` as a
-- generation expression (not immutable — timezone-dependent in the general
-- case, even though this usage is minutes-only). Set explicitly by the
-- client alongside reserved_for/duration_minutes instead. Feeds the
-- existing, already owner-toggleable tables_reservation_conflict_warning_enabled
-- setting via a plain range comparison in application queries.
alter table table_reservations add column reserved_until timestamptz;
