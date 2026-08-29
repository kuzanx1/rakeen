-- Branch operating hours: nullable by design. Absence means "no pickup time
-- picker, ASAP only" on the online order page — never fabricate a closing
-- time for a branch that hasn't set one.
alter table branches add column opening_time time;
alter table branches add column closing_time time;

-- Owner-tunable prep-time default for online pickup orders, same pattern as
-- businesses.kitchen_auto_ready_minutes.
alter table businesses add column online_pickup_prep_minutes int not null default 20;

-- Real pre-existing gap: branches has RLS policies for select and insert
-- only — no update policy has ever existed, so the dashboard's branch
-- address/lat/lng save (a plain client-side .update()) has had no RLS path
-- to succeed. Fixing it here since the new opening/closing-time fields need
-- the same save path to actually work.
create policy branches_update on branches for update
  using (business_id = current_business_id() and exists (select 1 from profiles where id = auth.uid() and user_type = 'owner'))
  with check (business_id = current_business_id() and exists (select 1 from profiles where id = auth.uid() and user_type = 'owner'));
