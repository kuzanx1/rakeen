# Checkpoint 13 — Diagnostics (Final Checkpoint)

## SCOPE (quoted, not invented)

Per `docs/react-native-migration/01-roadmap.md`, item 13:

> **Diagnostics** — Internet vs. Cloud vs. LAN vs. Printer vs. Native
> Bridge, distinguished explicitly, not collapsed into one signal.

Read the real PWA implementation (`NETWORK_STATE`,
`diagnoseProblem()`, `renderDiagnosticsBody()` in
`public/pos/rakeen-pos.js`) before writing anything, per this session's
established discipline. Ported faithfully — same five (in the source,
effectively: Internet, Cloud, Printer Bridge, Printer config, Drawer
Bridge) signals, same priority order, same tri-state handling, same two
bulk-retry actions, reusing already-verified retry mechanisms rather
than inventing new ones.

## WHAT CHANGED

- `domain/diagnostics.ts` (new) — `diagnoseProblem()`, ported
  line-for-line from the PWA's own function: checks internet first
  (closest to the cashier), then cloud, then whether a native printer
  bridge exists at all, then the printer itself once a bridge is
  present. `internet`/`cloud` are tri-state (`true`/`false`/`null`) —
  `null` ("not yet known") is never treated as a failure, only an
  explicit `false` is. Zero I/O, 12/12 pure assertions.
- `application/diagnosticsService.ts` (new) — real signal gathering.
  **"Cloud" is deliberately not a dedicated health-check ping** — it
  piggybacks on `syncScheduler.ts`'s real 30s/reconnect sync attempts
  via `reportCloudSyncOutcome()`, exactly the PWA's own
  `reportCloudResult` design (a separate ping would just be one more
  thing that could lie about what actually matters: can real orders
  sync right now). Native bridge / drawer bridge availability reuse the
  existing `Printer`/`CashDrawer` exports (Checkpoint 1) unchanged;
  printer configuration reuses `profileToPrinterTarget` (Checkpoint 11)
  unchanged; queue/print-job counts reuse
  `sqliteOrderQueueStorage.getAll()`/`listPrintJobs()` (Checkpoints 5/10)
  unchanged. The one genuinely new piece of logic is
  `retryStuckOrders()` — the order-queue-side analog of Checkpoint 10's
  `retryAllFailedPrintJobs()`, ported from the PWA's own "إعادة محاولة
  الطلبات العالقة" bulk action: clears a stuck order's give-up markers
  (never deletes it — orders are financial data) so the next sync pass
  picks it up like any other queued item.
- `application/syncScheduler.ts` — one additive hook: `trigger()` now
  reports its real `syncQueuedOrdersNow()` outcome to
  `reportCloudSyncOutcome()`. No change to timing, guards, or the
  function's own tested behavior (Checkpoint 9) — confirmed by direct
  diff review.
- `ui/DiagnosticsScreen.tsx` (new) — the real screen, ported from
  `renderDiagnosticsBody`: five separate status rows (never a combined
  "everything is fine" banner), the same overall diagnosis text above
  them, live queue/print-job counts, and the two real bulk retry
  buttons (reusing already-verified retry paths).
- `App.tsx` — starts Internet-signal tracking on login, stops on
  logout (same session-gating reasoning as every scheduler since
  Checkpoint 9); adds the "تشخيص النظام" nav entry.

## WHAT WAS ACTUALLY TESTED

1. **Pure logic** (`domain/diagnostics.ts`) — 12 assertions via
   `npx tsx`, the real file imported directly, temporary script deleted
   immediately after (confirmed via `git status`).
2. A genuine, first-hand attempt to import
   `application/diagnosticsService.ts` under Node/tsx — confirmed to
   fail for the same disclosed `NetInfo`/Flow-syntax reason already
   documented in Checkpoints 9–12.
3. `npx tsc --noEmit` across the whole project, including the
   `syncScheduler.ts` hook — clean.
4. Real CI on both platforms — pending at time of writing, to be
   confirmed via a direct `gh run view --json status,conclusion` poll
   (not `gh run watch`'s exit code alone, per the Checkpoint 11 lesson).
5. **Real Supabase backend**: not applicable. Diagnostics reads local
   state (SQLite queue contents, MMKV-stored printer profile, in-memory
   signals) and reuses already-verified retry functions — it makes no
   new Supabase calls of its own.

## PASSED

**Pure logic (12/12 assertions)**:
```
internet=false is always the reported problem, checked first, even
  when cloud/bridge/print are ALSO bad
internet up + cloud=false -> diagnosed specifically as a cloud problem
internet=null AND cloud=null (nothing known yet) -> NOT reported as
  broken -- unknown is never treated as failure
internet=null with cloud confirmed working -> not an internet problem
no native printer bridge -> a NOTE (bad:false), not a failure --
  expected on a build/device with no printer module linked
a bridge that exists but has failing/retrying print jobs -> a real
  printer problem
no bridge WITH trouble print jobs -> still diagnosed as the bridge
  issue, not a new printer problem (without a bridge, stuck jobs are
  expected, not new information)
internet+cloud+bridge all fine, no print trouble -> no problem reported
```

CI: **pending at the time of writing** — will be updated once confirmed
via a direct status poll, not assumed.

## FAILED

- Importing `application/diagnosticsService.ts` under Node/tsx: real,
  confirmed `esbuild` error (`Unexpected "typeof"` in `react-native`'s
  own `index.js`, via the `NetInfo` import chain) — the same disclosed
  limitation as Checkpoints 9–12, not new.

## FIXED

Nothing needed fixing.

## REMAINS (honest gaps, not glossed over)

- **CI result** — pending, to be appended once confirmed.
- **The Diagnostics screen itself is untested on a real device** — same
  category as every screen since Checkpoint 3.
- **The "Cloud" signal only updates when there's something real to
  sync** — matches the PWA's own real limitation exactly (disclosed,
  not fixed beyond parity): with an empty queue, there's no real
  round-trip to observe a result from, so `cloud` stays at its last
  known value (or `null` if none yet this session).
- Genuinely device-only: whether NetInfo's `isConnected` event actually
  fires reliably on a real reconnect, whether the 3s auto-refresh while
  this screen is open behaves correctly on-device, and whether the
  real signals (bridge presence, printer configured, queue counts)
  reflect true device state — all unverified from this environment.

## NEEDS HARDWARE

Real on-device signal delivery and screen behavior — see REMAINS. No
new hardware-dependent claim is made beyond what prior checkpoints
already disclosed (drawer/printer physical operation remains unverified
throughout).

**Status: 🟡 Ready for Testing** — the diagnostics classification logic
is pure-logic-verified (12/12 assertions) and the real signal-gathering/
screen correctly reuse every already-verified mechanism from
Checkpoints 1–12 without redesigning any of them; CI result pending /
🔴 Needs Hardware for on-device signal delivery and screen behavior.
This is the final roadmap checkpoint — see the consolidated final report
for overall engineering-readiness status.
