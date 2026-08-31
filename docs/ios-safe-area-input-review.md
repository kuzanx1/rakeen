# Safe Area / Notch / iPad Sizes, and Keyboard / Input Review

Two areas the earlier WKWebView review (`docs/ios-wkwebview-review.md`)
didn't cover — reviewed here by reading the actual CSS/config, not
guessed. Same classification convention: Verified (confirmed by code
review or CI), Ready for Testing (reasoned, needs a real device to
confirm), Needs Mac/Hardware (genuinely can't be assessed without one).

## Safe Area / notch / rounded corners / home indicator

**Verified (by reading the actual code)**:
- `capacitor.config.ts` already sets `ios.contentInset: 'automatic'` —
  this makes WKWebView's content area behave like a normal Safari tab,
  automatically inset from the status bar, notch/camera housing, rounded
  corners, and bottom home-indicator area, without the page needing its
  own `viewport-fit=cover` + `env(safe-area-inset-*)` CSS. This was a
  deliberate choice made during the earlier prep phase specifically to
  avoid needing to touch the POS's CSS for this.
- Grepped the entire POS CSS/JS for `viewport-fit`, `env(safe-area-inset`,
  and `visualViewport` — **zero matches**. The app has no explicit
  safe-area handling of its own; it relies entirely on `contentInset:
  'automatic'` doing the right thing.
- The one fixed-position element most at risk of a home-indicator overlap
  is `.bottom-nav` (`app/pos/rakeen-pos.css` — 68px tall, flex-shrink:0` in
  normal flow at narrow widths, `position:absolute; bottom:0` at ≥761px).
  It has no bottom safe-area padding of its own.

**Ready for Testing — reasoned, not provable from Windows**:
`contentInset: 'automatic'` should mean the WKWebView's own scroll-view
insetting keeps `.bottom-nav` above the home-indicator gesture area without
any CSS change, the same way a plain Safari tab's bottom toolbar area
doesn't overlap a page's fixed-bottom elements. This is a reasonable
expectation based on documented `UIScrollView.contentInsetAdjustmentBehavior
= .automatic` semantics, but the *visual* result (a clean edge-to-edge fit
vs. an unwanted gap/double-inset, especially on an iPad Pro's rounded
corners) can only be judged by actually looking at it on a real device —
screenshots from the Simulator (see this session's CI run) are a partial
proxy but the Simulator doesn't always reproduce real hardware's exact
safe-area insets faithfully for every device class.

**If a real problem is found on hardware**: the fix is additive and
low-risk — add `viewport-fit=cover` to `app/pos/page.tsx`'s `viewport`
export and `padding-bottom: env(safe-area-inset-bottom)` to `.bottom-nav`
(and `padding-top: env(safe-area-inset-top)` to the topbar if needed). Not
applied speculatively here, per the instruction not to change anything
without a proven problem.

**iPad screen sizes specifically**: the POS's responsive CSS already has
width-based breakpoints (the `≥761px` media query restructuring
`.bottom-nav`/`.screens` layout, referenced in `rakeen-pos.css`) built for
the browser/PWA version and already exercised across viewport sizes in
this session's browser testing. Nothing about running inside a Capacitor
WKWebView changes how CSS media queries evaluate — an iPad's WKWebView
viewport width behaves the same as a browser tab at that width. **Ready for
Testing** only in the sense of confirming this on the *specific* iPad
model/orientation in hand (split-screen Stage Manager multitasking is a
genuinely iPad-only wrinkle with no browser-tab equivalent, and hasn't been
considered at all — worth a specific check on real hardware, not
because it's expected to fail, but because it's truly never been
exercised).

## Keyboard / input fields

**Verified (by reading the actual code)**: the POS has ~24 `<input>`
elements across its various modals/screens (Settings, search fields,
customer info forms, etc.) — grepped directly, not estimated. None of them
have custom focus/scroll/keyboard-avoidance JavaScript (no
`scrollIntoView`, `visualViewport`, or focus/resize listeners exist
anywhere in `rakeen-pos.js`). The PIN pad specifically is NOT a real
`<input>` — it's custom tap-target buttons (`.pin-key`), so the software
keyboard never appears for PIN entry at all, sidestepping most
keyboard-related risk for the single most-used input in the whole app.

**Ready for Testing — reasoned, not provable from Windows**: WKWebView
inherits Safari's built-in behavior of auto-scrolling a focused text input
into view above the software keyboard — this is a system-level default,
not something an app normally needs to implement itself, and it's why no
custom handling exists (none was needed for the browser/PWA version
either). The specific risk worth checking on a real device: several of the
POS's inputs sit inside `.modal-overlay` (`position:fixed; inset:0`)
containers with their own internal scrolling — nested fixed/scrollable
contexts are the one scenario where WKWebView's automatic keyboard-avoidance
scrolling has historically been less reliable than in a plain top-level
page. Concretely: open the Settings modal (printer IP/port fields) and the
customer-info modal on a real iPad, tap each input, confirm the keyboard
doesn't cover it and the modal doesn't jump/clip oddly.

**iPad-specific keyboard behavior**: iPadOS's software keyboard supports
undocking/floating and a compact "thumb" layout, which a phone-sized
keyboard doesn't — genuinely untested territory, not because it's expected
to break anything (the app doesn't do anything unusual with `<input>`
elements) but because it's simply never been exercised. Worth one pass
during hardware testing, not a red flag on its own.
