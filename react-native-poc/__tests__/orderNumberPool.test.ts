const mockStore: Record<string, string> = {};
jest.mock('../src/infrastructure/mmkvStorage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
}));

const mockNext = { v: 1000 };
const mockMode: { v: 'ok' | 'missing' | 'offline' } = { v: 'ok' };
const mockRpc = jest.fn(async (_name: string, args: { p_branch_id: number; p_uuids: string[] }) => {
  if (mockMode.v === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  if (mockMode.v === 'offline') return { data: null, error: { code: '', message: 'Network request failed' } };
  return { data: args.p_uuids.map(u => ({ r_order_id: mockNext.v++, r_client_order_uuid: u })), error: null };
});
jest.mock('../src/infrastructure/supabaseClient', () => ({ supabase: { rpc: (n: string, a: never) => mockRpc(n, a) } }));

import { refillOrderNumberPool, takeReservedOrderNumber } from '../src/application/orderNumberPool';

describe('orderNumberPool', () => {
  it('returns null and keeps selling when the server has no function yet', async () => {
    mockMode.v = 'missing';
    await refillOrderNumberPool(7);
    expect(await takeReservedOrderNumber(7)).toBeNull();
    // backoff: no second call within the hour
    const calls = mockRpc.mock.calls.length;
    await refillOrderNumberPool(7);
    expect(mockRpc.mock.calls.length).toBe(calls);
  });
});

describe('orderNumberPool (fresh module)', () => {
  beforeEach(() => {
    jest.resetModules();
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    mockMode.v = 'ok';
    mockRpc.mockClear();
  });

  it('fills, hands out ascending unique numbers, never the same twice under concurrency', async () => {
    const pool = require('../src/application/orderNumberPool');
    await pool.refillOrderNumberPool(7);
    const got = await Promise.all(Array.from({ length: 10 }, () => pool.takeReservedOrderNumber(7)));
    const ids = got.map((g: { id: number }) => g.id);
    const uuids = got.map((g: { uuid: string }) => g.uuid);
    expect(new Set(ids).size).toBe(10);
    expect(new Set(uuids).size).toBe(10);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('survives a restart (persisted) and drops the pool on branch change', async () => {
    let pool = require('../src/application/orderNumberPool');
    await pool.refillOrderNumberPool(7);
    const first = await pool.takeReservedOrderNumber(7);
    jest.resetModules();
    pool = require('../src/application/orderNumberPool');
    mockMode.v = 'offline';
    const afterRestart = await pool.takeReservedOrderNumber(7);
    expect(afterRestart.id).toBe(first.id + 1);
    expect(await pool.takeReservedOrderNumber(8)).toBeNull();
  });

  it('offline with an empty pool returns null', async () => {
    mockMode.v = 'offline';
    const pool = require('../src/application/orderNumberPool');
    await pool.refillOrderNumberPool(7);
    expect(await pool.takeReservedOrderNumber(7)).toBeNull();
  });
});
