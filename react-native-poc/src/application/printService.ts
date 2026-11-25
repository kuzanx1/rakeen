import uuid from 'react-native-uuid';
import { sqlitePrintQueueStorage } from '../infrastructure/sqlitePrintQueue';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { PrintTimer } from './printTiming';
import { profileToPrinterTarget, profileToKitchenPrinterTarget, printersAreProvablySeparate, resolvePrintDarkness, shouldPrintReceiptLogo } from '../domain/printerProfile';
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
  warmReceiptRenderer,
} from './receiptRenderer';
import type { ClosingReport } from '../domain/shift';
import { getDeviceConfig } from './authService';
import { getReceiptTheme, getReceiptBranding } from './catalogService';
import type { BannerKind } from '../../../shared/receipt';
import { recordPrintOutcome } from './printHealth';

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
  // الرفض بس. المهلة (connection_timeout) معناها الطابعة ما ترد أصلاً
  // (عنوان غلط، مطفية، الشبكة طايحة)، وكانت تتكرر هنا ٤ مرات × ٨ ثواني
  // = ٣٨ ثانية لكل ورقة، والطابور كله واقف وراها. عند «كباب طارق» وقت
  // الزحمة: طابعة المطبخ ما ردّت، فوقفت أوراق المطبخ وتأخرت فواتير الزباين
  // وبان التطبيق كأنه معلّق. المهلة الحين محاولة وحدة، والإعادة للطابور.
  return errorDetail === 'connection_refused';
}

/** بايتات كل ورقة بعد رسمها، عشان الإعادة ما ترسم من جديد. */
const renderCache = new Map<string, string>();

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
  // كل فاتورة صورة.
  //
  // كان هنا مسار نصّي يُختار حسب قدرات الطابعة، بُني على تشخيص خاطئ:
  // ظننت الصورة سبب الخمس والأربعين ثانية. وقد تبيّن السبب -- طابور لا
  // يُوقظه أحد قبل عشرين ثانية، وفاتورةٌ ترفضها الطابعة لانشغالها بتذكرة
  // المطبخ قبلها -- وأُصلح كلاهما. فالمبرر الذي بُني عليه ذلك المسار لم
  // يبقَ منه شيء.
  //
  // والصورة ليست تنازلاً بل هي الأقدر: خطٌّ عربي حقيقي بدل خط الطابعة،
  // وترتيبٌ صحيح للعربية بلا قلب مقاطع، وأُطر وخطوط رأسية وصناديق لا
  // يعرفها وضع النص، وطابعةٌ بلا حروف عربية تطبع مثل غيرها تماماً.
  // وطابعاتنا كلها على الشبكة، فحجم الصورة لا يكلّف شيئاً يُذكر.
  //
  // ومسار النص باقٍ في المستودع باختباراته -- لم يعد أحد يطبع به.
  // الصورة تنرسم مرة لكل ورقة، مو مع كل إعادة. الرسم على خيط JS نفسه،
  // فطابعة ما ترد وقت الزحمة كانت تعيد رسم كل ورقة معلّقة مع كل محاولة
  // -- عشرات الصور -- والكاشير يحس إن التطبيق علّق.
  const renderKey = [job.id, profile?.paperWidthPx, profile?.rasterCommand, resolvePrintDarkness(profile)].join('|');
  const cached = renderCache.get(renderKey);
  const escPosBase64 = cached ?? (
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
          resolvePrintDarkness(profile),
          await getReceiptBannerForPrinting(),
        )
      : job.type === 'shiftReport'
        ? await renderShiftReportToEscPosBase64(job.data as unknown as ClosingReport, profile?.paperWidthPx, profile?.rasterCommand, timer, resolvePrintDarkness(profile))
        : await renderKitchenTicketToEscPosBase64(job.data as unknown as KitchenTicketData, profile?.paperWidthPx, profile?.rasterCommand, timer, resolvePrintDarkness(profile)));
  if (!cached && escPosBase64) {
    renderCache.set(renderKey, escPosBase64);
    // آخر ٤٠ ورقة بس -- اللي انطبعت تطلع من أول الخريطة.
    while (renderCache.size > 40) renderCache.delete(renderCache.keys().next().value as string);
  }
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
  const beforeTransport = Date.now();
  let result = await timer.stage('transport', send);
  for (let attempt = 0; !result.ok && isPrinterBusy(result.errorDetail) && attempt < RETRY_DELAYS_MS.length; attempt++) {
    await new Promise<void>(resolve => { setTimeout(resolve, RETRY_DELAYS_MS[attempt]); });
    result = await timer.stage('transportRetry', send);
  }
  /**
   * والرقمُ يصعد وحدَه من هنا -- application/printHealth.ts.
   *
   * هذا هو الموضعُ الوحيدُ في العميلين الذي يعرف الثلاثةَ معاً: الطابعةَ
   * التي طُبع عليها، وحجمَ ما أُرسل، وزمنَ الإرسال. وبايتاتٌ على زمنٍ هي
   * سرعةُ الكابل فعلاً -- الرقمُ الذي خمّنتُه ثلاثَ مرّاتٍ خطأً هذه
   * الليلة لأنّه لم يكن يصل أحداً.
   *
   * ولا يُنتظر ولا يرمي: الورقةُ خرجت، وهذا قياسٌ بعدها.
   */
  void recordPrintOutcome({
    target: describeTarget(target),
    ok: result.ok,
    bytes,
    transportMs: Date.now() - beforeTransport,
    errorDetail: result.errorDetail,
  });
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
async function getReceiptBannerForPrinting(): Promise<BannerKind> {
  try {
    const device = await getDeviceConfig();
    if (device.businessId == null) return 'none';
    const branding = await getReceiptBranding(device.businessId, device.branchId ?? null);
    return branding.banner || 'none';
  } catch {
    return 'none';
  }
}

async function getReceiptThemeForPrinting(): Promise<string> {
  try {
    const device = await getDeviceConfig();
    if (device.businessId == null) return 'classic';
    return await getReceiptTheme(device.businessId);
  } catch {
    return 'classic';
  }
}

/**
 * يسخّن مسار الطباعة بعد فتح الكاشير: إعدادات الطابعة، شكل الفاتورة،
 * هويّتها، الخطوط، والشعار -- فلا تدفع أول فاتورة ثمنها والزبون واقف.
 * لا تُنتظر ولا ترمي.
 */
export async function warmPrintPath(): Promise<void> {
  try {
    const [profile, device] = await Promise.all([getPrinterProfile(), getDeviceConfig()]);
    if (!profile || device.businessId == null) return;
    const [, branding] = await Promise.all([
      getReceiptTheme(device.businessId),
      getReceiptBranding(device.businessId, device.branchId ?? null),
    ]);
    await warmReceiptRenderer(shouldPrintReceiptLogo(profile) ? branding?.logoUrl || null : null);
  } catch {
    // تسخين فقط.
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

/**
 * طابور لكل طابعة.
 *
 * كان تمريرة واحدة تمشي على المهام بالترتيب: ورقة مطبخ لطابعة ما ترد
 * تحجز كل اللي وراها، ففاتورة الزبون (على طابعة ثانية شغّالة) تنتظر.
 * الحين لو للمطبخ طابعة مستقلة، أوراقه في مسار لحاله، والفواتير في مسار،
 * ويمشون مع بعض. ولو المطبخ على نفس الطابعة يبقى مسار واحد -- الطابعة
 * تقبل اتصال واحد، والتوازي هناك يجيب رفض بلا فايدة.
 */
type Lane = 'all' | 'main' | 'kitchen';
const laneBusy: Record<Lane, boolean> = { all: false, main: false, kitchen: false };
/** نداء وصل أثناء تمريرة جارية في المسار. يُعاد بعدها لا يُهمَل. */
const laneRerun: Record<Lane, boolean> = { all: false, main: false, kitchen: false };
const LANE_FILTER: Record<Lane, (job: PrintJobRecord) => boolean> = {
  all: () => true,
  main: job => job.type !== 'kitchen',
  kitchen: job => job.type === 'kitchen',
};

/** ورقة ما انطبعت بعد كل المحاولات -- كانت تختفي بصمت. */
type PrintFailureListener = (job: PrintJobRecord) => void;
const failureListeners = new Set<PrintFailureListener>();
export function onPrintJobFailed(listener: PrintFailureListener): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

/**
 * طابعتان مختلفتان **بيقين**، لا بالاسم.
 *
 * كان الشرطَ أن يختلف وصفُ الهدفين نصّاً. وهذا يقيس الاسمَ لا الجهاز:
 * أكثرُ الطابعاتِ الحراريّة فيها USB **وإيثرنت معاً**، فطابعةٌ واحدةٌ
 * موصولةٌ بالسلك ومُعطاةٌ عنواناً على الشبكة تظهر لنا هدفَين مختلفَين
 * (`USB 19267:14384` و`192.168.8.250:9100`) وهي جهازٌ واحد.
 *
 * فنُرسل الورقتين **في نفس اللحظة** إلى نفس الرأس من مدخلَين، فتتداخل
 * بايتاتُ التذكرة داخل صورة الفاتورة: التذكرةُ تخرج، والفاتورةُ تُبتلع
 * بلا عطبٍ يُسجَّل -- لأنّ بايتاتها خرجت من الكابل فعلاً. وهذا بعينه ما
 * وقع عند «كباب طارق» يوم شبكوا طابعة المطبخ: «تذكرة المطبخ تطبع
 * وفاتورة العميل لا»، وزرُّ إعادة الطباعة يُخرجها لأنّه يُرسلها وحدَها.
 *
 * ولا سبيل إلى أن نسأل طابعةً: هل أنتِ هي؟ فالاختلافُ لا يُعدّ يقيناً
 * إلّا حين يكون المدخلُ واحداً والعنوانُ مختلفاً -- طابعتا شبكةٍ
 * بعنوانَين، أو طابعتا USB بمعرّفَين. أمّا مدخلان مختلفان فقد يكونان
 * بابَين لجهازٍ واحد، فتُرسَل الورقتان واحدةً بعد الأخرى.
 *
 * وثمنُه ثانيةٌ أو ثانيتان على تذكرة المطبخ. وفاتورةُ زبونٍ لا تخرج
 * أغلى من ذلك بما لا يُقاس.
 */
async function kitchenIsProvablySeparate(): Promise<boolean> {
  try {
    const profile = await getPrinterProfile();
    const kitchen = profileToKitchenPrinterTarget(profile);
    const main = profileToPrinterTarget(profile);
    return printersAreProvablySeparate(main, kitchen, describeTarget);
  } catch {
    return false;
  }
}

async function runLane(lane: Lane): Promise<PrintQueueOutcome | null> {
  // التطبيق يضيف تذكرة المطبخ أولاً والفاتورة ثانياً. فلو اكتفى الحارس
  // بردّ النداء الثاني، لوجدت الفاتورة نفسها تنتظر الدورة التالية. الحارس
  // يمنع التداخل، ولا يجوز أن يُسقط عملاً.
  if (laneBusy[lane]) {
    laneRerun[lane] = true;
    return null;
  }
  laneBusy[lane] = true;
  try {
    const outcome = await processPrintQueueAlgorithm(sqlitePrintQueueStorage, job => doDispatch(job), Date.now(), LANE_FILTER[lane]);
    // Clear dedupe entries for anything that just reached a terminal
    // state -- only if it's still the SAME job id for that content key.
    const jobs = await sqlitePrintQueueStorage.getAll();
    for (const job of jobs) {
      if (job.status === 'printed' || job.status === 'skipped_no_printer' || job.status === 'failed') {
        if (activeJobIdByContentKey.get(job.contentKey) === job.id) {
          activeJobIdByContentKey.delete(job.contentKey);
        }
      }
      if (outcome.newlyFailed.includes(job.id)) {
        failureListeners.forEach(l => {
          try {
            l(job);
          } catch {
            // مستمع واحد ما يوقف الطابور.
          }
        });
      }
    }
    // والمحاولة التالية في موعدها هي، لا في موعد الدورة.
    scheduleNextRetry(jobs);
    return outcome;
  } finally {
    laneBusy[lane] = false;
    if (laneRerun[lane]) {
      laneRerun[lane] = false;
      void runLane(lane);
    }
  }
}

export async function processPrintQueueNow(): Promise<PrintQueueOutcome | null> {
  if (!(await kitchenIsProvablySeparate())) return runLane('all');
  // بُدّلت الطابعات وتمريرة المسار الواحد ما خلصت؟ تخلص أول، عشان ما
  // تنطبع ورقة مرتين.
  if (laneBusy.all) {
    laneRerun.all = true;
    return null;
  }
  const [a, b] = await Promise.all([runLane('main'), runLane('kitchen')]);
  if (!a && !b) return null;
  return {
    anySucceeded: !!(a?.anySucceeded || b?.anySucceeded),
    anyFailed: !!(a?.anyFailed || b?.anyFailed),
    newlyFailed: [...(a?.newlyFailed ?? []), ...(b?.newlyFailed ?? [])],
  };
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
