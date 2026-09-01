import NetInfo from '@react-native-community/netinfo';
import { processPrintQueueNow } from './printService';
import { shouldTriggerSyncOnNetChange } from '../domain/sync';
import { PRINT_POLL_INTERVAL_MS } from '../domain/printQueue';

/**
 * Checkpoint 10's counterpart to Checkpoint 9's
 * application/syncScheduler.ts -- same NetInfo-reconnect + interval
 * shape, ported from the PWA's own
 * `window.addEventListener('online', processPrintQueue)` +
 * `setInterval(processPrintQueue, 20000)`. A genuinely separate
 * interval/trigger from the order queue's (20s vs. 30s, matching the
 * source's own two independent polling loops), reusing the same
 * `shouldTriggerSyncOnNetChange` predicate since "should this fire on a
 * reconnect event" is identical decision logic for both queues -- only
 * the poll cadence differs.
 */
export function startPrintQueueAutoProcess(): () => void {
  const trigger = () => {
    processPrintQueueNow().catch(() => {
      // processPrintQueueNow() never throws (see its own try/finally) --
      // this catch exists only in case a future change adds one.
    });
  };

  trigger();

  const netInfoSubscription = NetInfo.addEventListener(state => {
    if (shouldTriggerSyncOnNetChange(state)) trigger();
  });

  const intervalId = setInterval(trigger, PRINT_POLL_INTERVAL_MS);

  return () => {
    netInfoSubscription();
    clearInterval(intervalId);
  };
}
