/**
 * SERP-311 — three-way matching.
 *
 * The cases that matter are the ASYMMETRIES. A control that treats over-billing
 * and under-billing the same way is not a control, it is a diff.
 */

import { describe, it, expect } from 'vitest';
import {
  threeWayMatch,
  receiptStatus,
  DEFAULT_TOLERANCE,
  type OrderedLine,
  type ReceivedLine,
  type BilledLine,
} from './threeWayMatch';

const ord = (lineKey: string, quantity: number, unitCost: number): OrderedLine =>
  ({ lineKey, quantity, unitCost });
const rec = (lineKey: string, quantity: number): ReceivedLine => ({ lineKey, quantity });
const bil = (lineKey: string, quantity: number, unitCost: number): BilledLine =>
  ({ lineKey, quantity, unitCost });

const codes = (r: ReturnType<typeof threeWayMatch>) => r.exceptions.map((e) => e.code).sort();

describe('the clean case', () => {
  it('order, receipt and bill agreeing is matched with nothing to report', () => {
    const r = threeWayMatch({
      ordered: [ord('paint-white', 10, 450), ord('thinner', 4, 120)],
      received: [rec('paint-white', 10), rec('thinner', 4)],
      billed: [bil('paint-white', 10, 450), bil('thinner', 4, 120)],
    });
    expect(r.verdict).toBe('matched');
    expect(r.exceptions).toEqual([]);
    expect(r.totals).toEqual({ ordered: 4980, received: 4980, billed: 4980 });
    expect(r.netVariance).toBe(0);
  });
});

describe('over-billing is blocked — the failure this control exists for', () => {
  it('billed for more than arrived', () => {
    const r = threeWayMatch({
      ordered: [ord('paint-white', 10, 450)],
      received: [rec('paint-white', 6)],
      billed: [bil('paint-white', 10, 450)],
    });
    expect(r.verdict).toBe('blocked');
    const ex = r.exceptions.find((e) => e.code === 'billed_more_than_received')!;
    expect(ex.severity).toBe('blocked');
    expect(ex.variance).toBe(1800); // 4 units never delivered, at 450
  });

  it('no tolerance makes paying for absent goods acceptable', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 100, 10)],
      received: [rec('a', 99)],
      billed: [bil('a', 100, 10)],
      tolerance: { pricePercent: 0.5, priceAbsolute: 1000, overReceiptPercent: 0.5 },
    });
    // A generous PRICE tolerance must not become a QUANTITY tolerance.
    expect(r.verdict).toBe('blocked');
    expect(codes(r)).toContain('billed_more_than_received');
  });

  it('a bill for an item on no purchase order is blocked separately', () => {
    // Not a short delivery — a line nobody authorised. This is how padding
    // enters an invoice, and the remedy is different.
    const r = threeWayMatch({
      ordered: [ord('a', 5, 100)],
      received: [rec('a', 5), rec('mystery-fee', 1)],
      billed: [bil('a', 5, 100), bil('mystery-fee', 1, 2500)],
    });
    expect(r.verdict).toBe('blocked');
    expect(codes(r)).toContain('billed_item_not_ordered');
  });

  it('a bill with no goods receipt at all is called out once at the header', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 5, 100), ord('b', 5, 100)],
      received: [],
      billed: [bil('a', 5, 100), bil('b', 5, 100)],
    });
    expect(r.verdict).toBe('blocked');
    expect(r.exceptions[0].code).toBe('nothing_received');
    expect(r.exceptions[0].variance).toBe(1000);
  });
});

describe('under-billing is allowed — blocking it would be absurd', () => {
  it('a supplier billing less than they delivered is reported, not refused', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 450)],
      received: [rec('a', 10)],
      billed: [bil('a', 8, 450)],
    });
    expect(r.verdict).toBe('review');
    expect(codes(r)).toEqual(['under_billed']);
    expect(r.exceptions[0].severity).toBe('review');
  });

  it('a price BELOW the agreed one is not an exception at all', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 450)],
      received: [rec('a', 10)],
      billed: [bil('a', 10, 400)],
    });
    expect(r.verdict).toBe('matched');
    expect(r.exceptions).toEqual([]);
  });
});

describe('over-receipt warns but never blocks', () => {
  it('the goods are on the floor — refusing to record them makes stock wrong', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 450)],
      received: [rec('a', 12)],
      billed: [bil('a', 12, 450)],
    });
    // Billed 12, received 12 — nothing is being paid for that did not arrive.
    expect(r.verdict).toBe('review');
    const ex = r.exceptions.find((e) => e.code === 'over_receipt')!;
    expect(ex.severity).toBe('review');
    expect(ex.variance).toBe(900);
  });

  it('an over-receipt tolerance suppresses the noise it was set for', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 100, 10)],
      received: [rec('a', 103)],
      billed: [bil('a', 103, 10)],
      tolerance: { ...DEFAULT_TOLERANCE, overReceiptPercent: 0.05 },
    });
    expect(r.verdict).toBe('matched');
  });
});

describe('price variance', () => {
  it('above the agreed price is blocked', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 450)],
      received: [rec('a', 10)],
      billed: [bil('a', 10, 500)],
    });
    expect(r.verdict).toBe('blocked');
    const ex = r.exceptions.find((e) => e.code === 'price_above_order')!;
    expect(ex.variance).toBe(500); // 50 per unit over ten units
  });

  it('the default tolerance is ZERO — a tolerance is the business’s decision', () => {
    expect(DEFAULT_TOLERANCE).toEqual({ pricePercent: 0, priceAbsolute: 0, overReceiptPercent: 0 });
    const r = threeWayMatch({
      ordered: [ord('a', 1, 100)],
      received: [rec('a', 1)],
      billed: [bil('a', 1, 100.01)],
    });
    expect(r.verdict).toBe('blocked');
  });

  it('a percentage tolerance is applied against the ORDER price', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 100)],
      received: [rec('a', 10)],
      billed: [bil('a', 10, 102)],
      tolerance: { ...DEFAULT_TOLERANCE, pricePercent: 0.02 },
    });
    expect(r.verdict).toBe('matched');
  });

  it('an absolute tolerance covers rounding on small values', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 3)],
      received: [rec('a', 10)],
      billed: [bil('a', 10, 3.5)],
      tolerance: { ...DEFAULT_TOLERANCE, priceAbsolute: 0.5 },
    });
    expect(r.verdict).toBe('matched');
  });
});

describe('the details that decide whether this is a real control', () => {
  it('receipts are valued at ORDER price, not at the price being charged', () => {
    // Valuing what arrived at the price being billed for it would make every
    // overcharge self-justifying: the comparison would agree with itself.
    const r = threeWayMatch({
      ordered: [ord('a', 10, 100)],
      received: [rec('a', 10)],
      billed: [bil('a', 10, 150)],
    });
    expect(r.totals.received).toBe(1000);
    expect(r.totals.billed).toBe(1500);
    expect(r.netVariance).toBe(500);
  });

  it('repeated lines across two delivery notes are SUMMED, not overwritten', () => {
    // Taking the last would silently discard half a delivery.
    const r = threeWayMatch({
      ordered: [ord('a', 10, 100)],
      received: [rec('a', 4), rec('a', 6)],
      billed: [bil('a', 10, 100)],
    });
    expect(r.verdict).toBe('matched');
    expect(r.totals.received).toBe(1000);
  });

  it('every exception is returned, not just the first', () => {
    // A reviewer needs the whole picture in one pass; stopping at the first
    // variance means three round trips with the supplier where one would do.
    const r = threeWayMatch({
      ordered: [ord('a', 10, 100), ord('b', 5, 50)],
      received: [rec('a', 8), rec('c', 2)],
      billed: [bil('a', 10, 120), bil('c', 2, 90)],
    });
    expect(r.exceptions.length).toBeGreaterThan(3);
    expect(codes(r)).toEqual(expect.arrayContaining([
      'billed_more_than_received', 'price_above_order', 'short_receipt',
      'billed_item_not_ordered', 'received_item_not_ordered',
    ]));
  });

  it('a blocked line makes the whole bill blocked, whatever else is clean', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 100), ord('b', 10, 100)],
      received: [rec('a', 10), rec('b', 1)],
      billed: [bil('a', 10, 100), bil('b', 10, 100)],
    });
    expect(r.verdict).toBe('blocked');
  });

  it('an empty bill against a delivered order reports, and does not crash', () => {
    const r = threeWayMatch({
      ordered: [ord('a', 10, 100)],
      received: [rec('a', 10)],
      billed: [],
    });
    expect(r.verdict).toBe('review');
    expect(codes(r)).toEqual(['under_billed']);
  });
});

describe('receiptStatus — a half-delivered order must not look complete', () => {
  it('nothing received', () => {
    expect(receiptStatus([ord('a', 10, 100)], [])).toBe('Sent');
    expect(receiptStatus([ord('a', 10, 100)], [rec('a', 0)])).toBe('Sent');
  });

  it('partially received', () => {
    // `receivePurchaseOrder` set EVERY order to 'Received & Stocked' whatever
    // arrived, so this state could not be represented and nobody could tell
    // what was still outstanding from a supplier.
    expect(receiptStatus([ord('a', 10, 100), ord('b', 5, 50)], [rec('a', 10)]))
      .toBe('Partially Received');
    expect(receiptStatus([ord('a', 10, 100)], [rec('a', 9)])).toBe('Partially Received');
  });

  it('fully received, including over-delivery', () => {
    expect(receiptStatus([ord('a', 10, 100)], [rec('a', 10)])).toBe('Received & Stocked');
    expect(receiptStatus([ord('a', 10, 100)], [rec('a', 11)])).toBe('Received & Stocked');
  });
});
