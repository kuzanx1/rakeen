# Hardware Test Plan — Printer, Cash Drawer, Offline-First (Real iPad)

None of this has been executed — it can't be, from Windows. This is the
concrete checklist for the first real-device session, written so that
session tests actual unknowns instead of re-discovering things already
proven on Windows (offline queue logic, print queue retry/backoff/dedup,
idempotency — all already verified against mocks/the real Supabase backend
in this session's earlier work, see `docs/windows-complete-mac-required.md`).

Each item: what to do, what "pass" looks like, what a failure would
actually tell you (architecture bug vs. hardware quirk vs. config gap).

## A. Printer — basic connectivity

1. Configure the real printer's LAN IP/port in POS Settings (same UI flow
   already used in the browser version — `DEVICE.printerIp`).
2. Trigger a normal checkout receipt print.
3. **Pass**: paper prints, matches what a browser-tab print of the same
   order looks like (same layout, since the byte stream is built identically
   on the web side either way — only the transport changed).
4. **If it fails**: check whether `window.AndroidPrint.isAvailable()` and
   the WKUserScript injection are even present first (see Xcode guide step
   13) before assuming a printer/network problem — a bridge-wiring failure
   and a real printer failure look identical from the cashier's side
   (`skipped_no_printer`/`failed` in Diagnostics) but need different fixes.

## B. Arabic text, images, layout on real thermal paper

5. Print a receipt with a business name/branch name containing Arabic text,
   a logo image, and at least one long item name that needs to wrap.
6. **Pass**: Arabic renders correctly and right-to-left (this is rasterized
   as an image on the web side, so it should be transport-agnostic — a
   failure here would suggest something in the canvas rendering itself,
   e.g. a font not loading in time, not a native-bridge issue).
7. Print a receipt for an order with the maximum realistic item count seen
   in production, confirm no content is cut off or the canvas height
   estimate (`renderReceiptCanvas`'s `maxHeight` calc) runs short.

## C. Cut and reprint

8. Confirm the printer physically cuts after each receipt if it's an
   auto-cutter model — this depends on the trailing ESC/POS cut command
   already being in the byte stream the web side builds; if cutting doesn't
   happen, check the byte stream itself (Web Inspector, log the base64
   before `printRaw`) before assuming a native-bridge bug.
9. From a historical order's reprint button, reprint the same receipt twice
   in a row. **Pass**: two identical receipts, no duplicate print job stuck
   in Diagnostics, no crash.

## D. Cash drawer

10. Trigger "فتح الدرج" from the more-actions menu with a real drawer wired
    through the printer's RJ11 port. **Pass**: drawer opens within ~1s.
11. Trigger it with the printer/drawer IP misconfigured (wrong IP).
    **Pass**: honest failure toast (not "تم فتح الدرج" for a drawer that
    didn't move) — this exact failure mode is what the earlier fake-drawer
    bug looked like before it was corrected; re-confirm it can't regress.

## E. Interruption during order/payment/print

12. Start an order, go to Wi-Fi settings, disable Wi-Fi mid-order (before
    submitting). Complete the order/payment while offline.
    **Pass**: order queues locally (same IndexedDB path already tested in
    the browser), payment completes with the "بدون اتصال" messaging, no
    duplicate order once Wi-Fi returns.
13. Same as #12 but disable Wi-Fi *during* a print attempt (mid-`printRaw`).
    **Pass**: print job goes to `retrying`/`failed` per the existing state
    machine, not stuck forever; re-enabling Wi-Fi and waiting (or manually
    retrying from Diagnostics) eventually prints or reaches a clean
    `failed` state with a retry option.

## F. Local Network permission

14. Fresh install (or reset the app's Local Network permission via Settings
    → Privacy → Local Network → Rakeen Cashier → toggle off). Trigger a
    print. **Pass**: iOS shows the permission prompt; accepting lets the
    print proceed; declining produces a clean failure, not a crash or hang
    beyond the existing 8s web-side timeout.
15. Toggle the permission off after having previously granted it, without
    reinstalling. Confirm the app recovers gracefully (same failure/retry
    path as #14, no special-case crash).

## G. App close / relaunch with queues pending

16. Queue at least one order and one print job (e.g. by going offline first,
    per #12), then **force-quit** the app (swipe up in the app switcher, not
    just background it).
17. Relaunch. **Pass**: `resetInterruptedPrintJobsOnBoot()` and the boot-time
    `syncQueue()` call both run and correctly resume the queued items —
    already verified in the browser via a simulated reload; this step is
    specifically about whether a *true* iOS process termination (not just a
    page reload) behaves the same way for IndexedDB persistence. See
    `docs/ios-wkwebview-review.md` §"App termination / IndexedDB survival"
    for why this is expected to work but hasn't been provable from Windows.

## H. Extended offline soak (the "72 hours" requirement)

18. Put the iPad in airplane mode. Take orders, complete payments, print
    receipts continuously (or at a realistic cadence) for as long as
    practical — ideally the full 72-hour target from the original spec.
    **Pass**: no order or print job is ever silently lost; `stuck` orders
    (if `SYNC_MAX_AUTO_RETRIES` is somehow reached while genuinely offline —
    unlikely since retries only count network attempts, but worth watching)
    are still visible and recoverable in Diagnostics; IndexedDB doesn't hit
    a storage quota wall (see the WKWebView review for why this is a real,
    previously-unverifiable-from-Windows risk on very long offline runs with
    many queued print jobs/orders/cached images).
19. Re-enable network after the soak. **Pass**: everything queued
    syncs/prints without duplication, in a reasonable amount of time,
    without requiring a manual nudge for anything except any orders that
    truly hit the 10-retry `stuck` ceiling (which is by design, not a bug —
    those need the Diagnostics "إعادة محاولة الطلبات العالقة" tap).

## I. Bluetooth/USB — do not attempt until the printer model is confirmed

20. Once the actual printer model/brand in use is known, check it against
    `docs/ios-native-bridge-interfaces.md` §4's Hardware Compatibility
    Matrix. If it's a real network (WiFi/Ethernet, port 9100-style) printer,
    sections A–H above already cover it. If it turns out to be
    Bluetooth/USB-only, that is new native work (CoreBluetooth or
    ExternalAccessory, not covered by anything written so far) — do not
    assume it works, do not attempt to bridge it through more JavaScript
    (Web Bluetooth is not available in WKWebView on iOS, at all).
