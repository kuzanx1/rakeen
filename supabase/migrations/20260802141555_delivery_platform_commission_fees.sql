-- Real per-platform commission/fee configuration, so a delivery order's true
-- net-to-restaurant (and what the platform owes for a given month) is a real
-- computed number instead of a guess.
alter table delivery_platforms add column commission_pct numeric not null default 0 check (commission_pct >= 0 and commission_pct <= 100);
alter table delivery_platforms add column fee_model text not null default 'flat' check (fee_model in ('flat','tiered'));
alter table delivery_platforms add column flat_fee numeric not null default 0 check (flat_fee >= 0);
-- optional: an assumed % of orders that end up costing the business via
-- platform compensation/chargebacks — purely an estimate the owner opts into,
-- deducted the same way commission/fees are.
alter table delivery_platforms add column compensation_pct numeric not null default 0 check (compensation_pct >= 0 and compensation_pct <= 100);
-- some platforms take their % of the VAT-inclusive order total, others of
-- the pre-VAT subtotal — this is which one to use when computing commission.
alter table delivery_platforms add column commission_base text not null default 'total' check (commission_base in ('total','subtotal'));

-- Tiered delivery fee support: e.g. "orders under 60 SAR: 9 SAR fee; 60+: 12
-- SAR". A tier's fee applies once its min_order_value is the highest one at
-- or below the order's total.
create table delivery_platform_fee_tiers (
  id bigint generated always as identity primary key,
  delivery_platform_id bigint not null references delivery_platforms(id) on delete cascade,
  min_order_value numeric not null check (min_order_value >= 0),
  fee numeric not null check (fee >= 0)
);
create index delivery_platform_fee_tiers_platform_idx on delivery_platform_fee_tiers(delivery_platform_id);

-- the accounting reconciliation report also needs to read platform config
drop policy delivery_platforms_select on delivery_platforms;
create policy delivery_platforms_select on delivery_platforms for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:menu') or has_permission('screen:accounting')));

alter table delivery_platform_fee_tiers enable row level security;
create policy delivery_platform_fee_tiers_select on delivery_platform_fee_tiers for select
  using (exists (select 1 from delivery_platforms p where p.id = delivery_platform_fee_tiers.delivery_platform_id and p.business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:menu') or has_permission('screen:accounting'))));
create policy delivery_platform_fee_tiers_write on delivery_platform_fee_tiers for insert
  with check (exists (select 1 from delivery_platforms p where p.id = delivery_platform_fee_tiers.delivery_platform_id and p.business_id = current_business_id() and has_permission('screen:menu')));
create policy delivery_platform_fee_tiers_update on delivery_platform_fee_tiers for update
  using (exists (select 1 from delivery_platforms p where p.id = delivery_platform_fee_tiers.delivery_platform_id and p.business_id = current_business_id() and has_permission('screen:menu')))
  with check (exists (select 1 from delivery_platforms p where p.id = delivery_platform_fee_tiers.delivery_platform_id and p.business_id = current_business_id() and has_permission('screen:menu')));
create policy delivery_platform_fee_tiers_delete on delivery_platform_fee_tiers for delete
  using (exists (select 1 from delivery_platforms p where p.id = delivery_platform_fee_tiers.delivery_platform_id and p.business_id = current_business_id() and has_permission('screen:menu')));
