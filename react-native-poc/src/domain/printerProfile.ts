import type { PrinterProfile, PrinterTarget, PrinterTransportKind } from '../platform/printer';

/**
 * Checkpoint 11 (Printer Configuration + Hardware Abstraction) -- pure
 * validation and target-derivation logic for a real, user-configured
 * PrinterProfile (platform/printer.ts, Checkpoint 1's contract, unused
 * by any real Settings flow until now). Zero I/O -- no MMKV, no
 * NativeModules -- so it's directly testable.
 */

/**
 * Only 'network' has a real implementation anywhere in this app's
 * native modules (see platform/printer.ts's own PrinterCapabilities
 * doc comment: `supportedTransports` reports what actually has native
 * code, not what's aspirationally possible). Bluetooth/USB are kept in
 * the PrinterTransportKind type for a real future implementation, but
 * deliberately rejected here rather than pretending they work --
 * requirement 13's explicit instruction.
 */
export const SUPPORTED_TRANSPORTS: readonly PrinterTransportKind[] = ['network'];

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
  return null; // bluetooth/usb: no real implementation, never fabricate a target
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
  };
}
