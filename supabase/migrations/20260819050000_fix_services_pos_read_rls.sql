-- Bug fix: services_all and service_staff_all bundled SELECT together with
-- INSERT/UPDATE/DELETE under a single has_permission('screen:menu') check —
-- but 'screen:menu' is the MENU-EDITING permission, not something an
-- ordinary cashier is granted. menu_items already solved this exact problem
-- (menu_items_select allows 'screen:menu' OR 'pos:register', see
-- 20260801163618_pos_orders_schema.sql) — services was never given the same
-- split when the Salon MVP was built, so any real cashier account (only
-- 'pos:register', no 'screen:menu' — the normal shape for a cashier) has
-- been unable to read services at all, meaning the POS product grid has
-- been silently empty of services for every service-business type
-- (salon/ladies_salon/car_wash/mobile_car_wash/clinic) whenever the signed-
-- in staff member isn't also a menu editor. Caught while verifying roadmap
-- item 4 (unified service+retail checkout) — a real cashier session with
-- only pos:register showed the retail product but never the service.
drop policy services_all on services;
create policy services_select on services for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy services_write on services for insert with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy services_update on services for update
  using (business_id = current_business_id() and has_permission('screen:menu')) with check (business_id = current_business_id() and has_permission('screen:menu'));
create policy services_delete on services for delete using (business_id = current_business_id() and has_permission('screen:menu'));

drop policy service_staff_all on service_staff;
create policy service_staff_select on service_staff for select
  using (exists (
    select 1 from services s where s.id = service_staff.service_id
    and s.business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register'))
  ));
create policy service_staff_write on service_staff for insert with check (exists (
  select 1 from services s where s.id = service_staff.service_id
  and s.business_id = current_business_id() and has_permission('screen:menu')
));
create policy service_staff_update on service_staff for update
  using (exists (
    select 1 from services s where s.id = service_staff.service_id
    and s.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from services s where s.id = service_staff.service_id
    and s.business_id = current_business_id() and has_permission('screen:menu')
  ));
create policy service_staff_delete on service_staff for delete using (exists (
  select 1 from services s where s.id = service_staff.service_id
  and s.business_id = current_business_id() and has_permission('screen:menu')
));
