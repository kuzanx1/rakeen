# Checkpoint 12 — Cash Drawer

## SCOPE (quoted, not invented)

Per `docs/react-native-migration/01-roadmap.md`, item 12:

> **Cash Drawer** — core requirement, not optional; idempotent per
> operation ID; honest error codes; no Internet/Cloud dependency.

Most of this was already built: Checkpoint 1 established the native
Swift/Kotlin drawer modules, the `operationId`-based dedup contract, and
the two-tier honest error model; Checkpoint 6 wired the drawer step into
real cash payments (persist → drawer → network, drawer independent of
network, persisted `drawer_state` surviving restart); Checkpoint 11
replaced the placeholder printer target with a real, user-configured
`PrinterProfile`. This checkpoint's genuine, evidence-based remaining
gap, found by re-reading both the actual PWA and the actual RN app
before writing anything:

1. **The PWA's real drawer feature is a manual "فتح الدرج" quick action**
   (`public/pos/rakeen-pos.js`'s `QUICK_ACTIONS`/`openCashDrawer()`),
   reachable independent of any payment. This RN app had the automatic
   kick-on-cash-payment path (Checkpoint 6) and an isolated Hardware
   Tools *test* screen (Checkpoint 1) — but no real, POS-reachable
   manual action. That's a genuine parity gap, not an invented feature.
2. **`platform/cashDrawer.ts`'s `operationId` dedup logic had never been
   given a real, executable test** — confirmed (not assumed) that
   importing the file itself under Node fails, for the same
   `NativeModules`/Flow-syntax reason already documented for NetInfo and
   MMKV in Checkpoints 9–10.

## WHAT CHANGED

- `domain/drawerIdempotency.ts` (new) — the exact
  `succeeded`/`in_flight`/`none` decision `platform/cashDrawer.ts`'s
  `Map`/`Set` pair has implemented since Checkpoint 1, extracted into a
  pure, zero-I/O reducer (`shouldAttemptNativeKick`,
  `isAlreadySucceeded`, `isInFlight`, `nextStatusAfterAttempt`) — same
  states, same behavior, now independently testable. This is the same
  extraction pattern Checkpoint 9 used for `domain/sync.ts` when
  `syncScheduler.ts`'s NetInfo import blocked direct testing.
- `platform/cashDrawer.ts` — refactored to route `openCashDrawer()`'s
  decisions through the new pure module. The `Map`/`Set` are still the
  real, stateful storage; only the *decision logic* moved out, not the
  storage or `openCashDrawer()`'s external contract/behavior — confirmed
  identical by direct before/after comparison of the three checks
  (already-succeeded → return cached `ok:true`; in-flight → share the
  same promise; otherwise → attempt a real native call) and their exact
  order.
- `App.tsx` — the real manual "فتح الدرج" action, ported from the PWA's
  own `QUICK_ACTIONS`: one tap in the top bar (reachable from any
  screen, matching the source's globally-reachable placement), using
  the REAL configured `PrinterProfile` (Checkpoint 11 — not the Hardware
  Tools screen's manual host/port entry), a **fresh `operationId` per
  tap** (the correct idempotency key here: this is a standalone action
  with no natural persisted ID to reuse, unlike a payment's
  `client_order_uuid`), disabled while a request is in flight (the real
  guard against an accidental rapid double-tap firing two logical taps
  in the first place), and the exact same three honest outcomes the PWA
  reports: real success (`✅ تم فتح الدرج`), native bridge unavailable
  (`⚠ فتح الدرج غير متاح بعد`), any other real failure (`⚠ تعذّر فتح
  الدرج`) — **never** a fake success message. Also distinguishes a
  fourth real case the PWA's simpler check doesn't: a configured printer
  whose profile explicitly declares no drawer at all
  (`isDrawerSupported()` from Checkpoint 11), reported honestly before
  ever attempting a target lookup.

**Explicitly re-confirmed, not modified**: `application/paymentService.ts`'s
`persist → drawer → network` ordering. Read the current file end to
end — the drawer step (lines 56–93) never awaits or branches on
`dispatchQueuedPayload`'s outcome (which only runs afterward, in its own
try/catch at lines 98–112); `drawer_state` is fixed and persisted
(line 95–96) before the network attempt is ever made. This is exactly
what "must not depend on Supabase/cloud success" and "LAN printer/drawer
independent of Internet" require, and it was already true before this
checkpoint — confirmed unchanged, not re-implemented.

## WHAT WAS ACTUALLY TESTED

1. **Pure logic** (`domain/drawerIdempotency.ts`) — 18 assertions via
   `npx tsx`, the real file imported directly, temporary script deleted
   immediately after (confirmed via `git status`). Includes an explicit
   end-to-end simulation of the exact scenario requirement 9 names:
   double-tapping Pay for the same `operationId`.
2. A genuine, first-hand attempt to import `platform/cashDrawer.ts`
   under Node/tsx — confirmed to fail (`NativeModules` from
   `'react-native'` transitively hits `react-native`'s own Flow-typed
   `index.js`), which is exactly why the decision logic needed
   extracting to be testable at all.
3. `npx tsc --noEmit` across the whole project, including the
   `cashDrawer.ts` refactor and the new `App.tsx` action — clean.
4. Real CI on both platforms — no new native dependency this checkpoint.
5. **Real Supabase backend**: not applicable. Cash drawer operations are
   entirely local (native bridge + in-memory/MMKV state) — nothing in
   this checkpoint calls a Supabase RPC.

## PASSED

**Pure logic (18/18 assertions)**:
```
shouldAttemptNativeKick: true only for a genuinely new operation
  (status=none); false for in_flight AND for succeeded
isAlreadySucceeded / isInFlight: correct for all three states
nextStatusAfterAttempt: a real success -> succeeded (cached); a real
  FAILURE -> none, NOT a cached failure -- a retry after a genuine
  failure must get a fresh attempt, never be permanently blocked
Double-tap simulation: the SAME operationId, tapped twice, produces
  EXACTLY ONE real native kick -- the second tap is served from the
  cached succeeded state and still correctly reports ok:true (the
  drawer WAS opened, by the first tap)
Fail-then-retry simulation: a real hardware failure does NOT
  permanently block the same operationId -- a later retry genuinely
  reaches the native layer again (2 real kicks: the failing one, then
  the successful retry)
```

CI: **confirmed green on both platforms** (run 33483751954) — `ios` in
4m30s, `android` in 11m32s (`macos-15`/Xcode 16.4), including the
"verify the native modules were actually compiled" safeguard step on
both. Confirmed via a direct `gh run view --json status,conclusion,jobs`
poll (`"status":"completed"`, `"conclusion":"success"` for both jobs),
not from a single command's exit code alone, per the lesson from
Checkpoint 11.

## FAILED

- Importing `platform/cashDrawer.ts` directly under Node/tsx failed
  with a real, confirmed `esbuild` error (`Unexpected "typeof"` in
  `react-native`'s own `index.js`) — the same disclosed limitation
  already documented for `@react-native-community/netinfo` (Checkpoint
  9) and `react-native-mmkv` (Checkpoint 10), now confirmed for
  `NativeModules` itself. This is why the decision logic was extracted
  into `domain/drawerIdempotency.ts` rather than tested in place.

## FIXED

Nothing needed fixing — `cashDrawer.ts`'s refactor was verified to
change no external behavior (the same three checks, same order, same
`Map`/`Set` mechanics — just routed through the pure module).

## REMAINS (honest gaps, not glossed over)

- **The manual drawer action is entirely untested on a real device** —
  same category as every UI/native-module checkpoint since Checkpoint 1.
- **No real printer/drawer hardware has ever been used.** Every real
  drawer attempt today (manual or payment-triggered) will honestly
  report `CASH_DRAWER_UNAVAILABLE` or `DRAWER_UNAVAILABLE` depending on
  whether a `PrinterProfile` happens to be configured on the test
  device — never a fake success.
- **Bluetooth/USB remain genuinely unimplemented** — unchanged from
  Checkpoint 11, not revisited this checkpoint since no real hardware
  evidence justifies building them.
- A tooling note for whoever picks this up next: `gh run watch
  --exit-status` returned a misleading early success once already this
  migration (Checkpoint 11, due to a transient network error mid-poll).
  This checkpoint's CI confirmation used a direct `gh run view --json
  status,conclusion` poll loop instead, per the lesson recorded then.

## NEEDS HARDWARE

Real physical drawer operation, on any transport, remains completely
unverified and is not claimed as working — only the configuration,
idempotency, and orchestration logic around it is verified.

**Status: 🟡 Ready for Testing** — the drawer's core idempotency
mechanism is now genuinely pure-logic-tested (not just reasoned about
from reading code), the real manual quick action exists and is wired to
the actual configured hardware profile, the existing payment-flow
drawer/network independence was re-confirmed unchanged, and CI is
confirmed green on both platforms via a direct status poll / 🔴 Needs
Hardware for any physical drawer operation. Cleared to advance to
Checkpoint 13.
