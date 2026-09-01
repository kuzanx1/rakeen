import type { PrinterProfile, PrinterTarget, PrinterTransportKind } from '../platform/printer';

/**
 * Checkpoint 11 (Printer Configuration + Hardware Abstraction) -- pure
 * validation and target-derivation logic for a real, user-configured
 * PrinterProfile (platform/printer.ts, Checkpoint 1's contract, unused
 * by any real Settings flow until now). Zero I/O -- no MMKV, no
 * NativeModules -- so it's directly testable.
 */

/**
 * Feature Parity Pass -- Bluetooth/USB now have a real, CI-compiled
 * native implementation on at least one platform each (iOS: BLE via
 * CoreBluetooth; Android: classic Bluetooth + USB host) -- see
 * ios/RakeenPOC/BluetoothPrinterTransport.swift and
 * android/.../BluetoothClassicPrinterTransport.kt /
 * UsbPrinterTransport.kt. All three are allowed to be SELECTED here;
 * a transport genuinely unsupported on the running platform/build
 * (iOS has no USB host access for a non-MFi accessory -- a real Apple
 * restriction, not an oversight) fails honestly at the native call
 * (TRANSPORT_NOT_SUPPORTED), per platform/printer.ts's own
 * PrinterCapabilities doc comment: `supportedTransports` is what a
 * given running build actually reports, not a static allowlist here.
 */
export const SUPPORTED_TRANSPORTS: readonly PrinterTransportKind[] = ['network', 'bluetooth', 'usb'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isValidBase64(s: string): boolean {
  if (s.length === 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0;
}

/**
 * Never assumes port 9100 -- an empty/missing port is a validation
 * error, not a silently-applied default (requirement 5). Never assumes
 * Sunmi NT310 or any specific brand/model -- those fields are free text
 * with no whitelist (requirement 4).
 */
export function validatePrinterProfile(profile: PrinterProfile): ValidationResult {
  const errors: string[] = [];

  if (!SUPPORTED_TRANSPORTS.includes(profile.transport)) {
    errors.push(`النقل '${profile.transport}' غير مدعوم حاليًا — الشبكة (network) فقط مطبّقة.`);
  }

  if (profile.transport === 'network') {
    if (!profile.host || !profile.host.trim()) {
      errors.push('عنوان IP/المضيف مطلوب لطابعة الشبكة.');
    }
    if (profile.port == null) {
      errors.push('المنفذ (Port) مطلوب — لا يُفترض 9100 تلقائيًا.');
    } else if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
      errors.push('المنفذ يجب أن يكون رقمًا صحيحًا بين 1 و 65535.');
    }
  }

  // Feature Parity Pass -- Bluetooth/USB. A device must actually be
  // SELECTED (via a real scanDevices() result, never guessed/typed) --
  // no "just enter an ID" text field exists for either, on purpose.
  if (profile.transport === 'bluetooth' && (!profile.bluetoothId || !profile.bluetoothId.trim())) {
    errors.push('اختر جهاز بلوتوث أولًا عبر البحث عن الأجهزة القريبة.');
  }
  if (profile.transport === 'usb' && (!profile.usbAccessoryId || !profile.usbAccessoryId.trim())) {
    errors.push('اختر جهاز USB أولًا عبر البحث عن الأجهزة المتصلة.');
  }

  if (profile.protocol !== 'escpos') {
    errors.push(`البروتوكول '${profile.protocol}' غير مدعوم — ESC/POS فقط مطبّق.`);
  }

  if (profile.paperWidthPx != null && profile.paperWidthPx <= 0) {
    errors.push('عرض الورق يجب أن يكون رقمًا موجبًا.');
  }

  if (profile.drawerCapabilities.supported && profile.drawerCapabilities.kickCommandBase64) {
    if (!isValidBase64(profile.drawerCapabilities.kickCommandBase64)) {
      errors.push('أمر فتح الدرج المخصص يجب أن يكون Base64 صالحًا.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Derives the PrinterTarget actually passed to Printer.print()/
 * openCashDrawer() from a full profile. Returns null (not a guessed
 * target) when the profile is missing or fails its own validation --
 * every caller must handle "no valid target configured" as a real,
 * honest state (PRINTER_UNAVAILABLE / CASH_DRAWER_UNAVAILABLE), never
 * silently substitute a default.
 */
export function profileToPrinterTarget(profile: PrinterProfile | null): PrinterTarget | null {
  if (!profile) return null;
  if (!validatePrinterProfile(profile).valid) return null;
  if (profile.transport === 'network') {
    return { transport: 'network', host: profile.host as string, port: profile.port as number };
  }
  if (profile.transport === 'bluetooth') {
    return { transport: 'bluetooth', bluetoothId: profile.bluetoothId as string };
  }
  if (profile.transport === 'usb') {
    return { transport: 'usb', usbAccessoryId: profile.usbAccessoryId as string };
  }
  return null;
}

/**
 * The kitchen ticket's own print target -- ported from the PWA's real
 * sendKitchenTicketToPrinter() fallback (`ip || DEVICE.printerIp`,
 * `port || DEVICE.printerPort`): a kitchen printer is only a REAL
 * override when both a host and port are explicitly set; otherwise
 * kitchen tickets go to the same target the customer receipt does
 * (one physical printer serving both, the common small-shop setup).
 * Same "never fabricate a target" honesty as profileToPrinterTarget --
 * returns null when even the main target isn't valid.
 */
export function profileToKitchenPrinterTarget(profile: PrinterProfile | null): PrinterTarget | null {
  if (!profile) return null;
  if (profile.kitchenHost && profile.kitchenHost.trim() && profile.kitchenPort != null) {
    return { transport: 'network', host: profile.kitchenHost, port: profile.kitchenPort };
  }
  return profileToPrinterTarget(profile);
}

/** Same defaults as the PWA's real DEVICE toggles -- customer receipt
 *  printing is opt-OUT (`!== false`), kitchen ticket printing is
 *  opt-IN (`=== true`), the receipt logo is opt-OUT (`!== false`). An
 *  already-persisted profile from before this pass has these fields
 *  `undefined`, which these helpers resolve to the same defaults the
 *  PWA itself would for a fresh DEVICE object -- never a silent
 *  behavior change for an existing installation. */
export function shouldPrintCustomerReceipt(profile: PrinterProfile | null): boolean {
  return profile?.printCustomerReceipt !== false;
}

export function shouldPrintKitchenTicket(profile: PrinterProfile | null): boolean {
  return profile?.printKitchenTicket === true;
}

export function shouldPrintReceiptLogo(profile: PrinterProfile | null): boolean {
  return profile?.printReceiptLogo !== false;
}

/**
 * The drawer kick override, if this profile's hardware has been
 * confirmed to need one. Returns undefined (not a fabricated default)
 * when the drawer isn't marked supported at all -- callers must treat
 * `drawerCapabilities.supported === false` as CASH_DRAWER_UNAVAILABLE,
 * never attempt a kick regardless of whether a target is configured.
 */
export function drawerKickCommandFor(profile: PrinterProfile | null): string | undefined {
  if (!profile || !profile.drawerCapabilities.supported) return undefined;
  return profile.drawerCapabilities.kickCommandBase64;
}

export function isDrawerSupported(profile: PrinterProfile | null): boolean {
  return !!profile?.drawerCapabilities.supported;
}

export const PAPER_WIDTH_PRESETS: readonly { label: string; px: number }[] = [
  { label: '58mm', px: 384 },
  { label: '80mm', px: 576 },
];

/** A real, honest "nothing configured yet" starting point for the
 *  Settings form -- transport defaults to 'network' (the only supported
 *  one) but host/port are left empty rather than pre-filled with a
 *  guessed default, per requirement 5. */
export function emptyPrinterProfile(): PrinterProfile {
  return {
    brand: '',
    model: '',
    transport: 'network',
    host: '',
    port: undefined,
    protocol: 'escpos',
    paperWidthPx: 576,
    capabilities: {
      supportedTransports: ['network'],
      supportsCut: true,
      supportsCashDrawerKick: true,
      paperWidthPx: 576,
    },
    drawerCapabilities: { supported: true },
    printCustomerReceipt: true,
    printKitchenTicket: false,
    printReceiptLogo: true,
    kitchenHost: '',
    kitchenPort: undefined,
  };
}
