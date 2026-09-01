# Checkpoint 8 — Offline Storage

## SCOPE (quoted, not invented)

Per `docs/react-native-migration/01-roadmap.md`, item 8:

> **Offline Storage** — SQLite/MMKV foundation (validated against actual
> usage, not assumed from the POC's recommendation alone).

The "POC's recommendation" this refers to is
`docs/react-native-poc/phase8-offline-storage.md`, which evaluated three
real stores the current PWA's IndexedDB implementation has
(`pending_orders`, `print_jobs`, `kv_cache`) and recommended: **SQLite
for the durable transactional queues** (`pending_orders`/`print_jobs`),
**MMKV for the flat key-value cache** (`kv_cache` — the offline POS
snapshot, cached shift/profile lookups). This checkpoint's job, per the
roadmap's own wording, is to *validate* that recommendation against what
has actually been built in Checkpoints 1–7, not to re-derive it from
scratch or invent new stores.

**What already existed before this checkpoint started**, confirmed by
reading the actual code:
- The `pending_orders` half of the recommendation was already built in
  Checkpoint 5 (`infrastructure/sqliteOrderQueue.ts`, real
  `@op-engineering/op-sqlite`) — this checkpoint's job for that half is
  to confirm it still holds up, not rebuild it.
- The `kv_cache` half was NOT yet addressed: `application/authService.ts`
  (device config, cashier profile cache), `application/catalogService.ts`
  (offline catalog snapshot), and `infrastructure/printerConfig.ts`
  (printer target) were all still using `@react-native-async-storage/
  async-storage` — exactly the flat, non-relational cache shape the
  phase8 evaluation calls out for MMKV instead.
- `print_jobs` (the print queue) is explicitly Checkpoint 10, not this
  one — not addressed here.

## WHAT CHANGED

- **Validated, not modified**: `infrastructure/sqliteOrderQueue.ts`
  (Checkpoint 5). Re-read against Checkpoints 6/7's real additions
  (`payment_state`/`drawer_state`/`operation_id` fields added to every
  queued payload in Checkpoint 6): the whole `QueuedPayload` is stored as
  one JSON blob in the `payload_json` column, so those new fields were
  captured automatically with zero schema change needed. The
  recommendation's core reasoning (real ACID transaction + `UNIQUE`
  constraint on `client_order_uuid`, matching the server's own
  idempotency mechanism) still holds. One honest observation, not a
  defect: the separate indexed columns (`retry_count`, `next_retry_at`,
  `stuck`) are written on every `put()` but never actually used in a SQL
  `WHERE` clause — `getAll()` unconditionally selects every row, and the
  actual due-for-retry filtering happens in JS
  (`domain/orderQueue.ts`'s `isDueForRetry()`), already verified correct
  in Checkpoint 5. This is fine at the current scale (dozens of queued
  items, not thousands) and is exactly what makes the "every item gets a
  try every pass, no head-of-line blocking" property simple to reason
  about — turning it into a real SQL `WHERE stuck=0 AND
  next_retry_at<=?` query is a legitimate *future* optimization if queue
  size ever became a real bottleneck, not a correctness gap today. Per
  rule 3 (don't redesign verified architecture without evidence), this
  was left as-is.
- `infrastructure/mmkvStorage.ts` (new) — real `MMKV`-backed store.
  Deliberately exposes the same async `getItem`/`setItem`/`removeItem`
  shape `AsyncStorage` had, so each call site's storage *engine* swaps
  with a minimal diff instead of a wider rewrite of already-verified
  Checkpoint 2/3 logic. Uses `react-native-mmkv@3.3.3` specifically —
  **not** the current 4.x line, which rewrote itself on top of Nitro
  Modules (a second native-module codegen system this project doesn't
  otherwise use anywhere). v3 is plain JSI/TurboModule code, consistent
  with how `RakeenPrinterModule`/`RakeenCashDrawerModule`/
  `RakeenDeviceModule` are already built — a deliberate, evidence-based
  choice to avoid adding an unnecessary second native-module system.
- `application/authService.ts`, `application/catalogService.ts`,
  `infrastructure/printerConfig.ts` — swapped `AsyncStorage` for the new
  MMKV wrapper for exactly the four real `kv_cache`-shaped stores:
  device config, cashier profile cache, catalog offline snapshot,
  printer target config.
- `infrastructure/supabaseClient.ts`'s own `AsyncStorage` adapter for the
  Supabase auth session is **deliberately left untouched** — that's
  Supabase's own documented required storage pattern for its JS client,
  unrelated to the `kv_cache` use case the phase8 evaluation was about,
  and changing it would touch already-verified Checkpoint 2 auth
  machinery without any evidence this checkpoint produced that it needs
  to change.

## WHAT WAS TESTED

1. `npx tsc --noEmit` across the whole project — clean.
2. A genuine, first-hand attempt to run `react-native-mmkv` directly
   under Node (the same pattern used for op-sqlite in Checkpoint 5) —
   see FAILED below for the real, confirmed result.
3. Real CI on both platforms (`macos-15`/Xcode 16.4, `ubuntu-latest`) —
   a NEW native dependency this checkpoint (react-native-mmkv), so this
   requires real native compilation, not just a JS install, exactly like
   op-sqlite did in Checkpoint 5.
4. Code-level re-validation of `sqliteOrderQueue.ts` against Checkpoint
   6/7's actual added usage (see WHAT CHANGED) — this is the literal
   "validated against actual usage" the checkpoint's own scope asks for.

## PASSED

- `tsc --noEmit`: clean across every changed file and every existing
  call site.
- `sqliteOrderQueue.ts`'s JSON-blob-per-row design correctly and
  transparently absorbed Checkpoint 6's new `PaymentTracking` fields
  with zero migration — confirmed by reading the actual `put()`/
  `getAll()` implementation against the actual `QueuedPayload` type as it
  exists today, not assumed from Checkpoint 5's original design intent.
- CI: **confirmed green on both platforms** (run 33473623307) —
  `android` in 12m40s, `ios` in 4m51s (`macos-15`/Xcode 16.4), on the
  FIRST attempt, including the "verify the native modules were actually
  compiled" safeguard step on both (checking the project's own
  RakeenPrinterModule/RakeenCashDrawerModule/RakeenDeviceModule classes —
  `react-native-mmkv` itself autolinks and isn't individually grepped for,
  same as every other third-party dependency; a green `pod install`/
  `gradle assembleDebug` is what proves ITS native code compiled and
  linked).

## FAILED

- Directly requiring `react-native-mmkv` under plain Node
  (`node -e "require('react-native-mmkv')"`) failed with a real,
  confirmed error: the package's entry point transitively imports
  `react-native`'s own `index.js`, which contains Flow type syntax
  (`import typeof * as ReactNativePublicAPI from './index.js.flow'`)
  that Node's own module loader cannot parse at all
  (`SyntaxError: Unexpected token 'typeof'`). Unlike op-sqlite in
  Checkpoint 5 (which at least has its own dedicated Node.js build
  target that failed with a packaging bug), `react-native-mmkv` has no
  Node-runnable entry point whatsoever — this is an architectural
  limitation of the library, not a bug in a specific version. A genuine
  attempt, not skipped or assumed.

## FIXED

Nothing needed fixing this checkpoint — no bugs found in the migrated
call sites or the validated queue code.

## REMAINS (honest gaps, not glossed over)

- **Real MMKV read/write behavior is entirely unverified from this
  environment** — confirmed impossible to run under Node (see FAILED),
  and Windows cannot run React Native's JSI native modules at all (same
  limitation that has applied to every native-module checkpoint since
  Checkpoint 1). The wrapper's logic is trivial (three one-line
  passthroughs to MMKV's own documented API) and the call sites it
  replaces were already verified in Checkpoints 2/3 against
  AsyncStorage's identical interface shape, but the ACTUAL native
  persistence — does a value written before an app kill survive
  restart, does it actually beat AsyncStorage's performance, does
  autolinking correctly resolve on a real device rather than just in
  CI's build step — needs real hardware.
- **The retry-columns-unused observation** on `sqliteOrderQueue.ts` (see
  WHAT CHANGED) is disclosed as a valid future optimization, not
  something this checkpoint changed or was asked to change.
- **`print_jobs`** (the print queue's own storage) is explicitly
  Checkpoint 10's scope, not this one — no print queue exists yet to
  validate.

## NEEDS HARDWARE

Real MMKV persistence/performance on a real device — see REMAINS.
Nothing about this checkpoint's changes affects the printer/drawer
bridge or Internet/LAN independence directly, so rules 4/5 (Cash Drawer
core requirement, LAN independence) are unaffected by this checkpoint.

**Status: 🟡 Ready for Testing** — the storage-engine swap compiles
cleanly, is architecturally sound (validated against real Checkpoint
5–7 usage, not assumed), and CI is confirmed green on both platforms on
the first attempt / 🔴 Needs Hardware for actual on-device read/write/
persistence behavior — that remains genuinely unverified and is not
being claimed. Cleared to advance to Checkpoint 9.
