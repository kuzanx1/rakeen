# Phase 10 — Capacitor (current) vs. React Native (proposed)

Every row below is grounded in either Phase 1's real code audit or this
POC's real, CI-verified results — not general framework reputation.

| Dimension | A — Current (Web POS + Capacitor + Swift) | B — Proposed (React Native + Swift + Kotlin) |
|---|---|---|
| **Rebuild time** | Zero for UI — already built, tested, extensively hardened this project (offline queue, print queue, idempotency, diagnostics all real-tested against the live backend) | **Large.** Phase 1's audit found the entire UI (6,597 lines of DOM manipulation, 4 screens, no framework) has no RN equivalent to adapt — full rewrite, not a port. This is the single biggest cost in the whole comparison. |
| **Reusable code** | 100% — nothing to migrate | Business logic, Supabase calls, and (per this POC) the Swift transport logic port cleanly — but that's a minority of the actual line count. The UI majority does not move. |
| **Offline** | Already built and tested (IndexedDB, retry/backoff, circuit breaker, server-side idempotency) | Design is portable (Phase 8), but needs a real storage migration (IndexedDB has no RN equivalent) — recommended SQLite+MMKV, not yet built. |
| **Printing** | Real, CI-proven Swift transport + manager, multi-printer-ready abstraction already built, NT310 researched against real vendor docs | This POC proves the *same* Swift logic compiles as an RN NativeModule, **plus** a new, separately-maintained Kotlin equivalent — real progress, but doubles the native printer code surface that must be kept in sync going forward. |
| **Cash Drawer** | Contract + standard kick command ready (iOS) | Same contract ported to both platforms in this POC — real, but same doubling as printing. |
| **Bluetooth / USB** | Not implemented on either architecture — a wash. Neither framework makes MFi/CoreBluetooth/ExternalAccessory constraints easier; both still need real native code per platform, whenever a real printer model requires it. | Same. |
| **Android** | **Not started.** But Capacitor Android is a real, first-class Capacitor target — and because the whole POS is a web app, the *entire* existing UI would run **unchanged** in an Android WebView. Reaching Android under Capacitor means writing a Kotlin printer/drawer bridge (mirroring the already-proven iOS design) — it does **not** require rewriting the UI a second time. | **This POC's real headline result**: a symmetric Kotlin native module compiled cleanly on the first attempt, no errors. Genuinely proves RN's "write once, two platforms" story for the *native hardware layer*. But Capacitor's own path to Android doesn't require a UI rewrite either — so this advantage is smaller than it first appears once compared fairly. |
| **iOS** | Real, CI-proven (multiple successful `xcodebuild` runs across this whole project). | Also real and CI-proven in this POC (`macos-15`/Xcode 16.4, `** BUILD SUCCEEDED **`) — the same underlying Swift transport code, ported almost verbatim. |
| **Performance** | WebView-based UI has a real, known ceiling for animation-heavy/high-frequency-update interfaces — but this POS is lists/grids/forms/modals, not that kind of UI; no performance complaint has surfaced anywhere in this entire project's real testing. | True native rendering has a higher theoretical ceiling — a real advantage in principle, not evidenced as a current need for this specific app. |
| **Maintenance** | One JS codebase drives web + iOS + Android UI; native code is limited to the small printer/drawer bridge, one platform at a time as needed. | UI must be maintained separately from the *other* web surfaces this project also has (dashboard, storefront, kitchen display, loyalty card — all staying web, outside this POC's scope) — net effect is **more** total codebases for the company to maintain, not fewer, since only the POS would move. Native hardware code is now duplicated across Swift **and** Kotlin from day one. |
| **Hardware future** | Transport abstraction already designed for growth (`PrinterTransport` protocol, Network done, Bluetooth/USB slots ready) — proven pattern, one platform. | Same abstraction pattern proven on **both** platforms in this POC — a real edge for hardware SDKs that ship as native Android/iOS libraries (e.g. some barcode scanners), which are easier to wrap as an RN native module than to bridge into a WebView. |
| **Project complexity** | Lower — one shared JS codebase, CocoaPods-free (SPM only, already proven), small platform bridges added incrementally. | Higher — a new framework, two native build toolchains (CocoaPods **and** Gradle), a full UI rewrite, and now two hardware codebases instead of one. |
| **Risk** | Low — nothing changes; every real system this project already tested (offline, print, idempotency) keeps working exactly as verified. | The dominant risk is the UI rewrite itself: re-implementing a live, working, extensively-tested POS from scratch has real regression risk, independent of React Native's own merits as a framework. |
| **Scalability** | Adding a feature changes one JS codebase, available on web + iOS + (eventually) Android via the same Capacitor path. | Adding a feature to the POS now means RN-specific work, separate from the same feature's web-side equivalent if the dashboard/storefront ever need it too. |

## The one fact that actually decides this

React Native's central promise — "write the hardware bridge once, reach
two platforms" — is real, and this POC proved it works (both platforms
compiled cleanly, the JS contract is genuinely symmetric). But it is not
the deciding factor, because **Capacitor already has its own path to
Android that doesn't require rewriting the UI at all** — the same
`NetworkPrinterTransport`/`PrinterManager` design just needs a Kotlin
counterpart, exactly as this POC already demonstrated is straightforward.
What React Native actually costs, that Capacitor does not, is a full
rewrite of 6,597 lines of already-working, already-tested UI and
interaction logic — for a POS whose actual UI needs (lists, grids, forms,
modals) don't demand native rendering's performance ceiling.

## Final Recommendation

# KEEP CAPACITOR

Reasons, in order of weight:
1. **The UI rewrite cost is real, large, and unnecessary** — Phase 1's
   audit found no RN equivalent for 6,597 lines of DOM-driven UI; adopting
   React Native means rebuilding the single most business-critical,
   already-hardened part of this app from scratch, before reaching feature
   parity with what already works today.
2. **Android does not require React Native to reach** — Capacitor already
   supports Android as a first-class target; the existing web UI runs
   there unchanged, and only a Kotlin printer/drawer bridge (the same
   scope this POC just proved is achievable in an afternoon) is needed to
   close the gap.
3. **Net maintenance burden is lower with Capacitor**, not higher — one JS
   codebase across web/iOS/Android, versus React Native adding a second,
   separately-maintained UI codebase alongside the web surfaces
   (dashboard/storefront/kitchen/loyalty) that aren't moving anyway.
4. **Every real, tested system this project has already built — offline
   queue, print queue, idempotency, diagnostics — keeps working exactly as
   verified**, with zero migration risk, since nothing about the current
   architecture needs to change to reach Android via Capacitor.

**What this POC still leaves genuinely useful, even with this
recommendation**: the printer transport/manager design pattern this whole
project already built (`PrinterTransport` protocol, `PrinterManager`,
network-first with Bluetooth/USB slots ready) is now proven to translate
cleanly to a second language (Kotlin) with an almost line-for-line
equivalent structure — directly reusable as the actual template for a real
Capacitor-Android printer bridge, whenever that becomes the next real
priority.
