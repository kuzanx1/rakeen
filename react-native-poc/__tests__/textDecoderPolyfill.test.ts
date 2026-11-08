/**
 * «مسح الزبون الباركود وانقفل التطبيق» -- Hermes بلا TextDecoder، و
 * realtime-js يفكّ بثّ القاعدة الثنائي به. هذا الاختبار يشغّل مسار
 * المكتبة الحقيقي (Serializer.decode) بلا TextDecoder كما في Hermes.
 */
import { decodeUtf8, installTextDecoder } from '../src/infrastructure/textDecoderPolyfill';

declare const require: (m: string) => any;
const NativeTD: any = (globalThis as any).TextDecoder;
const native = new NativeTD('utf-8');

/** رسالة «userBroadcast» ثنائية بنفس شكل الخادم (serializer.js _decodeUserBroadcast). */
function frame(topic: string, event: string, payload: object): ArrayBuffer {
  const enc = new (globalThis as any).TextEncoder();
  const t = enc.encode(topic), e = enc.encode(event), p = enc.encode(JSON.stringify(payload));
  const head = [4, t.length, e.length, 0, 1]; // kind=userBroadcast, sizes, meta=0, encoding=JSON
  const out = new Uint8Array(head.length + t.length + e.length + p.length);
  out.set(head, 0); out.set(t, 5); out.set(e, 5 + t.length); out.set(p, 5 + t.length + e.length);
  return out.buffer;
}

describe('without TextDecoder (Hermes)', () => {
  const { default: Serializer } = require('@supabase/realtime-js/dist/main/lib/serializer');
  afterEach(() => { (globalThis as any).TextDecoder = NativeTD; });

  it('the library itself throws — this is the crash', () => {
    delete (globalThis as any).TextDecoder;
    const s = new Serializer();
    expect(() => s.decode(frame('realtime:pager:x', 'pager', { seen: true }), () => {})).toThrow(/TextDecoder/);
  });

  it('with the polyfill the pager broadcast decodes exactly', () => {
    delete (globalThis as any).TextDecoder;
    installTextDecoder();
    const s = new Serializer();
    let msg: any;
    const payload = { seen: true, ready: false, collected: false, ring_count: 2, note: 'طلبك جاهز ✓ 🔔' };
    s.decode(frame('realtime:pager:9d66c6c4-899f-4b4a-b94a-a1d23717deac', 'pager', payload), (m: any) => { msg = m; });
    expect(msg.topic).toBe('realtime:pager:9d66c6c4-899f-4b4a-b94a-a1d23717deac');
    expect(msg.payload.event).toBe('pager');
    expect(msg.payload.payload).toEqual(payload);
  });
});

describe('decodeUtf8 matches the platform TextDecoder', () => {
  it.each([
    ['ascii', 'hello'], ['arabic', 'مكبوس زربيان — طلب #53925'], ['emoji', '🔔📱✓'],
    ['mixed', 'Total ٧٢٫٠٠ ⃁ 🇸🇦'], ['empty', ''],
  ])('%s', (_n, s) => {
    const b = new (globalThis as any).TextEncoder().encode(s);
    expect(decodeUtf8(b)).toBe(s);
    expect(decodeUtf8(b.buffer)).toBe(s);
  });

  it('20000 random byte strings (incl. broken UTF-8) decode identically', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 20000; n++) {
      const len = Math.floor(rnd() * 24);
      const b = new Uint8Array(len);
      for (let i = 0; i < len; i++) b[i] = Math.floor(rnd() * 256);
      expect(decodeUtf8(b)).toBe(native.decode(b));
    }
  });

  it('a long payload (chunking) decodes identically', () => {
    const s = 'طلب ✓ 🔔 '.repeat(5000);
    const b = new (globalThis as any).TextEncoder().encode(s);
    expect(decodeUtf8(b)).toBe(s);
  });
});
