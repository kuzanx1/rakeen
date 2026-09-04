-- Overnight QA finding: the dashboard's "معلومات المطعم" save button validates
-- vat_number is exactly 15 digits client-side (rakeen-dashboard.js
-- wireRestaurantSettings, ~line 7970) before calling
-- businesses.update(...) directly from the browser. RLS (businesses_update)
-- correctly restricts that update to the business's own owner, so this is
-- not a cross-tenant hole — but nothing stops that same owner from bypassing
-- the client check (devtools, a raw REST call) and silently writing a
-- malformed VAT number. Since vat_number feeds the ZATCA simplified-invoice
-- QR code on every printed receipt, a bad value breaks tax-compliant
-- invoicing for that business until someone notices. Belt-and-suspenders:
-- enforce the same 15-digit format at the DB layer.
do $$ begin
  alter table businesses add constraint businesses_vat_number_format
    check (vat_number is null or vat_number ~ '^\d{15}$');
exception when duplicate_object then null;
end $$;
