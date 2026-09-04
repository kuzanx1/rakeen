-- HR module, Phase 1: real employee master data + org structure + compliance
-- document tracking. `staff_members` stays exactly as-is (a disposable
-- name-label picked after a shared branch PIN unlocks a POS device, used
-- only to attribute orders — see 20260801172010_staff_members_and_branch_pin.sql).
-- `profiles` stays exactly as-is too (a seat-limited login account). Neither
-- carries HR data. `employees` below is the real employee record — many real
-- employees (kitchen staff, cleaners) will have one without ever logging in,
-- so `profile_id` is nullable and only set when the same person also happens
-- to have a `profiles` login.

create table departments (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  parent_department_id bigint references departments(id),
  created_at timestamptz not null default now()
);
create index departments_business_id_idx on departments(business_id);

create table employees (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint references branches(id),
  profile_id uuid references profiles(id),
  department_id bigint references departments(id),
  full_name text not null,
  national_id_or_iqama text,
  iqama_expiry date,
  nationality text,
  job_title text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time', 'part_time', 'temporary')),
  hire_date date,
  termination_date date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'terminated')),
  base_salary numeric,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index employees_business_id_idx on employees(business_id);
create index employees_department_id_idx on employees(department_id);
create index employees_profile_id_idx on employees(profile_id);

create table compliance_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  employee_id bigint not null references employees(id) on delete cascade,
  document_type text not null check (document_type in ('iqama', 'contract', 'health_cert', 'insurance', 'other')),
  document_number text,
  issued_date date,
  expiry_date date not null,
  status text not null default 'valid' check (status in ('valid', 'expiring_soon', 'expired')),
  reminder_days_before int not null default 30,
  created_at timestamptz not null default now()
);
create index compliance_items_business_id_idx on compliance_items(business_id);
create index compliance_items_employee_id_idx on compliance_items(employee_id);
create index compliance_items_expiry_date_idx on compliance_items(expiry_date);

alter table departments enable row level security;
create policy departments_select on departments for select
  using (business_id = current_business_id() and has_permission('screen:hr'));
create policy departments_write on departments for insert with check (business_id = current_business_id() and has_permission('screen:hr'));
create policy departments_update on departments for update
  using (business_id = current_business_id() and has_permission('screen:hr')) with check (business_id = current_business_id() and has_permission('screen:hr'));
create policy departments_delete on departments for delete using (business_id = current_business_id() and has_permission('screen:hr'));

alter table employees enable row level security;
create policy employees_select on employees for select
  using (business_id = current_business_id() and has_permission('screen:hr'));
create policy employees_write on employees for insert with check (business_id = current_business_id() and has_permission('screen:hr'));
create policy employees_update on employees for update
  using (business_id = current_business_id() and has_permission('screen:hr')) with check (business_id = current_business_id() and has_permission('screen:hr'));
create policy employees_delete on employees for delete using (business_id = current_business_id() and has_permission('screen:hr'));

alter table compliance_items enable row level security;
create policy compliance_items_select on compliance_items for select
  using (business_id = current_business_id() and has_permission('screen:hr'));
create policy compliance_items_write on compliance_items for insert with check (business_id = current_business_id() and has_permission('screen:hr'));
create policy compliance_items_update on compliance_items for update
  using (business_id = current_business_id() and has_permission('screen:hr')) with check (business_id = current_business_id() and has_permission('screen:hr'));
create policy compliance_items_delete on compliance_items for delete using (business_id = current_business_id() and has_permission('screen:hr'));

-- Recomputes every compliance_items.status from expiry_date/reminder_days_before.
-- Called only from app/api/cron/compliance-check (service role, shared-secret
-- auth — same pattern as generate_daily_reports / app/api/cron/daily-report).
-- No external API involved: this is purely a manually-entered-date reminder,
-- never a live GOSI/Muqeem lookup.
create or replace function check_compliance_expiries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update compliance_items
  set status = case
    when expiry_date < current_date then 'expired'
    when expiry_date <= current_date + (reminder_days_before || ' days')::interval then 'expiring_soon'
    else 'valid'
  end
  where status is distinct from (case
    when expiry_date < current_date then 'expired'
    when expiry_date <= current_date + (reminder_days_before || ' days')::interval then 'expiring_soon'
    else 'valid'
  end);
end;
$$;
