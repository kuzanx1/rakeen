import uuid from 'react-native-uuid';
import { sqlitePrintQueueStorage } from '../infrastructure/sqlitePrintQueue';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { PrintTimer } from './printTiming';
import { renderReceipt } from '../domain/receiptRenderEscPos';
import { receiptModelFromOrder } from './receiptModelFromOrder';
import { resolveCapabilities } from '../domain/printerCapability';
import { ensureLogoCached } from './receiptLogo';
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

/**
 * هل يعني هذا الخطأ "مشغولة الآن" أم "لن تعمل"؟
 *
 * الرفض والمهلة يزولان وحدهما بعد ثانية، فالإعادة تنفع. أما رفض إذن
 * الشبكة المحلية أو تعذّر الوصول فلا يغيّرهما تكرار المحاولة، وإعادتها
 * تؤخّر ظهور الخطأ الحقيقي للكاشير بلا فائدة.
 */
function isPrinterBusy(errorDetail?: string | null): boolean {
  return errorDetail === 'connection_refused' || errorDetail === 'connection_timeout';
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
    ? await (async () => {
        const model = receiptModelFromOrder(job.data as unknown as ReceiptData);
        // مرة واحدة لكل شعار. الفواتير التالية تجده جاهزاً، فتظهر هذي
        // المرحلة بصفر ملّي ثانية في التشخيص — وهذا دليل الذاكرة تعمل.
        const hasLogo = await timer.stage('logoLoad', () => ensureLogoCached(model.logoKey, caps));
        return timer.stage('escposBuild', () =>
          bytesToBase64(renderReceipt(hasLogo ? model : { ...model, logoKey: undefined }, caps).bytes),
        );
      })()
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
  // محاولات قريبة قبل تسليم الأمر للطابور.
  //
  // الطلب الواحد يُنتج مهمتين: تذكرة المطبخ أولاً والفاتورة ثانياً. وحين
  // لا تُضبط طابعة مطبخ منفصلة -- وهي حال أغلب المقاهي -- ترتدّ التذكرة
  // إلى الطابعة نفسها، فتُرسل المهمتان إلى منفذ واحد بلا فاصل. وطابعة
  // الشبكة تقبل اتصالاً واحداً في اللحظة وترفض الثاني ما دامت تطبع.
  //
  // فالمرفوضة دائماً هي الثانية، أي الفاتورة، أي الورقة التي يقف
  // الزبون ينتظرها. والرفض يقع في اثنتي عشرة ملّي ثانية -- الطابعة
  // مشغولة لا بعيدة -- فالانتظار القصير هنا يكفي، ولا حاجة لتسليمها
  // للطابور أصلاً.
  //
  // والانتظار متدرّج لا ثابت: مدة انشغال الطابعة تتبع طول التذكرة
  // قبلها، ورقم ثابت يخمّنها إمّا أن يقصر فيخفق أو يطول فيؤخّر كل
  // فاتورة بلا سبب.
  const RETRY_DELAYS_MS = [400, 900, 1600];
  const send = () => printReceipt({ target, escPosBase64, timeoutMs: 8000 });
  let result = await timer.stage('transport', send);
  for (let attempt = 0; !result.ok && isPrinterBusy(result.errorDetail) && attempt < RETRY_DELAYS_MS.length; attempt++) {
    await new Promise<void>(resolve => { setTimeout(resolve, RETRY_DELAYS_MS[attempt]); });
    result = await timer.stage('transportRetry', send);
  }
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
  // يبدأ فوراً، لا عند الدورة التالية.
  //
  // هذا السطر موجود في الكاشير (enqueuePrintJob في rakeen-pos.js) وسقط
  // في النقل، فبقي المؤقّت الدوري وحده يحرّك الطابور. والنتيجة أن كل
  // فاتورة تنتظر حتى عشرين ثانية قبل أول محاولة أصلاً، ثم عشرين أخرى
  // إن أخفقت المحاولة الأولى -- وهذا كل ما كان يفسّر "خمس وأربعون
  // ثانية ثم تطبع في ثانية". لم تكن الطابعة بطيئة ولا الشبكة: كان
  // الطابور نائماً.
  void processPrintQueueNow();
  return job.id;
}

let processing = false;
/** نداء وصل أثناء تمريرة جارية. يُعاد بعدها لا يُهمَل. */
let rerunRequested = false;

/** Same overlapping-run guard shape as orderService.ts's syncQueuedOrdersNow. */
export async function processPrintQueueNow(): Promise<PrintQueueOutcome | null> {
  // التطبيق يضيف تذكرة المطبخ أولاً والفاتورة ثانياً. فلو اكتفى الحارس
  // بردّ النداء الثاني، لوجدت الفاتورة نفسها -- وهي الورقة التي ينتظرها
  // الزبون -- تنتظر الدورة التالية بينما طُبعت تذكرتها. الحارس يمنع
  // التداخل، ولا يجوز أن يُسقط عملاً.
  if (processing) {
    rerunRequested = true;
    return null;
  }
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
    // والمحاولة التالية في موعدها هي، لا في موعد الدورة.
    //
    // المهلة التصاعدية تقول "أعد بعد ثانيتين"، لكن لا شيء كان يوقظ
    // الطابور قبل الدورة التالية، فتصير الثانيتان عشرين. جدولة اليقظة
    // على موعد المهلة تجعل الرقم المكتوب هو الرقم الواقع.
    scheduleNextRetry(jobs);
    return outcome;
  } finally {
    processing = false;
    if (rerunRequested) {
      rerunRequested = false;
      void processPrintQueueNow();
    }
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** يوقظ الطابور عند أقرب موعد إعادة، مرة واحدة. */
function scheduleNextRetry(jobs: PrintJobRecord[]): void {
  const due = jobs
    .filter(j => j.status === 'retrying' && j.next_retry_at > 0)
    .map(j => j.next_retry_at);
  if (due.length === 0) return;
  const waitMs = Math.max(250, Math.min(...due) - Date.now());
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void processPrintQueueNow();
  }, waitMs);
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
