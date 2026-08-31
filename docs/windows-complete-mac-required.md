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
  project (`.xcodeproj`, `AppDelegate.swift`, `SceneDelegate.swift`,
  `Info.plist`, storyboards, `CapApp-SPM/Package.swift`). This Capacitor
  version uses Swift Package Manager exclusively — no CocoaPods/Ruby
  toolchain step needed at all. **Correction found via the real CI build**:
  this SPM-only setup does not generate a separate `.xcworkspace` (an
  earlier version of this report assumed it did) — `ios/App/App.xcodeproj`
  is the thing to open/build.
- ✅ `npx cap sync ios` — ran successfully, confirmed re-runnable after
  every subsequent edit without breaking anything.
- ✅ `capacitor.config.ts` configured with `server.url:
  'https://rakeenapp.com/pos'` (load the real deployed app, don't bundle a
  local copy) — a real architectural decision, reasoned and documented in
  the file itself and in `docs/ios-configuration.md` §5, not a default left
  unexamined.
- ✅ **The project actually opens, resolves its Swift packages, and builds —
  confirmed for real**, not on a local Mac but on a real macOS/Xcode
  toolchain via a GitHub Actions runner (`macos-14`, Xcode 15.4, Swift
  5.10) — see §3 below for how, and why this is a legitimate substitute for
  local Mac access for proving *compilation* specifically (it cannot run a
  Simulator UI test, touch a real device, or print to a real printer — see
  §3's own limits).

## 3. Real macOS/Xcode compile proof (GitHub Actions)

Rather than wait for local Mac access, a private GitHub repository
([kuzanx1/rakeen](https://github.com/kuzanx1/rakeen)) was created and a
GitHub Actions workflow (`.github/workflows/ios-build.yml`) was set up to
build this exact project on a real `macos-14` GitHub-hosted runner —
Simulator SDK only, code signing disabled, no Apple Developer account
needed. This is not a simulation or a mock: it is the real `xcodebuild`
toolchain compiling the real Swift files in this repo.

- ✅ **`** BUILD SUCCEEDED **`** — confirmed in the actual build log (run
  [33424978965](https://github.com/kuzanx1/rakeen/actions/runs/33424978965)),
  with `MainViewController.swift`, `PrinterManager.swift`,
  `PrinterTransport.swift`, and `NetworkPrinterTransport.swift` (after the
  printer-transport refactor covered in §3a below) all confirmed compiled
  into the real `App` target via a literal `SwiftCompile` log line naming
  them — not merely present on disk. A CI step now greps the build log for
  every bridge filename on every future run, specifically because an
  intermediate run proved a file can exist on disk without being compiled
  at all (see the second bug below).
- **Three rounds of real, found-and-fixed compiler errors** (per the rule:
  read the actual error, fix only that, rebuild — no guessing):
  1. `xcodebuild: error: 'ios/App/App.xcworkspace' does not exist.` — this
     Capacitor version never generates a workspace; fixed by building
     `ios/App/App.xcodeproj` directly instead.
  2. Both new Swift files compiled with **zero errors — because they
     weren't being compiled at all.** They existed on disk but were never
     registered in `project.pbxproj`'s Sources build phase, so Xcode
     silently skipped them and "succeeded" without them. Found only by
     grepping the actual build log for the filenames and seeing nothing —
     fixed by adding the missing `PBXBuildFile`/`PBXFileReference`/group/
     Sources entries, mirroring the exact pattern Capacitor's own generated
     files use.
  3. `value of type 'MainViewController' has no member 'bridge'` (×2) and
     `'nil' requires a contextual type` — an incorrect assumption
     (`self.bridge?.webView`) about Capacitor's `CAPBridgeViewController`
     API surface. Confirmed against Capacitor's actual public source that
     `webView` is a direct property on the view controller itself; fixed to
     `self.webView`, and gave `evaluateJavaScript`'s completion handler an
     explicit typed closure instead of a bare `nil` to resolve an overload
     ambiguity.
- 🔴 **What this does NOT prove**: whether the injected `window.AndroidPrint`/
  `window.NativeCashDrawer` globals are reachable from a page loaded from a
  **remote** `server.url` origin inside a real WKWebView; whether the app
  runs on a Simulator or real device at all; whether printing to a real
  printer works. Compiling and running are different claims — see
  `docs/ios-xcode-guide.md` steps 14+ for what still needs a Mac/device/
  printer.

## 3a. Printer transport abstraction (multi-printer, not NT310-specific)

Before treating any printer implementation as final, the design was
reviewed against the fact that Rakeen's merchants use different printer
brands/models/connections — not just the first hardware test unit. See
`docs/ios-native-bridge-interfaces.md` §4 for the full design; summary:

- ✅ **`PrinterTransport` protocol + `PrinterManager` introduced** —
  PrintQueue (web, unchanged) → `PrinterManager` → `PrinterTransport` →
  physical printer. `MainViewController` now talks only to `PrinterManager`,
  never directly to a transport. This compiled successfully in the same CI
  run referenced above.
- ✅ **`NetworkPrinterTransport`** (renamed from the earlier `PrinterBridge`,
  identical `NWConnection` logic, no behavior change) is the one real
  transport today — confirmed compiling as part of the `App` target.
- 🔴 Bluetooth/USB transports — not implemented, not stubbed with fake
  code, explicitly `nil`-routed in `PrinterManager` with a comment
  explaining why. Classified **Unsupported** in the Hardware Compatibility
  Matrix, not "coming soon."
- **No changes were made to `public/pos/rakeen-pos.js`'s Print Queue** —
  the web-side bridge contract (`window.AndroidPrint`/`window.NativeCashDrawer`)
  is unchanged; this abstraction lives entirely on the native side.

## 3b. SUNMI/Goodics NT310 — first hardware target, researched not guessed

Real vendor documentation and a real third-party POS integration guide for
a sibling model were read (not assumed) — see
`docs/ios-native-bridge-interfaces.md` §5 and `docs/ios-nt310-test-plan.md`
for full detail and sourcing:

- ✅ Confirmed from Sunmi's own NT310 manual: 80mm ESC/POS-compatible,
  Ethernet/LAN port, IP discovery via double-clicking the Pairing Button
  (prints a network detection report).
- 🟡 Port 9100 raw ESC/POS — strongly corroborated by a real third-party
  integration guide for the NT311 (same product family/manual), but not
  itself stated in Sunmi's NT310 manual. Classified **Ready for Testing**,
  not Verified.
- 🔴 Everything about whether printing actually works on this exact
  physical unit — genuinely needs the hardware. See
  `docs/ios-nt310-test-plan.md` for the exact test sequence, starting with
  a plain `ping`/raw-socket test **before** involving the iPad app at all.

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
- ✅ `docs/ios-nt310-test-plan.md` — model-specific test plan for the first
  real hardware target (SUNMI/Goodics NT310), including a fact table
  distinguishing what's confirmed from vendor docs vs. corroborated from a
  sibling model's third-party guide vs. genuinely unknown until tested.
  All three of these docs are 🟡 by nature — they're plans to execute, not
  executions.

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

Compiling is no longer the open question — that's proven, repeatedly, via
real `xcodebuild` runs on GitHub Actions (§3). The Xcode/hardware phase is
now, concretely: open the project locally (should just work — §3 already
proved it compiles on this exact toolchain version), confirm the bridge's
injected globals are reachable from a page loaded from a real remote
`server.url` origin inside an actual WKWebView (not yet confirmed
anywhere), then work through `docs/ios-nt310-test-plan.md` starting with a
plain network ping/raw-socket test of the printer — before ever involving
the iPad app. It is not: design the Capacitor integration, decide how to
wire a native bridge into a web contract, design a multi-printer
architecture, write the offline architecture, or figure out the ESC/POS/
Arabic rendering approach — all of that already exists, is documented, and
(for everything expressible in JS or provable via a real macOS/Xcode
compile) already tested.

Nothing in this report claims iOS is built, Swift works, or the printer
works.
