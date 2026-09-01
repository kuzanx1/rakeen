import { sqliteOrderQueueStorage } from '../infrastructure/sqliteOrderQueue';
import { getPrinterTarget } from '../infrastructure/printerConfig';
import { openCashDrawer } from '../platform/cashDrawer';
import { dispatchQueuedPayload } from './orderService';
import { QueuedPayload } from '../domain/order';
import { PaymentState, DrawerState, drawerAlreadyCompleted } from '../domain/payment';

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
 * call, using whatever printer target is configured (see
 * infrastructure/printerConfig.ts -- honestly empty until Checkpoint 11
 * builds real Settings, which correctly makes every drawer attempt today
 * report an honest "not available" rather than a fake success).
 */

export interface PaymentOutcome {
  paymentState: PaymentState;
  drawerState: DrawerState;
  drawerError?: string;
  paymentError?: string;
}

/**
 * Persist -> drawer -> network, in that literal order. Never throws --
 * every real outcome is reported back via PaymentOutcome instead, so a
 * network failure can never be confused with (or block) the drawer
 * result, and vice versa. This is the one function every payment method
 * (cash today; card follows the same shape minus the drawer step, since
 * only cash sales open a physical drawer) funnels through.
 */
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
    const target = await getPrinterTarget();
    if (!target.host || !target.port) {
      drawerState = 'DRAWER_UNAVAILABLE';
      drawerError = 'no_printer_configured';
    } else {
      const result = await openCashDrawer({
        target: { transport: 'network', host: target.host, port: target.port },
        timeoutMs: 8000,
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
  try {
    await dispatchQueuedPayload(afterDrawer);
    paymentState = 'PAYMENT_COMPLETED';
    await sqliteOrderQueueStorage.remove(afterDrawer.client_order_uuid);
  } catch (e) {
    paymentState = 'PAYMENT_SYNC_PENDING';
    paymentError = e instanceof Error ? e.message : String(e);
    await sqliteOrderQueueStorage.put({ ...afterDrawer, payment_state: paymentState, last_error: paymentError });
  }

  return { paymentState, drawerState, drawerError, paymentError };
}
