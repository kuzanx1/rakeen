/**
 * Checkpoint 12 (Cash Drawer) -- the operationId dedup DECISION logic
 * platform/cashDrawer.ts's openCashDrawer() has always implemented
 * (Checkpoint 1) inline against a module-level Map/Set, extracted into
 * a pure, I/O-free reducer so it's independently testable. Importing
 * platform/cashDrawer.ts itself under Node fails (confirmed, not
 * assumed -- it imports NativeModules from 'react-native', which
 * transitively hits react-native's own Flow-typed index.js, the same
 * barrier already documented for NetInfo/MMKV in Checkpoints 9/10).
 * This module changes NOTHING about openCashDrawer()'s external
 * behavior or contract -- it's the same decision, same states, just
 * expressed as a pure function platform/cashDrawer.ts calls instead of
 * inlining the same logic against its own Map/Set.
 */

export type DrawerOperationStatus = 'none' | 'in_flight' | 'succeeded';

/**
 * Given whatever is currently known about an operationId, should a NEW
 * native kick actually be attempted? Mirrors openCashDrawer()'s exact
 * real checks: an operation already recorded as succeeded returns the
 * cached success without ever touching the native module again; an
 * operation already in flight shares that same attempt rather than
 * starting a second one; anything else (genuinely new, or previously
 * failed -- a failure is NOT cached, so a retry after a real failure
 * DOES attempt a fresh kick) proceeds to a real call.
 */
export function shouldAttemptNativeKick(status: DrawerOperationStatus): boolean {
  return status === 'none';
}

export function isAlreadySucceeded(status: DrawerOperationStatus): boolean {
  return status === 'succeeded';
}

export function isInFlight(status: DrawerOperationStatus): boolean {
  return status === 'in_flight';
}

/** Pure state transition after a real dispatch attempt resolves --
 *  ported from openCashDrawer()'s own `.then()` handler: only a
 *  genuine `ok:true` result is ever cached as 'succeeded' (never a
 *  failure, so a later retry of the same operationId after a real
 *  failure gets a real fresh attempt, not a cached failure). */
export function nextStatusAfterAttempt(ok: boolean): DrawerOperationStatus {
  return ok ? 'succeeded' : 'none';
}
