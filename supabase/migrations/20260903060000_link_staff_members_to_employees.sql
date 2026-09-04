-- Unifies the three previously-separate "who works here" surfaces (POS
-- cashier name labels in Settings -> POS, the read-only "الموظفين" sales
-- leaderboard, and the new HR "employees" record from
-- 20260903030000_hr_employees_departments_compliance.sql) into one screen.
-- `staff_members` keeps its exact existing shape and behavior (orders/shifts
-- still reference it, nothing about POS checkout changes) — this just adds
-- an optional link so a cashier name label can point at a real employee
-- record. `on delete set null` (not cascade): deleting an employee must
-- never delete real order-attribution history, it only detaches the link,
-- leaving the cashier name as a plain legacy label again.
alter table staff_members add column employee_id bigint references employees(id) on delete set null;
create index staff_members_employee_id_idx on staff_members(employee_id);
