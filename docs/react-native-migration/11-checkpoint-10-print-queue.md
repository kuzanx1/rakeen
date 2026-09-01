# Checkpoint 10 — Print Queue

## SCOPE (quoted, not invented)

Per `docs/react-native-migration/01-roadmap.md`, item 10:

> **Print Queue** — same concept/behavior as today: persistence, retry,
> exponential backoff, max attempts, manual retry, duplicate protection,
> recovery after restart, print state machine.

Investigated the actual PWA implementation (`public/pos/rakeen-pos.js`)
before writing anything, per this session's established discipline —
full findings below informed every design decision; nothing here was
guessed at.

## WHAT CHANGED

- `domain/printQueue.ts` (new) — pure state machine ported from the real
  `processPrintQueue`: `queued -> printing -> {printed,
  skipped_no_printer, retrying, failed}`. Own independent constants,
  confirmed distinct from the order queue's: `PRINT_MAX_RETRIES=5` (vs.
  order queue's 10), `PRINT_MAX_BACKOFF_MS=2min` (vs. 5min), backoff
  base 2s doubling (vs. base 1s) — two genuinely separate retry regimes,
  ported as two separate implementations, not merged for tidiness.
  `PRINT_DEDUPE_WINDOW_MS=10000`, `PRINT_POLL_INTERVAL_MS=20000` (vs.
  the order queue's 30000). `processPrintQueue()` carries the same "one
  job's failure never blocks the rest" property as
  `domain/orderQueue.ts`'s `syncQueuedOrders`. **Real, deliberate
  difference from the order queue**: printing is not financial data, so
  a job that exhausts `PRINT_MAX_RETRIES` reaches a genuine terminal
  `failed` state (dismissable via manual retry) — orders, by contrast,
  never give up (pinned to `next_retry_at = Infinity`, stays queued
  forever). This mirrors the PWA's own explicit design distinction, not
  a simplification.
- `domain/receipt.ts` (new) — minimal ASCII ESC/POS byte builders for
  `receipt`/`kitchen` job data. **Deliberately not real Arabic/QR/logo
  rendering** — Checkpoint 1's own audit
  (`docs/react-native-poc/phase1-audit.md`) already identified that as a
  separate, unsolved problem (no DOM/Canvas in React Native; needs
  `react-native-skia` or equivalent). Mirrors the PWA's own architecture
  though: the queue stores rendering *data*, bytes are built fresh at
  every dispatch attempt (never persisted as bytes) — so a real renderer
  can replace only this file later without touching the queue at all.
  Non-ASCII characters (any real Arabic product name) print as `?` —
  disclosed, not silently wrong.
- `infrastructure/sqliteDb.ts` (new) — shared `op-sqlite` connection,
  factored out of `sqliteOrderQueue.ts` specifically so the print queue
  adds a second table to the SAME database file instead of opening a
  second one for no reason. `sqliteOrderQueue.ts`'s own table/behavior
  is otherwise unchanged — confirmed via `tsc` and by re-reading the
  diff line by line.
- `infrastructure/sqlitePrintQueue.ts` (new) — real SQLite-backed
  `PrintQueueStorage`, plus `resetInterruptedPrintJobsOnBoot()`, ported
  from the PWA's own `resetInterruptedPrintJobsOnBoot()` IIFE: any job
  stuck mid-flight in `'printing'` when the app was killed is reset to
  `'queued'` on next boot.
- `application/printService.ts` (new) — `enqueuePrintJob()` (queue-first:
  persists before any print attempt; short in-memory content-key dedupe
  matching the PWA's own double-tap debounce, including its
  "check-and-set before any `await`" race-closing detail),
  `processPrintQueueNow()` (same overlapping-run guard shape as
  `orderService.ts`'s `syncQueuedOrdersNow`), `retryPrintJob()` /
  `retryAllFailedPrintJobs()` (manual retry — one of this checkpoint's
  explicitly named required capabilities, not deferred). Dispatches
  through the already-verified `platform/printer.ts` contract
  (Checkpoint 1) — printing itself is not reimplemented.
- `application/printQueueScheduler.ts` (new) — NetInfo reconnect + 20s
  interval, ported from the PWA's `window.addEventListener('online',
  processPrintQueue)` + `setInterval(processPrintQueue, 20000)`, reusing
  Checkpoint 9's `domain/sync.ts` predicate (the "should this fire on a
  reconnect" decision is identical for both queues; only the poll
  cadence differs).
- `App.tsx` — resets interrupted jobs and starts the print-queue
  auto-process loop on login, stops on logout (same reasoning as
  Checkpoint 9's order-sync scheduler: `has_permission()` needs a valid
  session). Adds a minimal `PrintQueueScreen` nav entry.
- `ui/PrintQueueScreen.tsx` (new) — the real manual-retry surface this
  checkpoint's scope explicitly requires: lists jobs with status
  badges, per-job retry for `failed` jobs, and a "retry all failed"
  bulk action. Deliberately minimal, not a full Diagnostics screen
  (that's Checkpoint 13).
- `ui/ProductsScreen.tsx` — real enqueue points, the actual thing that
  makes this checkpoint's queue reachable instead of unused code:
  - Kitchen ticket on dine-in registration (full real line items — the
    cart isn't cleared yet at that point).
  - Receipt on pickup/delivery/regular payment (full real line items,
    enqueued whether the payment synced immediately or is
    `PAYMENT_SYNC_PENDING` — printing never waits on cloud confirmation,
    matching "LAN printer independent of Internet").
  - Receipt on dine-in payment: **minimal content** — order id + the
    server-confirmed total only, no line items. The cart is already
    empty by settle time (cleared at registration); fetching real
    `order_items` here would need an extra join this checkpoint's own
    scope (the queue mechanism, not receipt-data fidelity) doesn't
    require. A disclosed, narrower gap for this one path, not a mocked
    receipt.
  - No per-device print-toggle exists yet in `DeviceConfig` (the PWA
    gates kitchen-ticket printing on `DEVICE.printKitchenTicket`) — this
    checkpoint's kitchen-ticket enqueue is unconditional. Disclosed, not
    silently assumed always-on.

## WHAT WAS ACTUALLY TESTED

1. **Pure logic** (`domain/printQueue.ts`, `domain/receipt.ts`) — 28
   assertions via `npx tsx`, real files imported directly, temporary
   script deleted immediately after (confirmed via `git status`).
2. A genuine, first-hand attempt to import `application/printService.ts`
   under Node/tsx — confirmed to fail for the exact same reason already
   disclosed in Checkpoints 5 and 9 (`op-sqlite`'s Node build needs
   `better-sqlite3`, not installed). Not a new limitation, re-confirmed
   for this specific file.
3. `npx tsc --noEmit` across the whole project, including the
   `sqliteOrderQueue.ts` refactor — clean.
4. Real CI on both platforms — pending at time of writing.
5. **Real Supabase backend**: not applicable to this checkpoint's own
   new code. The print queue never talks to Supabase at all (it reads
   `printerConfig.ts`'s local MMKV-stored target and calls the local
   printer bridge) — there is nothing new to verify against the live
   database here. The enqueue calls added to `ProductsScreen.tsx` are
   fire-and-forget (`enqueuePrintJob(...).catch(() => {})`) placed after
   the existing, already-verified RPC calls succeed — they don't alter
   those calls' payloads, control flow, or error handling in any way, so
   re-running the Checkpoint 5–9 backend test suites would be redundant,
   not a genuine new check.

## PASSED

**Pure logic (28/28 assertions)**:
```
Constants match the real PWA values, confirmed distinct from the order
  queue's (PRINT_MAX_RETRIES=5, PRINT_MAX_BACKOFF_MS=2min, base-2s
  backoff formula, correct values at retry 0/1/cap)
Dedupe: identical data -> identical content key; different data/type ->
  different key
isDueForPrintRetry: correct at/before/after the due boundary
State machine: success -> printed; PRINTER_UNAVAILABLE ->
  skipped_no_printer (non-error terminal); a real connection failure ->
  retrying with the correct backoff; retry_count reaching
  PRINT_MAX_RETRIES -> failed (terminal, unlike the order queue)
Manual retry resets a job to a clean queued state
processPrintQueue: a failing job never blocks a good one (twice proven
  -- once alongside it, once with a THIRD job enqueued after the first
  reached its terminal failed state); a job is correctly driven all the
  way to terminal failed across PRINT_MAX_RETRIES real passes
Receipt/kitchen-ticket builders return non-empty strings and never
  throw on Arabic input (they degrade to '?' per character, disclosed,
  not a crash)
```

CI: **pending at the time of writing** — will be updated here once
confirmed, not assumed.

## FAILED

- Importing `application/printService.ts` under Node/tsx failed with
  the same confirmed `Cannot find module 'better-sqlite3'` error
  already documented for `sqliteOrderQueue.ts` in Checkpoint 5 and
  re-confirmed for `orderService.ts` in Checkpoint 9 — not a new
  problem, the same disclosed environment limitation extending to this
  checkpoint's own new file for the identical reason (it imports the
  same `op-sqlite` dependency, now via the shared `sqliteDb.ts`).

## FIXED

Nothing needed fixing — no bugs found in the new code, and the
`sqliteOrderQueue.ts` refactor (extracting the shared connection) was
verified via `tsc` and a direct diff review to change nothing about its
existing behavior.

## REMAINS (honest gaps, not glossed over)

- **CI result** — pending, to be appended once the run completes.
- **Real on-device print queue behavior is entirely unverified** — same
  category as every SQLite/native-module checkpoint since Checkpoint 5:
  does a job survive a real app kill mid-print, does the boot-time
  interrupted-job reset actually run before the scheduler's first pass
  on a real device, does the 20s interval/reconnect trigger fire
  reliably. Needs a real iOS/Android runtime.
- **Real Arabic/QR/logo receipt rendering does not exist** — disclosed
  extensively above; this checkpoint's own scope is the queue mechanism,
  not rendering. Never claim receipt *content* correctness against real
  hardware.
- **No per-device print-configuration toggles** (`printKitchenTicket`,
  `printCustomerReceipt`, separate kitchen printer IP) exist in
  `DeviceConfig` yet — kitchen tickets print unconditionally. A real,
  disclosed gap, not a silent behavior change from some assumed default.
- **Dine-in payment receipts carry no line items** — disclosed above,
  a narrower-content path specific to that one flow, not a queue defect.
- **No PrinterProfile/Settings UI** exists yet to actually populate a
  real printer target (`infrastructure/printerConfig.ts` still returns
  `{host: null, port: null}` until Checkpoint 11) — every real print
  attempt today will honestly resolve to `skipped_no_printer`, which is
  itself a correct, non-fake outcome for "no printer configured," not a
  bug.

## NEEDS HARDWARE

Everything in REMAINS above requiring a real device/runtime, plus (once
Checkpoint 11 provides a real configured target) actual physical
printing of a real job pulled from this queue. **The cash drawer, LAN
printer reachability, and physical print output remain completely
unverified on real hardware and must not be claimed as working.**

**Status: 🟡 Ready for Testing** — the print queue mechanism (state
machine, backoff, dedupe, manual retry, boot recovery, no
head-of-line-blocking) is verified in isolation with real pure-logic
assertions and wired to real enqueue points in the actual POS flow; CI
result pending / 🔴 Needs Hardware for actual on-device persistence,
real printer dispatch, and physical output. Do not advance to
Checkpoint 11 until CI is confirmed green.
