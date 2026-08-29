-- Bug fix: hotel_room_availability() only counted bookings that already
-- had a room_id assigned (room_id is not null), but rooms aren't assigned
-- until check-in per this feature's design (create_hotel_booking leaves
-- room_id null; checkin_hotel_booking assigns it). That meant an upcoming,
-- not-yet-checked-in booking never reduced the reported availability,
-- letting the room type be overbooked beyond its physical room count.
-- Caught via a real anon-client round-trip test: booked 1 of 2 rooms,
-- availability still reported 2 instead of 1. Fixed by counting
-- overlapping BOOKINGS of that type directly (each one reserves exactly
-- one room-slot of that type regardless of physical assignment), not
-- distinct assigned room_ids.
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

  select count(*) into v_booked from hotel_bookings
    where business_id = v_business_id and room_type_service_id = p_room_type_service_id
      and status in ('upcoming','checked_in')
      and check_in_date < p_check_out and check_out_date > p_check_in;

  return greatest(v_total - v_booked, 0);
end;
$$;
