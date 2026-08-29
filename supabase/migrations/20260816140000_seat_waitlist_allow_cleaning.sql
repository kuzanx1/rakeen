-- A table booked in advance (or picked from the waitlist) doesn't need to
-- be spotless RIGHT NOW to be selected — it's fine for a 'cleaning' table
-- to still receive a booking/seating, the cashier just needs to actually
-- see that it's not ready yet (handled client-side: the picker now shows
-- 'cleaning' tables with a warning + confirm before calling this). Server
-- guard widens from "must be available" to "must be available or cleaning"
-- so that confirmed choice doesn't get rejected.
create or replace function seat_waitlist_entry(p_reservation_id bigint, p_table_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_resv_exists boolean;
  v_rows_updated int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select exists(select 1 from table_reservations where id = p_reservation_id and business_id = v_business_id and status = 'upcoming')
    into v_resv_exists;
  if not v_resv_exists then
    raise exception 'waitlist entry not found or already resolved';
  end if;

  update restaurant_tables set status = 'awaiting_order'
    where id = p_table_id and business_id = v_business_id and status in ('available', 'cleaning');
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'table is not available';
  end if;

  update table_reservations set table_id = p_table_id, status = 'seated' where id = p_reservation_id;

  return p_table_id;
end;
$$;
