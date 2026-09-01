# TestFlight Release Checklist

Everything needed to cut a real, signed TestFlight build, and its current status.
Last updated after the release-candidate audit pass (2026-09-01).

## Blocked on your input — the only things standing in the way

- [x] **Apple Developer Team ID** — received (`7ZZ8RKB973`), wired into
      `react-native-poc/ios/ExportOptions.plist`'s `teamID` key and `DEVELOPMENT_TEAM` on all 4
      Xcode build configurations (project- and target-level, Debug and Release). iOS signing
      config is now fully complete in code.
- [x] **iOS bundle identifier finalized**: `com.rakeen.pos` (your decision, not a default) —
      `PRODUCT_BUNDLE_IDENTIFIER` set on all 4 Xcode build configurations. Android keeps its own,
      separate, already-confirmed `applicationId` of `com.rakeenpoc` — the two platforms
      deliberately use different identifiers now, per your instruction; this is fine, App Store
      Connect and Google Play each only care about their own platform's identifier.
- [ ] **GitHub Actions quota** — still exhausted; no further CI-triggering pushes will happen
      until you confirm it's resolved. This is now the only thing between here and a real,
      CI-verified, fully-signed archive build.
- [ ] **A real Mac with Xcode** to actually run `xcodebuild archive` /
      `-exportArchive` / upload — this sandbox is Windows and has never been able to do this part
      regardless of Team ID; every prior CI run here only ever produced an unsigned Simulator
      build, by design, to prove the code compiles.
- [ ] **The two backend migrations already deployed** — confirmed, no action needed here anymore.
      The one remaining migration (orphaned-RPC cleanup, see below) is deliberately held per your
      instruction, not urgent.

## Android — release-ready except for CI confirmation

- [x] `applicationId "com.rakeenpoc"` — existing value, treated as confirmed.
- [x] **Real release keystore generated** (`keytool`, PKCS12, RSA 2048, 30-year validity) and
      wired into `build.gradle` via the `keystore.properties` pattern already built. **Sent to you
      separately as a file** — store both the keystore file and its password somewhere durable
      (a password manager) outside this repo. It's gitignored here; losing it means you can never
      publish an update to an app already live on Google Play under this applicationId, with no
      recovery process. Once `keystore.properties` exists (it already does, on this machine, but
      wasn't and won't be committed), `./gradlew assembleRelease`/`bundleRelease` sign with it
      automatically — no further code change needed.
- [ ] `enableProguardInReleaseBuilds` in `build.gradle` is still `false` (unminified release
      build) — deliberately left alone; enabling it without a real device to test against risks
      silently breaking native-module reflection at runtime. Worth reconsidering once real-device
      testing starts, not before.
- [ ] CI hasn't re-confirmed the Android build since the signing scaffold was added (paused per
      your instruction) — the change is additive-only and inert without a real
      `keystore.properties` present, reviewed carefully, but not yet CI-verified.

## iOS — fully configured in code, nothing left to do without a Mac

- [x] Real app icons for every required size (was completely missing before this pass — a
      guaranteed App Store Connect rejection).
- [x] `CODE_SIGN_STYLE = Automatic` set at both project and target level (was entirely unset).
- [x] Real `ExportOptions.plist` for `xcodebuild -exportArchive` (method=app-store, automatic
      signing, symbol upload on), now with the real `teamID`.
- [x] `DEVELOPMENT_TEAM = 7ZZ8RKB973` set on all 4 build configurations (project- and
      target-level, Debug and Release).
- [x] `ITSAppUsesNonExemptEncryption = false` added — the app only uses standard HTTPS/TLS, so
      this answers Apple's export-compliance question once instead of on every build upload.
- [x] Removed a blank, unused `NSLocationWhenInUseUsageDescription` (the app requests no location
      permission anywhere) — a real rejection reason on its own.
- [x] Bundle identifier finalized as `com.rakeen.pos` (your decision, see above) — no longer the
      RN template default.
- [x] Found and fixed a real, separate bug while validating these changes: both `Info.plist` and
      the new `ExportOptions.plist` had `--` inside an XML comment, which is invalid per the XML
      spec — caught by actually parsing both files, not assumed correct. Would have been a
      confusing Xcode build failure the moment either file was touched by a real build.
- [ ] Everything left from here needs a real Mac with Xcode (this sandbox is Windows and was
      never going to be able to do this part): open the project once with your Apple ID signed
      in (Automatic signing will offer to create the App ID / provisioning profile itself), then
      `xcodebuild archive` → `xcodebuild -exportArchive -exportOptionsPlist ExportOptions.plist` →
      upload via Transporter or `xcrun altool`/`xcrun notarytool`. Standard flow, nothing
      project-specific left to figure out in code.

## Backend

- [x] Customer find-or-create restoration — deployed, verified live (new customer creation, phone
      reuse with no duplicate, explicit `customer_id` preservation all confirmed against an
      isolated test business).
- [x] Loyalty points-earning restoration — deployed, verified live (`floor(total / divisor)`
      credited correctly across multiple orders).
- [ ] **Deliberately deferred, not urgent**: a real, pre-existing (not caused by this pass)
      orphaned-function-overload defect on `complete_pos_order`, `register_dine_in_order`,
      `pay_dine_in_order`, and `cancel_dine_in_order` (all four rewritten at some point via
      `create or replace` with a changed parameter count and no matching cleanup). Confirmed
      latent, not an active outage — every real caller in both the PWA and React Native already
      works around it by always passing the newest parameter explicitly. A full scan of every
      function in the migration history for this same pattern found these four and confirmed the
      rest of the codebase (`submit_online_order`'s six real rewrites, `submit_public_reservation`)
      was already handled correctly at every transition — this was an isolated lapse, not a
      systemic habit. Migration drafted, committed, sent to you; held per your instruction.

## Code / CI

- [x] Every mandatory Feature Parity item implemented and CI-verified compiling as of the last
      confirmed-green commit (receipts, printing config, customer management, refunds/void/PIN,
      loyalty, barcode, Bluetooth/USB architecture).
- [x] 6 real bugs found and fixed in receipt/order-flow code this pass (dine-in VAT/items, kitchen
      ticket routing, Arabic names, order-id surfacing, Order History names + reprint).
- [ ] **CI verification paused** — several commits since the last confirmed-green one (receipt
      fixes, app icons, signing prep, iOS bundle ID/export-compliance, orphaned-RPC migration
      extension) are `tsc`-clean and manually reviewed but not CI-confirmed. Nothing will be
      pushed until you confirm the Actions quota is resolved.

## Not done, deliberately deferred (your call, not a hard blocker)

- Crash reporting (Sentry/Bugsnag or similar) — none wired in. Needs a real account/DSN from you;
  not fabricated blind, and not risked as an unverified new native dependency while CI is down.
- Android ProGuard/minification for release builds — see above.
- The real App Store Connect privacy "nutrition label" questionnaire and Google Play's Data
  Safety form are both manual, web-form steps at submission time — not something a code change
  can complete in advance. `PrivacyInfo.xcprivacy`'s required-reason API declarations (file
  timestamp, UserDefaults, system boot time) are already correctly present.

## Real hardware, not fixable in code at all

- Bluetooth (iOS BLE / Android Classic), USB (Android), network printing, cash drawer, and
  Arabic receipt glyph shaping — all real, compiled, CI-linked implementations whose actual
  behavior can only be confirmed on physical Rakeen hardware.

## Exact next steps from here, in order

1. ~~Fill in the real Team ID~~ — done (`7ZZ8RKB973`, wired into `ExportOptions.plist` and all 4
   Xcode build configs).
2. Confirm the CI quota is resolved; push the held commits (several are queued locally, including
   this Team ID wiring); get a fresh green build.
3. On a real Mac: open the project in Xcode with your Apple ID signed in once, let Automatic
   signing provision the App ID.
4. Register the app in App Store Connect with bundle ID `com.rakeen.pos`,
   fill out the privacy questionnaire and export-compliance answer (already pre-answered via
   Info.plist, but App Store Connect may still ask once per app).
5. Archive, export with `ExportOptions.plist`, upload to TestFlight.
6. In parallel: apply `keystore.properties` (already generated, sent to you) if you want an
   Android release/internal-testing build too; `./gradlew bundleRelease` for a Play-ready AAB.
7. Begin real-device acceptance testing (printers, drawer, Bluetooth/USB) — the one thing that
   was never claimed as done from this environment.
