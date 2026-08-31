# Getting a Trial Build Onto a Real iPad — Distribution Options

Written to prepare the Taif hardware session (iPad + SUNMI/Goodics NT310)
in advance.

## The real constraint: no Mac locally, no paid Apple Developer account

Both of Apple's own official non-App-Store distribution channels —
**TestFlight and Ad Hoc** — require a paid Apple Developer Program
membership ($99/year); this is confirmed directly from Apple's own
documentation, not assumed. Neither has a free-tier path. If a Mac can't
be physically present with the iPad either (ruling out plain
Xcode-over-USB), there is no *Apple-official* zero-cost, zero-local-Mac
path.

**The real, working answer for exactly this situation is SideStore**
(an actively maintained, open-source fork of AltStore — not a jailbreak,
not piracy; a legitimate community tool built specifically for free-Apple-ID
sideloading), confirmed against its own official documentation
(docs.sidestore.io):
- A computer is needed **only once** — to install SideStore itself onto
  the iPad. This can happen at any point before the iPad travels to Taif
  (e.g. with the Riyadh Mac), or with any computer available at all.
- **After that one-time setup, installing/updating apps happens entirely
  from the iPad itself** — no computer, no Xcode, no cable, from Taif or
  anywhere else. SideStore re-signs whatever `.ipa` it's given using the
  free Apple ID's own certificate; the `.ipa` doesn't need to be signed by
  anything else beforehand.
- **Real limitations, stated plainly**: a free Apple ID can have at most 3
  apps installed via SideStore at once (including SideStore itself), and
  at most 10 different app installs per rolling week. Apps still need a
  background refresh roughly every 7 days (SideStore automates this on its
  own). SideStore is in public beta, unofficial (no Apple support), and
  there's a documented real risk of Apple ID lockout tied to older
  "Anisette servers" it depends on for device authentication.

## 1. SideStore — recommended for the actual "iPad in Taif, no Mac" scenario

**Cost**: $0, no Apple Developer account. **Needs**: a free Apple ID, the
iPad, and a computer **once** (any OS — doesn't have to be a Mac; SideStore
itself has a Windows/macOS/Linux companion installer for that one-time
step) to install SideStore onto the iPad before it travels to Taif.

**A real, working, correctly-structured unsigned `.ipa` for Rakeen Cashier
is already built and proven in CI** — GitHub Actions run
[33430839073](https://github.com/kuzanx1/rakeen/actions/runs/33430839073),
job `device-ipa`, artifact `rakeen-cashier-unsigned-ipa`. Downloaded and
inspected directly: 18.7MB, real `Payload/App.app/App` binary, storyboards
compiled, resources bundled — exactly the shape SideStore expects to
re-sign and install. **Not yet confirmed that SideStore itself accepts and
installs it** — that step genuinely needs the real iPad with SideStore on
it; everything provable from CI has been proven.

Steps:
1. (One-time, needs a computer) Install SideStore on the iPad following
   docs.sidestore.io's own setup guide, signed in with a free Apple ID.
2. Download `rakeen-cashier-unsigned.ipa` from the GitHub Actions run above
   (or trigger a fresh run — this workflow re-runs on every push touching
   `ios/**`) directly onto the iPad (Files app, AirDrop, email — anything
   that gets the file onto the device).
3. Open it with SideStore, let it sign and install. From this point on,
   updating to a newer build is the same two steps, entirely from the
   iPad, no computer involved.

**Real limitations, stated plainly**: max 3 apps installed via SideStore
at once (including SideStore itself) on a free Apple ID, max 10 different
app installs per week, ~7-day background refresh (automated by SideStore),
beta/unofficial status, and a documented Apple-ID-lockout risk from older
"Anisette servers" — see docs.sidestore.io's own FAQ for the current, most
accurate detail on all of this, since it's third-party tooling this
project doesn't control.

## 2. Free "Personal Team" direct install via Xcode — only if a Mac happens to be on-site anyway

**Cost**: $0. **Needs**: a Mac with Xcode, a free Apple ID, the iPad, and a
USB cable or same-Wi-Fi wireless debugging (already required anyway — the
existing test plan (`docs/ios-nt310-test-plan.md`) needs Xcode's Safari Web
Inspector attached to the device regardless, so a Mac being physically
present in Taif is already the plan, not new overhead).

Steps (for whoever has the Mac + iPad in Taif):
1. Open `ios/App/App.xcodeproj` in Xcode.
2. Sign in with any Apple ID under Xcode → Settings → Accounts (a plain
   free Apple ID works — no payment, no enrollment).
3. In the App target's Signing & Capabilities tab, select that Apple ID's
   "Personal Team" and enable "Automatically manage signing." Xcode
   registers the bundle ID (`com.rakeen.cashier`, or whatever it's changed
   to — see `docs/ios-configuration.md` §3) under that free account
   automatically.
4. Connect the iPad via USB (or pair it wirelessly in Xcode's Devices
   window once, then disconnect the cable), select it as the run
   destination, press Run.
5. **First launch will be blocked by iOS** with an "Untrusted Developer"
   prompt — on the iPad, go to Settings → General → VPN & Device
   Management, trust the developer certificate once, then relaunch the
   app from the Home Screen.

**Real limitations of this path** (not glossed over):
- The app **stops working after 7 days** and needs re-running from Xcode
  to renew — a free-account provisioning profile's validity window. Fine
  for a single hardware test session; not viable for ongoing use without
  a Mac nearby every week.
- A free Apple ID can have **at most 3 apps signed this way per rolling
  7-day window**, and only a limited number of registered devices per
  year — a real constraint if other apps are also being sideloaded this
  way on the same Apple ID, but not a concern for a single Rakeen Cashier
  install on one iPad.
- No TestFlight, no remote install — the Mac must be physically connected
  (once) to that specific iPad.

Only relevant if a Mac ends up physically present anyway (e.g. for Web
Inspector debugging during the actual printer test) — in that case this
is simpler than SideStore for that one session, but doesn't solve
"install without a Mac," which is the real constraint stated for Taif.

## 3. TestFlight via a paid Apple Developer Program membership

**Cost**: $99/year, and requires Apple's own identity-verification
enrollment (can take anywhere from minutes to a couple of days). **Needed
for**: installing without a Mac physically present at the test site,
giving a build to someone else to test remotely, builds that last 90 days
instead of 7, and is the same account eventually required for a real App
Store release.

If this membership exists (or is obtained before Taif), the distribution
pipeline can be **fully automated through the same GitHub Actions setup
already proven in this project** — no local Mac needed even for the build/
upload step, only for the actual on-device Web Inspector debugging that
printer testing needs. Concretely, this would mean adding to
`.github/workflows/ios-build.yml` (or a new workflow):
1. `xcodebuild archive` (Release configuration, real code signing this
   time — the current CI job deliberately uses
   `CODE_SIGNING_ALLOWED=NO` for the Simulator-only build proof).
2. `xcodebuild -exportArchive` with an export options plist targeting
   App Store/TestFlight distribution.
3. Upload via `xcrun altool --upload-app` or the newer App Store Connect
   API (`xcrun notarytool`/App Store Connect API key) to App Store Connect.
4. Add the build to a TestFlight internal testing group; the tester
   installs the free **TestFlight** app from the App Store and accepts an
   email/link invite — no cable, no Xcode, works from anywhere.

**What this environment would need from the user to wire this up** — and
will never obtain or guess on its own:
- Confirmation a paid Apple Developer Program membership exists (or a
  decision to enroll before Taif).
- A **distribution certificate + provisioning profile** (or, simpler for
  CI, an **App Store Connect API key** — issuer ID, key ID, and a `.p8`
  private key file, generated by the account holder in App Store Connect →
  Users and Access → Integrations).
- These get added as **GitHub encrypted repository secrets** by whoever
  owns the Apple Developer account — never typed into chat, never handled
  by this session directly. This is a credentials-handling boundary this
  environment will not cross.
- A real, final Bundle ID decision (the current `com.rakeen.cashier`
  placeholder needs to be registered for real in the Apple Developer
  account either way).

## Recommendation

Use **§1, SideStore** for getting the trial build onto the iPad in Taif —
it's the only path that actually matches the stated constraint (no Mac
locally, no paid account), a real unsigned `.ipa` is already built and
ready, and the one-time SideStore setup can happen whenever a computer is
next available, independent of the Taif trip itself. Treat **§3,
TestFlight** as the natural next step once broader/remote testing or an
eventual App Store release is the actual goal — at that point, tell me
whether a paid Developer Program membership exists, and I can prepare the
actual signed-archive-and-upload GitHub Actions workflow against it (the
secrets themselves still have to come from the account owner, added
directly in GitHub's own Settings → Secrets UI, not through this chat).
