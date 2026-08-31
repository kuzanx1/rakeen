# Phase 1 — Audit of the Current App (Real Code, Not Guessed)

Legend: 🟢 moves to React Native directly (same logic, maybe a thin
wrapper) · 🟡 needs an adapter (concept/logic portable, implementation
must change) · 🔴 needs a full rewrite for React Native (no RN equivalent
of the underlying browser/WebView API exists).

Every line below references a real file/function in this repo, checked
directly (grep/read), not recalled from memory alone where it mattered.

## POS screens

`app/pos/pos-markup.ts` (16KB, one exported string — `posMarkup`) is
injected wholesale into a `<div>` by `POSPage.tsx`, then `public/pos/
rakeen-pos.js` (6,597 lines) drives 100% of the interactivity via direct
DOM APIs (`document.getElementById`, `.innerHTML` template strings, manual
event listeners) — there is no component framework, no virtual DOM, no
JSX anywhere in this file. Four bottom-nav screens confirmed directly in
the markup: `home` (product grid/cart/checkout), `orders`, `tables`,
`more` (settings/shift actions/Diagnostics).

**🔴 The entire UI layer is a full rewrite.** React Native has no DOM, no
HTML, no CSS, no `innerHTML` — `<View>`/`<Text>`/`<FlatList>` and
StyleSheet objects are a genuinely different rendering model. None of the
6,597 lines' DOM-manipulation code has an RN equivalent to adapt into;
every screen must be redrawn as RN components from scratch. This is by far
the single largest cost item in this whole evaluation — restated plainly
in Phase 10.

## Order logic (submit/pay/register)

`submitOrder`, `completePayment`, `registerTableOrder`,
`buildDineInRegisterPayload`, VAT/total calculation, `client_order_uuid`
generation — real business logic (Supabase RPC payloads, idempotency
keys), but interleaved in the SAME functions as DOM updates (`showToast`,
direct element writes) rather than cleanly separated.

**🟡 Needs an adapter, not a rewrite of the logic itself** — the actual
calculations and Supabase call shapes are portable JS; extracting them
away from `document.*` calls into pure functions is real, necessary
refactoring work, not a redesign of what they compute.

## Offline Queue (IndexedDB)

`openPosDb()`, `POS_DB_NAME='rakeen_pos'`, three object stores
(`pending_orders`, `kv_cache`, `print_jobs`), `queueOrder`/`syncQueue()`
with exponential backoff and the `stuck`/`SYNC_MAX_AUTO_RETRIES` circuit
breaker.

**🟡 concept, 🔴 implementation.** The *design* (retry/backoff/circuit
breaker/idempotent server-side dedup) is 100% portable reasoning — none of
it is browser-specific. The *implementation* is 100% `indexedDB.*` calls,
and **`IndexedDB does not exist in React Native at all`** (RN runs on
Hermes/JSC, not a browser DOM). Every read/write site needs a different
storage API — see Phase 8 for the actual options evaluation.

## Print Queue

`enqueuePrintJob`, `PRINT_STORE` (an IndexedDB store), retry/backoff/
dedup (`activePrintJobByContentKey`), and the call into
`window.AndroidPrint.printRaw(base64, ip, port, callbackId)`.

**🟡 concept, 🔴 both storage and bridge mechanism.** Same IndexedDB
problem as the order queue, PLUS the `window.AndroidPrint` global-object
bridge pattern (a WKWebView/Capacitor-specific trick) has no meaning in
React Native — RN uses `NativeModules.RakeenPrinterModule.print(...)`
instead, a different call shape entirely (see Phase 3/4).

## Authentication

`createBrowserClient` (`@supabase/ssr`) for owner/manager auth (cookie-based
session), separate cashier PIN flow storing state in `localStorage`
(`rakeen_pos_staff`).

**🟡 needs an adapter.** Supabase officially supports React Native — the
same `@supabase/supabase-js` client works, but needs `AsyncStorage` (or
MMKV) wired in as the session storage adapter instead of cookies, per
Supabase's own documented RN setup. Not a redesign, a different storage
adapter passed to the same SDK.

## Supabase calls (REST/RPC)

Every `.from().select()`/`.rpc()` call in `rakeen-pos.js` is a plain HTTP
call through the Supabase JS SDK.

**🟢 mostly direct** — the SDK works the same way in RN once the client is
initialized with an RN-appropriate storage adapter (the one dependency,
covered above under Authentication).

## Network state model

`NETWORK_STATE` object, fed by `navigator.onLine`/`online`/`offline`
browser events (for `internet`) and real Supabase round-trip outcomes via
`reportCloudResult()` (for `cloud`).

**🟡 needs an adapter.** `navigator.onLine` doesn't exist in RN — the
standard replacement is `@react-native-community/netinfo`, which is
arguably *more* capable (distinguishes WiFi/cellular, gives an actual
reachability check, not just a boolean). The `reportCloudResult()` pattern
itself (never trusting `onLine` alone, only real request outcomes) is
sound design that ports over unchanged in spirit.

## Diagnostics screen

`diagnoseProblem()` (pure logic: internet vs. cloud vs. bridge vs. printer,
one plain-language sentence) plus a rendered HTML body.

**🟡 logic portable, 🔴 UI.** The diagnosis function itself is pure JS
with no DOM dependency — moves directly. Its HTML rendering
(`renderDiagnosticsBody()`) is DOM-templated and needs the same full-UI
rewrite as every other screen.

## Printer architecture (current native bridge)

`window.AndroidPrint`/`window.NativeCashDrawer`, injected via a
`WKUserScript` from `MainViewController.swift`, backed by
`PrinterManager`/`PrinterTransport`/`NetworkPrinterTransport` (raw
`NWConnection` TCP, ESC/POS bytes built entirely on the web side via
`<canvas>`).

**🟡 the Swift transport logic is reusable, 🔴 the bridging mechanism is
not.** `NetworkPrinterTransport.swift`'s actual socket code (connect,
send, timeout, error mapping) has no Capacitor/WKWebView dependency at
all — it's plain `Network.framework`. It can be lifted almost as-is into a
React Native Native Module (Phase 4). What must change is *how JS reaches
it*: a `WKScriptMessageHandler`/injected-global pattern has no equivalent
in RN, which uses `NativeModules`/Turbo Native Modules instead — a
different, RN-native bridging mechanism, not an adaptation of the current
one.

## Cash Drawer

Same shape as the printer (`kickCashDrawer`, shared transport). Same
classification: 🟡 transport logic reusable, 🔴 bridge mechanism rewritten.

## Device / hardware APIs — all browser-specific, no direct RN equivalent

- **`<canvas>` receipt rasterization** (`renderReceiptCanvas`/
  `canvasToEscPosRaster`) — this is how Arabic text/logos/QR codes get
  turned into ESC/POS raster bytes today, and it's the single biggest
  reason the current architecture avoids ever needing native Arabic
  font-shaping code. **🔴 React Native has no built-in Canvas API at all.**
  A library like `react-native-skia` could theoretically reproduce this,
  but that's new, non-trivial native-adjacent work, not a drop-in port —
  flagged clearly for Phase 10's cost comparison.
- **Invoice OCR** (`tesseract.js`, WASM-based, browser/Canvas-dependent) —
  🔴 not RN-compatible as-is; would need a native OCR module or a
  different library entirely.
- **QR/barcode scanning** (`jsqr`, operates on Canvas `ImageData`) — 🔴
  same problem; RN needs a native camera+barcode library
  (e.g. `react-native-vision-camera` + a barcode plugin).
- **Audio** (`new Audio()`, `AudioContext` for alert/tap sounds) — 🔴 no
  direct RN equivalent; needs `react-native-sound`/`expo-av` or similar.
- **`localStorage`/`sessionStorage`** — 🔴 don't exist in RN; replaced by
  `AsyncStorage`/MMKV (see Phase 8).
- **Service Worker** (`pos-sw.js`, app-shell caching) — 🔴 no RN concept
  of a Service Worker at all; simply doesn't exist as a problem to port —
  RN apps ship their JS bundle inside the app binary itself, so this
  entire caching concern disappears rather than needing a replacement.
- **`window.open`/`target="_blank"`** (WhatsApp/Maps links) — 🟡 RN has
  `Linking.openURL(...)`, a direct conceptual equivalent, different API
  call.

## Summary table

| Area | Classification | Why |
|---|---|---|
| UI/screens (all of `pos-markup.ts` + DOM code in `rakeen-pos.js`) | 🔴 | No DOM/HTML/CSS in RN — full rewrite |
| Order/payment business logic | 🟡 | Logic portable, needs extraction from DOM-coupled functions |
| Offline queue (IndexedDB) | 🟡 concept / 🔴 implementation | IndexedDB doesn't exist in RN |
| Print queue | 🟡 concept / 🔴 bridge+storage | Same storage problem + `window.X` bridge pattern doesn't exist in RN |
| Auth (Supabase) | 🟡 | Same SDK, different storage adapter |
| Supabase REST/RPC calls | 🟢 | Same SDK, works as-is once client is set up |
| Network state model | 🟡 | `navigator.onLine` → `NetInfo`, same design |
| Diagnostics | 🟡 logic / 🔴 UI | Pure function portable; rendering isn't |
| Printer/drawer native transport (Swift) | 🟡 | Socket logic reusable; JS bridge mechanism isn't |
| Canvas-based ESC/POS rendering | 🔴 | No Canvas API in RN at all |
| OCR / QR scanning | 🔴 | Browser/WASM/Canvas-dependent libraries |
| Audio alerts | 🔴 | No direct RN equivalent API |
| Service Worker | 🔴 (moot) | Concept doesn't exist in RN — not a gap, just absent |
