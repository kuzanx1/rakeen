-- Admin-controlled inventory module toggle — same pattern as
-- kitchen_display_enabled (20260810140000): a package-tier entitlement the
-- restaurant owner never self-toggles, only Rakeen. Defaults to true (unlike
-- kitchen_display_enabled's false) because inventory/costing is core to
-- every existing business already using it — this only matters going
-- forward if admin ever needs to withhold it for a lower-tier package.
alter table businesses add column inventory_enabled boolean not null default true;
