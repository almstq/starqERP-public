/**
 * SERP-309 — perpetual inventory valuation.
 *
 * The first test is the defect. `receiveStock` REPLACED the unit cost of
 * everything on hand with the price of the latest delivery, so a small
 * expensive top-up revalued the entire bin. Every individual number involved
 * was correct, which is why nothing reported it.
 */

import { describe, it, expect } from 'vitest';
import {
  applyMovement,
  replay,
  journalFor,
  EMPTY,
  VALUATION_ACCOUNTS,
  InventoryValuationError,
  type ValuationState,
} from './inventoryValuation';

const state = (quantityOnHand: number, averageCost: number): ValuationState => ({
  quantityOnHand,
  averageCost,
  value: Math.round(quantityOnHand * averageCost * 100) / 100,
});

describe('the defect this replaces', () => {
  it('a small expensive top-up does NOT revalue the whole bin', () => {
    // 100 filters at MVR 10, then 10 more at MVR 50 because the cheap supplier
    // was out. The old code carried all 110 at 50 — a MVR 4,000 jump in the
    // inventory asset on a purchase that cost 500.
    const after = applyMovement(state(100, 10), { quantity: 10, kind: 'receipt', unitCost: 50 }).state;

    expect(after.quantityOnHand).toBe(110);
    expect(after.value).toBe(1500); // 1000 + 500, and not a rufiyaa more
    expect(after.averageCost).toBeCloseTo(13.64, 2);
    expect(after.averageCost, 'the latest price must not become THE price').not.toBe(50);
  });

  it('and the error does not then run into cost of sales', () => {
    const afterReceipt = applyMovement(state(100, 10), { quantity: 10, kind: 'receipt', unitCost: 50 }).state;
    const issue = applyMovement(afterReceipt, { quantity: 10, kind: 'issue' });
    // Under the old behaviour this issue would have charged out 500.
    expect(issue.costRecognised).toBeCloseTo(136.4, 1);
  });
});

describe('the invariant: the average moves only when stock arrives at a cost', () => {
  it('issuing does not change the average', () => {
    const after = applyMovement(state(100, 12.5), { quantity: 40, kind: 'issue' });
    expect(after.state.averageCost).toBe(12.5);
    expect(after.state.quantityOnHand).toBe(60);
    expect(after.costRecognised).toBe(500);
  });

  it('waste does not change the average', () => {
    const after = applyMovement(state(100, 12.5), { quantity: 4, kind: 'waste' });
    expect(after.state.averageCost).toBe(12.5);
  });

  it('a positive adjustment takes stock in at the CURRENT average', () => {
    // There is no purchase behind found stock, so there is no new price to
    // learn — and letting a stocktake set a cost would be a way to revalue
    // inventory upward without buying anything.
    const after = applyMovement(state(100, 10), { quantity: 5, kind: 'adjustment', signedQuantity: 5 });
    expect(after.state.averageCost).toBe(10);
    expect(after.state.value).toBe(1050);
    expect(after.costRecognised).toBe(-50); // a credit to cost
  });
});

describe('the average is recomputed from value and quantity', () => {
  it('never by blending two averages', () => {
    // Blending weights each delivery equally regardless of size: (10+50)/2 = 30
    // rather than the correct 13.64. A different, and wrong, number.
    const after = applyMovement(state(100, 10), { quantity: 10, kind: 'receipt', unitCost: 50 }).state;
    expect(after.averageCost).not.toBe(30);
  });

  it('holds across a long alternating history', () => {
    const { state: end } = replay([
      { quantity: 100, kind: 'receipt', unitCost: 10 },
      { quantity: 50, kind: 'issue' },
      { quantity: 100, kind: 'receipt', unitCost: 20 },
      { quantity: 50, kind: 'issue' },
    ]);
    // 50 @ 10 = 500, + 100 @ 20 = 2000 -> 150 units / 2500 -> 16.67
    expect(end.quantityOnHand).toBe(100);
    expect(end.averageCost).toBeCloseTo(16.67, 2);
    expect(end.value).toBeCloseTo(1666.5, 0);
  });

  it('an emptied bin carries no residual value or cost', () => {
    const { state: end } = replay([
      { quantity: 3, kind: 'receipt', unitCost: 10 },
      { quantity: 3, kind: 'issue' },
    ]);
    // Accumulated rounding must not leave value behind on an empty bin.
    expect(end.quantityOnHand).toBe(0);
    expect(end.value).toBe(0);
    expect(end.averageCost).toBe(0);
  });
});

describe('impossible movements throw rather than being absorbed', () => {
  it('issuing more than is on hand', () => {
    // Negative stock makes the average meaningless: a negative value over a
    // negative quantity gives a positive cost that means nothing, and every
    // subsequent number inherits it.
    expect(() => applyMovement(state(5, 10), { quantity: 6, kind: 'issue' }))
      .toThrow(InventoryValuationError);
    try {
      applyMovement(state(5, 10), { quantity: 6, kind: 'issue' });
    } catch (e) {
      expect((e as InventoryValuationError).code).toBe('negative_stock');
    }
  });

  it('a receipt with no unit cost', () => {
    // Receiving without a cost is what forces a system to invent one, and
    // inventing one is the defect this module exists to replace.
    expect(() => applyMovement(EMPTY, { quantity: 10, kind: 'receipt' }))
      .toThrow(/cannot be valued from a quantity alone/);
  });

  it('a zero-quantity movement', () => {
    expect(() => applyMovement(EMPTY, { quantity: 0, kind: 'receipt', unitCost: 5 })).toThrow();
    expect(() => applyMovement(state(5, 1), { quantity: 0, kind: 'issue' })).toThrow();
    expect(() => applyMovement(state(5, 1), { quantity: 0, kind: 'adjustment', signedQuantity: 0 })).toThrow();
  });

  it('writing off more than is on hand', () => {
    expect(() => applyMovement(state(2, 10), { quantity: 3, kind: 'adjustment', signedQuantity: -3 }))
      .toThrow(InventoryValuationError);
  });
});

describe('where the cost is charged', () => {
  it('an issue goes to cost of sales', () => {
    const e = applyMovement(state(10, 10), { quantity: 1, kind: 'issue' });
    expect(e.expenseAccount).toBe(VALUATION_ACCOUNTS.cogs);
  });

  it('waste goes to scrap, NOT to cost of sales', () => {
    // Mixing them makes a wasteful month look like a busy one, which is the
    // opposite of what the reader needs.
    const e = applyMovement(state(10, 10), { quantity: 1, kind: 'waste' });
    expect(e.expenseAccount).toBe(VALUATION_ACCOUNTS.scrap);
    expect(e.expenseAccount).not.toBe(VALUATION_ACCOUNTS.cogs);
  });

  it('a receipt charges nothing anywhere', () => {
    const e = applyMovement(EMPTY, { quantity: 10, kind: 'receipt', unitCost: 5 });
    expect(e.costRecognised).toBe(0);
    expect(e.expenseAccount).toBeNull();
  });
});

describe('the journal it implies', () => {
  it('an issue debits cost of sales and credits inventory, and balances', () => {
    const e = applyMovement(state(100, 12.5), { quantity: 40, kind: 'issue' });
    const lines = journalFor(e, 'JOB-1');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: VALUATION_ACCOUNTS.cogs, amount: 500 });
    expect(lines[1]).toMatchObject({ accountCode: VALUATION_ACCOUNTS.inventory, amount: -500 });
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
  });

  it('a receipt posts NOTHING — the supplier bill does that', () => {
    // Posting the receipt as well would record the purchase twice.
    const e = applyMovement(EMPTY, { quantity: 10, kind: 'receipt', unitCost: 5 });
    expect(journalFor(e, 'GRN-1')).toEqual([]);
  });

  it('waste debits scrap, not cost of sales', () => {
    const e = applyMovement(state(100, 10), { quantity: 3, kind: 'waste' });
    expect(journalFor(e, 'WASTE-1')[0].accountCode).toBe(VALUATION_ACCOUNTS.scrap);
  });

  it('found stock reverses the entry rather than posting a second one', () => {
    const e = applyMovement(state(100, 10), { quantity: 5, kind: 'adjustment', signedQuantity: 5 });
    const lines = journalFor(e, 'COUNT-1');
    expect(lines[0].amount).toBe(-50); // credit to cost
    expect(lines[1].amount).toBe(50);  // debit to inventory
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
  });
});
