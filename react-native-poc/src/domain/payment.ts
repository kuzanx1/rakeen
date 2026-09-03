/**
 * Domain layer: the payment state machine. Two orthogonal dimensions,
 * modeled as two enums rather than one flat list, specifically to satisfy
 * the explicit "do not allow ambiguous states" requirement -- a single
 * merged enum can't express "payment confirmed, drawer still pending"
 * without an ambiguous or combinatorial state name.
 *
 * Payment methods: all four the PWA's own .pm-tabs offer. 'split' and
 * 'loyalty' were previously deferred here as "not part of this
 * checkpoint"; the live-runtime audit showed renderPaymentStep()
 * (rakeen-pos.js:1635) renders تقسيم as a standard third tab and الولاء as
 * a fourth whenever a saved customer has points, and that both values go
 * to the server verbatim as `payment_method: state.activePaymentMethod`
 * (:2104, :2193) -- reports already branch on 'split' (:5404). So they are
 * real, accepted values, not future work.
 *
 * 'delivery_platform' is not cashier-SELECTED -- there is no tab for it --
 * but it is still a stored value: proceedFromCustomerStep() assigns it
 * outright for the delivery channel (:1293), which then replaces the whole
 * tab strip with a prepaid confirmation and an invoice-last-4 field
 * (:1616). So it belongs in this union even though no tab produces it.
 */

export type PaymentMethod = 'cash' | 'card' | 'split' | 'loyalty' | 'delivery_platform';

/**
 * PAYMENT_PENDING: persisted locally, no network attempt made yet.
 * PAYMENT_SYNC_PENDING: at least one attempt failed or was offline;
 *   sitting in the queue for automatic retry (mirrors the existing order
 *   queue's normal retry_count>0 state).
 * PAYMENT_COMPLETED: the server confirmed success (complete_pos_order /
 *   pay_dine_in_order); removed from the queue.
 * PAYMENT_FAILED: exhausted automatic retries (mirrors the existing order
 *   queue's `stuck` flag exactly -- financial data is NEVER deleted, this
 *   state means "needs a human", not "gone").
 */
export type PaymentState = 'PAYMENT_PENDING' | 'PAYMENT_SYNC_PENDING' | 'PAYMENT_COMPLETED' | 'PAYMENT_FAILED';

/**
 * DRAWER_PENDING: not yet confirmed open (covers both "not attempted yet"
 *   and "attempted, failed, will retry" -- the source's own drawer
 *   contract has no separate "retrying" status either, see
 *   react-native-poc/src/platform/cashDrawer.ts).
 * DRAWER_COMPLETED: the native layer confirmed the kick was sent
 *   successfully -- the ONLY state that may ever be shown to the cashier
 *   as "تم فتح الدرج", per the explicit no-fake-success rule.
 * DRAWER_UNAVAILABLE: terminal -- no native cash drawer module exists on
 *   this platform/build at all (CASH_DRAWER_UNAVAILABLE). Distinct from a
 *   connection failure (which stays DRAWER_PENDING and is retryable).
 */
export type DrawerState = 'DRAWER_PENDING' | 'DRAWER_COMPLETED' | 'DRAWER_UNAVAILABLE';

export function computeCashChange(cashAmount: number, total: number): number {
  return Math.max(0, Number((cashAmount - total).toFixed(2)));
}

/** True only for the exact terminal condition the requirements describe
 *  as safe to skip re-kicking for -- a persisted DRAWER_COMPLETED. Every
 *  other drawer state (including DRAWER_UNAVAILABLE) is safe to attempt
 *  again later if circumstances change (e.g. a native module becomes
 *  available after an app update), so this deliberately does NOT treat
 *  DRAWER_UNAVAILABLE as "done, never retry". */
export function drawerAlreadyCompleted(drawerState: DrawerState | undefined): boolean {
  return drawerState === 'DRAWER_COMPLETED';
}
