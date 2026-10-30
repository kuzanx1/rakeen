// «جهاز الطباعة للفرع»: يطبع طلبات الأجهزة الثانية، مرة وحدة، وما يطبع
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {} }));
// طلبات الجهاز نفسه ولا الطلبات الإلكترونية ولا الطلبات القديمة.

type Row = { id: number; client_order_uuid: string | null; source: string | null; status: string; payment_status: string; created_at: string };
let mockRows: Row[] = [];

// بنّاء استعلام مبسّط: يكفي للأوامر اللي تستخدمها الخدمة.
function mockQuery() {
  let list = mockRows.slice();
  let desc = false;
  let lim = Infinity;
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => ((list = list.filter((r: any) => k === 'branch_id' || r[k] === v)), q),
    gt: (k: string, v: number) => ((list = list.filter((r: any) => r[k] > v)), q),
    in: (k: string, vs: number[]) => ((list = list.filter((r: any) => vs.includes(r[k]))), q),
    order: (_k: string, o: { ascending: boolean }) => ((desc = !o.ascending), q),
    limit: (n: number) => ((lim = n), q),
    then: (res: (v: unknown) => void) => {
      const out = [...list].sort((a, b) => (desc ? b.id - a.id : a.id - b.id)).slice(0, lim);
      res({ data: out, error: null });
    },
  };
  return q;
}

jest.mock('../src/infrastructure/supabaseClient', () => ({ supabase: { from: () => mockQuery() } }));
const mockKv = new Map<string, string>();
jest.mock('../src/infrastructure/mmkvStorage', () => ({
  getItem: async (k: string) => mockKv.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockKv.set(k, v),
  removeItem: async (k: string) => void mockKv.delete(k),
}));
jest.mock('../src/infrastructure/realtimeChannel', () => ({ subscribeToPostgresChanges: () => () => {} }));
let mockProfile: any = { printStation: true, printKitchenTicket: true };
jest.mock('../src/infrastructure/printerProfileStore', () => ({ getPrinterProfile: async () => mockProfile }));
const mockJobs: { type: string; orderId: unknown }[] = [];
jest.mock('../src/application/printService', () => ({
  enqueuePrintJob: async (type: string, data: { orderId: unknown }) => {
    mockJobs.push({ type, orderId: data.orderId });
    return 'j';
  },
}));
jest.mock('../src/application/orderHistoryService', () => ({
  getOrderHistoryDetail: async (id: number) => ({
    id, createdAt: new Date().toISOString(), channel: 'pickup', paymentMethod: 'cash', subtotal: 10, discountAmount: 0,
    vatAmount: 1.3, total: 10, tableNumber: null, pagerNumber: null,
    items: [{ name: 'زربيان', qty: 1, unitPrice: 10, lineTotal: 10, mods: [], note: null }],
  }),
}));
jest.mock('../src/application/authService', () => ({ getDeviceConfig: async () => ({ businessId: 1, branchId: 7, businessName: 'م', branchName: 'ف' }) }));
jest.mock('../src/application/catalogService', () => ({
  getReceiptBranding: async () => null,
  getServiceSettings: async () => ({ kitchenTicketMode: 'brief' }),
}));
jest.mock('../src/application/planService', () => ({ planHas: () => true }));

import { printStationTick, handleRemotePrint } from '../src/application/printStationService';
import { markOwnOrder, markOwnPayment } from '../src/application/ownOrders';

const now = () => new Date().toISOString();
const add = (r: Partial<Row> & { id: number }) =>
  mockRows.push({ client_order_uuid: 'u' + r.id, source: 'pos', status: 'completed', payment_status: 'paid', created_at: now(), ...r });

beforeEach(() => {
  mockRows = [];
  mockJobs.length = 0;
  mockKv.clear();
  mockProfile = { printStation: true, printKitchenTicket: true };
});

describe('print station', () => {
  it('starts from now: orders before it was switched on never print', async () => {
    add({ id: 1 });
    await printStationTick(7);
    await printStationTick(7);
    expect(mockJobs).toEqual([]);
  });

  it('prints a paid order from another device once: receipt and kitchen ticket', async () => {
    await printStationTick(7);
    add({ id: 2 });
    await printStationTick(7);
    await printStationTick(7);
    expect(mockJobs).toEqual([{ type: 'receipt', orderId: 2 }, { type: 'kitchen', orderId: 2 }]);
  });

  it('skips its own orders, online orders, cancelled and old ones', async () => {
    await printStationTick(7);
    await markOwnOrder('u3');
    add({ id: 3 });
    add({ id: 4, source: 'online' });
    add({ id: 5, status: 'cancelled' });
    add({ id: 6, created_at: new Date(Date.now() - 31 * 60_000).toISOString() });
    await printStationTick(7);
    expect(mockJobs).toEqual([]);
  });

  it('a table order: kitchen now, receipt when it is paid', async () => {
    await printStationTick(7);
    add({ id: 8, payment_status: 'unpaid' });
    await printStationTick(7);
    expect(mockJobs).toEqual([{ type: 'kitchen', orderId: 8 }]);
    mockRows[0].payment_status = 'paid';
    await printStationTick(7);
    await printStationTick(7);
    expect(mockJobs).toEqual([{ type: 'kitchen', orderId: 8 }, { type: 'receipt', orderId: 8 }]);
  });

  it('a table paid on this device: its receipt is not printed again', async () => {
    await printStationTick(7);
    add({ id: 9, payment_status: 'unpaid' });
    await printStationTick(7);
    await markOwnPayment(9);
    mockRows[0].payment_status = 'paid';
    await printStationTick(7);
    expect(mockJobs).toEqual([{ type: 'kitchen', orderId: 9 }]);
  });

  it('switched off: prints nothing, and back on it starts from that moment', async () => {
    await printStationTick(7);
    mockProfile = { printStation: false, printKitchenTicket: true };
    add({ id: 10 });
    await printStationTick(7);
    mockProfile = { printStation: true, printKitchenTicket: true };
    await printStationTick(7);
    await printStationTick(7);
    expect(mockJobs).toEqual([]);
  });

  it('kitchen ticket off: the receipt alone', async () => {
    mockProfile = { printStation: true };
    await printStationTick(7);
    add({ id: 11 });
    await printStationTick(7);
    expect(mockJobs).toEqual([{ type: 'receipt', orderId: 11 }]);
  });
});

describe('reprint sent from a device without a printer', () => {
  it('the print station prints the asked paper and confirms', async () => {
    expect(await handleRemotePrint(20, 'receipt')).toBe(true);
    expect(await handleRemotePrint(20, 'kitchen')).toBe(true);
    expect(mockJobs).toEqual([{ type: 'receipt', orderId: 20 }, { type: 'kitchen', orderId: 20 }]);
  });

  it('a device that is not the print station ignores it (no confirmation)', async () => {
    mockProfile = { printStation: false };
    expect(await handleRemotePrint(21, 'receipt')).toBe(false);
    expect(mockJobs).toEqual([]);
  });
});
