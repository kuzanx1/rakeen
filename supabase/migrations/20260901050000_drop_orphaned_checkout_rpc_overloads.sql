-- Real production defect found while live-testing the customer/loyalty
-- fixes (Feature Parity Pass), NOT caused by anything from this session --
-- confirmed to predate it. `create or replace function` only replaces a
-- function with the EXACT SAME parameter signature; it does NOT drop an
-- old version when the parameter list changes. Most of this codebase's
-- own migration history gets this right (e.g.
-- 20260801172028_complete_pos_order_channel.sql properly drops the old
-- 13-param complete_pos_order when introducing the 17-param version;
-- submit_online_order and submit_public_reservation's entire multi-year
-- rewrite histories were checked and are correctly cleaned up at every
-- transition) -- these four are isolated lapses, not a systemic pattern,
-- confirmed by a full scan of every function whose parameter count ever
-- changed across this project's migration history.
--
-- 20260829200000_fix_pos_checkout_points_and_customer_id.sql appended
-- p_customer_id to complete_pos_order, register_dine_in_order, AND
-- pay_dine_in_order in the same migration via create-or-replace on all
-- three, with no matching drop for any of them.
-- 20260816150000_cancel_order_still_occupied.sql separately added
-- p_still_occupied to cancel_dine_in_order the same way, also with no
-- matching drop.
--
-- Confirmed live via PostgREST against a real, isolated test business
-- (created through the app's own public signup route, zero real customer
-- data touched): calling complete_pos_order/register_dine_in_order/
-- pay_dine_in_order with their "core" parameter set (omitting
-- p_customer_id) fails outright with PGRST203 "Could not choose the best
-- candidate function" for all three. cancel_dine_in_order's orphaned
-- 1-param overload was found by the same static signature-history scan,
-- not independently live-probed (its own live-probe would need omitting
-- p_still_occupied against a REAL unpaid order this session doesn't want
-- to create purely to prove a point already established three times over
-- on siblings from the exact same root cause) -- included with the same
-- confidence as the other three given the identical, confirmed pattern.
--
-- This is LATENT, not an active outage: every real caller (the PWA's
-- sendOrderToServer/sendDineInRegisterToServer/sendDineInPayToServer/
-- confirmCancelOrder, rakeen-pos.js, and React Native's equivalents in
-- application/orderService.ts and application/tableService.ts) always
-- includes p_customer_id/p_still_occupied explicitly in every RPC call
-- (even as null/false), which resolves unambiguously to each function's
-- current signature -- confirmed by reading every real call site, not
-- assumed. Nothing today is broken by this. It's real technical debt
-- that would break the very next caller (a script, a future client,
-- anything) that omits the parameter, exactly the way this session's own
-- live-test calls did before being corrected to match the real client
-- pattern.
--
-- Also checked and deliberately NOT included here: compute_line_cost
-- (bigint, numeric, jsonb) is similarly orphaned (3-param, superseded by
-- a 4-param version in 20260829140000_direct_cost_size_variant.sql with
-- no drop), but it is an INTERNAL helper only ever called with a full,
-- fixed 4-argument positional call from other PL/pgSQL function bodies
-- (never via PostgREST/REST with omittable named parameters) -- Postgres
-- resolves a 4-argument positional call to the 4-param overload
-- unambiguously regardless of the orphaned 3-param sibling's existence,
-- so this one is genuinely inert, not merely latent. Left alone to keep
-- this migration scoped to real, meaningful risk.
--
-- Fix: drop ONLY the four orphaned, superseded overloads by their own
-- exact signatures. Does not touch any current, correct function version
-- at all -- none of the four real, in-use functions are redefined by
-- this migration, only their dead siblings are removed.
drop function if exists complete_pos_order(
  p_client_order_uuid uuid,
  p_branch_id bigint,
  p_shift_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_discount_amount numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_amount numeric,
  p_items jsonb,
  p_channel text,
  p_delivery_platform_id bigint,
  p_table_id bigint,
  p_staff_member_id bigint,
  p_platform_invoice_last4 text
);

drop function if exists register_dine_in_order(
  p_client_order_uuid uuid,
  p_branch_id bigint,
  p_shift_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_items jsonb,
  p_table_id bigint,
  p_staff_member_id bigint,
  p_existing_order_id bigint
);

drop function if exists pay_dine_in_order(
  p_order_id bigint,
  p_payment_method text,
  p_cash_amount numeric,
  p_customer_name text,
  p_customer_phone text
);

drop function if exists cancel_dine_in_order(p_order_id bigint);
