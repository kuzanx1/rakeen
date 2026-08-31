# Windows Complete / Mac Required

Legend (exactly as requested):
- ✅ implemented and tested
- 🟡 prepared but not tested
- 🔴 impossible to verify without Mac/Hardware

This report closes the "prepare everything possible before Xcode" phase.
Nothing below claims iOS is built, Swift works, or the printer works —
those specific claims are not made anywhere in this document.

## 1. Offline-first web/backend layer (previous phase — restated for completeness)

- ✅ IndexedDB queue for orders (all flows: dine-in register/pay/register+pay,
  simple checkout), print jobs, and KV snapshot cache — implemented and
  directly tested (simulated offline, real server-state verification,
  duplicate-append idempotency test against the live DB).
- ✅ Print queue retry/backoff/max-retries/dedup/persistence-across-reload —
  implemented and tested, including a real race condition found and fixed
  (duplicate jobs from rapid clicks) and a real boot-ordering bug found and
  fixed (`resetInterruptedPrintJobsOnBoot` running before `DEVICE` loaded).
- ✅ Order sync circuit breaker (`stuck` after 10 auto-retries, manual
  recovery via Diagnostics) — implemented and tested.
- ✅ Network State Model + Diagnostics screen — implemented and tested
  (accurate internet/cloud/bridge distinction, plain-language diagnosis).
- ✅ Native bridge optionality — **re-confirmed this phase** by reading
  every call site of `window.AndroidPrint`/`window.NativeCashDrawer`:
  both globals are accessed exclusively through
  `printerBridgeAvailable()`/`cashDrawerBridgeAvailable()` guards; no other
  reference to either global exists anywhere in `rakeen-pos.js`. The
  browser-only path is provably unaffected by the bridge's absence.
- 🟡 Cash drawer web-side honesty fix — implemented and tested (correctly
  reports "not available" instead of faking success); the *native* side
  behind it is new this phase and is 🟡/🔴, see §3.

## 2. Capacitor iOS project scaffolding

- ✅ `npm install @capacitor/core @capacitor/cli @capacitor/ios` — ran
  successfully on Windows, verified via `npx tsc --noEmit` and
  `npx next build` both staying clean afterward.
- ✅ `npx cap init` — ran successfully, produced `capacitor.config.ts`.
- ✅ `npx cap add ios` — ran successfully, produced a complete, real Xcode
  project (`ios/App/App.xcworkspace`, `.xcodeproj`, `AppDelegate.swift`,
  `SceneDelegate.swift`, `Info.plist`, storyboards, `CapApp-SPM/Package.swift`).
  This Capacitor version uses Swift Package Manager exclusively — no
  CocoaPods/Ruby toolchain step needed at all, which was not assumed in
  advance but confirmed by the absence of a generated `Podfile`.
- ✅ `npx cap sync ios` — ran successfully, confirmed re-runnable after the
  `Info.plist`/storyboard edits below without breaking anything.
- ✅ `capacitor.config.ts` configured with `server.url:
  'https://rakeenapp.com/pos'` (load the real deployed app, don't bundle a
  local copy) — a real architectural decision, reasoned and documented in
  the file itself and in `docs/ios-configuration.md` §5, not a default left
  unexamined.
- 🔴 Whether this project actually **opens, resolves its Swift packages, and
  builds in Xcode** — categorically requires a Mac. Nothing above proves
  that; it proves the CLI-level scaffolding is real and mechanically sound,
  not that the result compiles.

## 3. Swift native bridge implementation

- 🟡 `ios/App/App/MainViewController.swift` — full draft implementing the
  WKUserScript injection + `WKScriptMessageHandler` wiring for both
  `window.AndroidPrint` and `window.NativeCashDrawer`, matching
  `docs/ios-native-bridge-interfaces.md` §1/§2 exactly (same global names,
  method signatures, callback globals, error-string conventions).
- 🟡 `ios/App/App/PrinterBridge.swift` — full draft implementing the raw TCP
  transport via `Network.framework` (`NWConnection`), shared between the
  printer and drawer paths per the doc's "minimum viable fix" note.
- 🔴 **Whether either file actually compiles.** No Swift toolchain exists on
  Windows (`swiftc`/`swift` were checked and are not present) — this was
  verified as a fact, not assumed. Every API used
  (`WKScriptMessageHandler`, `NWConnection`, `CAPBridgeViewController`
  subclassing) was written from documented/training knowledge of these
  frameworks, not checked against the actual installed SDK version. Treat
  compiler errors on first Xcode build as expected, normal work — see
  `docs/ios-xcode-guide.md` step 12.
- 🔴 Whether the injected globals are actually reachable from the page once
  it loads a **remote** `server.url` origin (as opposed to a locally
  bundled `capacitor://localhost` page, which is the more commonly
  documented Capacitor customization scenario) — the `WKUserScript`
  mechanism itself doesn't care about origin, but this specific combination
  hasn't been seen working anywhere in this session, only reasoned about.
  First real check: `docs/ios-xcode-guide.md` step 13.
- ✅ `ios/App/App/Base.lproj/Main.storyboard` edited to point the root view
  controller at `MainViewController` instead of Capacitor's default — a
  real, applied, diffable XML change (not a guess about syntax — this is
  the same storyboard XML format Xcode itself writes).

## 4. iOS configuration

- ✅ `NSLocalNetworkUsageDescription` added to `Info.plist` — required for
  any local-network socket to work at all; applied, not just documented.
- ✅ App Transport Security reviewed and reasoned to need no exception
  (HTTPS-only WKWebView traffic + a non-URLSession raw socket for the
  printer transport, which ATS doesn't govern) — a conclusion based on
  documented Apple platform scope, not a guess.
- 🟡 Bundle ID — placeholder (`com.rakeen.cashier`) in place and working at
  the CLI/scaffolding level; needs a real decision once an Apple Developer
  account/bundle ID exists (`docs/ios-configuration.md` §3).
- 🟡 Capabilities — none enabled; one real decision flagged (Background
  Modes for background sync) rather than silently added, per instruction
  not to make architecture calls unilaterally (`docs/ios-configuration.md` §4).

## 5. Xcode guide and hardware test plan

- ✅ `docs/ios-xcode-guide.md` — step-by-step from the (already-run) CLI
  commands through first build, Simulator bridge-reachability check, and
  real-device testing entry points.
- ✅ `docs/ios-hardware-test-plan.md` — concrete pass/fail criteria for
  printer connectivity, Arabic/image rendering, cut/reprint, cash drawer,
  interruption during order/payment/print, Local Network permission
  behavior, force-quit/relaunch queue survival, and a 72-hour offline soak.
  Both are 🟡 by nature — they're plans to execute, not executions.

## 6. WKWebView-specific architecture review

`docs/ios-wkwebview-review.md` — ten specific areas reviewed
(IndexedDB, localStorage, backgrounding, termination/restart,
`navigator.onLine` reliability, `target="_blank"` links, audio autoplay,
the service worker, script-loading pattern, static-asset caching), each
classified Verified/Likely/Needs Mac individually rather than given one
blanket rating. **No architecture changes were made based on any Likely or
Needs-Mac item** — none were reclassified as fixed without real evidence.
The two items most worth attention in the first real-device session:
- 🔴 IndexedDB quota/eviction behavior over a genuine 72-hour offline run
  with real print-job payloads — the largest genuine unknown in the whole plan.
- 🟡 `target="_blank"` WhatsApp/Maps links opening externally — reasoned as
  likely-fine from documented Capacitor defaults, cheap to confirm in two
  seconds on first device contact.

## What this means going into the Mac phase

The Xcode phase is now, concretely: open the project, resolve packages, fix
whatever the Swift compiler flags (expected — nothing here was
compiler-checked), confirm the bridge is reachable from a loaded remote
page, then work through the hardware test plan. It is not: design the
Capacitor integration, decide how to wire a native bridge into a web
contract, write the offline architecture, or figure out the ESC/POS/Arabic
rendering approach — all of that already exists, is documented, and (for
everything expressible in JS running on Windows) already tested.

Nothing in this report claims iOS is built, Swift works, or the printer
works.
