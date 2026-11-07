jest.mock('../src/infrastructure/supabaseClient', () => ({ supabase: {}, RAKEEN_API_BASE_URL: 'https://rk.test' }));
jest.mock('../src/infrastructure/mmkvStorage', () => ({ getItem: async () => null, setItem: async () => {} }));
jest.mock('../src/application/displayScopeService', () => ({ getPosDeviceId: async () => 'dev' }));
jest.mock('../src/platform/customerDisplay', () => ({ pagerOnCustomerDisplay: jest.fn(), hidePagerOnCustomerDisplay: jest.fn() }));

import {
  pagerKey,
  pagerUrl,
  pagerEligible,
  normalizePagerSettings,
  pagerUrgency,
  pagerDueAutoActions,
  sortPagerOrders,
  PAGER_DEFAULTS,
} from '../src/application/pagerService';
import type { PagerOrder } from '../src/application/pagerService';

declare const Buffer: { from(s: string, enc: string): { toString(enc: string): string } };

/** نفس خوارزمية الخادم (lib/pager.ts uuidToKey) -- لو افترقا انفتح بيجرُ غير الطلب. */
function serverKey(uuid: string): string {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  let bin = '';
  for (let i = 0; i < 32; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUuid(seed: number): string {
  let x = seed * 2654435761 >>> 0;
  let hex = '';
  for (let i = 0; i < 32; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    hex += ((x >>> 16) & 15).toString(16);
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

const on = (over: Partial<ReturnType<typeof normalizePagerSettings>> = {}) => ({
  enabled: true,
  settings: { ...PAGER_DEFAULTS, ...over },
  autoReady: { dine_in: false, pickup: false },
});
const U = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('pagerKey matches the server', () => {
  it('500 uuids round to the exact same 22-char key', () => {
    for (let i = 1; i <= 500; i++) {
      const u = randomUuid(i);
      const k = pagerKey(u);
      expect(k).toHaveLength(22);
      expect(k).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(k).toBe(serverKey(u));
    }
  });
  it('edge bytes (all 00 / all ff)', () => {
    expect(pagerKey('00000000-0000-0000-0000-000000000000')).toBe(serverKey('00000000-0000-0000-0000-000000000000'));
    expect(pagerKey('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(serverKey('ffffffff-ffff-ffff-ffff-ffffffffffff'));
  });
  it('url shape', () => {
    expect(pagerUrl(U)).toMatch(/^https:\/\/rakeenapp\.com\/p\/[A-Za-z0-9_-]{22}$/);
  });
});

describe('pagerEligible = orders_set_pager_eta', () => {
  it('pickup and simple dine-in get a pager', () => {
    expect(pagerEligible({ client_order_uuid: U, channel: 'pickup' }, 'simple', on())).toBe(true);
    expect(pagerEligible({ client_order_uuid: U, channel: 'dine_in' }, 'simple', on())).toBe(true);
  });
  it('off, delivery, tables, table_id, unchecked channel, auto-ready, bad uuid', () => {
    expect(pagerEligible({ client_order_uuid: U, channel: 'pickup' }, 'simple', { ...on(), enabled: false })).toBe(false);
    expect(pagerEligible({ client_order_uuid: U, channel: 'delivery' }, 'simple', on())).toBe(false);
    expect(pagerEligible({ client_order_uuid: U, channel: 'dine_in' }, 'tables', on())).toBe(false);
    expect(pagerEligible({ client_order_uuid: U, channel: 'dine_in', table_id: 4 }, 'simple', on())).toBe(false);
    expect(pagerEligible({ client_order_uuid: U, channel: 'dine_in' }, 'simple', on({ channels: ['pickup'] }))).toBe(false);
    expect(pagerEligible({ client_order_uuid: U, channel: 'pickup' }, 'simple', { ...on(), autoReady: { dine_in: false, pickup: true } })).toBe(false);
    expect(pagerEligible({ client_order_uuid: 'abc', channel: 'pickup' }, 'simple', on())).toBe(false);
    expect(pagerEligible({ client_order_uuid: null, channel: 'pickup' }, 'simple', on())).toBe(false);
  });
});

describe('normalizePagerSettings clamps like the dashboard', () => {
  it('defaults on garbage', () => {
    expect(normalizePagerSettings(null)).toEqual(PAGER_DEFAULTS);
    expect(normalizePagerSettings('x')).toEqual(PAGER_DEFAULTS);
  });
  it('clamps and filters', () => {
    const s = normalizePagerSettings({ prep_min: 999, buffer_min: -4, display_secs: 9999, channels: ['pickup', 'delivery', 3], tone: 'siren', wifi: 'x'.repeat(90) });
    expect(s.prep_min).toBe(120);
    expect(s.buffer_min).toBe(0);
    expect(s.display_secs).toBe(300);
    expect(s.channels).toEqual(['pickup']);
    expect(s.tone).toBe('chime');
    expect(s.wifi).toHaveLength(40);
  });
});

function order(o: Partial<PagerOrder> & { id: number }): PagerOrder {
  return {
    channel: 'pickup', total: 20, customerName: null, createdAt: new Date(0), etaAt: null,
    readyAt: null, delayedAt: null, seenAt: null, ringCount: 0, ...o,
  };
}

describe('urgency: ok → warn (past prep) → urgent (past promise)', () => {
  const s = { ...PAGER_DEFAULTS, prep_min: 10, buffer_min: 5 };
  const o = order({ id: 1, createdAt: new Date(0), etaAt: new Date(15 * 60_000) });
  it.each([
    [5 * 60_000, 'ok', 600],
    [11 * 60_000, 'warn', 240],
    [16 * 60_000, 'urgent', -60],
  ])('at %i ms', (now, u, left) => {
    const r = pagerUrgency(o, now as number, s);
    expect(r.urgency).toBe(u);
    expect(r.secondsLeft).toBe(left);
  });
});

describe('auto actions: only this device, once each', () => {
  const s = { ...PAGER_DEFAULTS, remind_min: 3, close_min: 20 };
  const ready = new Date(0);
  const mine = (id: number) => id !== 99;
  it('nothing before remind_min', () => {
    expect(pagerDueAutoActions([order({ id: 1, readyAt: ready })], 2 * 60_000, s, mine, new Set())).toEqual([]);
  });
  it('one ring at remind_min, not again once rung', () => {
    expect(pagerDueAutoActions([order({ id: 1, readyAt: ready })], 3 * 60_000, s, mine, new Set())).toEqual([{ id: 1, action: 'ring' }]);
    expect(pagerDueAutoActions([order({ id: 1, readyAt: ready, ringCount: 1 })], 5 * 60_000, s, mine, new Set())).toEqual([]);
    expect(pagerDueAutoActions([order({ id: 1, readyAt: ready })], 5 * 60_000, s, mine, new Set(['1:r']))).toEqual([]);
  });
  it('close at close_min, other device untouched', () => {
    expect(pagerDueAutoActions([order({ id: 1, readyAt: ready, ringCount: 1 }), order({ id: 99, readyAt: ready })], 21 * 60_000, s, mine, new Set()))
      .toEqual([{ id: 1, action: 'collected' }]);
  });
  it('0 disables both', () => {
    expect(pagerDueAutoActions([order({ id: 1, readyAt: ready })], 99 * 60_000, { ...s, remind_min: 0, close_min: 0 }, mine, new Set())).toEqual([]);
  });
  it('not-ready orders never auto-act', () => {
    expect(pagerDueAutoActions([order({ id: 1 })], 99 * 60_000, s, mine, new Set())).toEqual([]);
  });
});

it('sort: not-ready by promise first, then ready oldest-first', () => {
  const rows = sortPagerOrders([
    order({ id: 1, readyAt: new Date(50) }),
    order({ id: 2, etaAt: new Date(900) }),
    order({ id: 3, readyAt: new Date(10) }),
    order({ id: 4, etaAt: new Date(300) }),
  ]);
  expect(rows.map(r => r.id)).toEqual([4, 2, 3, 1]);
});
