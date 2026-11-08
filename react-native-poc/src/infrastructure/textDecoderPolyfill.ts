/**
 * TextDecoder لمحرّك Hermes -- سبب «انقفل التطبيق لما مسح الزبون باركود
 * البيجر» (2026-11-08، مئة بالمئة على السنمي).
 *
 * Hermes في هذه النسخة فيه TextEncoder وليس فيه TextDecoder (فُحص في
 * libhermesvm.so نفسه: TextEncoder=6، TextDecoder=0). و realtime-js 2.112
 * يفكّ الرسائل الثنائية -- وهي بالضبط البثّ الصادر من القاعدة بـ
 * realtime.send (orders_pager_broadcast) -- بـ `new TextDecoder()`
 * (lib/serializer.js _binaryDecode). فأول رسالةٍ من القاعدة على قناةٍ
 * مشترَكٍ فيها = ReferenceError داخل onmessage حق الـ WebSocket = خطأ غير
 * ملتقَط = التطبيق ينقفل في نسخة الإنتاج.
 *
 * بثّ الخادم القديم (show_barcode من /api) يصل نصّاً JSON فلم يمرّ بهذا
 * المسار أبداً -- ولهذا ظهر العطل مع البيجر وحده.
 *
 * يُركَّب قبل أي شيء في index.js. لا يُستبدل لو المحرّك صار يوفّره.
 */

type Bytes = ArrayBuffer | ArrayBufferView | undefined | null;

function toU8(input: Bytes): Uint8Array {
  if (input == null) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input as ArrayBuffer);
}

/**
 * UTF-8 بخوارزمية WHATWG حرفياً (encoding.spec.whatwg.org «UTF-8 decoder»):
 * نفس ناتج TextDecoder في المتصفح حتى للبايتات المكسورة (عدد U+FFFD نفسه).
 */
export function decodeUtf8(input: Bytes): string {
  const b = toU8(input);
  let out = '';
  let chunk: number[] = [];
  const emit = (cp: number) => {
    if (cp > 0xffff) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
    else chunk.push(cp);
    if (chunk.length >= 8192) { out += String.fromCharCode.apply(null, chunk); chunk = []; }
  };
  let i = 0;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3; // BOM يُحذف (ignoreBOM=false)
  let cp = 0, needed = 0, seen = 0, lower = 0x80, upper = 0xbf;
  while (i < b.length) {
    const byte = b[i];
    if (needed === 0) {
      i++;
      if (byte <= 0x7f) emit(byte);
      else if (byte >= 0xc2 && byte <= 0xdf) { needed = 1; cp = byte & 0x1f; }
      else if (byte >= 0xe0 && byte <= 0xef) {
        if (byte === 0xe0) lower = 0xa0;
        if (byte === 0xed) upper = 0x9f;
        needed = 2; cp = byte & 0x0f;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        if (byte === 0xf0) lower = 0x90;
        if (byte === 0xf4) upper = 0x8f;
        needed = 3; cp = byte & 0x07;
      } else emit(0xfffd);
      continue;
    }
    if (byte < lower || byte > upper) {
      // تسلسلٌ انقطع: بديلٌ واحد، والبايت نفسه يُعاد فحصه من جديد (لا يُستهلك).
      cp = 0; needed = 0; seen = 0; lower = 0x80; upper = 0xbf;
      emit(0xfffd);
      continue;
    }
    i++;
    lower = 0x80; upper = 0xbf;
    cp = (cp << 6) | (byte & 0x3f);
    if (++seen === needed) { emit(cp); cp = 0; needed = 0; seen = 0; }
  }
  if (needed) emit(0xfffd);
  out += String.fromCharCode.apply(null, chunk);
  return out;
}

class Utf8TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal = false;
  readonly ignoreBOM = false;
  constructor(label: string = 'utf-8') {
    const l = String(label).trim().toLowerCase();
    if (l !== 'utf-8' && l !== 'utf8' && l !== 'unicode-1-1-utf-8') {
      throw new RangeError(`TextDecoder: only utf-8 is supported, got "${label}"`);
    }
  }
  decode(input?: Bytes): string {
    return decodeUtf8(input);
  }
}

export function installTextDecoder(): void {
  const g = globalThis as unknown as { TextDecoder?: unknown };
  if (typeof g.TextDecoder === 'function') return;
  g.TextDecoder = Utf8TextDecoder;
}

installTextDecoder();
