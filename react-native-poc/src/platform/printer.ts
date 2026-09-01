import { NativeModules } from 'react-native';

/**
 * The one printer contract the whole app talks to. No file outside this
 * one imports NativeModules.RakeenPrinterModule directly — every screen
 * and every piece of POS logic calls `Printer.*` and never learns whether
 * it's running on iOS or Android.
 *
 * Deliberately mirrors the transport-abstraction shape already built and
 * CI-proven for the Capacitor/Swift side
 * (docs/ios-native-bridge-interfaces.md §4, ios/App/App/PrinterTransport.swift)
 * rather than inventing a different design without cause — `PrinterTarget`/
 * `PrinterCapabilities` below are the same concepts, just expressed as a
 * TypeScript contract instead of Swift, since this POC's whole point is to
 * cross both iOS and Android with one JS-facing shape.
 */

export type PrinterTransportKind = 'network' | 'bluetooth' | 'usb';

/** Never assume port 9100 — it's a common default, not a universal fact
 *  about every network printer. Every real printer target must state its
 *  own port explicitly. */
export interface PrinterTarget {
  transport: PrinterTransportKind;
  /** Network only: IP address or resolvable hostname. */
  host?: string;
  /** Network only: required, never defaulted at this layer — see
   *  `docs/react-native-poc/phase3-printer-contract.md` for why the
   *  default-9100 UI convenience belongs in the Settings screen, not
   *  buried in the transport contract. */
  port?: number;
  /** Bluetooth only, once a real implementation exists — not used by
   *  anything today (see Phase 4/5: only `network` is implemented). */
  bluetoothId?: string;
  /** USB only, once a real implementation exists — not used by anything
   *  today. */
  usbAccessoryId?: string;
}

export interface PrinterCapabilities {
  /** Which transports actually have a working native implementation on
   *  THIS running platform/build — not aspirational. A POC/dev build with
   *  only NetworkPrinterModule wired up reports `['network']` here, even
   *  though the enum type allows more values. */
  supportedTransports: PrinterTransportKind[];
  supportsCut: boolean;
  supportsCashDrawerKick: boolean;
  /** e.g. 384 (58mm) or 576 (80mm) — matches the web layer's existing
   *  `DEVICE.printerPaperWidth` convention (px at ~203dpi), kept here only
   *  as a capability *declaration*, not something native code reads back —
   *  the app builds bytes at whatever width it decides, same as today. */
  paperWidthPx: number;
}

/**
 * Per-model drawer behavior override. Most real setups wire the drawer
 * through the receipt printer's own RJ11 port and the standard ESC/POS
 * kick command works — `kickCommandBase64` exists so a confirmed-different
 * real model has somewhere to override it, not because any model has
 * actually required one yet.
 */
export interface DrawerCapabilities {
  supported: boolean;
  kickCommandBase64?: string;
}

/**
 * A configured printer, extensible per the migration's explicit
 * requirement (docs/react-native-migration — never assume one brand,
 * model, port, ESC/POS behavior, or drawer command). Not yet backed by a
 * real Settings UI or persisted anywhere — this is the shape a future
 * printer-configuration screen will populate; `PrinterTarget` above
 * remains the minimal thing actually passed to `Printer.print()` today.
 */
export interface PrinterProfile {
  brand?: string;
  model?: string;
  transport: PrinterTransportKind;
  /** IP address or resolvable hostname — network transport only. */
  host?: string;
  /** Never defaulted here. A Settings UI may pre-fill 9100 as a
   *  convenience value, but this contract never assumes it. */
  port?: number;
  protocol: 'escpos';
  paperWidthPx?: number;
  capabilities: PrinterCapabilities;
  drawerCapabilities: DrawerCapabilities;
  /** Feature Parity Pass -- Printing Configuration. Ported verbatim from
   *  the PWA's real DEVICE.printCustomerReceipt/printKitchenTicket/
   *  printReceiptLogo (public/pos/rakeen-pos.js's openPosSettingsModal),
   *  same defaults: customer receipt on by default, kitchen ticket OFF
   *  by default (`=== true`, not `!== false`, in the source), logo on
   *  by default. Absent (undefined) on any already-persisted profile
   *  from before this pass -- domain/printerProfile.ts's own read
   *  helpers apply these exact defaults, never silently assume the
   *  opposite. */
  printCustomerReceipt?: boolean;
  printKitchenTicket?: boolean;
  printReceiptLogo?: boolean;
  /** A separate kitchen printer target -- ported from the PWA's real
   *  DEVICE.kitchenPrinterIp/kitchenPrinterPort, which itself falls back
   *  to the main printerIp/printerPort when left blank (some kitchens
   *  share one printer with the counter, some don't). Network-only,
   *  same as the main target -- no separate transport kind, since
   *  bluetooth/usb have no real implementation for either target. */
  kitchenHost?: string;
  kitchenPort?: number;
}

export interface PrintJob {
  target: PrinterTarget;
  /** Complete, pre-built ESC/POS byte stream (raster image + init + cut),
   *  base64-encoded — exactly the same "native code never understands
   *  Arabic text, only opaque bytes" principle as the current Capacitor
   *  bridge. Whatever renders the receipt (Canvas today, react-native-skia
   *  in a real RN port — see docs/react-native-poc/phase1-audit.md) is a
   *  separate concern from this contract. */
  escPosBase64: string;
  /** Milliseconds before giving up and reporting a timeout — the contract
   *  makes this explicit instead of leaving it as an undocumented native
   *  constant, unlike the current bridge's implicit 8s (see
   *  docs/ios-native-bridge-interfaces.md §1). */
  timeoutMs: number;
}

/**
 * Two-tier error model, per the migration's explicit "no fake success"
 * rule (docs/react-native-migration/00-protection-and-rollback.md):
 *
 * - `error` is one of a small set of RESERVED, exact-string categories the
 *   cashier-facing UI is allowed to branch on: `PRINTER_UNAVAILABLE` (no
 *   native transport exists at all for this platform/build — the honest
 *   equivalent of the old `printerBridgeAvailable() === false`),
 *   `PRINTER_CONNECTION_FAILED` (a transport exists but couldn't reach
 *   this specific target), `INVALID_TARGET`, `RENDER_FAILED`.
 * - `errorDetail` carries the specific real technical reason (e.g.
 *   `connection_refused`/`connection_timeout`/`host_unreachable`) for
 *   Diagnostics/support — never shown to the cashier as the primary
 *   message, never silently dropped either.
 */
export type PrinterErrorCategory =
  | 'PRINTER_UNAVAILABLE'
  | 'PRINTER_CONNECTION_FAILED'
  | 'INVALID_TARGET'
  | 'RENDER_FAILED';

export interface PrintResult {
  ok: boolean;
  error?: PrinterErrorCategory;
  errorDetail?: string;
}

export interface ConnectionTestResult {
  reachable: boolean;
  /** Round-trip time to open the socket, if reachable — useful in the POC
   *  screen's "Test Printer" button so a slow/flaky LAN is visible, not
   *  just a boolean. */
  latencyMs?: number;
  error?: PrinterErrorCategory;
  errorDetail?: string;
}

export type PrinterStatusKind =
  | 'unknown' // no status query attempted — the honest default (see the
  // known-gap note in NetworkPrinterTransport.swift: no bidirectional
  // ESC/POS status read-back is implemented anywhere yet)
  | 'idle'
  | 'unreachable';

export interface PrinterStatus {
  status: PrinterStatusKind;
  lastError?: PrinterErrorCategory;
  lastErrorDetail?: string;
}

export interface PrinterAPI {
  print(job: PrintJob): Promise<PrintResult>;
  testConnection(target: PrinterTarget): Promise<ConnectionTestResult>;
  getStatus(): Promise<PrinterStatus>;
  getCapabilities(): Promise<PrinterCapabilities>;
}

/**
 * Resolved by React Native's own module registry — `RakeenPrinterModule`
 * must exist as a real native module name on whichever platform this runs
 * on (`ios/RakeenPOC/RakeenPrinterModule.swift`,
 * `android/.../RakeenPrinterModule.kt`). If neither is linked (e.g. running
 * in a plain JS test), this is `undefined` — callers should treat that the
 * same way the current web app treats `printerBridgeAvailable() === false`:
 * an honest "not available," never a crash.
 */
export const Printer: PrinterAPI | undefined = NativeModules.RakeenPrinterModule;

/**
 * Thin wrapper enforcing the "no fake success" rule at the one place every
 * print attempt passes through: if `Printer` itself doesn't exist (no
 * native module linked on this platform/build), this returns
 * `PRINTER_UNAVAILABLE` honestly instead of the caller having to remember
 * to check `Printer === undefined` every time — the same discipline the
 * old web app's `printerBridgeAvailable()` enforced for `window.AndroidPrint`.
 */
export async function printReceipt(job: PrintJob): Promise<PrintResult> {
  if (!Printer) {
    return { ok: false, error: 'PRINTER_UNAVAILABLE' };
  }
  return Printer.print(job);
}
