-- The "public business branding read for online ordering" row policy
-- (20260810060000) correctly restricted WHICH ROWS anon can see, but never
-- restricted WHICH COLUMNS — Supabase's default project setup grants anon
-- table-level SELECT on every public-schema table, so RLS alone let any
-- caller do `select=*` via PostgREST and pull the ENTIRE businesses row for
-- any online-ordering-enabled business, including pos_manager_pin_hash,
-- vat_number, and every internal notify_*/loyalty_* setting. The real
-- storefront (public/order/rakeen-order.js boot()) only ever selects this
-- exact column list — scope anon's grant down to match it.
revoke select on businesses from anon;
grant select (
  id, name, logo_url, online_menu_slug, online_ordering_enabled, online_theme_color,
  online_banner_url, online_offers_delivery, online_offers_pickup, online_delivery_fee,
  online_pickup_prep_minutes, vat_rate, prices_include_vat, vat_registered
) on businesses to anon;

-- pgcrypto's gen_salt('bf') with no rounds argument defaults to a low
-- iteration count (6) — cheap to brute-force even offline, and the PIN
-- itself is only 4 digits (10,000 possibilities). Raising the cost factor
-- doesn't fix the small keyspace, but it's a real defense-in-depth layer
-- now that the row-level leak above is closed (this was only exploitable
-- via that leak, since pos_manager_pin_hash was never otherwise exposed).
create or replace function set_pos_manager_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not has_permission('screen:settings') then
    raise exception 'not authorized';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid pin format';
  end if;
  update businesses set pos_manager_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12))
    where id = current_business_id();
end;
$$;
