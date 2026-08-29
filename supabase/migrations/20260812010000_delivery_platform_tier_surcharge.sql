-- Some delivery platforms (e.g. HungerStation's "HPlus") make the merchant
-- absorb a flat extra amount on orders from their subscription-tier
-- customers, but per-order tier membership isn't visible to the merchant at
-- checkout time — there's no way to know which orders were HPlus as they
-- come in. So instead of tracking it per-order, the owner enters an
-- estimated share of their order volume that's likely HPlus and a flat
-- per-order amount; the reconciliation report can apply it as an expected
-- deduction (pct * order_count * amount) rather than pretending it's exact.
alter table delivery_platforms add column platform_tier_surcharge_enabled boolean not null default false;
alter table delivery_platforms add column platform_tier_surcharge_label text;
alter table delivery_platforms add column platform_tier_surcharge_pct numeric not null default 0 check (platform_tier_surcharge_pct >= 0 and platform_tier_surcharge_pct <= 100);
alter table delivery_platforms add column platform_tier_surcharge_amount numeric not null default 0 check (platform_tier_surcharge_amount >= 0);
alter table delivery_platforms add column platform_tier_surcharge_note text;
