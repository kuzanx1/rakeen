-- One real cashier device kept failing to render product photos in the "الكل"
-- tab specifically (every other diagnosis — CSS, thumbnails, network,
-- caching, service worker — checked out fine; root cause never confirmed).
-- Rather than keep chasing a device-specific rendering issue, give every
-- business a simple opt-out: skip photos entirely and show the plain
-- category icon instead, which is both guaranteed to render and faster to
-- paint. Defaults to true (per owner's explicit request) so this ships
-- already fixed for everyone, not just as an opt-in.
alter table businesses add column pos_hide_product_images boolean not null default true;
