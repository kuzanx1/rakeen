# Checkpoint 9 — Offline Queue + Sync

## SCOPE (quoted, not invented)

Per `docs/react-native-migration/01-roadmap.md`, item 9:

> **Offline Queue + Sync** — retry/backoff/circuit-breaker/idempotency,
> ported design from the current `pending_orders` store.

**What already existed before this checkpoint**, confirmed by reading
the actual code: the retry/backoff/circuit-breaker/idempotency
*algorithm* (`domain/orderQueue.ts`) and the real durable storage
(`infrastructure/sqliteOrderQueue.ts`) were both built and verified in
Checkpoint 5 — 16/16 pure assertions, plus real RPC idempotency proven
in Checkpoints 5–7. **What was missing**: `application/orderService.ts`'s
`syncQueuedOrdersNow()` existed and worked, but nothing in the entire
app ever called it. Grepped for real: zero call sites outside its own
definition. A queued offline order would sit in SQLite indefinitely
until some future manual trigger existed — the "+ Sync" half of this
checkpoint's name was, concretely, not built yet. That is this
checkpoint's actual, evidence-based scope: wire the already-verified
algorithm to something that actually runs it.

## WHAT CHANGED

- `domain/sync.ts` (new) — `shouldTriggerSyncOnNetChange()` (pure:
  NetInfo's `isConnected` is a nullable boolean; only an explicit `true`
  should trigger a sync attempt) and `SYNC_POLL_INTERVAL_MS = 30000`.
  Kept in the domain layer, not alongside the wiring code, specifically
  because importing `@react-native-community/netinfo` transitively hits
  `react-native`'s own Flow-typed `index.js` — confirmed, not assumed,
  to be unparseable outside a real RN/Metro build (see FAILED below).
  Keeping this one genuinely pure predicate I/O-free is what makes it
  testable at all.
- `application/syncScheduler.ts` (new) — `startAutoSync()`, ported
  directly from the real PWA's own mechanism
  (`public/pos/rakeen-pos.js`): `window.addEventListener('online',
  syncQueue)` + `setInterval(syncQueue, 30000)`. Same two-trigger shape:
  an immediate call on start (flushes anything queued from a previous
  session without waiting for the first interval tick), a NetInfo
  connectivity-restored listener, and the 30s interval as a safety net
  for cases a reconnect event doesn't fire reliably. Does not duplicate
  `syncQueuedOrdersNow()`'s own overlapping-run guard (Checkpoint 5) —
  just decides *when* to call it.
- `App.tsx` — starts the auto-sync loop in a `useEffect` tied to the
  cashier session (`[cashier]`), stops it on logout. Gating on session
  state isn't just tidy: every RPC `dispatchQueuedPayload` calls checks
  `has_permission()` against `auth.uid()`, so syncing while logged out
  would just fail every single call.

**No new idempotency surface.** Auto-sync calls the exact same
`dispatchQueuedPayload()` path manual submission already uses — every
existing guarantee (`client_order_uuid` uniqueness, `dine_in_round_log`,
`payment_status='unpaid'` guards, `operation_id`-based drawer dedup)
applies completely unchanged. Auto-sync only ever retries the
network/cloud dispatch; it never re-attempts a cash-drawer kick (that
stays a point-of-sale-time action tied to the original payment attempt,
never something a background timer should replay after the fact — the
same reasoning already established in Checkpoint 6).

## WHAT WAS ACTUALLY TESTED

1. **Pure logic** (`domain/sync.ts`) — 4 assertions via `npx tsx`,
   importing the real file directly, temporary script deleted
   immediately after (confirmed via `git status`).
2. **Real backend integration** — a genuinely new angle, not a repeat of
   Checkpoint 5's test: the REAL `domain/orderQueue.ts` (imported
   directly, not duplicated) driving a REAL dispatch function against
   the live Supabase project, across THREE separate sequential calls to
   `syncQueuedOrders` simulating exactly what `startAutoSync()`'s
   repeated `trigger()` calls do at runtime (immediate-on-start, a
   too-soon reconnect, a later due retry) — Checkpoint 5's original test
   proved the algorithm with a *fake* dispatch; this proves the same
   algorithm against the *real* RPCs, called multiple times in sequence.
3. A genuine, first-hand attempt to import `application/orderService.ts`
   (and therefore the real `dispatchQueuedPayload`) directly under
   Node/tsx — see FAILED for the real, confirmed result and why the
   integration test above reimplements the RPC calls instead.
4. `npx tsc --noEmit` — clean.
5. Real CI on both platforms — no new native dependency this checkpoint
   (`@react-native-community/netinfo` was already a dependency, already
   proven compiling since it's used in `App.tsx`'s hardware tools
   screen).

## PASSED

**Pure logic (4/4 assertions)**:
```
isConnected: true triggers a sync attempt
isConnected: false does not trigger
isConnected: null (OS hasn't reported yet) does not trigger -- must not
  be treated as truthy connectivity
poll interval matches rakeen-pos.js's own setInterval(syncQueue, 30000)
```

**Real backend integration (10/10 assertions)**:
```
Pass 1 (simulates the immediate on-session-start trigger): a real
  pickup order (complete_pos_order) succeeds and is removed from the
  queue; a deliberately invalid order (branch_id=999999999) fails with
  a REAL Postgres foreign-key violation
  ("orders_branch_id_fkey") and remains queued -- not silently dropped
Pass 1: retry_count incremented to 1; next_retry_at set using the real
  computeBackoffMs(1) formula
Pass 2 (simulates a reconnect event firing before backoff elapses):
  correctly skipped -- nothing dispatched, retry_count unchanged,
  confirming it was truly skipped rather than attempted and coincidentally
  failing again
Pass 3 (simulates a LATER trigger after backoff elapses): retried
  against the real backend again, fails again (same permanent error),
  retry_count incremented to 2 -- confirmed across a SEPARATE
  syncQueuedOrders() call, not just within one call
```
This directly proves the exact new combination this checkpoint
introduces (the verified algorithm + real dispatch + realistic repeated
trigger cadence) actually holds up against the live backend, not just
in isolation with a fake dispatch.

CI: **pending at the time of writing** — will be updated here once
confirmed, not assumed.

## FAILED

- Directly importing `application/orderService.ts` under Node/tsx
  failed with two independent, real, confirmed errors: (1)
  `ReferenceError: window is not defined` inside
  `@react-native-async-storage/async-storage`'s web fallback path,
  triggered by `supabaseClient.ts`'s Supabase client trying to recover a
  persisted session on construction; (2) `Cannot find module
  'better-sqlite3'` from `@op-engineering/op-sqlite`'s own Node build
  (the exact same packaging gap already disclosed in Checkpoint 5,
  re-confirmed here independently). Neither is new — both are
  previously-documented environment limitations, now confirmed to also
  block importing the file that ties them together. This is why the
  real-backend integration test reimplements the RPC calls directly
  (same parameter names already verified against the actual deployed
  migrations) rather than importing `dispatchQueuedPayload` itself.
- Importing `application/syncScheduler.ts` directly under Node/tsx
  failed for a third, distinct reason:
  `esbuild ERROR: Unexpected "typeof"` in `react-native`'s own
  `index.js` (Flow syntax), pulled in transitively via
  `@react-native-community/netinfo`. This is what motivated moving the
  one genuinely pure piece of this checkpoint's logic into
  `domain/sync.ts`, which has zero such imports and tested cleanly.

## FIXED

Nothing needed fixing — no bugs found in the new wiring or the
already-verified queue/storage it's built on.

## REMAINS (honest gaps, not glossed over)

- **CI result** — pending, to be appended once the run completes.
- **Real on-device behavior of the auto-sync loop is entirely
  unverified** — does `NetInfo.addEventListener` actually fire reliably
  on a real reconnect on iOS/Android, does the interval keep running
  correctly through backgrounding/foregrounding, does the "immediate
  trigger on login" actually flush a real SQLite-queued order from a
  previous killed session — all of this needs a real device/runtime,
  the same category of gap as every native-module checkpoint since
  Checkpoint 1.
- No UI surfaces sync outcomes (a "syncing…" indicator, a persistent
  "N orders pending" banner, manual retry). Not part of this
  checkpoint's own scope (`retry/backoff/circuit-breaker/idempotency`
  wiring, not a Diagnostics screen — that's explicitly Checkpoint 13);
  disclosed rather than silently added or silently assumed necessary.

## NEEDS HARDWARE

Real on-device delivery of NetInfo events, interval survival through
app lifecycle transitions, and confirming a genuinely offline-queued
order (from a real killed app, real SQLite file) gets picked up and
synced on the next real launch — all require a real iOS/Android runtime,
none of which Windows can provide.

**Status: 🟡 Ready for Testing** — the missing sync trigger is now
real and wired, verified in isolation (pure predicate) and against the
live backend (algorithm + real RPCs, multiple realistic sequential
passes, no new idempotency surface) / CI result pending / 🔴 Needs
Hardware for actual on-device delivery and lifecycle behavior. Do not
advance to Checkpoint 10 until CI is confirmed green.
