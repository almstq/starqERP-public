import { describe, expect, it } from 'vitest';
import { calculateGreenTax, GreenTaxRequest, GreenTaxValidationError } from './greenTax';

const request = (overrides: Partial<GreenTaxRequest> = {}): GreenTaxRequest => ({
  guestCategory: 'GENERAL',
  stays: [{ checkIn: '2026-03-01T14:00:00.000Z', checkOut: '2026-03-04T12:00:00.000Z' }], // 70h
  ...overrides,
});

describe('Maldives Green Tax', () => {
  it('exempts Maldivians, resident permit holders and children under two', () => {
    for (const guestCategory of ['MALDIVIAN', 'RESIDENT_PERMIT_HOLDER', 'CHILD_UNDER_TWO'] as const) {
      const result = calculateGreenTax(request({ guestCategory }));
      expect(result).toMatchObject({ status: 'EXEMPT', totalGreenTaxUsd: 0, excludedFromGstBase: true });
    }
  });

  it('charges USD 12 per completed 12-hour block for a standard establishment', () => {
    // 70 hours = 5 completed 12-hour blocks (60h), remaining 10h doesn't complete a 6th
    const result = calculateGreenTax(request());
    expect(result).toMatchObject({
      status: 'CHARGEABLE',
      chargeableTwelveHourBlocks: 5,
      ratePerBlockUsd: 12,
      totalGreenTaxUsd: 60,
      currency: 'USD',
      excludedFromGstBase: true,
    });
  });

  it('charges the reduced USD 6 rate for a qualifying small guesthouse', () => {
    const result = calculateGreenTax(request({ reducedRateSmallGuesthouse: true }));
    expect(result.ratePerBlockUsd).toBe(6);
    expect(result.totalGreenTaxUsd).toBe(30); // 5 blocks * 6
  });

  it('does not charge for a stay under twelve hours', () => {
    const result = calculateGreenTax(
      request({ stays: [{ checkIn: '2026-03-01T08:00:00.000Z', checkOut: '2026-03-01T15:00:00.000Z' }] }), // 7h
    );
    expect(result.status).toBe('EXEMPT');
    expect(result.chargeableTwelveHourBlocks).toBe(0);
    expect(result.totalGreenTaxUsd).toBe(0);
  });

  it('charges for exactly one completed 12-hour block, not a partial 13th hour', () => {
    const result = calculateGreenTax(
      request({ stays: [{ checkIn: '2026-03-01T00:00:00.000Z', checkOut: '2026-03-01T12:00:00.000Z' }] }), // exactly 12h
    );
    expect(result.chargeableTwelveHourBlocks).toBe(1);
    expect(result.totalGreenTaxUsd).toBe(12);
  });

  it('treats a checkout/checkin within twelve hours as one continuous stay', () => {
    // Two 6-hour segments 4 hours apart = 16 continuous hours -> merged into 1 block (12h), not zero
    const result = calculateGreenTax(
      request({
        stays: [
          { checkIn: '2026-03-01T00:00:00.000Z', checkOut: '2026-03-01T06:00:00.000Z' }, // 6h
          { checkIn: '2026-03-01T10:00:00.000Z', checkOut: '2026-03-01T16:00:00.000Z' }, // 6h, gap = 4h < 12h
        ],
      }),
    );
    expect(result.chargeableTwelveHourBlocks).toBe(1); // merged span = 16h -> 1 completed block
    expect(result.totalGreenTaxUsd).toBe(12);
  });

  it('does not merge stays separated by twelve hours or more', () => {
    const result = calculateGreenTax(
      request({
        stays: [
          { checkIn: '2026-03-01T00:00:00.000Z', checkOut: '2026-03-01T13:00:00.000Z' }, // 13h -> 1 block
          { checkIn: '2026-03-02T01:00:00.000Z', checkOut: '2026-03-02T14:00:00.000Z' }, // gap = 12h exactly, not merged; 13h -> 1 block
        ],
      }),
    );
    expect(result.chargeableTwelveHourBlocks).toBe(2);
    expect(result.totalGreenTaxUsd).toBe(24);
  });

  it('does not pool duration across two separate visits that each fall short of twelve hours', () => {
    // Two independent 7h visits, 20h apart (well over the 12h merge threshold).
    // Naively summing durations first (7+7=14h) would wrongly manufacture one
    // chargeable block; neither visit alone reaches twelve hours.
    const result = calculateGreenTax(
      request({
        stays: [
          { checkIn: '2026-03-01T00:00:00.000Z', checkOut: '2026-03-01T07:00:00.000Z' },
          { checkIn: '2026-03-02T03:00:00.000Z', checkOut: '2026-03-02T10:00:00.000Z' },
        ],
      }),
    );
    expect(result.chargeableTwelveHourBlocks).toBe(0);
    expect(result.status).toBe('EXEMPT');
  });

  it('rejects an empty stay list', () => {
    expect(() => calculateGreenTax(request({ stays: [] }))).toThrow(GreenTaxValidationError);
  });

  it('rejects a checkOut at or before checkIn', () => {
    expect(() =>
      calculateGreenTax(request({ stays: [{ checkIn: '2026-03-01T12:00:00.000Z', checkOut: '2026-03-01T12:00:00.000Z' }] })),
    ).toThrow(/after checkIn/);
  });

  it('rejects a malformed datetime', () => {
    expect(() =>
      calculateGreenTax(request({ stays: [{ checkIn: 'not-a-date', checkOut: '2026-03-01T12:00:00.000Z' }] })),
    ).toThrow(GreenTaxValidationError);
  });
});
