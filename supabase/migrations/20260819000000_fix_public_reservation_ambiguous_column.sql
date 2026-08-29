-- Bug fix: submit_public_reservation's RETURNS TABLE(...) declares an OUT
-- column named "reserved_for", which puts a variable named reserved_for in
-- scope for the whole function body — colliding with table_reservations's
-- own reserved_for column in the conflict-check query and making it
-- ambiguous (SQLSTATE 42702). Caught via live anon-client verification:
-- every real booking attempt failed with "column reference reserved_for is
-- ambiguous" before ever reaching the insert. Fix: qualify the
-- table_reservations columns in that query with an explicit alias.
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
    party_size, reserved_for, status, staff_member_id, service_id, duration_minutes, reserved_until
  ) values (
    v_business.id, v_branch.id, null, p_customer_name, p_customer_phone,
    1, p_reserved_for, 'upcoming', p_staff_member_id, p_service_id, v_service.duration_minutes, v_reserved_until
  ) returning id into v_reservation_id;

  return query select v_reservation_id, v_service.name, v_service.price, v_service.duration_minutes, p_reserved_for;
end;
$$;
