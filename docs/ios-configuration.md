# iOS Configuration Requirements

Written on Windows, cross-referenced against the actual generated Xcode
project (`ios/App/`, created by a real `npx cap add ios` run — see
`docs/windows-complete-mac-required.md` for what that run did and didn't
prove). Everything below is either **already applied** to a file in this
repo, or **a decision that needs to be made on/before the Mac**, never a
guess presented as settled.

## 1. Local Network permission — ✅ applied

`ios/App/App/Info.plist` now has:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>يحتاج التطبيق الوصول للشبكة المحلية للاتصال بالطابعة الحرارية ودرج النقود المتصلين عبر نفس شبكة الواي فاي.</string>
```

Required because `PrinterBridge.swift` opens a raw `NWConnection` to a LAN
IP (the receipt printer / drawer controller) — iOS 14+ shows a one-time
system permission prompt ("Rakeen Cashier would like to find and connect to
devices on your local network") the first time any local-network socket is
opened, gated by this string being present.

**`NSBonjourServices` is deliberately NOT added.** That key is only needed
when using `NWBrowser`/Bonjour service *discovery* — this app never
discovers a printer, it connects directly to a fixed IP the cashier/owner
configures in Settings (`DEVICE.printerIp`). A direct `NWConnection` to a
known IP:port does not require declaring Bonjour service types.

**Needs Mac to confirm**: the exact wording/timing of the system permission
prompt, and that a cashier declining it once doesn't need an unrecoverable
app reinstall to reconsider (standard iOS behavior lets you flip it in
Settings → Privacy → Local Network → Rakeen Cashier, but this hasn't been
seen on a real device from here).

## 2. App Transport Security — not needed, reasoned not guessed

No ATS exception has been added, and none should be needed:

- The WKWebView's only network traffic is HTTPS to `rakeenapp.com`
  (`capacitor.config.ts`'s `server.url`), which already has a valid TLS
  certificate via Cloudflare — this is exactly what ATS's default policy
  allows with zero configuration.
- The printer/drawer transport (`PrinterBridge.swift`) uses `Network.framework`
  (`NWConnection`) directly, **not** `URLSession`/`WKWebView` — ATS only
  governs HTTP(S) requests made through Apple's URL-loading APIs. A raw TCP
  socket to a LAN printer's IP:port is entirely outside ATS's scope by
  design (this is standard, documented Apple platform behavior, not
  something specific to this app).

If a real device later shows an ATS-related failure, that would mean
something in this reasoning was wrong for the specific iOS version in use —
classify and fix it then rather than adding a speculative exception now.

## 3. Bundle ID — placeholder, needs a real decision

`capacitor.config.ts` and the generated Xcode project currently use
`com.rakeen.cashier` as a placeholder `appId`. This is not a technical
blocker — `cap add ios` and `cap sync ios` both ran successfully with it —
but it **must** be replaced with whatever bundle identifier is registered
(or will be registered) in the Apple Developer account before any real
signing/TestFlight/App Store step. Changing it later is a rename in Xcode
(target settings → Bundle Identifier) plus re-running `npx cap sync ios`,
not a rebuild from scratch.

## 4. Capabilities — none added yet; one open decision to make on Mac

No Xcode "Capabilities" (Signing & Capabilities tab) have been enabled —
none are strictly required for what's built so far. One is worth deciding
before or during the Xcode phase, not silently added here since it's a real
behavior change, not just config:

- **Background Modes → Background Fetch / Background Processing**: today,
  `syncQueue()`/`processPrintQueue()` run on a foreground `setInterval` plus
  `online` event triggers (see `public/pos/rakeen-pos.js`) — this only runs
  while the app is in the foreground, same as the browser PWA today. Without
  a Background Modes capability, an iOS app's JS timers are suspended
  shortly after backgrounding (standard iOS behavior), so a queued order or
  print job will sit untouched until the cashier reopens the app — at which
  point the existing boot-time sync/reset logic (`resetInterruptedPrintJobsOnBoot`,
  the `online` listener, `syncQueue()`'s own boot call) picks it up
  correctly, so **nothing is lost**, it just doesn't flush in the
  background. Enabling Background Fetch would let queued items sync sooner
  without the app being frontmost, at the cost of Apple's background-fetch
  time budget and added complexity. Left as an explicit decision for later
  rather than assumed — flag if this matters for the real usage pattern
  (e.g. a cashier who frequently backgrounds the app mid-shift).

## 5. How the native bridge is wired into the WKWebView

Documented in full in the Swift files themselves
(`ios/App/App/MainViewController.swift`, `ios/App/App/PrinterBridge.swift`);
summarized here:

1. `Base.lproj/Main.storyboard`'s root view controller's `customClass` was
   changed from Capacitor's default `CAPBridgeViewController` to a new
   `MainViewController` (subclassing it) — a real edit to the storyboard XML,
   applied and diffable, but its correctness can only be confirmed by
   opening the project in Xcode.
2. `MainViewController.capacitorDidLoad()` reaches into
   `self.webView?.configuration.userContentController` and: (corrected —
   an earlier draft used `self.bridge?.webView`, which a real compile on
   GitHub Actions rejected with "value of type 'MainViewController' has no
   member 'bridge'"; `webView` is a direct property on
   `CAPBridgeViewController` itself in this Capacitor version)
   - registers two `WKScriptMessageHandler` channels
     (`androidPrintBridge`, `nativeCashDrawerBridge`)
   - injects a `WKUserScript` (`.atDocumentStart`) that defines
     `window.AndroidPrint` and `window.NativeCashDrawer` exactly per
     `docs/ios-native-bridge-interfaces.md` §1/§2 — same global names,
     same method shapes, same callback globals
     (`window.__androidPrintCallback`, `window.__nativeCashDrawerCallback`)
     that `rakeen-pos.js` already calls today.
3. `printRaw`/`kick` calls from JS post a message to native; native opens an
   `NWConnection` via `PrinterBridge.send(...)` and calls back into JS via
   `webView.evaluateJavaScript(...)`.

**Why not a standard Capacitor plugin**: a Capacitor plugin surfaces as
`window.Capacitor.Plugins.<Name>`, which would require changing
`rakeen-pos.js`'s existing `window.AndroidPrint`/`window.NativeCashDrawer`
calls — explicitly out of scope per the instruction not to touch the web
contract. The `WKUserScript` approach keeps the web layer byte-for-byte
unchanged.

**Everything in this section is 🟡 prepared, not ✅ verified** — it has
never been compiled (no Swift toolchain on Windows) or run in a WKWebView.
