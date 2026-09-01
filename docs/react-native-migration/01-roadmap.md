# React Native Migration — Checkpoints

Exact checkpoint list and order as directed. Do not advance to the next
checkpoint while the previous one is broken. Every checkpoint gets its own
status doc in this folder (`0N-<name>.md`) once started, classified
🟢 Verified / 🟡 Ready for Testing / 🔴 Needs Hardware — never "Works"
unless actually run and confirmed.

1. **React Native shell + architecture** — project structure, layering
   (UI → Application Logic → Domain Logic → Infrastructure → Native/
   Storage/Network), shared TypeScript contracts, Swift + Kotlin native
   modules wired in, both platforms building in CI.
2. **Authentication** — real Supabase auth (owner/manager session +
   cashier PIN), ported from `rakeen-pos.js`'s actual logic, decoupled
   from DOM.
3. **Products / Categories**
4. **Cart**
5. **Order creation**
6. **Dine-in / Tables**
7. **Payments**
8. **Offline Storage** — SQLite/MMKV foundation (validated against actual
   usage, not assumed from the POC's recommendation alone).
9. **Offline Queue + Sync** — retry/backoff/circuit-breaker/idempotency,
   ported design from the current `pending_orders` store.
10. **Print Queue** — same concept/behavior as today: persistence, retry,
    exponential backoff, max attempts, manual retry, duplicate protection,
    recovery after restart, print state machine.
11. **Network Printer** — `PrinterManager` → `PrinterTransport` →
    `NetworkPrinterTransport`, real ESC/POS bytes, port never assumed.
12. **Cash Drawer** — core requirement, not optional; idempotent per
    operation ID; honest error codes; no Internet/Cloud dependency.
13. **Diagnostics** — Internet vs. Cloud vs. LAN vs. Printer vs. Native
    Bridge, distinguished explicitly, not collapsed into one signal.
14. **iOS build** — full app, all prior checkpoints integrated, real
    `xcodebuild` success.
15. **Android build** — same, real Gradle success.
16. **Hardware Acceptance Test** — the 8-scenario test matrix in
    `docs/react-native-migration/23-hardware-acceptance-test.md`, on real
    iPad + Android device + real network printer + real cash drawer.

## Current status (updated as checkpoints progress)

- Checkpoint 1: 🟡 Ready for Testing — architecture/contracts revised for
  the drawer-idempotency/error-code/PrinterProfile requirements, real CI
  green on both platforms after the change. See `02-checkpoint-1-shell-architecture.md`.
- Checkpoint 2: 🟢 Verified (auth logic, against the live backend) /
  🟡 Ready for Testing (the screen itself, not yet run on a device). See
  `03-checkpoint-2-authentication.md`.
- Checkpoint 3: 🟢 Verified (catalog-loading logic, real data, real RLS,
  against the live backend) / 🟡 Ready for Testing (the screen itself,
  CI green on both platforms). See `04-checkpoint-3-products-categories.md`.
- Checkpoint 4: 🟢 Verified (cart/pricing math + modifier query shape,
  real execution, real backend) / 🟡 Ready for Testing (the screen
  itself, CI green on both platforms). See `05-checkpoint-4-cart.md`.
- Checkpoint 5: 🟢 Verified (order-creation RPC correctness/idempotency
  against the live backend across regular/pickup/delivery/dine-in/round-
  append; the queue algorithm including no-head-of-line-blocking) /
  🟡 Ready for Testing (real SQLite storage + screen, CI green on both
  platforms including real op-sqlite native compilation) / 🔴 Needs
  Hardware (true offline persistence + crash recovery). See
  `06-checkpoint-5-order-creation.md`.
- Checkpoint 6: 🟢 Verified (payment orchestration, state machine, and
  idempotency mechanics against the live backend — regular/pickup/
  delivery cash payment and dine-in payment on a real tableless order,
  including a real production RPC bug found, fixed, deployed, and
  re-verified with 14/14 assertions and no duplicate payment/order/
  drawer action) / 🟡 Ready for Testing (the screen itself, CI green on
  both platforms) / 🔴 Needs Hardware (drawer success path, offline
  persistence, crash recovery). See `07-checkpoint-6-payment.md`.
- Checkpoint 7 (Dine-in/Tables, executed under this name per the user's
  live "Continue to Checkpoint 7" directive — the roadmap's original
  numbering had this as Checkpoint 6, done here after Payment since the
  user's Checkpoint 6 directive front-loaded Payment): 🟢 Verified —
  table lifecycle logic verified in isolation (21/21 pure assertions,
  including a real bug caught before backend involvement) and against
  the live backend (36 assertions across two runs: full lifecycle, move,
  pay-after-move, and cancellation in both with-table variants and the
  tableless case). Found, fixed, deployed, and re-verified a second
  instance of Checkpoint 6's null-table_id RPC bug, this time in
  `cancel_dine_in_order`. Also disclosed a separate, pre-existing,
  NOT-yet-fixed idempotency gap: `cancel_dine_in_order` has no
  retry-rejection boundary at all (unrelated to this checkpoint's fix).
  See `08-checkpoint-7-dine-in-tables.md`. 🟡 Ready for Testing for the
  screen itself / 🔴 Needs Hardware for on-device behavior and real-time
  sync. Cleared to advance.
- Checkpoint 8 (Offline Storage): 🟡 Ready for Testing — MMKV added for
  the flat `kv_cache` analogs (device config, cashier profile cache,
  catalog offline snapshot, printer target), replacing AsyncStorage;
  `react-native-mmkv@3.3.3` chosen over 4.x to avoid an unnecessary
  second native-module system (Nitro Modules). The SQLite order-queue
  side (Checkpoint 5) was re-validated against Checkpoint 6/7's actual
  added usage and confirmed to still hold up with zero schema change.
  CI green on both platforms on the first attempt. 🔴 Needs Hardware for
  actual on-device MMKV read/write/persistence (confirmed impossible to
  run under Node — no Node-runnable entry point exists at all). See
  `09-checkpoint-8-offline-storage.md`. Cleared to advance.
- Checkpoint 9 (Offline Queue + Sync): 🟡 Ready for Testing — real
  auto-sync trigger (NetInfo reconnect + 30s interval, ported from the
  PWA's own mechanism) wiring the already-verified Checkpoint 5
  algorithm/storage that nothing previously called. 4/4 pure assertions
  + a new 10/10 real-backend integration test (the real algorithm
  driving real RPCs across simulated repeated trigger passes). CI green
  on both platforms on the first attempt. 🔴 Needs Hardware for
  on-device delivery/lifecycle behavior. See
  `10-checkpoint-9-offline-queue-sync.md`. Cleared to advance.
- Checkpoint 10 (Print Queue): 🟡 Ready for Testing — real state
  machine/backoff/dedupe/manual-retry (own independent constants from
  the order queue: 5 retries/2min cap/base-2s backoff vs. 10/5min/
  base-1s), 28/28 pure assertions, wired to real enqueue points
  (kitchen ticket on registration, receipt on payment). CI green on
  both platforms on the first attempt. 🔴 Needs Hardware for on-device
  persistence and physical print output. See
  `11-checkpoint-10-print-queue.md`. Cleared to advance.
- Checkpoints 11-16: not started.

**Permanent rule recorded this checkpoint**: the PWA/Web POS is not being
replaced — see `00-protection-and-rollback.md`'s new section.

See `00-protection-and-rollback.md` for the safety rules this roadmap
operates under, and `02-authentication.md` onward for per-checkpoint
detail as they're executed.
