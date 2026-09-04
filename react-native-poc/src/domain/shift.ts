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

export interface ShiftTotals {
  ordersCount: number;
  salesTotal: number;
  /** Opening float PLUS cash sales -- this is what should be in the
   *  drawer, not the day's cash takings on their own. */
  cashTotal: number;
  cardTotal: number;
  deliveryPlatformTotal: number;
}

export const EMPTY_SHIFT_TOTALS: ShiftTotals = {
  ordersCount: 0,
  salesTotal: 0,
  cashTotal: 0,
  cardTotal: 0,
  deliveryPlatformTotal: 0,
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
export function computeShiftTotals(orders: ShiftOrderRow[], openingCash: number): ShiftTotals {
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

  return {
    ordersCount: orders.length,
    salesTotal: cashSales + cardSales + deliveryPlatformSales,
    cashTotal: (Number(openingCash) || 0) + cashSales,
    cardTotal: cardSales,
    deliveryPlatformTotal: deliveryPlatformSales,
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
