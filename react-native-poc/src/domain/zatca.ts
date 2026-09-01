/**
 * Feature Parity Pass -- Real Receipt Rendering. Ported VERBATIM from the
 * real PWA's zatcaQrBase64() (public/pos/rakeen-pos.js) -- a ZATCA Phase 1
 * Simplified Tax Invoice QR: base64 of 5 mandatory TLV fields (tag=1 byte,
 * length=1 byte, UTF-8 value). Same field order, same tag numbers, same
 * encoding -- this is a compliance format, not something to reinterpret.
 * Deliberately does NOT depend on the PWA's server-side /api/qr route:
 * RN generates the QR entirely client-side (this TLV payload + a local
 * bit-matrix encoder, see domain/qrMatrix.ts) so a receipt can print
 * with Internet OFF, consistent with the offline-first requirement --
 * the PWA's own server round-trip would violate that for RN specifically.
 */

function tlv(tag: number, value: string): number[] {
  const valueBytes = utf8Bytes(value);
  return [tag, valueBytes.length, ...valueBytes];
}

function utf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!;
    if (code > 0xffff) i++; // surrogate pair consumed two UTF-16 units
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function bytesToBase64(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result += b1 !== undefined ? chars[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '=';
    result += b2 !== undefined ? chars[b2 & 63] : '=';
  }
  return result;
}

/**
 * Tag 1 = seller name, Tag 2 = VAT registration number, Tag 3 = invoice
 * timestamp (ISO string), Tag 4 = total incl. VAT (2dp string), Tag 5 =
 * VAT amount (2dp string) -- exact same 5 fields, exact same order, as
 * the PWA's real implementation.
 */
export function zatcaQrBase64(
  sellerName: string,
  vatNumber: string,
  timestampISO: string,
  totalWithVat: number,
  vatAmount: number,
): string {
  const fields = [
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, timestampISO),
    tlv(4, totalWithVat.toFixed(2)),
    tlv(5, vatAmount.toFixed(2)),
  ];
  return bytesToBase64(fields.flat());
}
