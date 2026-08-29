-- Lets a customer see what they actually ordered on the tracking page
-- (get_order_status now also returns an items breakdown), and edit their
-- note while the order is still pending — before the kitchen accepts it,
-- mirroring reject_online_order's own status='pending' guard so a customer
-- can't silently rewrite notes on an order already being prepped. This is
-- the first "customer mutates their own order" RPC; it copies
-- respond_loyalty_redemption_request's token-scoped-update pattern.

drop function if exists get_order_status(uuid);
create or replace function get_order_status(p_token uuid)
returns table(
  order_id bigint, channel text, status text, ready_at timestamptz, scheduled_for timestamptz,
  created_at timestamptz, total numeric, customer_name text,
  business_name text, business_logo_url text, theme_color text, contact_whatsapp text,
  rejection_reason text, online_customer_note text, items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select o.id, o.channel, o.status, o.ready_at, o.scheduled_for, o.created_at, o.total, o.customer_name,
           b.name, b.logo_url, b.online_theme_color, b.online_contact_whatsapp, o.rejection_reason,
           o.online_customer_note,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
               'name', coalesce(oi.selected_modifiers->0->>'text', mi.name),
               'qty', oi.qty,
               'line_total', oi.line_total,
               'note', oi.note
             ) order by oi.id), '[]'::jsonb)
             from order_items oi
             join menu_items mi on mi.id = oi.menu_item_id
             where oi.order_id = o.id
           ) as items
    from orders o join businesses b on b.id = o.business_id
    where o.tracking_token = p_token;
end;
$$;
grant execute on function get_order_status(uuid) to anon;

create or replace function update_order_note(p_token uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  update orders
  set online_customer_note = nullif(trim(p_note), '')
  where tracking_token = p_token
    and status = 'pending'
  returning id into v_id;

  return v_id is not null;
end;
$$;
grant execute on function update_order_note(uuid, text) to anon;
