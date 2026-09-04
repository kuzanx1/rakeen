/**
 * Domain layer: the print queue's pure algorithm, ported from
 * public/pos/rakeen-pos.js's real processPrintQueue/enqueuePrintJob.
 * Deliberately separate constants/state machine from domain/orderQueue.ts
 * -- the PWA runs two genuinely independent retry regimes, not one
 * shared implementation, and this preserves that rather than merging
 * them for tidiness. Printing is not financial data: unlike the order
 * queue (which never gives up -- see domain/orderQueue.ts's own doc
 * comment), a print job that exhausts its retries reaches a real,
 * dismissable-by-retry terminal `failed` state.
 */

export const PRINT_MAX_RETRIES = 5; // vs. the order queue's SYNC_MAX_AUTO_RETRIES = 10
export const PRINT_MAX_BACKOFF_MS = 2 * 60 * 1000; // vs. the order queue's 5 * 60 * 1000
export const PRINT_DEDUPE_WINDOW_MS = 10000; // in-memory double-tap debounce window
export const PRINT_POLL_INTERVAL_MS = 20000; // vs. the order queue's 30000 (domain/sync.ts)

/** Base 2s doubling -- the order queue uses a base 1s doubling
 *  (computeBackoffMs in domain/orderQueue.ts). Same shape, different
 *  base, ported exactly as two separate constants/formulas, not shared. */
export function computePrintBackoffMs(retryCount: number): number {
  return Math.min(2000 * Math.pow(2, retryCount), PRINT_MAX_BACKOFF_MS);
}

/** 'shiftReport' is the closing balance slip. It goes through the SAME
 *  queue as the other two on purpose: a jammed printer at closing time is
 *  exactly when the retry/persist behaviour matters most, and the source's
 *  own reason for keeping a reprint around is that this slip used to print
 *  once and be lost forever if the paper ran out. */
export type PrintJobType = 'receipt' | 'kitchen' | 'shiftReport';

/**
 * Real named states, ported verbatim from the PWA:
 * queued -> printing -> one of {printed, skipped_no_printer, retrying, failed}
 * `retrying` loops back through the same processing pass until it lands
 * on one of the three terminal states.
 */
export type PrintJobStatus = 'queued' | 'printing' | 'printed' | 'skipped_no_printer' | 'retrying' | 'failed';

export const PRINT_TERMINAL_STATUSES: readonly PrintJobStatus[] = ['printed', 'skipped_no_printer', 'failed'];

export function isPrintJobTerminal(status: PrintJobStatus): boolean {
  return (PRINT_TERMINAL_STATUSES as PrintJobStatus[]).includes(status);
}

/**
 * The queue stores rendering DATA, not pre-built ESC/POS bytes --
 * exactly the PWA's own choice (its own comment: images/QR codes are
 * loaded fresh every attempt, never persisted, so the job stays a
 * small, storage-serializable record). `data` is intentionally
 * `Record<string, unknown>` here, not a specific receipt shape -- the
 * queue algorithm doesn't need to know what's inside, only that it's
 * JSON-serializable; domain/receipt.ts owns the actual shape and
 * rendering.
 */
export interface PrintJobRecord {
  id: string;
  type: PrintJobType;
  data: Record<string, unknown>;
  contentKey: string;
  status: PrintJobStatus;
  retry_count: number;
  next_retry_at: number; // epoch ms; 0 = eligible immediately
  last_error: string | null;
  created_at: number;
  /**
   * What the last attempt ACTUALLY did, recorded so a "printed" badge can
   * be checked instead of trusted. A TestFlight build has no Metro
   * console, so a job that reports success while nothing arrives at the
   * printer is otherwise indistinguishable from one that really printed.
   *
   * - last_target: the resolved destination, e.g. "192.168.100.6:9100".
   *   This is derived from the SAVED profile at dispatch time, which is
   *   not necessarily what the Settings screen's "Test Connection" button
   *   probed -- that one tests the values currently typed in the form.
   * - last_bytes: how many ESC/POS bytes were handed to the transport.
   *   0 means the receipt rendered empty, which the native side would
   *   still report as a successful send.
   * - last_error_detail: the transport's specific reason
   *   (connection_refused / connection_timeout / host_unreachable), which
   *   platform/printer.ts has always returned and this queue used to drop.
   */
  last_target?: string | null;
  last_bytes?: number | null;
  last_error_detail?: string | null;
  /** The native transport's own trace for the last attempt -- see
   *  platform/printer.ts's PrintResult.diagnostics. */
  last_trace?: string[] | null;
}

/** Ported from enqueuePrintJob's contentKey -- type + a hash of the
 *  full rendered data, so a double-tap of the exact same receipt within
 *  the dedupe window resolves to the same key. A simple deterministic
 *  string hash is enough here (this is a short-window UI debounce, not
 *  a cryptographic or long-term uniqueness guarantee -- same scope as
 *  the source). */
export function hashForDedupe(value: unknown): string {
  const str = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

export function buildContentKey(type: PrintJobType, data: Record<string, unknown>): string {
  return `${type}:${hashForDedupe(data)}`;
}

export function isDueForPrintRetry(job: PrintJobRecord, now: number): boolean {
  return !(job.next_retry_at && job.next_retry_at > now);
}

/** The two sentinel error strings the real bridge layer returns that
 *  mean "there was never a printer to try" -- not a failure, a
 *  non-error terminal state (matches the PWA's own
 *  bridge_unavailable/no_printer_configured -> skipped_no_printer
 *  mapping). This RN app's own platform/printer.ts contract (Checkpoint
 *  1) uses PRINTER_UNAVAILABLE for "no native module linked" -- the
 *  equivalent of bridge_unavailable. A configured-but-unreachable
 *  target (PRINTER_CONNECTION_FAILED) IS a real, retryable failure,
 *  unlike in the PWA where "no printer configured" and "printer
 *  unreachable" happened to share one sentinel-string family; this RN
 *  contract already distinguishes them more precisely (see
 *  platform/printer.ts's two-tier error model), so only
 *  PRINTER_UNAVAILABLE maps to the non-error terminal state here. */
const NON_ERROR_TERMINAL_CODES = new Set(['PRINTER_UNAVAILABLE']);

export interface PrintAttemptOutcome {
  ok: boolean;
  error?: string;
  errorDetail?: string;
  /** See PrintJobRecord.last_target / last_bytes. */
  target?: string | null;
  bytes?: number | null;
  trace?: string[] | null;
}

/**
 * Pure state transition for one dispatch attempt -- mirrors
 * processPrintQueue's outcome-handling switch exactly. Returns the
 * updated job; never mutates the input.
 */
export function applyPrintAttemptResult(
  job: PrintJobRecord,
  outcome: PrintAttemptOutcome,
  now: number,
): PrintJobRecord {
  // Recorded on every branch, success included -- a job that says
  // "printed" has to be able to say WHERE it printed and how much.
  const trace = {
    last_target: outcome.target ?? null,
    last_bytes: outcome.bytes ?? null,
    last_error_detail: outcome.errorDetail ?? null,
    last_trace: outcome.trace ?? null,
  };
  if (outcome.ok) {
    return { ...job, ...trace, status: 'printed', last_error: null };
  }
  if (outcome.error && NON_ERROR_TERMINAL_CODES.has(outcome.error)) {
    return { ...job, ...trace, status: 'skipped_no_printer', last_error: outcome.error };
  }
  const retryCount = job.retry_count + 1;
  if (retryCount >= PRINT_MAX_RETRIES) {
    return { ...job, ...trace, status: 'failed', retry_count: retryCount, last_error: outcome.error || 'unknown_error', next_retry_at: 0 };
  }
  return {
    ...job,
    ...trace,
    status: 'retrying',
    retry_count: retryCount,
    last_error: outcome.error || 'unknown_error',
    next_retry_at: now + computePrintBackoffMs(retryCount),
  };
}

/** Ported from retryPrintJob/the Diagnostics "retry all failed" bulk
 *  action -- resets a job back to its initial queued state so the next
 *  processing pass attempts it fresh, with a clean retry count. */
export function resetJobForManualRetry(job: PrintJobRecord): PrintJobRecord {
  return { ...job, status: 'queued', retry_count: 0, next_retry_at: 0, last_error: null };
}

export interface PrintQueueStorage {
  put(job: PrintJobRecord): Promise<void>;
  getAll(): Promise<PrintJobRecord[]>;
}

export interface PrintDispatchResult {
  ok: boolean;
  error?: string;
  errorDetail?: string;
  target?: string | null;
  bytes?: number | null;
  trace?: string[] | null;
}

export interface PrintQueueOutcome {
  anySucceeded: boolean;
  anyFailed: boolean;
  newlyFailed: string[]; // job ids that just transitioned into the terminal 'failed' state this pass
}

/**
 * The queue-processing loop, decoupled from SQLite and from the real
 * printer dispatch -- same storage/dispatch-injection pattern as
 * domain/orderQueue.ts's syncQueuedOrders, for the same reason: this
 * exact function can be run in a plain Node script against a fake
 * in-memory storage/dispatch to prove the algorithm without a device.
 * Never stops or skips the rest of the queue on one job's failure --
 * ported verbatim from the PWA's own explicit "one job's failure never
 * blocks the others" comment.
 */
export async function processPrintQueue(
  storage: PrintQueueStorage,
  dispatch: (job: PrintJobRecord) => Promise<PrintDispatchResult>,
  now: number,
): Promise<PrintQueueOutcome> {
  const outcome: PrintQueueOutcome = { anySucceeded: false, anyFailed: false, newlyFailed: [] };
  const jobs = await storage.getAll();
  for (const job of jobs) {
    if (job.status !== 'queued' && job.status !== 'retrying') continue;
    if (!isDueForPrintRetry(job, now)) continue;

    await storage.put({ ...job, status: 'printing' });
    try {
      const result = await dispatch(job);
      const updated = applyPrintAttemptResult(job, result, now);
      await storage.put(updated);
      if (updated.status === 'printed' || updated.status === 'skipped_no_printer') {
        outcome.anySucceeded = outcome.anySucceeded || updated.status === 'printed';
      } else if (updated.status === 'failed') {
        outcome.anyFailed = true;
        outcome.newlyFailed.push(job.id);
      }
    } catch (e) {
      outcome.anyFailed = true;
      const updated = applyPrintAttemptResult(job, { ok: false, error: e instanceof Error ? e.message : String(e) }, now);
      await storage.put(updated);
      if (updated.status === 'failed') outcome.newlyFailed.push(job.id);
    }
  }
  return outcome;
}
