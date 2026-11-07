/**
 * «مسحت باركود الفاتورة وانقفل التطبيق» -- 2026-11-08 على السنمي.
 *
 * supabase.channel(نفس الاسم) يرجّع القناة القائمة ما دامت لم تُزل، وإزالتها
 * غير متزامنة (تنتظر ردّ الخادم). وإضافة postgres_changes على قناةٍ مشتركة
 * ترمي خطأً -- وفي نسخة الإنتاج الخطأ غير الملتقط يقفل التطبيق.
 *
 * هذا الـ fake يطابق realtime-js 2.112 (RealtimeClient.channel/removeChannel،
 * RealtimeChannel.on) في هذه الثلاث بالضبط.
 */
type Cb = (p: unknown) => void;
class MockChannel {
  joined = false;
  closed = false;
  handlers: { type: string; cb: Cb }[] = [];
  constructor(public topic: string) {}
  on(type: string, _f: unknown, cb: Cb) {
    if (this.joined && (type === 'postgres_changes' || type === 'presence')) {
      throw new Error(`cannot add \`${type}\` callbacks for realtime:${this.topic} after \`subscribe()\`.`);
    }
    this.handlers.push({ type, cb });
    return this;
  }
  statusCb?: (s: string) => void;
  subscribe(status?: (s: string) => void) {
    this.joined = true;
    this.statusCb = status;
    if (status) setTimeout(() => status('SUBSCRIBED'), 0);
    return this;
  }
  /** انقطع الاتصال ورجع: المكتبة تعيد الانضمام وتنادي SUBSCRIBED مرّة ثانية. */
  rejoin() { this.statusCb?.('CHANNEL_ERROR'); this.statusCb?.('SUBSCRIBED'); }
  emit(type: string, payload: unknown) {
    if (this.closed) return;
    for (const h of this.handlers) if (h.type === type) h.cb(payload);
  }
}
const mockChannels: MockChannel[] = [];
const mockSupabase = {
  channel(topic: string) {
    const exists = mockChannels.find(c => c.topic === topic);
    if (exists) return exists;
    const c = new MockChannel(topic);
    mockChannels.push(c);
    return c;
  },
  removeChannel(c: MockChannel) {
    // مثل المكتبة: تنتظر ردّ الخادم ثم تُزال.
    return new Promise(res => setTimeout(() => {
      c.closed = true;
      const i = mockChannels.indexOf(c);
      if (i !== -1) mockChannels.splice(i, 1);
      res('ok');
    }, 50));
  },
};

jest.mock('../src/infrastructure/supabaseClient', () => ({ get supabase() { return mockSupabase; }, RAKEEN_API_BASE_URL: 'https://rk.test' }));
jest.mock('../src/infrastructure/mmkvStorage', () => ({ getItem: async () => null, setItem: async () => {} }));
jest.mock('../src/application/displayScopeService', () => ({ getPosDeviceId: async () => 'dev' }));
const mockHidePager = jest.fn();
jest.mock('../src/platform/customerDisplay', () => ({ pagerOnCustomerDisplay: jest.fn(), hidePagerOnCustomerDisplay: () => mockHidePager() }));

import { subscribePagerOrders, watchPagerOnDisplay, pagerUrl } from '../src/application/pagerService';

const tick = (ms = 0) => new Promise<void>(r => setTimeout(() => r(), ms));
const stops: (() => void)[] = [];
const sub = (b: number, f: () => void) => { const s = subscribePagerOrders(b, f); stops.push(s); return s; };
const live = (prefix: string) => mockChannels.find(c => c.topic.startsWith(prefix) && !c.closed)!;

beforeEach(() => { mockHidePager.mockClear(); });
afterEach(async () => { stops.splice(0).forEach(s => s()); await tick(80); mockChannels.length = 0; });

it('«جارية» تنفكّ وتنركّب فوراً (تنقّل بين التبويبات) بلا خطأ', async () => {
  const a = subscribePagerOrders(109, () => {});
  await tick();
  a(); // الإزالة بدأت ولم تكتمل
  expect(() => sub(109, () => {})).not.toThrow();
});

it('شاشتان تستمعان لنفس الفرع معاً بلا خطأ، وكلٌّ يُبلَّغ', async () => {
  const one = jest.fn(), two = jest.fn();
  sub(109, one);
  expect(() => sub(109, two)).not.toThrow();
  await tick();
  live('rn-pager-orders:109').emit('postgres_changes', { new: { pager_eta_at: '2026-11-08T00:00:00Z' } });
  await tick(450);
  expect(one).toHaveBeenCalledTimes(1);
  expect(two).toHaveBeenCalledTimes(1);
});

it('صفّ بلا بيجر لا يحرّك شيئاً، وإعادة الاتصال تجلب مرّة', async () => {
  const on = jest.fn();
  sub(109, on);
  await tick();
  const ch = live('rn-pager-orders:109');
  ch.emit('postgres_changes', { new: { pager_eta_at: null } });
  await tick(450);
  expect(on).not.toHaveBeenCalled();
  // رجع الاتصال: اشتراكٌ ناجح ثانٍ → جلبة واحدة (ما فات وقت الانقطاع).
  ch.rejoin();
  await tick(450);
  expect(on).toHaveBeenCalledTimes(1);
});

it('نفس البيجر يُعرض مرّتين (محلي ثم بثّ الخادم): يبقى الاستماع، والمسح يخفيه', async () => {
  const U = '9d66c6c4-899f-4b4a-b94a-a1d23717deac';
  const url = pagerUrl(U);
  watchPagerOnDisplay(url, 60);
  watchPagerOnDisplay(url, 60);
  await tick(80); // لو أُغلقت القناة بالخطأ لاكتملت إزالتها هنا
  const ch = mockChannels.find(c => c.topic === `pager:${U}`);
  expect(ch).toBeTruthy();
  ch!.emit('broadcast', { payload: { seen: false } });
  expect(mockHidePager).not.toHaveBeenCalled();
  ch!.emit('broadcast', { payload: { seen: true } });
  expect(mockHidePager).toHaveBeenCalledTimes(1);
});

it('بيجرٌ جديد يحلّ محلّ القديم: بثّ القديم لا يخفي الجديد', async () => {
  const U1 = '11111111-1111-4111-8111-111111111111';
  const U2 = '22222222-2222-4222-8222-222222222222';
  watchPagerOnDisplay(pagerUrl(U1), 0);
  const old = mockChannels.find(c => c.topic === `pager:${U1}`)!;
  watchPagerOnDisplay(pagerUrl(U2), 0);
  old.emit('broadcast', { payload: { seen: true } });
  expect(mockHidePager).not.toHaveBeenCalled();
  mockChannels.find(c => c.topic === `pager:${U2}`)!.emit('broadcast', { payload: { collected: true } });
  expect(mockHidePager).toHaveBeenCalledTimes(1);
});
