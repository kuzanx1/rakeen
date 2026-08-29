-- Lets an owner turn the whole loyalty system off. When disabled, the POS
-- hides the customer/loyalty UI entirely (not greyed out — gone), since some
-- restaurants genuinely don't want to run a loyalty program.
alter table businesses add column if not exists loyalty_enabled boolean not null default true;
