-- At most one open shift per branch.
--
-- Nothing enforced this. findOpenShift() looks for an open row and opens a
-- new one when it finds none, so two devices checking at the same moment
-- both find none and both insert. The branch then has two open shifts, the
-- day's sales split between them by accident of which till rang them up,
-- and each closing count is measured against a float that only covers part
-- of the drawer -- while the drawer itself is one physical box.
--
-- A partial unique index is the right shape here: it constrains only rows
-- where closed_at is null, so a branch accumulates as many CLOSED shifts as
-- it likes while never having two open at once. Postgres enforces it at
-- the point of insert, which is the only place a race like this can be
-- settled correctly.
--
-- Scoped to branch_id, not cashier_id, because that matches what a shift
-- actually is here: the branch PIN is a shared account and the drawer
-- belongs to the till, not to a person. Which human is on it is recorded
-- separately in shifts.staff_member_id.
--
-- NOTE: if a branch already has more than one open shift when this runs,
-- the index creation FAILS. That is deliberate -- silently closing one
-- would discard a real, uncounted drawer. Close them from the app first,
-- or inspect them with:
--   select branch_id, count(*) from shifts where closed_at is null
--     group by branch_id having count(*) > 1;
create unique index if not exists shifts_one_open_per_branch
  on shifts (branch_id)
  where closed_at is null;
