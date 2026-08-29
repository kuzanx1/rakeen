-- Roadmap item 7 (approved plan) — فندق. The last and most structurally
-- different sector: a stay is a multi-night DATE RANGE (not a same-day
-- timed appointment) and a room needs housekeeping status, not just a
-- booked/free flag. table_reservations (timestamptz reserved_for/
-- reserved_until) and restaurant_tables (dine-in-order-specific status
-- vocabulary: awaiting_order/serving/awaiting_payment) don't fit — hotel
-- gets two dedicated tables instead. Room TYPES (Deluxe Room, Suite —
-- name + nightly rate) deliberately stay ordinary `services` rows: that
-- alone unlocks the existing Services CRUD screen as room-type management
-- and lets room-type bookings flow through the existing cart/checkout/
-- complete_pos_order/receipt pipeline with zero new payment code.

alter table businesses drop constraint businesses_business_type_check;
alter table businesses add constraint businesses_business_type_check
  check (business_type in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash', 'mobile_car_wash',
    'clinic', 'tailoring', 'hotel', 'retail', 'other'
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
    'clinic', 'tailoring', 'hotel', 'retail', 'other'
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

-- Physical room inventory. status_changed_at reuses the existing
-- set_table_status_changed_at() trigger fn as-is — it only ever
-- references NEW/OLD generically, never restaurant_tables by name.
create table hotel_rooms (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  room_type_service_id bigint not null references services(id),
  room_number text not null,
  status text not null default 'available' check (status in ('available','occupied','cleaning','maintenance')),
  active boolean not null default true,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (branch_id, room_number)
);
create index hotel_rooms_business_id_idx on hotel_rooms(business_id);

create trigger hotel_rooms_status_changed_at
  before update on hotel_rooms
  for each row execute function set_table_status_changed_at();

-- A stay. check_in_date/check_out_date are `date` (not timestamptz) since
-- a multi-night stay is calendar-date arithmetic, not a point-in-time +
-- duration like every other business type's table_reservations row.
-- `nights` as a generated column can never drift from its two source
-- columns (date - date is plain immutable integer arithmetic in Postgres,
-- unlike timestamptz + interval which isn't immutable/is tz-dependent —
-- that's why reserved_until on table_reservations is NOT generated).
create table hotel_bookings (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  room_type_service_id bigint not null references services(id),
  room_id bigint references hotel_rooms(id),
  guest_name text not null,
  guest_phone text,
  check_in_date date not null,
  check_out_date date not null check (check_out_date > check_in_date),
  nights int generated always as (check_out_date - check_in_date) stored,
  rate_per_night numeric not null check (rate_per_night >= 0),
  status text not null default 'upcoming' check (status in ('upcoming','checked_in','checked_out','cancelled','no_show')),
  order_id bigint references orders(id),
  created_at timestamptz not null default now()
);
create index hotel_bookings_business_id_idx on hotel_bookings(business_id);
create index hotel_bookings_branch_status_idx on hotel_bookings(branch_id, status);
create index hotel_bookings_room_status_idx on hotel_bookings(room_id, status);

alter table hotel_rooms enable row level security;
-- Split from day one (menu_items/services already had to be fixed once
-- this session for bundling SELECT under a write-only permission check —
-- a plain cashier with only pos:register must be able to READ these).
create policy hotel_rooms_select on hotel_rooms for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy hotel_rooms_write on hotel_rooms for insert with check (business_id = current_business_id() and has_permission('screen:menu'));
-- Cashiers legitimately flip room status (cleaning->available, mark
-- maintenance) day to day, so update is intentionally broader than write.
create policy hotel_rooms_update on hotel_rooms for update
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')))
  with check (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy hotel_rooms_delete on hotel_rooms for delete using (business_id = current_business_id() and has_permission('screen:menu'));

alter table hotel_bookings enable row level security;
create policy hotel_bookings_select on hotel_bookings for select
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy hotel_bookings_write on hotel_bookings for insert with check (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
create policy hotel_bookings_update on hotel_bookings for update
  using (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')))
  with check (business_id = current_business_id() and (has_permission('screen:menu') or has_permission('pos:register')));
-- No delete policy — status flips (cancelled) only, same as table_reservations.

-- Counts rooms of this type genuinely bookable in the range: active,
-- not under maintenance, and with no overlapping non-resolved booking.
-- Excluding 'maintenance' matters even without any overlapping booking —
-- a room out for repairs for months has nothing to overlap against.
create or replace function hotel_room_availability(p_room_type_service_id bigint, p_check_in date, p_check_out date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_total int;
  v_booked int;
begin
  if not (has_permission('pos:register') or has_permission('screen:menu')) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total from hotel_rooms
    where business_id = v_business_id and room_type_service_id = p_room_type_service_id
      and active = true and status <> 'maintenance';

  select count(distinct room_id) into v_booked from hotel_bookings
    where business_id = v_business_id and room_type_service_id = p_room_type_service_id
      and status in ('upcoming','checked_in') and room_id is not null
      and check_in_date < p_check_out and check_out_date > p_check_in;

  return greatest(v_total - v_booked, 0);
end;
$$;

create or replace function create_hotel_booking(
  p_branch_id bigint,
  p_room_type_service_id bigint,
  p_guest_name text,
  p_guest_phone text,
  p_check_in date,
  p_check_out date
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_rate numeric;
  v_available int;
  v_booking_id bigint;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول';
  end if;
  if not exists (select 1 from branches where id = p_branch_id and business_id = v_business_id) then
    raise exception 'فرع غير صالح';
  end if;

  select price into v_rate from services
    where id = p_room_type_service_id and business_id = v_business_id and active = true;
  if v_rate is null then
    raise exception 'نوع الغرفة غير متاح';
  end if;

  v_available := hotel_room_availability(p_room_type_service_id, p_check_in, p_check_out);
  if v_available <= 0 then
    raise exception 'ما فيه غرف متاحة بهذا النوع بالتواريخ المطلوبة';
  end if;

  insert into hotel_bookings (
    business_id, branch_id, room_type_service_id, guest_name, guest_phone,
    check_in_date, check_out_date, rate_per_night, status
  ) values (
    v_business_id, p_branch_id, p_room_type_service_id, p_guest_name, p_guest_phone,
    p_check_in, p_check_out, v_rate, 'upcoming'
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$;

-- Room row locked/updated FIRST, then the booking — same ordering as
-- seat_waitlist_entry, so two cashiers racing to check different bookings
-- into the same room can't both succeed.
create or replace function checkin_hotel_booking(p_booking_id bigint, p_room_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_room_type_service_id bigint;
  v_rows_updated int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select room_type_service_id into v_room_type_service_id from hotel_bookings
    where id = p_booking_id and business_id = v_business_id and status = 'upcoming';
  if v_room_type_service_id is null then
    raise exception 'الحجز غير موجود أو تم تسجيل وصوله سابقاً';
  end if;

  update hotel_rooms set status = 'occupied'
    where id = p_room_id and business_id = v_business_id and status = 'available'
      and room_type_service_id = v_room_type_service_id;
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'هذي الغرفة غير متاحة';
  end if;

  update hotel_bookings set status = 'checked_in', room_id = p_room_id
    where id = p_booking_id and business_id = v_business_id and status = 'upcoming';
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'تعذر تسجيل الوصول';
  end if;
end;
$$;

-- Called after the cashier has already run the room-type service through
-- the normal cart/payment flow (complete_pos_order) and a real order row
-- exists — this just links the booking to that order and flips the room
-- to 'cleaning'. No new payment code anywhere in this feature.
create or replace function finalize_hotel_checkout(p_booking_id bigint, p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_room_id bigint;
  v_rows_updated int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from orders where id = p_order_id and business_id = v_business_id) then
    raise exception 'طلب غير صالح';
  end if;

  update hotel_bookings set status = 'checked_out', order_id = p_order_id
    where id = p_booking_id and business_id = v_business_id and status = 'checked_in'
    returning room_id into v_room_id;
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'الحجز غير موجود أو ما هو مسجّل دخول';
  end if;

  if v_room_id is not null then
    update hotel_rooms set status = 'cleaning' where id = v_room_id and business_id = v_business_id;
  end if;
end;
$$;
