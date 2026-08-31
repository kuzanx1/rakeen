# Phase 7 — React Native POC Screen

`react-native-poc/App.tsx` — one screen, not a rebuilt POS, exactly as
scoped. Contains, per the requirement:
- A simple header/status layout (not the real POS UI — see Phase 1's audit
  for why porting the real UI is a separate, much larger effort).
- **Test Printer** — calls `Printer.testConnection({ transport: 'network',
  host, port })`, shows reachability + latency.
- **Print Test Receipt** — builds a plain ASCII ESC/POS byte stream
  (init + text lines + full-cut command) and calls `Printer.print(...)`.
  **Deliberately not Arabic/rasterized** — this POC proves the JS → Native
  → Socket transport path, not receipt rendering; Phase 1's audit already
  flagged Canvas-based rendering as a 🔴 full-rewrite item with no RN
  equivalent, and reproducing it wasn't in scope for one POC screen.
- **Open Cash Drawer** — calls `CashDrawer.open(...)` with the same
  target.
- **Network status** — `@react-native-community/netinfo`, the documented
  RN replacement for `navigator.onLine` (see Phase 1's audit).
- **Printer status** — reflects the real result of the last
  `testConnection`/`print` call, not a static label.
- **Native Bridge status** — calls `RakeenDeviceModule.getInfo()` on mount
  and reports whether it actually got a real response, not just whether
  `NativeModules.RakeenDeviceModule` is truthy (a module can be registered
  but still fail to respond — this check calls it for real).

**What this screen proves, precisely**: that the full chain — a button
press in RN, through a TS interface, through `NativeModules`, into Swift
or Kotlin, into a real TCP socket call — compiles and is wired correctly
end to end. **What it does NOT prove**: that any of it works against a
real printer, since nothing has touched real hardware. Every result the
screen can show (`🟢`/`🔴` in its own UI) reflects a real
`testConnection`/`print` outcome against whatever IP/port is typed in —
against a real LAN printer, this becomes a genuine test; against nothing,
it will honestly report `connection_refused`/`connection_timeout`, not a
fake success.

TypeScript-checked clean (`npx tsc --noEmit`, react-native-poc/) before
being committed — one real bug caught this way: Hermes has no global
`btoa` (unlike a browser), so the test-receipt base64 encoder had to be
hand-written rather than assumed available.
