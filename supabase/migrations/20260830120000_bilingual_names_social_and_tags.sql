-- Bilingual product names — English (if the merchant fills it in) shown
-- stacked above the Arabic name on the online storefront. Null is fine:
-- falls back to Arabic-only exactly like today.
alter table menu_items add column if not exists name_en text;

-- "وسم" — an online-storefront-only merchandising badge (New / Featured /
-- Best Seller / Seasonal), never shown on the POS side. Free label text
-- (not an enum) so it stays translatable/renameable without a migration;
-- the dashboard only ever offers the 4 presets, this just doesn't enforce
-- it at the DB level. Color is merchant-chosen per item, defaults applied
-- client-side when null (see rakeen-order.js).
alter table menu_items add column if not exists online_tag_label text;
alter table menu_items add column if not exists online_tag_color text;

-- Social links — icons on the storefront. WhatsApp reuses the existing
-- online_contact_whatsapp number (already collected for order-tracking)
-- rather than duplicating it.
alter table businesses add column if not exists online_social_instagram text;
alter table businesses add column if not exists online_social_tiktok text;
alter table businesses add column if not exists online_social_twitter text;

grant select (online_social_instagram, online_social_tiktok, online_social_twitter) on businesses to anon;
