jest.mock('../src/infrastructure/supabaseClient', () => ({ supabase: {} }));

import { isScheduledHold, sortActiveOrders } from '../src/application/activeOrderService';
import type { ActiveOrder } from '../src/application/activeOrderService';

const NOW = new Date('2026-10-24T15:00:00Z').getTime();
const min = (m: number) => new Date(NOW + m * 60_000);

function order(id: number, over: Partial<ActiveOrder> = {}): ActiveOrder {
  return {
    id, channel: 'pickup', createdAt: min(-5), total: 20, platformName: null, platformId: null,
    invoiceLast4: null, isOnline: true, readyAt: null, outForDeliveryAt: null, customerName: null,
    customerPhone: null, scheduledFor: null, pagerNumber: null, prepTimeoutMinutes: 17, isCod: true, isCash: true,
    ...over,
  };
}

describe('scheduled pickup hold', () => {
  it('holds an order until half an hour before its time', () => {
    expect(isScheduledHold(order(1, { scheduledFor: min(31) }), NOW)).toBe(true);
    expect(isScheduledHold(order(1, { scheduledFor: min(30) }), NOW)).toBe(false);
    expect(isScheduledHold(order(1, { scheduledFor: min(10) }), NOW)).toBe(false);
  });

  it('never holds an unscheduled or ready order', () => {
    expect(isScheduledHold(order(1), NOW)).toBe(false);
    expect(isScheduledHold(order(1, { scheduledFor: min(90), readyAt: min(-1) }), NOW)).toBe(false);
  });

  it('puts held orders last, by their time, and due ones by their time', () => {
    const list = sortActiveOrders(
      [
        order(1, { scheduledFor: min(120) }),
        order(2, { createdAt: min(-2) }),
        order(3, { scheduledFor: min(45) }),
        order(4, { scheduledFor: min(5), createdAt: min(-60) }),
      ],
      NOW,
    );
    expect(list.map(o => o.id)).toEqual([2, 4, 3, 1]);
  });
});
