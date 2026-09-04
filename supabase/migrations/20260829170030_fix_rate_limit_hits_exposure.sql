-- CRITICAL FIX: rate_limit_hits was created (20260819080000) with the
-- assumption that NOT granting check_rate_limit() to anon/authenticated was
-- enough protection. It wasn't: Supabase's default privileges on the public
-- schema auto-grant SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every new table
-- to anon and authenticated, and this table never had that revoked, nor did
-- it ever get RLS enabled (unlike every other table in this schema).
--
-- Impact verified live before this fix: `curl .../rest/v1/rate_limit_hits`
-- with only the public anon key returned 200 with full rows, including keys
-- like `loyalty_card_token:<uuid>` — the raw bearer capability token used by
-- get_loyalty_card()/get_pending_loyalty_request() to look up a real
-- customer's name, loyalty points, spend history and tier. Any anonymous
-- caller could scrape every live customer's loyalty token straight out of
-- this table. Anon/authenticated also had UPDATE/DELETE/TRUNCATE, so any
-- caller could zero out or wipe their own (or everyone's) rate-limit
-- counters, defeating every DB-layer rate limit in the system
-- (submit_online_order, submit_public_reservation, auth/signup, loyalty
-- lookups, WhatsApp OTP linking, etc.) at will.
--
-- Fix: revoke direct table privileges from anon/authenticated (the
-- check_rate_limit() SECURITY DEFINER function still works identically —
-- it runs as the function owner regardless of caller grants) and enable RLS
-- with zero policies as defense-in-depth, matching pos_login_attempts.

revoke all on public.rate_limit_hits from anon, authenticated;
alter table public.rate_limit_hits enable row level security;
