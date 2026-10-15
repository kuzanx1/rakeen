-- Rakeen packages (أساس / عماد / صرح) + admin-only columns on businesses.
--
-- Run each numbered step on its own in the Supabase SQL editor (not as one
-- batch): businesses is read on every request, and one transaction holding
-- an exclusive lock on it deadlocked against live traffic before. If a step
-- fails with "canceling statement due to lock timeout", just run it again.
--
-- What this fixes and adds:
--
-- 1. A hole: the businesses_update RLS policy lets an owner update ANY
--    column of their own row, and nothing guarded the columns only Rakeen
--    should set. With one PostgREST call an owner could mark their own
--    signup verified (verification_status), unlock the online-store paywall
--    (online_subscribed, online_order_free_count/limit), extend their own
--    subscription, re-activate a suspended account (is_active), raise
--    branch_limit/included_seats, or turn on paid features
--    (kitchen_display_enabled, inventory_enabled). The trigger below puts
--    those columns back to their old value whenever the change comes from
--    an end user's session (current_user authenticated/anon). The admin API
--    (service_role) and SECURITY DEFINER functions such as
--    submit_online_order (current_user = function owner) are unaffected.
--
-- 2. Packages. plan_tier + feature_overrides decide which features a business
--    may use; allowed_features is the result, computed here and read by the
--    dashboard. NULL plan_tier = a business from before packages: everything
--    allowed, nothing changes for it.
--
-- 3. The ceiling: a switch the package doesn't allow can't be on, whoever
--    sets it (the owner's own Settings toggles included). The POS and the
--    app already obey these switches, so they need no change.
--
-- The plan -> features matrix lives in rk_plan_features() below AND in
-- lib/plans.ts. tools/accounting-checks/plans-matrix-sync.cjs fails if the
-- two drift.


-- ============================================================
-- Step 1: columns
-- ============================================================
set lock_timeout = '4s';
alter table businesses
  add column if not exists plan_tier text check (plan_tier in ('asas', 'emad', 'sarh')),
  add column if not exists feature_overrides jsonb not null default '{}'::jsonb,
  add column if not exists allowed_features text[];


-- ============================================================
-- Step 2: the plan matrix
-- ============================================================
create or replace function rk_plan_features(p_plan text)
returns text[]
language sql
immutable
as $fn$
  select case p_plan
    when 'asas' then array['pos','zatca_invoice','offline','shift_close']
    when 'emad' then array['pos','zatca_invoice','offline','shift_close',
                           'kds','inventory','purchases_scan','costing_profit','reports',
                           'loyalty','tables_reservations','team_permissions','delivery_apps']
    when 'sarh' then array['pos','zatca_invoice','offline','shift_close',
                           'kds','inventory','purchases_scan','costing_profit','reports',
                           'loyalty','tables_reservations','team_permissions','delivery_apps',
                           'online_store','booking_page','multi_branch']
  end;
$fn$;


-- ============================================================
-- Step 3: the guard trigger
-- ============================================================
create or replace function rk_businesses_guard()
returns trigger
language plpgsql
as $fn$
declare
  v_allowed text[];
  v_key text;
  v_val jsonb;
begin
  -- 1) admin-only columns: an end user's session can't change them
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.verification_status     := old.verification_status;
    new.is_active               := old.is_active;
    new.online_subscribed       := old.online_subscribed;
    new.online_order_free_limit := old.online_order_free_limit;
    new.online_order_free_count := old.online_order_free_count;
    new.subscription_expires_at := old.subscription_expires_at;
    new.branch_limit            := old.branch_limit;
    new.included_seats          := old.included_seats;
    new.kitchen_display_enabled := old.kitchen_display_enabled;
    new.inventory_enabled       := old.inventory_enabled;
    new.admin_notes             := old.admin_notes;
    new.plan_tier               := old.plan_tier;
    new.feature_overrides       := old.feature_overrides;
  end if;

  -- 2) allowed features = plan + the admin's overrides
  if new.plan_tier is null then
    new.allowed_features := null;
    return new;
  end if;

  v_allowed := rk_plan_features(new.plan_tier);
  for v_key, v_val in select key, value from jsonb_each(coalesce(new.feature_overrides, '{}'::jsonb)) loop
    if v_val = 'true'::jsonb and not (v_key = any(v_allowed)) then
      v_allowed := v_allowed || v_key;
    elsif v_val = 'false'::jsonb then
      v_allowed := array_remove(v_allowed, v_key);
    end if;
  end loop;
  new.allowed_features := v_allowed;

  -- 3) the ceiling
  if not ('kds' = any(v_allowed)) then new.kitchen_display_enabled := false; end if;
  if not ('inventory' = any(v_allowed)) then new.inventory_enabled := false; end if;
  if not ('loyalty' = any(v_allowed)) then new.loyalty_enabled := false; end if;
  if not ('online_store' = any(v_allowed)) then new.online_ordering_enabled := false; end if;
  if not ('booking_page' = any(v_allowed)) then new.online_booking_enabled := false; end if;
  if not ('tables_reservations' = any(v_allowed)) then new.tables_reservations_enabled := false; end if;

  return new;
end;
$fn$;

set lock_timeout = '4s';
drop trigger if exists rk_businesses_guard on businesses;
create trigger rk_businesses_guard
  before insert or update on businesses
  for each row execute function rk_businesses_guard();


-- ============================================================
-- Step 4: Hbiah (business 83) on the full package
-- ============================================================
-- صرح allows every feature, so none of its switches change.
set lock_timeout = '4s';
update businesses set plan_tier = 'sarh' where id = 83 and name like '%Hbiah%';


-- ============================================================
-- Check (read-only): run after step 3
-- ============================================================
-- Expect: plan_tier = sarh and a full allowed_features list for 83, NULL for
-- everyone else (legacy = everything allowed).
-- select id, name, plan_tier, allowed_features from businesses order by id;
