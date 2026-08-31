# Final iOS Readiness — Before Hardware

Legend: 🟢 Verified (actually run and confirmed) · 🟡 Ready for Testing
(code exists, reasoned, needs a real device) · 🔴 Needs Mac/iPad/Hardware
(genuinely can't be assessed without one).

This is the closing report for the "prepare everything short of real
hardware" phase. It folds in a new real result: this pass added a GitHub
Actions step that boots an iOS Simulator, installs and launches the actual
built app, and screenshots it — screenshot and system log both inspected
directly, not assumed. See the screenshot referenced in §1.

## 🟢 Verified

- **Real macOS/Xcode compile**: `** BUILD SUCCEEDED **` on a `macos-14`
  GitHub Actions runner (Xcode 15.4, Swift 5.10), for every commit this
  phase — [latest run](https://github.com/kuzanx1/rakeen/actions).
- **The app actually launches on a real Simulator without crashing** —
  confirmed two ways: the CI job's own check (process listed as running,
  no `.ips` crash report), and a direct read of the captured system log
  (`app-sim.log`) showing a normal WebKit page-load sequence with no
  fault/crash/error lines.
- **The real, live `rakeenapp.com/pos` page loads inside the actual
  Capacitor WKWebView, over a real network fetch from the CI runner** —
  confirmed visually: the screenshot shows the real Arabic device-pairing
  screen ("تجهيز هذا الجهاز"), correctly RTL, with correct branding/colors
  and working-looking input fields. This is not a mock or a local page —
  `capacitor.config.ts`'s `server.url` pointed the WKWebView at the actual
  production origin.
- **No CSP/navigation/WebKit error in the captured log** during that real
  page load.
- **Native bridge files compile into the real `App` target** —
  `MainViewController.swift`, `PrinterManager.swift`,
  `PrinterTransport.swift`, `NetworkPrinterTransport.swift` — confirmed via
  literal `SwiftCompile` log lines, not just presence on disk (a CI step
  greps for each filename on every run).
- **Native bridge optionality** — every reference to
  `window.AndroidPrint`/`window.NativeCashDrawer` in `rakeen-pos.js` goes
  through `printerBridgeAvailable()`/`cashDrawerBridgeAvailable()`; no bare
  reference exists anywhere. Confirmed by direct code search.
- **Port is never hardcoded to 9100**, in either layer — confirmed by
  reading both `rakeen-pos.js` (`DEVICE.printerPort`/`kitchenPrinterPort`,
  9100 only ever a UI default) and `NetworkPrinterTransport.swift` (always
  uses `target.port`).
- **Adding a second network printer of a different brand/model needs zero
  `PrintQueue`/native code changes** — confirmed by reading
  `NetworkPrinterTransport`/`PrinterManager` (no brand/model branching
  anywhere) and `rakeen-pos.js` (already runs two independent network
  printer configs — receipt + kitchen — through the same bridge call).
- **Encoding risk is zero by construction** — the native layer never
  touches text/codepages; it only ever transports pre-rendered opaque
  bytes from the web layer's canvas rasterization.
- **Offline queue / print queue / sync circuit breaker** (restated from
  the earlier phase, unaffected by any work this pass) — IndexedDB order
  queue, print-job retry/backoff/dedup, `stuck`-order circuit breaker, and
  idempotent dine-in append were all directly tested against the real
  Supabase backend and a simulated-offline browser earlier this project.
- **App Transport Security needs no exception** — HTTPS-only WKWebView
  traffic + a non-`URLSession` raw socket for printing, reasoned from
  documented ATS scope.
- **Audio autoplay is already defensively coded** — every `audio.play()`
  call is wrapped in `.catch(()=>{})`; worst case is a missed sound, never
  a crash or blocked UI.

## 🟡 Ready for Testing

- **Safe area / notch / rounded corners / home indicator** — `contentInset:
  'automatic'` is set (should behave like Safari's own auto-insetting); the
  Simulator screenshot shows no obvious clipping around the login card, but
  the Simulator's status-bar/safe-area rendering isn't provably identical
  to a real device's. `.bottom-nav` (fixed at the screen bottom on wider
  layouts) has no explicit `env(safe-area-inset-bottom)` padding — see
  `docs/ios-safe-area-input-review.md` for the exact low-risk fix if a real
  device shows an overlap.
- **Keyboard / input fields inside modals** — WKWebView's default
  keyboard-avoidance scrolling is expected to work (same as the untouched
  browser/PWA version), but nested `.modal-overlay` (`position:fixed`)
  containers are the one scenario worth specifically checking — never
  observed with a real software keyboard.
- **iPad-specific behavior never exercised**: Stage Manager / split-screen
  multitasking, the floating/undocked iPad keyboard layout. Not expected to
  break anything specific, but genuinely untested territory.
- **`target="_blank"` links (WhatsApp, Google Maps)** — reasoned as likely
  opening externally per Capacitor's documented default `WKUIDelegate`
  behavior; not exercised in the Simulator run (the screenshot landed on
  the login screen, before any such link is reachable).
- **App backgrounding → foreground → resume** — standard iOS behavior
  suspends JS timers while backgrounded; the existing `online` event
  listener and boot-time `syncQueue()`/`resetInterruptedPrintJobsOnBoot()`
  calls are expected to correctly resume state on foreground (same code
  path already exercised via reload in browser testing) — never observed
  as an actual background→foreground transition on a real device.
- **Whether `window.AndroidPrint`/`window.NativeCashDrawer` are actually
  reachable from the loaded page** — the WKUserScript injection compiles
  and the page loads successfully, but nothing in this pass's Simulator run
  exercised a JS console check (`typeof window.AndroidPrint`) — that needs
  Safari Web Inspector attached to a running Simulator or device (see
  `docs/ios-xcode-guide.md` step 14).
- **SUNMI/Goodics NT310**: LAN/ESC/POS support confirmed from Sunmi's own
  manual; port 9100 corroborated from a sibling model's third-party guide,
  not Sunmi's own NT310 documentation. Full plan: `docs/ios-nt310-test-plan.md`.
- **Local Network permission — the config is real (`NSLocalNetworkUsageDescription`
  is in `Info.plist`), but the actual system prompt was never triggered** in
  this Simulator run (no print/drawer action was taken — the run only
  reached the login screen).
- **Drawer-kick byte sequence** — a near-universal ESC/POS default,
  hardcoded rather than guessed-then-changed; not confirmed against any
  specific drawer hardware.

## 🔴 Needs Mac/iPad/Hardware

- Real printing to any physical printer, any model.
- A true OS-level app force-quit and relaunch (the Simulator run only
  covers a single fresh launch, not a kill-and-resume cycle, and a
  Simulator kill isn't identical to real iOS memory-pressure termination).
- The real Local Network permission **dialog** appearing and being
  accepted/declined by a person.
- Real visual confirmation of safe-area fit on actual iPad hardware
  (notch/corners/home-indicator geometry the Simulator doesn't perfectly
  reproduce for every device class).
- Real software-keyboard behavior (including the floating/undocked variant)
  on an actual iPad.
- IndexedDB behavior over a genuine 72-hour+ offline run with real
  print-job payloads (the single largest unresolved unknown in the whole
  plan).
- Bluetooth/USB anything — not implemented, not evaluated, correctly
  absent from every claim above.

## Day one with Mac + iPad + NT310 — exactly this, in this order

1. Open `ios/App/App.xcodeproj` in Xcode, confirm SPM resolves and it
   builds locally (should just work — already proven in CI).
2. Run on a real iPad, attach Safari Web Inspector, confirm
   `window.AndroidPrint`/`window.NativeCashDrawer` exist and
   `isAvailable()` returns `true`.
3. `ping`/raw-socket test the NT310's IP:9100 from a laptop on the same LAN
   — **before** touching the iPad app at all (`docs/ios-nt310-test-plan.md`
   steps 1–4).
4. Configure the NT310's IP in POS Settings, trigger a real checkout
   receipt print — first real end-to-end print test.
5. Force-quit the app with a print/order queued, relaunch, confirm nothing
   is lost or duplicated.
