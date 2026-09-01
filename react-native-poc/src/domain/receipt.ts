/**
 * Checkpoint 10 (Print Queue) -- minimal ESC/POS byte builders for the
 * two job types the queue dispatches. Deliberately ASCII-only, no QR
 * code, no logo image: real Arabic-text rendering was already
 * identified as a separate, unsolved problem in Checkpoint 1's own
 * audit (docs/react-native-poc/phase1-audit.md -- no DOM/Canvas in RN,
 * a real port needs react-native-skia or equivalent). This checkpoint's
 * job is the QUEUE (persistence/retry/backoff/dedup/state machine), not
 * receipt rendering -- building a real Arabic/QR-capable renderer here
 * would be a second, much larger, unrequested feature. This mirrors the
 * PWA's own architecture though (store rendering DATA, render fresh
 * bytes at each dispatch attempt -- see domain/printQueue.ts's own doc
 * comment), so a real renderer can be swapped in later without
 * touching the queue at all -- only this file and its two functions'
 * bodies. App.tsx's existing buildTestReceiptBase64() is the same kind
 * of deliberate ASCII placeholder, for the same reason.
 *
 * Non-ASCII characters (any real product name) WILL print as garbage
 * bytes on a real ESC/POS printer using this builder -- that's expected
 * and disclosed, not a bug to fix here. Never claim receipt CONTENT
 * correctness against real hardware until a real renderer exists.
 */

export interface ReceiptLine {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  orderId: number | null;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethod: string;
}

export interface KitchenTicketData {
  orderId: number | null;
  tableNumber: number | null;
  lines: ReceiptLine[];
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

function textToBytes(bytes: number[], text: string): void {
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    bytes.push(code < 256 ? code : 0x3f); // '?' for anything outside ASCII, never crash on a real Arabic name
  }
  bytes.push(0x0a);
}

const ESC = 0x1b;
const GS = 0x1d;

export function buildReceiptEscPosBase64(data: ReceiptData): string {
  const bytes: number[] = [];
  bytes.push(ESC, 0x40); // init
  textToBytes(bytes, 'RAKEEN POS');
  textToBytes(bytes, data.orderId != null ? `Order #${data.orderId}` : 'Order (offline)');
  textToBytes(bytes, '------------------------');
  for (const line of data.lines) {
    textToBytes(bytes, `${line.qty} x ${line.name} - ${line.lineTotal.toFixed(2)}`);
  }
  textToBytes(bytes, '------------------------');
  textToBytes(bytes, `Subtotal: ${data.subtotal.toFixed(2)}`);
  if (data.discount > 0) textToBytes(bytes, `Discount: -${data.discount.toFixed(2)}`);
  textToBytes(bytes, `VAT: ${data.vat.toFixed(2)}`);
  textToBytes(bytes, `Total: ${data.total.toFixed(2)}`);
  textToBytes(bytes, `Paid via: ${data.paymentMethod}`);
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 0x00); // full cut
  return bytesToBase64(bytes);
}

export function buildKitchenTicketEscPosBase64(data: KitchenTicketData): string {
  const bytes: number[] = [];
  bytes.push(ESC, 0x40);
  textToBytes(bytes, 'KITCHEN TICKET');
  textToBytes(bytes, data.orderId != null ? `Order #${data.orderId}` : 'Order (offline)');
  if (data.tableNumber != null) textToBytes(bytes, `Table ${data.tableNumber}`);
  textToBytes(bytes, '------------------------');
  for (const line of data.lines) {
    textToBytes(bytes, `${line.qty} x ${line.name}`);
  }
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 0x00);
  return bytesToBase64(bytes);
}
