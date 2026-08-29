-- Lets the owner flag a staff member as dedicated to reservations/seating
-- (a real host-stand role at busier restaurants) — purely a label/sort hint
-- surfaced in the dashboard staff list and the /pos/host staff picker.
-- Doesn't gate access by itself: the /pos/host route is already scoped down
-- to seating/waitlist with no cart or payment, so a plain cashier can use
-- it too when they're covering the host stand.
alter table staff_members add column is_reservation_host boolean not null default false;
