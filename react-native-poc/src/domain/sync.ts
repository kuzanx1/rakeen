/**
 * Checkpoint 9 (Offline Queue + Sync) -- pure decision logic for the
 * auto-sync trigger, kept separate from application/syncScheduler.ts's
 * actual NetInfo/setInterval wiring specifically so it has zero I/O
 * imports and is directly testable (importing syncScheduler.ts itself
 * pulls in @react-native-community/netinfo's own import chain, which
 * transitively hits react-native's Flow-typed index.js -- confirmed,
 * not assumed, to be unparseable outside a real RN/Metro build). Same
 * UI -> Application -> Domain layering this project has used since
 * Checkpoint 1: this is domain logic, not application orchestration.
 */

/** Matches rakeen-pos.js's own setInterval(syncQueue, 30000). */
export const SYNC_POLL_INTERVAL_MS = 30000;

/**
 * NetInfo's `isConnected` is a nullable boolean (`null` while the
 * underlying OS API hasn't reported yet) -- only an explicit `true`
 * should trigger a sync attempt; `null` or `false` must not.
 */
export function shouldTriggerSyncOnNetChange(state: { isConnected: boolean | null }): boolean {
  return state.isConnected === true;
}
