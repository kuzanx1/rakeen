# React Native POC Report

Branch: `react-native-poc` (isolated — `master`/Capacitor untouched, per
the explicit freeze requirement). Full detail per phase in this same
folder (`phase1-audit.md` through `phase10-comparison.md`); this is the
consolidated version.

## Current Architecture

Web POS (`public/pos/rakeen-pos.js`, 6,597 lines, vanilla JS/DOM, no
framework) + `app/pos/pos-markup.ts` (HTML template) running inside a
Capacitor WKWebView on iOS, with a real, CI-proven Swift native bridge
(`PrinterManager` → `PrinterTransport` protocol → `NetworkPrinterTransport`,
raw `Network.framework` TCP) injected via a `WKUserScript`. Offline queue,
print queue, and idempotency all built on IndexedDB, extensively tested
against the live Supabase backend earlier in this project. Android: not
started, but Capacitor supports it as a first-class target.

## Proposed Architecture

```
React Native UI → Application/POS Logic → Platform Interfaces (Printer/CashDrawer/Device)
→ NativeModules → Swift (iOS) / Kotlin (Android) → Hardware
```

JS never checks `Platform.OS` for hardware behavior — `Printer.print(...)`
resolves to whichever native module is actually registered. Full detail:
`phase2-architecture.md`.

## What Was Actually Implemented

Real code, not pseudocode, all in `react-native-poc/`:
- A fresh React Native 0.87.1 project (`npx @react-native-community/cli init`),
  isolated `ios/`/`android/` folders, no relation to the Capacitor project's
  `ios/` folder.
- `src/platform/printer.ts`, `cashDrawer.ts`, `device.ts` — the unified TS
  contract (`phase3-printer-contract.md`).
- Four Swift files + three Objective-C bridging files (iOS).
- Five Kotlin files (Android).
- One POC screen (`App.tsx`) — Test Printer / Print Test Receipt / Open
  Cash Drawer / Network status / Printer status / Native Bridge status.
- Two CI jobs (`.github/workflows/react-native-poc-build.yml`), one per
  platform, both real GitHub-hosted runners.

## iOS Swift

`react-native-poc/ios/RakeenPOC/`: `NetworkPrinterTransport.swift` (ported
near-verbatim from the Capacitor project's already-proven version — zero
Capacitor dependency to begin with), `RakeenPrinterModule.swift`/`.m`,
`RakeenCashDrawerModule.swift`/`.m`, `RakeenDeviceModule.swift`/`.m` —
classic `RCT_EXTERN_MODULE` bridging (works under React Native's New
Architecture via its TurboModule interop layer, no Codegen needed for this
POC). All 7 files manually registered in `project.pbxproj` (no Xcode GUI
available) — same lesson as the Capacitor phase: a file on disk isn't
compiled until it's registered; CI greps the real build log for every
filename to guard against a silent regression. Detail: `phase4-ios.md`.

## Android Kotlin

`react-native-poc/android/app/src/main/java/com/rakeenpoc/`:
`NetworkPrinterTransport.kt` (plain `java.net.Socket`, background thread —
Android throws on main-thread network I/O, a real platform difference
handled here), `RakeenPrinterModule.kt`, `RakeenCashDrawerModule.kt`,
`RakeenDeviceModule.kt`, `RakeenPackage.kt` (registered in
`MainApplication.kt`). Same JS-facing method names/shapes as iOS by
construction. Gradle auto-discovers `.kt` files by directory convention —
no pbxproj-equivalent registration step, no equivalent of that bug class
on this platform. Detail: `phase5-android.md`.

## Printer POC

`Printer.print/testConnection/getStatus/capabilities` — network transport
only, port never defaulted to 9100 anywhere in the contract or either
native implementation (confirmed by reading both), ESC/POS bytes opaque to
native code exactly as in the current architecture. Bluetooth/USB are
type-level placeholders only, never claimed working. Detail:
`phase3-printer-contract.md`.

## Cash Drawer POC

`CashDrawer.open({ target, kickCommandBase64?, timeoutMs })` — same
standard ESC/POS kick default as the Capacitor project, overridable but
never overridden (no hardware has required it). Detail:
`phase6-cash-drawer.md`.

## Offline Assessment

No migration performed (per instruction) — evaluated
AsyncStorage/MMKV/SQLite/WatermelonDB/Realm against durability,
transactions, idempotency, offline boot, queue persistence, performance,
crash recovery. **Recommendation: SQLite for `pending_orders`/`print_jobs`
(closest match to the existing design's transactional/queryable
assumptions, real ACID transactions for the project's stated #1 priority),
MMKV for `kv_cache`** — a direct 1:1 match to the three existing stores'
actual different needs, not a single one-size-fits-all pick. WatermelonDB/
Realm not recommended — both bring their own opinionated sync/object
models the project doesn't need and would have to work around. Full
reasoning and scoring table: `phase8-offline-storage.md`.

## CI Builds

Real GitHub Actions runs, both platforms, real errors found and fixed:

- **iOS**: `macos-14` failed with a real, specific error —
  `React Native requires XCode >= 16.1. Found 15.4.` Fixed by switching to
  `macos-15` (Xcode 16.4). Second attempt: **`** BUILD SUCCEEDED **`**
  ([run 33436732039](https://github.com/kuzanx1/rakeen/actions/runs/33436732039)),
  all four Swift module files confirmed compiled (20 log matches).
- **Android**: succeeded on the **first attempt**, `ubuntu-latest`, no
  macOS needed. Real 123MB debug APK built and downloaded; confirmed a
  real 11.8MB `classes.dex` inside it. CI's own check confirmed all five
  `.class` files actually compiled, not just a green exit code.

Detail: `phase9-ci.md`.

## Verified

- 🟢 Both platforms' native modules compile for real, on real CI runners
  (not locally, not assumed).
- 🟢 The debug Android APK is a real, correctly-structured build (inspected
  directly).
- 🟢 TypeScript contract compiles clean (`npx tsc --noEmit`).
- 🟢 The current app's real architecture facts used throughout this
  report (6,597-line UI, IndexedDB stores, bridge call shapes) — read
  directly from the actual source, not recalled from memory.

## Ready for Testing

- 🟡 Whether `Printer.print()`/`CashDrawer.open()` actually reach a real
  printer/drawer — nothing in this POC has run against real hardware.
- 🟡 Whether the app actually launches and the POC screen renders
  correctly on a Simulator/emulator or real device — this POC's CI stops
  at "compiles," it does not boot/launch/screenshot the way the Capacitor
  project's CI does (a deliberate scope difference, see `phase9-ci.md`).
- 🟡 The SQLite/MMKV storage recommendation — reasoned, not built or
  benchmarked.

## Needs Hardware

- 🔴 Real printing to any physical printer, on either platform.
- 🔴 Real cash drawer kick, on either platform.
- 🔴 Bluetooth/USB anything — not implemented, not evaluated, on either
  architecture.

## Capacitor vs React Native

Full table and reasoning: `phase10-comparison.md`. Summary: React Native's
real, POC-proven advantage is a symmetric native hardware bridge across
iOS and Kotlin from day one — genuine, not overstated. But it is not the
deciding factor, because **Capacitor already reaches Android without a UI
rewrite** (the existing web UI runs unchanged in an Android WebView; only
a Kotlin printer/drawer bridge is needed, the same scope this POC just
proved is achievable quickly). What React Native actually costs that
Capacitor doesn't is a full rewrite of 6,597 lines of already-working,
already-tested UI — for a POS whose real UI needs don't demand native
rendering's performance ceiling.

## Final Recommendation

# KEEP CAPACITOR

The printer transport/manager pattern this project already built is now
proven (via this POC) to translate cleanly to Kotlin — that pattern is the
real, reusable output of this exercise, directly applicable as the
template for a future Capacitor-Android printer bridge, which is the
actual lowest-risk, lowest-cost path to Android — not a React Native
rewrite.
