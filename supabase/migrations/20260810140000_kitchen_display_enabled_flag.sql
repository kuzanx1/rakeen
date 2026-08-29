-- Whether this business's Kitchen Display System is actually in use — drives
-- whether the POS/cashier device subscribes to "order marked ready" alerts
-- from the kitchen. Deliberately NOT exposed anywhere in the owner-facing
-- dashboard: per the owner's explicit instruction, only Rakeen's own team
-- turns this on for a restaurant (set directly in the database), the same
-- way a subscription tier or feature flag would be — not a self-service
-- toggle. Defaults to false for every business.
alter table businesses add column kitchen_display_enabled boolean not null default false;
