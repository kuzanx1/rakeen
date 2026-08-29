-- Free WhatsApp reminders (see approved plan): no automated Business API
-- send (that's metered per-message since Meta's July 2025 pricing change,
-- and would land on Rakeen's own shared number's bill, not the business's —
-- same scaling-cost trap as the Supabase incident). Instead the POS shows a
-- staff-facing reminders list; tapping an entry opens a wa.me link from the
-- STAFF's own phone (zero-cost, ordinary WhatsApp, not the Business API).
-- These two flags just track which reminder was already handled per
-- reservation so it doesn't keep reappearing in the list once sent.
alter table table_reservations add column reminder_day_before_sent boolean not null default false;
alter table table_reservations add column reminder_hours_before_sent boolean not null default false;
