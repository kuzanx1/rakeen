-- accept_online_order declares RETURNS TABLE(id bigint, status text), which
-- makes plpgsql create local variables named `id`/`status` for those OUT
-- params. The businesses lookup used an unqualified `id`, which collided
-- with that `id` variable and made every acceptance fail with "column
-- reference \"id\" is ambiguous" (reject_online_order and the other
-- RETURNS TABLE(id, ...) functions already qualify every column and don't
-- have this bug).
create or replace function accept_online_order(p_order_id bigint)
returns table(id bigint, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_business record;
  v_channel text;
  v_auto_ready boolean;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select * into v_business from businesses where businesses.id = v_business_id;
  select channel into v_channel from orders where orders.id = p_order_id and orders.business_id = v_business_id;
  v_auto_ready := case v_channel
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_online
    else false
  end;

  return query
  update orders set
    status = 'completed',
    cashier_id = auth.uid(),
    ready_at = case when v_auto_ready then now() else orders.ready_at end,
    prep_duration_seconds = case when v_auto_ready then extract(epoch from (now() - orders.created_at))::int else orders.prep_duration_seconds end
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.status = 'pending'
  returning orders.id, orders.status;

  if not found then
    raise exception 'الطلب غير متاح للقبول — يمكن تم التعامل معه من جهاز آخر';
  end if;
end;
$$;
