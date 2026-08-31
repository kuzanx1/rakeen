# Checkpoint 1 — React Native Shell + Architecture

## What changed

- New branch `react-native-migration`, from `react-native-poc` (carrying
  over the already CI-proven RN scaffold + Swift/Kotlin native modules
  rather than starting over). `master` untouched — verified by direct
  diff (empty) against `ios/App`, `capacitor.config.ts`,
  `public/pos/rakeen-pos.js`.
- `docs/react-native-migration/00-protection-and-rollback.md` — baseline
  commit, concrete rollback (`git checkout master`), standing rules.
- `docs/react-native-migration/01-roadmap.md` — the exact 16 checkpoints.
- Hardened the printer/drawer TypeScript + Swift + Kotlin contracts:
  - `getCapabilities()` (renamed from `capabilities()`) on both platforms.
  - Two-tier error model: `PRINTER_UNAVAILABLE` / `PRINTER_CONNECTION_FAILED`
    / `CASH_DRAWER_UNAVAILABLE` / `INVALID_TARGET` / `RENDER_FAILED` as the
    reserved, cashier-facing error category; `errorDetail` carries the
    specific native reason for Diagnostics.
  - `printReceipt()`/`openCashDrawer()` wrapper functions
    (`react-native-poc/src/platform/`) enforcing "no fake success" —
    honest `PRINTER_UNAVAILABLE`/`CASH_DRAWER_UNAVAILABLE` when no native
    module is linked.
  - `CashDrawerOpenOptions.operationId` (required) + an in-memory dedup
    map in `openCashDrawer()` — a double-tap or retry for the same
    `operationId` can never kick the drawer twice once a prior attempt
    already succeeded.
  - `PrinterProfile`/`DrawerCapabilities` types added — brand, model,
    transport, host, port, protocol, paper width, capabilities, drawer
    capabilities — not yet backed by a real Settings UI.

## What was tested

- `npx tsc --noEmit` — clean.
- Real CI build, both platforms, after the contract changes: iOS
  (`macos-15`, Xcode 16.4) and Android (`ubuntu-latest`) both
  `** BUILD SUCCEEDED **` / Gradle success, native module compile
  verification steps passed on both.

## What passed

Both platforms compile with the renamed methods and new error model. No
Swift/Kotlin compile errors from the rename or the new fields.

## What failed / what was fixed

Nothing failed in this checkpoint's own changes — the one real CI issue
(Xcode version) was found and fixed in the prior POC phase, not repeated
here.

## What remains

- `PrinterProfile` is not yet backed by a real Settings screen or
  persisted anywhere.
- The dedup map in `openCashDrawer()` is in-memory only (per-session) —
  correct for the stated threat model (rapid double-tap within one
  session) but worth re-confirming once real payment-flow code exists
  (Checkpoint 12).

## What needs real hardware

Nothing in this checkpoint touches a real printer/drawer — all of it is
contract/compile-level work. See Checkpoint 11/12 for when that starts.

**Status: 🟡 Ready for Testing** (compiles for real; no screen/runtime
behavior exercised yet beyond the pre-existing hardware POC tools carried
over from the POC phase).
