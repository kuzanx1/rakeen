/**
 * The crash this guards against: supabase-js returns the EXISTING channel
 * for a topic, so a second subscriber calling `.on('postgres_changes')`
 * on it throws "cannot add postgres_changes callbacks ... after
 * subscribe()" -- from inside a useEffect, which takes down the tree.
 *
 * So the test that matters is two subscribers on one topic, which is
 * exactly what App.tsx and ProductsScreen were doing to
 * pos-business-settings:<id>.
 */

// Built inside the factory: Babel hoists the import of the module under
// test above these declarations, so a factory closing over outer consts
// would hand it an undefined client.
jest.mock('../src/infrastructure/supabaseClient', () => {
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  return {
    supabase: { channel: jest.fn(() => channel), removeChannel: jest.fn() },
    __channel: channel,
  };
});

import { subscribeToPostgresChanges } from '../src/infrastructure/realtimeChannel';

const mocked = jest.requireMock('../src/infrastructure/supabaseClient') as {
  supabase: { channel: jest.Mock; removeChannel: jest.Mock };
  __channel: { on: jest.Mock; subscribe: jest.Mock };
};
const mockSupabase = mocked.supabase;
const mockChannel = mocked.__channel;

const FILTER = { event: 'UPDATE' as const, schema: 'public', table: 'businesses', filter: 'id=eq.83' };
const TOPIC = 'pos-business-settings:83';

let fanout: (payload: unknown) => void;

beforeEach(() => {
  jest.clearAllMocks();
  mockChannel.on.mockImplementation((_evt: string, _filter: unknown, cb: (p: unknown) => void) => {
    fanout = cb;
    return mockChannel;
  });
  mockChannel.subscribe.mockReturnValue(mockChannel);
});

describe('shared realtime channels', () => {
  it('opens the channel once for two subscribers, and registers .on before subscribe', () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = subscribeToPostgresChanges(TOPIC, FILTER, a);
    const offB = subscribeToPostgresChanges(TOPIC, FILTER, b);

    // The whole bug in one assertion: the second subscriber must not
    // touch .on() again on an already-subscribed channel.
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    expect(mockChannel.on).toHaveBeenCalledTimes(1);
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);

    offA();
    offB();
  });

  it('delivers every event to every subscriber', () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = subscribeToPostgresChanges(TOPIC, FILTER, a);
    const offB = subscribeToPostgresChanges(TOPIC, FILTER, b);

    fanout({ new: { id: 83 } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offB();
  });

  it('keeps the channel alive while anyone is still listening', () => {
    const offA = subscribeToPostgresChanges(TOPIC, FILTER, jest.fn());
    const b = jest.fn();
    const offB = subscribeToPostgresChanges(TOPIC, FILTER, b);

    // One screen unmounting must not cut off the other's updates -- the
    // second half of the original bug.
    offA();
    expect(mockSupabase.removeChannel).not.toHaveBeenCalled();
    fanout({ new: { id: 83 } });
    expect(b).toHaveBeenCalledTimes(1);

    offB();
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('reopens cleanly after the last subscriber leaves', () => {
    subscribeToPostgresChanges(TOPIC, FILTER, jest.fn())();
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);

    subscribeToPostgresChanges(TOPIC, FILTER, jest.fn())();
    expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
    expect(mockChannel.on).toHaveBeenCalledTimes(2);
  });

  it('ignores a repeated unsubscribe instead of tearing down a new owner', () => {
    const off = subscribeToPostgresChanges(TOPIC, FILTER, jest.fn());
    off();
    const b = jest.fn();
    const offB = subscribeToPostgresChanges(TOPIC, FILTER, b);

    off(); // React can run a cleanup twice
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
    fanout({ new: { id: 83 } });
    expect(b).toHaveBeenCalledTimes(1);

    offB();
  });

  it('one bad handler does not stop the others', () => {
    const boom = jest.fn(() => {
      throw new Error('handler blew up');
    });
    const ok = jest.fn();
    const off1 = subscribeToPostgresChanges(TOPIC, FILTER, boom);
    const off2 = subscribeToPostgresChanges(TOPIC, FILTER, ok);

    expect(() => fanout({ new: {} })).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);

    off1();
    off2();
  });

  it('keeps different topics independent', () => {
    const off1 = subscribeToPostgresChanges(TOPIC, FILTER, jest.fn());
    const off2 = subscribeToPostgresChanges('restaurant_tables:branch:5', FILTER, jest.fn());
    expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
    off1();
    off2();
  });
});
