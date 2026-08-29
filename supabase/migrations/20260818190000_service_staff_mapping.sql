-- Which staff members can perform which service. An empty mapping for a
-- given service means "any active staff member can perform it" — the safe
-- default for a 1-2-stylist salon, checked in application code (POS/
-- dashboard), not enforced here.
create table service_staff (
  service_id bigint not null references services(id) on delete cascade,
  staff_member_id bigint not null references staff_members(id) on delete cascade,
  primary key (service_id, staff_member_id)
);

alter table service_staff enable row level security;
create policy service_staff_all on service_staff for all
  using (exists (
    select 1 from services s where s.id = service_staff.service_id
    and s.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from services s where s.id = service_staff.service_id
    and s.business_id = current_business_id() and has_permission('screen:menu')
  ));
