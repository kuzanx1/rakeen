-- CRITICAL security fixes found in overnight QA, same class as
-- 20260829180000 (delete_business_completely): every function below is a
-- SECURITY DEFINER RPC meant to be called ONLY from trusted server-side
-- code (a Next.js API route using the service-role key, or from inside
-- another Postgres function) — none of them have any internal
-- current_business_id()/has_permission() check, because none were ever
-- meant to be reachable from the browser. All five were nonetheless left
-- executable by `anon` and `authenticated` (Postgres's default grant to
-- PUBLIC on function creation), verified live via has_function_privilege()
-- during this QA pass:
--
--  * compute_line_cost(bigint, numeric, jsonb, numeric) — the 4-argument
--    overload added by 20260829140000_direct_cost_size_variant.sql.
--    20260829110000_real_cost_at_sale.sql had already revoked the original
--    3-argument signature for exactly this reason, but a Postgres function
--    overload is a distinct catalog object with its own default grants —
--    the later migration silently reopened the hole for any menu_item_id on
--    the platform. Returns a dish's real ingredient cost — direct
--    competitor/customer-facing food-cost disclosure for every business,
--    including the one real paying customer.
--  * increment_online_order_free_count(bigint) — takes a bare business_id
--    with no ownership check. Only called from
--    app/api/webhooks/geidea/route.ts via the service-role client. Exposed,
--    anyone (anon, no login needed) could spam another business's free-order
--    counter to force it into "subscription required" prematurely.
--  * get_win_back_targets() — only called from app/api/cron/win-back/route.ts
--    via service-role. Exposed, it returns every business's idle-customer
--    names and custom win-back message text platform-wide — a cross-tenant
--    customer PII leak, again reachable with no login.
--  * generate_daily_reports(date, timestamptz, timestamptz) — only called
--    from app/api/cron/daily-report/route.ts via service-role. Operates
--    across all businesses for a given date with no auth check; direct
--    client access serves no purpose and risks report corruption/duplication
--    if triggered outside the real cron schedule.
--  * check_rate_limit(text, integer, integer) — internal helper other
--    security-definer functions call with fixed, purpose-specific keys
--    (login lockout, anon RPC throttling). Direct client access lets an
--    attacker pre-inflate a guessed key's counter to lock out a real user
--    before they ever make their own request.
--
-- None of these needed to be reachable from anon/authenticated in the first
-- place — revoking matches the precedent already set for
-- encrypt_recipe_qty/decrypt_recipe_qty (20260827150000) and
-- delete_business_completely (20260829180000).
revoke execute on function compute_line_cost(bigint, numeric, jsonb, numeric) from public, anon, authenticated;
revoke execute on function increment_online_order_free_count(bigint) from public, anon, authenticated;
revoke execute on function get_win_back_targets() from public, anon, authenticated;
revoke execute on function generate_daily_reports(date, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function check_rate_limit(text, integer, integer) from public, anon, authenticated;
