-- Online pickup orders promise the customer a ready-by time (scheduled_for —
-- either their own "later" choice or the ASAP estimate computed at checkout,
-- see pickupEarliestEstimate()/resolveScheduledFor() in rakeen-order.js).
-- Today nothing ever follows up on that promise automatically: ready_at only
-- ever gets set by a cashier tapping "جاهز" (mark_order_ready) or by the
-- auto_ready_pickup toggle firing at ACCEPT time (accept_online_order,
-- 20260829100000_auto_ready_per_channel.sql) — neither covers "the cashier
-- accepted the order but the promised time has since passed without anyone
-- marking it ready". This sweep closes that gap, called on a short interval
-- from a Cron Trigger (see app/api/cron/auto-ready-pickup/route.ts) exactly
-- like get_win_back_targets/generate_daily_reports below.
--
-- `ready_at is null` is the same idempotency guard mark_order_ready/
-- mark_delivery_order_ready already use — a cashier marking it ready first
-- is a no-op for this sweep, never a double-write or a clobber. Scoped to
-- source='online' + channel='pickup' + status='completed' (i.e. already
-- accepted — an order still sitting at status='pending' hasn't been
-- confirmed by the restaurant yet, so it has no business silently becoming
-- "ready for pickup" out from under them) + scheduled_for having elapsed.
-- orders.ready_at is on the supabase_realtime publication already
-- (20260810030000_kitchen_display_system.sql), so this UPDATE surfaces on
-- the POS/kitchen screens live via the same channel a manual mark_order_ready
-- would — no new realtime wiring needed.
create or replace function auto_ready_online_pickup_orders()
returns setof bigint
language sql
security definer
set search_path = public
as $$
  update orders
  set ready_at = now(),
      prep_duration_seconds = extract(epoch from (now() - orders.created_at))::int
  where source = 'online'
    and channel = 'pickup'
    and status = 'completed'
    and ready_at is null
    and scheduled_for is not null
    and scheduled_for <= now()
  returning id;
$$;

-- Internal-only, same reasoning/precedent as 20260829190000_lock_down_internal_only_rpcs.sql:
-- called exclusively from app/api/cron/auto-ready-pickup/route.ts via the
-- service-role key on a Cron Trigger. No current_business_id()/
-- has_permission() check inside it on purpose (it must run cross-tenant), so
-- it must never be reachable from anon/authenticated.
revoke execute on function auto_ready_online_pickup_orders() from public, anon, authenticated;
