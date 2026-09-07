/**
 * Maldives Non-resident Withholding Tax (NWT) — SERP-339 beta finance layer.
 *
 * Statutory reference: MIRA NWT overview (mira.gov.mv/Pages/View/nwtoverview),
 * Validation Study §3.6.
 *
 * The rate depends on the CATEGORY OF INCOME, not the supplier — the same
 * non-resident may receive a 10% technical-services payment and a 5%
 * contractor payment in the same month. Classification is therefore a
 * property of the payment line, never cached on a supplier record.
 *
 * NWT is generally a final tax triggered by PAYMENT, not invoice date. A
 * return must be filed even when the income is exempt — this module always
 * returns a decision (including NIL statuses) so callers record the event
 * rather than silently skip it.
 *
 * Out of scope here (tracked, not silently dropped): withholding-certificate
 * generation and treaty-relief determination — both need document/case data
 * this pure calculator doesn't have.
 */

export type NwtIncomeType =
  | 'RENT_IMMOVABLE_PROPERTY'
  | 'ROYALTIES'
  | 'INTEREST'
  | 'DIVIDENDS'
  | 'TECHNICAL_SERVICES_FEES'
  | 'COMMISSIONS_SERVICES_IN_MALDIVES'
  | 'PUBLIC_ENTERTAINER_PERFORMANCE'
  | 'RESEARCH_AND_DEVELOPMENT'
  | 'INSURANCE_PREMIUMS'
  | 'CONTRACTOR_PAYMENT';

const TEN_PERCENT_INCOME_TYPES: ReadonlySet<NwtIncomeType> = new Set([
  'RENT_IMMOVABLE_PROPERTY',
  'ROYALTIES',
  'INTEREST',
  'DIVIDENDS',
  'TECHNICAL_SERVICES_FEES',
  'COMMISSIONS_SERVICES_IN_MALDIVES',
  'PUBLIC_ENTERTAINER_PERFORMANCE',
  'RESEARCH_AND_DEVELOPMENT',
  'INSURANCE_PREMIUMS',
]);

const FIVE_PERCENT_INCOME_TYPES: ReadonlySet<NwtIncomeType> = new Set(['CONTRACTOR_PAYMENT']);

export type NwtStatus = 'WITHHELD' | 'NIL_EXEMPT' | 'NIL_PAYER_EXEMPT';

export interface NwtRequest {
  /** The contracted amount. Its meaning depends on contractIsNetOfTax. */
  paymentAmount: number;
  incomeType: NwtIncomeType;
  /** ISO date the payment was made — the obligation is payment-triggered, not invoice-dated. */
  paymentDate: string;
  /** State offices are not required to deduct NWT. */
  payerIsStateOffice?: boolean;
  /** Interest received by an approved bank or non-banking financial institution is exempt. */
  interestReceivedByApprovedBankOrNbfi?: boolean;
  /** Payments mandated under the National Social Health Insurance Act are exempt. */
  nationalSocialHealthInsurancePayment?: boolean;
  /** Income exempted under Income Tax Act section 12. */
  exemptUnderIncomeTaxActSection12?: boolean;
  /** Contract is expressed net of tax: paymentAmount is what the payee must receive, so the base is grossed up. */
  contractIsNetOfTax?: boolean;
}

export interface NwtDecision {
  status: NwtStatus;
  ratePercent: 0 | 5 | 10;
  /** The gross payment the tax rate applies to (after gross-up, if any). */
  grossPaymentAmount: number;
  withholdingTaxAmount: number;
  /** What the non-resident payee actually receives. */
  netPayableToPayee: number;
  liabilityAccountCode: '2125';
  /** 15th of the month following paymentDate (MIRA filing deadline). */
  returnDueDate: string;
  reason: string;
}

export class NwtValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NwtValidationError';
  }
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function parseIsoDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new NwtValidationError(`${field} must be an ISO date (YYYY-MM-DD).`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new NwtValidationError(`${field} is not a valid calendar date.`);
  }
  return date;
}

function fifteenthOfFollowingMonth(paymentDate: Date): string {
  const year = paymentDate.getUTCFullYear();
  const month = paymentDate.getUTCMonth(); // 0-indexed; +1 below moves to the following month
  const due = new Date(Date.UTC(year, month + 1, 15));
  return due.toISOString().slice(0, 10);
}

function rateForIncomeType(incomeType: NwtIncomeType): 5 | 10 {
  if (FIVE_PERCENT_INCOME_TYPES.has(incomeType)) return 5;
  if (TEN_PERCENT_INCOME_TYPES.has(incomeType)) return 10;
  throw new NwtValidationError(`Unrecognised incomeType: ${incomeType}`);
}

function nilDecision(
  status: NwtStatus,
  grossPaymentAmount: number,
  returnDueDate: string,
  reason: string,
): NwtDecision {
  return {
    status,
    ratePercent: 0,
    grossPaymentAmount,
    withholdingTaxAmount: 0,
    netPayableToPayee: grossPaymentAmount,
    liabilityAccountCode: '2125',
    returnDueDate,
    reason,
  };
}

export function classifyNonResidentWithholding(request: NwtRequest): NwtDecision {
  if (!Number.isFinite(request.paymentAmount) || request.paymentAmount < 0) {
    throw new NwtValidationError('paymentAmount must be a finite, non-negative amount.');
  }
  const paymentDate = parseIsoDate(request.paymentDate, 'paymentDate');
  const returnDueDate = fifteenthOfFollowingMonth(paymentDate);
  const amount = round2(request.paymentAmount);

  if (request.payerIsStateOffice) {
    return nilDecision('NIL_PAYER_EXEMPT', amount, returnDueDate, 'State offices are not required to deduct NWT.');
  }
  if (request.nationalSocialHealthInsurancePayment) {
    return nilDecision(
      'NIL_EXEMPT',
      amount,
      returnDueDate,
      'Payments mandated under the National Social Health Insurance Act are exempt from NWT.',
    );
  }
  if (request.exemptUnderIncomeTaxActSection12) {
    return nilDecision('NIL_EXEMPT', amount, returnDueDate, 'Income exempted under Income Tax Act section 12.');
  }
  if (request.incomeType === 'INTEREST' && request.interestReceivedByApprovedBankOrNbfi) {
    return nilDecision(
      'NIL_EXEMPT',
      amount,
      returnDueDate,
      'Interest received by an approved bank or non-banking financial institution is exempt.',
    );
  }

  const ratePercent = rateForIncomeType(request.incomeType);
  const rate = ratePercent / 100;

  let grossPaymentAmount: number;
  let withholdingTaxAmount: number;
  let netPayableToPayee: number;

  if (request.contractIsNetOfTax) {
    // amount is the net the payee must receive; gross up so tax comes out of the payer's pocket.
    grossPaymentAmount = round2(amount / (1 - rate));
    withholdingTaxAmount = round2(grossPaymentAmount - amount);
    netPayableToPayee = amount;
  } else {
    grossPaymentAmount = amount;
    withholdingTaxAmount = round2(amount * rate);
    netPayableToPayee = round2(amount - withholdingTaxAmount);
  }

  return {
    status: 'WITHHELD',
    ratePercent,
    grossPaymentAmount,
    withholdingTaxAmount,
    netPayableToPayee,
    liabilityAccountCode: '2125',
    returnDueDate,
    reason: `${ratePercent}% NWT on ${request.incomeType.toLowerCase().replace(/_/g, ' ')}.`,
  };
}
