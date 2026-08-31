# iOS Native Bridge — Interface Contracts & Hardware Matrix

Status: **an unverified Swift draft of the native side now exists; the web
side of both interfaces below is real, shipped code.** Both
`window.AndroidPrint` (§1) and `window.NativeCashDrawer` (§2) are checked and
called for real by `public/pos/rakeen-pos.js` today —
`printerBridgeAvailable()`/`cashDrawerBridgeAvailable()` currently always
return false in any build that doesn't inject these globals, and the web
layer reports that honestly instead of faking success.

A draft native implementation was written on Windows — see
`ios/App/App/MainViewController.swift` and `ios/App/App/PrinterBridge.swift`
— matching this contract as closely as this environment allows to prove.
**It has never been compiled** (no Swift toolchain exists on Windows —
verified: `swiftc`/`swift` are not present in this environment) and never
run against a real bridge, WKWebView, or printer. Treat every line of it as
🟡 prepared, not ✅ verified, until it has at least compiled in Xcode — see
`docs/windows-complete-mac-required.md` for the full status legend. The goal
remains that when a Mac becomes available, the Xcode phase is "does this
draft compile and work" rather than "design this from scratch."

## 1. Print Bridge — `window.AndroidPrint` (existing contract)

This is not new — it's the interface the current code already calls,
unconditionally checked before every print attempt (`printerBridgeAvailable()`
in rakeen-pos.js). No native implementation of it exists anywhere in this
repo today; every real deployment falls through to `bridge_unavailable` and
the print queue marks the job `skipped_no_printer`. The interface itself is
sound and print-queue-tested (retry/backoff/persistence all verified against
a mocked implementation of exactly this shape) — what's missing is a real
implementation behind it.

```ts
interface AndroidPrintBridge {
  /** Synchronous. Must return true only when a working transport to SOME
   *  printer capability exists (does not mean a printer is configured —
   *  see printerIp/printerPort below, which are the web layer's own state,
   *  not part of this interface). */
  isAvailable(): boolean;

  /** Fire-and-forget from the web side; result comes back async via the
   *  callback below, not a return value or resolved Promise (window.AndroidPrint
   *  is a plain object across the JS bridge, not something that can return a
   *  real Promise across a WKWebView message-handler boundary). */
  printRaw(
    base64Bytes: string,   // full ESC/POS byte stream (init + raster image + cut), base64-encoded
    ip: string,            // target printer's LAN IP — network printers only, see §3
    port: number,          // typically 9100
    callbackId: string     // opaque token, echoed back in the callback below
  ): void;
}

// The web side installs this global; native code calls it when a print
// attempt resolves (success or failure) for a given callbackId.
declare global {
  interface Window {
    AndroidPrint?: AndroidPrintBridge;
    __androidPrintCallback: (callbackId: string, result: { ok: boolean; error?: string }) => void;
  }
}
```

**Timeout contract**: the web side already imposes its own 8-second timeout
per `printRaw` call (`sendBytesToPrinter` in rakeen-pos.js) — if the native
side never calls `__androidPrintCallback` for a given `callbackId`, the web
layer treats it as `{ok:false, error:'timeout'}` on its own and moves on.
The native implementation does **not** need its own timeout logic for this
reason, but SHOULD still call the callback if a late response is possible
(the web side ignores a callback for an id it already timed out — no crash,
just a wasted call).

**Error strings the web side treats specially** (see `processPrintQueue` in
rakeen-pos.js) — a native implementation MUST use these exact strings for
these exact conditions, everything else is treated as a generic retryable
error:
- `'bridge_unavailable'` — returned by `isAvailable()` returning false; the
  web side never even calls `printRaw` in this case.
- `'no_printer_configured'` — web-side-only (no `ip` was configured), native
  code never needs to produce this.
- Anything else (`'timeout'`, `'printer_busy'`, `'connection_refused'`, etc.)
  → treated as a real, retryable printer failure (exponential backoff, up to
  5 attempts, then surfaced to the cashier as `failed` with a manual retry
  option — see the Print Queue section of the main conversation/PR this
  shipped in).

### What actually needs to be true in the Swift/Capacitor implementation

- `isAvailable()` should reflect "this app has a working ESC/POS transport
  layer available", not "a printer IP happens to be configured" — that
  second check already lives entirely in the web layer's `DEVICE.printerIp`.
- `printRaw` needs to open a raw TCP socket to `ip:port` and write the given
  bytes — this is a **plain socket write**, not HTTP/REST. `Network.framework`
  (`NWConnection`) is the modern iOS API for this; no third-party ESC/POS SDK
  is required since the web side already does 100% of the ESC/POS encoding
  (raster image + init + cut commands) and hands over finished bytes.
- The web side rasterizes the ENTIRE receipt (Arabic text included) into a
  bitmap before this call — Arabic shaping/RTL is already solved on the web
  side via `<canvas>` (see `renderReceiptCanvas`/`canvasToEscPosRaster` in
  rakeen-pos.js). The native bridge never needs to understand Arabic text
  encoding, code pages, or font shaping at all — it only ever transports
  opaque raster bytes.

## 2. Cash Drawer — `window.NativeCashDrawer`

**Updated status**: the web side of this contract is now real, shipped code
(`cashDrawerBridgeAvailable()` / `kickCashDrawer()` / `openCashDrawer()` in
rakeen-pos.js) — it is called for real every time the "فتح الدرج" button is
tapped. What is **still not implemented anywhere** is the native side:
`window.NativeCashDrawer` does not exist in any build today, so
`cashDrawerBridgeAvailable()` always returns false and the cashier honestly
sees "⚠ فتح الدرج غير متاح بعد — يحتاج تطبيق iOS أصلي" instead of a fake
success. (Previously this button called `showToast('تم فتح الدرج')`
directly, unconditionally, claiming success for a command that was never
sent anywhere — that was corrected specifically because it would have
shipped a working-looking button that lies to the cashier.)

The interface below is what the native side needs to implement — shaped to
match the print bridge exactly (same `isAvailable()`/action/callback shape)
so the two features share one mental model:

```ts
interface NativeCashDrawer {
  isAvailable(): boolean;
  /** Most real-world setups wire the drawer through the receipt printer's
   *  own RJ11 port — kicking it is just another byte sequence sent to the
   *  SAME ip:port as printRaw, not a separate physical connection. A
   *  drawer with its own independent network interface is rare but should
   *  still fit this same shape (ip/port simply point at the drawer's own
   *  controller instead of a printer). */
  kick(ip: string, port: number, callbackId: string): void;
}
declare global {
  interface Window {
    NativeCashDrawer?: NativeCashDrawer;
    __nativeCashDrawerCallback: (callbackId: string, result: { ok: boolean; error?: string }) => void;
  }
}
```

**Minimum viable fix once a printer bridge exists**: since most drawers are
printer-wired, the simplest correct implementation doesn't even need this
separate interface — appending the standard ESC/POS kick command
(`0x1B 0x70 0x00 0x19 0xFA`) to the SAME byte stream already sent via
`printRaw` (or a standalone call with just those 5 bytes) covers the common
case with zero new native surface. `NativeCashDrawer` above is only needed
for a drawer that has its own separate network controller, independent of
any printer.

## 3. Error States & State Machines (what the Swift side needs to reproduce)

### 3.1 Print Job state machine (`public/pos/rakeen-pos.js`, Print Queue section)

```
queued ──▶ printing ──┬─▶ printed              (result.ok === true)
                       ├─▶ skipped_no_printer   (error === 'bridge_unavailable' | 'no_printer_configured' — terminal, NOT an error)
                       └─▶ retrying ──(backoff)──▶ printing  (loops until...)
                                │
                                └─▶ failed  (after 5 attempts — terminal, needs a manual "إعادة المحاولة" tap)
```
A job interrupted mid-`printing` by an app kill/crash is reset to `queued`
on next boot (`resetInterruptedPrintJobsOnBoot`) — verified directly: killed
a job mid-flight, reloaded, confirmed it resumed and eventually reached a
terminal state with no duplicate print and no data loss. Native code never
needs to know about this state machine directly — it only ever receives one
`printRaw`/`kick` call per attempt and reports success/failure for it; all
retry/backoff/state bookkeeping happens on the web side and will keep
working unmodified once a real bridge exists.

### 3.2 Offline Order Queue state (`pending_orders` store)

Not a named-status machine like print jobs — an order is simply "present in
the store" (not yet confirmed by the server) or "absent" (synced). Two
additional fields matter for a native implementer to know about:
- `stuck: boolean` — set once `retry_count` reaches `SYNC_MAX_AUTO_RETRIES`
  (10). A stuck order is **never deleted or abandoned** (it is financial
  data — see the project's #1 priority: never lose an order) — it just
  stops being auto-retried every 30s and needs a human to tap "إعادة محاولة
  الطلبات العالقة" in Diagnostics, which clears `stuck` and `next_retry_at`
  and lets the normal sync loop pick it up again.
- Idempotency for orders is **entirely server-side** (`client_order_uuid`
  unique constraint on `orders`, plus `dine_in_round_log` for an appended
  round on an open table) — the native/web client-side layer does not need
  its own dedup logic for orders the way the print queue needs one for
  duplicate button-taps; a retried order after a crash always resolves to
  the same server-side order id, verified directly (retried an append twice,
  confirmed the subtotal did not double and `order_items` did not duplicate).

### 3.3 Consolidated error-string reference

| String | Producer | Meaning | Web-side reaction |
|---|---|---|---|
| `bridge_unavailable` | Web (`printerBridgeAvailable()`/`cashDrawerBridgeAvailable()` returning false) | No native bridge object installed at all | Print: terminal `skipped_no_printer`, no retry. Drawer: honest toast, no retry (there is nothing to retry against). |
| `no_printer_configured` | Web (`DEVICE.printerIp` unset) | Bridge exists but no target IP saved | Same as above — this is a configuration gap, not a transient fault. |
| `timeout` | Web (`sendBytesToPrinter`/`kickCashDrawer`'s own 8s timer) | Native side never called the callback in time | Treated as a real, retryable failure. |
| *(anything else, e.g. `printer_busy`, `connection_refused`)* | Native (should use its own descriptive string) | A genuine printer/drawer-level failure | Retryable with exponential backoff up to the print queue's cap (5), surfaced to the cashier with a manual retry option once exhausted. |
| `render_failed` | Web (`sendToPrinter`/`sendKitchenTicketToPrinter` — canvas/ESC-POS encoding threw) | A bug in the byte-building step, never a hardware problem | Retryable (rare — would need a code fix, not a hardware fix, to actually resolve). |

**Design rule for the native side**: only ever produce `bridge_unavailable`/
`no_printer_configured`/`timeout` when they are literally true (per the
table above); any other real failure should get its own descriptive string
rather than being coerced into one of these — the print queue treats
anything not in that first group identically (retry with backoff), so there
is no reason to lie about the specific cause, and a precise string shows up
directly in Diagnostics' "آخر خطأ طباعة" row for support purposes.

## 4. Hardware Compatibility Matrix

Per the explicit "do not fake compatibility" requirement — this is the
honest state, not an aspirational one. "Tested" means verified against real
hardware or a faithful mock in this session; "Untested" means the code path
may exist but has never touched real hardware; "Not implemented" means the
capability doesn't exist in any form yet.

| Printer/Drawer type | Transport | Status | Notes |
|---|---|---|---|
| Network ESC/POS printer (WiFi/Ethernet) | Raw TCP socket, port 9100 | **Code exists, mock-tested** | `printRaw(base64, ip, port, cb)` — this is the ONLY transport the web layer's print bytes assume. No real hardware has confirmed this session; retry/queue/backoff logic around it is real-tested via a JS mock of the same interface. |
| Drawer wired through a network printer's RJ11 port | Same TCP socket as above + ESC/POS kick bytes | **Not implemented** | See §2 — button is currently cosmetic; fix is a small addition once `printRaw` has a real native backing. |
| Bluetooth Classic printer | Requires MFi (Apple's "Made for iPhone/iPad" accessory program) or a BLE-based printer instead | **Not implemented, not evaluated** | iOS does not expose raw Bluetooth Classic sockets to third-party apps outside the MFi `ExternalAccessory` framework — a non-MFi-certified Bluetooth Classic printer is very likely **impossible** to support on iOS without the manufacturer's own MFi-certified SDK. Must be confirmed per exact printer model — do not promise support before checking. |
| BLE (Bluetooth Low Energy) printer | `CoreBluetooth` | **Not implemented, not evaluated** | Technically reachable from a native Swift layer (`CoreBluetooth` is a public framework, no MFi needed for BLE) — but NOT reachable from Web Bluetooth inside WKWebView; Apple does not support the Web Bluetooth API in WebKit at all, on any iOS browser, including inside a Capacitor/WKWebView shell. A BLE printer therefore **requires** a genuine native Swift plugin — this cannot be bridged through more JavaScript. |
| USB printer | Lightning/USB-C accessory framework, or MFi | **Not implemented, not evaluated** | iPadOS has broader USB accessory support than iPhone; still requires native `ExternalAccessory`/USB framework code, not reachable from web. |
| AirPrint | `UIPrintInteractionController` (native) or CSS print media (web, unreliable for ESC/POS raster+cut) | **Not implemented** | Would be a genuinely different code path (system print dialog, not a raw socket) — useful only as a manual fallback for receipt printers that expose AirPrint, not for kitchen tickets needing an auto-cut. |

**The one thing this session can say with confidence**: the ESC/POS raster
encoding, Arabic-shaping-via-canvas, and the print queue's retry/dedup/
persistence logic are all transport-agnostic — they hand a native bridge a
finished byte array and an ip:port and don't care how those bytes actually
reach the printer. Adding BLE/USB/MFi support later means writing a new
native transport that implements the SAME `printRaw`-shaped contract; it
does not require touching the web layer's print queue, ESC/POS encoding, or
Arabic rendering at all.

## 5. What this means for the Xcode phase specifically

When a Mac is available, the actual native work is:
1. Implement `AndroidPrintBridge` for network printers first (§1) — this
   alone makes every already-built, already-tested print-queue behavior
   (retry, backoff, dedup, persistence, manual retry from Diagnostics) real
   instead of `skipped_no_printer` on every attempt.
2. Implement `NativeCashDrawer` (§2) — the web side already calls it
   correctly and shows an honest status either way; this is purely a native
   addition, no web-side change needed.
3. Evaluate BLE/MFi/USB support PER ACTUAL PRINTER MODEL the business owns
   before claiming any of it works — none of it has been evaluated yet, and
   the honest matrix above should be updated (not guessed) once real
   hardware is in hand.
4. None of steps 1–3 require any change to `public/pos/rakeen-pos.js`'s
   print-queue/ESC-POS/Arabic-rendering logic — only the native bridge
   object itself needs to exist and match the contracts above.
