-- Missed on the first pass: upsert-on-endpoint-conflict (re-enabling
-- notifications on the same device) needs an UPDATE policy too, not just INSERT.
create policy "owner push subs update own" on owner_push_subscriptions for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and business_id = current_business_id());
