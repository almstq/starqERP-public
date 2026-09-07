import { describe, expect, it } from 'vitest';
import { classifyNonResidentWithholding, NwtRequest, NwtValidationError } from './nwt';

const request = (overrides: Partial<NwtRequest> = {}): NwtRequest => ({
  paymentAmount: 10000,
  incomeType: 'TECHNICAL_SERVICES_FEES',
  paymentDate: '2026-03-15',
  ...overrides,
});

describe('Maldives Non-resident Withholding Tax (NWT)', () => {
  it('applies 10% to a general income-type payment', () => {
    const result = classifyNonResidentWithholding(request());
    expect(result).toMatchObject({
      status: 'WITHHELD',
      ratePercent: 10,
      grossPaymentAmount: 10000,
      withholdingTaxAmount: 1000,
      netPayableToPayee: 9000,
      liabilityAccountCode: '2125',
    });
  });

  it('applies 5% to a contractor payment', () => {
    const result = classifyNonResidentWithholding(request({ incomeType: 'CONTRACTOR_PAYMENT' }));
    expect(result.ratePercent).toBe(5);
    expect(result.withholdingTaxAmount).toBe(500);
  });

  it('classifies by income type at line level, not by supplier', () => {
    const technical = classifyNonResidentWithholding(request({ incomeType: 'TECHNICAL_SERVICES_FEES', paymentAmount: 5000 }));
    const contractor = classifyNonResidentWithholding(request({ incomeType: 'CONTRACTOR_PAYMENT', paymentAmount: 5000 }));
    expect(technical.ratePercent).toBe(10);
    expect(contractor.ratePercent).toBe(5);
  });

  it('records a nil-withholding event for a State-office payer instead of omitting it', () => {
    const result = classifyNonResidentWithholding(request({ payerIsStateOffice: true }));
    expect(result).toMatchObject({
      status: 'NIL_PAYER_EXEMPT',
      ratePercent: 0,
      withholdingTaxAmount: 0,
      netPayableToPayee: 10000,
    });
  });

  it('records a nil-withholding event for section 12 exempt income', () => {
    const result = classifyNonResidentWithholding(request({ exemptUnderIncomeTaxActSection12: true }));
    expect(result.status).toBe('NIL_EXEMPT');
    expect(result.withholdingTaxAmount).toBe(0);
  });

  it('records a nil-withholding event for National Social Health Insurance Act payments', () => {
    const result = classifyNonResidentWithholding(request({ nationalSocialHealthInsurancePayment: true }));
    expect(result.status).toBe('NIL_EXEMPT');
  });

  it('exempts interest received by an approved bank or NBFI, but not other interest', () => {
    const exempt = classifyNonResidentWithholding(
      request({ incomeType: 'INTEREST', interestReceivedByApprovedBankOrNbfi: true }),
    );
    expect(exempt.status).toBe('NIL_EXEMPT');

    const taxable = classifyNonResidentWithholding(request({ incomeType: 'INTEREST' }));
    expect(taxable.status).toBe('WITHHELD');
    expect(taxable.ratePercent).toBe(10);
  });

  it('grosses up a net-of-tax contract so the payee still receives the contracted net amount', () => {
    const result = classifyNonResidentWithholding(
      request({ paymentAmount: 9000, contractIsNetOfTax: true, incomeType: 'TECHNICAL_SERVICES_FEES' }),
    );
    expect(result.netPayableToPayee).toBe(9000);
    expect(result.grossPaymentAmount).toBe(10000); // 9000 / 0.9
    expect(result.withholdingTaxAmount).toBe(1000);
  });

  it('computes the return due date as the 15th of the month following payment', () => {
    const result = classifyNonResidentWithholding(request({ paymentDate: '2026-01-31' }));
    expect(result.returnDueDate).toBe('2026-02-15');
  });

  it('rolls the due date over into the next year for a December payment', () => {
    const result = classifyNonResidentWithholding(request({ paymentDate: '2026-12-05' }));
    expect(result.returnDueDate).toBe('2027-01-15');
  });

  it('rejects a negative payment amount', () => {
    expect(() => classifyNonResidentWithholding(request({ paymentAmount: -1 }))).toThrow(NwtValidationError);
  });

  it('rejects a malformed payment date', () => {
    expect(() => classifyNonResidentWithholding(request({ paymentDate: 'not-a-date' }))).toThrow(NwtValidationError);
  });
});
