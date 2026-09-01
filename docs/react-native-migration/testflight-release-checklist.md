# TestFlight Release Checklist

Everything needed to cut a real, signed TestFlight build, and its current status.

## Blocked on your input (nothing else can proceed on these until provided)

- [ ] **Apple Developer Team ID** (10 characters, Apple Developer account → Membership) →
      goes into `react-native-poc/ios/ExportOptions.plist`'s `teamID` key (currently a
      placeholder) and Xcode's signing UI once opened with a real Apple ID.
- [ ] **Final iOS bundle identifier** — still `org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)`
      (the React Native template default) in `react-native-poc/ios/RakeenPOC.xcodeproj/project.pbxproj`.
      Permanent once first used for a real App Store Connect app record — decide deliberately.
- [ ] **Android `applicationId` confirmation** — currently `com.rakeenpoc`
      (`react-native-poc/android/app/build.gradle`). Same permanence rule as iOS: can't change
      after the first Play Console upload.
- [ ] **Real Android release keystore** — generate with the command in
      `react-native-poc/android/keystore.properties.example`, then copy that file to
      `keystore.properties` (gitignored) in the same directory with the real values filled in.
      `build.gradle` already reads it automatically when present and falls back to the debug
      key when it's absent, so no further code change is needed once the file exists.

## Backend — deployed and verified

- [x] Customer find-or-create restoration (`complete_pos_order`) — deployed, verified live
      against an isolated test business: new customer creation, phone reuse (no duplicate),
      explicit `customer_id` preservation all confirmed.
- [x] Loyalty points-earning restoration (`complete_pos_order`) — deployed, verified live:
      `floor(total / loyalty_points_divisor)` credited correctly across multiple orders.
- [ ] **Deferred, not urgent**: an orphaned pre-`customer_id` overload of `complete_pos_order`,
      `register_dine_in_order`, and `pay_dine_in_order` still exists in the database (real,
      pre-existing defect from `20260829200000`, confirmed latent — every real caller already
      works around it by always passing `customer_id` explicitly). Fix migration drafted and
      sent, application deferred at your request.

## Code / CI

- [x] Every mandatory Feature Parity item implemented (receipts, printing config, customer
      management, refunds/void/PIN, loyalty, barcode, Bluetooth/USB architecture).
- [x] 6 real bugs found and fixed in receipt/order-flow code (dine-in VAT/items, kitchen ticket
      routing, Arabic names, order-id surfacing, Order History names + reprint).
- [x] Real app icons (iOS + Android) generated from the project's own Rakeen mark; unused blank
      location-permission string removed.
- [x] `CODE_SIGN_STYLE = Automatic` set (was entirely unset); real `ExportOptions.plist` added.
- [x] Android release-signing scaffold added (`keystore.properties` pattern, safe no-op until a
      real keystore exists).
- [ ] **CI verification paused** — GitHub Actions minutes quota exhausted on this private repo.
      The last several commits (receipt fixes, app icons, signing prep) are `tsc`-clean and
      manually reviewed, but not CI-confirmed. No further CI-triggering pushes will happen until
      you confirm the quota is resolved (Settings → Billing → Actions).

## Not done, deliberately deferred (your call, not a hard blocker)

- Crash reporting (Sentry/Bugsnag or similar) — none wired in. Needs a real account/DSN from you;
  not fabricated blind.
- Android release minification/ProGuard (`enableProguardInReleaseBuilds` in `build.gradle`) is
  still `false` — enabling it without a real device to test against risks silently breaking
  native-module reflection at runtime; worth reconsidering once real-device testing starts, not
  before.

## Real hardware, not fixable in code at all

- Bluetooth (iOS BLE / Android Classic), USB (Android), network printing, cash drawer, and
  Arabic receipt glyph shaping — all real, compiled, CI-linked implementations whose actual
  behavior can only be confirmed on physical Rakeen hardware.
