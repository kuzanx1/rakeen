import NetInfo from '@react-native-community/netinfo';
import { sqliteOrderQueueStorage } from '../infrastructure/sqliteOrderQueue';
import { syncQueuedOrdersNow } from './orderService';
import { listPrintJobs, retryAllFailedPrintJobs } from './printService';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { profileToPrinterTarget } from '../domain/printerProfile';
import { Printer } from '../platform/printer';
import { CashDrawer } from '../platform/cashDrawer';
import { diagnoseProblem, Diagnosis } from '../domain/diagnostics';
import type { QueuedPayload } from '../domain/order';

/**
 * Checkpoint 13 (Diagnostics, final checkpoint) -- real signal
 * gathering, ported from the PWA's NETWORK_STATE/renderDiagnosticsBody
 * (public/pos/rakeen-pos.js). Five dimensions kept explicitly separate,
 * never collapsed into one: Internet, Cloud, Native Bridge (printer),
 * Printer (the physical target once a bridge exists), and — reported
 * alongside per the source's own layout — the Cash Drawer bridge and
 * live queue counts.
 *
 * "Cloud" is deliberately NOT a dedicated health-check ping. The PWA's
 * own comment explains why: a separate ping would just be one more
 * thing that can lie about the actual thing that matters (can real
 * orders actually sync). Instead this piggybacks on syncScheduler.ts's
 * real 30s/reconnect sync attempts via reportCloudSyncOutcome() -- the
 * exact same "reportCloudResult" design as the source, ported, not
 * reinvented.
 */

export type TriState = boolean | null;

interface DiagnosticsState {
  internet: TriState;
  cloud: TriState;
  lastCloudCheckAt: number | null;
  lastCloudError: string | null;
  lastSuccessfulSyncAt: number | null;
}

const state: DiagnosticsState = {
  internet: null,
  cloud: null,
  lastCloudCheckAt: null,
  lastCloudError: null,
  lastSuccessfulSyncAt: null,
};

/** Called by syncScheduler.ts after every real sync pass -- the actual
 *  "reportCloudResult" hook. If the queue was empty (neither succeeded
 *  nor failed), cloud/lastCloudCheckAt are deliberately left unchanged
 *  -- matches the PWA's own real limitation: with nothing to sync,
 *  there's no real round-trip to observe a cloud result from at all. */
export function reportCloudSyncOutcome(anySucceeded: boolean, anyFailed: boolean, lastFailure: unknown): void {
  if (anySucceeded) {
    state.cloud = true;
    state.lastCloudCheckAt = Date.now();
    state.lastCloudError = null;
    state.lastSuccessfulSyncAt = Date.now();
  } else if (anyFailed) {
    state.cloud = false;
    state.lastCloudCheckAt = Date.now();
    state.lastCloudError = lastFailure instanceof Error ? lastFailure.message : String(lastFailure);
  }
}

/** Starts tracking real NetInfo connectivity for the Internet row.
 *  Independent of syncScheduler.ts's own NetInfo listener (which
 *  decides when to sync) -- this one only observes and records state,
 *  matching the PWA's own separation between the 'online'/'offline'
 *  listeners (state tracking) and syncQueue's own listener (action). */
export function startDiagnosticsTracking(): () => void {
  const subscription = NetInfo.addEventListener(netState => {
    state.internet = netState.isConnected;
  });
  return () => subscription();
}

export interface PrintQueueCounts {
  queued: number;
  retrying: number;
  printing: number;
  failed: number;
}

export interface DiagnosticsSnapshot {
  internet: TriState;
  cloud: TriState;
  lastCloudError: string | null;
  lastSuccessfulSyncAt: number | null;
  printerBridgeAvailable: boolean;
  cashDrawerBridgeAvailable: boolean;
  printerConfigured: boolean;
  printerTargetLabel: string | null;
  queuedOrdersCount: number;
  stuckOrdersCount: number;
  printQueueCounts: PrintQueueCounts;
  failedPrintCount: number;
  diagnosis: Diagnosis;
}

export async function getDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  const [orders, printJobs, profile] = await Promise.all([
    sqliteOrderQueueStorage.getAll().catch(() => [] as QueuedPayload[]),
    listPrintJobs().catch(() => []),
    getPrinterProfile(),
  ]);

  const stuckOrders = orders.filter(o => o.stuck);
  const troublePrintJobs = printJobs.filter(j => j.status === 'failed' || j.status === 'retrying');
  const failedPrintJobs = printJobs.filter(j => j.status === 'failed');
  const target = profileToPrinterTarget(profile);
  const bridgeAvailable = !!Printer;

  return {
    internet: state.internet,
    cloud: state.cloud,
    lastCloudError: state.lastCloudError,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    printerBridgeAvailable: bridgeAvailable,
    cashDrawerBridgeAvailable: !!CashDrawer,
    printerConfigured: !!target,
    printerTargetLabel: target ? `${target.host}:${target.port}` : null,
    queuedOrdersCount: orders.length,
    stuckOrdersCount: stuckOrders.length,
    printQueueCounts: {
      queued: printJobs.filter(j => j.status === 'queued').length,
      retrying: printJobs.filter(j => j.status === 'retrying').length,
      printing: printJobs.filter(j => j.status === 'printing').length,
      failed: failedPrintJobs.length,
    },
    failedPrintCount: failedPrintJobs.length,
    diagnosis: diagnoseProblem(state.internet, state.cloud, bridgeAvailable, troublePrintJobs.length),
  };
}

/**
 * Ported from the Diagnostics screen's "إعادة محاولة الطلبات العالقة"
 * bulk action. Orders are financial data -- never deleted, only their
 * "give up" markers cleared so the normal sync pass picks them up again
 * like any other queued item (same reasoning as
 * domain/orderQueue.ts's own "orders never give up" design).
 */
export async function retryStuckOrders(): Promise<number> {
  const orders = await sqliteOrderQueueStorage.getAll();
  const stuck = orders.filter(o => o.stuck);
  for (const order of stuck) {
    await sqliteOrderQueueStorage.put({ ...order, stuck: false, retry_count: 0, next_retry_at: 0 });
  }
  if (stuck.length > 0) await syncQueuedOrdersNow();
  return stuck.length;
}

export { retryAllFailedPrintJobs };
