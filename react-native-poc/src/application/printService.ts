import uuid from 'react-native-uuid';
import { sqlitePrintQueueStorage } from '../infrastructure/sqlitePrintQueue';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { PrintTimer } from './printTiming';
import { renderReceipt } from '../domain/receiptRenderEscPos';
import { receiptModelFromOrder } from './receiptModelFromOrder';
import { resolveCapabilities } from '../domain/printerCapability';
import { bytesToBase64 } from '../domain/escposText';
import { profileToPrinterTarget, profileToKitchenPrinterTarget } from '../domain/printerProfile';
import { printReceipt } from '../platform/printer';
import type { PrinterTarget } from '../platform/printer';
import {
  PrintDispatchResult,
  PrintJobRecord,
  PrintJobType,
  PrintQueueOutcome,
  PRINT_DEDUPE_WINDOW_MS,
  buildContentKey,
  processPrintQueue as processPrintQueueAlgorithm,
  resetJobForManualRetry,
} from '../domain/printQueue';
import { ReceiptData, KitchenTicketData } from '../domain/receipt';
import {
  renderReceiptToEscPosBase64,
  renderKitchenTicketToEscPosBase64,
  renderShiftReportToEscPosBase64,
} from './receiptRenderer';
import type { ClosingReport } from '../domain/shift';
import { getDeviceConfig } from './authService';
import { getReceiptTheme } from './catalogService';

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

/** "192.168.100.6:9100" / "BLE <id>" / "USB <id>" -- what actually got
 *  dialled, for the Print Queue's own trace line. */
function describeTarget(target: PrinterTarget): string {
  if (target.transport === 'network') return `${target.host}:${target.port}`;
  if (target.transport === 'bluetooth') return `BLE ${target.bluetoothId}`;
  return `USB ${target.usbAccessoryId}`;
}

/** Byte count of a base64 payload without decoding it. 0 here means the
 *  receipt rendered to nothing -- which the native transport would still
 *  send (and report as success) as an empty write. */
function base64ByteLength(base64: string): number {
  const body = base64.replace(/=+$/, '');
  return Math.floor((body.length * 3) / 4);
}

async function doDispatch(job: PrintJobRecord): Promise<PrintDispatchResult> {
  // كل رقم قيل عن أداء هذا المسار حتى الآن -- بما فيه كلامي -- كان
  // استنتاجاً. النقل وحده كان مقيساً، ولهذا كان "٢٠ ملّي ثانية" حقيقة
  // بينما "التصيير سريع" دعوى. هذا يُنهي الفرق.
  const timer = new PrintTimer();
  const profile = await timer.stage('profileRead', () => getPrinterProfile());
  // Kitchen tickets target their own printer when one's configured
  // (falls back to the main target otherwise) -- ported from the PWA's
  // real sendKitchenTicketToPrinter() fallback, see
  // domain/printerProfile.ts's profileToKitchenPrinterTarget doc comment.
  const target = job.type === 'kitchen' ? profileToKitchenPrinterTarget(profile) : profileToPrinterTarget(profile);
  if (!target) {
    // No SAVED profile (or a saved one that fails its own validation).
    // Note this is the saved profile, not whatever the Settings screen
    // currently has typed into it -- those can differ.
    return { ok: false, error: 'PRINTER_UNAVAILABLE', target: null, bytes: null };
  }
  // الوضع النصي يتجاوز التصيير كله: لا Skia، ولا قراءة بكسل، ولا صورة.
  // من نموذج الفاتورة إلى بايتات مباشرة.
  // القدرات تقرر، لا الطابور. طابعة ترتّب العربية بنفسها تتلقى النص كما
  // هو؛ وواحدة تُشكّل ولا ترتّب تتلقاه معكوس المقاطع؛ وواحدة بلا عربية
  // تُحوّل إلى مسار الصورة. الطابور لا يعرف أياً من ذلك.
  const caps = resolveCapabilities(profile?.capabilityProfileId, profile?.paperWidthPx);
  const canPrintAsText = caps.arabic !== 'none' && profile?.receiptMode !== 'image';
  const useText = canPrintAsText && job.type === 'receipt';
  const escPosBase64 = useText
    ? await timer.stage('escposBuild', () => {
        const model = receiptModelFromOrder(job.data as unknown as ReceiptData);
        return bytesToBase64(renderReceipt(model, caps).bytes);
      })
    :
    job.type === 'receipt'
      ? await renderReceiptToEscPosBase64(
          job.data as unknown as ReceiptData,
          profile?.paperWidthPx,
          // Read at DISPATCH, not at enqueue, exactly as the paper width
          // already is: a job queued before the owner changed the theme
          // should print in the theme that is current when it actually
          // reaches paper.
          await timer.stage('themeRead', () => getReceiptThemeForPrinting()),
          profile?.rasterCommand,
          timer,
        )
      : job.type === 'shiftReport'
        ? await renderShiftReportToEscPosBase64(job.data as unknown as ClosingReport, profile?.paperWidthPx, profile?.rasterCommand, timer)
        : await renderKitchenTicketToEscPosBase64(job.data as unknown as KitchenTicketData, profile?.paperWidthPx, profile?.rasterCommand, timer);
  const bytes = base64ByteLength(escPosBase64);
  timer.bytes(bytes);
  // An empty render is the one way this path could report a genuine
  // "printed" while the printer produces nothing: the native module takes
  // Data(base64Encoded: "") as valid EMPTY data, the transport connects,
  // writes zero bytes, and .contentProcessed reports success. Caught here
  // rather than in Swift so it needs no native change -- and it is a real
  // RENDER_FAILED, not a connection problem.
  if (bytes === 0) {
    return { ok: false, error: 'RENDER_FAILED', target: describeTarget(target), bytes: 0 };
  }
  const result = await timer.stage('transport', () => printReceipt({
    target,
    escPosBase64,
    timeoutMs: 8000,
  }));
  // الملخّص أولاً ثم أثر النقل: الترتيب هو ترتيب الحدوث، فمن يقرأ من
  // فوق لتحت يرى أين ذهب الوقت قبل أن يرى تفاصيل الاتصال.
  const diagnostics = [...timer.summary(), ...(result.diagnostics ?? [])];
  return {
    ok: result.ok,
    error: result.error,
    // errorDetail was previously dropped here, so the queue could only
    // ever show "PRINTER_CONNECTION_FAILED" and never the transport's
    // actual reason (connection_refused / connection_timeout / ...).
    errorDetail: result.errorDetail,
    target: describeTarget(target),
    bytes,
    trace: diagnostics,
  };
}

/**
 * Queue-first: persists BEFORE any print attempt, same principle as
 * order/payment submission. Returns the job id (useful for a future
 * "show this job's status" UI, not required by anything today).
 */
/** The configured receipt theme, or 'classic'. Never throws -- a settings
 *  read must not be able to stop a receipt printing. */
async function getReceiptThemeForPrinting(): Promise<string> {
  try {
    const device = await getDeviceConfig();
    if (device.businessId == null) return 'classic';
    return await getReceiptTheme(device.businessId);
  } catch {
    return 'classic';
  }
}

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
