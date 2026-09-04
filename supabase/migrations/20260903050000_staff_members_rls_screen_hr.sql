-- The old "screen:staff" permission (a read-only sales-leaderboard screen)
-- is retired — its content moved into the "نظرة عامة" tab of the unified
-- screen:hr screen (public/dashboard/rakeen-dashboard.js), which is also now
-- where cashier names (staff_members) get created/edited via the Employees
-- tab's "تفعيل الكاشير" toggle. Employees granted only screen:hr (not the
-- retired screen:staff) need write access to staff_members for that toggle
-- to work, so these policies move from screen:staff to screen:hr.
drop policy if exists staff_members_select on staff_members;
create policy staff_members_select on staff_members for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:hr')));

drop policy if exists staff_members_write on staff_members;
create policy staff_members_write on staff_members for insert with check (business_id = current_business_id() and has_permission('screen:hr'));

drop policy if exists staff_members_update on staff_members;
create policy staff_members_update on staff_members for update
  using (business_id = current_business_id() and has_permission('screen:hr')) with check (business_id = current_business_id() and has_permission('screen:hr'));

drop policy if exists staff_members_delete on staff_members;
create policy staff_members_delete on staff_members for delete using (business_id = current_business_id() and has_permission('screen:hr'));
