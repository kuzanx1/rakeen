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

export type PrinterErrorCode =
  | 'invalid_target'
  | 'invalid_port'
  | 'connection_refused'
  | 'connection_timeout'
  | 'host_unreachable'
  | 'unsupported_transport'
  | 'render_failed'
  | string; // native code may report a more specific string; never coerced

export interface PrintResult {
  ok: boolean;
  error?: PrinterErrorCode;
}

export interface ConnectionTestResult {
  reachable: boolean;
  /** Round-trip time to open the socket, if reachable — useful in the POC
   *  screen's "Test Printer" button so a slow/flaky LAN is visible, not
   *  just a boolean. */
  latencyMs?: number;
  error?: PrinterErrorCode;
}

export type PrinterStatusKind =
  | 'unknown' // no status query attempted — the honest default (see the
  // known-gap note in NetworkPrinterTransport.swift: no bidirectional
  // ESC/POS status read-back is implemented anywhere yet)
  | 'idle'
  | 'unreachable';

export interface PrinterStatus {
  status: PrinterStatusKind;
  lastError?: PrinterErrorCode;
}

export interface PrinterAPI {
  print(job: PrintJob): Promise<PrintResult>;
  testConnection(target: PrinterTarget): Promise<ConnectionTestResult>;
  getStatus(): Promise<PrinterStatus>;
  capabilities(): Promise<PrinterCapabilities>;
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
