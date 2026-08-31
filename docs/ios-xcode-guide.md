# Xcode Guide — From `npx cap add ios` to Running on a Real iPad

This is written for whoever has the Mac. Steps 1–9 have already happened —
some on Windows, one for real on a GitHub Actions macOS runner — and are
committed to this repo; they're listed for context, marked done, not to be
re-run unless something looks wrong. Steps 10+ genuinely need a local
Mac/Xcode and physical hardware, and have not been attempted from here.

## Already done

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
   itself.
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
8. **The native bridge implementation** — `ios/App/App/MainViewController.swift`,
   `ios/App/App/PrinterManager.swift`, `ios/App/App/PrinterTransport.swift`,
   and `ios/App/App/NetworkPrinterTransport.swift` — implements
   `docs/ios-native-bridge-interfaces.md` §1/§2 behind a small transport
   abstraction (§4 of that doc): PrintQueue (web) → `PrinterManager` →
   `PrinterTransport` → physical printer, so a second transport
   (Bluetooth/USB) can be added later without touching the web layer or
   `MainViewController`.
9. **A GitHub Actions workflow** (`.github/workflows/ios-build.yml`) builds
   this project on a real `macos-14` runner (Xcode 15.4, Swift 5.10) on
   every push touching `ios/**`/`capacitor.config.ts`/`package.json`. As of
   this writing it has run to a real **`** BUILD SUCCEEDED **`**, with all
   four Swift files above confirmed compiled into the real `App` target
   (not just present on disk — an earlier run caught exactly that failure
   mode: two files existed but weren't registered in `project.pbxproj`'s
   Sources build phase, so Xcode silently skipped them; a CI step now greps
   the build log for every bridge filename so that can't regress silently).
   Three rounds of *real* compiler errors were found and fixed this way
   (wrong workspace path, missing project registration, a wrong Capacitor
   API property name) — see `docs/windows-complete-mac-required.md` for the
   full list. **This proves the Swift compiles — it does not prove printing
   works.** Nothing has run against a real WKWebView on a device or a real
   printer.

None of the above required a local Xcode/macOS to produce, including the CI
build itself — GitHub's macOS runners did the actual compiling; every step
that produced or fixed a file was still just editing plain text (Swift
source, XML, YAML) from Windows, guided by real compiler errors read back
from the CI logs. What follows genuinely cannot be done from here.

## From here on — needs a Mac

### 10. Open the project

```
open ios/App/App.xcodeproj
```

There is no `.xcworkspace` in this project (see the correction note above) —
open the `.xcodeproj` directly. Capacitor's SPM integration
(`CapApp-SPM`) is wired in as a local Swift package reference inside the
`.xcodeproj` itself.

### 11. Let Swift Package Manager resolve

Xcode should automatically resolve `CapApp-SPM/Package.swift`'s
dependencies (Capacitor's own Swift packages) on first open — this needs
network access and is the first genuinely Mac-only step (the CI build
already does this successfully on GitHub's runner, so it should resolve
the same way locally; if it doesn't, something differs between the two
environments and is worth understanding before debugging further). Watch
the "Swift Package Manager" status in Xcode's activity area.

### 12. Fix the Bundle Identifier

In the App target → Signing & Capabilities tab, replace the placeholder
`com.rakeen.cashier` with the real registered bundle ID (see
`docs/ios-configuration.md` §3) if a different one has been chosen. Set the
Team to the correct Apple Developer account/team.

### 13. First local build — should just work, but confirm it

Build for a Simulator first (e.g. "iPad Pro 13-inch"), not a real device.
The CI build already proves this project compiles cleanly on a real
macOS/Xcode toolchain (`docs/windows-complete-mac-required.md`) — this step
is mainly to confirm the local Mac's Xcode/SDK setup produces the same
result, not to discover fresh compile errors. If it *doesn't* build cleanly
locally, compare the local Xcode/SDK version against what CI used
(Xcode 15.4, iOS 17.5 SDK) — a version mismatch is the most likely cause of
any divergence, not a code problem.

### 14. Run on Simulator — verify the bridge is even reachable

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
mirror a real device's local-network permission prompt) — that needs step 16.

### 15. Local Network permission prompt — first real-device-only check

Run on a real iPad connected to the same Wi-Fi as the printer. The first
time `printRaw`/`kick` actually opens an `NWConnection`, iOS should show
the local-network permission prompt (see `docs/ios-configuration.md` §1).
Confirm it appears, confirm accepting it lets a real connection attempt
proceed, and confirm declining it produces a clean
`connection_refused`/`connection_error`-style failure through the existing
print-queue retry UI rather than a crash.

### 16. Real printer / drawer testing

The first real hardware target is a **SUNMI/Goodics NT310** (80mm kitchen
cloud printer) over Ethernet/LAN — see `docs/ios-nt310-test-plan.md` for
the model-specific test plan, and `docs/ios-hardware-test-plan.md` for the
general printer/drawer/offline-first test matrix. This is the first point
where actual ESC/POS output, Arabic rendering, cut, and drawer kick can be
judged against reality instead of a mock.

### 17. Everything after that

Local Network permission across app reinstall, backgrounding/termination
behavior, offline/airplane-mode testing, Bluetooth/USB evaluation once a
second printer model is in hand, full Hardware Acceptance Test, then
signing/TestFlight/App Store — all per the user's original 12-step plan,
now backed by a project that already exists and compiles, and a transport
abstraction (`docs/ios-native-bridge-interfaces.md` §4) designed so
supporting more printer models later doesn't mean redesigning any of this.
