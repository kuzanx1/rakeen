import uuid from 'react-native-uuid';
import { sqlitePrintQueueStorage } from '../infrastructure/sqlitePrintQueue';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { profileToPrinterTarget, profileToKitchenPrinterTarget } from '../domain/printerProfile';
import { printReceipt } from '../platform/printer';
import {
  PrintJobRecord,
  PrintJobType,
  PrintQueueOutcome,
  PRINT_DEDUPE_WINDOW_MS,
  buildContentKey,
  processPrintQueue as processPrintQueueAlgorithm,
  resetJobForManualRetry,
} from '../domain/printQueue';
import { ReceiptData, KitchenTicketData } from '../domain/receipt';
import { renderReceiptToEscPosBase64, renderKitchenTicketToEscPosBase64 } from './receiptRenderer';

/**
 * Checkpoint 10 (Print Queue) -- application-layer orchestration,
 * mirroring application/orderService.ts's shape: real storage
 * (infrastructure/sqlitePrintQueue.ts), real dispatch (renders bytes at
 * attempt time via domain/receipt.ts, then calls the already-verified
 * platform/printer.ts contract from Checkpoint 1 -- this file does NOT
 * reimplement printing, only queues around it).
 */

/** Short-window in-memory duplicate-tap debounce -- ported from
 *  enqueuePrintJob's activePrintJobByContentKey Map. Explicitly NOT
 *  persisted (matches the source: it does not survive app restart, and
 *  a genuine reprint after the window or after the prior job resolves
 *  always creates a fresh job). */
const activeJobIdByContentKey = new Map<string, string>();

async function doDispatch(job: PrintJobRecord): Promise<{ ok: boolean; error?: string }> {
  const profile = await getPrinterProfile();
  // Kitchen tickets target their own printer when one's configured
  // (falls back to the main target otherwise) -- ported from the PWA's
  // real sendKitchenTicketToPrinter() fallback, see
  // domain/printerProfile.ts's profileToKitchenPrinterTarget doc comment.
  const target = job.type === 'kitchen' ? profileToKitchenPrinterTarget(profile) : profileToPrinterTarget(profile);
  if (!target) {
    return { ok: false, error: 'PRINTER_UNAVAILABLE' };
  }
  const escPosBase64 =
    job.type === 'receipt'
      ? await renderReceiptToEscPosBase64(job.data as unknown as ReceiptData, profile?.paperWidthPx)
      : await renderKitchenTicketToEscPosBase64(job.data as unknown as KitchenTicketData, profile?.paperWidthPx);
  const result = await printReceipt({
    target,
    escPosBase64,
    timeoutMs: 8000,
  });
  return { ok: result.ok, error: result.error };
}

/**
 * Queue-first: persists BEFORE any print attempt, same principle as
 * order/payment submission. Returns the job id (useful for a future
 * "show this job's status" UI, not required by anything today).
 */
export async function enqueuePrintJob(type: PrintJobType, data: Record<string, unknown>): Promise<string> {
  const contentKey = buildContentKey(type, data);
  const now = Date.now();

  const existingJobId = activeJobIdByContentKey.get(contentKey);
  if (existingJobId) {
    const jobs = await sqlitePrintQueueStorage.getAll();
    const existing = jobs.find(j => j.id === existingJobId);
    if (existing && now - existing.created_at < PRINT_DEDUPE_WINDOW_MS) {
      return existingJobId; // a double-tap within the window reuses the same job, never creates a second
    }
  }

  const job: PrintJobRecord = {
    id: uuid.v4() as string,
    type,
    data,
    contentKey,
    status: 'queued',
    retry_count: 0,
    next_retry_at: 0,
    last_error: null,
    created_at: now,
  };
  activeJobIdByContentKey.set(contentKey, job.id);
  await sqlitePrintQueueStorage.put(job);
  return job.id;
}

let processing = false;

/** Same overlapping-run guard shape as orderService.ts's syncQueuedOrdersNow. */
export async function processPrintQueueNow(): Promise<PrintQueueOutcome | null> {
  if (processing) return null;
  processing = true;
  try {
    const outcome = await processPrintQueueAlgorithm(sqlitePrintQueueStorage, job => doDispatch(job), Date.now());
    // Clear dedupe entries for anything that just reached a terminal
    // state, mirroring clearActiveIfCurrent -- only if it's still the
    // SAME job id for that content key (a later genuine reprint
    // shouldn't have its live entry wiped by a stale job resolving late).
    const jobs = await sqlitePrintQueueStorage.getAll();
    for (const job of jobs) {
      if (job.status === 'printed' || job.status === 'skipped_no_printer' || job.status === 'failed') {
        if (activeJobIdByContentKey.get(job.contentKey) === job.id) {
          activeJobIdByContentKey.delete(job.contentKey);
        }
      }
    }
    return outcome;
  } finally {
    processing = false;
  }
}

/** Manual retry -- ported from retryPrintJob/the Diagnostics bulk retry
 *  action. Resets the job and immediately runs a processing pass. */
export async function retryPrintJob(jobId: string): Promise<void> {
  const jobs = await sqlitePrintQueueStorage.getAll();
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;
  await sqlitePrintQueueStorage.put(resetJobForManualRetry(job));
  await processPrintQueueNow();
}

export async function retryAllFailedPrintJobs(): Promise<number> {
  const jobs = await sqlitePrintQueueStorage.getAll();
  const failed = jobs.filter(j => j.status === 'failed');
  for (const job of failed) {
    await sqlitePrintQueueStorage.put(resetJobForManualRetry(job));
  }
  if (failed.length > 0) await processPrintQueueNow();
  return failed.length;
}

export async function listPrintJobs(): Promise<PrintJobRecord[]> {
  return sqlitePrintQueueStorage.getAll();
}
