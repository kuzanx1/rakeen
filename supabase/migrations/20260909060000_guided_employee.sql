-- "موظفك في ركين" / مدير الموظفين — atomic, idempotent blocks for the guided
-- HR flow. Every write mirrors exactly what saveEmployeeFromModal +
-- syncEmployeeIqamaDoc do (public/dashboard/rakeen-dashboard.js): an
-- employees row, plus (when an iqama expiry is given) the linked iqama
-- compliance_items row kept in sync. business from auth.uid() (never a
-- parameter); permission re-checked the way the employees RLS policies are
-- (screen:hr) — and base_salary is only ever stored when the caller also has
-- view_salary, mirroring canViewSalary() on the form.

create table if not exists employee_guided_ops (
  op_id text primary key,
  business_id bigint not null references businesses(id),
  kind text not null default 'employee',
  employee_id bigint references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table employee_guided_ops enable row level security;
-- SECURITY DEFINER functions are the only writers → zero policies (deny-all).

-- ── helper: keep the iqama compliance_items row in sync (mirrors syncEmployeeIqamaDoc) ──
create or replace function _rka_sync_iqama_doc(p_bid bigint, p_emp bigint, p_num text, p_expiry date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ex record;
begin
  select id, document_number, expiry_date into v_ex from compliance_items
  where business_id = p_bid and employee_id = p_emp and document_type = 'iqama';
  if found then
    update compliance_items set
      document_number = coalesce(nullif(btrim(coalesce(p_num, '')), ''), document_number),
      expiry_date = coalesce(p_expiry, expiry_date),
      reminder_sent_status = case when p_expiry is not null and p_expiry is distinct from v_ex.expiry_date then null else reminder_sent_status end
    where id = v_ex.id;
  elsif p_expiry is not null then
    insert into compliance_items (business_id, employee_id, document_type, document_number, expiry_date, reminder_days_before, reminder_enabled)
    values (p_bid, p_emp, 'iqama', nullif(btrim(coalesce(p_num, '')), ''), p_expiry, 30, true);
  end if;
end;
$$;
revoke all on function _rka_sync_iqama_doc(bigint, bigint, text, date) from public, anon;

-- ── 1. create a new employee (+ optional iqama doc) — op-id idempotent ──
create or replace function create_employee_guided(
  p_op_id text,
  p_full_name text,
  p_job_title text default null,
  p_department_id bigint default null,
  p_branch_id bigint default null,
  p_employment_type text default 'full_time',
  p_hire_date date default null,
  p_status text default 'active',
  p_base_salary numeric default null,
  p_national_id text default null,
  p_iqama_expiry date default null,
  p_nationality text default null,
  p_phone text default null,
  p_emergency_name text default null,
  p_emergency_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_existing bigint;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_type text := coalesce(p_employment_type, 'full_time');
  v_status text := coalesce(p_status, 'active');
  v_can_salary boolean;
  v_salary numeric;
  v_emp_id bigint;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:hr') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_hr_biz:' || v_bid::text));

  select employee_id into v_existing from employee_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('employee_id', v_existing, 'created', false);
  end if;

  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 120 then raise exception 'name too long'; end if;
  if v_type not in ('full_time', 'part_time', 'temporary') then raise exception 'bad employment type'; end if;
  if v_status not in ('active', 'on_leave', 'terminated') then raise exception 'bad status'; end if;
  if p_hire_date is not null and (p_hire_date > (now() + interval '2 days')::date or p_hire_date < '1990-01-01') then raise exception 'hire date invalid'; end if;
  if p_department_id is not null and not exists (select 1 from departments where id = p_department_id and business_id = v_bid) then raise exception 'department not found'; end if;
  if p_branch_id is not null and not exists (select 1 from branches where id = p_branch_id and business_id = v_bid) then raise exception 'branch not found'; end if;

  -- الراتب لا يُحفظ إلا لمن يملك صلاحية عرض الرواتب — نفس canViewSalary()
  v_can_salary := has_permission('view_salary');
  v_salary := case when v_can_salary and p_base_salary is not null then p_base_salary else null end;
  if v_salary is not null and (v_salary < 0 or v_salary > 10000000 or v_salary = 'NaN'::numeric) then raise exception 'salary invalid'; end if;

  insert into employees (
    business_id, full_name, job_title, department_id, branch_id, employment_type, hire_date, status,
    base_salary, national_id_or_iqama, iqama_expiry, nationality, phone, emergency_contact_name, emergency_contact_phone, created_by
  ) values (
    v_bid, v_name, nullif(btrim(coalesce(p_job_title, '')), ''), p_department_id, p_branch_id, v_type, p_hire_date, v_status,
    v_salary, nullif(btrim(coalesce(p_national_id, '')), ''), p_iqama_expiry,
    nullif(btrim(coalesce(p_nationality, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_emergency_name, '')), ''), nullif(btrim(coalesce(p_emergency_phone, '')), ''), auth.uid()
  ) returning id into v_emp_id;

  if p_iqama_expiry is not null or nullif(btrim(coalesce(p_national_id, '')), '') is not null then
    perform _rka_sync_iqama_doc(v_bid, v_emp_id, p_national_id, p_iqama_expiry);
  end if;

  insert into employee_guided_ops (op_id, business_id, kind, employee_id)
  values (p_op_id, v_bid, 'employee', v_emp_id);

  return jsonb_build_object(
    'employee_id', v_emp_id, 'created', true, 'full_name', v_name,
    'salary_saved', (v_salary is not null),
    'salary_blocked', (p_base_salary is not null and not v_can_salary),
    'iqama_doc', (p_iqama_expiry is not null)
  );
end;
$$;
revoke all on function create_employee_guided(text, text, text, bigint, bigint, text, date, text, numeric, text, date, text, text, text, text) from public, anon;
grant execute on function create_employee_guided(text, text, text, bigint, bigint, text, date, text, numeric, text, date, text, text, text, text) to authenticated;

-- ── 2. edit an employee — absolute-set from a whitelisted patch (idempotent) ──
create or replace function update_employee_guided(p_employee_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_emp record;
  v_can_salary boolean;
  v_set text := '';
  v_key text;
  v_new_num text;
  v_new_exp date;
  v_touch_iqama boolean := false;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:hr') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_emp from employees where id = p_employee_id and business_id = v_bid;
  if not found then raise exception 'employee not found'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'empty patch'; end if;

  v_can_salary := has_permission('view_salary');

  perform pg_advisory_xact_lock(hashtext('rka_hr_emp:' || p_employee_id::text));

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key = 'full_name' then
      v_set := v_set || format(', full_name = %L', regexp_replace(btrim(p_patch->>'full_name'), '\s+', ' ', 'g'));
    elsif v_key = 'job_title' then
      v_set := v_set || format(', job_title = %L', nullif(btrim(coalesce(p_patch->>'job_title', '')), ''));
    elsif v_key = 'department_id' then
      if (p_patch->>'department_id') is not null and not exists (select 1 from departments where id = (p_patch->>'department_id')::bigint and business_id = v_bid) then raise exception 'department not found'; end if;
      v_set := v_set || format(', department_id = %L', nullif(p_patch->>'department_id', '')::bigint);
    elsif v_key = 'branch_id' then
      if (p_patch->>'branch_id') is not null and not exists (select 1 from branches where id = (p_patch->>'branch_id')::bigint and business_id = v_bid) then raise exception 'branch not found'; end if;
      v_set := v_set || format(', branch_id = %L', nullif(p_patch->>'branch_id', '')::bigint);
    elsif v_key = 'employment_type' then
      if (p_patch->>'employment_type') not in ('full_time', 'part_time', 'temporary') then raise exception 'bad employment type'; end if;
      v_set := v_set || format(', employment_type = %L', p_patch->>'employment_type');
    elsif v_key = 'status' then
      if (p_patch->>'status') not in ('active', 'on_leave', 'terminated') then raise exception 'bad status'; end if;
      v_set := v_set || format(', status = %L', p_patch->>'status');
    elsif v_key = 'hire_date' then
      v_set := v_set || format(', hire_date = %L', nullif(p_patch->>'hire_date', '')::date);
    elsif v_key = 'nationality' then
      v_set := v_set || format(', nationality = %L', nullif(btrim(coalesce(p_patch->>'nationality', '')), ''));
    elsif v_key = 'phone' then
      v_set := v_set || format(', phone = %L', nullif(btrim(coalesce(p_patch->>'phone', '')), ''));
    elsif v_key = 'emergency_contact_name' then
      v_set := v_set || format(', emergency_contact_name = %L', nullif(btrim(coalesce(p_patch->>'emergency_contact_name', '')), ''));
    elsif v_key = 'emergency_contact_phone' then
      v_set := v_set || format(', emergency_contact_phone = %L', nullif(btrim(coalesce(p_patch->>'emergency_contact_phone', '')), ''));
    elsif v_key = 'national_id_or_iqama' then
      v_new_num := nullif(btrim(coalesce(p_patch->>'national_id_or_iqama', '')), '');
      v_set := v_set || format(', national_id_or_iqama = %L', v_new_num);
      v_touch_iqama := true;
    elsif v_key = 'iqama_expiry' then
      v_new_exp := nullif(p_patch->>'iqama_expiry', '')::date;
      v_set := v_set || format(', iqama_expiry = %L', v_new_exp);
      v_touch_iqama := true;
    elsif v_key = 'base_salary' then
      if v_can_salary then
        v_set := v_set || format(', base_salary = %L', nullif(p_patch->>'base_salary', '')::numeric);
      else
        raise exception 'salary needs view_salary' using errcode = '42501';
      end if;
    else
      raise exception 'unknown field %', v_key;
    end if;
  end loop;

  if v_set = '' then raise exception 'nothing to update'; end if;
  execute 'update employees set ' || substring(v_set from 3) || format(' where id = %L and business_id = %L', p_employee_id, v_bid);

  if v_touch_iqama then
    perform _rka_sync_iqama_doc(
      v_bid, p_employee_id,
      case when p_patch ? 'national_id_or_iqama' then v_new_num else v_emp.national_id_or_iqama end,
      case when p_patch ? 'iqama_expiry' then v_new_exp else v_emp.iqama_expiry end
    );
  end if;

  return jsonb_build_object('ok', true, 'employee_id', p_employee_id);
end;
$$;
revoke all on function update_employee_guided(bigint, jsonb) from public, anon;
grant execute on function update_employee_guided(bigint, jsonb) to authenticated;
