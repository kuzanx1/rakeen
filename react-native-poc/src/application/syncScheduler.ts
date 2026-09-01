import NetInfo from '@react-native-community/netinfo';
import { syncQueuedOrdersNow } from './orderService';
import { reportCloudSyncOutcome } from './diagnosticsService';
import { shouldTriggerSyncOnNetChange, SYNC_POLL_INTERVAL_MS } from '../domain/sync';

export { SYNC_POLL_INTERVAL_MS, shouldTriggerSyncOnNetChange } from '../domain/sync';

/**
 * Checkpoint 9 (Offline Queue + Sync) -- the actual missing piece.
 * `syncQueuedOrdersNow()` (application/orderService.ts, wired since
 * Checkpoint 5) and the pure retry/backoff/circuit-breaker algorithm
 * underneath it (domain/orderQueue.ts) were both real and both verified
 * -- but nothing in the app ever CALLED syncQueuedOrdersNow()
 * automatically. A queued offline order would sit in SQLite forever
 * until some future manual trigger existed. This file is that trigger,
 * ported directly from the real PWA's own mechanism
 * (public/pos/rakeen-pos.js): `window.addEventListener('online',
 * syncQueue)` plus `setInterval(syncQueue, 30000)` as a safety net for
 * the cases a browser/OS 'online' event doesn't fire reliably. Not a new
 * design -- the same two-trigger shape, ported to NetInfo's equivalent
 * connectivity-restored event and a JS interval. The pure decision logic
 * (`shouldTriggerSyncOnNetChange`) lives in domain/sync.ts, not here --
 * see that file's own doc comment for why.
 *
 * syncQueuedOrdersNow() already guards against overlapping runs
 * internally (its own `syncing` flag, Checkpoint 5) -- this file doesn't
 * duplicate that guard, it just decides WHEN to call it.
 */

/**
 * Starts the auto-sync loop; returns a real cleanup function. Callers
 * (see App.tsx) are expected to start this once a cashier session is
 * active and stop it on logout -- syncing while logged out would just
 * fail every RPC's `has_permission()` check anyway (no valid
 * `auth.uid()`), so gating on session state isn't just tidy, it avoids a
 * guaranteed-failing background loop.
 */
export function startAutoSync(): () => void {
  const trigger = () => {
    syncQueuedOrdersNow()
      .then(outcome => {
        // Checkpoint 13 (Diagnostics) -- piggyback on this REAL sync
        // round-trip's outcome to report the "Cloud" signal, exactly
        // like the PWA's own reportCloudResult (never a separate
        // dedicated health-check ping). outcome is null if another
        // call was already in flight (syncQueuedOrdersNow's own
        // overlapping-run guard) -- nothing to report in that case.
        if (outcome) reportCloudSyncOutcome(outcome.anySucceeded, outcome.anyFailed, outcome.lastFailure);
      })
      .catch(() => {
        // syncQueuedOrdersNow() itself never throws (see its own doc
        // comment) -- this catch exists only in case a future change adds
        // one, so a background trigger can never crash the app.
      });
  };

  // Immediate pass on start -- flushes anything queued from a previous
  // session/app-kill without waiting up to 30s for the first interval
  // tick, matching how a fresh page load's first syncQueue() call in the
  // PWA isn't deferred either.
  trigger();

  const netInfoSubscription = NetInfo.addEventListener(state => {
    if (shouldTriggerSyncOnNetChange(state)) trigger();
  });

  const intervalId = setInterval(trigger, SYNC_POLL_INTERVAL_MS);

  return () => {
    netInfoSubscription();
    clearInterval(intervalId);
  };
}
