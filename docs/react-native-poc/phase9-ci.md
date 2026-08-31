# Phase 9 — CI Builds (Real, Not Claimed)

`.github/workflows/react-native-poc-build.yml` — two independent jobs,
both on real GitHub-hosted runners, triggered on every push touching
`react-native-poc/**`.

## iOS (Swift)

- **Runner**: `macos-15` (macOS 15.7.7), Xcode **16.4**.
- **Real error hit and fixed on the first attempt**: `macos-14`'s bundled
  Xcode 15.4 is too old for this React Native version — the actual
  CocoaPods error was `React Native requires XCode >= 16.1. Found 15.4.`
  Fixed by switching runners, not by guessing at a workaround.
- **Result**: `** BUILD SUCCEEDED **`
  ([run 33436732039](https://github.com/kuzanx1/rakeen/actions/runs/33436732039)),
  with all four new Swift files (`RakeenPrinterModule.swift`,
  `RakeenCashDrawerModule.swift`, `RakeenDeviceModule.swift`,
  `NetworkPrinterTransport.swift`) confirmed present in the build log 20
  times total across compile-related lines — verified directly, not just
  trusted from the green checkmark.

## Android (Kotlin)

- **Runner**: `ubuntu-latest` — no macOS needed at all for Android, a real,
  meaningful cost/speed difference from iOS worth carrying into Phase 10.
- **Result**: succeeded on the **first attempt**, no errors to fix. Real
  debug APK built (`app-debug.apk`, 123MB — normal for an unminified
  multi-ABI RN debug build), downloaded and inspected directly: contains a
  real 11.8MB `classes.dex`. The CI's own verification step (grepping for
  each module's actual compiled `.class` file under `app/build`, not just
  a green Gradle exit code) passed for all five Kotlin files
  (`RakeenPrinterModule`, `RakeenCashDrawerModule`, `RakeenDeviceModule`,
  `RakeenPackage`, `NetworkPrinterTransport`).

## What this proves, and what it doesn't

**Proves**: the React Native POC — TypeScript contracts, Swift native
modules, Kotlin native modules, and the POC screen wiring them together —
compiles for real on both platforms' real toolchains.

**Does not prove**: that the app launches, that `NativeModules.RakeenPrinterModule`
actually resolves at runtime, or that anything prints or opens a drawer.
Unlike the Capacitor project's CI (which went further — booting a real iOS
Simulator, installing and launching the app, screenshotting the real
loaded page), this POC's CI stops at "compiles," matching the narrower
scope Phase 7 was given (one screen, prove the pattern, not a full launch/
runtime smoke test on two platforms). This is a real, deliberate scope
difference, not an oversight.
