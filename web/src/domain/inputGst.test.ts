import { describe, expect, it } from 'vitest';
import { classifyInputGst, InputGstInvalid, InputGstRequest } from './inputGst';

const request = (overrides: Partial<InputGstRequest> = {}): InputGstRequest => ({
  gstAmount: 800,
  purchaseDate: '2026-01-15',
  claimDate: '2026-02-28',
  gstRegistered: true,
  validTaxInvoice: true,
  purchaseUse: 'taxable',
  costDestination: 'inventory',
  ...overrides,
});

describe('input GST recoverability', () => {
  it('routes eligible input GST to account 1410 and keeps it out of cost', () => {
    expect(classifyInputGst(request())).toMatchObject({
      status: 'RECOVERABLE', recoverableAmount: 800, nonRecoverableAmount: 0,
      recoverableAccount: '1410', costTreatment: 'NONE',
    });
  });

  it.each([
    [{ gstRegistered: false }, 'Purchaser is not GST registered.'],
    [{ validTaxInvoice: false }, 'A valid tax invoice is required'],
    [{ purchaseUse: 'exempt' as const }, 'exempt supplies'],
    [{ purchaseUse: 'private' as const }, 'Private use'],
  ])('blocks an ineligible claim and capitalises inventory GST: %o', (change, reason) => {
    const decision = classifyInputGst(request(change));
    expect(decision).toMatchObject({
      status: 'NON_RECOVERABLE', recoverableAmount: 0, nonRecoverableAmount: 800,
      recoverableAccount: null, costTreatment: 'CAPITALISE_IN_INVENTORY',
    });
    expect(decision.reason).toContain(reason);
  });

  it('adds non-recoverable GST to an asset or expense according to the purchase', () => {
    expect(classifyInputGst(request({ validTaxInvoice: false, costDestination: 'asset' })).costTreatment)
      .toBe('CAPITALISE_IN_ASSET');
    expect(classifyInputGst(request({ validTaxInvoice: false, costDestination: 'expense' })).costTreatment)
      .toBe('EXPENSE');
  });

  it('allows a claim on the twelve-month deadline and blocks the following day', () => {
    expect(classifyInputGst(request({ purchaseDate: '2025-01-15', claimDate: '2026-01-15' })).status)
      .toBe('RECOVERABLE');
    expect(classifyInputGst(request({ purchaseDate: '2025-01-15', claimDate: '2026-01-16' }))).toMatchObject({
      status: 'NON_RECOVERABLE', costTreatment: 'CAPITALISE_IN_INVENTORY',
    });
  });

  it('permits an evidenced extension to the claim window', () => {
    expect(classifyInputGst(request({
      purchaseDate: '2025-01-15', claimDate: '2026-01-16', claimWindowExtensionApproved: true,
    })).status).toBe('RECOVERABLE');
  });

  it('holds mixed-use tax instead of inventing an apportionment ratio', () => {
    expect(classifyInputGst(request({ purchaseUse: 'mixed' }))).toMatchObject({
      status: 'HOLD', recoverableAmount: 0, nonRecoverableAmount: 0, costTreatment: 'NONE',
    });
  });

  it('enforces hard ineligibility blockers even for mixed-use purchases', () => {
    expect(classifyInputGst(request({ purchaseUse: 'mixed', gstRegistered: false }))).toMatchObject({
      status: 'NON_RECOVERABLE',
      costTreatment: 'CAPITALISE_IN_INVENTORY',
    });
    expect(classifyInputGst(request({ purchaseUse: 'mixed', validTaxInvoice: false }))).toMatchObject({
      status: 'NON_RECOVERABLE',
      costTreatment: 'CAPITALISE_IN_INVENTORY',
    });
  });

  it('rejects malformed dates and claims before purchase', () => {
    expect(() => classifyInputGst(request({ claimDate: '2026-02-30' }))).toThrow(InputGstInvalid);
    expect(() => classifyInputGst(request({ claimDate: '2025-12-31' }))).toThrow(/cannot precede/);
  });
});
