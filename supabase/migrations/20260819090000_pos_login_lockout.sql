-- H5 (security hardening phase 2) — the POS cashier PIN is a 4-digit code
-- (10,000 combinations) checked via Supabase Auth's signInWithPassword,
-- called DIRECTLY from the browser (public/pos/rakeen-pos.js) before this
-- change — meaning it never touched Rakeen's own Cloudflare Worker, so no
-- edge rate limit could ever reach it, and there was no per-branch lockout
-- at all: unlimited PIN guesses forever, only whatever Supabase's own
-- account-wide auth rate limiting happened to allow.
--
-- This table backs a new server-side login route (app/api/pos/login) that
-- proxies the credential check instead of letting the browser call Supabase
-- Auth directly — see that route for the actual lockout logic. Service-role
-- only; no anon/authenticated policy is granted (matches the "RLS enabled,
-- zero policies" pattern for internal-only tables elsewhere in this schema)
-- since only that route (service role) ever touches it.
create table pos_login_attempts (
  branch_id bigint primary key references branches(id),
  failed_count int not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);
alter table pos_login_attempts enable row level security;
