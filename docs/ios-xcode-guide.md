# Xcode Guide — From `npx cap add ios` to Running on a Real iPad

This is written for whoever has the Mac. Steps 1–4 have already happened on
Windows and are committed to this repo — they're listed for context, marked
done, not to be re-run unless something looks wrong. Steps 5+ genuinely
need Xcode/a Mac and have not been attempted from here.

## Already done (on Windows, in this repo)

1. **`npm install @capacitor/core @capacitor/cli @capacitor/ios`** — ✅ ran
   successfully, packages are in `package.json`/`package-lock.json`.
2. **`npx cap init "Rakeen Cashier" "com.rakeen.cashier" --web-dir=public`**
   — ✅ ran successfully, produced `capacitor.config.ts` (since hand-edited
   further — see below).
3. **`npx cap add ios`** — ✅ ran successfully, produced the full `ios/App/`
   Xcode project (`.xcodeproj`, `AppDelegate.swift`, `SceneDelegate.swift`,
   `Info.plist`, storyboards, `CapApp-SPM/Package.swift`).
   No CocoaPods/`Podfile` involved — this Capacitor version uses Swift
   Package Manager exclusively, confirmed by the absence of any `Podfile`
   and the presence of `CapApp-SPM/Package.swift`. **Correction (found via
   the actual CI build, not assumed in advance)**: this SPM-only setup does
   NOT generate a separate `.xcworkspace` the way a CocoaPods-based
   Capacitor project would — `ios/App/App.xcworkspace` does not exist
   anywhere in this repo. The thing to open/build is `ios/App/App.xcodeproj`
   directly; SPM package references are resolved inside the `.xcodeproj`
   itself. An earlier draft of this guide assumed the workspace convention
   and was wrong — corrected once a real `xcodebuild` run on GitHub Actions
   surfaced `xcodebuild: error: 'ios/App/App.xcworkspace' does not exist.`
4. **`npx cap sync ios`** — ✅ ran successfully (copies `public/` into
   `ios/App/App/public` — mostly irrelevant since `server.url` is set, see
   below — and regenerates `Package.swift`'s plugin list).
5. **`capacitor.config.ts`** hand-edited to set `server.url:
   'https://rakeenapp.com/pos'` instead of using the locally-bundled
   `public/` folder as the app's content — see the comment block at the top
   of that file for the full reasoning. **This is the single most important
   thing to understand about this project's Capacitor setup**: the WKWebView
   loads the real, already-deployed Cloudflare-hosted app over HTTPS, not a
   bundled copy. `cap sync`'s copy-to-`ios/App/App/public` step is mostly
   inert as a result (harmless, just unused).
6. **`ios/App/App/Info.plist`** hand-edited to add
   `NSLocalNetworkUsageDescription` (see `docs/ios-configuration.md` §1).
7. **`ios/App/App/Base.lproj/Main.storyboard`** hand-edited so the root view
   controller's `customClass` is `MainViewController` (ours) instead of
   `CAPBridgeViewController` (Capacitor's default) — see
   `docs/ios-configuration.md` §5.
8. **`ios/App/App/MainViewController.swift`** and
   **`ios/App/App/PrinterBridge.swift`** written from scratch, implementing
   `docs/ios-native-bridge-interfaces.md` §1/§2 — **never compiled**.

None of the above required Xcode or macOS to produce — `cap` CLI commands
and hand-editing plain-text/XML files both ran/were done directly on
Windows. What follows genuinely cannot be done here.

## From here on — needs a Mac

### 9. Open the project

```
open ios/App/App.xcodeproj
```

There is no `.xcworkspace` in this project (see the correction note above) —
open the `.xcodeproj` directly. Capacitor's SPM integration
(`CapApp-SPM`) is wired in as a local Swift package reference inside the
`.xcodeproj` itself — see `docs/windows-complete-mac-required.md` for
whether a real build against this structure has actually succeeded.

### 10. Let Swift Package Manager resolve

Xcode should automatically resolve `CapApp-SPM/Package.swift`'s
dependencies (Capacitor's own Swift packages) on first open — this needs
network access and is the first genuinely Mac-only step. Watch the "Swift
Package Manager" status in Xcode's activity area; resolve any errors before
proceeding (a common one is an outdated Xcode/Swift toolset version —
Capacitor publishes a minimum-supported Xcode version per Capacitor major
version, check `@capacitor/ios`'s installed version against
Capacitor's own compatibility table).

### 11. Fix the Bundle Identifier

In the App target → Signing & Capabilities tab, replace the placeholder
`com.rakeen.cashier` with the real registered bundle ID (see
`docs/ios-configuration.md` §3) if a different one has been chosen. Set the
Team to the correct Apple Developer account/team.

### 12. First build — confirm it compiles at all

Build for a Simulator first (e.g. "iPad Pro 13-inch"), not a real device —
this is the fastest way to catch:
- Swift syntax errors in `MainViewController.swift`/`PrinterBridge.swift`
  (written on Windows with no compiler available to check them — see
  `docs/windows-complete-mac-required.md`'s 🔴 items)
- Any `Network`/`WebKit`/`Capacitor` API mismatch against the actual
  installed SDK version (this draft was written against training-data
  knowledge of these frameworks, not verified against a real SDK)

Fix anything the compiler flags — this is expected, normal Xcode-phase work,
not a sign the architecture was wrong.

### 13. Run on Simulator — verify the bridge is even reachable

Once it builds, run on Simulator and check (via Safari's Web Inspector,
attached to the Simulator's WKWebView — Safari → Develop → Simulator →
Rakeen Cashier):

```js
typeof window.AndroidPrint       // should be 'object', not 'undefined'
window.AndroidPrint.isAvailable() // should be true
typeof window.NativeCashDrawer
window.NativeCashDrawer.isAvailable()
```

If these come back `undefined`/`false`, the `WKUserScript` injection or the
storyboard's `customClass` wiring didn't take — check
`MainViewController.capacitorDidLoad()` is actually being called (add a
`print()`/breakpoint) before assuming the bridge logic itself is wrong.

The Simulator **cannot** test an actual printer connection (no real LAN
printer reachable in the same way, and Simulator networking doesn't perfectly
mirror a real device's local-network permission prompt) — that needs step 15.

### 14. Local Network permission prompt — first real-device-only check

Run on a real iPad connected to the same Wi-Fi as (eventually) the printer.
The first time `printRaw`/`kick` actually opens an `NWConnection`, iOS
should show the local-network permission prompt (see
`docs/ios-configuration.md` §1). Confirm it appears, confirm accepting it
lets a real connection attempt proceed, and confirm declining it produces a
clean `connection_refused`/`connection_error`-style failure through the
existing print-queue retry UI rather than a crash.

### 15. Real printer / drawer testing

See `docs/ios-hardware-test-plan.md` for the full test matrix — this is the
first point where actual ESC/POS output, Arabic rendering, cut, and drawer
kick can be judged against reality instead of a mock.

### 16. Everything after that

Local Network permission across app reinstall, backgrounding/termination
behavior, offline/airplane-mode testing, Bluetooth/USB evaluation once the
printer model is known, full Hardware Acceptance Test, then signing/
TestFlight/App Store — all per the user's original 12-step plan, now backed
by a project that already exists and a bridge draft that already compiles-or-
doesn't rather than needing to be designed from a blank Xcode project.
