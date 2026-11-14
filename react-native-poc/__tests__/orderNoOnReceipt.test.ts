import { toKitchenTicketPrintable, toReceiptPrintable } from '../src/domain/receiptPrintable';
import type { KitchenTicketData, ReceiptData } from '../src/domain/receipt';

// رقم الطلب في المنشأة (order_no) هو اللي ينطبع؛ بدونه يبقى الرقم الداخلي كما كان.
const base = { lines: [], subtotal: 10, vat: 0, total: 10, createdAtISO: '2026-11-14T10:00:00Z' };

describe('order number on printed tickets', () => {
  it('receipt prints the business number when known', () => {
    expect(toReceiptPrintable({ ...base, orderId: 90412, orderNo: 7 } as unknown as ReceiptData).orderNumber).toBe('#7');
  });
  it('receipt falls back to the internal id', () => {
    expect(toReceiptPrintable({ ...base, orderId: 90412 } as unknown as ReceiptData).orderNumber).toBe('#90412');
  });
  it('kitchen ticket prints the business number when known', () => {
    expect(toKitchenTicketPrintable({ ...base, orderId: 90412, orderNo: 7 } as unknown as KitchenTicketData).orderNumber).toBe('#7');
  });
});
