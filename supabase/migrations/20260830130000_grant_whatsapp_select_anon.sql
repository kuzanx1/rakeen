-- online_contact_whatsapp had anon INSERT/UPDATE (for order-status write-back)
-- but never anon SELECT — the storefront's boot() query now also reads this
-- column (to render the WhatsApp icon), and Supabase/PostgREST rejects the
-- entire row fetch when any requested column lacks SELECT for the role, which
-- broke the whole online storefront the moment that column was added to the
-- select list. This grant just adds the missing SELECT permission.
grant select (online_contact_whatsapp) on businesses to anon;
