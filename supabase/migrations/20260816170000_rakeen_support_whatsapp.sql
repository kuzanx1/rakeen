-- Correcting course: the previous round built a per-restaurant customer-
-- facing ordering bot (each restaurant owning its own WhatsApp number). That
-- was the wrong shape — the actual feature is Rakeen's OWN single WhatsApp
-- number, used by registered restaurant owners as a lightweight WhatsApp
-- control panel (today's sales/orders/inventory, no AI — straight DB
-- lookups) plus a support/lead channel for anyone else who messages in.
-- Renaming rather than dropping-and-recreating keeps the already-verified,
-- already-configured webhook pointed at the same table shape with no Meta-
-- side reconfiguration needed.
alter table whatsapp_conversations rename to rakeen_support_conversations;
alter table whatsapp_messages rename to rakeen_support_messages;

-- A prospect (someone who messages in but isn't a linked, registered
-- restaurant owner) has no business at all — business_id now describes an
-- attribute of the conversation, not its identity. If a prospect later
-- signs up and links their WhatsApp, this same conversation row just gets
-- business_id filled in rather than starting a new thread.
alter table rakeen_support_conversations alter column business_id drop not null;
alter table rakeen_support_messages alter column business_id drop not null;

-- One conversation per phone number, full stop — whether or not it's tied
-- to a business. The old (business_id, customer_phone) uniqueness doesn't
-- even work for prospects (NULL business_id rows never conflict with each
-- other in Postgres uniqueness), which would have let one phone number
-- spawn a fresh thread every time it messaged in as a prospect.
alter table rakeen_support_conversations drop constraint if exists whatsapp_conversations_business_id_customer_phone_key;
alter table rakeen_support_conversations add constraint rakeen_support_conversations_customer_phone_key unique (customer_phone);

-- This data was never dashboard-visible per-tenant to begin with under the
-- corrected model — it's Rakeen's own support desk, seen only via the
-- platform-admin panel (isAdminEmail-gated API routes using the service-role
-- client, same pattern as /api/admin/businesses). Dropping the per-tenant
-- policies leaves RLS enabled with zero policies, which denies all access
-- through the anon/authenticated roles by default; only the service role
-- (which bypasses RLS entirely) can read or write these tables now.
drop policy if exists whatsapp_conversations_tenant_isolation on rakeen_support_conversations;
drop policy if exists whatsapp_messages_tenant_isolation on rakeen_support_messages;

-- ===== businesses: WhatsApp control-panel linking =====
-- An owner links their own WhatsApp number in Settings, we text them a
-- one-time code to prove they actually hold that number, and only once
-- verified does the webhook start recognizing that number as "this is
-- <business>'s owner" rather than an unrecognized prospect.
alter table businesses add column whatsapp_link_phone text;
alter table businesses add column whatsapp_link_verified boolean not null default false;
alter table businesses add column whatsapp_link_otp text;
alter table businesses add column whatsapp_link_otp_expires_at timestamptz;
