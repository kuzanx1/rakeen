-- shifts.staff_member_id already records which human OPENED the drawer.
-- This adds the mirror for CLOSE: closed_by_staff_member_id. Both clients
-- (app first, then the PWA) now make the cashier pick a name at open and
-- confirm/switch a name at close -- the branch PIN is a shared account, so
-- these two columns are the only per-person trail on a shift.
--
-- Run as one block. Adding a nullable column with a FK is a metadata-only
-- change (no table rewrite, no scan of existing rows), but lock_timeout is
-- set anyway per house rule for any ALTER on a table the POS writes to live.

set lock_timeout = '3s';

alter table shifts
  add column if not exists closed_by_staff_member_id bigint references staff_members(id);

reset lock_timeout;

-- No backfill: historical shifts have no recorded closer and that is the
-- honest state. New closes fill it going forward.
