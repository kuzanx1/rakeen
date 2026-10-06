-- Per-contract dispute venue: Taif (Rakeen's home court, the default) or
-- the subscriber's own city. Chosen by the admin when issuing the offer and
-- written into the jurisdiction clause (lib/contracts.ts buildClauses).
alter table public.subscription_contracts
  add column if not exists jurisdiction text not null default 'taif'
  check (jurisdiction in ('taif', 'business_city'));
