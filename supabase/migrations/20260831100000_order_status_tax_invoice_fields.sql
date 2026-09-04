-- The customer-facing receipt card (drawn on the order-status page) is
-- becoming a real "فاتورة ضريبية مبسطة" (simplified tax invoice) when the
-- business is VAT-registered, mirroring the same fields the POS's own
-- printed receipt already shows (see zatcaQrBase64/BUSINESS_VAT_NUMBER in
-- public/pos/rakeen-pos.js) — subtotal/vat_amount are already computed and
-- stored on the order row at submit_online_order time, this just surfaces
-- them; vat_number/vat_registered come from the business row exactly like
-- every other business.* field this function already joins in.
drop function if exists get_order_status(uuid);
create or replace function get_order_status(p_token uuid)
returns table(
  order_id bigint, channel text, status text, ready_at timestamptz, scheduled_for timestamptz,
  created_at timestamptz, total numeric, customer_name text,
  business_name text, business_logo_url text, theme_color text, contact_whatsapp text,
  rejection_reason text, online_customer_note text, items jsonb,
  branch_name text, branch_address text, branch_lat numeric, branch_lng numeric,
  payment_method text, payment_status text,
  subtotal numeric, vat_amount numeric, business_vat_number text, vat_registered boolean
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
           ) as items,
           case when o.channel = 'pickup' then br.name else null end,
           case when o.channel = 'pickup' then br.address else null end,
           case when o.channel = 'pickup' then br.lat else null end,
           case when o.channel = 'pickup' then br.lng else null end,
           o.payment_method, o.payment_status,
           o.subtotal, o.vat_amount, b.vat_number, coalesce(b.vat_registered, true)
    from orders o
    join businesses b on b.id = o.business_id
    left join branches br on br.id = o.branch_id
    where o.tracking_token = p_token;
end;
$$;
grant execute on function get_order_status(uuid) to anon;
