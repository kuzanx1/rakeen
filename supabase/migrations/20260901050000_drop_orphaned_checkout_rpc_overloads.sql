-- Real production defect found while live-testing the customer/loyalty
-- fixes (Feature Parity Pass), NOT caused by anything from this session --
-- confirmed to predate it, and confirmed to be systemic across all three
-- checkout RPCs, not just one. `create or replace function` only replaces
-- a function with the EXACT SAME parameter signature; it does NOT drop an
-- old version when the parameter list changes.
-- 20260829200000_fix_pos_checkout_points_and_customer_id.sql appended
-- p_customer_id to complete_pos_order, register_dine_in_order, AND
-- pay_dine_in_order in the same migration, via create-or-replace on all
-- three -- silently leaving the PREVIOUS (pre-p_customer_id) signature of
-- each one orphaned in the database ever since.
--
-- Confirmed live via PostgREST against a real, isolated test business
-- (created through the app's own public signup route, zero real customer
-- data touched): calling any of the three with their "core" parameter set
-- (omitting p_customer_id) fails outright with PGRST203 "Could not choose
-- the best candidate function" for ALL THREE RPCs -- not a fluke on one
-- function, the same rewrite pattern hit all three identically.
--
-- This is LATENT, not an active outage: every real caller (the PWA's
-- sendOrderToServer/sendDineInRegisterToServer/sendDineInPayToServer,
-- rakeen-pos.js, and React Native's equivalents in
-- application/orderService.ts) always includes p_customer_id explicitly
-- in every RPC call (even as null), which resolves unambiguously to each
-- function's current signature -- confirmed by reading every real call
-- site, not assumed. Nothing today is broken by this. It's real technical
-- debt that would break the very next caller (a script, a future client,
-- anything) that omits the parameter, exactly the way this session's own
-- live-test calls did before being corrected to match the real client
-- pattern.
--
-- Fix: drop ONLY the three orphaned, superseded overloads by their own
-- exact signatures. Does not touch any current, correct function version
-- at all -- none of the three real, in-use functions are redefined by
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
