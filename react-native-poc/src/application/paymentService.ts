import { sqliteOrderQueueStorage } from '../infrastructure/sqliteOrderQueue';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { openCashDrawer } from '../platform/cashDrawer';
import { dispatchQueuedPayload } from './orderService';
import { QueuedPayload } from '../domain/order';
import { PaymentState, DrawerState, drawerAlreadyCompleted } from '../domain/payment';
import { profileToPrinterTarget, drawerKickCommandFor, isDrawerSupported } from '../domain/printerProfile';

/**
 * Checkpoint 6 (Payment) orchestration -- built strictly on top of
 * Checkpoint 5's already-verified queue-first architecture
 * (infrastructure/sqliteOrderQueue.ts, domain/orderQueue.ts) and
 * Checkpoint 1's cash-drawer contract (platform/cashDrawer.ts). No
 * redesign of either. The exact order of operations mandated by the
 * requirements:
 *
 *   generate/retain operationId -> persist locally FIRST ->
 *   mark payment intent idempotently -> open cash drawer (independent of
 *   network) -> send/queue for cloud sync -> cloud sync later
 *
 * The drawer step never depends on the network step's outcome or timing
 * -- it's attempted right after local persistence, before the network
 * call, using whatever printer profile is actually configured (see
 * infrastructure/printerProfileStore.ts, Checkpoint 11 -- with nothing
 * configured yet, or a profile that declares no drawer, this correctly
 * reports DRAWER_UNAVAILABLE rather than a fake success).
 */

export interface PaymentOutcome {
  paymentState: PaymentState;
  drawerState: DrawerState;
  drawerError?: string;
  paymentError?: string;
  /** The real, server-assigned order id when the RPC ran immediately
   *  (PAYMENT_COMPLETED) -- undefined when queued offline
   *  (PAYMENT_SYNC_PENDING), same "no id until it syncs" honesty
   *  submitOrder() already uses for order registration. A real bug found
   *  during the Feature Parity audit: this was always discarded here,
   *  so completed pickup/delivery sales printed "Order (offline)" on the
   *  receipt even when a real id existed the whole time. */
  orderId?: number;
}

/**
 * Persist -> drawer -> network, in that literal order. Never throws --
 * every real outcome is reported back via PaymentOutcome instead, so a
 * network failure can never be confused with (or block) the drawer
 * result, and vice versa. This is the one function every payment method
 * (cash today; card follows the same shape minus the drawer step, since
 * only cash sales open a physical drawer) funnels through.
 */
/** ما لم يصل في هذي المدّة يُترك للمزامن. */
const DISPATCH_TIMEOUT_MS = 3500;

/**
 * سباقٌ بين وعدٍ ومهلة.
 *
 * ولا يُلغى الوعدُ الأصليّ: نداءُ الشبكة يمضي إلى نهايته وقد يصل، وهو
 * مطلوب -- ما وصل بعد المهلة يجد الطلبَ قد سُجّل، والإعادةُ متعادلة.
 * إنما لا يُنتظر.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('dispatch_timeout')), ms);
    promise.then(
      v => { clearTimeout(id); resolve(v); },
      e => { clearTimeout(id); reject(e); },
    );
  });
}

export async function completePaymentOperation(
  payload: QueuedPayload,
  options: { openDrawer: boolean },
): Promise<PaymentOutcome> {
  // 1. Persist locally FIRST -- the order/payment is durably safe before
  // anything else is attempted, satisfying requirement 6/9 regardless of
  // what happens next.
  await sqliteOrderQueueStorage.put(payload);

  let drawerState: DrawerState = payload.drawer_state || 'DRAWER_PENDING';
  let drawerError: string | undefined;

  // 2. Open the cash drawer -- independent of network/cloud entirely.
  // Checks the PERSISTED state first (survives a crash/restart between
  // the drawer succeeding and this function ever getting to run again),
  // not just platform/cashDrawer.ts's in-memory guard.
  if (options.openDrawer && !drawerAlreadyCompleted(payload.drawer_state)) {
    const profile = await getPrinterProfile();
    const target = profileToPrinterTarget(profile);
    if (!isDrawerSupported(profile)) {
      // A configured printer with no drawer (or no printer at all) is
      // the same honest outcome -- the profile explicitly declares
      // whether ITS hardware has a drawer, independent of whether a
      // target is reachable at all.
      drawerState = 'DRAWER_UNAVAILABLE';
      drawerError = 'drawer_not_supported_by_configured_printer';
    } else if (!target) {
      drawerState = 'DRAWER_UNAVAILABLE';
      drawerError = 'no_printer_configured';
    } else {
      const result = await openCashDrawer({
        target,
        kickCommandBase64: drawerKickCommandFor(profile),
        /*
         * ألفان وخمسُ مئة لا ثمانيةُ آلاف.
         *
         * الطابعةُ على الشبكة المحليّة تردّ في عشراتِ الأجزاء من الثانية.
         * وثمانيةٌ ليست صبراً على البطء، هي انتظارُ ما لن يجيء -- والكاشير
         * واقفٌ أمام دوّارةٍ بعد أن قبض المال، وطابورٌ خلفه.
         * والحالةُ تبقى DRAWER_PENDING فتُعاد المحاولة، فلا شيء يضيع
         * بقِصَر المهلة -- إنما يُعرف أسرع أنّ الدرج لم ينفتح.
         */
        timeoutMs: 2500,
        operationId: payload.operation_id || payload.client_order_uuid,
      });
      if (result.ok) {
        drawerState = 'DRAWER_COMPLETED';
      } else if (result.error === 'CASH_DRAWER_UNAVAILABLE') {
        drawerState = 'DRAWER_UNAVAILABLE';
        drawerError = result.error;
      } else {
        // A real connection failure -- stays DRAWER_PENDING (retryable
        // later, e.g. from a Diagnostics-style manual retry in a future
        // checkpoint), never silently promoted to "completed".
        drawerState = 'DRAWER_PENDING';
        drawerError = result.errorDetail || result.error;
      }
    }
  }

  const afterDrawer: QueuedPayload = { ...payload, drawer_state: drawerState };
  await sqliteOrderQueueStorage.put(afterDrawer);

  // 3. Attempt the network/cloud submission -- its outcome never changes
  // the drawer_state already recorded above, and a drawer failure above
  // never prevents this from being attempted (requirement 12: independent
  // states).
  let paymentState: PaymentState;
  let paymentError: string | undefined;
  let orderId: number | undefined;
  try {
    /**
     * ولا تُنتظر الشبكةُ إلى ما لا نهاية.
     *
     * الطلبُ محفوظٌ في SQLite قبل هذا السطر -- هذا كلُّ معنى "الحفظ
     * أوّلاً". فالانتظارُ هنا ليس لسلامة الطلب، إنما لمعرفةِ رقمه فوراً.
     *
     * وfetch في React Native بلا مهلةٍ افتراضية: شبكةٌ ضعيفةٌ -- أو
     * بوّابةُ فندقٍ تبتلع الطلبات ولا تردّها -- تُبقي النداء معلّقاً
     * دقيقةً أو أكثر، والشاشةُ واقفةٌ عليه بعد أن قُبض المال.
     *
     * فثلاثُ ثوانٍ ونصف: ما لم يصل فيها يُعدّ معلّقاً، ويرفعه المزامنُ
     * في الخلفية كما يرفع كلَّ ما تراكم بلا شبكة.
     *
     * وهذا آمنٌ لأنّ complete_pos_order متعادلة: تبحث عن
     * client_order_uuid أوّلاً وتُرجع الطلبَ القائم إن وُجد. فنداءٌ نجح
     * بعد انتهاء مهلتنا لا يُنشئ طلباً ثانياً حين يُعاد.
     */
    const result = await withTimeout(dispatchQueuedPayload(afterDrawer), DISPATCH_TIMEOUT_MS);
    orderId = typeof result === 'number' ? result : undefined;
    paymentState = 'PAYMENT_COMPLETED';
    await sqliteOrderQueueStorage.remove(afterDrawer.client_order_uuid);
  } catch (e) {
    paymentState = 'PAYMENT_SYNC_PENDING';
    paymentError = e instanceof Error ? e.message : String(e);
    await sqliteOrderQueueStorage.put({ ...afterDrawer, payment_state: paymentState, last_error: paymentError });
  }

  return { paymentState, drawerState, drawerError, paymentError, orderId };
}
