import * as kvStorage from './mmkvStorage';

/**
 * Minimal placeholder for printer/drawer target configuration --
 * mirrors DEVICE.printerIp/printerPort in rakeen-pos.js, but a real
 * Settings screen to populate this doesn't exist yet (that's Checkpoint
 * 11, Network Printer). Returns null/null until then, which is the
 * HONEST state: with nothing configured, a drawer-kick attempt should
 * correctly fail rather than pretend a target exists. Not a stub that
 * fakes success -- a stub that faithfully represents "not configured
 * yet", the same way printerBridgeAvailable() in the current PWA honestly
 * reports unavailable rather than guessing. Storage engine is MMKV as of
 * Checkpoint 8 (Offline Storage) -- was AsyncStorage; see
 * infrastructure/mmkvStorage.ts's own doc comment for why.
 */
const PRINTER_TARGET_KEY = 'rakeen_pos_printer_target';

export interface PrinterTargetConfig {
  host: string | null;
  port: number | null;
}

export async function getPrinterTarget(): Promise<PrinterTargetConfig> {
  try {
    const raw = await kvStorage.getItem(PRINTER_TARGET_KEY);
    return raw ? JSON.parse(raw) : { host: null, port: null };
  } catch {
    return { host: null, port: null };
  }
}

export async function savePrinterTarget(config: PrinterTargetConfig): Promise<void> {
  await kvStorage.setItem(PRINTER_TARGET_KEY, JSON.stringify(config));
}
