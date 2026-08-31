# SUNMI/Goodics NT310 — Test Plan

The NT310 is the **first** real hardware target, not the only one Rakeen
will ever support — see `docs/ios-native-bridge-interfaces.md` §4/§5 for
the transport abstraction this test plan validates one instance of.
Nothing below has been executed; it can't be, from Windows. Every claim
here is either sourced from Sunmi's own documentation, a real third-party
integration guide for a sibling model, or explicitly marked as needing this
test to confirm.

## What's known about the NT310 vs. what's assumed

| Fact | Source | Confidence |
|---|---|---|
| 80mm thermal, ESC/POS-compatible, Ethernet/LAN port present | [Sunmi's own product page](https://www.sunmi.com/en/80-kitchen-cloud-printer/), [FCC-filed user manual](https://fccid.io/2AH25NT310/Users-Manual/User-Manual-4935341) | **Verified** (vendor docs) |
| LAN connectivity is TCP/IP-based; connecting the LAN port enables "printing of issued orders from other devices in the LAN" | Sunmi's own NT310 manual | **Verified** (vendor docs) |
| IP discovery: double-click the physical Pairing Button → prints a "network detection report" containing the IP | Sunmi's own NT310 manual | **Verified** (vendor docs) — exact button label/position needs confirming against the physical unit in hand |
| Port **9100**, raw ESC/POS over TCP/IP | A real third-party POS integration guide ([MyOrderBox/MyFoodFast](https://help.myfoodfast.com/pos-myorderbox/setup-sunmi-nt311-printer-with-myorderbox-pos)) for the **NT311** — a sibling model in the same product family, documented together with the NT310 in one Sunmi quick-start guide | **Ready for Testing** — strong corroboration (this is the universal raw/JetDirect printing port basically all ESC/POS network printers use), not itself stated in Sunmi's NT310 manual. **Needs Hardware Testing** to confirm for this exact unit. |
| Self-test trigger method | NT310 manual says "double-click Pairing Button"; the NT311 guide says "hold Feed button while powering on" | **Conflicting across sibling models — confirm against the actual physical NT310 in hand**, don't assume either without checking the unit's own quick-start card/labels |

## Test steps

### 1. Get the printer's IP

Try the NT310 manual's documented method first: locate the **Pairing
Button** on the unit, double-click it. It should run a self-test and print
a "network detection report" containing the IP address and other network
settings. If that button/behavior doesn't match this exact unit, check the
physical quick-start card that shipped with it (Sunmi ships one combined
guide for NT310/311/312/313, so the exact button/gesture may differ by
which variant this unit actually is) — don't guess.

### 2. Confirm the printer is reachable on the LAN at all

From a laptop/phone on the **same LAN** (same Wi-Fi/switch as the printer's
Ethernet port), `ping <printer-ip>`. This isolates "the printer is even on
the network" from "the app can reach it" before touching the iPad at all.

### 3. Confirm port 9100 accepts a connection

From that same laptop (not the iPad yet), try a raw connection to
`<printer-ip>:9100` — e.g. `nc <printer-ip> 9100` (Linux/Mac) or a simple
TCP test tool on Windows — and see if it connects without immediately being
refused. A connection that opens (even if nothing visibly happens) is a
good sign; `ECONNREFUSED` means either the port is wrong or the printer
isn't listening on it, and the real port needs to be found from the
printer's own settings menu/report rather than assumed to be 9100.

### 4. Send a minimal real ESC/POS test print, still not from the app

If a raw TCP tool that can send bytes is available, send a minimal ESC/POS
test string (e.g. `ESC @` init + some ASCII text + a cut command) directly
to `<printer-ip>:9100` and confirm paper comes out. This isolates "the
transport/protocol assumption is correct" from "Rakeen's app-side code
works" — if this step fails, the fix is in understanding the printer's
actual protocol expectations, not in `NetworkPrinterTransport.swift`.

### 5. Configure Rakeen's POS Settings with the real IP

In the existing POS Settings screen (`DEVICE.printerIp`/`DEVICE.printerPort`
— unchanged by any of this iOS work), enter the IP found in step 1 and port
9100 (or whatever step 3/4 confirmed).

### 6. Real checkout receipt print from the iPad app

Trigger a normal checkout receipt print from the Rakeen Cashier app running
on a real iPad (per `docs/ios-xcode-guide.md` steps 13–16). **Pass**: paper
prints, matches what the browser/PWA version's rendering looks like (same
byte stream either way — only the transport differs).

### 7. Arabic text, logo image, long item names

Print a receipt with Arabic business/branch name, a logo image, and at
least one item name long enough to wrap. **Pass**: renders correctly and
right-to-left — this is rasterized as an image on the web side before any
bytes reach the printer, so success/failure here says more about the
canvas rendering step than about the NT310 specifically.

### 8. Cut

Confirm the NT310 physically cuts after each receipt (it has an integrated
cutter per its spec sheet). If it doesn't cut, check the byte stream itself
(Web Inspector, log the base64 before `printRaw`) for the trailing ESC/POS
cut command before assuming a transport/native-bridge bug.

### 9. Reprint

From a historical order's reprint button, reprint the same receipt twice in
a row. **Pass**: two identical receipts, no duplicate print job stuck in
Diagnostics, no crash — this exercises the existing (already web-tested)
print-queue dedup logic against a real device for the first time.

### 10. Cash drawer, if wired through this printer

If a cash drawer is connected through the NT310's drawer-kick port, trigger
"فتح الدرج" and confirm it opens. If not, skip — this printer's LAN/RJ11
capability for a drawer isn't confirmed from documentation alone; the
Sunmi spec sheet mentions "drawer kickout" as a general kitchen-cloud-
printer-line feature, but whether the exact NT310 unit in hand has a drawer
port needs a physical check.

### 11. Interruption during print

Start a print, then disable Wi-Fi on the iPad mid-transfer (or disconnect
the printer's Ethernet cable). **Pass**: the job goes to `retrying`/`failed`
per the existing state machine (already tested on the web side against a
mock), not stuck forever; reconnecting and retrying from Diagnostics
eventually succeeds or reaches a clean `failed` state.

### 12. Local Network permission

Fresh install (or reset Local Network permission via iOS Settings →
Privacy → Local Network → Rakeen Cashier). Trigger a print. **Pass**: the
iOS system prompt appears, accepting lets the print proceed, declining
produces a clean failure through the existing retry UI, not a crash.

## After this test plan runs

Update `docs/ios-native-bridge-interfaces.md` §5's matrix row for the NT310
from **Ready for Testing** to **Verified** only if steps 6–9 above actually
succeeded on the real unit — and update the port/self-test-method facts in
the table at the top of this document with whatever the real unit actually
does, rather than leaving the "assumed from a sibling model" caveats in
place once real data exists.
