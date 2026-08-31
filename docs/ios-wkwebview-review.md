# WKWebView Architecture Review — What Could Break vs. the Browser

Purpose: hunt specifically for anything in the existing offline-first
architecture that could behave differently, or break outright, once
`rakeen-pos.js` runs inside a Capacitor-wrapped WKWebView instead of a
regular browser tab. Per the explicit instruction this was requested under:
**nothing here is a guess presented as fact** — each item is classified:

- **Verified** — confirmed directly, either by reading the actual code and
  reasoning from documented, spec-level platform behavior, or by a check
  that ran successfully in this Windows environment.
- **Likely** — reasoned from documented WebKit/Capacitor/iOS behavior and
  this app's actual code, but not something this environment can prove;
  flagged as the specific thing to confirm first on a real device.
- **Needs Mac** — genuinely cannot be assessed without a real device/Xcode;
  stated as an open question, not resolved by assumption.

No architecture changes were made based on any of the "Likely" items below —
per instruction, those are confirmed or fixed only if real evidence
(Mac-phase testing) shows an actual problem.

## 1. IndexedDB

**Verified**: `openPosDb()` (`public/pos/rakeen-pos.js`) uses the standard
`indexedDB.open(name, version)` API with `onupgradeneeded`/`onerror`
handlers — no non-standard or Chromium-only IndexedDB features are used
anywhere in the file (confirmed by reading every `indexedDB`/`req.`/`tx.`
call site). WKWedbView's IndexedDB implementation is the same WebKit engine
used by Safari and has been spec-compliant since iOS 10+; nothing here
exercises exotic edge cases (no multi-tab `versionchange`/`onblocked`
handling is needed either, since a native app has exactly one WKWebView
instance, never multiple tabs against the same origin — if anything this
*removes* a class of risk the browser PWA technically has).

**Likely, not Verified**: Safari's Intelligent Tracking Prevention (ITP)
7-day script-writable-storage cap is a documented *Safari* policy, not
applied to a third-party app's own WKWebView per Apple's own developer
documentation and WebKit's ITP design (ITP targets cross-site tracking in
the Safari browser specifically). A Capacitor app's WKWebView is not Safari,
so this cap should not apply here at all. This is well-supported by public
platform documentation but has not been (and can't be) directly proven from
Windows — the concrete thing to confirm on a real device is that IndexedDB
data survives well past 7 days of the app not being opened.

**Needs Mac**: exact IndexedDB storage quota and eviction behavior under
real iOS disk-pressure conditions, over the "72 hours or more" of offline
operation the original spec targets, with print jobs potentially holding
large embedded receipt image data. This is the single largest genuinely
unknown risk in the whole architecture — see the Hardware Test Plan's
§H "72-hour soak" test, which exists specifically to surface this if it's
real.

## 2. localStorage

**Verified**: staff-member session state was already moved from
`sessionStorage` to `localStorage` earlier in this project specifically
because `sessionStorage` does not survive a tab/app close — this is exactly
the right choice for a native app too (`sessionStorage` in a WKWebView is
scoped to that single "browsing session," which a full app termination
would end, same problem it solved for the browser PWA). `localStorage` is a
standard, spec-compliant WebKit feature with no known WKWebView-specific
divergence from browser behavior.

## 3. App lifecycle — backgrounding

**Likely**: standard iOS behavior suspends JS timer execution
(`setInterval`/`setTimeout`) shortly after an app backgrounds, without a
Background Modes capability enabled (none is currently enabled — see
`docs/ios-configuration.md` §4). This means `syncQueue()`'s interval and
`processPrintQueue()`'s 20s interval both pause while backgrounded. This is
not a data-loss risk — nothing queued is lost, it simply doesn't
auto-flush until the app is foregrounded again, at which point the
existing `online` event handler and boot-time sync calls resume it
correctly (same code path already exercised in this session's browser
testing). **Needs Mac** to confirm the exact resume trigger fires reliably
when an app returns to foreground after being backgrounded (vs. this
session's tested "tab was open, network came back" scenario) — Capacitor
exposes `App.addListener('resume', ...)` events for this if a native hook
ever turns out to be needed, but nothing currently wires into it, and
nothing should be added speculatively.

## 4. App lifecycle — termination and full restart

**Likely**: a force-quit followed by relaunch is, from the WKWebView's
perspective, functionally the same as a fresh page load — `rakeen-pos.js`
re-runs its full boot sequence (`loadPosData`, `findOpenShift`,
`resetInterruptedPrintJobsOnBoot`, etc.) exactly as it does after a hard
refresh in a browser, which **was** directly tested this session (killed a
print job mid-flight, reloaded, confirmed correct resume with no duplicate
print and no data loss). The IndexedDB stores themselves are unaffected by
process termination — they're durable, disk-backed storage independent of
the WKWebView process's lifetime, same guarantee a browser gives. **Needs
Mac** to confirm this equivalence holds for a *true* OS-level process kill
(Hardware Test Plan §G) rather than the page-reload proxy used so far — the
underlying storage guarantee is standard, but "reload" and "relaunch after
force-quit" are not provably identical from here.

## 5. `navigator.onLine` reliability

**Verified (by design, not by luck)**: WKWebView's `navigator.onLine` has a
documented history of being less reliable than desktop-browser
implementations (known to sometimes report `true` on a connected-but-no-
internet Wi-Fi network, for example). This *doesn't* materially threaten
this architecture because `NETWORK_STATE`'s `cloud` field is deliberately
never inferred from `navigator.onLine` alone — it's set from actual
Supabase round-trip outcomes (`reportCloudResult`, called from `syncQueue()`'s
real request results). `navigator.onLine`/the `online` event feeds only the
`internet` field and acts as a trigger to *attempt* a sync, not as the
source of truth for whether syncing will succeed — so even if WKWebView's
`online`/`offline` events fire less precisely than a desktop browser's, the
worst case is a slightly mistimed sync attempt, not an incorrect belief
about whether data actually reached the server.

## 6. `target="_blank"` links (WhatsApp, Google Maps)

**Likely, explicitly flagged for hardware testing**: `rakeen-pos.js` has
several `<a target="_blank">` links (WhatsApp deep links, Google Maps
links, in the delivery-order detail views). Capacitor's default WKWebView
configuration is documented to route this kind of "open a new window" event
to the system browser (`wa.me`/Maps links opening in Safari/the WhatsApp
app rather than failing silently, which is what a *bare*, uncustomized
WKWebView without a `WKUIDelegate` implementation would do). This app's
`MainViewController` does not currently override Capacitor's own
`WKUIDelegate` handling, so it should inherit Capacitor's default behavior
here — but this specific claim rests on Capacitor's documented behavior
across versions, not something provable from Windows. **Concrete test**:
Hardware Test Plan should include tapping a WhatsApp/Maps link and
confirming it opens externally rather than doing nothing. If it fails, the
fix is additive (either enable Capacitor's `Browser` plugin explicitly, or
intercept these anchor clicks and route them via
`window.Capacitor?.Plugins?.Browser?.open(...)` when present) — not a
reason to change the offline/queue architecture.

## 7. Audio (alert sounds, tap sound)

**Verified**: `playAlertSound()`/`playTapSound()` already wrap every
`audio.play()` call in a `.catch(()=>{})` specifically because autoplay can
be blocked before any user gesture — this defensive pattern was written for
browser autoplay-policy restrictions and applies identically to WKWebView's
own (similarly strict) autoplay policy. Worst case on iOS is a missed sound
before the first tap of a session, never a thrown error or blocked UI —
already the correct, tested-safe behavior with no changes needed.

## 8. Service Worker (`/pos-sw.js`)

**Verified**: `POSPage.tsx` registers the service worker inside a
`.catch(()=>{})` with an explicit comment that a failed registration must
never block the POS itself — this was written defensively regardless of
platform. **Likely**: Service Worker support in WKWebView has been
available since iOS 14.5, but Capacitor-wrapped apps loading a *remote*
`server.url` (this app's setup) have had inconsistent community reports
about Service Worker registration succeeding reliably across Capacitor/iOS
version combinations. Given the registration already fails silently and
harmlessly if unsupported, and the app's *real* offline mechanism is the
IndexedDB queue (not the service worker, which only caches the app-shell
HTML/JS/CSS for faster cold loads) — **this is a low-severity, bounded
risk**: worst case, the native app always does a full network fetch of the
shell instead of an instant cached paint, which is a performance
characteristic, not a correctness or offline-capability regression.
**Needs Mac** to confirm whether it registers at all in this exact setup;
not worth pre-emptively working around without evidence it's actually
broken.

## 9. The plain-`<script>` loading pattern

**Verified**: `rakeen-pos.js` is loaded via `document.createElement('script')`
with a plain `.src` assignment (`POSPage.tsx`), not an ES module
(`type="module"`) and not a bundler-emitted chunk. This is the simplest,
most WKWebView-compatible script-loading pattern available — no CORS
preflight concerns (module scripts have stricter fetch/CORS semantics),
no MIME-type sniffing edge cases. Nothing about this needs to change for
iOS.

## 10. Static-asset caching (`/pos/rakeen-pos.js` itself)

**Verified**: this file is served from `public/` with no content hash in
its filename, so both Cloudflare's edge cache and a client's own HTTP cache
can serve a stale copy after a deploy if not otherwise mitigated — this
exact behavior was observed repeatedly against the Browser tool during this
session's own testing (worked around each time by fully closing/reopening
the tab). **This is already mitigated for real users** by `/pos-sw.js`'s
deliberate stale-while-revalidate strategy (see that file's own comments) —
it serves the cached shell instantly while refreshing it in the background,
so a real cashier's *next* app launch always gets the latest code, even
though the *current* launch might still be one version behind for a few
seconds. The repeated staleness seen *in this session* was specific to the
Browser tool's own separate HTTP cache layered on top of testing the same
origin repeatedly — not evidence of a production bug.

**Likely, worth extra caution specifically for the native app**: a cashier
using the browser PWA can always manually force a fresh load (pull-to-
refresh, close tab). A native app's WKWebView doesn't offer an equivalent
obvious gesture to the end user — if the service worker's background
refresh is ever slower than expected (e.g. the app is opened, used briefly,
and closed again before the background refetch completes), a cashier could
in principle run one version behind for longer than in the browser case.
Not a correctness bug (queue/sync logic is unaffected by which JS version
is running, as long as it's not an *old enough* version to predate a schema
change), but worth deciding, once on a real device, whether the native app
should also do an explicit "check for a newer script version on launch"
step. Not implemented speculatively here — flagged as a discussion point
for the Mac phase, not a defect in the current architecture.

## Summary

No item above required changing `rakeen-pos.js`'s offline/queue
architecture, and none was changed. The two items worth the most attention
in the very first real-device session are §1's 72-hour IndexedDB quota
question and §6's `target="_blank"` external-link behavior — both are cheap
to check early (Hardware Test Plan §H and a two-second tap test,
respectively) and both have low-risk, additive fixes if they turn out to be
real problems.
