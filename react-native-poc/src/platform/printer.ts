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
  /** Feature Parity Pass -- Bluetooth/USB. The selected device's
   *  reconnect identifier (see DiscoveredDevice.id's own doc comment)
   *  and a persisted display name, so PrinterSettingsScreen can show
   *  "Selected: XPrinter XP-58" without re-scanning every time the
   *  screen opens. Only meaningful when transport is 'bluetooth'/'usb'. */
  bluetoothId?: string;
  /**
   * أي أمر رسم يُرسَل للطابعة.
   *
   * 'modern' = `GS 8 L` fn112 + `GS ( L` fn50، وهو الأمر الحالي في
   * مواصفة ESC/POS، و`GS v 0` مصنّف مهجوراً عند Epson نفسها مع تسمية
   * هذا بديلاً له. القياس على NT310: ٦٩٤ سطراً بالأمر القديم = ٤٥
   * ثانية = ٦٥ ملّي ثانية للسطر، والمدى الفيزيائي ٥–٢٠ ملّي.
   *
   * 'legacy' موجود لأن الحديث ليس عالمياً: طابعة لا تعرفه لا تطبع
   * شيئاً بدل أن تطبع ببطء. مخرج طوارئ بيد المالك لا بيدي.
   */
  /**
   * كيف تُبنى الفاتورة قبل إرسالها.
   *
   * 'text'  -- أوامر ESC/POS نصية، والطابعة ترسم الحروف بخطها. أسرع
   *            بمراتب لأن الطابعة تدفع الورق بقدر السطر لا بقدر الصفحة،
   *            ومشروط بأن يغطي خطها العربية ويصلها ويرتّبها. زر ورقة
   *            الاختبار في الإعدادات يسأل ذلك قبل الاعتماد عليه.
   * 'image' -- تصيير كامل عندنا ثم إرسال صورة. مضمون على أي طابعة،
   *            وثمنه أن الطابعة تطبع صفحة نقطية كاملة.
   */
  receiptMode?: 'text' | 'image';
  /**
   * أي طراز طابعة هذا — مفتاح في KNOWN_PROFILES.
   *
   * منه تُشتق القدرات: هل ترتّب العربية، هل تدعم QR وباركود أصليين،
   * وكم عرضها. طراز غير معروف يأخذ الافتراضي المتحفّظ الذي لا يفسد
   * فاتورة ولو كان أبطأ.
   */
  capabilityProfileId?: string;
  rasterCommand?: 'modern' | 'legacy';
  bluetoothName?: string;
  usbAccessoryId?: string;
  usbAccessoryName?: string;
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
  | 'RENDER_FAILED'
  /** Feature Parity Pass -- Bluetooth/USB. A real, honest category for
   *  "the OS declined to grant Bluetooth/USB access" -- Android's
   *  BLUETOOTH_SCAN/BLUETOOTH_CONNECT runtime permissions or a declined
   *  UsbManager.requestPermission() dialog. Never silently retried as a
   *  connection failure -- the cashier needs to know this is a
   *  permission problem, not a hardware one. */
  | 'PERMISSION_DENIED'
  /** The requested transport has no real implementation on THIS
   *  platform/build (e.g. USB on iOS -- a genuine Apple platform
   *  restriction, ExternalAccessory/ MFi-only, not buildable for a
   *  generic non-MFi printer). Distinct from PRINTER_UNAVAILABLE (no
   *  native module at all) -- here the module exists and other
   *  transports on it work fine. */
  | 'TRANSPORT_NOT_SUPPORTED';

export interface PrintResult {
  ok: boolean;
  error?: PrinterErrorCategory;
  errorDetail?: string;
  /** Timestamped trace of what the native transport actually did --
   *  every NWConnection state, the endpoint iOS really bound, the
   *  interface it used, and the send completion. Present on success as
   *  well as failure: a successful `.contentProcessed` means the network
   *  stack accepted the bytes, NOT that the printer received them, so a
   *  successful send still needs its trace to be worth anything. */
  diagnostics?: string[];
}

export interface ConnectionTestResult {
  reachable: boolean;
  /** See PrintResult.diagnostics. */
  diagnostics?: string[];
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

/**
 * One nearby/paired device found by scanDevices(). Deliberately generic
 * -- `id` is whatever the platform's own transport uses to reconnect
 * later (a CoreBluetooth peripheral UUID on iOS BLE, a MAC address for
 * Android classic Bluetooth, a UsbDevice's deviceId on Android USB) and
 * is stored as `bluetoothId`/`usbAccessoryId` on PrinterProfile once
 * selected. `name` can legitimately be null (many BLE peripherals don't
 * advertise a local name) -- callers must handle that, never assume one.
 */
export interface DiscoveredDevice {
  id: string;
  name: string | null;
  /** BLE only -- signal strength in dBm, useful for picking the closest
   *  device when several appear. Absent for classic Bluetooth/USB. */
  rssi?: number;
}

export interface PrinterAPI {
  print(job: PrintJob): Promise<PrintResult>;
  testConnection(target: PrinterTarget): Promise<ConnectionTestResult>;
  getStatus(): Promise<PrinterStatus>;
  getCapabilities(): Promise<PrinterCapabilities>;
  /**
   * Feature Parity Pass -- Bluetooth/USB. Real device discovery:
   * - 'bluetooth' on iOS: CoreBluetooth central-manager scan for nearby
   *   BLE peripherals (generic -- no vendor/service-UUID assumption, see
   *   ios/RakeenPOC/BluetoothPrinterTransport.swift's own doc comment).
   * - 'bluetooth' on Android: classic Bluetooth (BluetoothAdapter) --
   *   returns already-BONDED (paired via Android's own Bluetooth
   *   settings) devices immediately, then appends newly-discovered ones
   *   as startDiscovery() finds them until `timeoutMs` elapses.
   * - 'usb' on Android: enumerates currently-attached USB devices whose
   *   interface class is 0x07 (USB Printer Class) -- standards-based,
   *   not a vendor allowlist.
   * - 'usb' on iOS, 'network' on either platform: always resolves to an
   *   empty array (network has no "discovery" concept here -- a host/
   *   port is typed in directly; iOS has no USB host API for a
   *   non-MFi-certified accessory at all -- a genuine platform
   *   restriction, not an oversight).
   */
  scanDevices(transport: PrinterTransportKind, timeoutMs: number): Promise<ScanDevicesResult>;
}

/**
 * `error` distinguishes "genuinely found nothing nearby" (empty
 * `devices`, no `error`) from "couldn't scan at all" (Bluetooth is
 * off/unauthorized, a runtime permission was declined, etc.) --
 * collapsing those into a silent empty array would tell a cashier who
 * denied the permission prompt the exact same nothing as one standing
 * next to a printer that's simply switched off.
 */
export interface ScanDevicesResult {
  devices: DiscoveredDevice[];
  error?: PrinterErrorCategory;
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
    return { ok: false, error: 'PRINTER_UNAVAILABLE', diagnostics: ['no native printer module linked'] };
  }
  return Printer.print(job);
}
