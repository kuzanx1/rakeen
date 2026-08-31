# Phase 2 — Proposed React Native Architecture

```
React Native UI  (screens, components — platform-agnostic JSX)
      ↓
Application / POS Logic  (order calc, queue orchestration, diagnosis — pure JS/TS, no platform checks)
      ↓
Platform-independent Interfaces  (Printer, CashDrawer, Device — one TS contract, no if(Platform.OS))
      ↓
Native Bridge  (React Native's own NativeModules/TurboModules registration)
      ↓
Swift (iOS)  /  Kotlin (Android)  — the ONLY place platform is known
      ↓
Hardware  (Network.framework / Android Socket, printer, drawer)
```

**The one rule that matters most**: JavaScript never contains `if
(Platform.OS === 'ios')` for hardware behavior. It calls
`Printer.print(job)`, and React Native's own module resolution picks the
Swift or Kotlin implementation registered under that same name — this is
what "same JS API on both platforms" actually means mechanically, not just
a design intention.

```ts
// src/platform/printer.ts — the ONLY thing POS logic imports
export interface PrinterAPI {
  print(job: PrintJob): Promise<PrintResult>;
  testConnection(target: PrinterTarget): Promise<ConnectionTestResult>;
  getStatus(): Promise<PrinterStatus>;
  capabilities(): PrinterCapabilities;
}

// implementation, resolved by React Native itself, not by our code:
import { NativeModules } from 'react-native';
export const Printer: PrinterAPI = NativeModules.RakeenPrinterModule;
```

`NativeModules.RakeenPrinterModule` resolves to whichever native module is
actually registered on the running platform — `RakeenPrinterModule.swift`
on iOS, `RakeenPrinterModule.kt` on Android. The JS file above is the
*entire* platform-awareness surface; nothing else in the app needs to know
two native implementations exist.

## Where this differs from the current Capacitor setup

The current `window.AndroidPrint`/`window.NativeCashDrawer` pattern (a
`WKUserScript`-injected global, see `docs/ios-native-bridge-interfaces.md`)
already achieves "one JS-facing name, native code behind it" for iOS —
that part of the current design was already sound and carries over as a
*principle*. What's different in React Native:
- The bridge is React Native's own `NativeModules` registration, not a
  hand-rolled `WKScriptMessageHandler`/global-injection trick — a more
  standard mechanism with built-in Promise support (native code resolves/
  rejects a JS Promise directly, instead of the current callback-ID/
  global-callback-function dance `sendBytesToPrinter`/`kickCashDrawer` use
  today).
- It's symmetric across iOS *and* Android from day one, because RN's
  `NativeModules` mechanism is the same API on both platforms — the
  current Capacitor bridge only ever had an iOS-shaped design (Android was
  always "later," per the earlier `docs/ios-native-bridge-interfaces.md`
  history, which literally started life named for `window.AndroidPrint`
  despite never having a real Android implementation).

## Layer responsibilities, concretely

- **UI**: `<POSScreen>`, `<PrinterStatusPill>`, etc. — renders state, calls
  Application/POS Logic functions, never touches `NativeModules` directly.
- **Application/POS Logic**: order totals, the offline queue's
  retry/backoff/circuit-breaker rules (ported *design*, new storage — see
  Phase 8), `diagnoseProblem()`-equivalent reasoning. Pure TS, unit-testable
  without a device or simulator.
- **Platform-independent Interfaces**: `Printer`, `CashDrawer`, `Device` —
  three small TS interfaces (Phase 3 defines `Printer`'s contract in full).
  This layer's entire job is to be the one place a platform check would go
  if it were ever needed — and to never actually need one, if the Swift/
  Kotlin sides genuinely implement the same contract.
- **Native Bridge**: React Native's module registration
  (`@ReactMethod` on Android, `@objc`/`RCT_EXPORT_METHOD` on iOS) — pure
  plumbing, no business logic.
- **Swift/Kotlin**: the actual `NWConnection`/`Socket` code, ESC/POS byte
  transport, drawer-kick bytes — this is where `NetworkPrinterTransport.swift`'s
  existing logic gets reused (Phase 4), and where its Kotlin equivalent is
  written fresh (Phase 5).

## What does NOT change in this proposal

Per the explicit instruction not to invent a different printer system
without cause: the **byte-level contract is identical** to what's already
built and CI-proven for Capacitor — the web/JS side still builds complete
ESC/POS bytes (raster image, cut command, drawer-kick sequence) and hands
opaque bytes + `ip`/`port` to native code. Only *how JS reaches native
code* changes (NativeModules instead of a WKUserScript global); the
actual printing protocol, the "native code never understands Arabic text"
principle, and the transport-agnostic design from
`docs/ios-native-bridge-interfaces.md` §4 all carry over unchanged in
spirit.
