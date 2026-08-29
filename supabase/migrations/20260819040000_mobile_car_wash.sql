-- Roadmap item 3 (approved plan) — مغسلة سيارات متنقلة: the team travels to
-- the customer instead of the customer visiting a bay. A genuinely separate
-- business_type from 'car_wash' (not a toggle on it) because the whole
-- booking/POS shape differs: no physical resource (bay) to book or seat
-- into at all, and the public booking flow needs a location-capture step
-- 'car_wash' never needed. Shares the same services/service_staff/
-- table_reservations engine as every other service business — only the
-- resource concept and the booking-page/POS presentation differ.

alter table businesses drop constraint businesses_business_type_check;
alter table businesses add constraint businesses_business_type_check
  check (business_type in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash', 'mobile_car_wash',
    'clinic', 'retail', 'other'
  ));

-- handle_new_auth_user() keeps its own internal defensive whitelist,
-- independent of the check constraint above — a prior migration
-- (20260818230000) already had to fix a real bug where this drifted out of
-- sync and silently downgraded 5 new types to 'restaurant' at signup.
-- Updating both together this time.
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
    'clinic', 'retail', 'other'
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

-- Same shape as orders.customer_lat/customer_lng (online delivery) — a
-- mobile car wash booking needs the same "where do we go" data a delivery
-- order needs. Nullable: every other business type leaves these null.
alter table table_reservations add column customer_lat numeric;
alter table table_reservations add column customer_lng numeric;
alter table table_reservations add column customer_address_text text;

drop function if exists submit_public_reservation(text, text, text, bigint, timestamptz, bigint);
create or replace function submit_public_reservation(
  p_business_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_id bigint,
  p_reserved_for timestamptz,
  p_staff_member_id bigint default null,
  p_customer_lat numeric default null,
  p_customer_lng numeric default null,
  p_customer_address_text text default null
)
returns table(reservation_id bigint, service_name text, service_price numeric, duration_minutes int, reserved_for timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business record;
  v_service record;
  v_branch record;
  v_staff record;
  v_recent_count int;
  v_conflict_count int;
  v_reservation_id bigint;
  v_reserved_until timestamptz;
begin
  select * into v_business from businesses where online_menu_slug = p_business_slug and online_booking_enabled = true;
  if not found then
    raise exception 'هذا الرابط غير متاح للحجز حالياً';
  end if;

  if v_business.verification_status = 'pending' then
    raise exception 'هذا الحساب قيد المراجعة من فريق ركين حالياً — يتفعّل قريباً';
  elsif v_business.verification_status = 'rejected' then
    raise exception 'الحجز غير متاح حالياً لهذا الحساب';
  end if;

  select * into v_service from services where id = p_service_id and business_id = v_business.id and active = true;
  if not found then
    raise exception 'الخدمة المطلوبة غير متاحة';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) < 6 then
    raise exception 'رقم جوال غير صالح';
  end if;
  if p_reserved_for <= now() then
    raise exception 'وقت الحجز يجب أن يكون بالمستقبل';
  end if;

  select count(*) into v_recent_count from table_reservations
    where business_id = v_business.id and customer_phone = p_customer_phone
      and created_at > now() - interval '20 seconds';
  if v_recent_count >= 2 then
    raise exception 'فيه حجز لك قبل شوي، لحظات وبنأكده — ما تحتاج ترسل مرة ثانية';
  end if;

  if p_staff_member_id is not null then
    select id into v_staff from staff_members
      where id = p_staff_member_id and business_id = v_business.id and active = true;
    if v_staff.id is null then
      raise exception 'الموظف المختار غير متاح';
    end if;
    if exists (select 1 from service_staff where service_id = p_service_id)
      and not exists (select 1 from service_staff where service_id = p_service_id and staff_member_id = p_staff_member_id) then
      raise exception 'هذا الموظف لا يقدّم هذي الخدمة';
    end if;
  end if;

  v_reserved_until := p_reserved_for + (v_service.duration_minutes * interval '1 minute');

  if p_staff_member_id is not null then
    select count(*) into v_conflict_count from table_reservations tr
      where tr.business_id = v_business.id and tr.staff_member_id = p_staff_member_id
        and tr.status = 'upcoming'
        and tr.reserved_for < v_reserved_until
        and tr.reserved_until > p_reserved_for;
    if v_conflict_count > 0 then
      raise exception 'هذا الموعد محجوز عند هذا الموظف — اختر وقتاً آخر';
    end if;
  end if;

  select id into v_branch from branches where business_id = v_business.id order by id limit 1;
  if v_branch.id is null then
    raise exception 'المنشأة بدون فرع مسجّل';
  end if;

  insert into table_reservations (
    business_id, branch_id, table_id, customer_name, customer_phone,
    party_size, reserved_for, status, staff_member_id, service_id, duration_minutes, reserved_until,
    customer_lat, customer_lng, customer_address_text
  ) values (
    v_business.id, v_branch.id, null, p_customer_name, p_customer_phone,
    1, p_reserved_for, 'upcoming', p_staff_member_id, p_service_id, v_service.duration_minutes, v_reserved_until,
    p_customer_lat, p_customer_lng, p_customer_address_text
  ) returning id into v_reservation_id;

  return query select v_reservation_id, v_service.name, v_service.price, v_service.duration_minutes, p_reserved_for;
end;
$$;

grant execute on function submit_public_reservation(text, text, text, bigint, timestamptz, bigint, numeric, numeric, text) to anon;

-- Marks a mobile-car-wash job as started (the team is on their way / on
-- site) — the equivalent of seat_waitlist_entry() for a booking type with
-- no physical table to assign. Reuses the existing 'seated' status value
-- (== "in progress") rather than adding a new status, since every other
-- consumer of table_reservations.status already only distinguishes
-- upcoming/seated/no_show/cancelled and a 5th value would need auditing
-- across every one of those call sites for no real behavioral gain here.
create or replace function start_mobile_service(p_reservation_id bigint)
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

  update table_reservations set status = 'seated'
    where id = p_reservation_id and business_id = v_business_id and status = 'upcoming';
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'booking not found or already resolved';
  end if;
end;
$$;
