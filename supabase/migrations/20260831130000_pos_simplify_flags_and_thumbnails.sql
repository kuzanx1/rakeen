-- Per-business POS UI simplification flags — additive, default false (no
-- behavior change for any existing business). A cafe like hbiah with no
-- barcode-scanning need, no hold-for-later workflow, and no interest in a
-- "most ordered" shortcut can turn these off without touching the shared
-- POS bundle's behavior for every other business (e.g. a retail shop that
-- relies on the search box doubling as a barcode-scanner input).
alter table businesses add column pos_hide_popular_tab boolean not null default false;
alter table businesses add column pos_hide_search boolean not null default false;
alter table businesses add column pos_hide_hold boolean not null default false;

-- POS-only product thumbnail — separate from the full-quality image_url so
-- shrinking what the cashier grid decodes never touches what the online
-- storefront/quickview/receipts show.
alter table menu_items add column image_thumb_url text;
