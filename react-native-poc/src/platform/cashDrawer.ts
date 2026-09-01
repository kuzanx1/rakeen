import { NativeModules } from 'react-native';
import type { PrinterTarget, PrinterErrorCategory } from './printer';
import {
  shouldAttemptNativeKick,
  isAlreadySucceeded,
  isInFlight,
  nextStatusAfterAttempt,
  DrawerOperationStatus,
} from '../domain/drawerIdempotency';

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
 * this app session — a fast-path guard against rapid double-taps
 * overlapping within milliseconds, before either call even reaches a
 * SQLite round-trip. This is NOT the sole source of truth for
 * cross-restart idempotency (an earlier version of this comment claimed
 * it didn't need to be — the migration's Payment checkpoint made that
 * requirement explicit, and it was wrong not to plan for it): the
 * PERSISTED `drawer_state` on the payment record
 * (application/paymentService.ts, backed by
 * infrastructure/sqliteOrderQueue.ts) is what actually survives an app
 * restart. paymentService.ts checks that persisted state BEFORE ever
 * calling `openCashDrawer()` at all; this in-memory map is a second,
 * belt-and-suspenders layer on top, same dedup shape as the print queue's
 * `activePrintJobByContentKey` (public/pos/rakeen-pos.js). Checkpoint 12
 * extracted the actual succeeded/in_flight/none DECISION this Map/Set
 * pair implements into domain/drawerIdempotency.ts, a pure module —
 * same behavior, same states, now independently testable (importing
 * this file itself under Node fails, since NativeModules pulls in
 * react-native's own Flow-typed index.js).
 */
const drawerOperations = new Map<string, Promise<CashDrawerResult>>();
const succeededOperations = new Set<string>();

/** The actual state-lookup feeding the pure decision functions in
 *  domain/drawerIdempotency.ts -- the Map/Set ARE the real, stateful
 *  storage (unchanged from before this checkpoint); this just reports
 *  what they currently say about one operationId, as the 3-state enum
 *  the pure module reasons about. */
function statusFor(operationId: string): DrawerOperationStatus {
  if (succeededOperations.has(operationId)) return 'succeeded';
  if (drawerOperations.has(operationId)) return 'in_flight';
  return 'none';
}

export async function openCashDrawer(options: CashDrawerOpenOptions): Promise<CashDrawerResult> {
  const status = statusFor(options.operationId);

  if (isAlreadySucceeded(status)) {
    return { ok: true };
  }
  if (isInFlight(status)) {
    return drawerOperations.get(options.operationId)!;
  }
  if (!shouldAttemptNativeKick(status)) {
    // Unreachable given the 3-state enum above (every status is one of
    // succeeded/in_flight/none) -- kept so the pure predicate, not an
    // assumption here, is what actually gates the native call.
    return { ok: false, error: 'CASH_DRAWER_UNAVAILABLE' };
  }

  if (!CashDrawer) {
    return { ok: false, error: 'CASH_DRAWER_UNAVAILABLE' };
  }

  const attempt = CashDrawer.open(options).then(result => {
    drawerOperations.delete(options.operationId);
    if (nextStatusAfterAttempt(result.ok) === 'succeeded') {
      succeededOperations.add(options.operationId);
    }
    return result;
  });
  drawerOperations.set(options.operationId, attempt);
  return attempt;
}
