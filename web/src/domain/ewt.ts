/**
 * STARQ ERP — Maldives Employee Withholding Tax (EWT) Calculation (SERP-339 Beta Finance Layer)
 *
 * Statutory reference:
 * - Maldives Income Tax Act (Law No. 25/2019)
 * - MIRA Employee Withholding Tax regulations
 * - Validation Study §3.5 (Ordered calculation dependency: Remuneration after MRPS contribution)
 *
 * ORDERING DEPENDENCY:
 * EWT base is strictly remuneration AFTER deduction of the employee's MRPS (7%) contribution.
 * Remuneration includes basic salary, fixed allowances, and statutory allowances (e.g. Ramadan).
 * Computing EWT and MRPS in parallel from gross pay overstates EWT and is an accounting violation.
 *
 * THRESHOLDS:
 * - Registration threshold: MVR 30,000 / month (Mandatory registration with MIRA).
 * - Withholding threshold: MVR 60,000 / month (Tax liability commences above MVR 60,000).
 * Remuneration between 30,000 and 60,000 produces registered nil-withholding (registered: true, tax: 0).
 */

export interface EwtBracket {
  floor: number;
  ceiling: number | null;
  rate: number; // Decimal (e.g. 0.055 for 5.5%)
  ratePercentStr: string;
}

export interface EwtCalculationRequest {
  /** Gross remuneration (basic salary + allowances + taxable benefits) in MVR */
  grossRemunerationMvr: number;
  /** Employee portion of MRPS contribution (normally 7% of basic salary) in MVR */
  employeeMrpsDeductionMvr: number;
  /** Date of payroll calculation (ISO YYYY-MM-DD) */
  payDate: string;
  /** Optional override for registration threshold (default MVR 30,000) */
  registrationThresholdMvr?: number;
}

export interface EwtBracketBreakdown {
  bracketIndex: number;
  floor: number;
  ceiling: number | null;
  rate: number;
  taxableInBracket: number;
  taxAmount: number;
}

export interface EwtCalculationResult {
  /** Gross remuneration before pension deduction */
  grossRemunerationMvr: number;
  /** Employee pension deduction applied to arrive at taxable base */
  employeeMrpsDeductionMvr: number;
  /** Remuneration subject to EWT: max(0, gross - mrps) */
  taxableRemunerationBaseMvr: number;
  /** Total progressive withholding tax due */
  ewtAmountMvr: number;
  /** Effective withholding rate as a percentage of gross remuneration */
  effectiveRatePercent: number;
  /** Whether the employee meets or exceeds the MVR 30,000 registration threshold */
  requiresMiraRegistration: boolean;
  /** Detailed progressive calculation per bracket */
  bracketsBreakdown: EwtBracketBreakdown[];
  /** Liability account code in CoA (2124: MIRA EWT Payable) */
  liabilityAccountCode: '2124';
  status: 'COMPUTED' | 'NIL_REGISTERED' | 'NIL_UNREGISTERED';
}

export class EwtValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EwtValidationError';
  }
}

/**
 * Statutory progressive monthly EWT brackets (Income Tax Act 25/2019, Table 3 / §3.5).
 */
export const MALDIVES_EWT_MONTHLY_BRACKETS: readonly EwtBracket[] = [
  { floor: 0, ceiling: 60000, rate: 0.0, ratePercentStr: '0%' },
  { floor: 60000, ceiling: 100000, rate: 0.055, ratePercentStr: '5.5%' },
  { floor: 100000, ceiling: 150000, rate: 0.08, ratePercentStr: '8%' },
  { floor: 150000, ceiling: 200000, rate: 0.12, ratePercentStr: '12%' },
  { floor: 200000, ceiling: null, rate: 0.15, ratePercentStr: '15%' },
] as const;

export const EWT_STATUTORY_REGISTRATION_THRESHOLD_MVR = 30000;
export const EWT_STATUTORY_TAXABLE_THRESHOLD_MVR = 60000;

const round2 = (val: number): number => Math.round((val + Number.EPSILON) * 100) / 100;

function parseIsoDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new EwtValidationError(`${field} must be an ISO date string (YYYY-MM-DD).`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new EwtValidationError(`${field} is not a valid calendar date.`);
  }
  return date;
}

/**
 * Calculates Employee Withholding Tax for an individual employee's monthly pay run.
 */
export function calculateMonthlyEwt(request: EwtCalculationRequest): EwtCalculationResult {
  const {
    grossRemunerationMvr,
    employeeMrpsDeductionMvr,
    payDate,
    registrationThresholdMvr = EWT_STATUTORY_REGISTRATION_THRESHOLD_MVR,
  } = request;

  if (!Number.isFinite(grossRemunerationMvr) || grossRemunerationMvr < 0) {
    throw new EwtValidationError('grossRemunerationMvr must be a finite, non-negative number.');
  }
  if (!Number.isFinite(employeeMrpsDeductionMvr) || employeeMrpsDeductionMvr < 0) {
    throw new EwtValidationError('employeeMrpsDeductionMvr must be a finite, non-negative number.');
  }
  if (employeeMrpsDeductionMvr > grossRemunerationMvr) {
    throw new EwtValidationError('employeeMrpsDeductionMvr cannot exceed grossRemunerationMvr.');
  }
  if (!Number.isFinite(registrationThresholdMvr) || registrationThresholdMvr < 0) {
    throw new EwtValidationError('registrationThresholdMvr must be a finite, non-negative number.');
  }

  // Validate payDate format
  parseIsoDate(payDate, 'payDate');

  const gross = round2(grossRemunerationMvr);
  const mrps = round2(employeeMrpsDeductionMvr);

  // Ordered dependency: Taxable base is remuneration AFTER employee MRPS deduction
  const taxableBase = round2(Math.max(0, gross - mrps));

  // Determine MIRA registration requirement: meets or exceeds MVR 30,000 threshold
  const requiresMiraRegistration = gross >= registrationThresholdMvr;

  const bracketsBreakdown: EwtBracketBreakdown[] = [];
  let totalTax = 0;

  for (let i = 0; i < MALDIVES_EWT_MONTHLY_BRACKETS.length; i++) {
    const bracket = MALDIVES_EWT_MONTHLY_BRACKETS[i];
    if (taxableBase <= bracket.floor) {
      bracketsBreakdown.push({
        bracketIndex: i,
        floor: bracket.floor,
        ceiling: bracket.ceiling,
        rate: bracket.rate,
        taxableInBracket: 0,
        taxAmount: 0,
      });
      continue;
    }

    const upperLimit = bracket.ceiling !== null ? Math.min(taxableBase, bracket.ceiling) : taxableBase;
    const taxableInBracket = round2(upperLimit - bracket.floor);
    const taxInBracket = round2(taxableInBracket * bracket.rate);

    totalTax = round2(totalTax + taxInBracket);
    bracketsBreakdown.push({
      bracketIndex: i,
      floor: bracket.floor,
      ceiling: bracket.ceiling,
      rate: bracket.rate,
      taxableInBracket,
      taxAmount: taxInBracket,
    });
  }

  const effectiveRatePercent = gross > 0 ? round2((totalTax / gross) * 100) : 0;

  let status: 'COMPUTED' | 'NIL_REGISTERED' | 'NIL_UNREGISTERED';
  if (totalTax > 0) {
    status = 'COMPUTED';
  } else if (requiresMiraRegistration) {
    status = 'NIL_REGISTERED';
  } else {
    status = 'NIL_UNREGISTERED';
  }

  return {
    grossRemunerationMvr: gross,
    employeeMrpsDeductionMvr: mrps,
    taxableRemunerationBaseMvr: taxableBase,
    ewtAmountMvr: totalTax,
    effectiveRatePercent,
    requiresMiraRegistration,
    bracketsBreakdown,
    liabilityAccountCode: '2124',
    status,
  };
}
