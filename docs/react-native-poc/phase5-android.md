# Phase 5 — Android Native Module (Kotlin)

Real files: `react-native-poc/android/app/src/main/java/com/rakeenpoc/`:
- `NetworkPrinterTransport.kt` — plain `java.net.Socket`, same error-string
  conventions as the iOS side (`connection_refused`/`connection_timeout`/
  `host_unreachable`/`connection_error`) deliberately kept identical so
  `Printer.print()`'s JS-facing failure modes don't differ by platform.
  Runs on a background `Thread` (Android throws
  `NetworkOnMainThreadException` for socket I/O on the main thread —
  a real platform difference from iOS that has no equivalent constraint,
  handled here rather than glossed over).
- `RakeenPrinterModule.kt` / `RakeenCashDrawerModule.kt` /
  `RakeenDeviceModule.kt` — same method names, same argument shapes, same
  JS-facing contract as the iOS Swift modules
  (`react-native-poc/src/platform/printer.ts` resolves to whichever one is
  actually running).
- `RakeenPackage.kt` — registers all three; wired into
  `MainApplication.kt`'s `PackageList(...).packages.apply { add(RakeenPackage()) }`.

**A genuine, real difference from iOS worth noting**: Android's Gradle
build auto-discovers every `.kt` file under `src/main/java` by directory
convention — there is no Android equivalent of Xcode's `project.pbxproj`
file-registration step, and therefore no equivalent of the "file exists on
disk but isn't compiled" bug class the Capacitor/iOS work hit twice. One
fewer real footgun on this platform, not a design choice made here.

**Classification**: 🟡 Ready for Testing once CI confirms the Kotlin
compiles into the debug APK (`.github/workflows/react-native-poc-build.yml`
greps the actual build output for each module's compiled `.class` file,
not just a green Gradle exit code) — 🔴 Needs Hardware/emulator for
whether it actually connects to and prints on a real printer. No Android
emulator smoke test was attempted in this pass (would need
`android-actions/setup-android` + hardware acceleration on the CI runner,
extra cost/complexity not justified for a POC scoped to "prove it
compiles and the pattern is symmetric").
