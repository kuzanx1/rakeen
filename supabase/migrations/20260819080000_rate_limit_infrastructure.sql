-- H3 (security hardening phase 2) — database-layer rate limiting for every
-- RPC granted to `anon`. These calls go straight from a customer's browser
-- to Supabase; they never touch Rakeen's own Cloudflare Worker, so a
-- Cloudflare-level rate limit rule (added separately for our own API
-- routes) provides ZERO protection here. This has to be enforced inside
-- Postgres itself.
--
-- Generic sliding-window counter, one row per (key, window). `key` is
-- built per-caller from whatever real identity is available to that RPC —
-- customer_phone for order/reservation submission (the same identifier
-- already used by the pre-existing 20-second dedup on submit_online_order),
-- the capability token itself for token-scoped reads, business+ip for the
-- WhatsApp OTP-linking match. See client_ip() below for what IP visibility
-- Supabase's PostgREST layer actually exposes to a security definer
-- function — probed live before trusting it anywhere.
create table rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);
-- Old windows accumulate forever otherwise; a cron-free cheap prune inside
-- the check function itself (below) keeps this from growing unbounded
-- without needing a separate scheduled job.
create index rate_limit_hits_window_idx on rate_limit_hits(window_start);

-- Atomic check-and-increment for one sliding window. Returns true = allowed,
-- false = over the limit. `p_window_seconds` is truncated to a fixed bucket
-- (not a true sliding window) — simple, race-safe under concurrent calls via
-- the primary key's own upsert conflict handling, and precise enough for
-- abuse prevention (worst case lets through slightly more than p_max right
-- at a bucket boundary, never fewer).
create or replace function check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into rate_limit_hits (key, window_start, count)
    values (p_key, v_bucket, 1)
    on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
    returning count into v_count;

  -- Opportunistic cleanup — cheap (indexed), runs on ~1% of calls so it
  -- doesn't add latency to every single request.
  if random() < 0.01 then
    delete from rate_limit_hits where window_start < now() - interval '1 hour';
  end if;

  return v_count <= p_max;
end;
$$;
-- Deliberately NOT granted to anon/authenticated directly — only called
-- from inside other security definer functions, which already run as the
-- function owner regardless of caller grants.

-- Probe: what does Supabase's PostgREST layer actually forward as the
-- caller's IP? Determines whether IP-based keying is viable at all here.
-- Kept (not dropped after use) since client_ip() below is real
-- infrastructure other RPCs call, not a throwaway.
create or replace function client_ip()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), ''),
    current_setting('request.headers', true)::json->>'cf-connecting-ip',
    'unknown'
  );
$$;
