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
non-interactively in CI. It needs **6** GitHub repository secrets (verified by grepping both the
Fastfile and the workflow file directly — an earlier draft of this doc said 5, which was wrong).

Every step below is sequential — do them in this order. Every field value is exact; none of them
require a judgment call except the two passwords you invent yourself in step 5.

### Step 1 — Apple Developer portal: create the Distribution Certificate
Go to [developer.apple.com/account](https://developer.apple.com/account/resources/certificates/list).
1. Certificates → click **+**.
2. Under "Software", select **Apple Distribution** → Continue.
3. When asked for a CSR file, upload `ios_distribution.csr` (already generated for you, sent
   earlier this session — real 2048-bit RSA key, no Mac needed to make it).
4. Continue → **Download** the certificate. It saves as a `.cer` file (e.g. `distribution.cer` or
   similar — the exact filename doesn't matter, you'll reference it by path in step 5).

### Step 2 — Apple Developer portal: register the App ID
[developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list)
1. Identifiers → click **+** → select **App IDs** → Continue → select **App** (not App Clip) → Continue.
2. Description: any label you want (e.g. `Rakeen POS`).
3. Bundle ID: select **Explicit**, enter exactly `com.rakeen.pos`.
4. Capabilities: leave everything unchecked — nothing this build uses (Bluetooth, network sockets)
   needs an App ID capability, only an Info.plist usage description, which is already set.
5. Continue → Register.

### Step 3 — Apple Developer portal: create the App Store provisioning profile
[developer.apple.com/account/resources/profiles/list](https://developer.apple.com/account/resources/profiles/list)
1. Profiles → click **+**.
2. Under "Distribution", select **App Store Connect** → Continue.
3. App ID: select `com.rakeen.pos` (from step 2) → Continue.
4. Certificates: select the Distribution certificate from step 1 → Continue.
5. Profile Name: any label (e.g. `Rakeen POS App Store`) → Generate → **Download**. It saves as a
   `.mobileprovision` file.

### Step 4 — App Store Connect: create the app record
This has to exist before a build can be uploaded to it.
[appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps)
1. My Apps → click **+** → **New App**.
2. Platforms: check **iOS**.
3. Name: your choice (this is the public-facing App Store name, changeable later).
4. Primary Language: your choice (e.g. Arabic (Saudi Arabia) or English).
5. Bundle ID: select `com.rakeen.pos` from the dropdown — it only appears here because step 2
   already registered it; if it's missing, step 2 didn't save correctly.
6. SKU: any unique string you choose (e.g. `rakeenpos001`) — internal to App Store Connect, never
   shown publicly.
7. User Access: Full Access → Create.

### Step 5 — Your machine: build the 3 files these secrets need
You'll have by now: `distribution.cer` (step 1), `ios_distribution.key` (sent to you earlier,
the private half of that same certificate), and the `.mobileprovision` file (step 3). Open a
terminal in the folder with all three.

**If using Git Bash / WSL / any bash shell** (this sandbox verified all of these commands work
on Windows via Git Bash, including `openssl` and GNU `base64`):
```bash
# Convert Apple's downloaded certificate to PEM
openssl x509 -in distribution.cer -inform DER -out distribution.pem -outform PEM

# Combine with the private key into a .p12 -- CHOOSE_A_PASSWORD_HERE is a password
# YOU invent right now; write it down, it's one of the 6 secret values below.
openssl pkcs12 -export -inkey ios_distribution.key -in distribution.pem \
  -out distribution.p12 -password pass:CHOOSE_A_PASSWORD_HERE

# Base64-encode all 3 files, one line each, ready to paste as secrets
base64 -w0 distribution.p12 > distribution.p12.b64.txt
base64 -w0 YOUR_PROFILE_NAME.mobileprovision > profile.b64.txt
base64 -w0 AuthKey_XXXXXXXXXX.p8 > asckey.b64.txt
```

**If using PowerShell instead**, the same 3 base64 conversions (do the `openssl` commands above
in Git Bash first, PowerShell has no built-in equivalent to `openssl pkcs12 -export`):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("distribution.p12")) | Set-Content -NoNewline distribution.p12.b64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("YOUR_PROFILE_NAME.mobileprovision")) | Set-Content -NoNewline profile.b64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Content -NoNewline asckey.b64.txt
```

### Step 6 — App Store Connect: create the API key (gives you the 3 remaining values)
Requires the **Account Holder or Admin** role — if that's not you, whoever is Admin needs to do
this one step.
[appstoreconnect.apple.com/access/api](https://appstoreconnect.apple.com/access/integrations/api)
1. Users and Access → **Integrations** tab → App Store Connect API.
2. Click **Generate API Key** (or **+**).
3. Name: any label (e.g. `Rakeen CI`).
4. Access: select **App Manager** (sufficient to upload builds; Admin also works if you prefer).
5. Generate → **Download API Key immediately** — Apple shows the `.p8` file download link
   exactly once, on this screen, and it cannot be re-downloaded later. If you miss it, you must
   revoke this key and generate a new one.
6. On the same page, note down (both stay visible on this page afterward, unlike the key file):
   - the **Key ID** shown in that key's row
   - the **Issuer ID** shown at the top of the page, above the key list (same value for every
     key on this account, not per-key)

### Step 7 — The exact 6 GitHub secrets, name by name
GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**,
once for each row:

| Secret name | Value | Source |
|---|---|---|
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | contents of `distribution.p12.b64.txt` | Step 5 |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | the password you invented in step 5's `pass:` argument | You chose it in Step 5 |
| `IOS_PROVISIONING_PROFILE_BASE64` | contents of `profile.b64.txt` | Step 5 |
| `ASC_KEY_ID` | the Key ID | Step 6 |
| `ASC_ISSUER_ID` | the Issuer ID | Step 6 |
| `ASC_KEY_CONTENT_BASE64` | contents of `asckey.b64.txt` | Step 5 (encoding the file from Step 6) |

### Step 8 — Run it
Confirm your Actions quota is resolved → tell me, I'll push the held commits (including this
workflow) → GitHub repo → **Actions** tab → **iOS TestFlight Release** (left sidebar) →
**Run workflow** button → confirm on the default branch → Run.

That single run builds a real signed archive and uploads it straight to TestFlight. No Mac, no
Xcode UI, at any point in this whole sequence.

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
