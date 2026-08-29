-- Roadmap item 5 (approved plan) — مشغل تفصيل (tailoring/alterations shop).
-- Reuses the exact services/service_staff/table_reservations engine every
-- other service business already shares (a "تفصيل بدلة" service booked
-- through the same Services CRUD screen built for salon) — the only new
-- piece is a genuine "order in progress -> ready for pickup" distinction,
-- which unlike mobile_car_wash's start_mobile_service() DOES carry real
-- behavioral value (the owner needs to know when to text the customer that
-- their garment is ready), so this adds two new status values instead of
-- reusing 'seated' for everything.

alter table businesses drop constraint businesses_business_type_check;
alter table businesses add constraint businesses_business_type_check
  check (business_type in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash', 'mobile_car_wash',
    'clinic', 'tailoring', 'retail', 'other'
  ));

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  target_business_id bigint := (meta->>'business_id')::bigint;
  new_business_id bigint;
  new_branch_id bigint;
  new_business_type text := coalesce(meta->>'business_type', 'restaurant');
begin
  if new_business_type not in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash', 'mobile_car_wash',
    'clinic', 'tailoring', 'retail', 'other'
  ) then
    new_business_type := 'restaurant';
  end if;

  if target_business_id is null then
    insert into businesses (name, verification_status, business_type)
    values (coalesce(meta->>'business_name', 'مشروعي'), 'pending', new_business_type)
    returning id into new_business_id;

    update businesses set online_ordering_enabled = true, online_menu_slug = 'store-' || new_business_id
      where id = new_business_id;

    insert into branches (business_id, name)
    values (new_business_id, 'الفرع الرئيسي')
    returning id into new_branch_id;

    insert into profiles (id, business_id, full_name, user_type, created_by)
    values (new.id, new_business_id, coalesce(meta->>'full_name', new.email), 'owner', null);
  else
    insert into profiles (id, business_id, full_name, user_type, created_by, branch_id)
    values (
      new.id,
      target_business_id,
      coalesce(meta->>'full_name', new.email),
      coalesce(meta->>'user_type', 'employee'),
      nullif(meta->>'created_by', '')::uuid,
      (meta->>'branch_id')::bigint
    );
  end if;
  return new;
end;
$$;

-- 'upcoming' (dropped off, waiting) -> 'seated' (being worked on — reuses
-- start_mobile_service() as-is, since that RPC's body is already fully
-- generic: it just flips upcoming->seated under a permission/business_id
-- check, nothing car-wash-specific in it) -> 'ready_for_pickup' (garment
-- done) -> 'completed' (handed to the customer). The two new values below
-- are additive; every existing consumer of table_reservations.status
-- (waitlist queries, reminders, conflict checks) already filters to
-- specific values it expects and is unaffected by new ones it never asks for.
alter table table_reservations drop constraint table_reservations_status_check;
alter table table_reservations add constraint table_reservations_status_check
  check (status in ('upcoming','seated','no_show','cancelled','ready_for_pickup','completed'));

create or replace function mark_reservation_ready(p_reservation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_rows_updated int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  update table_reservations set status = 'ready_for_pickup'
    where id = p_reservation_id and business_id = v_business_id and status = 'seated';
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'booking not found or not in progress';
  end if;
end;
$$;

create or replace function complete_reservation(p_reservation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_rows_updated int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  update table_reservations set status = 'completed'
    where id = p_reservation_id and business_id = v_business_id and status = 'ready_for_pickup';
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'booking not found or not ready for pickup';
  end if;
end;
$$;
