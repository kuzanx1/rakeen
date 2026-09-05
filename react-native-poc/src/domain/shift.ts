/**
 * Shifts: the cash-accountability layer around a cashier's session.
 *
 * A shift opens with a counted float, every paid order is stamped with its
 * id, and closing it counts the drawer against what the sales say should
 * be in there. The variance is what the whole feature exists to produce.
 *
 * The maths here is `loadShiftData()` (rakeen-pos.js:5388) kept pure so it
 * can be reasoned about on its own -- the network read that feeds it lives
 * in application/shiftService.ts.
 */

/** A row of `shifts` (supabase/migrations/20260801163618). */
export interface Shift {
  id: number;
  business_id: number;
  branch_id: number;
  cashier_id: string;
  opening_cash: number;
  closing_cash: number | null;
  opened_at: string;
  closed_at: string | null;
}

/** The paid-order fields the totals are derived from. */
export interface ShiftOrderRow {
  total: number | string;
  payment_method: string | null;
  cash_amount: number | string | null;
}

/** A non-sale movement of cash in or out of the drawer. */
export interface CashMovement {
  direction: 'in' | 'out';
  amount: number;
  reason: string;
}

export interface ShiftTotals {
  ordersCount: number;
  salesTotal: number;
  /**
   * What should physically be in the drawer:
   *   opening float + cash sales + paid-in - paid-out
   *
   * Not the day's cash takings. Leaving the movements out is what makes a
   * supplier paid from the till look like a shortfall.
   */
  cashTotal: number;
  cardTotal: number;
  deliveryPlatformTotal: number;
  /** Shown separately on the summary so the expected figure can be read
   *  rather than just trusted. */
  cashInTotal: number;
  cashOutTotal: number;
}

export const EMPTY_SHIFT_TOTALS: ShiftTotals = {
  ordersCount: 0,
  salesTotal: 0,
  cashTotal: 0,
  cardTotal: 0,
  deliveryPlatformTotal: 0,
  cashInTotal: 0,
  cashOutTotal: 0,
};

/**
 * Splits paid orders across the three money buckets.
 *
 * The split-payment branch is the part worth reading twice, and the
 * source carries its own scar about it: a split order's cash half belongs
 * in the drawer count, and only the REMAINDER is card. Treating the whole
 * order as card double-counts it and leaves real cash in the drawer
 * unaccounted for -- which shows up as a phantom surplus at closing, on
 * exactly the number a manager is being asked to sign off.
 */
export function computeShiftTotals(
  orders: ShiftOrderRow[],
  openingCash: number,
  movements: CashMovement[] = [],
): ShiftTotals {
  let cashSales = 0;
  let cardSales = 0;
  let deliveryPlatformSales = 0;

  for (const o of orders) {
    const total = Number(o.total) || 0;
    if (o.payment_method === 'cash') {
      cashSales += total;
    } else if (o.payment_method === 'split') {
      const cashPart = Number(o.cash_amount || 0);
      cashSales += cashPart;
      cardSales += total - cashPart;
    } else if (o.payment_method === 'delivery_platform') {
      deliveryPlatformSales += total;
    } else {
      cardSales += total;
    }
  }

  let cashIn = 0;
  let cashOut = 0;
  for (const m of movements) {
    const amount = Math.abs(Number(m.amount) || 0);
    if (m.direction === 'in') cashIn += amount;
    else cashOut += amount;
  }

  return {
    ordersCount: orders.length,
    // Sales only. A float taken from the safe is not revenue, so movements
    // deliberately do NOT touch this figure -- only the drawer's.
    salesTotal: cashSales + cardSales + deliveryPlatformSales,
    cashTotal: (Number(openingCash) || 0) + cashSales + cashIn - cashOut,
    cardTotal: cardSales,
    deliveryPlatformTotal: deliveryPlatformSales,
    cashInTotal: cashIn,
    cashOutTotal: cashOut,
  };
}

/** What the closing wizard compares and what gets filed as the report. */
export interface ClosingReport {
  businessName: string;
  branchName: string;
  dateLabel: string;
  staffName: string;
  ordersCount: number;
  salesTotal: number;
  cardTotal: number;
  deliveryPlatformTotal: number;
  /** المسار المحاسبي من الإجمالي إلى الصافي. اختيارية حتى يبقى تقرير
   *  محفوظ من قبل قابلاً للطباعة بما فيه. */
  grossSales?: number;
  discountsTotal?: number;
  refundsTotal?: number;
  refundsCount?: number;
  vatTotal?: number;
  netSales?: number;
  avgTicket?: number;
  openingCash?: number;
  cashSales?: number;
  onlineTotal?: number;
  onlinePaymentsEnabled?: boolean;
  shiftStart?: string;
  /** ما يظهر في الورقة وما لا يظهر. الغياب يعني أظهر. */
  options?: Record<string, boolean>;
  /** Non-sale cash movements, printed as their own lines so the expected
   *  figure on the slip can be reconstructed by whoever reads it. */
  cashIn: number;
  cashOut: number;
  cashExpected: number;
  cashCounted: number;
  cashVariance: number;
}

export type VarianceSeverity = 'ok' | 'warn' | 'urgent';

/** `variance === 0 ? 'ok' : (Math.abs(variance) <= 5 ? 'warn' : 'urgent')`
 *  -- a five-riyal tolerance before a discrepancy is treated as serious. */
export function varianceSeverity(variance: number): VarianceSeverity {
  if (variance === 0) return 'ok';
  return Math.abs(variance) <= 5 ? 'warn' : 'urgent';
}

/** The wording the wizard shows beside the figure. */
export function varianceLabel(variance: number): string {
  if (variance === 0) return 'مطابق تمامًا';
  return variance > 0 ? `زيادة ${variance.toFixed(2)}` : `عجز ${Math.abs(variance).toFixed(2)}`;
}


/**
 * Has the branch closed for the night since this shift opened?
 *
 * The problem this exists for: nothing ever closes a shift on its own. If
 * a cashier locks up and goes home without running the closing wizard, the
 * shift stays open forever -- so the next day's sales land inside
 * yesterday's shift, the Z-report spans several days, and the cash count
 * is measured against a float declared two days ago. Logging in the next
 * morning never asks for a new shift, because an open one is found.
 *
 * Calendar date cannot answer this. A cafe trading 16:00-02:00 closes on
 * the FOLLOWING date, so "is it a new day?" is the wrong question. The
 * right one is "has the branch's own closing time passed since this shift
 * opened?", and that works for a 02:00 close and a midnight close alike.
 *
 * The rule: find the most recent instant at which the branch's
 * closing_time has passed, and compare. Worked examples --
 *
 *   16:00-02:00, now Tue 03:00, opened Mon 16:00
 *     last close = Tue 02:00 > opened -> STALE      (correct)
 *   16:00-02:00, now Mon 20:00, opened Mon 16:00
 *     last close = Mon 02:00 < opened -> fine       (correct)
 *   09:00-00:00, now Tue 01:00, opened Mon 09:00
 *     last close = Tue 00:00 > opened -> STALE      (correct)
 *
 * When the branch has no hours set, fall back to a plain age limit so the
 * "open for days" case is still caught rather than ignored.
 */
export const STALE_SHIFT_FALLBACK_HOURS = 18;

export function isShiftStale(
  shift: Pick<Shift, 'opened_at'>,
  /** branches.closing_time, "HH:MM" or "HH:MM:SS". Null when unset. */
  closingTime: string | null,
  now: Date = new Date(),
): boolean {
  const openedAt = new Date(shift.opened_at);
  if (Number.isNaN(openedAt.getTime())) return false;

  if (!closingTime) {
    return now.getTime() - openedAt.getTime() > STALE_SHIFT_FALLBACK_HOURS * 3600_000;
  }

  const [h, m] = closingTime.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return now.getTime() - openedAt.getTime() > STALE_SHIFT_FALLBACK_HOURS * 3600_000;
  }

  const lastClose = new Date(now);
  lastClose.setHours(h, m, 0, 0);
  // Today's closing time has not arrived yet, so the most recent one was
  // yesterday's.
  if (lastClose.getTime() > now.getTime()) lastClose.setDate(lastClose.getDate() - 1);

  return openedAt.getTime() < lastClose.getTime();
}
