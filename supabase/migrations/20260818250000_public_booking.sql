-- Roadmap item 1 (see approved plan) — the single highest-leverage gap
-- found in the feasibility study: car wash, salon, ladies_salon, and
-- clinic all currently require a staff member to enter every booking by
-- hand. This adds a public, anonymous self-service booking path mirroring
-- the existing restaurant online-order storefront's exact pattern
-- (submit_online_order: security definer, looks up business by slug,
-- recomputes everything server-side, grant execute to anon).

-- Separate flag from online_ordering_enabled — a business is never both a
-- restaurant-type (ordering) and a service-type (booking) at once, but the
-- concepts are semantically distinct, so this doesn't reuse that flag.
alter table businesses add column online_booking_enabled boolean not null default false;
grant select (online_booking_enabled, business_type) on businesses to anon;

-- Anon read access to services/service_staff/staff_members, gated by the
-- owning business having booking enabled — mirrors the exact shape of the
-- existing public menu_items policy (20260810060000), just for the
-- services engine instead of the menu engine.
create policy services_public_read on services for select
  using (
    active = true
    and exists (select 1 from businesses b where b.id = services.business_id and b.online_booking_enabled = true)
  );

create policy service_staff_public_read on service_staff for select
  using (
    exists (
      select 1 from services s join businesses b on b.id = s.business_id
      where s.id = service_staff.service_id and b.online_booking_enabled = true
    )
  );

create policy staff_members_public_read on staff_members for select
  using (
    active = true
    and exists (select 1 from businesses b where b.id = staff_members.business_id and b.online_booking_enabled = true)
  );

-- ===== submit_public_reservation: the anonymous booking entry point =====
-- No table_id is assigned here — same as the existing staff-entered
-- waitlist flow (table_id nullable, assigned later via seat_waitlist_entry
-- when the business actually seats the customer). The business picks the
-- specific chair/bay/room at arrival time, not at booking time.
create or replace function submit_public_reservation(
  p_business_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_id bigint,
  p_reserved_for timestamptz,
  p_staff_member_id bigint default null
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

  -- Same duplicate-submission guard shape as submit_online_order.
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
    -- Empty service_staff mapping for a service means any active staff is
    -- eligible (same rule established for the salon MVP) — only reject if
    -- the mapping exists for this service AND this staff member isn't in it.
    if exists (select 1 from service_staff where service_id = p_service_id)
      and not exists (select 1 from service_staff where service_id = p_service_id and staff_member_id = p_staff_member_id) then
      raise exception 'هذا الموظف لا يقدّم هذي الخدمة';
    end if;
  end if;

  v_reserved_until := p_reserved_for + (v_service.duration_minutes * interval '1 minute');

  -- Hard conflict block (not just a warning like the staff-facing toggle) —
  -- no human is present here to override an overlap the way staff can.
  if p_staff_member_id is not null then
    select count(*) into v_conflict_count from table_reservations
      where business_id = v_business.id and staff_member_id = p_staff_member_id
        and status = 'upcoming'
        and reserved_for < v_reserved_until
        and reserved_until > p_reserved_for;
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
    party_size, reserved_for, status, staff_member_id, service_id, duration_minutes, reserved_until
  ) values (
    v_business.id, v_branch.id, null, p_customer_name, p_customer_phone,
    1, p_reserved_for, 'upcoming', p_staff_member_id, p_service_id, v_service.duration_minutes, v_reserved_until
  ) returning id into v_reservation_id;

  return query select v_reservation_id, v_service.name, v_service.price, v_service.duration_minutes, p_reserved_for;
end;
$$;

grant execute on function submit_public_reservation(text, text, text, bigint, timestamptz, bigint) to anon;
