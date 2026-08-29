-- The owner can't know the real HPlus share of their orders, so instead of a
-- free-typed percentage (false precision — "25%" implies more certainty than
-- anyone has), this is a pick from round scenario presets: 10/20/30/50/100%.
-- normalize any already-entered value (e.g. 25) to the nearest preset before
-- the constraint goes on, so this migration is safe to run more than once.
update delivery_platforms set platform_tier_surcharge_pct = 30 where platform_tier_surcharge_pct = 25;

alter table delivery_platforms drop constraint if exists delivery_platforms_platform_tier_surcharge_pct_check;
alter table delivery_platforms add constraint delivery_platforms_platform_tier_surcharge_pct_check
  check (platform_tier_surcharge_pct in (0, 10, 20, 30, 50, 100));
