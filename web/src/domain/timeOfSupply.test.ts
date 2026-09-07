import { describe, expect, it } from 'vitest';
import {
  resolveTimeOfSupply,
  TimeOfSupplyRequest,
  TimeOfSupplyUnresolved,
  TimeOfSupplyValidationError,
} from './timeOfSupply';

const request = (overrides: Partial<TimeOfSupplyRequest> = {}): TimeOfSupplyRequest => ({
  supplyEventType: 'GOODS_DELIVERY',
  supplyEventDate: '2026-03-01',
  ...overrides,
});

describe('Maldives GST time of supply', () => {
  it('uses the invoice date when the invoice is issued before payment', () => {
    const result = resolveTimeOfSupply(
      request({ documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-03-02' }] }),
    );
    expect(result.timeOfSupply).toBe('2026-03-02');
    expect(result.basis).toBe('DOCUMENT');
    expect(result.triggeringDocumentType).toBe('TAX_INVOICE');
  });

  it('uses the payment date when payment precedes any document', () => {
    const result = resolveTimeOfSupply(
      request({
        documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-03-03' }],
        paymentDates: ['2026-02-20'],
      }),
    );
    expect(result.timeOfSupply).toBe('2026-02-20');
    expect(result.basis).toBe('PAYMENT');
  });

  it('treats a plain payment date string as a full settlement, for backward compatibility', () => {
    const result = resolveTimeOfSupply(request({ paymentDates: ['2026-02-20'] }));
    expect(result.basis).toBe('PAYMENT');
    expect(result.timeOfSupply).toBe('2026-02-20');
  });

  it('accepts an explicit full-settlement payment object the same way as a plain string', () => {
    const result = resolveTimeOfSupply(
      request({ paymentDates: [{ date: '2026-02-20', isFullSettlement: true }] }),
    );
    expect(result.timeOfSupply).toBe('2026-02-20');
  });

  it('refuses to date the whole supply off a partial payment (MIRA Reg 15(a))', () => {
    // A partial payment triggers a supply only for the amount received, not
    // the whole transaction - this function returns one date for the FULL
    // supply, so it must not silently misdate it off an advance.
    expect(() =>
      resolveTimeOfSupply(
        request({ paymentDates: [{ date: '2026-02-20', isFullSettlement: false }] }),
      ),
    ).toThrow(TimeOfSupplyUnresolved);
    expect(() =>
      resolveTimeOfSupply(
        request({ paymentDates: [{ date: '2026-02-20', isFullSettlement: false }] }),
      ),
    ).toThrow(/partial payment/i);
  });

  it('does not throw on a partial payment that is not the earliest candidate anyway', () => {
    // The full-settlement invoice is earlier, so the later partial payment
    // never has to be selected - no ambiguity to refuse.
    const result = resolveTimeOfSupply(
      request({
        documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-03-02' }],
        paymentDates: [{ date: '2026-03-03', isFullSettlement: false }],
      }),
    );
    expect(result.timeOfSupply).toBe('2026-03-02');
    expect(result.basis).toBe('DOCUMENT');
  });

  it('treats a receipt to an unregistered recipient as a first-class time-of-supply document', () => {
    const result = resolveTimeOfSupply(
      request({ documents: [{ type: 'RECEIPT', issuedDate: '2026-03-01' }] }),
    );
    expect(result.basis).toBe('DOCUMENT');
    expect(result.triggeringDocumentType).toBe('RECEIPT');
  });

  it('treats a credit note issue date as a time-of-supply event in its own right', () => {
    const result = resolveTimeOfSupply(
      request({ documents: [{ type: 'CREDIT_NOTE', issuedDate: '2026-03-02' }] }),
    );
    expect(result.triggeringDocumentType).toBe('CREDIT_NOTE');
  });

  it('reproduces the study\'s worked example: a late invoice raised the next month must not move the deemed supply into that later taxable period', () => {
    // Delivery on 28 Jan; the 3-day deemed window closes on 31 Jan - still
    // January. The invoice, raised late on 4 Feb, falls in February. Using
    // the invoice date instead of the deemed date would misstate the return
    // by one whole taxable period (January vs February), which is exactly
    // the defect the study's worked example warns against. (An earlier draft
    // of this test used 29 Jan, where 29+3=1 Feb - already in the SAME month
    // as the invoice, so it failed to actually demonstrate a period
    // difference. Caught in independent review - see PR #83.)
    const result = resolveTimeOfSupply(
      request({
        supplyEventDate: '2026-01-28',
        documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-02-04' }],
      }),
    );
    expect(result.basis).toBe('DEEMED_THIRD_DAY');
    expect(result.timeOfSupply).toBe('2026-01-31'); // 28th + 3 days = 31st, still January
    expect(result.timeOfSupply.slice(0, 7)).toBe('2026-01'); // January - the EARLIER period
    expect(result.timeOfSupply).not.toBe('2026-02-04'); // not February, where the late invoice falls
  });

  it('deems the third day for a service completed with no document issued within the window', () => {
    const result = resolveTimeOfSupply(request({ supplyEventType: 'SERVICE_COMPLETION', supplyEventDate: '2026-06-10' }));
    expect(result.basis).toBe('DEEMED_THIRD_DAY');
    expect(result.timeOfSupply).toBe('2026-06-13');
  });

  it('uses the document date, not the deemed date, when a document is issued exactly on the third day', () => {
    const result = resolveTimeOfSupply(
      request({ documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-03-04' }] }), // event 03-01 + 3d = 03-04
    );
    expect(result.basis).toBe('DOCUMENT');
    expect(result.timeOfSupply).toBe('2026-03-04');
  });

  it('does not let a late document retroactively move a deemed third-day supply', () => {
    const result = resolveTimeOfSupply(
      request({ documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-03-10' }] }), // way after day 3
    );
    expect(result.basis).toBe('DEEMED_THIRD_DAY');
    expect(result.timeOfSupply).toBe('2026-03-04');
  });

  it('resolves consideration-in-kind as the earlier of invoice preparation or consideration provided', () => {
    const result = resolveTimeOfSupply({
      supplyEventType: 'CONSIDERATION_IN_KIND',
      documents: [{ type: 'TAX_INVOICE', issuedDate: '2026-05-10' }],
      paymentDates: ['2026-05-05'],
    });
    expect(result.timeOfSupply).toBe('2026-05-05');
    expect(result.basis).toBe('CONSIDERATION_IN_KIND');
  });

  it('rejects consideration-in-kind with neither an invoice nor a payment date', () => {
    expect(() => resolveTimeOfSupply({ supplyEventType: 'CONSIDERATION_IN_KIND' })).toThrow(TimeOfSupplyUnresolved);
  });

  it('resolves a granted right to use immovable property as the earlier of acquisition or use', () => {
    const result = resolveTimeOfSupply({
      supplyEventType: 'RIGHT_TO_USE_IMMOVABLE_PROPERTY',
      rightAcquiredDate: '2026-04-01',
      useBeganDate: '2026-03-20',
    });
    expect(result.timeOfSupply).toBe('2026-03-20');
    expect(result.basis).toBe('RIGHT_TO_USE');
  });

  it('rejects a right-to-use request missing either date', () => {
    expect(() =>
      resolveTimeOfSupply({ supplyEventType: 'RIGHT_TO_USE_IMMOVABLE_PROPERTY', rightAcquiredDate: '2026-04-01' }),
    ).toThrow(TimeOfSupplyValidationError);
  });

  it('refuses to guess a time of supply for advances, deposits or instalments', () => {
    expect(() => resolveTimeOfSupply({ supplyEventType: 'ADVANCE_DEPOSIT_OR_INSTALMENT' })).toThrow(
      TimeOfSupplyUnresolved,
    );
  });

  it('requires supplyEventDate for GOODS_DELIVERY / SERVICE_COMPLETION', () => {
    expect(() => resolveTimeOfSupply({ supplyEventType: 'GOODS_DELIVERY' })).toThrow(TimeOfSupplyValidationError);
  });

  it('rejects a malformed date anywhere in the request', () => {
    expect(() => resolveTimeOfSupply(request({ supplyEventDate: 'not-a-date' }))).toThrow(TimeOfSupplyValidationError);
    expect(() =>
      resolveTimeOfSupply(request({ documents: [{ type: 'TAX_INVOICE', issuedDate: 'bad' }] })),
    ).toThrow(TimeOfSupplyValidationError);
  });

  it('picks the earliest of several candidate documents and payments within the window', () => {
    const result = resolveTimeOfSupply(
      request({
        documents: [
          { type: 'TAX_INVOICE', issuedDate: '2026-03-03' },
          { type: 'DEBIT_NOTE', issuedDate: '2026-03-02' },
        ],
        paymentDates: ['2026-03-04'],
      }),
    );
    expect(result.timeOfSupply).toBe('2026-03-02');
    expect(result.triggeringDocumentType).toBe('DEBIT_NOTE');
  });
});
