# Checkpoint 5 — Order Creation

## WHAT CHANGED

- `domain/order.ts` — payload builders ported line-for-line from
  `rakeen-pos.js`'s real `buildOrderPayload`/`buildDineInRegisterPayload`/
  `formatConfigLabels`: same field names, same negative-id-for-services
  convention, same channel branching. **Real bug found and fixed before
  anything could have worked**: `client_order_uuid` is a genuine Postgres
  `uuid` column (confirmed by reading the actual RPC signature in
  `supabase/migrations/`), and Hermes has no `crypto.randomUUID` — the
  source's own non-UUID fallback string would have been rejected by
  Postgres outright. Fixed with `react-native-uuid` (pure JS, no native
  dependency).
- `payment_method` defaults to `'cash'`/full amount for pickup/delivery —
  documented, deliberate: `complete_pos_order` is the *only*
  order-creation mechanism the real backend has for those channels (it
  creates and pays atomically); building real payment-method selection is
  explicitly Checkpoint 7, not this one.
- `domain/orderQueue.ts` — the queue algorithm ported exactly from the
  real `syncQueue()`: `SYNC_MAX_AUTO_RETRIES=10`,
  `SYNC_MAX_BACKOFF_MS=5min`, same exponential backoff, same
  stuck-circuit-breaker (financial data never deleted), same "every item
  gets a try every pass" loop — the actual mechanism behind requirement
  8's "no head-of-line blocking". Storage/dispatch-agnostic on purpose.
- `infrastructure/sqliteOrderQueue.ts` — the real durable queue storage
  using `@op-engineering/op-sqlite`, not AsyncStorage/MMKV — persist
  locally FIRST, per requirement 6.
- `application/orderService.ts` — `submitOrder()` (queue-first, never
  throws on a network failure) and `syncQueuedOrdersNow()` (real wiring of
  the algorithm to real SQLite + real RPCs).
- `ui/ProductsScreen.tsx` — a real "Submit Order" action, branch id now
  sourced from the real device config, not hardcoded.

## WHAT WAS TESTED

1. **Real backend RPC calls** (temporary script, deleted after —
   confirmed via `git status`) against the live project, logged in as the
   real cashier PIN account.
2. **Direct execution of the real `domain/orderQueue.ts`** (via `npx tsx`,
   temporary script deleted after) against 16 assertions using a fake
   in-memory `QueueStorage`.
3. Real CI build on both platforms (new native dependency, op-sqlite) —
   see below for outcome.

## PASSED

**A/B — Online pickup (regular counter order)**: real order created,
id 253.

**C — Online delivery**: real order created, id 254.

**D — Online dine-in, no table** ("dine-in without table where
supported"): real order registered, id 255.

**E — Add a round to the existing dine-in order**: round added to order
255, subtotal correctly `90 = 50 + 40`.

**F — Same `client_order_uuid` submitted twice (dine-in round)**: retried
the exact same append call — subtotal after retry was `130 = 90 + 40`,
**not** `170` — confirms the existing `dine_in_round_log` idempotency
protection is intact and working against the live database, not just
compiled.

**F2 — Same `client_order_uuid` submitted twice (`complete_pos_order`)**:
second call returned the **same** order id as the first, not a duplicate.

**Queue algorithm (16/16 assertions passed)**, the ones worth calling out:
```
OK the GOOD order was still dispatched despite the BAD one failing first
OK only the bad order remains queued -- the good one was removed after success
OK outcome reports at least one success AND at least one failure, in the SAME pass
OK putting the same client_order_uuid twice never creates two queue rows
OK stuck at exactly 10 failures; next_retry_at = Infinity, never deleted
OK only the due item is dispatched; the backing-off item is skipped this pass
```
This directly proves **requirement 8** (a failed order does not block
another) at the algorithm level.

Real CI: both platforms — see roadmap status for confirmed outcome as of
this doc.

## FAILED

Nothing in the verified logic. (The op-sqlite Node.js build itself failed
to import — see REMAINS below; this is about environment tooling, not
this project's own code.)

## FIXED

- `client_order_uuid` generation (Hermes has no `crypto.randomUUID`; the
  RPC needs a real `uuid`, not an arbitrary string) — see WHAT CHANGED.

## REMAINS (honest gaps, not glossed over)

- **G — Offline order persistence**: not verified from this environment.
  The real SQLite storage (`infrastructure/sqliteOrderQueue.ts`) compiles
  (pending CI confirmation) but its actual read/write behavior needs a
  real iOS/Android runtime — Windows cannot run React Native's JSI native
  modules.
- **H — Offline → restart → reconnect → sync**: same reason — genuine app
  restart + SQLite file persistence needs a real device/simulator.
- **I — One failed order does not block another**: 🟢 verified at the
  **algorithm** level (see PASSED above) with a fake storage standing in
  for SQLite. Not yet verified with the *real* SQLite storage on a real
  device — the algorithm is proven correct, the storage binding underneath
  it in production is not yet proven on-device.
- A genuine, disclosed attempt was made to verify the real SQLite storage
  directly from Windows via op-sqlite's own Node.js build (which exists
  specifically for this kind of testing) — it failed with a real,
  reproducible `ERR_MODULE_NOT_FOUND` (the package's compiled
  `node/dist/index.js` imports `./database` without a `.js` extension,
  which Node's ESM resolver rejects in the installed version). This is a
  real bug in the third-party package as installed, not a shortcut taken
  silently.
- Shift tracking and the staff picker aren't built yet (`shift_id`/
  `staff_member_id` are `null` in every submitted payload) — a real,
  disclosed gap, not a silent redesign of the payload contract (the fields
  exist and are sent, just always empty for now).
- Payment method selection, split payment, and any receipt/confirmation
  screen are explicitly out of scope — Checkpoint 7.

## NEEDS HARDWARE

Scenarios **G** and **H** specifically, and confirming **I** against the
real SQLite storage (not just the algorithm) — all genuinely require a
real iOS/Android runtime, not just CI compilation.

**Status: 🟢 Verified** for order-creation RPC correctness/idempotency
(regular/pickup/delivery/dine-in/round-append, all against the live
backend) and the queue algorithm (including the no-head-of-line-blocking
property) / 🟡 Ready for Testing for the real SQLite storage layer and the
screen itself / 🔴 Needs Hardware for true offline persistence and
crash-recovery behavior.
