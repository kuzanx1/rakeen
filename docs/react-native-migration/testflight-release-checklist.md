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

## Getting the first build into TestFlight from Windows — no Mac needed

You have no local Mac. The real, no-new-service answer: **GitHub's own hosted macOS runners** —
the same Actions infrastructure already running this project's CI, not a separate paid cloud-Mac
rental. A new workflow, `.github/workflows/ios-testflight-release.yml`, is already written and
committed (held, not pushed yet) — it's `workflow_dispatch`-only, meaning it **never runs
automatically on a push**, only when you click "Run workflow" on GitHub.com. It won't touch your
Actions quota until you deliberately trigger it.

It builds and uploads via **Fastlane** (`react-native-poc/ios/fastlane/Fastfile`, lane `beta`),
authenticating with an App Store Connect API key — no Apple ID password, no 2FA prompt, works
non-interactively in CI. It needs 5 GitHub repository secrets first. Here is exactly how to get
each one, all achievable without a Mac:

### 1. Distribution certificate (started for you)
A real private key + CSR were generated with `openssl` (no Mac required — this sandbox doesn't
have one either) and sent to you as two files. Do this:
1. Go to [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles
   → Certificates → **+** → choose **Apple Distribution**.
2. Upload `ios_distribution.csr` when asked for a CSR.
3. Download the resulting certificate (a `.cer` file).
4. Convert it alongside the private key you were sent (needs `openssl`, already installed if
   you're on a machine with Git for Windows — same toolchain used to generate the CSR):
   ```bash
   openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM
   openssl pkcs12 -export -inkey ios_distribution.key -in distribution.pem \
     -out distribution.p12 -password pass:CHOOSE_A_PASSWORD_HERE
   base64 -w0 distribution.p12 > distribution.p12.base64.txt
   ```
5. `IOS_DISTRIBUTION_CERTIFICATE_BASE64` = the contents of `distribution.p12.base64.txt`.
   `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` = whatever you chose above.

### 2. App ID + provisioning profile
1. Apple Developer portal → Identifiers → **+** → App IDs → register `com.rakeen.pos`.
2. Profiles → **+** → **App Store** distribution → select the `com.rakeen.pos` App ID → select
   the distribution certificate from step 1 → download the resulting `.mobileprovision`.
3. `IOS_PROVISIONING_PROFILE_BASE64` = `base64 -w0 the-profile.mobileprovision`.

### 3. App Store Connect API key
1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Users and Access →
   Integrations → App Store Connect API → **Generate API Key** (Admin or App Manager role).
2. Download the `.p8` file **immediately** — Apple only lets you download it once.
3. `ASC_KEY_ID` = the Key ID shown on that page. `ASC_ISSUER_ID` = the Issuer ID shown above the
   key list. `ASC_KEY_CONTENT_BASE64` = `base64 -w0 AuthKey_XXXXXXXXXX.p8`.

### 4. Add the 5 secrets and run it
GitHub repo → Settings → Secrets and variables → Actions → New repository secret, once for each
of: `IOS_DISTRIBUTION_CERTIFICATE_BASE64`, `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`,
`IOS_PROVISIONING_PROFILE_BASE64`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT_BASE64`.

Then: confirm your Actions quota is resolved, push the held commits (this new workflow among
them), go to the Actions tab → "iOS TestFlight Release" → **Run workflow**. That single run
builds a real signed archive and uploads it straight to TestFlight — no Mac, no Xcode UI, ever
required on your end.

**Disclosed honestly**: this Fastfile/workflow is written to the well-established, standard
Fastlane CI pattern, carefully reviewed, but genuinely **unverified** — there's no Ruby/fastlane
runtime available in this sandbox to test it, and it's never been run for real. The first
`workflow_dispatch` run is also its first real test; if it fails, the uploaded build log artifact
will show exactly where.

## After that

1. In parallel, for Android: `keystore.properties` is already generated and sent to you —
   `./gradlew bundleRelease` locally or via a similar manually-triggered Actions workflow produces
   a signed, Play-ready AAB whenever you want one (not yet built — say the word if you want this
   same workflow_dispatch treatment for Android too).
2. Fill out the App Store Connect privacy questionnaire and Google Play's Data Safety form
   (manual, one-time, web-only steps neither Fastlane nor this repo can do for you).
3. Begin real-device acceptance testing (printers, drawer, Bluetooth/USB) — the one thing that
   was never claimed as done from this environment, and still isn't.
