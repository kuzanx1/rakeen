-- A restaurant contact number the guest order-tracking page can offer as a
-- "message us on WhatsApp" button — owner-editable, so it's whatever number
-- actually gets watched by staff, not necessarily the branch POS device.
alter table businesses add column online_contact_whatsapp text;

drop function if exists get_order_status(uuid);

create or replace function get_order_status(p_token uuid)
returns table(
  order_id bigint, channel text, status text, ready_at timestamptz, scheduled_for timestamptz,
  created_at timestamptz, total numeric, customer_name text,
  business_name text, business_logo_url text, theme_color text, contact_whatsapp text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select o.id, o.channel, o.status, o.ready_at, o.scheduled_for, o.created_at, o.total, o.customer_name,
           b.name, b.logo_url, b.online_theme_color, b.online_contact_whatsapp
    from orders o join businesses b on b.id = o.business_id
    where o.tracking_token = p_token;
end;
$$;

grant execute on function get_order_status(uuid) to anon;
