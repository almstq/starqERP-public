/**
 * SERP-310 — landed cost allocation.
 *
 * The two tests that decide whether this is real: nothing may be lost to
 * rounding, and recoverable import GST must never reach the stock value.
 */

import { describe, it, expect } from 'vitest';
import {
  allocateLandedCost,
  landedCostJournal,
  LandedCostError,
  type ShipmentLine,
  type LandedCharge,
} from './landedCost';

const line = (lineKey: string, quantity: number, unitCost: number, weight?: number): ShipmentLine =>
  ({ lineKey, quantity, unitCost, weight });

const charge = (label: string, amount: number, basis: LandedCharge['basis'], recoverable = false): LandedCharge =>
  ({ label, amount, basis, recoverable });

describe('the whole point: stock must carry what it actually cost to land', () => {
  it('freight, duty and handling raise the unit cost', () => {
    const r = allocateLandedCost({
      lines: [line('filters', 100, 100)],
      charges: [
        charge('Ocean freight', 6000, 'value'),
        charge('Customs duty', 2000, 'value'),
        charge('MACL handling', 1000, 'value'),
      ],
    });
    expect(r.lines[0].goodsValue).toBe(10000);
    expect(r.lines[0].landedValue).toBe(19000);
    expect(r.lines[0].landedUnitCost).toBe(190);
    // The supplier invoice said 100 a unit. Valuing at 100 would understate the
    // inventory by 47% and overstate gross profit on every sale out of it.
    expect(r.upliftRatio).toBe(0.9);
  });
});

describe('nothing may be lost to rounding', () => {
  it('an awkward three-way split still sums back to the charge exactly', () => {
    // 10,000 across three equal lines gives thirds that do not sum to 10,000 in
    // two-decimal currency. Unallocated freight is freight that has silently
    // become an expense.
    const r = allocateLandedCost({
      lines: [line('a', 1, 1000), line('b', 1, 1000), line('c', 1, 1000)],
      charges: [charge('Ocean freight', 10000, 'value')],
    });
    const total = r.lines.reduce((s, l) => s + l.allocatedCost, 0);
    expect(Math.round(total * 100) / 100).toBe(10000);
    expect(r.capitalised).toBe(10000);
  });

  it('the residue goes to the largest line, where it distorts least', () => {
    const r = allocateLandedCost({
      lines: [line('big', 1, 10000), line('small', 1, 1)],
      charges: [charge('Freight', 777.77, 'value')],
    });
    const total = r.lines.reduce((s, l) => s + l.allocatedCost, 0);
    expect(Math.round(total * 100) / 100).toBe(777.77);
    expect(r.lines[0].allocatedCost).toBeGreaterThan(r.lines[1].allocatedCost);
  });

  it('sums exactly across many lines and several charges', () => {
    const lines = Array.from({ length: 7 }, (_, i) => line(`l${i}`, i + 1, 33.33));
    const r = allocateLandedCost({
      lines,
      charges: [
        charge('Freight', 1234.56, 'value'),
        charge('Duty', 987.65, 'quantity'),
      ],
    });
    const total = r.lines.reduce((s, l) => s + l.allocatedCost, 0);
    expect(Math.round(total * 100) / 100).toBe(2222.21);
    expect(r.capitalised).toBe(2222.21);
  });
});

describe('recoverable import GST must never reach the stock value', () => {
  it('it is excluded from what is capitalised', () => {
    // Capitalising it overstates inventory AND forfeits a real input credit —
    // wrong in both directions at once.
    const r = allocateLandedCost({
      lines: [line('a', 100, 100)],
      charges: [
        charge('Ocean freight', 5000, 'value'),
        { label: 'Import GST', amount: 1200, basis: 'value', recoverable: true, accountCode: '1400' },
      ],
    });
    expect(r.capitalised).toBe(5000);
    expect(r.notCapitalised).toBe(1200);
    expect(r.lines[0].landedValue).toBe(15000);
  });

  it('customs duty is NOT recoverable and IS capitalised', () => {
    const r = allocateLandedCost({
      lines: [line('a', 10, 100)],
      charges: [charge('Customs duty', 300, 'value')],
    });
    expect(r.capitalised).toBe(300);
    expect(r.notCapitalised).toBe(0);
  });
});

describe('allocation bases', () => {
  it('by value gives the expensive line the larger share', () => {
    const r = allocateLandedCost({
      lines: [line('cheap', 10, 10), line('dear', 10, 90)],
      charges: [charge('Insurance', 1000, 'value')],
    });
    expect(r.lines[0].allocatedCost).toBe(100);
    expect(r.lines[1].allocatedCost).toBe(900);
  });

  it('by quantity ignores price — right for handling charged per carton', () => {
    const r = allocateLandedCost({
      lines: [line('cheap', 90, 1), line('dear', 10, 500)],
      charges: [charge('MACL handling', 1000, 'quantity')],
    });
    expect(r.lines[0].allocatedCost).toBe(900);
    expect(r.lines[1].allocatedCost).toBe(100);
  });

  it('by weight is right for ocean freight, where a heavy cheap item costs more to ship', () => {
    const r = allocateLandedCost({
      lines: [line('bolts', 1, 100, 800), line('gaskets', 1, 5000, 200)],
      charges: [charge('Ocean freight', 5000, 'weight')],
    });
    // The cheap heavy line carries most of the freight. Allocating this one by
    // value would have loaded it onto the light expensive item instead.
    expect(r.lines[0].allocatedCost).toBe(4000);
    expect(r.lines[1].allocatedCost).toBe(1000);
  });

  it('a weight basis with no weights REFUSES rather than guessing', () => {
    // Spreading it evenly and calling that a weight basis would be worse than
    // failing: the number would look computed.
    expect(() =>
      allocateLandedCost({
        lines: [line('a', 1, 100), line('b', 1, 100)],
        charges: [charge('Ocean freight', 500, 'weight')],
      }),
    ).toThrow(LandedCostError);
    try {
      allocateLandedCost({ lines: [line('a', 1, 100)], charges: [charge('Freight', 500, 'weight')] });
    } catch (e) {
      expect((e as LandedCostError).code).toBe('basis_unusable');
      expect((e as Error).message).toMatch(/allocated by weight/);
    }
  });
});

describe('refusals', () => {
  it('a shipment with no lines', () => {
    expect(() => allocateLandedCost({ lines: [], charges: [] })).toThrow(/nothing to allocate to/);
  });

  it('a negative charge', () => {
    expect(() =>
      allocateLandedCost({ lines: [line('a', 1, 1)], charges: [charge('Rebate', -50, 'value')] }),
    ).toThrow(LandedCostError);
  });

  it('a shipment with no charges leaves the supplier price untouched', () => {
    const r = allocateLandedCost({ lines: [line('a', 10, 100)], charges: [] });
    expect(r.lines[0].landedUnitCost).toBe(100);
    expect(r.upliftRatio).toBe(0);
  });
});

describe('the journal', () => {
  it('capitalised charges move into inventory out of goods-in-transit, and balance', () => {
    const result = allocateLandedCost({
      lines: [line('a', 10, 100)],
      charges: [charge('Ocean freight', 500, 'value')],
    });
    const lines = landedCostJournal({ result, charges: [charge('Ocean freight', 500, 'value')], reference: 'LC-1' });

    expect(lines[0]).toMatchObject({ accountCode: '1310', amount: 500 });
    expect(lines[1]).toMatchObject({ accountCode: '1320', amount: -500 });
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
  });

  it('recoverable GST goes to its own account, never to inventory', () => {
    const charges: LandedCharge[] = [
      charge('Ocean freight', 500, 'value'),
      { label: 'Import GST', amount: 120, basis: 'value', recoverable: true, accountCode: '1400' },
    ];
    const result = allocateLandedCost({ lines: [line('a', 10, 100)], charges });
    const lines = landedCostJournal({ result, charges, reference: 'LC-1' });

    const gst = lines.find((l) => l.accountCode === '1400')!;
    expect(gst.amount).toBe(120);
    const inventory = lines.filter((l) => l.accountCode === '1310');
    expect(inventory.reduce((s, l) => s + l.amount, 0)).toBe(500);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
  });

  it('a recoverable charge with no account REFUSES rather than defaulting', () => {
    // Defaulting silently to an account that may not exist on this tenant's
    // chart would post into thin air.
    const charges: LandedCharge[] = [{ label: 'Import GST', amount: 120, basis: 'value', recoverable: true }];
    const result = allocateLandedCost({ lines: [line('a', 1, 100)], charges });
    expect(() => landedCostJournal({ result, charges, reference: 'LC-1' })).toThrow(/needs an account/);
  });

  it('charges are cleared through goods-in-transit, not against the goods supplier', () => {
    // Freight and duty are invoiced by different parties at different times.
    // Posting them against the supplier would attribute a shipping agent's bill
    // to the parts supplier and make both payables wrong.
    const charges = [charge('Duty', 300, 'value')];
    const result = allocateLandedCost({ lines: [line('a', 1, 1000)], charges });
    const lines = landedCostJournal({ result, charges, reference: 'LC-2' });
    expect(lines.some((l) => l.accountCode === '1320' && l.amount === -300)).toBe(true);
  });
});
