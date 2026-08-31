/**
 * Domain layer: the offline order queue's pure algorithm, ported exactly
 * from public/pos/rakeen-pos.js's real syncQueue() -- same constants, same
 * backoff formula, same stuck-circuit-breaker, same "never stop on one
 * item's failure" loop (the actual mechanism behind requirement 8's "no
 * head-of-line blocking"). Storage-agnostic and dispatch-agnostic on
 * purpose: this file has zero I/O, which is what makes it possible to
 * verify the ALGORITHM for real from Windows (via a fake in-memory
 * QueueStorage/dispatch in a throwaway script) even though the real
 * SQLite-backed storage (infrastructure/sqliteOrderQueue.ts) can only be
 * compile-checked here, never run, since it needs a real iOS/Android
 * runtime.
 */

import { QueuedPayload } from './order';

/** Orders are financial data -- "give up and delete" is never acceptable
 *  (contrast with the print queue, which is allowed a permanent,
 *  dismissable "failed" state -- printing is cosmetic-adjacent, a
 *  financial record is not). Exactly SYNC_MAX_AUTO_RETRIES/
 *  SYNC_MAX_BACKOFF_MS from the source, unchanged. */
export const SYNC_MAX_BACKOFF_MS = 5 * 60 * 1000;
export const SYNC_MAX_AUTO_RETRIES = 10;

export function computeBackoffMs(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), SYNC_MAX_BACKOFF_MS);
}

export function isDueForRetry(item: QueuedPayload, now: number): boolean {
  return !(item.next_retry_at && item.next_retry_at > now);
}

/** Returns the updated queue item after a failed dispatch attempt --
 *  mirrors the source's exact retry_count/next_retry_at/stuck update, but
 *  as a pure function returning a new object instead of mutating and
 *  re-persisting inline, so it's independently testable. */
export function applyFailure(item: QueuedPayload, errorMessage: string, now: number): QueuedPayload {
  const retryCount = (item.retry_count || 0) + 1;
  const nowStuck = retryCount >= SYNC_MAX_AUTO_RETRIES;
  const backoff = computeBackoffMs(retryCount);
  return {
    ...item,
    retry_count: retryCount,
    last_error: errorMessage,
    next_retry_at: nowStuck ? Infinity : now + backoff,
    stuck: nowStuck,
  };
}

export interface QueueStorage {
  put(item: QueuedPayload): Promise<void>;
  remove(clientOrderUuid: string): Promise<void>;
  getAll(): Promise<QueuedPayload[]>;
}

export interface SyncOutcome {
  anySucceeded: boolean;
  anyFailed: boolean;
  lastFailure: unknown;
  /** client_order_uuids that just transitioned into `stuck` this pass --
   *  the source fires a toast only on this exact transition, not every
   *  pass afterward; callers decide how to surface it (a toast, a log
   *  line, nothing in a test). */
  newlyStuck: string[];
}

/**
 * The queue-processing loop itself, decoupled from IndexedDB/SQLite and
 * from the real Supabase RPC calls -- `storage` and `dispatch` are
 * injected so this exact function can be run in a plain Node script
 * against a fake in-memory storage/dispatch to prove requirement 8 ("a
 * failed order must not block another") without needing a device. The
 * REAL app wires this to infrastructure/sqliteOrderQueue.ts and
 * application/orderService.ts's real RPC dispatch -- same function,
 * real dependencies.
 *
 * Critical property, ported exactly: the loop never stops or `break`s on
 * one item's failure -- every queued item gets a real attempt every pass,
 * each with its own independent try/catch, exactly like the source's own
 * comment explains was a real bug once (one permanently-invalid item used
 * to block everything queued behind it).
 */
export async function syncQueuedOrders(
  storage: QueueStorage,
  dispatch: (payload: QueuedPayload) => Promise<unknown>,
  now: number,
): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { anySucceeded: false, anyFailed: false, lastFailure: null, newlyStuck: [] };
  const queued = await storage.getAll();
  for (const payload of queued) {
    if (!isDueForRetry(payload, now)) continue;
    try {
      await dispatch(payload);
      await storage.remove(payload.client_order_uuid);
      outcome.anySucceeded = true;
    } catch (e) {
      outcome.anyFailed = true;
      outcome.lastFailure = e;
      const wasStuck = !!payload.stuck;
      const updated = applyFailure(payload, e instanceof Error ? e.message : String(e), now);
      await storage.put(updated);
      if (updated.stuck && !wasStuck) outcome.newlyStuck.push(payload.client_order_uuid);
    }
  }
  return outcome;
}
