import { NativeModules } from 'react-native';
import type { PrinterTarget, PrinterErrorCategory } from './printer';

/**
 * Deliberately does NOT assume every drawer uses the same kick command.
 * Most real-world setups wire the drawer through the receipt printer's own
 * RJ11 port and the standard ESC/POS kick sequence
 * (0x1B 0x70 0x00 0x19 0xFA — see ios/App/App/MainViewController.swift's
 * existing, hardcoded-but-documented default and
 * react-native-poc/ios/RakeenPOC/RakeenCashDrawerModule.swift's port of it)
 * works for the large majority of hardware. `kickCommandBase64` leaves
 * room for a per-drawer override WITHOUT requiring one to exist yet.
 */
export interface CashDrawerCapabilities {
  supported: boolean;
}

/**
 * `CASH_DRAWER_UNAVAILABLE` is the reserved, exact-string code for "no
 * native cash drawer module exists on this platform/build" — per the
 * migration's explicit "no fake success" rule. `PRINTER_CONNECTION_FAILED`
 * is reused from printer.ts since a drawer kick travels over the exact
 * same network transport as a print job — the same connection failure
 * modes apply.
 */
export type CashDrawerErrorCategory = 'CASH_DRAWER_UNAVAILABLE' | PrinterErrorCategory;

export interface CashDrawerOpenOptions {
  target: PrinterTarget;
  /** Override the default kick bytes for a specific drawer/printer model
   *  that's been confirmed (on real hardware, not guessed) to need
   *  different bytes. Base64-encoded. Omit for the standard default. */
  kickCommandBase64?: string;
  timeoutMs: number;
  /**
   * REQUIRED. One stable ID per logical drawer-open request — normally the
   * same `client_order_uuid`/payment ID already used for the order itself.
   * Per the migration's explicit idempotency requirement: a double-tap or
   * an automatic retry for the SAME operationId must never kick the drawer
   * twice once a prior attempt for that ID already succeeded. This is
   * enforced in `openCashDrawer()` below (JS-side, in-memory), not inside
   * the native module — the native module has no concept of "the same
   * logical operation," it only ever executes one kick per call it
   * receives.
   */
  operationId: string;
}

export interface CashDrawerResult {
  ok: boolean;
  error?: CashDrawerErrorCategory;
  errorDetail?: string;
}

export interface CashDrawerAPI {
  open(options: CashDrawerOpenOptions): Promise<CashDrawerResult>;
  getCapabilities(): Promise<CashDrawerCapabilities>;
}

export const CashDrawer: CashDrawerAPI | undefined =
  NativeModules.RakeenCashDrawerModule;

/**
 * Tracks in-flight and completed drawer operations by `operationId` for
 * this app session. A successful kick is remembered so a later retry for
 * the SAME operationId short-circuits to `{ok:true}` without sending
 * another kick — mirrors the print queue's `activePrintJobByContentKey`
 * dedup pattern (public/pos/rakeen-pos.js) rather than inventing a
 * different approach. Deliberately in-memory only: a drawer kick is a
 * one-shot physical action tied to the current app session opening it,
 * not something that needs to survive an app restart the way the offline
 * order/print queues do (if the app restarts mid-payment, the cashier can
 * see the drawer is already open — the danger this guards against is
 * rapid double-taps within one session, not cross-restart replay).
 */
const drawerOperations = new Map<string, Promise<CashDrawerResult>>();
const succeededOperations = new Set<string>();

export async function openCashDrawer(options: CashDrawerOpenOptions): Promise<CashDrawerResult> {
  if (succeededOperations.has(options.operationId)) {
    return { ok: true };
  }
  const inFlight = drawerOperations.get(options.operationId);
  if (inFlight) {
    return inFlight;
  }

  if (!CashDrawer) {
    return { ok: false, error: 'CASH_DRAWER_UNAVAILABLE' };
  }

  const attempt = CashDrawer.open(options).then(result => {
    drawerOperations.delete(options.operationId);
    if (result.ok) {
      succeededOperations.add(options.operationId);
    }
    return result;
  });
  drawerOperations.set(options.operationId, attempt);
  return attempt;
}
