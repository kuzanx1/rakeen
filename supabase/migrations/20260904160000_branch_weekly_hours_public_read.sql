-- Let the storefront see a branch's per-weekday hours.
--
-- branch_weekly_hours shipped with a single SELECT policy scoped to
-- current_business_id(), which is null for an anonymous visitor. So the
-- overrides were readable by staff and invisible to the one audience that
-- most needs them: a customer deciding whether the branch is open right
-- now. A branch marked closed on Friday still took Friday orders.
--
-- Mirrors "public branches read for online ordering" exactly — same
-- condition, on the business that owns the row — so a branch's hours are
-- exactly as public as the branch itself, and no more. The table holds
-- opening times and a closed flag; there is nothing here that is not
-- already implied by the storefront showing the branch at all.
drop policy if exists "public branch weekly hours read" on branch_weekly_hours;
create policy "public branch weekly hours read" on branch_weekly_hours for select
  using (exists (
    select 1 from businesses b
    where b.id = branch_weekly_hours.business_id
      and b.online_ordering_enabled = true
  ));

-- Column-level grants: anon reads are granted per column on this project,
-- so the policy alone is not enough.
grant select (id, business_id, branch_id, weekday, opening_time, closing_time, is_closed)
  on branch_weekly_hours to anon;
