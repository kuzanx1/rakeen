import * as kvStorage from './mmkvStorage';
import type { PrinterProfile } from '../platform/printer';

/**
 * Checkpoint 11 (Printer Configuration) -- the real Settings-backed
 * store that infrastructure/printerConfig.ts's own doc comment (written
 * in Checkpoint 6) predicted: "a real Settings screen to populate this
 * doesn't exist yet (that's Checkpoint 11...)". Replaces that file
 * entirely -- its narrow {host, port} shape is superseded by the full
 * PrinterProfile (platform/printer.ts, Checkpoint 1's contract), which
 * every real caller (paymentService.ts, printService.ts) needs anyway
 * for transport/drawerCapabilities, not just host/port. Uses MMKV
 * (Checkpoint 8's validated flat-cache engine), not a new storage
 * decision.
 */
const PRINTER_PROFILE_KEY = 'rakeen_pos_printer_profile';

export async function getPrinterProfile(): Promise<PrinterProfile | null> {
  try {
    const raw = await kvStorage.getItem(PRINTER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePrinterProfile(profile: PrinterProfile): Promise<void> {
  await kvStorage.setItem(PRINTER_PROFILE_KEY, JSON.stringify(profile));
}

export async function clearPrinterProfile(): Promise<void> {
  await kvStorage.removeItem(PRINTER_PROFILE_KEY);
}
