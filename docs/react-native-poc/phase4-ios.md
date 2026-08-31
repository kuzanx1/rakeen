# Phase 4 — iOS Native Module (Swift)

Real files, not pseudocode: `react-native-poc/ios/RakeenPOC/`:
- `NetworkPrinterTransport.swift` — ported from the Capacitor project's
  already CI-proven `ios/App/App/NetworkPrinterTransport.swift`, unchanged
  in logic (it had zero Capacitor dependency to begin with — pure
  `Network.framework`). Added a `testConnection` method (latency-measuring
  connect-then-cancel) since the printer contract requires one and the
  original didn't need it.
- `RakeenPrinterModule.swift` + `RakeenPrinterModule.m` — the actual React
  Native NativeModule, using the classic `RCT_EXTERN_MODULE`
  bridging pattern (React Native's New Architecture, enabled by default in
  this scaffold's `gradle.properties`/Podfile, still runs classic modules
  through its TurboModule interop layer — no Codegen/spec file needed for
  a first POC).
- `RakeenCashDrawerModule.swift` + `.m` — same transport, standard
  drawer-kick bytes, overridable per the contract (`kickCommandBase64`).
- `RakeenDeviceModule.swift` + `.m` — minimal, exists only to prove a third
  module round-trips correctly.

**No `window.AndroidPrint`, no Capacitor bridge anywhere in this project**
— confirmed by construction, not just by claim: this is a fresh RN
scaffold (`npx @react-native-community/cli init`) that has never had
Capacitor in it.

**Real bug class from the Capacitor phase, checked for here too**: a file
existing on disk isn't compiled unless it's registered in
`project.pbxproj`'s Sources build phase. All 7 new files (4 `.swift` + 3
`.m`) were manually added to `RakeenPOC.xcodeproj/project.pbxproj`
(`PBXBuildFile`/`PBXFileReference`/group/Sources entries) since no Xcode
GUI was available to add them automatically. CI (see
`.github/workflows/react-native-poc-build.yml`) greps the real build log
for every filename, exactly like the Capacitor project's CI does, so this
can't silently regress.

**Classification**: 🟡 Ready for Testing once CI confirms it compiles —
🔴 Needs Hardware for whether it actually prints/opens a drawer. Nothing
here has run in a Simulator or on a device yet, unlike the Capacitor
project's Simulator smoke test — that step wasn't built for this POC given
the scope (Phase 7 is one screen, not a full app-launch proof).
